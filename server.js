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
console.log('🚀 AI CHATBOT WITH TELEGRAM SUPPORT - FIXED');
console.log('='.repeat(60));

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8200429613:AAGTgP5hnOiRIxXc3YJmxvTqwEqhQ4crGkk';
const TELEGRAM_BOT_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_BOT_WEBHOOK = process.env.TELEGRAM_BOT_WEBHOOK || 'http://localhost:3001/webhook';
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '6234289265'; // ایدی عددی ادمین

console.log('📌 Port:', PORT);
console.log('🤖 AI:', GROQ_API_KEY ? '✅ ENABLED' : '❌ DISABLED');
console.log('🤖 Telegram Bot:', TELEGRAM_BOT_TOKEN ? '✅ CONFIGURED' : '❌ NOT CONFIGURED');
console.log('🤖 Admin ID:', ADMIN_TELEGRAM_ID);
console.log('='.repeat(60));

// Initialize App
const app = express();
const server = http.createServer(app);

// CORS Configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));

// Custom headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// Cache for sessions
const sessionCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// Mapping between sessionId and Telegram chat_id
const telegramMapping = new Map(); // sessionId -> { chatId, operatorName, status }

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/widget.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

app.get('/widget.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.css'));
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: '🤖 پشتیبان هوشمند با قابلیت تلگرام',
    timestamp: new Date().toISOString(),
    features: {
      ai: !!GROQ_API_KEY,
      telegram: !!TELEGRAM_BOT_TOKEN,
      realtime: true,
      telegramConnected: telegramMapping.size > 0
    }
  });
});

// AI Service
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
    
    this.systemPrompt = `شما "پشتیبان هوشمند" هستید. قوانین:
1. فقط به فارسی پاسخ دهید
2. مفید، دقیق و دوستانه باشید
3. اگر نمی‌دانید، صادقانه بگویید
4. تخصص: پشتیبانی محصول، سوالات عمومی، راهنمایی کاربران

اگر سوال خارج از حوزه شماست، بگویید: "برای پاسخ دقیق‌تر، لطفاً به اپراتور انسانی متصل شوید."`;
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
        const aiMessage = response.data.choices[0].message.content;
        
        if (this.shouldConnectToHuman(aiMessage)) {
          return {
            success: false,
            message: aiMessage,
            requiresHuman: true
          };
        }

        return {
          success: true,
          message: aiMessage,
          requiresHuman: false
        };
      }

      throw new Error('Invalid AI response');
    } catch (error) {
      console.error('❌ AI Error:', error.message);
      return {
        success: false,
        message: '⚠️ خطا در پردازش. لطفاً با اپراتور انسانی صحبت کنید.',
        requiresHuman: true
      };
    }
  }

  shouldConnectToHuman(message) {
    const triggers = [
      'اپراتور انسانی',
      'متخصص انسانی',
      'نمیتوانم پاسخ دهم',
      'اطلاعات کافی',
      'لطفاً با اپراتور'
    ];
    
    return triggers.some(trigger => message.toLowerCase().includes(trigger.toLowerCase()));
  }
}

// Session Manager
class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(sessionId, userInfo = {}) {
    const session = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      connectedToHuman: false,
      operatorId: null,
      operatorChatId: null,
      userInfo: userInfo,
      status: 'active',
      telegramMessageId: null
    };
    
    this.sessions.set(sessionId, session);
    sessionCache.set(sessionId, session);
    console.log(`✅ Session created: ${sessionId.substring(0, 8)}...`);
    return session;
  }

  getSession(sessionId) {
    let session = sessionCache.get(sessionId);
    if (!session) {
      session = this.sessions.get(sessionId);
      if (session) {
        sessionCache.set(sessionId, session);
      }
    }
    
    if (session) {
      session.lastActivity = new Date();
      sessionCache.set(sessionId, session);
    }
    
    return session;
  }

  addMessage(sessionId, role, content) {
    const session = this.getSession(sessionId);
    if (session) {
      session.messages.push({
        id: uuidv4(),
        role,
        content,
        timestamp: new Date()
      });
      
      if (session.messages.length > 100) {
        session.messages = session.messages.slice(-100);
      }
      
      sessionCache.set(sessionId, session);
      return session.messages[session.messages.length - 1];
    }
    return null;
  }

  connectToHuman(sessionId, operatorChatId, operatorName) {
    const session = this.getSession(sessionId);
    if (session) {
      session.connectedToHuman = true;
      session.operatorId = 'telegram_operator';
      session.operatorChatId = operatorChatId;
      session.status = 'connected';
      
      // Store in telegram mapping
      telegramMapping.set(sessionId, {
        chatId: operatorChatId,
        operatorName: operatorName,
        status: 'accepted',
        connectedAt: new Date()
      });
      
      sessionCache.set(sessionId, session);
      console.log(`👤 Session ${sessionId.substring(0, 8)}... connected to operator ${operatorChatId}`);
    }
    return session;
  }

  disconnectFromHuman(sessionId) {
    const session = this.getSession(sessionId);
    if (session) {
      session.connectedToHuman = false;
      session.operatorId = null;
      session.operatorChatId = null;
      session.status = 'active';
      
      telegramMapping.delete(sessionId);
      sessionCache.set(sessionId, session);
    }
    return session;
  }

  getActiveSessions() {
    return Array.from(this.sessions.values())
      .filter(s => (new Date() - s.lastActivity) < 30 * 60 * 1000);
  }

  getStats() {
    const active = this.getActiveSessions();
    return {
      totalSessions: this.sessions.size,
      activeSessions: active.length,
      humanConnected: active.filter(s => s.connectedToHuman).length,
      aiEnabled: !!GROQ_API_KEY,
      telegramMappings: telegramMapping.size
    };
  }
}

// Telegram Service - DIRECT TELEGRAM API
class TelegramService {
  constructor() {
    this.botToken = TELEGRAM_BOT_TOKEN;
    this.adminId = ADMIN_TELEGRAM_ID;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    this.axios = axios.create({
      baseURL: this.apiUrl,
      timeout: 10000
    });
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      const response = await this.axios.post('/sendMessage', {
        chat_id: chatId,
        text: text,
        parse_mode: options.parse_mode || 'HTML',
        reply_markup: options.reply_markup
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Telegram sendMessage error:', error.response?.data || error.message);
      return null;
    }
  }

  async notifyNewSession(sessionId, userInfo, userMessage) {
    try {
      const shortId = sessionId.substring(0, 12);
      const userName = userInfo?.name || 'کاربر سایت';
      const userEmail = userInfo?.email ? `\n📧 ایمیل: ${userInfo.email}` : '';
      
      const message = `🔔 <b>درخواست اتصال جدید</b>

🎫 <b>کد جلسه:</b> <code>${shortId}</code>
👤 <b>کاربر:</b> ${userName}${userEmail}
📝 <b>پیام کاربر:</b>
${userMessage.substring(0, 200)}${userMessage.length > 200 ? '...' : ''}

برای پذیرش گفتگو، روی دکمه زیر کلیک کنید:`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { 
              text: "✅ بله، می‌پذیرم", 
              callback_data: `accept_${sessionId}` 
            },
            { 
              text: "❌ نه، رد کن", 
              callback_data: `reject_${sessionId}` 
            }
          ]
        ]
      };
      
      const result = await this.sendMessage(this.adminId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      
      if (result && result.ok) {
        // Store message ID for later updates
        const session = sessionManager.getSession(sessionId);
        if (session) {
          session.telegramMessageId = result.result.message_id;
          sessionCache.set(sessionId, session);
        }
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ Telegram notification failed:', error.message);
      return false;
    }
  }

  async sendToOperator(sessionId, message, userInfo) {
    try {
      const mapping = telegramMapping.get(sessionId);
      if (!mapping || !mapping.chatId) {
        console.error('❌ No operator assigned for session:', sessionId);
        return { success: false, error: 'اپراتوری برای این جلسه یافت نشد' };
      }
      
      const shortId = sessionId.substring(0, 12);
      const userName = userInfo?.name || 'کاربر سایت';
      
      const formattedMessage = `📨 <b>پیام جدید از کاربر</b>

🎫 <b>کد جلسه:</b> <code>${shortId}</code>
👤 <b>کاربر:</b> ${userName}
💬 <b>پیام:</b>
${message}

✏️ برای پاسخ، پیام خود را مستقیم بنویسید...`;
      
      const result = await this.sendMessage(mapping.chatId, formattedMessage, {
        parse_mode: 'HTML'
      });
      
      return { 
        success: !!result, 
        chatId: mapping.chatId 
      };
      
    } catch (error) {
      console.error('❌ Send to operator failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async updateMessage(chatId, messageId, newText, options = {}) {
    try {
      const response = await this.axios.post('/editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: newText,
        parse_mode: options.parse_mode || 'HTML',
        reply_markup: options.reply_markup
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Telegram updateMessage error:', error.message);
      return null;
    }
  }

  async answerCallbackQuery(callbackQueryId, text, showAlert = false) {
    try {
      const response = await this.axios.post('/answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Telegram answerCallbackQuery error:', error.message);
      return null;
    }
  }

  async checkHealth() {
    try {
      const response = await this.axios.get('/getMe');
      return response.data.ok === true;
    } catch (error) {
      return false;
    }
  }
}

// Initialize services
const aiService = new AIService();
const sessionManager = new SessionManager();
const telegramService = new TelegramService();

// WebSocket
io.on('connection', (socket) => {
  console.log('🌐 WebSocket connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`🔗 Client joined session: ${sessionId.substring(0, 8)}...`);
  });

  socket.on('send-to-operator', async (data) => {
    const { sessionId, message } = data;
    const session = sessionManager.getSession(sessionId);
    
    if (session && session.connectedToHuman) {
      // Add user message to session
      sessionManager.addMessage(sessionId, 'user', message);
      
      // Forward to Telegram operator
      const result = await telegramService.sendToOperator(
        sessionId, 
        message, 
        session.userInfo
      );
      
      if (result.success) {
        socket.emit('message-sent', { success: true });
        socket.emit('operator-typing', { typing: false });
      } else {
        socket.emit('message-sent', { 
          success: false, 
          error: result.error || 'خطا در ارسال پیام به اپراتور' 
        });
      }
    } else {
      socket.emit('message-sent', { 
        success: false, 
        error: 'هنوز به اپراتور متصل نیستید' 
      });
    }
  });

  socket.on('typing', (data) => {
    const { sessionId, isTyping } = data;
    if (sessionId) {
      socket.to(sessionId).emit('operator-typing', { typing: isTyping });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket disconnected:', socket.id);
  });
});

// API Endpoints
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ 
        success: false,
        error: 'پیام و شناسه جلسه الزامی است' 
      });
    }
    
    console.log(`💬 Chat: ${sessionId.substring(0, 8)}...`);
    
    // Get or create session
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(sessionId);
    }
    
    // Add user message
    sessionManager.addMessage(sessionId, 'user', message);
    
    // Check if connected to human
    if (session.connectedToHuman) {
      return res.json({
        success: true,
        message: 'پیام شما برای اپراتور ارسال شد.',
        requiresHuman: false,
        sessionId: sessionId,
        operatorConnected: true
      });
    }
    
    // Get AI response
    const aiResponse = await aiService.getAIResponse(message);
    
    if (aiResponse.success) {
      sessionManager.addMessage(sessionId, 'assistant', aiResponse.message);
      
      res.json({
        success: true,
        message: aiResponse.message,
        requiresHuman: false,
        sessionId: sessionId,
        operatorConnected: false
      });
    } else {
      sessionManager.addMessage(sessionId, 'system', 'AI پیشنهاد اتصال به اپراتور');
      
      res.json({
        success: false,
        message: aiResponse.message,
        requiresHuman: true,
        sessionId: sessionId,
        operatorConnected: false
      });
    }
  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({ 
      success: false,
      error: 'خطا در پردازش درخواست'
    });
  }
});

app.post('/api/connect-human', async (req, res) => {
  try {
    const { sessionId, userInfo } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ 
        success: false,
        error: 'شناسه جلسه الزامی است' 
      });
    }
    
    console.log(`👤 Connect human: ${sessionId.substring(0, 8)}...`);
    
    // Check Telegram bot health
    const telegramHealthy = await telegramService.checkHealth();
    if (!telegramHealthy) {
      console.warn('⚠️ Telegram bot is not responding');
      return res.json({
        success: false,
        error: 'ربات تلگرام در دسترس نیست. لطفاً اطمینان حاصل کنید که توکن معتبر است.',
        operatorConnected: false
      });
    }
    
    // Get or create session
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(sessionId, userInfo);
    } else {
      session.userInfo = { ...session.userInfo, ...userInfo };
    }
    
    // Get last user message
    const lastUserMessage = session.messages
      .filter(m => m.role === 'user')
      .slice(-1)[0]?.content || 'درخواست اتصال به اپراتور';
    
    // Notify Telegram bot
    const notified = await telegramService.notifyNewSession(
      sessionId,
      session.userInfo,
      lastUserMessage
    );
    
    if (notified) {
      // Notify user via WebSocket
      io.to(sessionId).emit('operator-requested', {
        message: '✅ درخواست شما به اپراتور ارسال شد. منتظر پذیرش باشید...',
        timestamp: new Date().toISOString(),
        sessionId: sessionId
      });
      
      res.json({
        success: true,
        message: '✅ درخواست شما به اپراتور ارسال شد. منتظر پذیرش باشید...',
        operatorConnected: false, // Not yet connected
        pending: true
      });
    } else {
      res.json({
        success: false,
        error: 'خطا در ارسال درخواست به اپراتور. لطفاً دوباره تلاش کنید.',
        operatorConnected: false
      });
    }
    
  } catch (error) {
    console.error('❌ Connect human error:', error);
    res.json({
      success: false,
      error: 'خطا در اتصال به اپراتور',
      operatorConnected: false
    });
  }
});

app.post('/api/send-to-user', async (req, res) => {
  try {
    const { sessionId, message, operatorId, operatorName } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'شناسه جلسه و پیام الزامی است' 
      });
    }
    
    console.log(`📤 Send to user: ${sessionId.substring(0, 8)}... from ${operatorName || 'اپراتور'}`);
    
    // Get session
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.json({
        success: false,
        error: 'جلسه پیدا نشد'
      });
    }
    
    // If not already connected, connect now
    if (!session.connectedToHuman && operatorId) {
      sessionManager.connectToHuman(sessionId, operatorId, operatorName);
    }
    
    // Add operator message
    sessionManager.addMessage(sessionId, 'operator', message);
    
    // Send to user via WebSocket
    io.to(sessionId).emit('operator-message', {
      from: 'operator',
      message: message,
      timestamp: new Date().toISOString(),
      operatorName: operatorName || 'اپراتور',
      sessionId: sessionId
    });
    
    // Also emit typing indicator off
    io.to(sessionId).emit('operator-typing', { typing: false });
    
    res.json({
      success: true,
      userName: session.userInfo?.name || 'کاربر سایت',
      sessionId: sessionId
    });
    
  } catch (error) {
    console.error('❌ Send to user error:', error);
    res.json({
      success: false,
      error: 'خطا در ارسال پیام'
    });
  }
});

// Telegram Webhook Endpoint
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;
    console.log('📨 Telegram webhook received:', update.update_id);
    
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const callback = update.callback_query;
      const data = callback.data;
      const chatId = callback.from.id;
      const messageId = callback.message?.message_id;
      
      console.log(`🔄 Callback: ${data} from ${chatId}`);
      
      // Answer callback query immediately
      await telegramService.answerCallbackQuery(callback.id, 'در حال پردازش...');
      
      if (data.startsWith('accept_')) {
        const sessionId = data.replace('accept_', '');
        const session = sessionManager.getSession(sessionId);
        
        if (session) {
          // Connect session to this operator
          sessionManager.connectToHuman(sessionId, chatId, callback.from.first_name || 'اپراتور');
          
          // Update Telegram message
          const updatedText = callback.message.text + '\n\n✅ <b>شما این گفتگو را قبول کردید</b>\n\n💬 اکنون می‌توانید پیام بفرستید.';
          await telegramService.updateMessage(chatId, messageId, updatedText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
          });
          
          // Notify user via WebSocket
          io.to(sessionId).emit('operator-connected', {
            message: '✅ اپراتور درخواست شما را پذیرفت! می‌توانید گفتگو را شروع کنید.',
            timestamp: new Date().toISOString(),
            operatorName: callback.from.first_name || 'اپراتور',
            sessionId: sessionId
          });
          
          console.log(`✅ Session ${sessionId.substring(0, 8)} accepted by ${chatId}`);
        }
        
      } else if (data.startsWith('reject_')) {
        const sessionId = data.replace('reject_', '');
        
        // Update Telegram message
        const updatedText = callback.message.text + '\n\n❌ <b>شما این گفتگو را رد کردید</b>';
        await telegramService.updateMessage(chatId, messageId, updatedText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] }
        });
        
        // Notify user via WebSocket
        io.to(sessionId).emit('operator-rejected', {
          message: '❌ متأسفانه اپراتور در حال حاضر مشغول است. لطفاً بعداً تلاش کنید یا سوال خود را از هوش مصنوعی بپرسید.',
          timestamp: new Date().toISOString(),
          sessionId: sessionId
        });
        
        console.log(`❌ Session ${sessionId.substring(0, 8)} rejected by ${chatId}`);
      }
    }
    
    // Handle text messages from operator
    if (update.message && update.message.text) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text;
      
      // Skip if message is a command
      if (text.startsWith('/')) {
        // Handle commands
        if (text === '/start') {
          await telegramService.sendMessage(chatId, 
            '👨‍💼 <b>پنل اپراتور پشتیبانی</b>\n\n'
            + 'سلام! برای مشاهده جلسات فعال از /sessions استفاده کنید.\n\n'
            + 'پیام‌های کاربران به صورت خودکار برای شما ارسال می‌شوند.\n'
            + 'برای پاسخ، کافیست پیام خود را بنویسید.', 
            { parse_mode: 'HTML' }
          );
        } else if (text === '/sessions') {
          const activeSessions = sessionManager.getActiveSessions()
            .filter(s => !s.connectedToHuman);
          
          if (activeSessions.length === 0) {
            await telegramService.sendMessage(chatId, 
              '📭 <b>هیچ جلسه فعالی در انتظار نیست.</b>\n\n'
              + 'پیام‌های جدید به صورت خودکار برای شما ارسال می‌شوند.',
              { parse_mode: 'HTML' }
            );
          } else {
            let sessionsText = `<b>📊 جلسات فعال (${activeSessions.length}):</b>\n\n`;
            
            activeSessions.forEach((session, index) => {
              const shortId = session.id.substring(0, 12);
              const duration = Math.floor((new Date() - session.createdAt) / (1000 * 60));
              
              sessionsText += `${index + 1}. <b>جلسه:</b> <code>${shortId}</code>\n`;
              sessionsText += `   👤 <b>کاربر:</b> ${session.userInfo?.name || 'ناشناس'}\n`;
              sessionsText += `   ⏱️ <b>مدت:</b> ${duration} دقیقه\n`;
              sessionsText += `   📝 <b>آخرین پیام:</b> ${session.messages.slice(-1)[0]?.content?.substring(0, 50) || 'بدون پیام'}...\n\n`;
            });
            
            await telegramService.sendMessage(chatId, sessionsText, {
              parse_mode: 'HTML'
            });
          }
        }
        return res.json({ ok: true });
      }
      
      // Find which session this operator is handling
      let targetSessionId = null;
      for (const [sessionId, mapping] of telegramMapping.entries()) {
        if (mapping.chatId === chatId) {
          targetSessionId = sessionId;
          break;
        }
      }
      
      if (targetSessionId) {
        // Send message to user
        await axios.post(`${req.protocol}://${req.get('host')}/api/send-to-user`, {
          sessionId: targetSessionId,
          message: text,
          operatorId: chatId,
          operatorName: message.from.first_name || 'اپراتور'
        });
      } else {
        // No active session
        await telegramService.sendMessage(chatId,
          '📭 <b>شما جلسه فعالی ندارید.</b>\n\n'
          + 'منتظر درخواست کاربران باشید یا از /sessions برای مشاهده جلسات فعال استفاده کنید.',
          { parse_mode: 'HTML' }
        );
      }
    }
    
    res.json({ ok: true });
    
  } catch (error) {
    console.error('❌ Telegram webhook error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Additional API endpoints
app.get('/api/sessions', (req, res) => {
  const activeSessions = sessionManager.getActiveSessions();
  
  const sessions = activeSessions.map(session => ({
    id: session.id,
    shortId: session.id.substring(0, 12),
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    connectedToHuman: session.connectedToHuman,
    operatorChatId: session.operatorChatId,
    userInfo: session.userInfo,
    messageCount: session.messages.length,
    duration: Math.floor((new Date() - session.createdAt) / (1000 * 60)),
    status: session.status
  }));
  
  res.json({ 
    sessions,
    total: activeSessions.length,
    connected: activeSessions.filter(s => s.connectedToHuman).length,
    pending: activeSessions.filter(s => !s.connectedToHuman).length
  });
});

app.get('/api/stats', (req, res) => {
  res.json(sessionManager.getStats());
});

// Setup Telegram webhook
async function setupTelegramWebhook() {
  try {
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/telegram-webhook`;
    console.log(`🌐 Setting Telegram webhook to: ${webhookUrl}`);
    
    const response = await axios.post(`${TELEGRAM_BOT_URL}/setWebhook`, {
      url: webhookUrl,
      drop_pending_updates: true
    });
    
    if (response.data.ok) {
      console.log('✅ Telegram webhook set successfully');
    } else {
      console.warn('⚠️ Telegram webhook setup failed:', response.data.description);
    }
  } catch (error) {
    console.error('❌ Telegram webhook setup error:', error.message);
  }
}

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`
  ============================================
  🚀 AI Chatbot Server Started
  ============================================
  📍 Port: ${PORT}
  🌐 URL: http://localhost:${PORT}
  🤖 AI: ${GROQ_API_KEY ? '✅ Active' : '❌ Disabled'}
  📱 Telegram Bot: ${TELEGRAM_BOT_TOKEN ? '✅ Active' : '❌ Disabled'}
  👤 Admin: ${ADMIN_TELEGRAM_ID}
  ============================================
  `);
  
  // Check Telegram bot health
  setTimeout(async () => {
    const healthy = await telegramService.checkHealth();
    console.log(healthy ? '✅ Telegram bot is healthy' : '❌ Telegram bot not responding');
    
    if (healthy) {
      // Get bot info
      try {
        const response = await axios.get(`${TELEGRAM_BOT_URL}/getMe`);
        console.log(`🤖 Bot: @${response.data.result.username}`);
      } catch (error) {
        console.error('❌ Failed to get bot info:', error.message);
      }
    }
  }, 2000);
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('🔥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});
