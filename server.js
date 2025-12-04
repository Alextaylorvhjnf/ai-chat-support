// app.js
'use strict';

/**
 * Unified Backend + Telegram Bot
 * - Express backend (API + WebSocket via socket.io)
 * - Telegraf Telegram bot (Webhook mode on /telegram-webhook)
 *
 * Usage:
 *   NODE_ENV=production DOMAIN=ai-chat-support-production.up.railway.app \
 *     TELEGRAM_BOT_TOKEN=xxx ADMIN_TELEGRAM_ID=yyy BACKEND_URL=https://ai-chat-support-production.up.railway.app \
 *     node app.js
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const NodeCache = require('node-cache');
const { Telegraf, Markup } = require('telegraf');

require('dotenv').config();

// -------------------------------
// Config
// -------------------------------
const PORT = parseInt(process.env.PORT || process.env.PORT_APP || 3000, 10);
const DOMAIN = process.env.DOMAIN || process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`; // default to same process
const WEBHOOK_PATH = '/telegram-webhook';
const WEBHOOK_FULL_URL = DOMAIN ? `https://${DOMAIN}${WEBHOOK_PATH}` : null;

console.log('='.repeat(60));
console.log('UNIFIED AI CHATBACKEND + TELEGRAM BOT');
console.log('PORT:', PORT);
console.log('DOMAIN:', DOMAIN || '(no public domain - bot will use polling)');
console.log('BACKEND_URL:', BACKEND_URL);
console.log('TELEGRAM WEBHOOK PATH:', WEBHOOK_PATH);
console.log('='.repeat(60));

if (!TELEGRAM_BOT_TOKEN) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN not set. Bot will not start.');
}

// -------------------------------
// Express + Socket.IO setup
// -------------------------------
const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});

// Middleware
app.use(cors({ origin: "*", methods: ["GET","POST","OPTIONS"] }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(helmet({ contentSecurityPolicy: false }));

// Simple request logger for diagnostics
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.ip} ${req.method} ${req.originalUrl}`);
  next();
});

// Serve static (optional)
app.use(express.static(path.join(__dirname, 'public')));

// Session cache
const sessionCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// -------------------------------
// AIService (kept minimal — as in your original file)
// -------------------------------
class AIService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
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
    this.systemPrompt = `شما "پشتیبان هوشمند" هستید...`;
  }

  async getAIResponse(userMessage) {
    if (!this.apiKey) {
      return { success: false, message: 'AI غیرفعال است.', requiresHuman: true };
    }
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
      const aiMessage = response.data?.choices?.[0]?.message?.content;
      if (!aiMessage) throw new Error('Invalid AI response');
      const requiresHuman = this.shouldConnectToHuman(aiMessage);
      return { success: !requiresHuman, message: aiMessage, requiresHuman };
    } catch (err) {
      console.error('AI Error:', err && err.message);
      return { success: false, message: 'خطا در پردازش. به اپراتور ارجاع داده شد.', requiresHuman: true };
    }
  }

  shouldConnectToHuman(message) {
    if (!message) return false;
    const triggers = ['اپراتور انسانی','متخصص انسانی','نمیتوانم پاسخ دهم','اطلاعات کافی','لطفاً با اپراتور'];
    return triggers.some(t => message.toLowerCase().includes(t.toLowerCase()));
  }
}

// -------------------------------
// SessionManager (same behaviour as your original)
// -------------------------------
class SessionManager {
  constructor() { this.sessions = new Map(); }
  createSession(sessionId, userInfo = {}) {
    const session = { id: sessionId, messages: [], createdAt: new Date(), lastActivity: new Date(), connectedToHuman: false, operatorId: null, operatorChatId: null, userInfo, status: 'active' };
    this.sessions.set(sessionId, session);
    sessionCache.set(sessionId, session);
    console.log(`Session created: ${sessionId.substring(0,8)}...`);
    return session;
  }
  getSession(sessionId) {
    let session = sessionCache.get(sessionId) || this.sessions.get(sessionId);
    if (session) { session.lastActivity = new Date(); sessionCache.set(sessionId, session); }
    return session;
  }
  addMessage(sessionId, role, content) {
    const s = this.getSession(sessionId);
    if (!s) return null;
    s.messages.push({ id: uuidv4(), role, content, timestamp: new Date() });
    if (s.messages.length > 100) s.messages = s.messages.slice(-100);
    sessionCache.set(sessionId, s);
    return s.messages[s.messages.length-1];
  }
  connectToHuman(sessionId, operatorChatId, operatorName) {
    const s = this.getSession(sessionId);
    if (!s) return null;
    s.connectedToHuman = true; s.operatorId = 'telegram_operator'; s.operatorChatId = operatorChatId; s.status = 'connected';
    sessionCache.set(sessionId, s);
    return s;
  }
  disconnectFromHuman(sessionId) {
    const s = this.getSession(sessionId);
    if (!s) return null;
    s.connectedToHuman = false; s.operatorId = null; s.operatorChatId = null; s.status = 'active';
    sessionCache.set(sessionId, s);
    return s;
  }
  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(s => (new Date() - s.lastActivity) < 30*60*1000);
  }
  getStats() {
    const active = this.getActiveSessions();
    return { totalSessions: this.sessions.size, activeSessions: active.length, humanConnected: active.filter(s => s.connectedToHuman).length, aiEnabled: !!process.env.GROQ_API_KEY };
  }
}

// -------------------------------
// Telegram bot (Telegraf) - integrated
// -------------------------------
let bot = null;
if (TELEGRAM_BOT_TOKEN) {
  bot = new Telegraf(TELEGRAM_BOT_TOKEN);

  // simple operator UI
  bot.start((ctx) => {
    const text = `سلام ${ctx.from.first_name || 'اپراتور'}!\n/ help برای راهنما\n/sessions برای جلسات`;
    ctx.reply(text);
  });

  bot.command('help', ctx => ctx.reply('راهنما: /sessions'));
  bot.command('sessions', async (ctx) => {
    try {
      const resp = await axios.get(`${BACKEND_URL}/api/sessions`);
      const list = resp.data.sessions || [];
      if (!list.length) return ctx.reply('هیچ جلسه فعالی وجود ندارد.');
      let msg = `جلسات (${list.length}):\n`;
      list.forEach(s => msg += `• ${s.shortId} — ${s.userInfo?.name || 'ناشناس'} — ${s.connectedToHuman ? 'متصل' : 'در انتظار'}\n`);
      ctx.reply(msg);
    } catch (err) {
      console.error('sessions error', err && err.message);
      ctx.reply('خطا در دریافت جلسات');
    }
  });

  // callback handlers
  bot.action(/accept_(.+)/, async (ctx) => {
    const shortId = ctx.match[1];
    // translate shortId -> full session id: backend holds full IDs; we will ask backend by /api/sessions
    // But your backend stores sessions keyed by fullId. To keep it simple, notify backend with provided shortId guess.
    try {
      // notify backend via its webhook endpoint — /webhook event operator_accepted expects full sessionId
      // We'll request backend to resolve by calling /api/sessions and matching shortId locally.
      const sessionsRes = await axios.get(`${BACKEND_URL}/api/sessions`);
      const found = (sessionsRes.data.sessions || []).find(s => (s.shortId || s.id.substring(0,12)) === shortId);
      if (!found) return ctx.answerCbQuery('جلسه پیدا نشد');
      const fullSessionId = found.id;
      // acknowledge
      await ctx.answerCbQuery('✅ گفتگو قبول شد');
      await ctx.editMessageText((ctx.callbackQuery.message && ctx.callbackQuery.message.text || '') + '\n\n✅ شما این گفتگو را قبول کردید.');
      // notify backend
      await axios.post(`${BACKEND_URL}/webhook`, { event: 'operator_accepted', data: { sessionId: fullSessionId, operatorId: ctx.chat.id, operatorName: ctx.from.first_name || '' } });
      console.log(`Operator ${ctx.chat.id} accepted ${shortId}`);
    } catch (err) {
      console.error('accept error', err && err.message);
      ctx.answerCbQuery('خطا در پردازش');
    }
  });

  bot.action(/reject_(.+)/, async (ctx) => {
    const shortId = ctx.match[1];
    try {
      const sessionsRes = await axios.get(`${BACKEND_URL}/api/sessions`);
      const found = (sessionsRes.data.sessions || []).find(s => (s.shortId || s.id.substring(0,12)) === shortId);
      if (!found) return ctx.answerCbQuery('جلسه پیدا نشد');
      const fullSessionId = found.id;
      await ctx.answerCbQuery('❌ گفتگو رد شد');
      await ctx.editMessageText((ctx.callbackQuery.message && ctx.callbackQuery.message.text || '') + '\n\n❌ شما این گفتگو را رد کردید.');
      await axios.post(`${BACKEND_URL}/webhook`, { event: 'operator_rejected', data: { sessionId: fullSessionId } });
      console.log(`Operator ${ctx.chat.id} rejected ${shortId}`);
    } catch (err) {
      console.error('reject error', err && err.message);
      ctx.answerCbQuery('خطا در پردازش');
    }
  });

  // operator text messages -> forward to backend /api/send-to-user
  bot.on('text', async (ctx) => {
    if (ctx.message.text && ctx.message.text.startsWith('/')) return;
    try {
      // resolve operator session from /api/sessions (simple approach)
      const sessionsRes = await axios.get(`${BACKEND_URL}/api/sessions`);
      const sessionsList = sessionsRes.data.sessions || [];
      // find session assigned to this operator (search by operatorChatId stored in backend sessions)
      const my = sessionsList.find(s => String(s.operatorChatId) === String(ctx.chat.id));
      if (!my) return ctx.reply('شما جلسه فعالی ندارید.');
      // send message
      const resp = await axios.post(`${BACKEND_URL}/api/send-to-user`, { sessionId: my.id, message: ctx.message.text, operatorId: ctx.chat.id, operatorName: ctx.from.first_name || '' });
      if (resp.data && resp.data.success) {
        ctx.reply('✅ پیام ارسال شد.');
      } else {
        ctx.reply('❌ خطا در ارسال پیام.');
      }
    } catch (err) {
      console.error('operator message error', err && err.message);
      ctx.reply('خطا در ارسال پیام.');
    }
  });
}

// -------------------------------
// Create service instances used by backend
// -------------------------------
const aiService = new AIService();
const sessionManager = new SessionManager();

// TelegramService in backend will call out to TELEGRAM_BOT_URL by default.
// To make it work inside the same process, use BACKEND_TO_BOT_URL default to localhost
const TELEGRAM_BOT_URL = process.env.TELEGRAM_BOT_URL || `http://localhost:${PORT}`;

class TelegramService {
  constructor() {
    this.botUrl = TELEGRAM_BOT_URL;
    this.axios = axios.create({ baseURL: this.botUrl, timeout: 10000 });
  }

  async notifyNewSession(sessionId, userInfo, userMessage) {
    try {
      const response = await this.axios.post('/webhook', { event: 'new_session', data: { sessionId, userInfo, userMessage } });
      return response.data.success === true;
    } catch (err) {
      console.error('Telegram notification failed:', err && err.message);
      return false;
    }
  }

  async sendToOperator(sessionId, message, userInfo) {
    try {
      const response = await this.axios.post('/webhook', { event: 'user_message', data: { sessionId, message, userName: userInfo?.name || 'کاربر سایت' } });
      return response.data;
    } catch (err) {
      console.error('Send to operator failed:', err && err.message);
      return { success: false, error: err && err.message };
    }
  }

  async checkHealth() {
    try {
      const response = await this.axios.get('/health');
      return response.data.status === 'OK';
    } catch (err) {
      console.error('Telegram health check failed:', err && err.message);
      return false;
    }
  }
}

const telegramService = new TelegramService();

// -------------------------------
// WebSocket handlers (same as your original)
// -------------------------------
io.on('connection', (socket) => {
  console.log('WebSocket connected:', socket.id);
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log('Client joined session', sessionId);
  });

  socket.on('send-to-operator', async (data) => {
    const { sessionId, message } = data;
    const s = sessionManager.getSession(sessionId);
    if (s && s.connectedToHuman) {
      sessionManager.addMessage(sessionId, 'user', message);
      const result = await telegramService.sendToOperator(sessionId, message, s.userInfo);
      if (result.success) socket.emit('message-sent', { success: true });
      else socket.emit('message-sent', { success: false, error: result.error || 'خطا' });
    } else {
      socket.emit('message-sent', { success: false, error: 'هنوز به اپراتور متصل نیستید' });
    }
  });

  socket.on('disconnect', () => console.log('WebSocket disconnected:', socket.id));
});

// -------------------------------
// API Endpoints (kept largely same as your original code)
// -------------------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/widget.js', (req,res) => res.sendFile(path.join(__dirname,'public','widget.js')));
app.get('/widget.css', (req,res) => res.sendFile(path.join(__dirname,'public','widget.css')));

app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString(), features: { ai: !!process.env.GROQ_API_KEY, telegram: !!TELEGRAM_BOT_TOKEN }}));

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ success:false, error: 'پیام و شناسه جلسه الزامی است' });
    let session = sessionManager.getSession(sessionId) || sessionManager.createSession(sessionId);
    sessionManager.addMessage(sessionId, 'user', message);
    if (session.connectedToHuman) return res.json({ success:true, message: 'پیام شما برای اپراتور ارسال شد.', requiresHuman:false, sessionId, operatorConnected: true });
    const aiResponse = await aiService.getAIResponse(message);
    if (aiResponse.success) {
      sessionManager.addMessage(sessionId, 'assistant', aiResponse.message);
      return res.json({ success:true, message: aiResponse.message, requiresHuman:false, sessionId, operatorConnected:false });
    } else {
      sessionManager.addMessage(sessionId, 'system', 'AI پیشنهاد اتصال به اپراتور');
      return res.json({ success:false, message: aiResponse.message, requiresHuman:true, sessionId, operatorConnected:false });
    }
  } catch (err) {
    console.error('Chat error', err && err.message);
    res.status(500).json({ success:false, error: 'خطا در پردازش درخواست' });
  }
});

app.post('/api/connect-human', async (req, res) => {
  try {
    const { sessionId, userInfo } = req.body;
    if (!sessionId) return res.status(400).json({ success:false, error:'شناسه جلسه الزامی است' });
    const telegramHealthy = await telegramService.checkHealth();
    if (!telegramHealthy) return res.json({ success:false, error:'سرویس اپراتور در دسترس نیست.' });
    let session = sessionManager.getSession(sessionId) || sessionManager.createSession(sessionId, userInfo);
    session.userInfo = { ...session.userInfo, ...userInfo };
    const lastUserMessage = session.messages.filter(m => m.role==='user').slice(-1)[0]?.content || 'درخواست اتصال به اپراتور';
    const notified = await telegramService.notifyNewSession(sessionId, session.userInfo, lastUserMessage);
    if (notified) return res.json({ success:true, message:'درخواست ارسال شد', pending:true });
    else return res.json({ success:false, error:'خطا در ارسال درخواست' });
  } catch (err) {
    console.error('Connect human error', err && err.message);
    res.json({ success:false, error:'خطا' });
  }
});

// This endpoint is used BY the backend to notify the bot (it is the "bot webhook")
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('Backend -> Bot webhook', event);
    switch (event) {
      case 'new_session': {
        // create internal session record
        sessionManager.createSession(data.sessionId, data.userInfo || {});
        // send message to admin via Telegram (if bot active)
        if (bot && ADMIN_TELEGRAM_ID) {
          const shortId = (data.sessionId || '').toString().replace(/-/g,'').substring(0,12);
          const operatorMessage = `🔔 درخواست اتصال جدید\n\n🎫 کد: \`${shortId}\`\n👤 ${data.userInfo?.name || 'کاربر'}\n📝 ${String(data.userMessage||'').substring(0,120)}\n\n`;
          await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, operatorMessage, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [ Markup.button.callback('✅ بله، می‌پذیرم', `accept_${shortId}`), Markup.button.callback('❌ نه، رد کن', `reject_${shortId}`) ]
            ])
          });
        }
        return res.json({ success:true });
      }
      case 'user_message': {
        const shortId = (data.sessionId||'').toString().replace(/-/g,'').substring(0,12);
        // find session
        const session = Array.from(sessionManager.sessions.values()).find(s => s.id && s.id.toString().startsWith(shortId));
        if (session && session.operatorChatId && bot) {
          const text = `📩 پیام از کاربر\n\n${data.message}`;
          await bot.telegram.sendMessage(session.operatorChatId, text, { parse_mode: 'Markdown' });
          return res.json({ success:true });
        } else {
          return res.json({ success:false, error:'No operator assigned' });
        }
      }
      case 'operator_accepted': {
        sessionManager.connectToHuman(data.sessionId, data.operatorId, data.operatorName);
        io.to(data.sessionId).emit('operator-connected', { message: 'اپراتور متصل شد', operatorName: data.operatorName, timestamp: new Date().toISOString() });
        return res.json({ success:true });
      }
      case 'operator_rejected': {
        io.to(data.sessionId).emit('operator-rejected', { message: 'اپراتور رد کرد', timestamp: new Date().toISOString() });
        return res.json({ success:true });
      }
      case 'operator_message_sent': {
        // optional logging
        console.log('operator_message_sent', data);
        return res.json({ success:true });
      }
      default:
        return res.json({ success:false, error:'unknown event' });
    }
  } catch (err) {
    console.error('Webhook route error', err && err.message);
    res.status(500).json({ success:false, error: err && err.message });
  }
});

// other API endpoints
app.post('/api/send-to-user', async (req,res) => {
  try {
    const { sessionId, message, operatorId, operatorName } = req.body;
    if (!sessionId || !message) return res.status(400).json({ success:false, error:'شناسه جلسه و پیام الزامی است' });
    const session = sessionManager.getSession(sessionId);
    if (!session) return res.json({ success:false, error:'جلسه پیدا نشد' });
    sessionManager.addMessage(sessionId, 'operator', message);
    io.to(sessionId).emit('operator-message', { from:'operator', message, timestamp: new Date().toISOString(), operatorName: operatorName || 'اپراتور', sessionId });
    return res.json({ success:true, userName: session.userInfo?.name || 'کاربر سایت', sessionId });
  } catch (err) {
    console.error('send-to-user error', err && err.message);
    return res.json({ success:false, error:'خطا' });
  }
});

app.get('/api/sessions', (req,res) => {
  const active = sessionManager.getActiveSessions();
  const sessions = active.map(s => ({ id: s.id, shortId: s.id.substring(0,12), createdAt: s.createdAt, lastActivity: s.lastActivity, connectedToHuman: s.connectedToHuman, operatorChatId: s.operatorChatId, userInfo: s.userInfo, messageCount: s.messages.length, duration: Math.floor((new Date() - s.createdAt)/(1000*60)), status: s.status }));
  res.json({ sessions, total: sessions.length, connected: sessions.filter(s => s.connectedToHuman).length, pending: sessions.filter(s => !s.connectedToHuman).length });
});

app.get('/api/stats', (req,res) => res.json(sessionManager.getStats()));

// -------------------------------
// Telegram webhook endpoint (Telegram -> this app)
// -------------------------------
if (bot) {
  // Ensure we accept Telegram updates on the single path
  app.post(WEBHOOK_PATH, express.json({ limit: '1mb' }), async (req, res) => {
    try {
      // If Telegram sends an Update
      const update = req.body;
      // telegraf expects the raw update object
      await bot.handleUpdate(update);
      return res.sendStatus(200);
    } catch (err) {
      console.error('Error handling telegram update', err && err.message);
      return res.sendStatus(500);
    }
  });
}

// -------------------------------
// Start server & set webhook
// -------------------------------
server.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  // If we have a domain and a bot, set webhook
  if (bot && DOMAIN) {
    try {
      console.log('Setting Telegram webhook to', WEBHOOK_FULL_URL);
      await bot.telegram.setWebhook(WEBHOOK_FULL_URL);
      console.log('Webhook set successfully.');
    } catch (err) {
      console.error('Failed to set webhook, falling back to polling. Error:', err && err.message);
      try {
        await bot.launch();
        console.log('Bot launched with polling as fallback.');
      } catch (e) {
        console.error('Bot launch failed', e && e.message);
      }
    }
  } else if (bot && !DOMAIN) {
    // No public domain configured — use polling
    console.log('DOMAIN not set — starting bot in polling mode.');
    await bot.launch();
    console.log('Bot launched with polling.');
  }

  // Optional: health log
  console.log('App ready. Health check: GET /api/health');
});

// Graceful shutdown
process.on('SIGINT', async () => { console.log('SIGINT - shutting down'); if (bot) await bot.stop(); process.exit(0); });
process.on('SIGTERM', async () => { console.log('SIGTERM - shutting down'); if (bot) await bot.stop(); process.exit(0); });
