// ==================== IMPORTS ====================
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const axios = require('axios');
const NodeCache = require('node-cache');
const { Telegraf } = require('telegraf');
const mysql = require('mysql2/promise');
require('dotenv').config();

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID);
let BASE_URL = process.env.RAILWAY_STATIC_URL || process.env.BACKEND_URL || '';
BASE_URL = BASE_URL.replace(/\/+$/, '').trim();
if (!BASE_URL) BASE_URL = 'https://ai-chat-support-production.up.railway.app';
if (!BASE_URL.startsWith('http')) BASE_URL = 'https://' + BASE_URL;

// ==================== DATABASE ====================
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || '';

let db;
(async () => {
  try {
    db = await mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    });
    console.log('✅ دیتابیس متصل شد');
  } catch (err) {
    console.error('❌ خطا در اتصال دیتابیس:', err);
  }
})();

// ==================== EXPRESS + SOCKET ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== CACHE & SESSIONS ====================
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

// ==================== INTERNAL AI ====================
async function internalAI(message, session) {
  // بررسی کلمات کلیدی
  const keywords = ['لباس', 'پیراهن', 'شلوار', 'کفش', 'پیشنهاد', 'سفارش', 'کد رهگیری'];
  const hasSuggestion = keywords.some(k => message.includes(k));

  // اگر درخواست محصول یا پیشنهاد بود
  if (hasSuggestion && db) {
    try {
      // استخراج رنگ و سایز
      const colorMatch = message.match(/(قرمز|آبی|سفید|مشکی|سبز|زرد|نارنجی|صورتی)/i);
      const sizeMatch = message.match(/(S|M|L|XL|XXL|\d{1,3})/i);
      const color = colorMatch ? colorMatch[0] : null;
      const size = sizeMatch ? sizeMatch[0] : null;
      const keyword = message.replace(new RegExp(`(${[...['قرمز','آبی','سبز','سفید','مشکی','زرد','نارنجی','صورتی'], ...['S','M','L','XL','XXL']].join('|')})`, 'gi'), '').trim();

      // کوئری محصولات
      let query = `SELECT p.ID, p.post_title, pm_color.meta_value AS color, pm_size.meta_value AS size,
                          pm_price.meta_value AS price, pm_stock.meta_value AS stock
                   FROM wp_posts p
                   LEFT JOIN wp_postmeta pm_color ON pm_color.post_id=p.ID AND pm_color.meta_key='attribute_pa_color'
                   LEFT JOIN wp_postmeta pm_size ON pm_size.post_id=p.ID AND pm_size.meta_key='attribute_pa_size'
                   LEFT JOIN wp_postmeta pm_price ON pm_price.post_id=p.ID AND pm_price.meta_key='_price'
                   LEFT JOIN wp_postmeta pm_stock ON pm_stock.post_id=p.ID AND pm_stock.meta_key='_stock_status'
                   WHERE p.post_type='product' AND p.post_status='publish'`;

      if (keyword) query += ` AND p.post_title LIKE '%${keyword}%'`;
      if (color) query += ` AND pm_color.meta_value LIKE '%${color}%'`;
      if (size) query += ` AND pm_size.meta_value LIKE '%${size}%'`;
      query += ` ORDER BY p.ID DESC LIMIT 5`;

      const [rows] = await db.query(query);
      if (rows.length > 0) {
        let reply = 'محصولات پیشنهادی بر اساس درخواست شما:\n\n';
        rows.forEach(p => {
          reply += `🛍 ${p.post_title}\nرنگ: ${p.color||'-'} | سایز: ${p.size||'-'} | قیمت: ${p.price||'-'} تومان | موجودی: ${p.stock||'-'}\nلینک: ${BASE_URL}/?p=${p.ID}\n\n`;
        });
        return reply.trim();
      } else {
        return 'متاسفم 😔 محصولی مطابق مشخصات شما پیدا نشد. می‌خوای رنگ یا سایز دیگری امتحان کنیم؟';
      }
    } catch (err) {
      console.error('خطا در جستجوی محصول:', err);
      return 'خطا در دریافت اطلاعات محصولات. لطفاً بعدا تلاش کنید.';
    }
  }

  // پاسخ سلام و احوالپرسی
  const greetings = ['سلام', 'درود', 'هی'];
  if (greetings.some(g => message.includes(g))) {
    return 'سلام دوست عزیز! 😄 چطوری؟ در مورد چی حرف بزنیم؟ سفارش داری یا پیشنهاد لباس می‌خوای؟';
  }

  session.messages.push({ role: 'ai', content: 'در حال فکر...' });
  return 'جالب بود! 😊 بیشتر بگو، دوست دارم بدونم چی تو ذهنته. یا کد رهگیری بفرست.';
}

// ==================== TELEGRAM BOT ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// پذیرش درخواست اپراتور
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
آی‌پی: ${info.userInfo?.ip || 'نامشخص'}
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

// رد درخواست اپراتور
bot.action(/reject_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  botSessions.delete(short);
  await ctx.answerCbQuery('رد شد');
});

// پیام اپراتور → ویجت
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const entry = [...botSessions.entries()].find(([_, v]) => v.chatId === ctx.chat.id);
  if (!entry) return;
  io.to(entry[1].fullId).emit('operator-message', { message: ctx.message.text });
  await ctx.reply('ارسال شد');
});

// وب‌هوک تلگرام
app.post('/telegram-webhook', (req, res) => bot.handleUpdate(req.body, res));

// ==================== WEBHOOK ویجت ====================
app.post('/webhook', async (req, res) => {
  if (req.body.event !== 'new_session') return res.json({ success: false });
  const { sessionId, userInfo, userMessage } = req.body.data;
  const short = shortId(sessionId);
  botSessions.set(short, { fullId: sessionId, userInfo: userInfo || {}, chatId: null });
  const userName = userInfo?.name || 'ناشناس';
  const userPage = userInfo?.page ? userInfo.page : 'نامشخص';
  const userIp = userInfo?.ip ? userInfo.ip : 'نامشخص';
  await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `
درخواست پشتیبانی جدید
کد جلسه: ${short}
نام: ${userName}
صفحه: ${userPage}
آی‌پی: ${userIp}
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

// ==================== CONNECT HUMAN API ====================
app.post('/api/connect-human', async (req, res) => {
  const { sessionId, userInfo } = req.body;
  getSession(sessionId).userInfo = userInfo || {};
  await axios.post(`${BASE_URL}/webhook`, {
    event: 'new_session',
    data: { sessionId, userInfo, userMessage: 'درخواست اتصال' }
  }).catch(() => {});
  res.json({ success: true, pending: true });
});

// ==================== CHAT API ====================
const SHOP_API_URL = 'https://shikpooshaan.ir/ai-shop-api.php';
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'داده ناقص' });
  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });
  const short = shortId(sessionId);

  if (botSessions.get(short)?.chatId) {
    return res.json({ operatorConnected: true });
  }

  // بررسی کد رهگیری سفارش
  const code = message.match(/\d{4,}/)?.[0];
  if (code) {
    try {
      const result = await axios.post(SHOP_API_URL, { action: 'track_order', tracking_code: code }, { timeout: 8000 });
      const data = result.data;
      if (data.found) {
        const items = data.order.items.join('\n');
        const total = Number(data.order.total).toLocaleString();
        const reply = `سلام ${data.order.customer_name || 'عزیز'}!\n\n` +
                      `سفارش با کد \`${code}\` پیدا شد!\n\n` +
                      `وضعیت: **${data.order.status}**\n` +
                      `تاریخ ثبت: ${data.order.date}\n` +
                      `درگاه پرداخت: ${data.order.payment}\n` +
                      `مبلغ: ${total} تومان\n` +
                      `محصولات:\n${items}\n\n` +
                      `به‌زودی براتون ارسال می‌شه 😊`;
        return res.json({ success: true, message: reply });
      } else {
        return res.json({ success: true, message: `سفارش با کد \`${code}\` پیدا نشد. لطفاً کد رهگیری را دوباره بررسی کنید 🙏` });
      }
    } catch (err) {
      return res.json({ success: true, message: 'الان نتونستم سفارش رو چک کنم 🙏\nچند لحظه دیگر امتحان کنید' });
    }
  }

  const aiReply = await internalAI(message, session);
  return res.json({ success: true, message: aiReply });
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => socket.join(sessionId));

  socket.on('user-message', async ({ sessionId, message }) => {
    if (!sessionId || !message) return;
    const short = shortId(sessionId);
    const info = botSessions.get(short);
    if (info?.chatId) {
      const userName = info.userInfo?.name || 'ناشناس';
      const userPage = info.userInfo?.page || 'نامشخص';
      const userIp = info.userInfo?.ip || 'نامشخص';
      await bot.telegram.sendMessage(info.chatId, `
پیام جدید از کاربر
کد: ${short}
نام: ${userName}
صفحه: ${userPage}
آی‌پی: ${userIp}
پیام:
${message}
      `.trim());
    }
  });

  socket.on('user-file', async ({ sessionId, fileName, fileBase64 }) => {
    const short = shortId(sessionId);
    const info = botSessions.get(short);
    if (info?.chatId) {
      const buffer = Buffer.from(fileBase64, 'base64');
      await bot.telegram.sendDocument(info.chatId, { source: buffer, filename: fileName });
    }
  });

  socket.on('user-voice', async ({ sessionId, voiceBase64 }) => {
    const short = shortId(sessionId);
    const info = botSessions.get(short);
    if (info?.chatId) {
      const buffer = Buffer.from(voiceBase64, 'base64');
      await bot.telegram.sendVoice(info.chatId, { source: buffer });
    }
  });
});

// ==================== CATCH-ALL ====================
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== START SERVER ====================
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
