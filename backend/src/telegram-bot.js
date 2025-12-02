const { Telegraf } = require('telegraf');

class TelegramBotManager {
    constructor(sessionManager, io) {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.adminId = process.env.ADMIN_TELEGRAM_ID;
        this.sessionManager = sessionManager;
        this.io = io;
        
        if (!this.botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN is required');
        }
        
        this.bot = new Telegraf(this.botToken);
        this.setupHandlers();
    }
    
    setupHandlers() {
        // Start command
        this.bot.start((ctx) => {
            ctx.reply('🤖 به ربات پشتیبانی خوش آمدید!\n\n' +
                     'این ربات برای ارتباط با کاربران سایت طراحی شده است.\n' +
                     'پیام‌هایی که از کاربران دریافت می‌کنید را اینجا مشاهده کرده و پاسخ دهید.');
        });
        
        // Help command
        this.bot.help((ctx) => {
            ctx.reply('📋 راهنمای ربات:\n\n' +
                     '1. هر پیامی که ارسال کنید به کاربر مرتبط ارسال می‌شود\n' +
                     '2. برای قطع ارتباط دستی با کاربر از /end استفاده کنید\n' +
                     '3. /sessions - مشاهده جلسات فعال\n' +
                     '4. /stats - آمار سیستم');
        });
        
        // List active sessions
        this.bot.command('sessions', (ctx) => {
            if (ctx.from.id.toString() !== this.adminId) {
                return ctx.reply('⛔ فقط ادمین می‌تواند از این دستور استفاده کند.');
            }
            
            const sessions = this.sessionManager.getAllSessions();
            const humanSessions = sessions.filter(s => s.mode === 'human');
            
            if (humanSessions.length === 0) {
                return ctx.reply('📭 هیچ جلسه فعالی وجود ندارد.');
            }
            
            let message = '📊 جلسات فعال انسانی:\n\n';
            humanSessions.forEach((session, index) => {
                message += `${index + 1}. جلسه: ${session.id.substring(0, 8)}\n`;
                message += `   کاربر: ${session.userId}\n`;
                message += `   شروع: ${new Date(session.createdAt).toLocaleTimeString('fa-IR')}\n`;
                message += `   پیام‌ها: ${session.messages?.length || 0}\n\n`;
            });
            
            ctx.reply(message);
        });
        
        // System stats
        this.bot.command('stats', (ctx) => {
            if (ctx.from.id.toString() !== this.adminId) {
                return ctx.reply('⛔ فقط ادمین می‌تواند از این دستور استفاده کند.');
            }
            
            const stats = this.sessionManager.getStats();
            const message = `📈 آمار سیستم:\n\n` +
                           `جلسات فعال: ${stats.activeSessions}\n` +
                           `اتصالات تلگرام: ${stats.telegramConnections}\n` +
                           `اتصالات وب‌سایت: ${stats.userSockets}\n` +
                           `Cache Hits: ${stats.cacheHits}\n` +
                           `Cache Misses: ${stats.cacheMisses}`;
            
            ctx.reply(message);
        });
        
        // End session command
        this.bot.command('end', (ctx) => {
            const chatId = ctx.chat.id.toString();
            const session = this.sessionManager.getSessionByTelegramChatId(chatId);
            
            if (!session) {
                return ctx.reply('⛔ هیچ جلسه فعالی برای این چت وجود ندارد.');
            }
            
            this.sessionManager.disconnectFromTelegram(chatId);
            
            // Notify user on website
            const socketId = this.sessionManager.getSocketId(session.id);
            if (socketId && this.io) {
                this.io.to(socketId).emit('human_disconnected', {
                    message: 'اپراتور انسانی ارتباط را قطع کرد. اکنون با هوش مصنوعی صحبت می‌کنید.'
                });
            }
            
            ctx.reply('✅ ارتباط با کاربر قطع شد. کاربر به حالت هوش مصنوعی بازگشت.');
        });
        
        // Handle all text messages
        this.bot.on('text', async (ctx) => {
            const chatId = ctx.chat.id.toString();
            const messageText = ctx.message.text;
            const fromAdmin = ctx.from.id.toString() === this.adminId;
            
            // Find session for this telegram chat
            const session = this.sessionManager.getSessionByTelegramChatId(chatId);
            
            if (!session) {
                if (fromAdmin) {
                    // Admin can see active sessions
                    const sessions = this.sessionManager.getAllSessions()
                        .filter(s => s.mode === 'human' && !s.telegramChatId);
                    
                    if (sessions.length > 0) {
                        let reply = '📋 جلسات در انتظار اپراتور:\n\n';
                        sessions.forEach((sess, idx) => {
                            reply += `${idx + 1}. ${sess.id.substring(0, 8)} - ${sess.userId}\n`;
                        });
                        reply += '\nبرای اتصال به یک جلسه، آیدی آن را ارسال کنید.';
                        return ctx.reply(reply);
                    } else {
                        return ctx.reply('📭 هیچ جلسه‌ای در انتظار اپراتور نیست.');
                    }
                }
                return ctx.reply('⛔ هیچ جلسه فعالی برای این چت وجود ندارد.');
            }
            
            // Send message to website user
            const socketId = this.sessionManager.getSocketId(session.id);
            if (socketId && this.io) {
                this.io.to(socketId).emit('human_message', {
                    text: messageText,
                    from: 'اپراتور',
                    timestamp: new Date().toISOString()
                });
                
                // Add to session messages
                this.sessionManager.addMessage(session.id, {
                    type: 'human',
                    text: messageText,
                    telegramChatId: chatId
                });
                
                ctx.reply('✅ پیام ارسال شد.');
            } else {
                ctx.reply('⚠️ کاربر آنلاین نیست. پیام ذخیره شد.');
            }
        });
        
        // Handle session connection from admin
        this.bot.on('message', async (ctx) => {
            const messageText = ctx.message.text;
            const fromAdmin = ctx.from.id.toString() === this.adminId;
            
            // Check if message is a session ID (8 chars minimum)
            if (fromAdmin && messageText && messageText.length >= 8) {
                const allSessions = this.sessionManager.getAllSessions();
                const targetSession = allSessions.find(s => 
                    s.id.includes(messageText) || 
                    s.id.substring(0, 8) === messageText
                );
                
                if (targetSession && targetSession.mode === 'human' && !targetSession.telegramChatId) {
                    // Connect this telegram chat to the session
                    this.sessionManager.connectToTelegram(targetSession.id, ctx.chat.id.toString());
                    
                    // Notify user
                    const socketId = this.sessionManager.getSocketId(targetSession.id);
                    if (socketId && this.io) {
                        this.io.to(socketId).emit('human_connected', {
                            message: '✅ به اپراتور انسانی متصل شدید! لطفاً سوال خود را بپرسید.'
                        });
                    }
                    
                    ctx.reply(`✅ به جلسه ${targetSession.id.substring(0, 8)} متصل شدید.\n\n` +
                             `کاربر: ${targetSession.userId}\n` +
                             `پیام‌های قبلی:\n${
                                 targetSession.messages
                                 ?.filter(m => m.type === 'user')
                                 .slice(-3)
                                 .map(m => `- ${m.text}`)
                                 .join('\n') || 'هیچ پیامی وجود ندارد'
                             }`);
                }
            }
        });
        
        // Error handling
        this.bot.catch((err, ctx) => {
            console.error('Telegram Bot Error:', err);
            ctx.reply('⚠️ خطایی در پردازش دستور رخ داد.');
        });
    }
    
    async notifyNewHumanSession(session) {
        try {
            await this.bot.telegram.sendMessage(
                this.adminId,
                `🆕 درخواست جدید پشتیبانی انسانی!\n\n` +
                `جلسه: ${session.id.substring(0, 8)}\n` +
                `کاربر: ${session.userId}\n` +
                `زمان: ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
                `برای اتصال، آیدی "${session.id.substring(0, 8)}" را ارسال کنید.`
            );
        } catch (error) {
            console.error('Failed to notify admin:', error);
        }
    }
    
    async sendToTelegram(telegramChatId, message) {
        try {
            await this.bot.telegram.sendMessage(telegramChatId, message);
            return true;
        } catch (error) {
            console.error('Failed to send to Telegram:', error);
            return false;
        }
    }
    
    start() {
        this.bot.launch()
            .then(() => {
                console.log('🤖 Telegram bot started successfully');
                
                // Enable graceful stop
                process.once('SIGINT', () => this.bot.stop('SIGINT'));
                process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
            })
            .catch(err => {
                console.error('Failed to start Telegram bot:', err);
            });
    }
    
    stop(reason = 'manual') {
        this.bot.stop(reason);
    }
}

function setupTelegramBot(sessionManager, io) {
    try {
        const botManager = new TelegramBotManager(sessionManager, io);
        botManager.start();
        return botManager;
    } catch (error) {
        console.error('Failed to setup Telegram bot:', error);
        return null;
    }
}

module.exports = {
    TelegramBotManager,
    setupTelegramBot
};
