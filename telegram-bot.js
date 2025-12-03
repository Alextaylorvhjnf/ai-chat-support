const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

console.log('='.repeat(60));
console.log('🤖 TELEGRAM BOT STARTING');
console.log('='.repeat(60));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Validate
if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

if (!ADMIN_TELEGRAM_ID) {
  console.error('❌ ADMIN_TELEGRAM_ID is required');
  process.exit(1);
}

console.log('✅ Token:', TELEGRAM_BOT_TOKEN.substring(0, 15) + '...');
console.log('✅ Admin ID:', ADMIN_TELEGRAM_ID);
console.log('✅ Backend URL:', BACKEND_URL);
console.log('='.repeat(60));

// Create bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Store active sessions
const activeSessions = new Map(); // chatId -> sessionId
const sessionOperators = new Map(); // sessionId -> chatId

// Helper function to notify backend
async function notifyBackend(event, data) {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/telegram-event`, {
      event,
      data,
      timestamp: new Date().toISOString()
    });
    return response.data;
  } catch (error) {
    console.error('Backend notification failed:', error.message);
    return null;
  }
}

// Start command
bot.start((ctx) => {
  const welcomeMessage = `👨‍💼 *پنل اپراتور پشتیبانی آنلاین*\n\n`
    + `سلام ${ctx.from.first_name || 'اپراتور'}! 👋\n\n`
    + `شما به عنوان اپراتور انسانی متصل شدید.\n`
    + `پیام‌های کاربران به صورت خودکار برای شما ارسال می‌شود.\n\n`
    + `📊 *دستورات سریع:*\n`
    + `/sessions - نمایش جلسات فعال\n`
    + `/stats - آمار سیستم\n`
    + `/help - راهنمای استفاده\n\n`
    + `💬 *برای پاسخ به کاربر، فقط پیام خود را بنویسید.*`;
  
  ctx.reply(welcomeMessage, { 
    parse_mode: 'Markdown',
    ...Markup.keyboard([
      ['📋 جلسات فعال', '📊 آمار'],
      ['🆘 راهنمایی', '🔄 رفرش']
    ]).resize()
  });
});

// Sessions command
bot.command('sessions', async (ctx) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/sessions`);
    const sessions = response.data.sessions || [];
    
    if (sessions.length === 0) {
      return ctx.reply('📭 *هیچ جلسه فعالی وجود ندارد.*\n\nدر انتظار درخواست کاربران...', {
        parse_mode: 'Markdown'
      });
    }
    
    let message = `📊 *جلسات فعال (${sessions.length}):*\n\n`;
    
    sessions.forEach((session, index) => {
      const duration = Math.floor((new Date() - new Date(session.createdAt)) / (1000 * 60));
      message += `${index + 1}. *جلسه:* \`${session.id.substring(0, 12)}...\`\n`;
      message += `   👤 *کاربر:* ${session.userInfo?.name || 'ناشناس'}\n`;
      message += `   💬 *پیام‌ها:* ${session.messageCount || 0}\n`;
      message += `   ⏱️ *مدت:* ${duration} دقیقه\n`;
      message += `   🔗 *وضعیت:* ${session.connectedToHuman ? 'متصل ✅' : 'در انتظار'}\n\n`;
    });
    
    ctx.reply(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🔄 بروزرسانی', 'refresh_sessions'),
          Markup.button.callback('📋 همه جلسات', 'all_sessions')
        ]
      ])
    });
    
  } catch (error) {
    console.error('Error fetching sessions:', error.message);
    ctx.reply('❌ خطا در دریافت اطلاعات جلسات');
  }
});

// Stats command
bot.command('stats', async (ctx) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/stats`);
    const stats = response.data;
    
    const statsMessage = `📈 *آمار سیستم:*\n\n`
      + `⏰ *زمان:* ${new Date().toLocaleTimeString('fa-IR')}\n`
      + `📅 *تاریخ:* ${new Date().toLocaleDateString('fa-IR')}\n\n`
      + `📊 *آمار جلسات:*\n`
      + `   • کل جلسات: ${stats.totalSessions || 0}\n`
      + `   • جلسات فعال: ${stats.activeSessions || 0}\n`
      + `   • متصل به اپراتور: ${stats.humanConnected || 0}\n\n`
      + `👥 *اپراتورها:*\n`
      + `   • آنلاین: ${stats.onlineOperators || 1}\n`
      + `   • در حال پاسخ: ${stats.busyOperators || 0}\n\n`
      + `🤖 *وضعیت AI:* ${stats.aiEnabled ? 'فعال ✅' : 'غیرفعال'}`;
    
    ctx.reply(statsMessage, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 بروزرسانی آمار', 'refresh_stats')]
      ])
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    ctx.reply('❌ خطا در دریافت آمار سیستم');
  }
});

// Help command
bot.command('help', (ctx) => {
  const helpMessage = `📖 *راهنمای اپراتور:*\n\n`
    + `1. *کاربران* از طریق وبسایت با سیستم چت می‌کنند.\n`
    + `2. اگر *AI نتواند پاسخ دهد*، به شما متصل می‌شوند.\n`
    + `3. برای *پاسخ*، فقط پیام خود را بنویسید.\n\n`
    + `⚡ *دستورات:*\n`
    + `/start - شروع کار\n`
    + `/sessions - لیست جلسات فعال\n`
    + `/stats - آمار سیستم\n`
    + `/help - این راهنما\n\n`
    + `🔔 *نحوه کار:*\n`
    + `• پیام کاربران به صورت خودکار ارسال می‌شود\n`
    + `• هر پیامی که می‌نویسید به کاربر ارسال می‌شود\n`
    + `• برای پایان گفتگو، از کاربر بخواهید "پایان" بگوید\n\n`
    + `✅ *سیستم آماده به کار است*`;
  
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Handle user messages (operator responses)
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const messageText = ctx.message.text;
  
  // Ignore commands
  if (messageText.startsWith('/')) return;
  
  // Check if this chat has an active session
  const sessionId = activeSessions.get(chatId);
  if (!sessionId) {
    // No active session, show available commands
    return ctx.reply('📭 شما هیچ جلسه فعالی ندارید.\n\n'
      + 'منتظر درخواست کاربران باشید یا از دستورات زیر استفاده کنید:\n\n'
      + '/sessions - نمایش جلسات فعال\n'
      + '/stats - آمار سیستم\n'
      + '/help - راهنمایی', {
        parse_mode: 'Markdown'
      });
  }
  
  try {
    // Send message to user via backend
    const response = await axios.post(`${BACKEND_URL}/api/send-to-user`, {
      sessionId,
      message: messageText,
      operatorId: chatId,
      operatorName: ctx.from.first_name || 'اپراتور'
    });
    
    if (response.data.success) {
      // Confirm to operator
      ctx.reply(`✅ *پیام شما ارسال شد*\n\n`
        + `👤 *به کاربر:* ${response.data.userName || 'کاربر سایت'}\n`
        + `📝 *پیام:* ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}\n\n`
        + `💡 منتظر پاسخ کاربر باشید...`, {
          parse_mode: 'Markdown'
        });
      
      // Notify backend
      await notifyBackend('operator_message_sent', {
        sessionId,
        operatorId: chatId,
        messageLength: messageText.length
      });
      
    } else {
      ctx.reply('❌ خطا در ارسال پیام به کاربر');
    }
    
  } catch (error) {
    console.error('Error sending message to user:', error.message);
    ctx.reply('❌ خطا در ارتباط با سرور اصلی');
  }
});

// Handle button callbacks
bot.action('refresh_sessions', async (ctx) => {
  await ctx.answerCbQuery('در حال بروزرسانی...');
  await ctx.deleteMessage();
  await ctx.reply('🔄 در حال دریافت جلسات...');
  
  // Simulate calling sessions command
  const fakeCtx = {
    ...ctx,
    reply: ctx.reply.bind(ctx)
  };
  await fakeCtx.telegram.commands.get('sessions')(fakeCtx);
});

bot.action('refresh_stats', async (ctx) => {
  await ctx.answerCbQuery('در حال بروزرسانی...');
  await ctx.deleteMessage();
  
  // Simulate calling stats command
  const fakeCtx = {
    ...ctx,
    reply: ctx.reply.bind(ctx)
  };
  await fakeCtx.telegram.commands.get('stats')(fakeCtx);
});

bot.action('all_sessions', async (ctx) => {
  await ctx.answerCbQuery('در حال دریافت همه جلسات...');
  ctx.reply('📋 این قابلیت به زودی اضافه خواهد شد.');
});

// Handle new session from user
async function handleNewUserSession(sessionId, userInfo, userMessage) {
  try {
    // Find available operator (admin)
    const operatorMessage = `🔔 *درخواست اتصال جدید*\n\n`
      + `🎫 *کد جلسه:* \`${sessionId}\`\n`
      + `👤 *کاربر:* ${userInfo.name || 'کاربر سایت'}\n`
      + `📧 *ایمیل:* ${userInfo.email || 'ندارد'}\n`
      + `📱 *تلفن:* ${userInfo.phone || 'ندارد'}\n`
      + `🌐 *صفحه:* ${userInfo.page ? userInfo.page.substring(0, 50) + '...' : 'نامشخص'}\n\n`
      + `📝 *آخرین پیام کاربر:*\n"${userMessage.substring(0, 200)}${userMessage.length > 200 ? '...' : ''}"\n\n`
      + `💬 *برای پاسخ، پیام خود را بنویسید...*`;
    
    // Send to admin
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, operatorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ قبول گفتگو', `accept_${sessionId}`),
          Markup.button.callback('❌ رد کردن', `reject_${sessionId}`)
        ]
      ])
    });
    
    // Store session
    activeSessions.set(ADMIN_TELEGRAM_ID, sessionId);
    sessionOperators.set(sessionId, ADMIN_TELEGRAM_ID);
    
    console.log(`✅ New session ${sessionId.substring(0, 8)}... assigned to admin`);
    return true;
    
  } catch (error) {
    console.error('Error handling new session:', error.message);
    return false;
  }
}

// Handle accept/reject callbacks
bot.action(/accept_(.+)/, async (ctx) => {
  const sessionId = ctx.match[1];
  await ctx.answerCbQuery('✅ گفتگو قبول شد');
  await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ *شما این گفتگو را قبول کردید*', {
    parse_mode: 'Markdown'
  });
  
  // Notify backend
  await notifyBackend('operator_accepted', { sessionId });
});

bot.action(/reject_(.+)/, async (ctx) => {
  const sessionId = ctx.match[1];
  await ctx.answerCbQuery('❌ گفتگو رد شد');
  await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ *شما این گفتگو را رد کردید*', {
    parse_mode: 'Markdown'
  });
  
  // Remove session
  activeSessions.delete(ADMIN_TELEGRAM_ID);
  sessionOperators.delete(sessionId);
  
  // Notify backend
  await notifyBackend('operator_rejected', { sessionId });
});

// HTTP endpoint for receiving messages from backend
const express = require('express');
const app = express();
const PORT = process.env.TELEGRAM_PORT || 3001;

app.use(express.json());

// Webhook endpoint for backend
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log(`📨 Webhook received: ${event}`, data);
    
    switch (event) {
      case 'new_session':
        const success = await handleNewUserSession(
          data.sessionId,
          data.userInfo,
          data.userMessage
        );
        res.json({ success });
        break;
        
      case 'user_message':
        const operatorChatId = sessionOperators.get(data.sessionId);
        if (operatorChatId) {
          const message = `📩 *پیام از کاربر*\n\n`
            + `🎫 *جلسه:* \`${data.sessionId.substring(0, 12)}...\`\n`
            + `👤 *کاربر:* ${data.userName || 'کاربر سایت'}\n`
            + `💬 *پیام:*\n"${data.message}"\n\n`
            + `✏️ *برای پاسخ، پیام خود را بنویسید...*`;
          
          await bot.telegram.sendMessage(operatorChatId, message, {
            parse_mode: 'Markdown'
          });
          
          res.json({ success: true });
        } else {
          res.json({ success: false, error: 'No operator assigned' });
        }
        break;
        
      case 'session_ended':
        const chatId = sessionOperators.get(data.sessionId);
        if (chatId) {
          await bot.telegram.sendMessage(chatId, 
            `📭 *جلسه به پایان رسید*\n\n`
            + `🎫 کد جلسه: \`${data.sessionId.substring(0, 12)}...\`\n`
            + `⏱️ مدت گفتگو: ${data.duration} دقیقه\n`
            + `💬 تعداد پیام‌ها: ${data.messageCount}\n\n`
            + `✅ گفتگو با موفقیت پایان یافت.`, {
              parse_mode: 'Markdown'
            });
          
          // Cleanup
          activeSessions.delete(chatId);
          sessionOperators.delete(data.sessionId);
        }
        res.json({ success: true });
        break;
        
      default:
        res.json({ success: false, error: 'Unknown event' });
    }
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    bot: 'running',
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// Start bot with webhook (for Railway)
async function startBot() {
  try {
    console.log('🚀 Starting Telegram bot...');
    
    // For Railway, use webhook
    const domain = process.env.RAILWAY_STATIC_URL;
    if (domain) {
      const webhookUrl = `${domain}/telegram-webhook`;
      console.log(`🌐 Setting webhook to: ${webhookUrl}`);
      
      await bot.telegram.setWebhook(webhookUrl);
      
      // Setup webhook route
      app.post('/telegram-webhook', (req, res) => {
        bot.handleUpdate(req.body, res);
      });
      
      console.log('✅ Webhook configured');
    } else {
      // Use polling for local development
      await bot.launch();
      console.log('✅ Bot started with polling');
    }
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🤖 Telegram bot server running on port ${PORT}`);
      console.log(`📞 Webhook endpoint: http://localhost:${PORT}/webhook`);
      console.log('✅ Bot is ready to receive messages!');
      
      // Send startup message to admin
      bot.telegram.sendMessage(ADMIN_TELEGRAM_ID,
        `🚀 *ربات پشتیبانی راه‌اندازی شد*\n\n`
        + `⏰ ${new Date().toLocaleString('fa-IR')}\n`
        + `🌐 ${domain || `http://localhost:${PORT}`}\n`
        + `✅ *وضعیت:* آماده دریافت پیام‌ها\n\n`
        + `برای شروع، از دستور /start استفاده کنید.`, {
          parse_mode: 'Markdown'
        }).catch(console.error);
    });
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Start everything
startBot();
