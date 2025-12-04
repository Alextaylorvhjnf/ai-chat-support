const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();
const express = require('express');

console.log('='.repeat(60));
console.log('TELEGRAM BOT - با نمایش صفحه کاربر');
console.log('='.repeat(60));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Validate
if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_ID) {
  console.error('Missing Telegram configuration');
  process.exit(1);
}

console.log('Bot configured');
console.log('Admin:', ADMIN_TELEGRAM_ID);
console.log('Backend:', BACKEND_URL);

// Session storage
const sessions = new Map();     // shortId → { fullId, userInfo, status, createdAt, operatorChatId }
const userSessions = new Map(); // chatId → shortId

// Helper functions
function generateShortId(sessionId) {
  return sessionId.substring(0, 12);
}

function storeSession(sessionId, userInfo) {
  const shortId = generateShortId(sessionId);
  sessions.set(shortId, {
    fullId: sessionId,
    userInfo,
    status: 'pending',
    createdAt: new Date()
  });
  return shortId;
}

// Create bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Start command
bot.start((ctx) => {
  const welcomeMessage = `*پنل اپراتور پشتیبانی*\n\n` +
    `سلام ${ctx.from.first_name || 'اپراتور'}!\n\n` +
    `سیستم آماده دریافت پیام‌هاست\n\n` +
    `*دستورات:*\n` +
    `/sessions - جلسات فعال\n` +
    `/help - راهنما`;

  ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    ...Markup.keyboard([['جلسات فعال', 'راهنما']]).resize()
  });
});

// Sessions command (اختیاری – فقط برای تست)
bot.command('sessions', async (ctx) => {
  try {
    const res = await axios.get(`${BACKEND_URL}/api/sessions`);
    const list = res.data.sessions || [];
    if (!list.length) return ctx.reply('*هیچ جلسه فعالی نیست*', { parse_mode: 'Markdown' });

    let msg = `*جلسات فعال (${list.length}):*\n\n`;
    list.forEach((s, i) => {
      const short = generateShortId(s.id);
      const mins = Math.floor((Date.now() - new Date(s.createdAt)) / 60000);
      msg += `${i + 1}. \`${short}\` – ${s.userInfo?.name || 'ناشناس'} – ${mins} دقیقه\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    ctx.reply('خطا در دریافت جلسات');
  }
});

// ────────────────── درخواست جدید (با نمایش صفحه) ──────────────────
async function handleNewUserSession(sessionId, userInfo, userMessage) {
  try {
    const shortId = storeSession(sessionId, userInfo);

    const pageUrl = userInfo.page ? userInfo.page : 'نامشخص';

    const operatorMessage = `*درخواست اتصال جدید*\n\n` +
      `کد: \`${shortId}\`\n` +
      `کاربر: ${userInfo.name || 'کاربر سایت'}\n` +
      `صفحه: ${pageUrl}\n` +                         // ← اضافه شد
      `پیام اول: ${userMessage.substring(0, 150)}${userMessage.length > 150 ? '...' : ''}\n\n` +
      `برای پذیرش گفتگو کلیک کنید:`;

    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, operatorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('بله، می‌پذیرم', `accept_${shortId}`),
          Markup.button.callback('نه، رد کن', `reject_${shortId}`)
        ]
      ])
    });

    console.log(`نوتیفیکیشن جدید ارسال شد: ${shortId}`);
    return true;
  } catch (error) {
    console.error('Error sending notification:', error.message);
    return false;
  }
}

// Accept
bot.action(/accept_(.+)/, async (ctx) => {
  const shortId = ctx.match[1];
  const session = sessions.get(shortId);
  if (!session) return ctx.answerCbQuery('جلسه پیدا نشد');

  session.status = 'accepted';
  session.operatorChatId = ctx.chat.id;
  userSessions.set(ctx.chat.id, shortId);

  await ctx.answerCbQuery('گفتگو پذیرفته شد');
  await ctx.editMessageText(
    ctx.callbackQuery.message.text + '\n\n*شما این گفتگو را پذیرفتید*\nاکنون می‌توانید پیام بفرستید.',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([]) }
  );

  // اطلاع به ویجت
  await axios.post(`${BACKEND_URL}/webhook`, {
    event: 'operator_accepted',
    data: { sessionId: session.fullId }
  }).catch(() => {});
});

// Reject
bot.action(/reject_(.+)/, async (ctx) => {
  const shortId = ctx.match[1];
  if (!sessions.has(shortId)) return ctx.answerCbQuery('جلسه پیدا نشد');

  sessions.delete(shortId);
  await ctx.answerCbQuery('گفتگو رد شد');
  await ctx.editMessageText(
    ctx.callbackQuery.message.text + '\n\n*گفتگو رد شد*',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([]) }
  );

  await axios.post(`${BACKEND_URL}/webhook`, {
    event: 'operator_rejected',
    data: { sessionId: getFullSessionId(shortId) }
  }).catch(() => {});
});

// پیام اپراتور → کاربر
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  const shortId = userSessions.get(ctx.chat.id);
  if (!shortId) return;

  const session = sessions.get(shortId);
  if (!session || session.status !== 'accepted') return;

  try {
    await axios.post(`${BACKEND_URL}/api/send-to-user`, {
      sessionId: session.fullId,
      message: ctx.message.text
    });
    ctx.reply('پیام ارسال شد');
  } catch (e) {
    ctx.reply('خطا در ارسال');
  }
});

// ────────────────── وب‌هوک اصلی (با نمایش صفحه در پیام کاربر) ──────────────────
const app = express();
app.use(express.json());
const webhookPort = process.env.TELEGRAM_PORT || 3001;

app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;

  try {
    switch (event) {
      case 'new_session':
        const ok = await handleNewUserSession(
          data.sessionId,
          data.userInfo || {},
          data.userMessage || 'درخواست اتصال'
        );
        res.json({ success: ok });
        break;

      case 'user_message':
        const shortId = generateShortId(data.sessionId);
        const session = sessions.get(shortId);

        if (session && session.operatorChatId) {
          const pageUrl = data.userInfo?.page ? data.userInfo.page : 'نامشخص';

          await bot.telegram.sendMessage(session.operatorChatId,
            `*پیام جدید از کاربر*\n\n` +
            `کد: \`${shortId}\`\n` +
            `کاربر: ${data.userName || session.userInfo?.name || 'کاربر سایت'}\n` +
            `صفحه: ${pageUrl}\n\n` +                // ← اضافه شد
            `پیام:\n${data.message}\n\n` +
            `برای پاسخ مستقیماً پیام بنویسید...`,
            { parse_mode: 'Markdown' }
          );
          res.json({ success: true });
        } else {
          res.json({ success: false, error: 'No operator assigned' });
        }
        break;

      case 'session_ended':
        const sid = generateShortId(data.sessionId);
        const s = sessions.get(sid);
        if (s && s.operatorChatId) {
          await bot.telegram.sendMessage(s.operatorChatId,
            `*جلسه به پایان رسید*\nکد: \`${sid}\``, { parse_mode: 'Markdown' });
          sessions.delete(sid);
          userSessions.delete(s.operatorChatId);
        }
        res.json({ success: true });
        break;

      default:
        res.json({ success: false, error: 'Unknown event' });
    }
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// راه‌اندازی
async function startBot() {
  try {
    const domain = process.env.RAILWAY_STATIC_URL || process.env.TELEGRAM_BOT_URL;
    if (domain) {
      const url = `${domain}/telegram-webhook`;
      await bot.telegram.setWebhook(url);
      app.post('/telegram-webhook', (req, res) => bot.handleUpdate(req.body, res));
      console.log(`Webhook تنظیم شد: ${url}`);
    } else {
      bot.launch();
      console.log('Polling فعال شد');
    }

    app.listen(webhookPort, () => {
      console.log(`سرور تلگرام روی پورت ${webhookPort} فعال شد`);
      bot.telegram.sendMessage(ADMIN_TELEGRAM_ID,
        `*ربات پشتیبانی فعال شد*\n${new Date().toLocaleString('fa-IR')}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    });
  } catch (e) {
    console.error('خطا در راه‌اندازی:', e.message);
    process.exit(1);
  }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
startBot();
