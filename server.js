const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const axios = require('axios');
const NodeCache = require('node-cache');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

// ==================== تنظیمات ====================
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
let BASE_URL = process.env.RAILWAY_STATIC_URL || process.env.BACKEND_URL || '';
BASE_URL = BASE_URL.replace(/\/+$/, '').trim();
if (BASE_URL && !BASE_URL.startsWith('http')) BASE_URL = 'https://' + BASE_URL;

// ==================== سرور اصلی ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== کش و سشن ====================
const cache = new NodeCache({ stdTTL: 3600 });
const botSessions = new Map(); // shortId → { fullId, chatId, userInfo }

// کوتاه کردن آیدی
const shortId = id => id.toString().slice(0, 12);

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
    const text = res.data.choices[0].message.content.trim();
    const needHuman = /اپراتور|انسانی|نمی‌دونم|نمی‌تونم/i.test(text);
    return { success: true, message: text, requiresHuman: needHuman };
  } catch (err) {
    console.error('خطا در GROQ:', err.message);
    return { success: false, requiresHuman: true };
  }
};

// ==================== سشن ====================
const getSession = id => {
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

// پذیرش درخواست — اینجا مهم‌ترین تغییر اعمال شد
bot.action(/accept_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  const info = botSessions.get(short);
  if (!info) return ctx.answerCbQuery('منقضی شده');

  // ذخیره chatId اپراتور + علامت‌گذاری اتصال
  botSessions.set(short, { ...info, chatId: ctx.chat.id });

  const session = getSession(info.fullId);
  session.connectedToHuman = true;

  await ctx.answerCbQuery('پذیرفته شد ✅');
  await ctx.editMessageText(`✅ گفتگو پذیرفته شد\nکاربر: ${info.userInfo?.name || 'ناشناس'}\nکد: ${short}`);

  // اطلاع به کاربر در سایت
  io.to(info.fullId).emit('operator-connected', { message: 'اپراتور متصل شد! در حال انتقال به پشتیبان انسانی...' });

  // ارسال تاریخچه پیام‌های قبلی کاربر به اپراتور
  const history = session.messages
    .filter(m => m.role === 'user')
    .map(m => `${info.userInfo?.name || 'کاربر'}: ${m.content}`)
    .join('\n\n');

  if (history) {
    await bot.telegram.sendMessage(ctx.chat.id, `تاریخچه پیام‌های کاربر:\n\n${history}`);
  } else {
    await bot.telegram.sendMessage(ctx.chat.id, 'کاربر منتظر شماست...');
  }
});

// رد درخواست
bot.action(/reject_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  botSessions.delete(short);
  await ctx.answerCbQuery('رد شد ❌');
  await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ رد شد');
});

// پیام اپراتور → ویجت (قبلاً درست کار می‌کرد)
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const entry = [...botSessions.entries()].find(([_, v]) => v.chatId === ctx.chat.id);
  if (!entry) return;
  const fullId = entry[1].fullId;
  io.to(fullId).emit('operator-message', { message: ctx.message.text });
  ctx.reply('ارسال شد ✅');
});

// ==================== وب‌هوک تلگرام ====================
app.post('/telegram-webhook', (req, res) => {
  bot.handleUpdate(req.body, res);
});

// ==================== درخواست جدید از سایت ====================
app.post('/webhook', async (req, res) => {
  try {
    if (req.body.event === 'new_session') {
      const { sessionId, userInfo, userMessage } = req.body.data;
      const short = shortId(sessionId);
      botSessions.set(short, { fullId: sessionId, userInfo: userInfo || {} });

      const text = `درخواست پشتیبانی جدید\n\nکد جلسه: ${short}\nنام: ${userInfo?.name || 'ناشناس'}\nپیام اول: ${userMessage || 'درخواست اتصال به اپراتور'}`;

      await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, text, {
        reply_markup: {
          inline_keyboard: [[
            { text: 'پذیرش', callback_data: `accept_${short}` },
            { text: 'رد', callback_data: `reject_${short}` }
          ]]
        }
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('خطا در /webhook:', err);
    res.status(500).json({ success: false });
  }
});

// ==================== API چت ویجت — اصلاح اصلی اینجا انجام شد ====================
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'داده ناقص' });

  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  const short = shortId(sessionId);
  const botInfo = botSessions.get(short);

  // اگر اپراتور پذیرش کرده باشد → پیام مستقیم به تلگرام برود
  if (botInfo?.chatId) {
    try {
      await bot.telegram.sendMessage(
        botInfo.chatId,
        `${botInfo.userInfo?.name || 'کاربر'}: ${message}`
      );
    } catch (err) {
      console.error('خطا در ارسال به اپراتور:', err.message);
    }
    return res.json({ operatorConnected: true });
  }

  // در غیر این صورت هوش مصنوعی جواب دهد
  const ai = await getAI(message);
  if (ai.success && !ai.requiresHuman) {
    session.messages.push({ role: 'assistant', content: ai.message });
    return res.json({ success: true, message: ai.message });
  } else {
    return res.json({ success: false, requiresHuman: true });
  }
});

// اتصال به اپراتور
app.post('/api/connect-human', async (req, res) => {
  const { sessionId, userInfo } = req.body;
  const session = getSession(sessionId);
  session.userInfo = userInfo || {};

  await axios.post(`${BASE_URL}/webhook`, {
    event: 'new_session',
    data: { sessionId, userInfo, userMessage: session.messages.slice(-1)[0]?.content || 'درخواست اتصال' }
  }).catch(() => {});

  res.json({ success: true, pending: true });
});

// ارسال پیام از ربات به ویجت (برای مواقع خاص)
app.post('/api/send-to-user', (req, res) => {
  const { sessionId, message } = req.body;
  io.to(sessionId).emit('operator-message', { message });
  res.json({ success: true });
});

// صفحه اصلی
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// سوکت
io.on('connection', socket => {
  socket.on('join-session', id => socket.join(id));
});

// ==================== راه‌اندازی ====================
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`سرور روی پورت ${PORT} فعال شد`);

  if (!BASE_URL || !TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_ID) {
    console.log('Polling mode');
    bot.launch();
    return;
  }

  const url = `${BASE_URL}/telegram-webhook`;
  try {
    const info = await bot.telegram.getWebhookInfo();
    if (info.url !== url) {
      await new Promise(r => setTimeout(r, 3000));
      await bot.telegram.setWebhook(url);
      console.log('وب‌هوک تنظیم شد:', url);
    } else {
      console.log('وب‌هوک قبلاً درست بود');
    }
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `ربات آماده است ✅\n${url}`);
  } catch (err) {
    console.error('وب‌هوک خطا داد → Polling فعال شد');
    bot.launch();
  }
});
