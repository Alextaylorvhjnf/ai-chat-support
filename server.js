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
console.log('🚀 CHAT SERVER - CLEAN VERSION');
console.log('='.repeat(60));

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_URL = process.env.TELEGRAM_BOT_URL || 'http://localhost:3001';

console.log('📌 Port:', PORT);
console.log('🤖 AI:', GROQ_API_KEY ? '✅ ENABLED' : '❌ DISABLED');
console.log('🤖 Telegram Bot:', TELEGRAM_BOT_URL);
console.log('='.repeat(60));

// Initialize App
const app = express();
const server = http.createServer(app);

// CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({
  contentSecurityPolicy: false
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Cache
const sessionCache = new NodeCache({ stdTTL: 3600 });

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'chat-server' });
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
      operatorName: null,
      userInfo: userInfo,
      status: 'active'
    };
    
    this.sessions.set(sessionId, session);
    sessionCache.set(sessionId, session);
    console.log(`✅ Session created: ${sessionId.substring(0, 8)}`);
    return session;
  }

  getSession(sessionId) {
    let session = sessionCache.get(sessionId);
    if (!session) {
      session = this.sessions.get(sessionId);
      if (session) sessionCache.set(sessionId, session);
    }
    if (session) {
      session.lastActivity = new Date();
      sessionCache.set(sessionId, session);
    }
    return session;
  }

  connectToHuman(sessionId, operatorId, operatorName) {
    const session = this.getSession(sessionId);
    if (session) {
      session.connectedToHuman = true;
      session.operatorId = operatorId;
      session.operatorName = operatorName;
      session.status = 'connected';
      sessionCache.set(sessionId, session);
      console.log(`👤 Session ${sessionId.substring(0, 8)} connected to ${operatorName}`);
    }
    return session;
  }

  addMessage(sessionId, message, role = 'user') {
    const session = this.getSession(sessionId);
    if (session) {
      session.messages.push({
        role,
        content: message,
        timestamp: new Date()
      });
      session.lastActivity = new Date();
      sessionCache.set(sessionId, session);
    }
  }
}

// Telegram Service
class TelegramService {
  constructor() {
    this.botUrl = TELEGRAM_BOT_URL;
    this.axios = axios.create({
      baseURL: this.botUrl,
      timeout: 5000
    });
  }

  async notifyNewSession(sessionId, userInfo, userMessage) {
    try {
      console.log(`📨 Notifying Telegram about session: ${sessionId.substring(0, 8)}`);
      
      const response = await this.axios.post('/telegram-webhook', {
        event: 'new_session',
        data: {
          sessionId,
          userInfo,
          userMessage: userMessage.substring(0, 200)
        }
      });
      
      return response.data.success === true;
    } catch (error) {
      console.error('Telegram notification error:', error.message);
      return false;
    }
  }

  async sendMessageToTelegram(chatId, message) {
    try {
      const response = await this.axios.post('/telegram-webhook', {
        event: 'send_message',
        data: {
          chatId,
          message
        }
      });
      return response.data.success === true;
    } catch (error) {
      console.error('Telegram send message error:', error.message);
      return false;
    }
  }
}

// Initialize
const aiService = GROQ_API_KEY ? new AIService() : null;
const sessionManager = new SessionManager();
const telegramService = new TelegramService();

// WebSocket
io.on('connection', (socket) => {
  console.log('🌐 WebSocket connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`🔗 Joined session: ${sessionId.substring(0, 8)}`);
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
      return res.status(400).json({ success: false, error: 'Missing data' });
    }

    console.log(`💬 Chat: ${sessionId.substring(0, 8)}`);

    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(sessionId);
    }

    // ذخیره پیام کاربر
    sessionManager.addMessage(sessionId, message, 'user');

    if (session.connectedToHuman) {
      // اگر به اپراتور متصل است، پیام را به تلگرام ارسال کن
      if (session.operatorId) {
        await telegramService.sendMessageToTelegram(
          session.operatorId,
          `👤 کاربر: ${message}`
        );
      }
      
      return res.json({
        success: true,
        message: 'پیام شما برای اپراتور ارسال شد.',
        requiresHuman: false,
        operatorConnected: true
      });
    }

    if (aiService) {
      const aiResponse = await aiService.getAIResponse(message);
      
      // ذخیره پاسخ AI
      if (aiResponse.success) {
        sessionManager.addMessage(sessionId, aiResponse.message, 'assistant');
      }
      
      return res.json({
        success: aiResponse.success,
        message: aiResponse.message,
        requiresHuman: aiResponse.requiresHuman,
        operatorConnected: false
      });
    }

    return res.json({
      success: false,
      message: 'سیستم هوش مصنوعی فعال نیست. لطفاً به اپراتور انسانی متصل شوید.',
      requiresHuman: true,
      operatorConnected: false
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/connect-human', async (req, res) => {
  try {
    const { sessionId, userInfo } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID required' });
    }

    console.log(`👤 Connect human: ${sessionId.substring(0, 8)}`);

    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(sessionId, userInfo);
    }

    const lastMessage = session.messages
      .filter(m => m.role === 'user')
      .slice(-1)[0]?.content || 'درخواست اتصال';

    const notified = await telegramService.notifyNewSession(
      sessionId,
      session.userInfo,
      lastMessage
    );

    if (notified) {
      res.json({
        success: true,
        message: '✅ درخواست شما به اپراتور ارسال شد.',
        pending: true
      });
    } else {
      res.json({
        success: false,
        error: 'خطا در ارسال درخواست'
      });
    }

  } catch (error) {
    console.error('Connect human error:', error);
    res.json({ success: false, error: 'Connection error' });
  }
});

// ENDPOINT اصلاح شده: از /webhook به /telegram-webhook
app.post('/telegram-webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log(`📨 Telegram Webhook: ${event}`, data);

    switch (event) {
      case 'operator_accepted':
        const session = sessionManager.connectToHuman(
          data.sessionId,
          data.operatorId,
          data.operatorName
        );

        if (session) {
          io.to(data.sessionId).emit('operator-accepted', {
            message: '✅ اپراتور درخواست شما را پذیرفت!',
            operatorName: data.operatorName,
            timestamp: new Date().toISOString()
          });
        }
        break;

      case 'user_message':
        const targetSession = sessionManager.getSession(data.sessionId);
        if (targetSession) {
          io.to(data.sessionId).emit('operator-message', {
            from: 'operator',
            message: data.message,
            operatorName: data.operatorName || 'اپراتور',
            timestamp: new Date().toISOString()
          });
          
          // ذخیره پیام اپراتور
          sessionManager.addMessage(data.sessionId, data.message, 'assistant');
        }
        break;
        
      case 'operator_typing':
        if (data.sessionId) {
          io.to(data.sessionId).emit('operator-typing', {
            typing: data.typing || true,
            operatorName: data.operatorName
          });
        }
        break;
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ENDPOINT جدید: ارسال پیام از اپراتور به کاربر
app.post('/api/send-to-operator', async (req, res) => {
  try {
    const { sessionId, message, operatorId, operatorName } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ success: false, error: 'Missing data' });
    }

    console.log(`📤 Send to operator: ${sessionId.substring(0, 8)}`);

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.json({ success: false, error: 'Session not found' });
    }

    // ارسال پیام به کاربر از طریق WebSocket
    io.to(sessionId).emit('operator-message', {
      from: 'operator',
      message: message,
      operatorId: operatorId,
      operatorName: operatorName || 'اپراتور',
      timestamp: new Date().toISOString()
    });

    // ذخیره پیام اپراتور
    sessionManager.addMessage(sessionId, message, 'assistant');

    res.json({
      success: true,
      message: 'پیام با موفقیت ارسال شد'
    });

  } catch (error) {
    console.error('Send to operator error:', error);
    res.json({ success: false, error: 'Server error' });
  }
});

// ENDPOINT جدید: دریافت اطلاعات سشن
app.get('/api/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        connectedToHuman: session.connectedToHuman,
        operatorName: session.operatorName,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        messageCount: session.messages.length
      }
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ENDPOINT جدید: لیست سشن‌های فعال
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = Array.from(sessionManager.sessions.values())
      .filter(session => session.status === 'active')
      .map(session => ({
        id: session.id,
        userInfo: session.userInfo,
        status: session.status,
        connectedToHuman: session.connectedToHuman,
        operatorName: session.operatorName,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        messageCount: session.messages.length
      }));

    res.json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ENDPOINT جدید: تست WebSocket
app.get('/api/test-ws/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    io.to(sessionId).emit('test', {
      message: 'WebSocket connection is working!',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Test message sent via WebSocket'
    });
  } catch (error) {
    console.error('Test WS error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ENDPOINT جدید: Cleanup old sessions
app.post('/api/cleanup', (req, res) => {
  try {
    const now = new Date();
    let cleaned = 0;
    
    for (const [sessionId, session] of sessionManager.sessions.entries()) {
      const hoursSinceLastActivity = (now - session.lastActivity) / (1000 * 60 * 60);
      
      if (hoursSinceLastActivity > 24) { // سشن‌های قدیمی‌تر از 24 ساعت
        sessionManager.sessions.delete(sessionId);
        sessionCache.del(sessionId);
        cleaned++;
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned ${cleaned} old sessions`
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.json({ success: false, error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ============================================
  🚀 Chat Server Started (Fixed Endpoints)
  ============================================
  📍 Port: ${PORT}
  🌐 URL: http://localhost:${PORT}
  🤖 AI: ${GROQ_API_KEY ? '✅ Active' : '❌ Disabled'}
  📱 Telegram: ${TELEGRAM_BOT_URL}
  
  ✅ Available Endpoints:
  - POST /api/chat
  - POST /api/connect-human
  - POST /telegram-webhook
  - POST /api/send-to-operator
  - GET  /api/session/:id
  - GET  /api/sessions
  - GET  /api/health
  
  ============================================
  `);
});
