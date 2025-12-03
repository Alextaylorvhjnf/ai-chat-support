const { Telegraf } = require('telegraf');
const axios = require('axios');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/telegram-bot-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/telegram-bot-combined.log' })
  ]
});

class TelegramBot {
  constructor(sessionManager, io) {
    this.sessionManager = sessionManager;
    this.io = io;
    this.bot = null;
    this.adminId = process.env.ADMIN_TELEGRAM_ID;
    this.operatorSessions = new Map(); // operatorId -> [sessionIds]
    
    this.initializeBot();
  }

  initializeBot() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        throw new Error('Telegram bot token is not defined');
      }

      this.bot = new Telegraf(token);
      this.setupCommands();
      this.setupMessageHandlers();
      
      // Start bot
      this.bot.launch()
        .then(() => {
          logger.info('🤖 Telegram bot started successfully');
          console.log('✅ Telegram bot is running');
          
          // Send startup notification to admin
          this.sendToAdmin('🚀 ربات پشتیبانی آنلاین راه‌اندازی شد\n\n'
            + 'دستورات قابل استفاده:\n'
            + '/sessions - مشاهده جلسات فعال\n'
            + '/stats - آمار ربات\n'
            + '/help - راهنما');
        })
        .catch(error => {
          logger.error('Failed to start Telegram bot:', error);
          console.error('❌ Failed to start Telegram bot:', error.message);
        });

      // Enable graceful stop
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));

    } catch (error) {
      logger.error('Error initializing Telegram bot:', error);
      console.error('❌ Error initializing Telegram bot:', error.message);
    }
  }

  setupCommands() {
    // Start command
    this.bot.start((ctx) => {
      const welcomeMessage = `👨‍💼 پنل اپراتور پشتیبانی آنلاین\n\n`
        + `شما به عنوان اپراتور انسانی متصل شدید.\n`
        + `پیام‌های کاربران به صورت خودکار برای شما ارسال می‌شود.\n\n`
        + `دستورات:\n`
        + `/sessions - مشاهده جلسات فعال\n`
        + `/stats - آمار سیستم\n`
        + `/help - راهنمایی\n\n`
        + `برای پاسخ به کاربر، فقط پیام خود را بنویسید.`;
      
      ctx.reply(welcomeMessage);
    });

    // List active sessions
    this.bot.command('sessions', (ctx) => {
      if (!this.isOperator(ctx.from.id)) {
        return ctx.reply('⚠️ شما دسترسی لازم را ندارید.');
      }

      const activeSessions = this.sessionManager.getHumanConnectedSessions();
      
      if (activeSessions.length === 0) {
        return ctx.reply('📭 هیچ جلسه فعالی وجود ندارد.');
      }

      let message = `📊 جلسات فعال (${activeSessions.length}):\n\n`;
      
      activeSessions.forEach((session, index) => {
        const duration = Math.floor((new Date() - session.createdAt) / (1000 * 60)); // minutes
        const messageCount = session.messages.length;
        
        message += `${index + 1}. جلسه: ${session.id.substring(0, 8)}...\n`;
        message += `   👤 کاربر: ${session.userInfo.name || 'ناشناس'}\n`;
        message += `   💬 پیام‌ها: ${messageCount}\n`;
        message += `   ⏱️ مدت: ${duration} دقیقه\n`;
        message += `   🔗 /connect_${session.id.substring(0, 8)}\n\n`;
      });

      ctx.reply(message);
    });

    // Statistics
    this.bot.command('stats', (ctx) => {
      if (!this.isOperator(ctx.from.id)) {
        return ctx.reply('⚠️ شما دسترسی لازم را ندارید.');
      }

      const stats = this.sessionManager.getStats();
      const now = new Date();
      
      const statsMessage = `📈 آمار سیستم:\n\n`
        + `⏰ زمان: ${now.toLocaleTimeString('fa-IR')}\n`
        + `📅 تاریخ: ${now.toLocaleDateString('fa-IR')}\n\n`
        + `📊 آمار جلسات:\n`
        + `   • کل جلسات: ${stats.totalSessions}\n`
        + `   • جلسات فعال: ${stats.activeSessions}\n`
        + `   • متصل به اپراتور: ${stats.humanConnectedSessions}\n`
        + `   • میانگین پیام: ${stats.averageMessages.toFixed(1)}\n\n`
        + `👥 اپراتورهای آنلاین: ${this.operatorSessions.size}`;

      ctx.reply(statsMessage);
    });

    // Help command
    this.bot.command('help', (ctx) => {
      const helpMessage = `📖 راهنمای اپراتور:\n\n`
        + `1. کاربران از طریق وبسایت با سیستم چت می‌کنند.\n`
        + `2. اگر AI نتواند پاسخ دهد، به شما متصل می‌شوند.\n`
        + `3. برای پاسخ، فقط پیام خود را بنویسید.\n\n`
        + `🔧 دستورات:\n`
        + `/start - شروع کار\n`
        + `/sessions - لیست جلسات\n`
        + `/stats - آمار سیستم\n`
        + `/help - این راهنما\n\n`
        + `💡 نکته: هر پیامی که می‌نویسید به آخرین جلسه فعال شما ارسال می‌شود.`;

      ctx.reply(helpMessage);
    });
  }

  setupMessageHandlers() {
    // Handle text messages from operators
    this.bot.on('text', async (ctx) => {
      const operatorId = ctx.from.id;
      const messageText = ctx.message.text;
      
      // Skip if it's a command
      if (messageText.startsWith('/')) {
        return;
      }

      // Check if operator is authorized
      if (!this.isOperator(operatorId)) {
        return ctx.reply('⚠️ شما دسترسی لازم برای پاسخ‌گویی ندارید.');
      }

      // Get active session for this operator
      const sessionId = this.getOperatorActiveSession(operatorId);
      if (!sessionId) {
        return ctx.reply('⚠️ شما هیچ جلسه فعالی ندارید. از /sessions برای مشاهده جلسات استفاده کنید.');
      }

      // Send message to user via WebSocket
      await this.sendToUser(sessionId, messageText, operatorId);
      
      // Confirm to operator
      ctx.reply(`✅ پیام شما ارسال شد.\n\n`
        + `📝 برای پایان گفتگو، از کاربر بخواهید "پایان" یا "ممنون" بگوید.\n`
        + `🔗 جلسه: ${sessionId.substring(0, 8)}...`);
    });
  }

  async connectToOperator(sessionId, userInfo = {}) {
    try {
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Find available operator (admin)
      const operatorId = this.adminId;
      
      // Connect session to operator
      session.connectToHuman(ctx.chat.id, operatorId);
      
      // Track operator session
      this.operatorSessions.set(operatorId, sessionId);
      
      // Notify operator
      const userMessage = `🔔 درخواست اتصال جدید:\n\n`
        + `🎫 کد جلسه: ${sessionId}\n`
        + `👤 کاربر: ${userInfo.name || 'ناشناس'}\n`
        + `📧 ایمیل: ${userInfo.email || 'ندارد'}\n`
        + `📱 تلفن: ${userInfo.phone || 'ندارد'}\n\n`
        + `📝 آخرین پیام کاربر:\n"${session.messages.slice(-1)[0]?.content || 'بدون پیام'}"\n\n`
        + `💬 برای پاسخ، پیام خود را بنویسید...`;

      await this.sendToAdmin(userMessage);
      
      // Notify user via WebSocket
      this.io.to(sessionId).emit('operator-connected', {
        message: 'اپراتور انسانی متصل شد. در حال حاضر می‌توانید چت کنید.',
        operatorName: 'پشتیبان آنلاین'
      });

      logger.info(`Session ${sessionId} connected to operator ${operatorId}`);
      
      return {
        success: true,
        operatorId: operatorId,
        sessionId: sessionId
      };

    } catch (error) {
      logger.error('Error connecting to operator:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendToOperator(sessionId, message) {
    try {
      const session = this.sessionManager.getSession(sessionId);
      if (!session || !session.connectedToHuman) {
        throw new Error('Session not connected to operator');
      }

      // Send message to operator
      const operatorMessage = `📩 پیام از کاربر:\n\n`
        + `🎫 جلسه: ${sessionId.substring(0, 8)}...\n`
        + `👤 کاربر: ${session.userInfo.name || 'ناشناس'}\n`
        + `💬 پیام:\n"${message}"\n\n`
        + `✏️ برای پاسخ، پیام خود را بنویسید...`;

      await this.bot.telegram.sendMessage(session.operatorId, operatorMessage);
      
      // Add to session
      session.addMessage('user', message);
      
      return {
        success: true,
        message: 'پیام ارسال شد'
      };

    } catch (error) {
      logger.error('Error sending to operator:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendToUser(sessionId, message, operatorId) {
    try {
      // Send via WebSocket
      this.io.to(sessionId).emit('operator-message', {
        from: 'operator',
        message: message,
        timestamp: new Date().toISOString(),
        operatorId: operatorId
      });

      // Add to session
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        session.addMessage('operator', message);
      }

      logger.info(`Message sent to user in session ${sessionId}`);
      return true;

    } catch (error) {
      logger.error('Error sending to user:', error);
      return false;
    }
  }

  async sendToAdmin(message) {
    try {
      await this.bot.telegram.sendMessage(this.adminId, message);
      return true;
    } catch (error) {
      logger.error('Error sending to admin:', error);
      return false;
    }
  }

  isOperator(userId) {
    // Currently only admin is operator
    return userId.toString() === this.adminId.toString();
  }

  getOperatorActiveSession(operatorId) {
    return this.operatorSessions.get(operatorId);
  }

  disconnectOperator(operatorId) {
    const sessionId = this.operatorSessions.get(operatorId);
    if (sessionId) {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        session.disconnectFromHuman();
      }
      this.operatorSessions.delete(operatorId);
      
      // Notify user
      this.io.to(sessionId).emit('operator-disconnected', {
        message: 'اپراتور از گفتگو خارج شد. اگر سوال دیگری دارید بپرسید.'
      });
      
      return true;
    }
    return false;
  }

  // Broadcast message to all operators
  broadcastToOperators(message) {
    // Currently only admin
    this.sendToAdmin(`📢 اعلان سیستم:\n\n${message}`);
  }
}

module.exports = TelegramBot;
