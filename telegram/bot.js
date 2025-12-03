// telegram/bot.js
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
require('dotenv').config();

// Load environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8200429613:AAGTgP5hnOiRIxXc3YJmxvTqwEqhQ4crGkk';
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '7321524568';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Initialize bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Store active sessions
const activeSessions = new Map(); // Map<adminChatId, sessionId>

console.log('Telegram Bot Starting...');
console.log('Bot Token:', TELEGRAM_BOT_TOKEN ? 'Set' : 'Not Set');
console.log('Admin ID:', ADMIN_TELEGRAM_ID);
console.log('Backend URL:', BACKEND_URL);

/**
 * Send message to backend WebSocket
 */
async function sendToBackend(sessionId, message) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/telegram-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: sessionId,
        message: message,
        source: 'telegram'
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error sending to backend:', error);
    return false;
  }
}

// Start command
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (chatId.toString() === ADMIN_TELEGRAM_ID) {
    const welcomeMessage = `🤖 <b>ربات پشتیبانی وبسایت</b>\n\n`
      + `سلام اپراتور عزیز!\n`
      + `من ربات پل ارتباطی بین وبسایت و تلگرام هستم.\n\n`
      + `🔹 <b>دستورات موجود:</b>\n`
      + `/sessions - مشاهده جلسات فعال\n`
      + `/help - راهنمایی\n\n`
      + `هرگاه کاربری از وبسایت درخواست اتصال به اپراتور انسانی بدهد، به شما اطلاع می‌دهم.\n`
      + `شما می‌توانید با پاسخ دادن به پیام‌های من، با کاربران صحبت کنید.`;
    
    await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
  } else {
    await ctx.reply('⛔ این ربات فقط برای اپراتورهای پشتیبانی است.');
  }
});

// Sessions command
bot.command('sessions', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (chatId.toString() === ADMIN_TELEGRAM_ID) {
    if (activeSessions.size === 0) {
      await ctx.reply('📭 هیچ جلسه فعالی وجود ندارد.');
    } else {
      let message = `📊 <b>جلسات فعال</b>\n\n`;
