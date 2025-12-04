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

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
let BASE_URL = process.env.RAILWAY_STATIC_URL || process.env.BACKEND_URL || 'https://ai-chat-support-production.up.railway.app';
BASE_URL = BASE_URL.replace(/\/+$/, '').trim();
if (!BASE_URL.startsWith('http')) BASE_URL = 'https://' + BASE_URL;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

const cache = new NodeCache({ stdTTL: 3600 });
const botSessions = new Map();
const shortId = (id) => String(id).substring(0, 12);
const getSession = (id) => {
  let s = cache.get(id);
  if (!s) {
    s = { id, messages: [], userInfo: {}, connectedToHuman: false, waitingForConfirm: false, pendingOrder: null };
    cache.set(id, s);
  }
  return s;
};

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.action(/accept_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  const info = botSessions.get(short);
  if (!info) return ctx.answerCbQuery('منقضی شده');
  botSessions.set(short, { ...info, chatId: ctx.chat.id });
  getSession(info.fullId).connectedToHuman = true;
  await ctx.answerCbQuery('پذیرفته شد');
  await ctx.editMessageText(`شما این گفتگو را پذیرفتید\nکاربر: ${info.userInfo?.name || 'ناشناس'}\nکد: ${short}`);
  io.to(info.fullId).emit('operator-connected', { message: 'اپراتور متصل شد!' });
  const session = getSession(info.fullId);
  const history = session.messages.filter(m => m.role === 'user').map(m => `کاربر: ${m.content}`).join('\n\n') || 'هیچ پیامی نیست';
  await ctx.reply(`تاریخچه چت:\n\n${history}`);
});

bot.action(/reject_(.+)/, async (ctx) => {
  const short = ctx.match[1];
  botSessions.delete(short);
  await ctx.answerCbQuery('رد شد');
});

bot.action(/confirm_status_(.+)/, async (ctx) => {
  const code = ctx.match[1];
  const short = shortId(ctx.callbackQuery.message.text.match(/کد: (\w+)/)?.[1] || '');
  const info = botSessions.get(short);
  if (!info) return ctx.answerCbQuery('منقضی شده');
  const session = getSession(info.fullId);
  if (session.pendingOrder?.code === code) {
    const order = session.pendingOrder.data;
    const status = order.status || 'نامشخص';
    const reply = `وضعیت فعلی سفارش شما:\n\n` +
                  `کد پیگیری: \`${code}\`\n` +
                  `وضعیت: **${status}**\n` +
                  `تاریخ سفارش: ${order.date}\n` +
                  `درگاه پرداخت: ${order.payment}\n\n` +
                  `سفارش شما ${status === 'در حال پردازش' ? 'در حال آماده‌سازی است' :
                    status === 'ارسال شده' ? 'توسط پست ارسال شده' :
                    status === 'تکمیل شده' ? 'با موفقیت تحویل شده' :
                    'در مرحله ' + status + ' قرار دارد'}\n\n` +
                  `اگر سؤال دیگه‌ای دارید، خوشحال می‌شم کمک کنم 😊`;
    session.waitingForConfirm = false;
    delete session.pendingOrder;
    session.messages.push({ role: 'assistant', content: reply });
    io.to(info.fullId).emit('assistant-message', { message: reply });
    await ctx.answerCbQuery('ارسال شد');
    await ctx.reply('وضعیت به کاربر ارسال شد ✅');
  }
});

bot.action('cancel_status', async (ctx) => {
  const short = shortId(ctx.callbackQuery.message.text.match(/کد: (\w+)/)?.[1] || '');
  const info = botSessions.get(short);
  if (!info) return ctx.answerCbQuery('منقضی شده');
  const session = getSession(info.fullId);
  session.waitingForConfirm = false;
  delete session.pendingOrder;
  const reply = 'باشه! اگر سؤال دیگه‌ای داشتید، در خدمتم 😊';
  session.messages.push({ role: 'assistant', content: reply });
  io.to(info.fullId).emit('assistant-message', { message: reply });
  await ctx.answerCbQuery('لغو شد');
  await ctx.reply('لغو به کاربر اطلاع داده شد ✅');
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const entry = [...botSessions.entries()].find(([_, v]) => v.chatId === ctx.chat.id);
  if (!entry) return;
  io.to(entry[1].fullId).emit('operator-message', { message: ctx.message.text });
  await ctx.reply('ارسال شد ✅');
});

app.post('/telegram-webhook', (req, res) => bot.handleUpdate(req.body, res));

app.post('/webhook', async (req, res) => {
  if (req.body.event !== 'new_session') return res.json({ success: false });
  const { sessionId, userInfo, userMessage } = req.body.data;
  const short = shortId(sessionId);
  botSessions.set(short, { fullId: sessionId, userInfo: userInfo || {}, chatId: null });
  const name = userInfo?.name || 'ناشناس';
  const page = userInfo?.page || 'نامشخص';
  await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `
درخواست جدید
کد: ${short}
نام: ${name}
صفحه: ${page}
پیام: ${userMessage || 'درخواست اتصال'}
  `.trim(), {
    reply_markup: { inline_keyboard: [[
      { text: 'پذیرش', callback_data: `accept_${short}` },
      { text: 'رد', callback_data: `reject_${short}` }
    ]] }
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
  const msg = message.trim();
  const codeMatch = msg.match(/\b(\d{5,})\b|کد\s*(\d+)|پیگیری\s*(\d+)/i);
  const isTrackingRequest = codeMatch || /\b(پیگیری|سفارش|کد|وضعیت|track)\b/i.test(msg);
  if (isTrackingRequest && !session.waitingForConfirm) {
    try {
      const code = codeMatch ? (codeMatch[1] || codeMatch[2] || codeMatch[3]) : msg.replace(/\D/g, '').trim();
      if (!code || code.length < 4) {
        return res.json({ success: true, message: 'لطفاً کد پیگیری معتبر وارد کنید (مثلاً 67025)' });
      }
      const result = await axios.post(SHOP_API_URL, { action: 'track_order', tracking_code: code }, { timeout: 8000 });
      const data = result.data;
      if (data.found) {
        const items = data.order.items?.join('\n') || 'ندارد';
        const total = Number(data.order.total).toLocaleString();
        const reply = `سفارش با کد \`${code}\` پیدا شد!\n\n` +
                      `نام مشتری: **${data.order.customer_name || 'مشتری عزیز'}**\n` +
                      `محصولات:\n${items}\n` +
                      `مبلغ کل: ${total} تومان\n\n` +
                      `آیا می‌خواهید وضعیت دقیق سفارش را بدانید؟`;
        session.pendingOrder = { code, data: data.order };
        session.waitingForConfirm = true;
        return res.json({
          success: true,
          message: reply,
          buttons: [
            [{ text: 'بله، وضعیت دقیق را بگو', callback_data: `confirm_status_${code}` }],
            [{ text: 'خیر، ممنون', callback_data: 'cancel_status' }]
          ]
        });
      } else {
        return res.json({ success: true, message: `سفارش با کد \`${code}\` پیدا نشد.\nلطفاً کد را چک کنید یا با اپراتور صحبت کنید.` });
      }
    } catch (err) {
      console.log('خطا در پیگیری:', err.message);
      return res.json({ success: true, message: 'در حال حاضر نمی‌تونم سفارش رو پیدا کنم. لطفاً با اپراتور صحبت کنید.' });
    }
  }
  if (msg.toLowerCase().includes('بله') && session.waitingForConfirm && session.pendingOrder) {
    const order = session.pendingOrder.data;
    const status = order.status || 'نامشخص';
    const finalReply = `وضعیت فعلی سفارش شما:\n\n` +
                       `کد پیگیری: \`${session.pendingOrder.code}\`\n` +
                       `وضعیت: **${status}**\n` +
                       `تاریخ سفارش: ${order.date}\n` +
                       `درگاه پرداخت: ${order.payment}\n\n` +
                       `سفارش شما ${status === 'در حال پردازش' ? 'در حال آماده‌سازی است' :
                         status === 'ارسال شده' ? 'توسط پست ارسال شده' :
                         status === 'تکمیل شده' ? 'با موفقیت تحویل شده' :
                         'در مرحله ' + status + ' قرار دارد'}\n\n` +
                       `اگر سؤال دیگه‌ای دارید، خوشحال می‌شم کمک کنم 😊`;
    session.waitingForConfirm = false;
    delete session.pendingOrder;
    session.messages.push({ role: 'assistant', content: finalReply });
    return res.json({ success: true, message: finalReply });
  }
  if (msg.toLowerCase().includes('خیر') || msg.includes('ممنون') && session.waitingForConfirm) {
    session.waitingForConfirm = false;
    delete session.pendingOrder;
    return res.json({ success: true, message: 'باشه! اگر سؤال دیگه‌ای داشتید، در خدمتم 😊' });
  }
  if (GROQ_API_KEY) {
    try {
      const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'شما دستیار فروشگاه شیک پوشان هستید. فقط فارسی، مودب و حرفه‌ای جواب بده. پاسخ‌ها کوتاه، دقیق و بر اساس قوانین فروشگاه باشند. اگر سؤال درباره سفارش است، کد پیگیری بخواه. برای محصولات، لینک دسته بده. هوشمندانه تشخیص بده و بدون اختراع اطلاعات.' },
          ...session.messages.slice(-10)
        ],
        temperature: 0.6,
        max_tokens: 500
      }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}` } });
      const text = aiRes.data.choices[0].message.content.trim();
      session.messages.push({ role: 'assistant', content: text });
      return res.json({ success: true, message: text });
    } catch (err) {
      console.error('Groq error:', err.message);
    }
  }
  return res.json({ success: true, message: `سلام! 😊 من دستیار فروشگاه شیک پوشانم. برای پیگیری سفارش، کد رهگیری بفرست. هر سؤالی داری بپرس!` });
});

io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => socket.join(sessionId));
  socket.on('user-message', async ({ sessionId, message }) => {
    if (!sessionId || !message) return;
    const short = shortId(sessionId);
    const info = botSessions.get(short);
    if (info?.chatId) {
      const name = info.userInfo?.name || 'ناشناس';
      const page = info.userInfo?.page || 'نامشخص';
      await bot.telegram.sendMessage(info.chatId, `
پیام جدید از کاربر
کد: ${short}
نام: ${name}
صفحه: ${page}
پیام: ${message}
      `.trim());
    }
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`دستیار فروشگاه فعال شد — پورت ${PORT}`);
  try {
    await bot.telegram.setWebhook(`${BASE_URL}/telegram-webhook`);
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `دستیار فروشگاه فعال شد ✅\n${BASE_URL}`);
  } catch (err) {
    console.error('Webhook error:', err.message);
    bot.launch();
  }
});
