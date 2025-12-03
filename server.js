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
      
      const response = await this.axios.post('/webhook', {
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

    if (session.connectedToHuman) {
      return res.json({
        success: true,
        message: 'پیام شما برای اپراتور ارسال شد.',
        requiresHuman: false,
        operatorConnected: true
      });
    }

    if (aiService) {
      const aiResponse = await aiService.getAIResponse(message);
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

app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log(`📨 Webhook: ${event}`, data);

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
        }
        break;
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ============================================
  🚀 Chat Server Started
  ============================================
  📍 Port: ${PORT}
  🌐 URL: http://localhost:${PORT}
  🤖 AI: ${GROQ_API_KEY ? '✅ Active' : '❌ Disabled'}
  📱 Telegram: ${TELEGRAM_BOT_URL}
  ============================================
  `);
});
