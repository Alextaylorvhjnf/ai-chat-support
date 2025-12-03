const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

console.log('='.repeat(60));
console.log('🤖 TELEGRAM BOT - OPERATOR PANEL');
console.log('='.repeat(60));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8200429613:AAGTgP5hnOiRIxXc3YJmxvTqwEqhQ4crGkk';
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '6234289265';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const TELEGRAM_PORT = process.env.TELEGRAM_PORT || 3001;

// Validate
if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ Missing Telegram Bot Token');
  process.exit(1);
}

console.log('✅ Bot configured');
console.log('✅ Admin:', ADMIN_TELEGRAM_ID);
console.log('✅ Backend:', BACKEND_URL);
console.log('✅ Port:', TELEGRAM_PORT);

// Store sessions
const sessions = new Map(); // sessionShortId -> {sessionId, userInfo, operatorChatId}
const operatorSessions = new Map(); // operatorChatId -> sessionShortId

// Create bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Helper: Generate short session ID
function generateShortId(sessionId) {
  return sessionId ? sessionId.substring(0, 12) : 'unknown';
}

// Helper: Store session
function storeSession(sessionId, userInfo) {
  const shortId = generateShortId(sessionId);
  sessions.set(shortId, {
    fullId: sessionId,
    userInfo,
    status: 'pending',
    createdAt: new Date(),
    operatorChatId: null
  });
  return shortId;
}

// Helper: Get full session ID
function getFullSessionId(shortId) {
  const session = sessions.get(shortId);
  return session ? session.fullId : null;
}

// Start command
bot.start((ctx) => {
  const welcomeMessage = `👨‍💼 *پنل اپراتور پشتیبانی*\n\n`
    + `سلام ${ctx.from.first_name || 'اپراتور'}! 👋\n\n`
    + `✅ سیستم آماده دریافت پیام‌هاست\n\n`
    + `📋 *دستورات:*\n`
    + `/sessions - نمایش جلسات فعال\n`
    + `/help - راهنمای استفاده`;
  
  ctx.reply(welcomeMessage, { 
    parse_mode: 'Markdown',
    ...Markup.keyboard([
      ['📋 جلسات فعال', '🆘 راهنما']
    ]).resize()
  });
});

// Sessions command
bot.command('sessions', async (ctx) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/sessions`);
    const sessionsList = response.data.sessions || [];
    const pendingSessions = sessionsList.filter(s => !s.connectedToHuman);
    
    if (pendingSessions.length === 0) {
      return ctx.reply('📭 *هیچ جلسه فعالی در انتظار نیست*\n\n'
        + 'پیام‌های جدید به صورت خودکار برای شما ارسال می‌شوند.', {
          parse_mode: 'Markdown'
        });
    }
    
    let message = `📊 *جلسات فعال در انتظار (${pendingSessions.length}):*\n\n`;
    
    pendingSessions.forEach((session, index) => {
      const shortId = session.shortId || generateShortId(session.id);
      const duration = session.duration || Math.floor((new Date() - new Date(session.createdAt)) / (1000 * 60));
      
      message += `*${index + 1}. جلسه:* \`${shortId}\`\n`;
      message += `   👤 *کاربر:* ${session.userInfo?.name || 'ناشناس'}\n`;
      message += `   ⏱️ *مدت:* ${duration} دقیقه\n`;
      message += `   📝 *پیام‌ها:* ${session.messageCount} عدد\n\n`;
    });
    
    ctx.reply(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 بروزرسانی', 'refresh_sessions')]
      ])
    });
    
  } catch (error) {
    console.error('❌ Sessions error:', error.message);
    ctx.reply('❌ خطا در دریافت جلسات از سرور');
  }
});

// Handle new session from user (called by backend webhook)
async function handleNewUserSession(sessionId, userInfo, userMessage) {
  try {
    const shortId = storeSession(sessionId, userInfo);
    
    const operatorMessage = `🔔 *درخواست اتصال جدید*\n\n`
      + `🎫 *کد جلسه:* \`${shortId}\`\n`
      + `👤 *کاربر:* ${userInfo.name || 'کاربر سایت'}\n`;
    
    if (userInfo.email) {
      operatorMessage += `📧 *ایمیل:* ${userInfo.email}\n`;
    }
    
    operatorMessage += `\n📝 *پیام کاربر:*\n`
      + `${userMessage.substring(0, 150)}${userMessage.length > 150 ? '...' : ''}\n\n`
      + `💬 برای پذیرش گفتگو کلیک کنید:`;
    
    // Send to admin with callback buttons
    const message = await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, operatorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ بله، می‌پذیرم', `accept_${shortId}`),
          Markup.button.callback('❌ نه، رد کن', `reject_${shortId}`)
        ],
        [
          Markup.button.callback('📋 مشاهده جزئیات', `details_${shortId}`)
        ]
      ])
    });
    
    // Store message ID
    const session = sessions.get(shortId);
    if (session) {
      session.messageId = message.message_id;
    }
    
    console.log(`✅ New session notification sent: ${shortId}`);
    return true;
    
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
    return false;
  }
}

// Handle accept callback
bot.action(/accept_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const fullSessionId = getFullSessionId(shortId);
    
    if (!fullSessionId) {
      return ctx.answerCbQuery('❌ جلسه پیدا نشد', { show_alert: true });
    }
    
    // Update session status
    const session = sessions.get(shortId);
    if (session) {
      session.status = 'accepted';
      session.acceptedAt = new Date();
      session.operatorChatId = ctx.chat.id;
    }
    
    // Store operator chat ID
    operatorSessions.set(ctx.chat.id, shortId);
    
    // Acknowledge callback
    await ctx.answerCbQuery('✅ گفتگو قبول شد');
    
    // Edit message to show acceptance
    const updatedText = ctx.callbackQuery.message.text + '\n\n'
      + '✅ *شما این گفتگو را قبول کردید*\n\n'
      + '💬 اکنون می‌توانید پیام بفرستید. هر پیامی که بنویسید به کاربر ارسال می‌شود.';
    
    await ctx.editMessageText(updatedText, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([]) // Remove buttons
    });
    
    // Notify backend
    await axios.post(`${BACKEND_URL}/webhook`, {
      event: 'operator_accepted',
      data: { 
        sessionId: fullSessionId,
        operatorId: ctx.chat.id,
        operatorName: ctx.from.first_name || 'اپراتور'
      }
    });
    
    console.log(`✅ Session ${shortId} accepted by operator ${ctx.chat.id}`);
    
  } catch (error) {
    console.error('❌ Accept callback error:', error.message);
    ctx.answerCbQuery('❌ خطا در پردازش', { show_alert: true });
  }
});

// Handle reject callback
bot.action(/reject_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const fullSessionId = getFullSessionId(shortId);
    
    if (!fullSessionId) {
      return ctx.answerCbQuery('❌ جلسه پیدا نشد', { show_alert: true });
    }
    
    // Remove session
    sessions.delete(shortId);
    operatorSessions.delete(ctx.chat.id);
    
    // Acknowledge callback
    await ctx.answerCbQuery('❌ گفتگو رد شد');
    
    // Edit message
    const updatedText = ctx.callbackQuery.message.text + '\n\n'
      + '❌ *شما این گفتگو را رد کردید*';
    
    await ctx.editMessageText(updatedText, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([])
    });
    
    // Notify backend
    await axios.post(`${BACKEND_URL}/webhook`, {
      event: 'operator_rejected',
      data: { sessionId: fullSessionId }
    });
    
    console.log(`❌ Session ${shortId} rejected by operator ${ctx.chat.id}`);
    
  } catch (error) {
    console.error('❌ Reject callback error:', error.message);
    ctx.answerCbQuery('❌ خطا در پردازش', { show_alert: true });
  }
});

// Handle details callback
bot.action(/details_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const fullSessionId = getFullSessionId(shortId);
    
    if (!fullSessionId) {
      return ctx.answerCbQuery('❌ جلسه پیدا نشد', { show_alert: true });
    }
    
    // Get session details from backend
    const response = await axios.get(`${BACKEND_URL}/api/sessions`);
    const session = response.data.sessions?.find(s => s.id === fullSessionId);
    
    if (session) {
      let details = `📋 *جزئیات جلسه*\n\n`
        + `🎫 *کد:* \`${shortId}\`\n`
        + `👤 *کاربر:* ${session.userInfo?.name || 'ناشناس'}\n`
        + `📧 *ایمیل:* ${session.userInfo?.email || 'ندارد'}\n`
        + `📞 *تلفن:* ${session.userInfo?.phone || 'ندارد'}\n`
        + `⏱️ *مدت:* ${session.duration || 0} دقیقه\n`
        + `💬 *تعداد پیام‌ها:* ${session.messageCount || 0}\n`
        + `🔗 *وضعیت:* ${session.connectedToHuman ? 'متصل' : 'در انتظار'}\n\n`;
      
      // Show last 3 messages
      if (session.messages && session.messages.length > 0) {
        details += '*آخرین پیام‌ها:*\n';
        const lastMessages = session.messages.slice(-3);
        lastMessages.forEach((msg, idx) => {
          const role = msg.role === 'user' ? '👤 کاربر' : 
                      msg.role === 'assistant' ? '🤖 هوش مصنوعی' : '👨‍💼 اپراتور';
          details += `${idx + 1}. ${role}: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}\n`;
        });
      }
      
      await ctx.answerCbQuery('📋 جزئیات نمایش داده شد', { show_alert: true });
      
      // Send as a separate message
      await ctx.reply(details, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ پذیرش این جلسه', `accept_${shortId}`)]
        ])
      });
    }
    
  } catch (error) {
    console.error('❌ Details callback error:', error.message);
    ctx.answerCbQuery('❌ خطا در دریافت جزئیات', { show_alert: true });
  }
});

// Handle refresh sessions
bot.action('refresh_sessions', async (ctx) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/sessions`);
    const sessionsList = response.data.sessions || [];
    const pendingSessions = sessionsList.filter(s => !s.connectedToHuman);
    
    if (pendingSessions.length === 0) {
      await ctx.editMessageText('📭 *هیچ جلسه فعالی در انتظار نیست*\n\n'
        + 'پیام‌های جدید به صورت خودکار برای شما ارسال می‌شوند.', {
          parse_mode: 'Markdown'
        });
      return ctx.answerCbQuery('✅ بروزرسانی شد');
    }
    
    let message = `📊 *جلسات فعال در انتظار (${pendingSessions.length}):*\n\n`;
    
    pendingSessions.forEach((session, index) => {
      const shortId = session.shortId || generateShortId(session.id);
      const duration = session.duration || Math.floor((new Date() - new Date(session.createdAt)) / (1000 * 60));
      
      message += `*${index + 1}. جلسه:* \`${shortId}\`\n`;
      message += `   👤 *کاربر:* ${session.userInfo?.name || 'ناشناس'}\n`;
      message += `   ⏱️ *مدت:* ${duration} دقیقه\n`;
      message += `   📝 *پیام‌ها:* ${session.messageCount} عدد\n\n`;
    });
    
    await ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 بروزرسانی', 'refresh_sessions')]
      ])
    });
    
    await ctx.answerCbQuery('✅ بروزرسانی شد');
    
  } catch (error) {
    console.error('❌ Refresh error:', error.message);
    ctx.answerCbQuery('❌ خطا در بروزرسانی', { show_alert: true });
  }
});

// Handle operator messages
bot.on('text', async (ctx) => {
  // Skip commands
  if (ctx.message.text.startsWith('/')) return;
  
  const chatId = ctx.chat.id;
  const messageText = ctx.message.text;
  
  // Check if operator has an active session
  const shortId = operatorSessions.get(chatId);
  if (!shortId) {
    return ctx.reply('📭 *شما جلسه فعالی ندارید*\n\n'
      + 'منتظر درخواست کاربران باشید یا از /sessions استفاده کنید.', {
        parse_mode: 'Markdown'
      });
  }
  
  const session = sessions.get(shortId);
  if (!session || session.status !== 'accepted') {
    return ctx.reply('❌ *این جلسه فعال نیست*\n\n'
      + 'لطفاً یک جلسه جدید را از لیست جلسات بپذیرید.', {
        parse_mode: 'Markdown'
      });
  }
  
  try {
    // Send message to user via backend
    const response = await axios.post(`${BACKEND_URL}/api/send-to-user`, {
      sessionId: session.fullId,
      message: messageText,
      operatorId: chatId,
      operatorName: ctx.from.first_name || 'اپراتور'
    });
    
    if (response.data.success) {
      // Confirm to operator
      ctx.reply(`✅ *پیام ارسال شد*\n\n`
        + `👤 به: ${response.data.userName || 'کاربر'}\n`
        + `📝 پیام شما: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`, {
          parse_mode: 'Markdown'
        });
      
      // Notify backend
      await axios.post(`${BACKEND_URL}/webhook`, {
        event: 'operator_message_sent',
        data: {
          sessionId: session.fullId,
          operatorId: chatId
        }
      });
      
      console.log(`📨 Operator ${chatId} sent message for session ${shortId}`);
    } else {
      ctx.reply('❌ خطا در ارسال پیام: ' + (response.data.error || 'خطای ناشناخته'));
    }
    
  } catch (error) {
    console.error('❌ Send message error:', error.message);
    ctx.reply('❌ خطا در ارتباط با سرور اصلی');
  }
});

// Help command
bot.command('help', (ctx) => {
  const helpMessage = `📖 *راهنمای اپراتور:*\n\n`
    + `1. درخواست‌های کاربران به صورت خودکار ارسال می‌شود\n`
    + `2. برای پذیرش گفتگو روی "✅ بله، می‌پذیرم" کلیک کنید\n`
    + `3. سپس می‌توانید مستقیماً پیام بفرستید\n`
    + `4. پیام‌های شما به کاربر ارسال می‌شود\n\n`
    + `⚡ *دستورات:*\n`
    + `/start - شروع\n`
    + `/sessions - جلسات فعال\n`
    + `/help - این راهنما\n\n`
    + `🔔 *توجه:* هر پیامی که می‌نویسید به کاربر ارسال می‌شود.`;
  
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Webhook endpoint for backend
const express = require('express');
const app = express();

app.use(express.json());

// Webhook from backend (برای دریافت درخواست‌های جدید از کاربران)
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log(`📨 Received webhook: ${event}`, { 
      sessionId: data.sessionId ? generateShortId(data.sessionId) : 'N/A' 
    });
    
    switch (event) {
      case 'new_session':
        const success = await handleNewUserSession(
          data.sessionId,
          data.userInfo || {},
          data.userMessage || 'درخواست اتصال'
        );
        res.json({ success });
        break;
        
      case 'user_message':
        // Find which operator has this session
        const shortId = generateShortId(data.sessionId);
        const session = sessions.get(shortId);
        
        if (session && session.operatorChatId) {
          const message = `📩 *پیام جدید از کاربر*\n\n`
            + `🎫 *کد جلسه:* \`${shortId}\`\n`
            + `👤 *کاربر:* ${data.userName || 'کاربر سایت'}\n`
            + `💬 *پیام:*\n${data.message}\n\n`
            + `✏️ برای پاسخ، پیام خود را بنویسید...`;
          
          await bot.telegram.sendMessage(session.operatorChatId, message, {
            parse_mode: 'Markdown'
          });
          
          res.json({ success: true });
        } else {
          res.json({ 
            success: false, 
            error: 'No operator assigned to this session' 
          });
        }
        break;
        
      default:
        res.json({ 
          success: false, 
          error: 'Unknown event type' 
        });
    }
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const activeSessions = Array.from(sessions.values()).filter(s => s.status === 'accepted').length;
  const pendingSessions = Array.from(sessions.values()).filter(s => s.status === 'pending').length;
  
  res.json({
    status: 'OK',
    bot: 'running',
    activeSessions: activeSessions,
    pendingSessions: pendingSessions,
    timestamp: new Date().toISOString(),
    adminId: ADMIN_TELEGRAM_ID
  });
});

// Start bot and web server
async function startBot() {
  try {
    console.log('🚀 Starting Telegram bot...');
    
    // Launch bot with polling
    await bot.launch();
    console.log('✅ Bot started with polling');
    
    // Start web server for webhooks
    app.listen(TELEGRAM_PORT, () => {
      console.log(`🌐 Telegram bot web server on port ${TELEGRAM_PORT}`);
      console.log('✅ Bot is ready and waiting for connections!');
      
      // Send startup message to admin
      setTimeout(() => {
        bot.telegram.sendMessage(ADMIN_TELEGRAM_ID,
          `🤖 *ربات فعال شد*\n\n`
          + `⏰ ${new Date().toLocaleString('fa-IR')}\n`
          + `✅ سیستم پشتیبانی آماده دریافت درخواست‌هاست\n\n`
          + `برای آزمایش، روی یک جلسه در ویجت سایت کلیک کنید.`, {
            parse_mode: 'Markdown'
          }).catch(console.error);
      }, 2000);
    });
    
  } catch (error) {
    console.error('❌ Bot startup failed:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Start
startBot();
