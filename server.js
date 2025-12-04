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

// ====================== تنظیمات محیطی ======================
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

// خیلی مهم: آدرس دامنه بدون http/https و بدون مسیر
let BASE_URL = process.env.RAILWAY_STATIC_URL || process.env.BACKEND_URL || '';
BASE_URL = BASE_URL.replace(/\/+$/, '').trim(); // حذف اسلش آخر

// اگر BASE_URL خالی بود یا فقط دامنه بود، https اضافه کن
if (BASE_URL && !BASE_URL.startsWith('http')) {
  BASE_URL = 'https://' + BASE_URL;
}

console.log('='.repeat(60));
console.log('AI CHATBOT + TELEGRAM BOT - FINAL WORKING VERSION');
console.log('='.repeat(60));
console.log('PORT:', PORT);
console.log('BASE_URL:', BASE_URL || 'محلی (Polling)');
console.log('GROQ:', GROQ_API_KEY ? 'فعال' : 'غیرفعال');
console.log('Telegram Bot:', TELEGRAM_BOT_TOKEN ? 'موجود' : 'غایب');

// ====================== اپ و سرور اصلی ======================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ====================== کش و سشن ======================
const cache = new NodeCache({ stdTTL: 3600 });
const botSessions = new Map(); // shortId → session info

// ====================== هوش مصنوعی ======================
const aiService = {
  async getResponse(message) {
    if (!GROQ_API_KEY) return { success: false, requiresHuman: true };
    try {
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'فقط فارسی جواب بده. پشتیبان هوشمند باش.' },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 800
      }, {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        timeout: 25000
      });
      const text = res.data.choices[0].message.content.trim();
      const needHuman = /اپراتور|انسانی|نمی‌دونم|نمی‌تونم|متخصص/i.test(text);
      return { success: true, message: text, requiresHuman: needHuman };
    } catch (err) {
      console.error('AI Error:', err.message);
      return { success: false, requiresHuman: true };
    }
  }
};

// ====================== سشن منیجر ======================
class SessionManager {
  constructor() { this.sessions = new Map(); }
  get(id) {
    let s = cache.get(id) || this.sessions.get(id);
    if (!s) {
      s = { id, messages: [], createdAt: new Date(), userInfo: {} };
      this.sessions.set(id, s);
      cache.set(id, s);
    }
    s.lastActivity = new Date();
    cache.set(id, s);
    return s;
  }
  addMessage(id, role, content) {
    const s = this.get(id);
    s.messages.push({ role, content, time: new Date() });
    if (s.messages.length > 100) s.messages = s.messages.slice(-100);
  }
  connectHuman(id) {
    const s = this.get(id);
    s.connectedToHuman = true;
    cache.set(id, s);
  }
}
const sessions = new SessionManager();

// ====================== ربات تلگرام ======================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// کوتاه کردن آیدی
const shortId = id => id.substring(0, 12);

// دستورات ربات
bot.start(ctx => ctx.reply('سلام اپراتور! ربات فعاله', Markup.keyboard([['جلسات فعال']]).resize()));
bot.hears('جلسات فعال', async ctx => {
  const list = Array.from(sessions.sessions.values()).slice(0, 20);
  if (!list.length) return ctx.reply('هیچ جلسه‌ای نیست');
  const text = list.map((s, i) => `${i+1}. \`${shortId(s.id)}\` – ${s.userInfo.name || 'ناشناس'} – ${s.connectedToHuman ? 'متصل' : 'در انتظار'}`).join('\n');
  ctx.reply(text, { parse_mode: 'Markdown' });
});

// پذیرش/رد
bot.action(/accept_(.+)/, async ctx => {
  const short = ctx.match[1];
  const info = botSessions.get(short);
  if (!info) return ctx.answerCbQuery('منقضی شده');
  botSessions.set(short, { ...info, status: 'accepted', chatId: ctx.chat.id });
  sessions.connectHuman(info.fullId);
  await ctx.answerCbQuery('پذیرفته شد');
  await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\nپذیرفته شد ✅');
  io.to(info.fullId).emit('operator-connected', { message: 'اپراتور متصل شد!' });
});

bot.action(/reject_(.+)/, async ctx => {
  const short = ctx.match[1];
  botSessions.delete(short);
  await ctx.answerCbQuery('رد شد');
  io.to(sessions.get(ctx.match[1])?.id || '').emit('operator-rejected', { message: 'اپراتور در دسترس نیست' });
});

// پیام اپراتور
bot.on('text', async ctx => {
  if (ctx.message.text.startsWith('/')) return;
  const entry = [...botSessions.entries()].find(([_, v]) => v.chatId === ctx.chat.id);
  if (!entry) return;
  const fullId = entry[1].fullId;
  sessions.addMessage(fullId, 'operator', ctx.message.text);
  io.to(fullId).emit('operator-message', { message: ctx.message.text });
  ctx.reply('ارسال شد ✅');
});

// ====================== وب‌هوک از سایت به ربات ======================
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    if (event === 'new_session') {
      const short = shortId(data.sessionId);
      botSessions.set(short, { fullId: data.sessionId, userInfo: data.userInfo });
      await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `
جدید
کد: \`${short}\`
کاربر: ${data.userInfo?.name || 'ناشناس'}
پیام: ${data.userMessage?.substring(0, 100)}
      `.trim(), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: 'پذیرش', callback_data: `accept_${short}` },
            { text: 'رد', callback_data: `reject_${short}` }
          ]]
        }
      });
      res.json({ success: true });
    } else {
      res.json({ success: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ====================== وب‌هوک تلگرام (مهم!) ======================
app.post('/telegram-webhook', (req, res) => {
  console.log('Telegram Webhook دریافت شد', new Date().toISOString());
  bot.handleUpdate(req.body, res);
});

// ====================== API های سایت ======================
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'داده ناقص' });

  const session = sessions.get(sessionId);
  sessions.addMessage(sessionId, 'user', message);

  if (session.connectedToHuman) {
    return res.json({ operatorConnected: true, message: 'در حال انتقال...' });
  }

  const ai = await aiService.getResponse(message);
  if (ai.success && !ai.requiresHuman) {
    sessions.addMessage(sessionId, 'assistant', ai.message);
    res.json({ success: true, message: ai.message });
  } else {
    res.json({ success: false, requiresHuman: true });
  }
});

app.post('/api/connect-human', async (req, res) => {
  const { sessionId, userInfo } = req.body;
  const session = sessions.get(sessionId);
  session.userInfo = userInfo || {};

  await axios.post(`${BASE_URL}/webhook`, {
    event: 'new_session',
    data: { sessionId, userInfo, userMessage: 'درخواست اتصال به اپراتور' }
  }).catch(() => {});

  res.json({ success: true, pending: true });
});

app.post('/api/send-to-user', (req, res) => {
  const { sessionId, message } = req.body;
  sessions.addMessage(sessionId, 'operator', message);
  io.to(sessionId).emit('operator-message', { message });
  res.json({ success: true });
});

// صفحه اصلی
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====================== سوکت ======================
io.on('connection', socket => {
  socket.on('join-session', id => socket.join(id));
});

// ====================== راه‌اندازی سرور (بدون 429 و بدون Invalid URL) ======================
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`سرور روی پورت ${PORT} فعال شد`);

  if (!BASE_URL || !TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_ID) {
    console.log('متغیرها ناقص → Polling');
    bot.launch();
    return;
  }

  const webhookUrl = `${BASE_URL}/telegram-webhook`;
  try {
    const info = await bot.telegram.getWebhookInfo();
    if (info.url === webhookUrl) {
      console.log('وب‌هوک قبلاً درست تنظیم شده');
    } else {
      console.log('در حال تنظیم وب‌هوک...');
      await new Promise(r => setTimeout(r, 3000)); // جلوگیری از 429
      await bot.telegram.setWebhook(webhookUrl);
      console.log('وب‌هوک تنظیم شد:', webhookUrl);
    }
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `ربات آماده است\n${webhookUrl}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('خطا در وب‌هوک:', err.message);
    bot.launch(); // fallback
  }
});
