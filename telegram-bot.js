#!/usr/bin/env node
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
const BACKEND_URL = process.env.BACKEND_URL;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30');

if (!BOT_TOKEN || !ADMIN_ID || !BACKEND_URL || !WEBHOOK_URL) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

// ================ SESSION STORAGE ================
const sessions = new Map();   // shortId -> { fullId, userInfo, status, operatorChatId, createdAt }
const userSessions = new Map(); // chatId -> shortId

function generateShortId(id) {
  return id.slice(0, 12);
}

function storeSession(sessionId, userInfo) {
  const shortId = generateShortId(sessionId);
  sessions.set(shortId, { fullId: sessionId, userInfo, status: 'pending', createdAt: new Date() });
  return shortId;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [shortId, session] of sessions.entries()) {
    if ((now - new Date(session.createdAt).getTime()) / 60000 > SESSION_TIMEOUT) {
      sessions.delete(shortId);
      if (session.operatorChatId) userSessions.delete(session.operatorChatId);
    }
  }
}
setInterval(cleanupExpiredSessions, 60000); // check every minute

// ================= TELEGRAM BOT ==================
const bot = new Telegraf(BOT_TOKEN);

// Start command
bot.start(ctx => ctx.reply(`👋 سلام ${ctx.from.first_name || 'اپراتور'}!\n✅ سیستم آماده دریافت پیام‌هاست`));

// Sessions command
bot.command('sessions', async ctx => {
  const list = Array.from(sessions.values());
  if (!list.length) return ctx.reply('📭 هیچ جلسه فعالی وجود ندارد');

  let msg = `📊 جلسات فعال (${list.length}):\n`;
  list.forEach((s, i) => {
    const duration = Math.floor((Date.now() - new Date(s.createdAt)) / 60000);
    msg += `${i + 1}. \`${generateShortId(s.fullId)}\` | ${s.userInfo?.name || 'ناشناس'} | ⏱️ ${duration} دقیقه | ${s.status === 'accepted' ? '✅' : '⏳'}\n`;
  });
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Handle new user session
async function handleNewSession(sessionId, userInfo, userMessage) {
  const shortId = storeSession(sessionId, userInfo);
  const msg = `🔔 درخواست اتصال جدید\n🎫 کد: \`${shortId}\`\n👤 ${userInfo.name || 'کاربر'}\n💬 ${userMessage.substring(0, 100)}`;
  await bot.telegram.sendMessage(ADMIN_ID, msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ پذیرش', `accept_${shortId}`), Markup.button.callback('❌ رد', `reject_${shortId}`)]
    ])
  });
}

// Accept callback
bot.action(/accept_(.+)/, async ctx => {
  const shortId = ctx.match[1];
  const session = sessions.get(shortId);
  if (!session) return ctx.answerCbQuery('❌ جلسه پیدا نشد');

  session.status = 'accepted';
  session.operatorChatId = ctx.chat.id;
  userSessions.set(ctx.chat.id, shortId);

  await ctx.answerCbQuery('✅ گفتگو قبول شد');
  await ctx.editMessageText(ctx.callbackQuery.message.text + '\n✅ شما این گفتگو را قبول کردید', { parse_mode: 'Markdown' });
  await axios.post(`${BACKEND_URL}/webhook`, { event: 'operator_accepted', data: { sessionId: session.fullId, operatorId: ctx.chat.id } }).catch(console.error);
});

// Reject callback
bot.action(/reject_(.+)/, async ctx => {
  const shortId = ctx.match[1];
  const session = sessions.get(shortId);
  if (!session) return ctx.answerCbQuery('❌ جلسه پیدا نشد');

  sessions.delete(shortId);
  await ctx.answerCbQuery('❌ گفتگو رد شد');
  await ctx.editMessageText(ctx.callbackQuery.message.text + '\n❌ شما این گفتگو را رد کردید', { parse_mode: 'Markdown' });
  await axios.post(`${BACKEND_URL}/webhook`, { event: 'operator_rejected', data: { sessionId: session.fullId } }).catch(console.error);
});

// Operator sends message
bot.on('text', async ctx => {
  if (ctx.message.text.startsWith('/')) return;
  const shortId = userSessions.get(ctx.chat.id);
  if (!shortId) return ctx.reply('📭 جلسه فعالی ندارید');
  const session = sessions.get(shortId);
  if (!session || session.status !== 'accepted') return ctx.reply('❌ جلسه فعال نیست');

  await axios.post(`${BACKEND_URL}/api/send-to-user`, { sessionId: session.fullId, message: ctx.message.text }).catch(console.error);
  ctx.reply('✅ پیام ارسال شد');
});

// ================= EXPRESS SERVER =================
const app = express();
app.use(express.json());

// Backend receives new sessions or messages from site
app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;
  try {
    if (event === 'new_session') {
      await handleNewSession(data.sessionId, data.userInfo || {}, data.userMessage || 'درخواست اتصال');
      return res.json({ success: true });
    } else if (event === 'user_message') {
      const shortId = generateShortId(data.sessionId);
      const session = sessions.get(shortId);
      if (session && session.operatorChatId) {
        await bot.telegram.sendMessage(session.operatorChatId,
          `📩 پیام از کاربر\n🎫 کد: \`${shortId}\`\n👤 ${data.userName || 'کاربر'}\n💬 ${data.message}`, { parse_mode: 'Markdown' });
        return res.json({ success: true });
      }
    } else if (event === 'session_ended') {
      const shortId = generateShortId(data.sessionId);
      const session = sessions.get(shortId);
      if (session && session.operatorChatId) {
        await bot.telegram.sendMessage(session.operatorChatId,
          `📭 جلسه پایان یافت\n🎫 کد: \`${shortId}\``, { parse_mode: 'Markdown' });
        sessions.delete(shortId);
        userSessions.delete(session.operatorChatId);
      }
      return res.json({ success: true });
    }
    return res.json({ success: false, error: 'Unknown event' });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Telegram webhook
app.post('/telegram-webhook', async (req, res) => {
  try { await bot.handleUpdate(req.body); res.sendStatus(200); } 
  catch (e) { console.error(e.message); res.sendStatus(500); }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    activeSessions: Array.from(sessions.values()).filter(s => s.status === 'accepted').length,
    pendingSessions: Array.from(sessions.values()).filter(s => s.status === 'pending').length
  });
});

// ================= START BOT =================
(async () => {
  try {
    console.log('🚀 Setting Telegram webhook...');
    await bot.telegram.setWebhook(WEBHOOK_URL);
    app.listen(PORT, () => console.log(`🤖 Bot + Backend running on port ${PORT}`));
  } catch (e) {
    console.error('❌ Bot startup failed:', e.message);
    process.exit(1);
  }
})();
