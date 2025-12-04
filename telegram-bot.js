const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

console.log('='.repeat(60));
console.log('🤖 TELEGRAM BOT - SYNCED VERSION');
console.log('='.repeat(60));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'; // تغییر به 3000

if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_ID) {
  console.error('❌ Missing Telegram configuration');
  process.exit(1);
}

console.log('✅ Bot configured');
console.log('✅ Admin:', ADMIN_TELEGRAM_ID);
console.log('✅ Backend:', BACKEND_URL);

// Store sessions - UPDATED
const sessions = new Map(); // shortId -> {sessionId, chatId, userInfo}
const userSessions = new Map(); // chatId -> shortId
const fullIdToShortId = new Map(); // fullId -> shortId (نگاشت معکوس)

// Helper: Generate short ID compatible with backend
function generateShortId(sessionId) {
  if (!sessionId) return 'unknown';
  
  // اگر sessionId از قبل short است
  if (!sessionId.startsWith('session_')) {
    return sessionId;
  }
  
  // استخراج بخش سوم از session_<timestamp>_<random>
  const parts = sessionId.split('_');
  if (parts.length >= 3) {
    return parts[2]; // بخش random
  }
  
  // یا ۸ کاراکتر آخر
  return sessionId.substring(sessionId.length - 8);
}

// Helper: Store session with proper mapping
function storeSession(fullSessionId, userInfo) {
  const shortId = generateShortId(fullSessionId);
  
  sessions.set(shortId, {
    fullId: fullSessionId,
    shortId: shortId,
    userInfo: userInfo || {},
    status: 'pending',
    createdAt: new Date(),
    operatorChatId: null,
    operatorName: null,
    operatorTelegramId: null
  });
  
  fullIdToShortId.set(fullSessionId, shortId);
  
  console.log(`✅ Session stored:`, {
    fullId: fullSessionId.substring(0, 12) + '...',
    shortId: shortId,
    user: userInfo?.name || 'anonymous'
  });
  
  return shortId;
}

// Helper: Get session by full or short ID
function getSession(sessionIdentifier) {
  // اگر shortId است
  let session = sessions.get(sessionIdentifier);
  if (session) return session;
  
  // اگر fullId است
  const shortId = fullIdToShortId.get(sessionIdentifier);
  if (shortId) {
    return sessions.get(shortId);
  }
  
  console.log(`🔍 Session not found: ${sessionIdentifier}`);
  console.log(`   Available shortIds:`, Array.from(sessions.keys()));
  console.log(`   Available fullIds:`, Array.from(fullIdToShortId.keys()).map(k => k.substring(0, 12) + '...'));
  return null;
}

// Helper: Get short ID from full ID
function getShortId(fullSessionId) {
  const session = getSession(fullSessionId);
  return session ? session.shortId : generateShortId(fullSessionId);
}

// Helper: Notify backend
async function notifyBackend(event, data) {
  try {
    const shortId = getShortId(data.sessionId);
    console.log(`📤 Notifying backend (${event}):`, {
      shortId: shortId,
      fullId: data.sessionId?.substring(0, 12) + '...',
      operator: data.operatorName || 'N/A'
    });
    
    const response = await axios.post(`${BACKEND_URL}/telegram-webhook`, {
      event,
      data
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`✅ Backend notified:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`❌ Backend notification failed:`, {
      event: event,
      error: error.message,
      url: `${BACKEND_URL}/telegram-webhook`,
      code: error.code
    });
    
    // تلاش با آدرس جایگزین
    if (BACKEND_URL.includes('localhost')) {
      try {
        const altUrl = BACKEND_URL.replace('localhost', '127.0.0.1');
        console.log(`🔄 Trying alternative URL: ${altUrl}`);
        
        const altResponse = await axios.post(`${altUrl}/telegram-webhook`, {
          event,
          data
        }, { timeout: 8000 });
        
        console.log(`✅ Alternative attempt successful`);
        return { success: true, data: altResponse.data };
      } catch (altError) {
        console.error(`❌ Alternative also failed: ${altError.message}`);
      }
    }
    
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
}

// Create bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Start command
bot.start((ctx) => {
  const welcomeMessage = `👨‍💼 *پنل اپراتور پشتیبانی*\n\n`
    + `سلام ${ctx.from.first_name || 'اپراتور'}! 👋\n\n`
    + `✅ سیستم آماده دریافت پیام‌هاست\n\n`
    + `📋 *دستورات:*\n`
    + `/sessions - نمایش جلسات فعال\n`
    + `/test - تست ارتباط با سرور\n`
    + `/help - راهنمایی\n`
    + `/status - وضعیت سیستم`;
  
  ctx.reply(welcomeMessage, { 
    parse_mode: 'Markdown',
    ...Markup.keyboard([
      ['📋 جلسات فعال', '🔗 تست سرور'],
      ['🆘 راهنما', '📊 وضعیت']
    ]).resize()
  });
});

// Test command
bot.command('test', async (ctx) => {
  try {
    await ctx.reply('🔍 در حال تست ارتباط با سرور...');
    
    // Test backend health
    const healthResponse = await axios.get(`${BACKEND_URL}/api/health`, { timeout: 5000 });
    const sessionsResponse = await axios.get(`${BACKEND_URL}/api/sessions`, { timeout: 5000 });
    
    const message = `✅ *تست موفقیت‌آمیز*\n\n`
      + `🔗 سرور: ${BACKEND_URL}\n`
      + `📊 وضعیت: ${healthResponse.data.status}\n`
      + `👥 جلسات فعال: ${sessionsResponse.data.count || 0}\n`
      + `⏰ زمان: ${new Date().toLocaleTimeString('fa-IR')}`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Test error:', error.message);
    
    const errorMessage = `❌ *خطا در تست سرور*\n\n`
      + `🔗 سرور: ${BACKEND_URL}\n`
      + `📛 خطا: ${error.message}\n\n`
      + `⚠️ لطفاً اتصال سرور را بررسی کنید.`;
    
    await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
  }
});

// Sessions command - UPDATED
bot.command('sessions', async (ctx) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/sessions`);
    const sessionsList = response.data.sessions || [];
    
    if (sessionsList.length === 0) {
      return ctx.reply('📭 *هیچ جلسه فعالی وجود ندارد*', {
        parse_mode: 'Markdown'
      });
    }
    
    let message = `📊 *جلسات فعال (${sessionsList.length}):*\n\n`;
    
    sessionsList.forEach((session, index) => {
      const shortId = session.shortId || generateShortId(session.id);
      const duration = Math.floor((new Date() - new Date(session.createdAt)) / (1000 * 60));
      const minutes = duration % 60;
      const hours = Math.floor(duration / 60);
      
      message += `*${index + 1}. جلسه:* \`${shortId}\`\n`;
      message += `   👤 *کاربر:* ${session.userInfo?.name || 'ناشناس'}\n`;
      message += `   ⏱️ *مدت:* ${hours > 0 ? hours + ' ساعت و ' : ''}${minutes} دقیقه\n`;
      message += `   🔗 *وضعیت:* ${session.connectedToHuman ? 'متصل ✅' : 'در انتظار'}\n`;
      
      if (session.operatorName) {
        message += `   👨‍💼 *اپراتور:* ${session.operatorName}\n`;
      }
      
      message += `\n`;
    });
    
    ctx.reply(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 بروزرسانی', 'refresh_sessions')],
        [Markup.button.callback('🧪 تست ارتباط', 'test_backend')]
      ])
    });
    
  } catch (error) {
    console.error('Sessions error:', error.message);
    ctx.reply('❌ خطا در دریافت جلسات: ' + error.message);
  }
});

// Handle new session from user (via webhook)
async function handleNewUserSession(sessionId, userInfo, userMessage) {
  try {
    console.log(`🎯 Handling new session:`, {
      fullId: sessionId.substring(0, 12) + '...',
      user: userInfo.name || 'anonymous',
      message: userMessage.substring(0, 50)
    });
    
    const shortId = storeSession(sessionId, userInfo);
    const session = getSession(shortId);
    
    const operatorMessage = `🔔 *درخواست اتصال جدید*\n\n`
      + `🎫 *کد جلسه:* \`${shortId}\`\n`
      + `👤 *کاربر:* ${userInfo.name || 'کاربر سایت'}\n`
      + `📧 *ایمیل:* ${userInfo.email || 'ندارد'}\n`
      + `🌐 *صفحه:* ${userInfo.page || 'نامشخص'}\n\n`
      + `📝 *پیام اولیه:*\n${userMessage.substring(0, 200)}${userMessage.length > 200 ? '...' : ''}\n\n`
      + `⏰ *زمان:* ${new Date().toLocaleTimeString('fa-IR')}\n\n`
      + `💬 برای شروع گفتگو کلیک کنید:`;
    
    // Send to admin with callback buttons
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, operatorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ پذیرش گفتگو', `accept_${shortId}`),
          Markup.button.callback('❌ رد درخواست', `reject_${shortId}`)
        ],
        [
          Markup.button.callback('👁️ مشاهده جزئیات', `details_${shortId}`)
        ]
      ])
    });
    
    console.log(`✅ New session notification sent: ${shortId}`);
    return true;
    
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
}

// Handle accept callback - UPDATED
bot.action(/accept_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const session = getSession(shortId);
    
    if (!session) {
      console.error(`Session not found: ${shortId}`);
      return ctx.answerCbQuery('❌ جلسه پیدا نشد');
    }
    
    console.log(`🎯 Operator accepting session: ${shortId}`);
    
    // Update session status
    session.status = 'accepted';
    session.acceptedAt = new Date();
    session.operatorChatId = ctx.chat.id;
    session.operatorName = ctx.from.first_name || 'اپراتور';
    session.operatorTelegramId = ctx.from.id;
    
    // Store operator chat ID
    userSessions.set(ctx.chat.id, shortId);
    
    // Acknowledge callback
    await ctx.answerCbQuery('✅ گفتگو قبول شد');
    
    // Edit message to show acceptance
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n' +
      `✅ *شما این گفتگو را قبول کردید*\n\n` +
      `👤 *اپراتور:* ${ctx.from.first_name || 'اپراتور'}\n` +
      `⏰ *زمان پذیرش:* ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
      `💬 اکنون می‌توانید پیام خود را بنویسید...`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([])
      }
    );
    
    // Notify backend that operator accepted
    const backendResult = await notifyBackend('operator_accepted', { 
      sessionId: session.fullId,
      operatorId: ctx.from.id.toString(),
      operatorName: ctx.from.first_name || 'اپراتور',
      operatorChatId: ctx.chat.id
    });
    
    if (backendResult.success) {
      console.log(`✅ Session ${shortId} accepted and backend notified`);
    } else {
      console.error(`⚠️ Session accepted but backend notification failed: ${backendResult.error}`);
      // Still send message to operator
      await ctx.reply(`⚠️ اخطار: ارسال وضعیت به سرور با مشکل مواجه شد، اما گفتگو آغاز شده است.`);
    }
    
    // Send welcome message to operator
    const welcomeMsg = `🎉 *گفتگو آغاز شد*\n\n`
      + `🎫 *کد جلسه:* \`${shortId}\`\n`
      + `👤 *کاربر:* ${session.userInfo?.name || 'کاربر سایت'}\n`
      + `📧 *ایمیل:* ${session.userInfo?.email || 'ندارد'}\n`
      + `🌐 *از صفحه:* ${session.userInfo?.page || 'نامشخص'}\n\n`
      + `💬 *راهنما:*\n`
      + `• هر پیامی که می‌نویسید به کاربر ارسال می‌شود\n`
      + `• برای پایان گفتگو از /end استفاده کنید\n`
      + `• برای بازگشت به منوی اصلی از /start استفاده کنید`;
    
    await ctx.reply(welcomeMsg, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Accept callback error:', error);
    await ctx.answerCbQuery('❌ خطا در پردازش');
  }
});

// Handle reject callback
bot.action(/reject_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const session = getSession(shortId);
    
    if (!session) {
      return ctx.answerCbQuery('❌ جلسه پیدا نشد');
    }
    
    console.log(`❌ Operator rejecting session: ${shortId}`);
    
    // Remove session
    sessions.delete(shortId);
    if (session.fullId) {
      fullIdToShortId.delete(session.fullId);
    }
    userSessions.delete(ctx.chat.id);
    
    // Acknowledge callback
    await ctx.answerCbQuery('❌ گفتگو رد شد');
    
    // Edit message
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n' +
      `❌ *شما این گفتگو را رد کردید*\n\n` +
      `⏰ زمان: ${new Date().toLocaleTimeString('fa-IR')}`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([])
      }
    );
    
    console.log(`❌ Session ${shortId} rejected by operator`);
    
  } catch (error) {
    console.error('Reject callback error:', error);
    await ctx.answerCbQuery('❌ خطا در پردازش');
  }
});

// Handle details callback
bot.action(/details_(.+)/, async (ctx) => {
  try {
    const shortId = ctx.match[1];
    const session = getSession(shortId);
    
    if (!session) {
      return ctx.answerCbQuery('❌ جلسه پیدا نشد');
    }
    
    await ctx.answerCbQuery('نمایش جزئیات');
    
    const details = `📋 *جزئیات جلسه*\n\n`
      + `🎫 *کد کوتاه:* \`${shortId}\`\n`
      + `🆔 *کد کامل:* \`${session.fullId?.substring(0, 20)}...\`\n`
      + `👤 *کاربر:* ${session.userInfo?.name || 'ناشناس'}\n`
      + `📧 *ایمیل:* ${session.userInfo?.email || 'ندارد'}\n`
      + `📞 *تلفن:* ${session.userInfo?.phone || 'ندارد'}\n`
      + `🌐 *صفحه:* ${session.userInfo?.page || 'نامشخص'}\n`
      + `🔗 *مرجع:* ${session.userInfo?.referrer || 'نامشخص'}\n`
      + `🖥️ *مرورگر:* ${session.userInfo?.userAgent?.substring(0, 50) || 'نامشخص'}\n`
      + `📊 *وضعیت:* ${session.status}\n`
      + `⏰ *زمان ایجاد:* ${session.createdAt.toLocaleTimeString('fa-IR')}`;
    
    await ctx.reply(details, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ پذیرش گفتگو', `accept_${shortId}`)],
        [Markup.button.callback('🔙 بازگشت', 'back_to_sessions')]
      ])
    });
    
  } catch (error) {
    console.error('Details callback error:', error);
    await ctx.answerCbQuery('❌ خطا در نمایش جزئیات');
  }
});

// Back to sessions callback
bot.action('back_to_sessions', async (ctx) => {
  try {
    await ctx.deleteMessage();
    await ctx.answerCbQuery('بازگشت به لیست جلسات');
    
    // Call sessions command
    const fakeCtx = {
      ...ctx,
      reply: (text, options) => ctx.telegram.sendMessage(ctx.chat.id, text, options)
    };
    
    await bot.command('sessions').middleware()(fakeCtx);
    
  } catch (error) {
    console.error('Back to sessions error:', error);
  }
});

// End conversation command
bot.command('end', async (ctx) => {
  const chatId = ctx.chat.id;
  const shortId = userSessions.get(chatId);
  
  if (!shortId) {
    return ctx.reply('📭 *شما جلسه فعالی ندارید*', { parse_mode: 'Markdown' });
  }
  
  const session = getSession(shortId);
  if (!session) {
    return ctx.reply('❌ *جلسه پیدا نشد*', { parse_mode: 'Markdown' });
  }
  
  console.log(`🔚 Ending conversation: ${shortId}`);
  
  // Notify backend
  await notifyBackend('session_ended', {
    sessionId: session.fullId,
    operatorId: ctx.from.id.toString(),
    endedAt: new Date().toISOString()
  });
  
  // Cleanup
  sessions.delete(shortId);
  if (session.fullId) {
    fullIdToShortId.delete(session.fullId);
  }
  userSessions.delete(chatId);
  
  await ctx.reply(`✅ *گفتگو پایان یافت*\n\n`
    + `🎫 کد جلسه: \`${shortId}\`\n`
    + `👤 کاربر: ${session.userInfo?.name || 'کاربر سایت'}\n`
    + `⏰ زمان پایان: ${new Date().toLocaleTimeString('fa-IR')}\n\n`
    + `برای پذیرش گفتگوهای جدید منتظر اعلان‌ها باشید.`, {
    parse_mode: 'Markdown'
  });
});

// Handle operator messages - UPDATED
bot.on('text', async (ctx) => {
  // Skip commands
  if (ctx.message.text.startsWith('/')) return;
  
  const chatId = ctx.chat.id;
  const messageText = ctx.message.text.trim();
  const fromName = ctx.from.first_name || 'اپراتور';
  
  // Check if operator has an active session
  const shortId = userSessions.get(chatId);
  if (!shortId) {
    return ctx.reply('📭 *شما جلسه فعالی ندارید*\n\n'
      + 'منتظر درخواست کاربران باشید یا از /sessions برای مشاهده جلسات استفاده کنید.', {
        parse_mode: 'Markdown'
      });
  }
  
  const session = getSession(shortId);
  if (!session || session.status !== 'accepted') {
    userSessions.delete(chatId);
    return ctx.reply('❌ *این جلسه فعال نیست*\n\n'
      + 'لطفاً یک جلسه جدید را بپذیرید.', {
        parse_mode: 'Markdown'
      });
  }
  
  console.log(`💬 Operator message for session ${shortId}:`, {
    operator: fromName,
    messageLength: messageText.length
  });
  
  try {
    // Send message to user via backend
    const result = await notifyBackend('operator_message', {
      sessionId: session.fullId,
      message: messageText,
      operatorId: ctx.from.id.toString(),
      operatorName: fromName
    });
    
    if (result.success) {
      // Confirm to operator
      await ctx.reply(`✅ *پیام ارسال شد*\n\n`
        + `👤 به کاربر: ${session.userInfo?.name || 'کاربر سایت'}\n`
        + `💬 پیام شما:\n"${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}"`, {
          parse_mode: 'Markdown'
        });
      
      console.log(`📨 Operator ${fromName} sent message for session ${shortId}`);
    } else {
      await ctx.reply('❌ خطا در ارسال پیام به کاربر: ' + (result.error || 'Unknown error'));
    }
    
  } catch (error) {
    console.error('Send message error:', error);
    await ctx.reply('❌ خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.');
  }
});

// Help command
bot.command('help', (ctx) => {
  const helpMessage = `📖 *راهنمای اپراتور:*\n\n`
    + `🔔 *چگونه کار می‌کند:*\n`
    + `1. کاربر در سایت روی "اتصال به اپراتور" کلیک می‌کند\n`
    + `2. درخواست به این ربات ارسال می‌شود\n`
    + `3. شما اعلان را می‌بینید و روی "پذیرش گفتگو" کلیک می‌کنید\n`
    + `4. گفتگو آغاز می‌شود و پیام‌های شما به کاربر ارسال می‌شود\n\n`
    + `⚡ *دستورات:*\n`
    + `/start - شروع مجدد\n`
    + `/sessions - نمایش جلسات فعال\n`
    + `/test - تست ارتباط با سرور\n`
    + `/end - پایان دادن به گفتگو فعلی\n`
    + `/status - وضعیت سیستم\n`
    + `/help - این راهنما\n\n`
    + `💡 *نکات:*\n`
    + `• هر پیامی که می‌نویسید به کاربر ارسال می‌شود\n`
    + `• برای پایان گفتگو از /end استفاده کنید\n`
    + `• می‌توانید چند گفتگو را همزمان مدیریت کنید`;
  
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Status command
bot.command('status', async (ctx) => {
  try {
    const activeSessions = Array.from(sessions.values()).filter(s => s.status === 'accepted').length;
    const pendingSessions = Array.from(sessions.values()).filter(s => s.status === 'pending').length;
    
    const statusMessage = `📊 *وضعیت سیستم*\n\n`
      + `🤖 *ربات:* فعال ✅\n`
      + `👨‍💼 *اپراتور:* ${ctx.from.first_name || 'شما'}\n`
      + `🆔 *شناسه:* ${ctx.from.id}\n\n`
      + `📋 *جلسات:*\n`
      + `   ✅ فعال: ${activeSessions}\n`
      + `   ⏳ در انتظار: ${pendingSessions}\n`
      + `   📊 کل: ${sessions.size}\n\n`
      + `🔗 *سرور:* ${BACKEND_URL}\n`
      + `⏰ *زمان:* ${new Date().toLocaleTimeString('fa-IR')}`;
    
    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Status error:', error);
    await ctx.reply('❌ خطا در دریافت وضعیت');
  }
});

// Handle refresh sessions callback
bot.action('refresh_sessions', async (ctx) => {
  try {
    await ctx.answerCbQuery('در حال بروزرسانی...');
    
    const response = await axios.get(`${BACKEND_URL}/api/sessions`);
    const sessionsList = response.data.sessions || [];
    
    if (sessionsList.length === 0) {
      await ctx.editMessageText('📭 *هیچ جلسه فعالی وجود ندارد*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 بروزرسانی', 'refresh_sessions')]
        ])
      });
      return;
    }
    
    let message = `📊 *جلسات فعال (${sessionsList.length}):*\n\n`;
    
    sessionsList.forEach((session, index) => {
      const shortId = session.shortId || generateShortId(session.id);
      const duration = Math.floor((new Date() - new Date(session.createdAt)) / (1000 * 60));
      
      message += `*${index + 1}. جلسه:* \`${shortId}\`\n`;
      message += `   👤 *کاربر:* ${session.userInfo?.name || 'ناشناس'}\n`;
      message += `   ⏱️ *مدت:* ${duration} دقیقه\n`;
      message += `   🔗 *وضعیت:* ${session.connectedToHuman ? 'متصل ✅' : 'در انتظار'}\n\n`;
    });
    
    await ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 بروزرسانی', 'refresh_sessions')]
      ])
    });
    
  } catch (error) {
    console.error('Refresh sessions error:', error);
    await ctx.answerCbQuery('خطا در بروزرسانی');
  }
});

// Test backend callback
bot.action('test_backend', async (ctx) => {
  try {
    await ctx.answerCbQuery('در حال تست ارتباط...');
    
    const response = await axios.get(`${BACKEND_URL}/api/health`, { timeout: 5000 });
    
    await ctx.reply(`✅ *تست ارتباط موفقیت‌آمیز*\n\n`
      + `🔗 سرور: ${BACKEND_URL}\n`
      + `📊 وضعیت: ${response.data.status}\n`
      + `⏰ زمان پاسخ: ${response.data.timestamp ? new Date(response.data.timestamp).toLocaleTimeString('fa-IR') : 'نامشخص'}`, {
        parse_mode: 'Markdown'
      });
    
  } catch (error) {
    console.error('Test backend error:', error);
    await ctx.answerCbQuery('خطا در تست');
    
    await ctx.reply(`❌ *تست ارتباط ناموفق*\n\n`
      + `🔗 سرور: ${BACKEND_URL}\n`
      + `📛 خطا: ${error.message}`, {
        parse_mode: 'Markdown'
      });
  }
});

// Handle callback query errors
bot.on('callback_query', async (ctx) => {
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Callback query error:', error);
  }
});

// Express web server for webhooks
const app = express();
const webhookPort = process.env.TELEGRAM_PORT || 3001;

app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body).substring(0, 300));
  }
  next();
});

// Webhook from backend - SYNCED VERSION
app.post('/telegram-webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log(`📨 Received webhook: ${event}`, {
      sessionId: data?.sessionId?.substring(0, 12) || 'N/A',
      user: data?.userInfo?.name || 'N/A'
    });
    
    switch (event) {
      case 'new_session':
        const success = await handleNewUserSession(
          data.sessionId,
          data.userInfo || {},
          data.userMessage || 'درخواست اتصال به اپراتور'
        );
        res.json({ 
          success, 
          message: success ? 'Notification sent to operator' : 'Failed to send notification',
          shortId: generateShortId(data.sessionId)
        });
        break;
        
      case 'user_message':
        // Forward user message to operator
        const shortId = getShortId(data.sessionId);
        const session = getSession(shortId);
        
        if (session && session.operatorChatId) {
          const message = `📩 *پیام از کاربر*\n\n`
            + `🎫 *کد جلسه:* \`${shortId}\`\n`
            + `👤 *کاربر:* ${data.userName || session.userInfo?.name || 'کاربر'}\n`
            + `💬 *پیام:*\n${data.message}\n\n`
            + `⏰ *زمان:* ${new Date().toLocaleTimeString('fa-IR')}\n\n`
            + `✏️ برای پاسخ، پیام خود را بنویسید...`;
          
          await bot.telegram.sendMessage(session.operatorChatId, message, {
            parse_mode: 'Markdown'
          });
          
          console.log(`📩 User message forwarded to operator for session ${shortId}`);
          res.json({ success: true, delivered: true, shortId: shortId });
        } else {
          console.log(`⚠️ No operator assigned for session ${shortId}`);
          res.json({ 
            success: false, 
            error: 'No operator assigned to this session',
            shortId: shortId 
          });
        }
        break;
        
      case 'session_ended':
        const endedShortId = getShortId(data.sessionId);
        const endedSession = getSession(endedShortId);
        
        if (endedSession && endedSession.operatorChatId) {
          await bot.telegram.sendMessage(endedSession.operatorChatId,
            `📭 *جلسه به پایان رسید*\n\n`
            + `🎫 کد جلسه: \`${endedShortId}\`\n`
            + `👤 کاربر: ${endedSession.userInfo?.name || 'کاربر سایت'}\n`
            + `✅ گفتگو با موفقیت پایان یافت.\n\n`
            + `⏰ زمان پایان: ${new Date().toLocaleTimeString('fa-IR')}`, {
              parse_mode: 'Markdown'
            });
          
          // Cleanup
          sessions.delete(endedShortId);
          if (endedSession.fullId) {
            fullIdToShortId.delete(endedSession.fullId);
          }
          userSessions.delete(endedSession.operatorChatId);
          
          console.log(`🔚 Session ${endedShortId} ended and cleaned up`);
        }
        res.json({ success: true, ended: true, shortId: endedShortId });
        break;
        
      default:
        console.log(`⚠️ Unknown event: ${event}`);
        res.json({ 
          success: false, 
          error: `Unknown event: ${event}`
        });
    }
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
});

// Health check endpoint - UPDATED
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'telegram-bot',
    version: 'synced-1.0',
    activeSessions: Array.from(sessions.values()).filter(s => s.status === 'accepted').length,
    pendingSessions: Array.from(sessions.values()).filter(s => s.status === 'pending').length,
    operators: new Set(Array.from(sessions.values())
      .map(s => s.operatorChatId)
      .filter(id => id)).size,
    backendUrl: BACKEND_URL,
    backendStatus: 'connected',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/test-backend', async (req, res) => {
  try {
    const healthResponse = await axios.get(`${BACKEND_URL}/api/health`, { timeout: 5000 });
    const sessionsResponse = await axios.get(`${BACKEND_URL}/api/sessions`, { timeout: 5000 });
    
    res.json({
      success: true,
      backend: BACKEND_URL,
      health: healthResponse.data,
      sessions: sessionsResponse.data,
      connection: 'OK',
      telegramBot: 'active',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test backend error:', error);
    res.status(500).json({
      success: false,
      backend: BACKEND_URL,
      error: error.message,
      connection: 'FAILED',
      timestamp: new Date().toISOString()
    });
  }
});

// Clear sessions endpoint (for debugging)
app.get('/clear-sessions', (req, res) => {
  const count = sessions.size;
  sessions.clear();
  fullIdToShortId.clear();
  userSessions.clear();
  
  res.json({
    success: true,
    message: `Cleared ${count} sessions`,
    timestamp: new Date().toISOString()
  });
});

// Start bot
async function startBot() {
  try {
    console.log('🚀 Starting Telegram bot...');
    
    // Use webhook for production (Railway)
    const domain = process.env.RAILWAY_STATIC_URL;
    if (domain) {
      const webhookUrl = `${domain}/telegram-webhook`;
      console.log(`🌐 Setting webhook to: ${webhookUrl}`);
      
      await bot.telegram.setWebhook(webhookUrl);
      
      // Setup webhook endpoint
      app.post('/telegram-webhook-bot', (req, res) => {
        bot.handleUpdate(req.body, res);
      });
    } else {
      // Use polling for local development
      await bot.launch();
      console.log('✅ Bot started with polling');
    }
    
    // Start web server
    app.listen(webhookPort, '0.0.0.0', () => {
      console.log(`🤖 Telegram bot server on port ${webhookPort}`);
      console.log('✅ Bot is ready!');
      console.log('📡 Webhook endpoint: POST /telegram-webhook');
      console.log('🏥 Health check: GET /health');
      console.log('🔗 Test backend: GET /test-backend');
      
      // Send startup message to admin
      setTimeout(async () => {
        try {
          await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID,
            `🤖 *ربات پشتیبانی فعال شد*\n\n`
            + `⏰ ${new Date().toLocaleString('fa-IR')}\n`
            + `✅ سیستم آماده دریافت درخواست‌هاست\n\n`
            + `🔗 *سرور:* ${BACKEND_URL}\n`
            + `📊 *نسخه:* هماهنگ شده\n\n`
            + `برای آزمایش:\n`
            + `1. از /test برای تست ارتباط با سرور\n`
            + `2. منتظر درخواست از کاربران در سایت\n`
            + `3. یا از /sessions برای مشاهده جلسات`, {
              parse_mode: 'Markdown'
            });
          console.log('✅ Startup message sent to admin');
        } catch (error) {
          console.error('Startup message error:', error.message);
        }
      }, 2000);
    });
    
  } catch (error) {
    console.error('❌ Bot startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Error handling
bot.catch((err, ctx) => {
  console.error(`Bot error for ${ctx.updateType}:`, err.message);
  if (ctx.chat && ctx.chat.id === parseInt(ADMIN_TELEGRAM_ID)) {
    ctx.reply(`❌ خطای ربات: ${err.message}`).catch(console.error);
  }
});

// Start the bot
startBot();

module.exports = {
  handleNewUserSession,
  notifyBackend,
  sessions,
  userSessions,
  getSession,
  generateShortId
};
