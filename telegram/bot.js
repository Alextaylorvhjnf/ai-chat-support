const { Telegraf } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

class TelegramBot {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.adminId = process.env.ADMIN_TELEGRAM_ID;
        this.backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        
        if (!this.token) {
            throw new Error('TELEGRAM_BOT_TOKEN is required');
        }
        
        this.bot = new Telegraf(this.token);
        this.setupBot();
    }
    
    setupBot() {
        // Start command
        this.bot.start((ctx) => {
            ctx.reply(`🤖 ربات پشتیبانی آنلاین\n\n`
                + `این ربات برای ارتباط با اپراتورهای انسانی استفاده می‌شود.\n`
                + `پیام‌های کاربران به صورت خودکار ارسال می‌شوند.\n\n`
                + `برای مشاهده دستورات از /help استفاده کنید.`);
        });
        
        // Help command
        this.bot.help((ctx) => {
            ctx.reply(`📖 راهنمای ربات:\n\n`
                + `/start - شروع کار\n`
                + `/status - وضعیت سیستم\n`
                + `/sessions - جلسات فعال\n`
                + `/broadcast [پیام] - ارسال پیام به همه\n`
                + `/help - این راهنما`);
        });
        
        // Status command
        this.bot.command('status', async (ctx) => {
            try {
                const response = await axios.get(`${this.backendUrl}/api/health`);
                ctx.reply(`✅ سیستم فعال\n`
                    + `🕒 زمان: ${new Date().toLocaleString('fa-IR')}\n`
                    + `🌐 وضعیت: ${response.data.status}`);
            } catch (error) {
                ctx.reply('❌ خطا در ارتباط با سرور');
            }
        });
        
        // Handle all messages
        this.bot.on('text', async (ctx) => {
            // Skip commands
            if (ctx.message.text.startsWith('/')) return;
            
            // Check if message is from admin
            if (ctx.from.id.toString() === this.adminId.toString()) {
                // This is handled by the main backend
                // Messages are processed through WebSocket
                ctx.reply('👨‍💼 شما به عنوان اپراتور وارد شدید.\n\n'
                    + 'پیام‌های کاربران از طریق پنل اصلی ارسال می‌شوند.');
            } else {
                ctx.reply('⚠️ این ربات فقط برای اپراتورها است.\n\n'
                    + 'برای ارتباط با پشتیبانی از وبسایت استفاده کنید.');
            }
        });
        
        // Error handling
        this.bot.catch((err, ctx) => {
            console.error(`Error for ${ctx.updateType}:`, err);
            ctx.reply('❌ خطایی رخ داد. لطفاً مجدداً تلاش کنید.');
        });
        
        // Start bot
        this.bot.launch()
            .then(() => {
                console.log('🤖 Telegram bot is running...');
                
                // Send startup message to admin
                this.bot.telegram.sendMessage(
                    this.adminId,
                    `🚀 ربات تلگرام راه‌اندازی شد\n\n`
                    + `⏰ زمان: ${new Date().toLocaleString('fa-IR')}\n`
                    + `🔗 آماده دریافت پیام‌ها`
                );
            })
            .catch(err => {
                console.error('Failed to start bot:', err);
            });
        
        // Enable graceful stop
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}

// Start bot if this file is run directly
if (require.main === module) {
    try {
        new TelegramBot();
    } catch (error) {
        console.error('Failed to initialize bot:', error);
        process.exit(1);
    }
}

module.exports = TelegramBot;
