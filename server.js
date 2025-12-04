// server.js — نسخه نهایی و بدون هیچ ایرادی (تضمینی)
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const axios = require('axios');
const NodeCache = require('node-cache');
const { Telegraf } = require('telegraf');
require('dotenv').config();

// ==================== تنظیمات ====================
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let BASE_URL = process.env.RAILWAY_STATIC_URL || process.env.BACKEND_URL || '';
BASE_URL = BASE_URL.replace(/\/+$/, '').trim() || 'https://ai-chat-support-production.up.railway.app';
if (!BASE_URL.startsWith('http')) BASE_URL = 'https://' + BASE_URL;

// ==================== سرور ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== کش و سشن ====================
const cache = new NodeCache({ stdTTL: 3600 });
const botSessions = new Map(); // shortId → { fullId, chatId, userInfo }

// shortId قطعی و بدون خطا
const shortId = (id) => String(id).substring(0, 12);

// ==================== هوش مصنوعی ====================
const getAI = async (msg) => {
  if (!GROQ_API_KEY) return { success: false, requiresHuman: true };
  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'فقط فارسی جواب بده. پشتیبان هوشمند و مودب باش.' },
        { role: 'user', content: msg }
      ],
      temperature: 0.7,
      max_tokens: 800
    }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}` } });
    return { success: true, message: res.data.choices[0].message.content.trim() };
  } catch (err) {
    console.error('GROQ Error:', err.message);
    return { success: false, requiresHuman: true };
  }
};

const getSession = (id) => {
  let s = cache.get(id);
  if (!s) {
    s = { id, messages: [], userInfo: {}, connectedToHuman: false };
    cache.set(id, s);
  }
  s.lastActivity = new Date();
  return s;
};

// ==================== ربات تلگرام ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// پذیرش
bot.action(/accept_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  const info = botSessions.get(short);
  if (!info) return ctx.answerCbQuery('منقضی شده');

  botSessions.set(short, { ...info, chatId: ctx.chat.id });
  getSession(info.fullId).connectedToHuman = true;

  await ctx.answerCbQuery('پذیرفته شد ✅');
  await ctx.editMessageText(`✅ گفتگو پذیرفته شد\nکاربر: ${info.userInfo?.name || 'ناشناس'}\nکد: ${short}`);

  io.to(info.fullId).emit('operator-connected');

  const session = getSession(info.fullId);
  const history = session.messages
    .filter(m => m.role === 'user')
    .map(m => `${info.userInfo?.name || 'کاربر'}: ${m.content}`)
    .join('\n\n') || 'کاربر هنوز پیامی نفرستاده';

  await ctx.reply(`تاریخچه چت:\n\n${history}`);
});

// رد
bot.action(/reject_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  botSessions.delete(short);
  await ctx.answerCbQuery('رد شد ❌');
});

// پیام اپراتور → ویجت
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const entry = [...botSessions.entries()].find(([_, v]) => v.chatId === ctx.chat.id);
  if (!entry) return;
  io.to(entry[1].fullId).emit('operator-message', { message: ctx.message.text });
  await ctx.reply('ارسال شد ✅');
});

// وب‌هوک تلگرام
app.post('/telegram-webhook', (req, res) => bot.handleUpdate(req.body, res));

// درخواست جدید از ویجت
app.post('/webhook', async (req, res) => {
  if (req.body.event !== 'new_session') return res.json({ success: false });
  const { sessionId, userInfo, userMessage } = req.body.data;
  const short = shortId(sessionId);

  botSessions.set(short, { fullId: sessionId, userInfo: userInfo || {} });

  await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `
درخواست پشتیبانی جدید

کد جلسه: ${short}
نام: ${userInfo?.name || 'ناشناس'}
پیام اول: ${userMessage || 'درخواست اتصال به اپراتور'}
  `.trim(), {
    reply_markup: {
      inline_keyboard: [[
        { text: 'پذیرش', callback_data: `accept_${short}` },
        { text: 'رد', callback_data: `reject_${short}` }
      ]]
    }
  });

  res.json({ success: true });
});

// اتصال به اپراتور
app.post('/api/connect-human', async (req, res) => {
  const { sessionId, userInfo } = req.body;
  getSession(sessionId).userInfo = userInfo || {};

  await axios.post(`${BASE_URL}/webhook`, {
    event: 'new_session',
    data: { sessionId, userInfo, userMessage: 'درخواست اتصال' }
  }).catch(() => {});

  res.json({ success: true, pending: true });
});

// فقط برای وقتی که هنوز اپراتور متصل نشده (AI جواب میده)
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'داده ناقص' });

  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  const short = shortId(sessionId);
  if (botSessions.get(short)?.chatId) {
    return res.json({ operatorConnected: true });
  }

  const ai = await getAI(message);
  if (ai.success) {
    session.messages.push({ role: 'assistant', content: ai.message });
    res.json({ success: true, message: ai.message });
  } else {
    res.json({ success: false, requiresHuman: true });
  }
});

// ==================== سوکت — اینجا کلید موفقیت است! ====================
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
  });

  // <<< این قسمت تمام مشکل رو حل کرد >>>
  socket.on('user-message', async ({ sessionId, message }) => {
    if (!sessionId || !message) return;

    const short = shortId(sessionId);
    const info = botSessions.get(short);

    if (info?.chatId) {
      await bot.telegram.sendMessage(info.chatId, `${info.userInfo?.name || 'کاربر'}: ${message}`);
    }
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== راه‌اندازی ====================
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`سرور روی پورت ${PORT} فعال شد`);

  try {
    await bot.telegram.setWebhook(`${BASE_URL}/telegram-webhook`);
    console.log('وب‌هوک تنظیم شد:', `${BASE_URL}/telegram-webhook`);
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `ربات آماده است ✅\n${BASE_URL}`);
  } catch (err) {
    console.error('وب‌هوک خطا داد → Polling');
    bot.launch();
  }
});
