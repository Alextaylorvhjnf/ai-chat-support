// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize Express app
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
app.use(express.static('public'));

// Load environment variables
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8200429613:AAGTgP5hnOiRIxXc3YJmxvTqwEqhQ4crGkk';
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '7321524568';
const PORT = process.env.PORT || 3000;

// In-memory storage for sessions
const userSessions = new Map(); // Map<sessionId, {userId, telegramChatId, isHuman}>
const telegramSessions = new Map(); // Map<telegramChatId, sessionId>

/**
 * Send message to Telegram
 * @param {string} chatId - Telegram chat ID
 * @param {string} message - Message to send
 */
async function sendToTelegram(chatId, message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    const data = await response.json();
    return data.ok;
  } catch (error) {
    console.error('Error sending to Telegram:', error);
    return false;
  }
}

/**
 * Get AI response from Groq API
 * @param {string} message - User message
 * @returns {Promise<{response: string, isSufficient: boolean}>}
 */
async function getAIResponse(message) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a helpful customer support assistant for a company. 
                     Answer questions clearly and concisely. 
                     If you cannot answer or need more specific information, say so.
                     If the question is about account issues, payments, technical problems, 
                     or requires personal data access, suggest connecting to human support.`
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      const aiResponse = data.choices[0].message.content;
      
      // Check if AI couldn't answer properly
      const insufficientKeywords = [
        'I cannot', 'I don\'t know', 'not sure', 'more information',
        'contact support', 'human assistance', 'cannot answer'
      ];
      
      const isSufficient = !insufficientKeywords.some(keyword => 
        aiResponse.toLowerCase().includes(keyword.toLowerCase())
      );
      
      return {
        response: aiResponse,
        isSufficient: isSufficient
      };
    }
    
    return {
      response: 'Sorry, I couldn\'t process your request at the moment.',
      isSufficient: false
    };
  } catch (error) {
    console.error('Groq API Error:', error);
    return {
      response: 'There was an error processing your request. Please try again.',
      isSufficient: false
    };
  }
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Generate session ID for this connection
  const sessionId = uuidv4();
  userSessions.set(sessionId, {
    socketId: socket.id,
    userId: `user_${Date.now()}`,
    isHuman: false,
    telegramChatId: null
  });
  
  // Send session ID to client
  socket.emit('session-init', { sessionId });
  
  /**
   * Handle incoming messages from website
   */
  socket.on('message-from-website', async (data) => {
    const { sessionId, message } = data;
    const session = userSessions.get(sessionId);
    
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    
    // If already connected to human support
    if (session.isHuman && session.telegramChatId) {
      // Forward message to Telegram
      const telegramMessage = `👤 کاربر سایت:\n${message}`;
      await sendToTelegram(session.telegramChatId, telegramMessage);
      return;
    }
    
    // Get AI response
    const aiResult = await getAIResponse(message);
    
    // If AI can answer sufficiently
    if (aiResult.isSufficient) {
      socket.emit('message-to-website', {
        sender: 'ai',
        message: aiResult.response,
        sessionId: sessionId
      });
    } else {
      // AI couldn't answer properly
      socket.emit('message-to-website', {
        sender: 'ai',
        message: `${aiResult.response}\n\n📢 <strong>اطلاعات کافی برای پاسخ وجود ندارد.</strong>\nدر صورت تمایل می‌توانید به اپراتور انسانی متصل شوید.`,
        sessionId: sessionId,
        showHumanButton: true
      });
    }
  });
  
  /**
   * Connect to human operator
   */
  socket.on('connect-to-human', async (data) => {
    const { sessionId } = data;
    const session = userSessions.get(sessionId);
    
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    
    // Create Telegram chat with admin
    const telegramChatId = ADMIN_TELEGRAM_ID;
    
    // Update session
    session.isHuman = true;
    session.telegramChatId = telegramChatId;
    telegramSessions.set(telegramChatId, sessionId);
    
    // Notify admin in Telegram
    const notificationMessage = `🔔 <b>اتصال جدید از وبسایت</b>\n\n`
      + `یک کاربر جدید درخواست اتصال به اپراتور انسانی کرده است.\n`
      + `شناسه جلسه: ${sessionId}\n`
      + `میتوانید با پاسخ دادن به این پیام با کاربر صحبت کنید.`;
    
    await sendToTelegram(telegramChatId, notificationMessage);
    
    // Notify website user
    socket.emit('human-connected', {
      sessionId: sessionId,
      message: '✅ به اپراتور انسانی متصل شدید. لطفاً پیام خود را بنویسید.'
    });
  });
  
  /**
   * Send message from Telegram to website
   */
  socket.on('message-from-telegram', (data) => {
    const { telegramChatId, message } = data;
    const sessionId = telegramSessions.get(telegramChatId);
    
    if (sessionId) {
      const session = userSessions.get(sessionId);
      if (session && session.socketId) {
        // Send message to specific website user
        io.to(session.socketId).emit('message-to-website', {
          sender: 'human',
          message: `👨‍💼 اپراتور: ${message}`,
          sessionId: sessionId
        });
      }
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clean up sessions
    for (const [sessionId, session] of userSessions.entries()) {
      if (session.socketId === socket.id) {
        userSessions.delete(sessionId);
        
        // Notify Telegram admin if in human mode
        if (session.isHuman && session.telegramChatId) {
          telegramSessions.delete(session.telegramChatId);
          sendToTelegram(session.telegramChatId, 
            '🔴 کاربر از وبسایت خارج شد. جلسه پایان یافت.'
          );
        }
        break;
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    sessions: userSessions.size,
    timestamp: new Date().toISOString()
  });
});

// Endpoint for Telegram webhook
app.post('/webhook/telegram', express.json(), async (req, res) => {
  const update = req.body;
  
  if (update.message) {
    const chatId = update.message.chat.id;
    const messageText = update.message.text;
    const messageId = update.message.message_id;
    
    // Check if this is admin
    if (chatId.toString() === ADMIN_TELEGRAM_ID) {
      // Find session for this chat
      const sessionId = telegramSessions.get(chatId.toString());
      
      if (sessionId) {
        const session = userSessions.get(sessionId);
        if (session) {
          // Forward message to website via WebSocket
          io.to(session.socketId).emit('message-to-website', {
            sender: 'human',
            message: `👨‍💼 اپراتور: ${messageText}`,
            sessionId: sessionId
          });
        }
      }
    }
  }
  
  res.sendStatus(200);
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
  console.log(`Environment: GROQ_API_KEY=${GROQ_API_KEY ? 'Set' : 'Not Set'}`);
  console.log(`Telegram Bot: ${TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not Configured'}`);
});
