const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import custom modules
const AIService = require('./ai-service');
const TelegramBot = require('./telegram-bot');
const SessionManager = require('./session-manager');

// Initialize app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Security headers
app.use(helmet());

// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Initialize services
const aiService = new AIService();
const sessionManager = new SessionManager();
const telegramBot = new TelegramBot(sessionManager, io);

// Store active connections
const activeConnections = new Map();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get widget script
app.get('/widget.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/widget.js'));
});

app.get('/widget.css', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/widget.css'));
});

// Process AI chat message
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Message and sessionId are required' });
    }

    // Get or create session
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = sessionManager.createSession(sessionId);
    }

    // Add user message to session
    session.addMessage('user', message);

    // Try to get AI response
    const aiResponse = await aiService.getAIResponse(message, session.getContext());

    if (aiResponse.success) {
      // Add AI response to session
      session.addMessage('ai', aiResponse.message);
      
      res.json({
        success: true,
        message: aiResponse.message,
        requiresHuman: false,
        sessionId: sessionId
      });
    } else {
      // AI couldn't answer - offer human support
      session.addMessage('system', 'AI could not answer - offering human support');
      
      res.json({
        success: false,
        message: 'اطلاعات کافی برای پاسخ وجود ندارد. در صورت تمایل می‌توانید به اپراتور انسانی متصل شوید.',
        requiresHuman: true,
        sessionId: sessionId
      });
    }
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'خطا در پردازش درخواست',
      requiresHuman: true 
    });
  }
});

// Connect to human operator
app.post('/api/connect-human', async (req, res) => {
  try {
    const { sessionId, userInfo } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Get session
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Connect to Telegram operator
    const connectionResult = await telegramBot.connectToOperator(sessionId, userInfo);
    
    if (connectionResult.success) {
      session.connectToHuman();
      res.json({ 
        success: true, 
        message: 'در حال اتصال به اپراتور انسانی...',
        operatorConnected: true 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'خطا در اتصال به اپراتور' 
      });
    }
  } catch (error) {
    console.error('Connect human error:', error);
    res.status(500).json({ error: 'خطا در اتصال به اپراتور' });
  }
});

// Send message to operator
app.post('/api/send-to-operator', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }

    const result = await telegramBot.sendToOperator(sessionId, message);
    res.json(result);
  } catch (error) {
    console.error('Send to operator error:', error);
    res.status(500).json({ error: 'خطا در ارسال پیام' });
  }
});

// Socket.io for real-time communication
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    activeConnections.set(socket.id, sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });

  socket.on('disconnect', () => {
    const sessionId = activeConnections.get(socket.id);
    if (sessionId) {
      socket.leave(sessionId);
      activeConnections.delete(socket.id);
      console.log(`Client ${socket.id} disconnected from session ${sessionId}`);
    }
  });
});

// Broadcast message to all clients in a session
const broadcastToSession = (sessionId, event, data) => {
  io.to(sessionId).emit(event, data);
};

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 WebSocket server ready`);
  console.log(`🤖 Telegram bot initializing...`);
});

// Export for testing
module.exports = { app, server, io, broadcastToSession };
