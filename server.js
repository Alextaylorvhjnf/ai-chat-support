const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { Telegraf } = require('telegraf');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

// Log environment
console.log('='.repeat(60));
console.log('🔍 ENVIRONMENT CHECK');
console.log('='.repeat(60));
console.log('PORT:', PORT);
console.log('GROQ_API_KEY:', GROQ_API_KEY ? `✓ (${GROQ_API_KEY.substring(0, 10)}...)` : '✗ MISSING');
console.log('TELEGRAM_BOT_TOKEN:', TELEGRAM_BOT_TOKEN ? `✓ (${TELEGRAM_BOT_TOKEN.substring(0, 15)}...)` : '✗ MISSING');
console.log('ADMIN_TELEGRAM_ID:', ADMIN_TELEGRAM_ID ? `✓ (${ADMIN_TELEGRAM_ID})` : '✗ MISSING');
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

// Custom headers middleware
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
    message: 'Chatbot API is running',
    timestamp: new Date().toISOString(),
    telegram: global.telegramBotStatus || 'not initialized',
    ai: GROQ_API_KEY ? 'enabled' : 'disabled'
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
    
    this.systemPrompt = `You are a professional Persian AI assistant. Follow these rules:
1. Answer ONLY in Persian (Farsi)
2. Be helpful, accurate, and friendly
3. If you don't know something, say so honestly
4. You specialize in:
   - Product support
   - General questions
   - User guidance
   - Technical assistance

If you cannot answer or need human help, say: "لطفاً به اپراتور انسانی متصل شوید"`;
  }

  async getAIResponse(userMessage) {
    try {
      console.log('🤖 Sending to AI:', userMessage.substring(0, 100));

      const response = await this.axiosInstance.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      if (response.data?.choices?.[0]?.message?.content) {
        const aiMessage = response.data.choices[0].message.content;
        console.log('✅ AI Response received');
        
        // Check if AI suggests human support
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
        message: 'خطا در پردازش درخواست. لطفاً دوباره تلاش کنید.',
        requiresHuman: true
      };
    }
  }

  shouldConnectToHuman(message) {
    const triggers = [
      'نمیتوانم',
      'نمیدانم',
      'اطلاعات کافی',
      'اپراتور انسانی',
      'متخصص انسانی',
      'لطفاً به اپراتور',
      'نیاز به اتصال'
    ];
    
    const lowerMessage = message.toLowerCase();
    return triggers.some(trigger => lowerMessage.includes(trigger.toLowerCase()));
  }
}

// Session Manager
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
  }

  createSession(sessionId) {
    const session = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      connectedToHuman: false,
      operatorId: null,
      userInfo: {}
    };
    this.sessions.set(sessionId, session);
    console.log(`✅ Session created: ${sessionId.substring(0, 8)}...`);
    return session;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  addMessage(sessionId, role, content) {
    const session = this.getSession(sessionId);
    if (session) {
      session.messages.push({ 
        role, 
        content, 
        timestamp: new Date(),
        id: uuidv4()
      });
      if (session.messages.length > 50) {
        session.messages = session.messages.slice(-50);
      }
    }
  }

  updateUserInfo(sessionId, userInfo) {
    const session = this.getSession(sessionId);
    if (session) {
      session.userInfo = { ...session.userInfo, ...userInfo };
    }
    return session;
  }

  connectToHuman(sessionId, operatorId) {
    const session = this.getSession(sessionId);
    if (session) {
      session.connectedToHuman = true;
      session.operatorId = operatorId;
      session.lastActivity = new Date();
      console.log(`👤 Session ${sessionId.substring(0, 8)}... connected to human operator`);
    }
    return session;
  }

  disconnectFromHuman(sessionId) {
    const session = this.getSession(sessionId);
    if (session) {
      session.connectedToHuman = false;
      session.operatorId = null;
      console.log(`👤 Session ${sessionId.substring(0, 8)}... disconnected from human operator`);
    }
    return session;
  }

  cleanupSessions() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveMinutes = (now - session.lastActivity) / (1000 * 60);
      if (inactiveMinutes > 60) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} inactive sessions`);
    }
  }
}

// Telegram Service - SIMPLIFIED AND FIXED
class TelegramService {
  constructor() {
    this.bot = null;
    this.isConnected = false;
    this.adminId = ADMIN_TELEGRAM_ID;
    
    // Initialize immediately
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🤖 Initializing Telegram bot...');
      
      if (!TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN is not set');
        return;
      }
      
      if (!ADMIN_TELEGRAM_ID) {
        console.warn('⚠️ ADMIN_TELEGRAM_ID is not set');
        return;
      }
      
      // Create bot instance
      this.bot = new Telegraf(TELEGRAM_BOT_TOKEN);
      
      // Setup error handler
      this.bot.catch((err, ctx) => {
        console.error('Telegram bot error:', err);
        console.error('Error context:', ctx?.updateType);
      });
      
      // Simple start command
      this.bot.start((ctx) => {
        ctx.reply('👨‍💼 پنل اپراتور پشتیبانی\n\nپیام‌های کاربران اینجا نمایش داده می‌شوند.');
      });
      
      // Handle all messages
      this.bot.on('text', (ctx) => {
        console.log('📨 Received message from:', ctx.from.username || ctx.from.id);
        // For now, just acknowledge receipt
        if (ctx.message.text.startsWith('/')) return;
        ctx.reply('✅ پیام دریافت شد. این پیام از کاربر سایت خواهد بود.');
      });
      
      // Launch bot
      await this.bot.launch();
      this.isConnected = true;
      
      console.log('✅ Telegram bot launched successfully');
      
      // Send startup message
      await this.sendToAdmin('🚀 ربات پشتیبانی راه‌اندازی شد\n\n'
        + 'آماده دریافت پیام‌های کاربران هستم.');
        
    } catch (error) {
      console.error('❌ FAILED to initialize Telegram bot:', error.message);
      console.error('Full error:', error);
      this.isConnected = false;
    }
  }

  async sendToAdmin(message) {
    try {
      if (!this.bot || !this.isConnected) {
        console.warn('⚠️ Telegram bot not connected, cannot send message');
        return false;
      }
      
      await this.bot.telegram.sendMessage(this.adminId, message);
      console.log('✅ Message sent to admin');
      return true;
    } catch (error) {
      console.error('❌ Failed to send message to admin:', error.message);
      return false;
    }
  }

  async sendToOperator(sessionId, message, userInfo = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Telegram bot not connected');
      }
      
      const operatorMessage = `📩 پیام از کاربر:\n\n`
        + `🎫 کد جلسه: ${sessionId.substring(0, 12)}...\n`
        + `👤 نام: ${userInfo.name || 'کاربر سایت'}\n`
        + `💬 پیام:\n"${message}"\n\n`
        + `✏️ برای پاسخ، پیام خود را بنویسید.`;
      
      await this.bot.telegram.sendMessage(this.adminId, operatorMessage);
      return { success: true };
    } catch (error) {
      console.error('❌ Error sending to operator:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Initialize services
const aiService = new AIService();
const sessionManager = new SessionManager();
const telegramService = new TelegramService();

// Make globally accessible
global.aiService = aiService;
global.sessionManager = sessionManager;
global.telegramService = telegramService;
global.telegramBotStatus = telegramService.isConnected ? 'connected' : 'disconnected';

// WebSocket Handling
const activeConnections = new Map();

io.on('connection', (socket) => {
  console.log('🌐 New WebSocket connection:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    activeConnections.set(socket.id, sessionId);
    console.log(`🔗 Client ${socket.id.substring(0, 8)} joined session ${sessionId.substring(0, 8)}...`);
  });

  socket.on('disconnect', () => {
    const sessionId = activeConnections.get(socket.id);
    if (sessionId) {
      socket.leave(sessionId);
      activeConnections.delete(socket.id);
      console.log(`🔌 Client ${socket.id.substring(0, 8)} disconnected`);
    }
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
    
    console.log(`💬 Chat request: ${sessionId.substring(0, 8)}...`);
    
    // Get or create session
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(sessionId);
    }
    
    // Add user message
    sessionManager.addMessage(sessionId, 'user', message);
    
    // Get AI response
    const aiResponse = await aiService.getAIResponse(message);
    
    if (aiResponse.success) {
      sessionManager.addMessage(sessionId, 'assistant', aiResponse.message);
      
      res.json({
        success: true,
        message: aiResponse.message,
        requiresHuman: false,
        sessionId: sessionId
      });
    } else {
      sessionManager.addMessage(sessionId, 'system', 'AI نتوانست پاسخ دهد');
      
      res.json({
        success: false,
        message: aiResponse.message,
        requiresHuman: true,
        sessionId: sessionId
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
    
    console.log(`👤 Human connection requested: ${sessionId.substring(0, 8)}...`);
    console.log('Telegram service status:', telegramService.isConnected);
    
    // Check Telegram connection
    if (!telegramService.isConnected) {
      console.log('⚠️ Telegram bot is not connected');
      
      // Try to reconnect
      try {
        await telegramService.initialize();
      } catch (reconnectError) {
        console.error('Reconnection failed:', reconnectError.message);
      }
      
      if (!telegramService.isConnected) {
        return res.json({
          success: false,
          error: 'سرویس اپراتور در حال حاضر در دسترس نیست',
          details: 'Telegram bot connection failed'
        });
      }
    }
    
    // Get or create session
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(sessionId);
    }
    
    // Update user info
    sessionManager.updateUserInfo(sessionId, userInfo);
    
    // Connect to human
    sessionManager.connectToHuman(sessionId, ADMIN_TELEGRAM_ID);
    
    // Send notification to Telegram
    const telegramResult = await telegramService.sendToOperator(
      sessionId, 
      'درخواست اتصال به اپراتور انسانی',
      userInfo
    );
    
    if (telegramResult.success) {
      // Notify user via WebSocket
      io.to(sessionId).emit('operator-connected', {
        message: '✅ اپراتور انسانی متصل شد. منتظر پاسخ باشید.',
        timestamp: new Date().toISOString()
      });
      
      res.json({
        success: true,
        message: '✅ در حال اتصال به اپراتور انسانی...',
        operatorConnected: true
      });
    } else {
      res.json({
        success: false,
        error: 'خطا در ارسال درخواست به اپراتور',
        details: telegramResult.error
      });
    }
    
  } catch (error) {
    console.error('❌ Connect human error:', error);
    res.json({
      success: false,
      error: 'خطا در اتصال به اپراتور',
      details: error.message
    });
  }
});

app.post('/api/send-to-operator', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'شناسه جلسه و پیام الزامی است' 
      });
    }
    
    console.log(`📨 Sending to operator: ${sessionId.substring(0, 8)}...`);
    
    // Get session
    const session = sessionManager.getSession(sessionId);
    if (!session || !session.connectedToHuman) {
      return res.json({
        success: false,
        error: 'جلسه به اپراتور متصل نیست'
      });
    }
    
    // Send to Telegram
    const telegramResult = await telegramService.sendToOperator(
      sessionId,
      message,
      session.userInfo
    );
    
    if (telegramResult.success) {
      res.json({
        success: true,
        message: 'پیام ارسال شد'
      });
    } else {
      res.json({
        success: false,
        error: 'خطا در ارسال پیام',
        details: telegramResult.error
      });
    }
    
  } catch (error) {
    console.error('❌ Send to operator error:', error);
    res.json({
      success: false,
      error: 'خطا در ارسال پیام'
    });
  }
});

// Debug endpoints
app.get('/api/debug/telegram', (req, res) => {
  res.json({
    status: telegramService.isConnected ? 'connected' : 'disconnected',
    hasToken: !!TELEGRAM_BOT_TOKEN,
    hasAdminId: !!ADMIN_TELEGRAM_ID,
    tokenPreview: TELEGRAM_BOT_TOKEN ? `${TELEGRAM_BOT_TOKEN.substring(0, 15)}...` : null,
    adminId: ADMIN_TELEGRAM_ID,
    botExists: !!telegramService.bot
  });
});

app.get('/api/debug/test-telegram', async (req, res) => {
  try {
    if (!telegramService.isConnected) {
      return res.json({
        success: false,
        message: 'Telegram bot is not connected'
      });
    }
    
    const testMessage = `🧪 تست اتصال\n\n`
      + `⏰ ${new Date().toLocaleString('fa-IR')}\n`
      + `✅ اگر این پیام را می‌بینید، ربات تلگرام کار می‌کند`;
    
    const sent = await telegramService.sendToAdmin(testMessage);
    
    res.json({
      success: sent,
      message: sent ? 'پیام تست ارسال شد' : 'خطا در ارسال پیام'
    });
    
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ============================================
  🚀 AI Chatbot Support System Started
  ============================================
  📍 Port: ${PORT}
  🌐 URL: http://localhost:${PORT}
  🤖 AI: ${GROQ_API_KEY ? '✅ Active' : '❌ Disabled'}
  📱 Telegram: ${telegramService.isConnected ? '✅ Connected' : '❌ Disconnected'}
  ============================================
  `);
  
  // Update global status
  global.telegramBotStatus = telegramService.isConnected ? 'connected' : 'disconnected';
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('🔥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});
