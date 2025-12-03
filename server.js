const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

console.log('='.repeat(60));
console.log('🚀 CHAT SERVER - SYNCED VERSION');
console.log('='.repeat(60));

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_URL = process.env.TELEGRAM_BOT_URL || 'http://localhost:3001';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('📌 Port:', PORT);
console.log('🤖 AI:', GROQ_API_KEY ? '✅ ENABLED' : '❌ DISABLED');
console.log('🤖 Telegram Bot:', TELEGRAM_BOT_URL);
console.log('🌐 Environment:', NODE_ENV);
console.log('='.repeat(60));

// Initialize App
const app = express();
const server = http.createServer(app);

// Request logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  if (req.method === 'POST' && req.body) {
    console.log('Body:', JSON.stringify(req.body).substring(0, 200));
  }
  next();
});

// CORS Configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Cache
const sessionCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Session Manager - UPDATED
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.shortIdToFullId = new Map(); // نگاشت shortId به fullId
  }

  // ساخت sessionId یکتا و قابل پیش‌بینی
  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `session_${timestamp}_${random}`;
  }

  // ساخت shortId منطبق با تلگرام بات
  generateShortId(sessionId) {
    if (!sessionId) return 'unknown';
    const parts = sessionId.split('_');
    if (parts.length >= 3) {
      return parts[2]; // بخش آخر (random part)
    }
    return sessionId.substring(sessionId.length - 8); // ۸ کاراکتر آخر
  }

  createSession(userInfo = {}) {
    const sessionId = this.generateSessionId();
    const shortId = this.generateShortId(sessionId);
    
    const session = {
      id: sessionId,
      shortId: shortId, // اضافه شده
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      connectedToHuman: false,
      operatorId: null,
      operatorName: null,
      userInfo: userInfo,
      status: 'active',
      socketId: null,
      requestCount: 0
    };
    
    this.sessions.set(sessionId, session);
    this.shortIdToFullId.set(shortId, sessionId); // نگاشت معکوس
    sessionCache.set(sessionId, session);
    
    console.log(`✅ Session created:`, {
      id: sessionId,
      shortId: shortId,
      user: userInfo.name || 'anonymous'
    });
    
    return session;
  }

  getSession(sessionIdentifier) {
    // اگر sessionIdentifier کامل است
    if (sessionIdentifier.startsWith('session_')) {
      let session = sessionCache.get(sessionIdentifier);
      if (!session) {
        session = this.sessions.get(sessionIdentifier);
        if (session) sessionCache.set(sessionIdentifier, session);
      }
      return session;
    }
    
    // اگر shortId است
    const fullId = this.shortIdToFullId.get(sessionIdentifier);
    if (fullId) {
      return this.getSession(fullId);
    }
    
    // اگر پیدا نشد
    console.log(`🔍 Session not found: ${sessionIdentifier}`);
    console.log(`   Available sessions:`, Array.from(this.sessions.keys()));
    return null;
  }

  connectToHuman(sessionIdentifier, operatorId, operatorName) {
    const session = this.getSession(sessionIdentifier);
    if (session) {
      session.connectedToHuman = true;
      session.operatorId = operatorId;
      session.operatorName = operatorName;
      session.status = 'connected';
      sessionCache.set(session.id, session);
      console.log(`👤 Session ${session.shortId} connected to ${operatorName}`);
    }
    return session;
  }

  addMessage(sessionIdentifier, message, role = 'user') {
    const session = this.getSession(sessionIdentifier);
    if (session) {
      session.messages.push({
        role,
        content: message,
        timestamp: new Date()
      });
      session.lastActivity = new Date();
      sessionCache.set(session.id, session);
      console.log(`📝 Message added to ${session.shortId} (${role}): ${message.substring(0, 50)}...`);
    }
  }

  setSocketId(sessionIdentifier, socketId) {
    const session = this.getSession(sessionIdentifier);
    if (session) {
      session.socketId = socketId;
      sessionCache.set(session.id, session);
    }
  }

  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  getSessionByShortId(shortId) {
    const fullId = this.shortIdToFullId.get(shortId);
    if (fullId) {
      return this.sessions.get(fullId);
    }
    return null;
  }
}

// Telegram Service - IMPROVED
class TelegramService {
  constructor() {
    this.botUrl = TELEGRAM_BOT_URL;
    this.axios = axios.create({
      baseURL: this.botUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 5
    });
    
    console.log(`🤖 Telegram service initialized: ${this.botUrl}`);
  }

  async notifyNewSession(sessionId, userInfo, userMessage) {
    try {
      console.log(`📨 [Telegram] Notifying about session: ${sessionId}`);
      
      const payload = {
        event: 'new_session',
        data: {
          sessionId: sessionId,
          userInfo: userInfo || {},
          userMessage: userMessage || 'درخواست اتصال به اپراتور',
          timestamp: new Date().toISOString()
        }
      };
      
      console.log(`   Target: ${this.botUrl}/telegram-webhook`);
      
      const response = await this.axios.post('/telegram-webhook', payload);
      
      console.log(`✅ Telegram notified successfully:`, {
        status: response.status,
        success: response.data?.success
      });
      
      return response.data?.success === true;
      
    } catch (error) {
      console.error(`❌ Telegram notification failed:`, {
        url: `${this.botUrl}/telegram-webhook`,
        error: error.message,
        code: error.code,
        response: error.response?.data
      });
      
      // تلاش با آدرس IP
      if (this.botUrl.includes('localhost')) {
        console.log(`🔄 Trying with 127.0.0.1 instead...`);
        try {
          const altUrl = this.botUrl.replace('localhost', '127.0.0.1');
          const altAxios = axios.create({
            baseURL: altUrl,
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
          });
          
          const altResponse = await altAxios.post('/telegram-webhook', {
            event: 'new_session',
            data: {
              sessionId: sessionId,
              userInfo: userInfo || {},
              userMessage: userMessage,
              timestamp: new Date().toISOString()
            }
          });
          
          console.log(`✅ Notification successful via 127.0.0.1`);
          return altResponse.data?.success === true;
        } catch (altError) {
          console.error(`❌ Alternative attempt also failed: ${altError.message}`);
        }
      }
      
      return false;
    }
  }

  async testConnection() {
    try {
      console.log(`🔗 Testing Telegram bot connection: ${this.botUrl}`);
      const response = await this.axios.get('/health', { timeout: 5000 });
      console.log(`✅ Telegram bot is alive:`, response.data);
      return true;
    } catch (error) {
      console.error(`❌ Telegram bot connection failed:`, error.message);
      return false;
    }
  }
}

// AI Service (بدون تغییر)
class AIService {
  constructor() {
    this.apiKey = GROQ_API_KEY;
    this.model = 'llama-3.3-70b-versatile';
    this.baseURL = 'https://api.groq.com/openai/v1';
    
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    this.systemPrompt = `You are a helpful assistant. Respond in Persian.`;
  }

  async getAIResponse(userMessage) {
    try {
      const response = await this.axiosInstance.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 800
      });

      if (response.data?.choices?.[0]?.message?.content) {
        return {
          success: true,
          message: response.data.choices[0].message.content,
          requiresHuman: false
        };
      }
      throw new Error('Invalid AI response');
    } catch (error) {
      console.error('AI Error:', error.message);
      return {
        success: false,
        message: 'خطا در پردازش',
        requiresHuman: true
      };
    }
  }
}

// Initialize
const aiService = GROQ_API_KEY ? new AIService() : null;
const sessionManager = new SessionManager();
const telegramService = new TelegramService();

// WebSocket (بدون تغییر)
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

io.on('connection', (socket) => {
  console.log('🌐 WebSocket connected:', socket.id);

  socket.on('join-session', (data) => {
    const { sessionId } = data;
    if (sessionId) {
      socket.join(sessionId);
      sessionManager.setSocketId(sessionId, socket.id);
      console.log(`🔗 Socket ${socket.id.substring(0, 8)} joined session: ${sessionId.substring(0, 8)}`);
      
      socket.emit('session-joined', {
        sessionId,
        connected: true,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket disconnected:', socket.id);
  });
});

// API Endpoints - SYNCED

// 1. شروع سشن جدید
app.post('/api/start-session', (req, res) => {
  try {
    const { userInfo } = req.body;
    const session = sessionManager.createSession(userInfo || {});
    
    console.log(`🎯 Session started: ${session.shortId} (${session.id.substring(0, 12)}...)`);
    
    res.json({
      success: true,
      sessionId: session.id,
      shortId: session.shortId, // اضافه شده
      message: 'سشن جدید ایجاد شد',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error'
    });
  }
});

// 2. چت
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    console.log(`💬 Chat request:`, {
      sessionId: sessionId?.substring(0, 12) || 'NEW',
      message: message?.substring(0, 50)
    });
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'پیام ضروری است' 
      });
    }

    let currentSessionId = sessionId;
    let session;
    
    if (!currentSessionId) {
      // ایجاد سشن جدید
      session = sessionManager.createSession({});
      currentSessionId = session.id;
      console.log(`   New session created: ${session.shortId}`);
    } else {
      // جستجوی سشن موجود
      session = sessionManager.getSession(currentSessionId);
      if (!session) {
        // اگر سشن پیدا نشد، یک سشن جدید ایجاد کن
        session = sessionManager.createSession({});
        currentSessionId = session.id;
        console.log(`   Session not found, created new: ${session.shortId}`);
      }
    }

    sessionManager.addMessage(currentSessionId, message, 'user');

    if (session.connectedToHuman) {
      console.log(`   Session ${session.shortId} is connected to human operator: ${session.operatorName}`);
      
      return res.json({
        success: true,
        message: 'پیام شما برای اپراتور ارسال شد.',
        sessionId: currentSessionId,
        shortId: session.shortId,
        operatorConnected: true,
        operatorName: session.operatorName
      });
    }

    if (aiService) {
      console.log(`   Getting AI response for session ${session.shortId}`);
      const aiResponse = await aiService.getAIResponse(message);
      
      if (aiResponse.success) {
        sessionManager.addMessage(currentSessionId, aiResponse.message, 'assistant');
      }
      
      return res.json({
        success: aiResponse.success,
        message: aiResponse.message,
        sessionId: currentSessionId,
        shortId: session.shortId,
        requiresHuman: aiResponse.requiresHuman
      });
    }

    return res.json({
      success: false,
      message: 'سیستم هوش مصنوعی فعال نیست. لطفاً به اپراتور انسانی متصل شوید.',
      sessionId: currentSessionId,
      shortId: session.shortId,
      requiresHuman: true
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطای سرور'
    });
  }
});

// 3. اتصال به اپراتور - SYNCED VERSION
app.post('/api/connect-human', async (req, res) => {
  console.log('='.repeat(50));
  console.log('👥 CONNECT-HUMAN REQUEST');
  console.log('='.repeat(50));
  
  try {
    const { sessionId, userInfo } = req.body;
    
    console.log('Request details:', {
      sessionId: sessionId?.substring(0, 12) || 'NOT_PROVIDED',
      userInfo: userInfo?.name || 'anonymous'
    });
    
    if (!sessionId) {
      console.error('❌ No sessionId provided');
      return res.status(400).json({ 
        success: false, 
        error: 'شناسه سشن ضروری است'
      });
    }

    // دریافت یا ایجاد سشن
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      console.log(`   Creating new session for: ${sessionId.substring(0, 12)}...`);
      session = sessionManager.createSession(userInfo || {});
    }
    
    console.log(`   Session found: ${session.shortId}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   User: ${session.userInfo?.name || 'unknown'}`);

    // به‌روزرسانی اطلاعات کاربر
    if (userInfo && Object.keys(userInfo).length > 0) {
      session.userInfo = { ...session.userInfo, ...userInfo };
      console.log(`   User info updated:`, session.userInfo);
    }

    // گرفتن آخرین پیام کاربر
    const userMessages = session.messages.filter(m => m.role === 'user');
    const lastMessage = userMessages.length > 0 
      ? userMessages[userMessages.length - 1].content 
      : 'درخواست اتصال به اپراتور';
    
    console.log(`   Last user message: ${lastMessage.substring(0, 100)}...`);

    // ارسال به تلگرام
    console.log(`   Notifying Telegram bot...`);
    const notified = await telegramService.notifyNewSession(
      session.id,
      session.userInfo,
      lastMessage
    );

    if (notified) {
      console.log(`✅ Telegram notification successful for session ${session.shortId}`);
      
      res.json({
        success: true,
        message: '✅ درخواست شما با موفقیت به اپراتور ارسال شد. لطفاً منتظر پاسخ اپراتور باشید...',
        sessionId: session.id,
        shortId: session.shortId,
        pending: true,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`⚠️ Telegram notification failed for session ${session.shortId}`);
      
      // حتی اگر تلگرام خطا داد، به کاربر پیام موفقیت بده
      res.json({
        success: true,
        message: 'درخواست شما ثبت شد. اپراتور به زودی با شما تماس خواهد گرفت.',
        sessionId: session.id,
        shortId: session.shortId,
        pending: true,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📤 Response sent for session ${session.shortId}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Connect human error:', error.message);
    console.error('Stack:', error.stack);
    
    // در هر حال به کاربر پاسخ موفقیت‌آمیز بده
    res.json({
      success: true,
      message: 'درخواست شما دریافت شد. سیستم در حال پردازش است...',
      sessionId: req.body.sessionId || 'unknown',
      pending: true,
      timestamp: new Date().toISOString()
    });
  }
});

// 4. Webhook تلگرام - SYNCED
app.post('/telegram-webhook', async (req, res) => {
  try {
    console.log('📨 Telegram webhook received');
    
    const { event, data } = req.body;
    
    console.log(`Event: ${event}`, {
      sessionId: data?.sessionId?.substring(0, 12) || 'N/A',
      operator: data?.operatorName || 'N/A'
    });
    
    if (!event) {
      return res.json({ success: false, error: 'Event is required' });
    }

    let session;
    
    switch (event) {
      case 'operator_accepted':
        console.log(`   Operator ${data.operatorName} accepted session`);
        
        session = sessionManager.connectToHuman(
          data.sessionId,
          data.operatorId,
          data.operatorName
        );

        if (session) {
          console.log(`   Session ${session.shortId} connected to operator`);
          
          // ارسال پیام به کاربر
          io.to(session.id).emit('operator-accepted', {
            message: `✅ اپراتور ${data.operatorName} درخواست شما را پذیرفت!`,
            operatorName: data.operatorName,
            operatorId: data.operatorId,
            sessionId: session.id,
            timestamp: new Date().toISOString()
          });
          
          console.log(`   Notification sent to user`);
        } else {
          console.error(`   Session not found: ${data.sessionId}`);
        }
        break;

      case 'operator_message':
        console.log(`   Operator message from ${data.operatorName}`);
        
        session = sessionManager.getSession(data.sessionId);
        if (session) {
          console.log(`   Sending to session ${session.shortId}`);
          
          io.to(session.id).emit('operator-message', {
            from: 'operator',
            message: data.message,
            operatorName: data.operatorName || 'اپراتور',
            operatorId: data.operatorId,
            sessionId: session.id,
            timestamp: new Date().toISOString()
          });
          
          sessionManager.addMessage(session.id, data.message, 'assistant');
          console.log(`   Message delivered`);
        } else {
          console.error(`   Session not found: ${data.sessionId}`);
        }
        break;
        
      case 'test':
        console.log('Test event received');
        break;
        
      default:
        console.log(`⚠️ Unknown event: ${event}`);
    }

    res.json({ 
      success: true,
      received: true,
      event: event,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
});

// 5. ارسال پیام از اپراتور به کاربر
app.post('/api/send-to-operator', async (req, res) => {
  try {
    console.log('📤 Send-to-operator request');
    
    const { sessionId, message, operatorId, operatorName } = req.body;
    
    console.log('Request:', {
      sessionId: sessionId?.substring(0, 12),
      operator: operatorName,
      messageLength: message?.length
    });
    
    if (!sessionId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'شناسه سشن و پیام ضروری هستند' 
      });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      console.error(`   Session not found: ${sessionId.substring(0, 12)}`);
      return res.json({ 
        success: false, 
        error: 'سشن پیدا نشد' 
      });
    }

    console.log(`   Sending to session ${session.shortId}`);
    
    io.to(sessionId).emit('operator-message', {
      from: 'operator',
      message: message,
      operatorId: operatorId,
      operatorName: operatorName || 'اپراتور',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

    sessionManager.addMessage(sessionId, message, 'assistant');

    console.log(`   ✅ Message sent successfully`);
    
    res.json({
      success: true,
      message: 'پیام با موفقیت ارسال شد',
      sessionId: session.id,
      shortId: session.shortId
    });

  } catch (error) {
    console.error('Send to operator error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطای سرور' 
    });
  }
});

// 6. وضعیت سشن
app.get('/api/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`📊 Session status request: ${sessionId.substring(0, 12)}`);
    
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'سشن پیدا نشد' 
      });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        shortId: session.shortId,
        status: session.status,
        connectedToHuman: session.connectedToHuman,
        operatorName: session.operatorName,
        operatorId: session.operatorId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        messageCount: session.messages.length,
        userInfo: session.userInfo,
        requestCount: session.requestCount
      }
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ success: false, error: 'خطای سرور' });
  }
});

// 7. لیست سشن‌های فعال
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = sessionManager.getActiveSessions();
    
    console.log(`📋 Active sessions: ${sessions.length}`);
    
    res.json({
      success: true,
      count: sessions.length,
      sessions: sessions.map(session => ({
        id: session.id,
        shortId: session.shortId,
        userInfo: session.userInfo,
        status: session.status,
        connectedToHuman: session.connectedToHuman,
        operatorName: session.operatorName,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        messageCount: session.messages.length,
        requestCount: session.requestCount
      }))
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, error: 'خطای سرور' });
  }
});

// 8. تست ارتباط با تلگرام
app.get('/api/test-telegram', async (req, res) => {
  try {
    console.log('🔗 Testing Telegram connection...');
    
    const isConnected = await telegramService.testConnection();
    
    if (isConnected) {
      res.json({
        success: true,
        message: '✅ ارتباط با تلگرام بات برقرار است',
        botUrl: TELEGRAM_BOT_URL,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: false,
        message: '❌ ارتباط با تلگرام بات برقرار نیست',
        botUrl: TELEGRAM_BOT_URL,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Test telegram error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. تست کامل
app.get('/api/test-full', async (req, res) => {
  try {
    console.log('🧪 Running full system test...');
    
    // 1. ایجاد سشن تست
    const testSession = sessionManager.createSession({
      name: 'Test User',
      email: 'test@example.com'
    });
    
    console.log(`   Test session created: ${testSession.shortId}`);
    
    // 2. تست چت
    let chatResult = { success: false };
    if (aiService) {
      chatResult = await aiService.getAIResponse('سلام تست');
      sessionManager.addMessage(testSession.id, 'سلام تست', 'user');
      sessionManager.addMessage(testSession.id, chatResult.message, 'assistant');
    }
    
    // 3. تست تلگرام
    const telegramResult = await telegramService.testConnection();
    
    // 4. تست WebSocket
    const wsTest = {
      connectedClients: io.engine.clientsCount,
      sockets: Array.from(io.sockets.sockets.keys()).length
    };
    
    res.json({
      success: true,
      message: 'تست کامل سیستم',
      timestamp: new Date().toISOString(),
      results: {
        session: {
          id: testSession.id,
          shortId: testSession.shortId,
          created: true
        },
        ai: {
          enabled: !!aiService,
          working: aiService ? chatResult.success : false
        },
        telegram: {
          connected: telegramResult,
          url: TELEGRAM_BOT_URL
        },
        websocket: wsTest,
        cache: {
          sessions: sessionManager.sessions.size,
          cached: sessionCache.keys().length
        }
      }
    });
    
  } catch (error) {
    console.error('Full test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// سایر endpointها (بدون تغییر)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'chat-server',
    version: 'synced-1.0',
    timestamp: new Date().toISOString(),
    sessions: sessionManager.sessions.size
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'سرویس فعال است',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/start-session',
      'POST /api/chat',
      'POST /api/connect-human',
      'POST /telegram-webhook',
      'POST /api/send-to-operator',
      'GET  /api/session/:id',
      'GET  /api/sessions',
      'GET  /api/test-telegram',
      'GET  /api/test-full',
      'GET  /api/health'
    ]
  });
});

app.get('/widget.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

app.get('/widget.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.css'));
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Global error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`
  ============================================
  🚀 CHAT SERVER STARTED (SYNCED VERSION)
  ============================================
  📍 Port: ${PORT}
  🌐 Local URL: http://localhost:${PORT}
  🔧 Debug Panel: http://localhost:${PORT}/debug
  📊 Health Check: http://localhost:${PORT}/api/health
  
  🤖 AI: ${GROQ_API_KEY ? '✅ Active' : '❌ Disabled'}
  📱 Telegram Bot: ${TELEGRAM_BOT_URL}
  
  ✅ API Endpoints:
  - POST /api/start-session
  - POST /api/chat
  - POST /api/connect-human     <-- FIXED & SYNCED
  - POST /telegram-webhook      <-- FIXED & SYNCED
  - GET  /api/test-telegram     <-- NEW
  - GET  /api/test-full         <-- NEW
  
  🐛 Session Management:
  - ShortId system implemented
  - Bi-directional mapping
  - Telegram bot synced
  
  ============================================
  `);
  
  // تست اولیه ارتباط با تلگرام
  setTimeout(async () => {
    console.log('🔗 Testing Telegram connection on startup...');
    try {
      const connected = await telegramService.testConnection();
      if (connected) {
        console.log('✅ Telegram bot is connected and ready');
      } else {
        console.log('⚠️ Telegram bot connection failed. Check if it\'s running on port 3001');
      }
    } catch (error) {
      console.log('⚠️ Could not test Telegram connection:', error.message);
    }
  }, 2000);
});
