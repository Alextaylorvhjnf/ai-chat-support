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
BASE_URL = BASE_URL.replace(/\/+$/, '').trim();
if (!BASE_URL) BASE_URL = 'https://ai-chat-support-production.up.railway.app';
if (!BASE_URL.startsWith('http')) BASE_URL = 'https://' + BASE_URL;

// ==================== سرور ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== کش ====================
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
  await ctx.editMessageText(`
شما این گفتگو را پذیرفتید
کاربر: ${info.userInfo?.name || 'ناشناس'}
صفحه: ${info.userInfo?.page || 'نامشخص'}
کد: ${short}
  `.trim());

  io.to(info.fullId).emit('operator-connected', {
    message: 'اپراتور متصل شد! در حال انتقال به پشتیبان انسانی...'
  });

  const session = getSession(info.fullId);
  const history = session.messages
    .filter(m => m.role === 'user')
    .map(m => `کاربر: ${m.content}`)
    .join('\n\n') || 'کاربر هنوز پیامی نفرستاده';

  await ctx.reply(`تاریخچه چت:\n\n${history}`);
});

bot.action(/reject_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  botSessions.delete(short);
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

  const userName = userInfo?.name || 'ناشناس';
  const userPage = userInfo?.page ? userInfo.page : 'نامشخص';

  await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `
درخواست پشتیبانی جدید

کد جلسه: ${short}
نام: ${userName}
صفحه: ${userPage}
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

// ==================== اتصال به اپراتور ====================
app.post('/api/connect-human', async (req, res) => {
  const { sessionId, userInfo } = req.body;
  getSession(sessionId).userInfo = userInfo || {};

  await axios.post(`${BASE_URL}/webhook`, {
    event: 'new_session',
    data: { sessionId, userInfo, userMessage: 'درخواست اتصال' }
  }).catch(() => {});

  res.json({ success: true, pending: true });
});

// ==================== هوش مصنوعی — دقیق، فوری، حرفه‌ای ====================
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'داده ناقص' });

  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  const short = shortId(sessionId);
  if (botSessions.get(short)?.chatId) {
    return res.json({ operatorConnected: true });
  }

  const SHOP_API_URL = 'https://shikpooshaan.ir/ai-shop-api.php';

  // تشخیص کد پیگیری — فوق‌العاده دقیق
  const codeMatch = message.match(/\b(\d{5,})\b|کد\s*(\d+)|پیگیری\s*(\d+)/i);
  const isTrackingRequest = codeMatch || /\b(پیگیری|سفارش|کد|وضعیت|track|trk|order)\b/i.test(message);

  if (isTrackingRequest) {
    try {
      const code = codeMatch 
        ? (codeMatch[1] || codeMatch[2] || codeMatch[3])
        : message.replace(/\D/g, '').trim();

      if (!code || code.length < 4) {
        return res.json({ success: true, message: 'لطفاً کد پیگیری معتبر وارد کنید (مثلاً 67025)' });
      }

      const result = await axios.post(SHOP_API_URL, {
        action: 'track_order',
        tracking_code: code
      }, { timeout: 8000 });

      const data = result.data;
      let reply;

      if (data.found) {
        const status = data.order.status || 'نامشخص';
        const total = Number(data.order.total).toLocaleString();
        const date = data.order.date || 'نامشخص';
        const items = data.order.items?.join('\n') || 'ندارد';

        reply = `سفارش شما با کد پیگیری \`${code}\` پیدا شد!\n\n` +
                `وضعیت فعلی: **${status}**\n` +
                `مبلغ کل: ${total} تومان\n` +
                `تاریخ سفارش: ${date}\n` +
                `محصولات:\n${items}\n\n` +
                `هر سؤالی داشتید در خدمتم 😊`;

      } else {
        reply = `سفارش با کد \`${code}\` پیدا نشد.\n\n` +
                `ممکنه کد اشتباه باشه یا هنوز ثبت نشده باشه.\n` +
                `لطفاً کد رو دوباره چک کنید یا با اپراتور صحبت کنید.`;
      }

      session.messages.push({ role: 'assistant', content: reply });
      return res.json({ success: true, message: reply });

    } catch (err) {
      console.log('خطا در پیگیری سفارش:', err.message);
    }
  }

  // اگر درخواست پیگیری نبود — هوش مصنوعی عادی (Groq)
  if (GROQ_API_KEY) {
    try {
      const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'شما دستیار فروشگاه شیک پوشان (shikpooshaan.ir) هستید. فقط فارسی، مودب و حرفه‌ای جواب بده. اگر کاربر کد پیگیری داد، حتماً بگو از سیستم پیگیری می‌کنم.' },
          ...session.messages.slice(-10)
        ],
        temperature: 0.6,
        max_tokens: 500
      }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 12000 });

      const text = aiRes.data.choices[0].message.content.trim();
      session.messages.push({ role: 'assistant', content: text });
      return res.json({ success: true, message: text });
    } catch (err) {
      console.error('Groq خطا داد:', err.message);
    }
  }

  res.json({ success: false, requiresHuman: true });
});

// ==================== سوکت ====================
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => socket.join(sessionId));

  socket.on('user-message', async ({ sessionId, message }) => {
    if (!sessionId || !message) return;
    const short = shortId(sessionId);
    const info = botSessions.get(short);

    if (info?.chatId) {
      const userName = info.userInfo?.name || 'ناشناس';
      const userPage = info.userInfo?.page ? info.userInfo.page : 'نامشخص';

      await bot.telegram.sendMessage(info.chatId, `
پیام جدید از کاربر

کد: ${short}
نام: ${userName}
صفحه: ${userPage}

پیام:
${message}
      `.trim());
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
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `ربات آماده است\n${BASE_URL}`);
  } catch (err) {
    console.error('وب‌هوک خطا داد → Polling فعال شد');
    bot.launch();
  }
});
