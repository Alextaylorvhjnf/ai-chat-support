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
let BASE_URL = process.env.RAILWAY_STATIC_URL || process.env.BACKEND_URL || '';
BASE_URL = BASE_URL.replace(/\/+$/, '').trim();
if (!BASE_URL) BASE_URL = 'https://ai-chat-support-production.up.railway.app';
if (!BASE_URL.startsWith('http')) BASE_URL = 'https://' + BASE_URL;

const SHOP_API_URL = 'https://shikpooshaan.ir/ai-shop-api.php';

// ==================== سرور ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== کش و سشن ====================
const cache = new NodeCache({ stdTTL: 3600 });
const botSessions = new Map();
const shortId = (id) => String(id).substring(0, 12);

const getSession = (id) => {
  let s = cache.get(id);
  if (!s) {
    s = { id, messages: [], userInfo: {}, connectedToHuman: false };
    cache.set(id, s);
  }
  return s;
};

// ==================== ربات تلگرام ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.action(/accept_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  const info = botSessions.get(short);
  if (!info) return ctx.answerCbQuery('منقضی شده');
  botSessions.set(short, { ...info, chatId: ctx.chat.id });
  getSession(info.fullId).connectedToHuman = true;
  await ctx.answerCbQuery('پذیرفته شد');
  await ctx.editMessageText(`شما این گفتگو را پذیرفتید\nکاربر: ${info.userInfo?.name || 'ناشناس'}\nصفحه: ${info.userInfo?.page || 'نامشخص'}\nکد: ${short}`.trim());
  io.to(info.fullId).emit('operator-connected', { message: 'اپراتور متصل شد! در حال انتقال...' });

  const history = getSession(info.fullId).messages
    .filter(m => m.role === 'user')
    .map(m => `کاربر: ${m.content}`)
    .join('\n\n') || 'کاربر هنوز پیامی نفرستاده';
  await ctx.reply(`تاریخچه چت:\n\n${history}`);
});

bot.action(/reject_(.+)/, async (ctx) => {
  botSessions.delete(ctx.match[1]);
  await ctx.answerCbQuery('رد شد');
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const entry = [...botSessions.entries()].find(([_, v]) => v.chatId === ctx.chat.id);
  if (!entry) return;
  io.to(entry[1].fullId).emit('operator-message', { message: ctx.message.text });
  await ctx.reply('ارسال شد');
});

app.post('/telegram-webhook', (req, res) => bot.handleUpdate(req.body, res));

// ==================== وب‌هوک ویجت ====================
app.post('/webhook', async (req, res) => {
  if (req.body.event !== 'new_session') return res.json({ success: false });
  const { sessionId, userInfo, userMessage } = req.body.data;
  const short = shortId(sessionId);
  botSessions.set(short, { fullId: sessionId, userInfo: userInfo || {}, chatId: null });

  await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `
درخواست پشتیبانی جدید
کد جلسه: ${short}
نام: ${userInfo?.name || 'ناشناس'}
صفحه: ${userInfo?.page || 'نامشخص'}
پیام اول: ${userMessage || 'درخواست اتصال'}
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

app.post('/api/connect-human', async (req, res) => {
  const { sessionId, userInfo } = req.body;
  getSession(sessionId).userInfo = userInfo || {};
  await axios.post(`${BASE_URL}/webhook`, {
    event: 'new_session',
    data: { sessionId, userInfo, userMessage: 'درخواست اتصال' }
  }).catch(() => {});
  res.json({ success: true, pending: true });
});

// ==================== چت اصلی + پیگیری سفارش دقیق ====================
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'داده ناقص' });

  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  const short = shortId(sessionId);
  if (botSessions.get(short)?.chatId) {
    return res.json({ operatorConnected: true });
  }

  const cleanMsg = message.trim();
  const code = cleanMsg.replace(/\D/g, '');

  // تشخیص خودکار کد رهگیری
  if (code.length >= 4 || /پیگیری|سفارش|کد|وضعیت|رهگیری/i.test(cleanMsg)) {
    if (code.length < 4) {
      return res.json({ success: true, message: 'لطفاً کد رهگیری معتبر وارد کنید (مثلاً 67025)' });
    }

    try {
      const result = await axios.post(SHOP_API_URL, { action: 'track_order', tracking_code: code }, { timeout: 10000 });
      const d = result.data;

      if (d.found) {
        const o = d.order;
        const items = o.items.map(i => `• ${i}`).join('\n') || 'ندارد';

        const reply = `سفارش شما با کد رهگیری **${o.tracking_code}** پیدا شد!

وضعیت فعلی: **${o.status}**
مبلغ کل: **${o.total}**
تاریخ سفارش: ${o.date}
نام مشتری: ${o.customer || 'ثبت نشده'}

محصولات:
${items}

روش پرداخت: ${o.payment}

هر سؤالی دارید خوشحال می‌شم کمک کنم`;

        session.messages.push({ role: 'assistant', content: reply });
        return res.json({ success: true, message: reply });
      } else {
        return res.json({ success: true, message: `سفارشی با کد **${code}** پیدا نشد.\nلطفاً کد را دقیق چک کنید.` });
      }
    } catch (err) {
      console.log('خطا در پیگیری سفارش:', err.message);
      return res.json({ success: true, message: 'در حال حاضر امکان بررسی سفارش وجود ندارد.\nلطفاً چند دقیقه دیگر تلاش کنید.' });
    }
  }

  // پیام پیش‌فرض
  const defaultReply = `سلام! چطور می‌تونم کمکتون کنم؟

می‌تونید:
• کد رهگیری سفارش رو بفرستید تا وضعیتش رو بگم
• نام محصول رو بنویسید تا قیمت و موجودی رو بگم
• یا مستقیم با اپراتور صحبت کنید`;

  session.messages.push({ role: 'assistant', content: defaultReply });
  res.json({ success: true, message: defaultReply });
});

// ==================== سوکت ====================
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => socket.join(sessionId));
  socket.on('user-message', async ({ sessionId, message }) => {
    const short = shortId(sessionId);
    const info = botSessions.get(short);
    if (info?.chatId) {
      await bot.telegram.sendMessage(info.chatId, `
پیام جدید از کاربر
کد: ${short}
نام: ${info.userInfo?.name || 'ناشناس'}
صفحه: ${info.userInfo?.page || 'نامشخص'}

پیام:
${message}
      `.trim());
    }
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== راه‌اندازی ====================
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`سرور کاملاً فعال شد → ${BASE_URL}:${PORT}`);
  try {
    await bot.telegram.setWebhook(`${BASE_URL}/telegram-webhook`);
    console.log('وب‌هوک تلگرام تنظیم شد');
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `ویجت شیک‌پوشان آماده است!\n${BASE_URL}`);
  } catch (err) {
    console.error('وب‌هوک خطا → Polling فعال شد');
    bot.launch();
  }
});
