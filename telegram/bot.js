require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8200429613:AAGTgP5hnOiRIxXc3YJmxvTqwEqhQ4crGkk';
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '7321524568';

console.log('Starting Telegram Bot...');
console.log('Bot Token:', TELEGRAM_BOT_TOKEN ? '✅ Loaded' : '❌ Missing');
console.log('Admin ID:', ADMIN_TELEGRAM_ID);

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    
    if (userId === ADMIN_TELEGRAM_ID) {
        ctx.reply(
            '👨‍💼 سلام ادمین!\n\n' +
            'ربات پشتیبانی آنلاین فعال است.\n\n' +
            'دستورات:\n' +
            '/help - راهنمایی\n' +
            '/status - وضعیت سیستم\n\n' +
            'پیام‌های کاربران به صورت خودکار دریافت می‌شوند.'
        );
    } else {
        ctx.reply(
            '🤖 سلام!\n\n' +
            'این ربات برای پشتیبانی از کاربران سایت طراحی شده است.\n' +
            'برای ارتباط از طریق ویجت چت در سایت اقدام کنید.'
        );
    }
});

bot.command('help', (ctx) => {
    ctx.reply(
        '📖 راهنمای ربات:\n\n' +
        '1. این ربات به صورت خودکار پیام‌های کاربران سایت را دریافت می‌کند\n' +
        '2. برای پاسخ به کاربران، مستقیماً در چت سایت پاسخ دهید\n' +
        '3. سیستم به صورت خودکار پیام‌ها را منتقل می‌کند'
    );
});

bot.command('status', (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (userId === ADMIN_TELEGRAM_ID) {
        ctx.reply(
            '📊 وضعیت سیستم:\n\n' +
            '✅ ربات فعال\n' +
            '🤖 هوش مصنوعی: فعال\n' +
            '👤 ادمین: شما\n' +
            '🆔 آیدی شما: ' + userId + '\n' +
            '⏰ زمان: ' + new Date().toLocaleTimeString('fa-IR')
        );
    } else {
        ctx.reply('این دستور فقط برای ادمین قابل دسترسی است.');
    }
});

// دریافت تمام پیام‌های متنی
bot.on('text', (ctx) => {
    const userId = ctx.from.id.toString();
    const message = ctx.message.text;
    
    if (userId === ADMIN_TELEGRAM_ID && !message.startsWith('/')) {
        ctx.reply(`📤 پیام شما: "${message}"\n\nاین پیام در نسخه کامل به کاربران سایت ارسال می‌شود.`);
    }
});

bot.launch().then(() => {
    console.log('✅ Telegram Bot started successfully!');
    console.log('🤖 Bot is ready to receive messages');
}).catch(error => {
    console.error('❌ Failed to start Telegram bot:', error.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
