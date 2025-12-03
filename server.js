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

// Initialize App
const app = express();
const server = http.createServer(app);

// CORS Configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Headers - Fixed for Cross-Origin
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    timestamp: new Date().toISOString()
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
      console.error('AI Error:', error.message);
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
      'متخصص انسانی'
    ];
    
    return triggers.some(trigger => message.includes(trigger));
  }
}

// Session Manager
class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(sessionId) {
    const session = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      connectedToHuman: false,
      operatorId: null
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  addMessage(sessionId, role, content) {
    const session = this.getSession(sessionId);
    if (session) {
      session.messages.push({ role, content, timestamp: new Date() });
    }
  }
}

// Telegram Bot
class TelegramBot {
  constructor(sessionManager, io) {
    this.sessionManager = sessionManager;
    this.io = io;
    this.bot = null;
    
    if (TELEGRAM_BOT_TOKEN && ADMIN_TELEGRAM_ID) {
      this.initializeBot();
    }
  }

  initializeBot() {
    try {
      this.bot = new Telegraf(TELEGRAM_BOT_TOKEN);
      
      this.bot.start((ctx) => {
        ctx.reply('👨‍💼 پنل اپراتور پشتیبانی\n\nپیام‌های کاربران اینجا نمایش داده می‌شوند.');
      });
      
      this.bot.on('text', (ctx) => {
        // Handle operator messages
        const message = ctx.message.text;
        // We'll handle this via WebSocket
      });
      
      this.bot.launch();
      console.log('✅ Telegram bot started');
    } catch (error) {
      console.error('❌ Telegram bot error:', error.message);
    }
  }

  async sendToOperator(sessionId, userMessage, userInfo) {
    try {
      const message = `📩 پیام جدید از کاربر:\n\n`
        + `شناسه: ${sessionId}\n`
        + `پیام: ${userMessage}\n`
        + `نام: ${userInfo?.name || 'ناشناس'}\n`
        + `صفحه: ${userInfo?.page || 'نامشخص'}`;
      
      await this.bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, message);
      return true;
    } catch (error) {
      console.error('Error sending to operator:', error);
      return false;
    }
  }
}

// Initialize services
const aiService = new AIService();
const sessionManager = new SessionManager();
const telegramBot = new TelegramBot(sessionManager, io);

// WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join', (sessionId) => {
    socket.join(sessionId);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// API Endpoints
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
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
        requiresHuman: false
      });
    } else {
      res.json({
        success: false,
        message: aiResponse.message,
        requiresHuman: true
      });
    }
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/connect-human', async (req, res) => {
  try {
    const { sessionId, message, userInfo } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    // Get session
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Connect to human
    session.connectedToHuman = true;
    
    // Send to Telegram operator
    if (telegramBot.bot) {
      await telegramBot.sendToOperator(sessionId, message, userInfo);
    }
    
    // Notify via WebSocket
    io.to(sessionId).emit('operator-connected', {
      message: 'اپراتور انسانی به زودی پاسخ خواهد داد.'
    });
    
    res.json({
      success: true,
      message: 'در حال اتصال به اپراتور...'
    });
  } catch (error) {
    console.error('Connect human error:', error);
    res.status(500).json({ error: 'Connection failed' });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
  ====================================
  🚀 AI Chatbot Server Started
  ====================================
  📍 Port: ${PORT}
  🌐 URL: http://localhost:${PORT}
  🤖 AI: ${GROQ_API_KEY ? '✅ Active' : '❌ Inactive'}
  📱 Telegram: ${TELEGRAM_BOT_TOKEN ? '✅ Active' : '❌ Inactive'}
  ====================================
  `);
});
