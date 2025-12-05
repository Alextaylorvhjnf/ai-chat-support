const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const axios = require('axios');
const NodeCache = require('node-cache');
const mysql = require('mysql2/promise');
const { Telegraf } = require('telegraf');
require('dotenv').config();

// ==================== تنظیمات ====================
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID);

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'apmsho_shikpooshan';
const DB_PASSWORD = process.env.DB_PASSWORD || '5W2nn}@tkm8926G*';
const DB_NAME = process.env.DB_NAME || 'apmsho_shikpooshan';

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

// ==================== اتصال به MySQL ====================
let db;
async function initDB() {
  db = await mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  console.log('✅ MySQL connected');
}
initDB().catch(err => console.error('❌ MySQL connection failed:', err));

// ==================== الگوریتم هوش داخلی ====================
async function internalAI(message, session) {
  const keywords = ['لباس', 'پیراهن', 'شلوار', 'کفش', 'پیشنهاد'];

  // بررسی کلیدواژه‌ها
  const hasSuggestion = keywords.some(k => message.includes(k));

  if (hasSuggestion) {
    // گرفتن محصولات از دیتابیس WooCommerce
    try {
      const [rows] = await db.query(
        `SELECT post_title FROM wp_posts 
         WHERE post_type='product' AND post_status='publish' 
         ORDER BY RAND() LIMIT 3`
      );
      const suggestions = rows.map(r => r.post_title);
      return `عالی! پیشنهادهای من: ${suggestions.join(', ')} هستند. 😊`;
    } catch (err) {
      console.error(err);
      return 'الان نتونستم محصولات رو چک کنم 🙏';
    }
  }

  const greetings = ['سلام', 'درود', 'هی'];
  if (greetings.some(g => message.includes(g))) {
    return 'سلام دوست عزیز! 😄 چطوری؟ سفارش داری یا پیشنهاد لباس می‌خوای؟';
  }

  session.messages.push({ role: 'ai', content: 'در حال فکر...' });
  return 'جالب بود! 😊 بیشتر بگو، دوست دارم بدونم چی تو ذهنته.';
}

// ==================== ربات تلگرام ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// پذیرش و رد درخواست‌ها و ارسال پیام به اپراتور
bot.action(/accept_(.+)/, async (ctx) => { /* مشابه کد شما */ });
bot.action(/reject_(.+)/, async (ctx) => { /* مشابه کد شما */ });
bot.on('text', async (ctx) => { /* مشابه کد شما */ });
app.post('/telegram-webhook', (req, res) => bot.handleUpdate(req.body, res));

// ==================== وب‌هوک ویجت ====================
app.post('/webhook', async (req, res) => {
  if (req.body.event !== 'new_session') return res.json({ success: false });
  const { sessionId, userInfo, userMessage } = req.body.data;
  const short = shortId(sessionId);
  botSessions.set(short, { fullId: sessionId, userInfo: userInfo || {}, chatId: null });
  await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `درخواست پشتیبانی جدید\nکد جلسه: ${short}\nنام: ${userInfo?.name || 'ناشناس'}\nپیام: ${userMessage || 'درخواست اتصال'}`, {
    reply_markup: { inline_keyboard: [[
      { text: 'پذیرش', callback_data: `accept_${short}` },
      { text: 'رد', callback_data: `reject_${short}` }
    ]] }
  });
  res.json({ success: true });
});

// ==================== API چت ====================
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'داده ناقص' });
  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  // پاسخ هوش مصنوعی
  const aiReply = await internalAI(message, session);
  return res.json({ success: true, message: aiReply });
});

// ==================== سوکت‌ها ====================
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => socket.join(sessionId));
  socket.on('user-message', async ({ sessionId, message }) => {
    const short = shortId(sessionId);
    const info = botSessions.get(short);
    if (info?.chatId) {
      await bot.telegram.sendMessage(info.chatId, `پیام جدید: ${message}`);
    }
  });
});

// ==================== فایل ایندکس ====================
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== راه‌اندازی ====================
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ سرور روی پورت ${PORT} فعال شد`);
  try {
    await bot.telegram.setWebhook(`${BASE_URL}/telegram-webhook`);
    console.log('✅ وب‌هوک تنظیم شد:', `${BASE_URL}/telegram-webhook`);
  } catch (err) {
    console.error('❌ وب‌هوک خطا داد → Polling فعال شد');
    bot.launch();
  }
});
