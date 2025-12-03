const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

console.log('='.repeat(60));
console.log('🤖 TELEGRAM BOT - CLEAN VERSION');
console.log('='.repeat(60));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_ID) {
  console.error('❌ Missing Telegram config');
  process.exit(1);
}

console.log('✅ Bot configured');
console.log('✅ Admin:', ADMIN_TELEGRAM_ID);
console.log('✅ Backend:', BACKEND_URL);

// Store sessions
const sessions = new Map();
const userSessions = new Map();

// Create bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Helper functions
function generateShortId(sessionId) {
  return sessionId.substring(0, 8);
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

function getFullSessionId(shortId) {
  const session = sessions.get(shortId);
  return session ? session.fullId : null;
}

// Start command
bot.start((ctx) => {
  ctx.reply(`👨‍💼 پنل اپراتور\n\nسلام ${ctx.from.first_name || 'اپراتور'}!\n\n✅ سیستم آماده است.`, {
    parse_mode: 'Markdown',
    ...Markup.keyboard([['📋 جلسات فعال']]).resize()
  });
});

// Sessions command
bot.command('sessions', async (ctx) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/sessions`);
    const sessionsList = response.data.sessions || [];
    
    if (sessionsList.length === 0) {
      return ctx.reply('📭 هیچ جلسه فعالی وجود ندارد');
    }
    
    let message = `📊 جلسات فعال (${sessionsList.length}):\n\n`;
    sessionsList.forEach((session, index) => {
      const shortId = session.shortId || generateShortId(session.id);
      message += `${index + 1}. ${session.userInfo?.name || 'کاربر'}\n`;
      message += `   کد: ${shortId}\n`;
      message += `   وضعیت: ${session.connectedToHuman ? 'متصل ✅' : 'در انتظار'}\n\n`;
    });
    
    ctx.reply(message);
    
  } catch (error) {
    console.error('Sessions error:', error.message);
    ctx.reply('❌ خطا در دریافت جلسات');
  }
});

// Handle new session
async function handleNewUserSession(sessionId, userInfo, userMessage) {
  try {
    const shortId = storeSession(sessionId, userInfo);
    
    const operatorMessage = `🔔 درخواست اتصال جدید\n\n`
      + `کد: ${shortId}\n`
      + `کاربر: ${userInfo.name || 'کاربر سایت'}\n`
      + `پیام: ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}\n\n`
      + `برای پذیرش کلیک کنید:`;
    
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, operatorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ بپذیر', `accept_${shortId}`),
          Markup.button.callback('❌ رد کن', `reject_${shortId}`)
        ]
      ])
    });
    
    console.log(`✅ New session: ${shortId}`);
    return true;
    
  } catch (error) {
    console.error('Notification error:', error.message);
    return false;
  }
}

// Accept callback
bot.action(/accept_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const fullSessionId = getFullSessionId(shortId);
    
    if (!fullSessionId) {
      return ctx.answerCbQuery('❌ جلسه پیدا نشد');
    }
    
    const session = sessions.get(shortId);
    if (session) {
      session.status = 'accepted';
      session.operatorChatId = ctx.chat.id;
    }
    
    userSessions.set(ctx.chat.id, shortId);
    
    await ctx.answerCbQuery('✅ پذیرفته شد');
    
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n✅ شما این گفتگو را قبول کردید.',
      { ...Markup.inlineKeyboard([]) }
    );
    
    await axios.post(`${BACKEND_URL}/webhook`, {
      event: 'operator_accepted',
      data: {
        sessionId: fullSessionId,
        operatorId: ctx.chat.id,
        operatorName: ctx.from.first_name || 'اپراتور'
      }
    });
    
    console.log(`✅ Accepted: ${shortId}`);
    
    await ctx.reply(`✅ به جلسه متصل شدید\n\nکد: ${shortId}\nکاربر: ${session?.userInfo?.name || 'کاربر'}`);
    
  } catch (error) {
    console.error('Accept error:', error.message);
    ctx.answerCbQuery('❌ خطا');
  }
});

// Reject callback
bot.action(/reject_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const fullSessionId = getFullSessionId(shortId);
    
    if (!fullSessionId) return ctx.answerCbQuery('❌ جلسه پیدا نشد');
    
    sessions.delete(shortId);
    await ctx.answerCbQuery('❌ رد شد');
    
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n❌ شما این گفتگو را رد کردید.',
      { ...Markup.inlineKeyboard([]) }
    );
    
    await axios.post(`${BACKEND_URL}/webhook`, {
      event: 'operator_rejected',
      data: { sessionId: fullSessionId }
    });
    
    console.log(`❌ Rejected: ${shortId}`);
    
  } catch (error) {
    console.error('Reject error:', error.message);
    ctx.answerCbQuery('❌ خطا');
  }
});

// Handle operator messages
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  
  const chatId = ctx.chat.id;
  const messageText = ctx.message.text;
  
  const shortId = userSessions.get(chatId);
  if (!shortId) {
    return ctx.reply('📭 شما جلسه فعالی ندارید');
  }
  
  const session = sessions.get(shortId);
  if (!session || session.status !== 'accepted') {
    return ctx.reply('❌ این جلسه فعال نیست');
  }
  
  try {
    await axios.post(`${BACKEND_URL}/webhook`, {
      event: 'user_message',
      data: {
        sessionId: session.fullId,
        message: messageText,
        operatorId: chatId,
        operatorName: ctx.from.first_name || 'اپراتور'
      }
    });
    
    ctx.reply(`✅ پیام ارسال شد\n\n${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`);
    
    console.log(`📨 Operator message: ${shortId}`);
    
  } catch (error) {
    console.error('Send error:', error.message);
    ctx.reply('❌ خطا در ارسال');
  }
});

// Webhook server
const express = require('express');
const app = express();
const webhookPort = process.env.TELEGRAM_PORT || 3001;

app.use(express.json());

// Webhook from backend
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log(`📨 Backend webhook: ${event}`);
    
    switch (event) {
      case 'new_session':
        const success = await handleNewUserSession(
          data.sessionId,
          data.userInfo || {},
          data.userMessage || 'درخواست'
        );
        res.json({ success });
        break;
        
      default:
        res.json({ success: false, error: 'Unknown event' });
    }
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    bot: 'running',
    activeSessions: Array.from(sessions.values()).filter(s => s.status === 'accepted').length,
    pendingSessions: Array.from(sessions.values()).filter(s => s.status === 'pending').length
  });
});

// Start bot
async function startBot() {
  try {
    console.log('🚀 Starting Telegram bot...');
    
    // ALWAYS USE POLLING - NO WEBHOOK ISSUES
    await bot.launch();
    console.log('✅ Bot started with POLLING');
    
    // Start web server
    app.listen(webhookPort, '0.0.0.0', () => {
      console.log(`🤖 Telegram server on port ${webhookPort}`);
      console.log('✅ Bot is ready!');
      
      // Startup message
      setTimeout(async () => {
        try {
          await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID,
            `🤖 ربات فعال شد\n\n⏰ ${new Date().toLocaleString('fa-IR')}\n✅ آماده است`);
        } catch (error) {
          console.error('Startup message error:', error.message);
        }
      }, 2000);
    });
    
  } catch (error) {
    console.error('❌ Bot startup failed:', error.message);
    
    // If 409 error, wait and retry
    if (error.message.includes('409')) {
      console.log('⚠️ Another bot is running. Waiting 10 seconds...');
      setTimeout(() => {
        console.log('🔄 Retrying...');
        startBot();
      }, 10000);
    } else {
      process.exit(1);
    }
  }
}

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Shutting down...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Terminating...');
  bot.stop('SIGTERM');
  process.exit(0);
});

// Start
startBot();
