const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const axios = require('axios');
const NodeCache = require('node-cache');
const { Telegraf } = require('telegraf');
require('dotenv').config();

// ==================== تنظیمات ====================
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID);
const SHOP_API_URL = 'https://shikpooshaan.ir/ai-shop-api.php';

// ==================== لینک‌های سایت ====================
const SITE_LINKS = {
    faq: "https://shikpooshaan.ir",
    buying_guide: "https://shikpooshaan.ir/%d8%b1%d8%a7%d9%87%d9%86%d9%85%d8%a7%db%8c-%d8%ae%d8%b1%db%8c%d8%af/",
    rules: "https://shikpooshaan.ir/%d9%82%d9%88%d8%a7%d9%86%db%8c%d9%86/",
    refund: "https://shikpooshaan.ir/refund_returns-2/",
    about: "https://shikpooshaan.ir/about-us/"
};

// ==================== سرور ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== کش ====================
const cache = new NodeCache({ stdTTL: 7200 });
const botSessions = new Map();

const getSession = (id) => {
    let s = cache.get(id);
    if (!s) {
        s = { 
            id, 
            messages: [], 
            userInfo: {}, 
            connectedToHuman: false,
            awaitingTrackingCode: false,
            lastOrderInfo: null
        };
        cache.set(id, s);
    }
    return s;
};

// ==================== سیستم منو ====================
const MENUS = {
    // منوی اصلی - فقط دکمه‌های قابل کلیک
    main: {
        text: "🎯 **به پشتیبانی هوشمند شیک‌پوشان خوش آمدید!**\n\n" +
              "لطفاً یکی از گزینه‌های زیر را انتخاب کنید:",
        buttons: [
            { id: 'track_order', text: "📦 پیگیری سفارش", type: "button" },
            { id: 'faq', text: "❓ سوالات متداول", type: "link", url: SITE_LINKS.faq },
            { id: 'buying_guide', text: "🛍️ راهنمای خرید", type: "link", url: SITE_LINKS.buying_guide },
            { id: 'rules', text: "📜 قوانین و مقررات", type: "link", url: SITE_LINKS.rules },
            { id: 'refund', text: "🔄 بازگشت و تعویض کالا", type: "link", url: SITE_LINKS.refund },
            { id: 'about', text: "🏢 درباره ما", type: "link", url: SITE_LINKS.about },
            { id: 'app_download', text: "📱 دانلود اپلیکیشن", type: "button" },
            { id: 'connect_human', text: "👤 اتصال به اپراتور انسانی", type: "button" }
        ],
        columns: 2
    },
    
    // منوی پیگیری سفارش
    track_order: {
        text: "📦 **پیگیری سفارش**\n\n" +
              "برای پیگیری سفارش خود، کد پیگیری را وارد کنید.\n" +
              "کد پیگیری معمولاً یک عدد ۴ تا ۲۰ رقمی است که پس از ثبت سفارش دریافت کرده‌اید.",
        buttons: [
            { id: 'enter_tracking_code', text: "🎫 وارد کردن کد پیگیری", type: "input" },
            { id: 'back_to_main', text: "🔙 بازگشت به منوی اصلی", type: "button" }
        ],
        columns: 2
    },
    
    // دانلود اپلیکیشن
    app_download: {
        text: "📱 **دانلود اپلیکیشن شیک‌پوشان**\n\n" +
              "برای دانلود اپلیکیشن، به لینک زیر مراجعه کنید:\n\n" +
              "🔗 https://shikpooshaan.ir/app-download\n\n" +
              "ویژگی‌های اپلیکیشن:\n" +
              "• مشاهده محصولات جدید\n" +
              "• پیگیری آسان سفارشات\n" +
              "• تخفیف‌های ویژه\n" +
              "• خرید سریع و آسان",
        buttons: [
            { id: 'back_to_main', text: "🔙 بازگشت به منوی اصلی", type: "button" }
        ],
        columns: 1
    },
    
    // تایید اتصال به اپراتور
    confirm_operator: {
        text: "👤 **اتصال به اپراتور انسانی**\n\n" +
              "آیا مطمئن هستید که می‌خواهید با اپراتور انسانی صحبت کنید؟\n\n" +
              "⚠️ **توجه:**\n" +
              "• زمان انتظار ممکن است چند دقیقه باشد\n" +
              "• لطفاً فقط برای موارد ضروری از این گزینه استفاده کنید\n" +
              "• برای سوالات ساده از گزینه‌های دیگر استفاده نمایید",
        buttons: [
            { id: 'confirm_operator_yes', text: "✅ بله، متصل شوید", type: "button" },
            { id: 'confirm_operator_no', text: "❌ خیر، بازگشت", type: "button" }
        ],
        columns: 2
    }
};

// ==================== تولید منو با فرمت مناسب ====================
function generateMenu(menuType, extraData = null) {
    const menu = MENUS[menuType];
    if (!menu) return { text: "منو یافت نشد", buttons: [] };
    
    let response = {
        text: menu.text,
        menu: menuType,
        buttons: menu.buttons.map(btn => ({
            id: btn.id,
            text: btn.text,
            type: btn.type,
            url: btn.url || null
        })),
        columns: menu.columns || 2
    };
    
    // اگر اطلاعات اضافی داریم
    if (extraData) {
        if (extraData.orderInfo) {
            response.text += `\n\n📊 **اطلاعات سفارش:**\n` +
                           `🆔 کد: ${extraData.orderInfo.number}\n` +
                           `👤 مشتری: ${extraData.orderInfo.customer_name}\n` +
                           `📅 تاریخ: ${extraData.orderInfo.date}\n` +
                           `🟢 وضعیت: ${extraData.orderInfo.status}\n` +
                           `💰 مبلغ: ${Number(extraData.orderInfo.total).toLocaleString('fa-IR')} تومان`;
        }
        
        if (extraData.trackingCode) {
            response.text = `🎫 **کد پیگیری وارد شد:** ${extraData.trackingCode}\n\n` + response.text;
        }
    }
    
    return response;
}

// ==================== ارتباط با API سایت ====================
async function callShopAPI(action, data = {}) {
    try {
        const response = await axios.post(SHOP_API_URL, {
            action,
            ...data
        }, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        return response.data;
        
    } catch (error) {
        console.error('❌ خطای API:', error.message);
        return { error: true, message: 'خطا در ارتباط با سایت' };
    }
}

// ==================== پیگیری سفارش ====================
async function trackOrder(trackingCode) {
    try {
        const result = await callShopAPI('track_order', { tracking_code: trackingCode });
        
        if (result.found) {
            return {
                success: true,
                order: result.order,
                message: 'سفارش پیدا شد'
            };
        }
        
        return {
            success: false,
            message: 'سفارش یافت نشد'
        };
        
    } catch (error) {
        return {
            success: false,
            message: 'خطا در پیگیری'
        };
    }
}

// ==================== ربات تلگرام ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.action(/accept_(.+)/, async (ctx) => {
    const short = ctx.match[1];
    const info = botSessions.get(short);
    
    if (!info) return ctx.answerCbQuery('منقضی شده');
    
    botSessions.set(short, { ...info, chatId: ctx.chat.id });
    getSession(info.fullId).connectedToHuman = true;
    
    await ctx.answerCbQuery('پذیرفته شد');
    await ctx.editMessageText(`✅ شما چت ${short} را پذیرفتید`);
    
    io.to(info.fullId).emit('operator-connected', {
        message: '👤 **اپراتور انسانی متصل شد!**\n\nلطفاً سوال یا مشکل خود را مطرح کنید.'
    });
});

bot.action(/reject_(.+)/, async (ctx) => {
    const short = ctx.match[1];
    botSessions.delete(short);
    await ctx.answerCbQuery('رد شد');
});

bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    
    const entry = [...botSessions.entries()].find(([_, v]) => v.chatId === ctx.chat.id);
    if (!entry) return;
    
    const [short, info] = entry;
    
    io.to(info.fullId).emit('operator-message', { 
        message: ctx.message.text,
        from: 'اپراتور'
    });
    
    await ctx.reply('✅ ارسال شد');
});

app.post('/telegram-webhook', (req, res) => bot.handleUpdate(req.body, res));

// ==================== API سلامت ====================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        time: new Date().toLocaleString('fa-IR'),
        api: SHOP_API_URL,
        sessions: cache.keys().length
    });
});

// ==================== سیستم چت منو محور ====================
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId, userInfo } = req.body;
        
        if (!message || !sessionId) {
            return res.status(400).json({ error: 'داده ناقص' });
        }
        
        const session = getSession(sessionId);
        if (userInfo) {
            session.userInfo = { ...session.userInfo, ...userInfo };
        }
        
        session.messages.push({ 
            role: 'user', 
            content: message,
            timestamp: new Date() 
        });
        
        // ========== اگر منتظر کد پیگیری هستیم ==========
        if (session.awaitingTrackingCode) {
            session.awaitingTrackingCode = false;
            
            // بررسی کد عددی
            const codeMatch = message.match(/\b(\d{4,20})\b/);
            
            if (codeMatch) {
                const trackingCode = codeMatch[1];
                const trackResult = await trackOrder(trackingCode);
                
                if (trackResult.success) {
                    const order = trackResult.order;
                    session.lastOrderInfo = order;
                    
                    const orderInfoText = `✅ **سفارش شما پیدا شد!** 🎉\n\n` +
                                         `📦 **کد سفارش:** ${order.number}\n` +
                                         `👤 **مشتری:** ${order.customer_name}\n` +
                                         `📅 **تاریخ:** ${order.date}\n` +
                                         `🟢 **وضعیت:** ${order.status}\n` +
                                         `💰 **مبلغ:** ${Number(order.total).toLocaleString('fa-IR')} تومان\n\n` +
                                         `🛍️ **محصولات:**\n` +
                                         `${order.items.map((item, i) => `${i+1}. ${item}`).join('\n')}\n\n`;
                    
                    const finalText = orderInfoText + 
                                    "🎯 **پیگیری شما کامل شد!**\n\n" +
                                    "اگر سوال دیگری دارید، می‌توانید با زدن دکمه «اتصال به اپراتور انسانی» با اپراتور در تماس باشید.";
                    
                    session.messages.push({ role: 'assistant', content: finalText });
                    
                    return res.json({ 
                        success: true, 
                        message: finalText,
                        menu: 'main',
                        orderFound: true,
                        finalMessage: true
                    });
                    
                } else {
                    const errorText = `❌ **سفارشی با کد ${codeMatch[1]} یافت نشد!**\n\n` +
                                     "لطفاً:\n" +
                                     "۱. کد را مجدداً بررسی کنید\n" +
                                     "۲. یا به منوی اصلی بازگردید\n\n" +
                                     "اگر مشکل ادامه داشت، می‌توانید با زدن دکمه «اتصال به اپراتور انسانی» با اپراتور در تماس باشید.";
                    
                    session.messages.push({ role: 'assistant', content: errorText });
                    
                    return res.json({ 
                        success: true, 
                        message: errorText,
                        menu: 'track_order',
                        error: true
                    });
                }
            } else {
                // اگر کد عددی وارد نکرد
                const errorText = "❌ **لطفاً فقط عدد وارد کنید!**\n\n" +
                                 "کد پیگیری باید یک عدد ۴ تا ۲۰ رقمی باشد.\n" +
                                 "مثال: 123456789\n\n" +
                                 "لطفاً مجدداً کد پیگیری خود را وارد کنید:";
                
                session.awaitingTrackingCode = true;
                session.messages.push({ role: 'assistant', content: errorText });
                
                return res.json({ 
                    success: true, 
                    message: errorText,
                    menu: 'track_order',
                    awaitingInput: true
                });
            }
        }
        
        // ========== پردازش دکمه‌ها ==========
        switch(message) {
            // ===== منوی اصلی =====
            case 'main':
            case 'منو':
            case 'start':
            case 'شروع':
                session.awaitingTrackingCode = false;
                const mainMenu = generateMenu('main');
                session.messages.push({ role: 'assistant', content: mainMenu.text });
                return res.json({ success: true, ...mainMenu });
                
            // ===== پیگیری سفارش =====
            case 'track_order':
            case 'پیگیری':
                session.awaitingTrackingCode = false;
                const trackMenu = generateMenu('track_order');
                session.messages.push({ role: 'assistant', content: trackMenu.text });
                return res.json({ success: true, ...trackMenu });
                
            // ===== وارد کردن کد پیگیری =====
            case 'enter_tracking_code':
                session.awaitingTrackingCode = true;
                const inputText = "🎫 **لطفاً کد پیگیری خود را وارد کنید:**\n\n" +
                                 "کد پیگیری معمولاً یک عدد ۴ تا ۲۰ رقمی است که پس از ثبت سفارش دریافت کرده‌اید.\n\n" +
                                 "⚠️ **توجه:** لطفاً فقط عدد وارد کنید.";
                session.messages.push({ role: 'assistant', content: inputText });
                return res.json({ 
                    success: true, 
                    message: inputText,
                    menu: 'track_order',
                    awaitingInput: true
                });
                
            // ===== بازگشت به منوی اصلی =====
            case 'back_to_main':
                session.awaitingTrackingCode = false;
                const mainMenuReturn = generateMenu('main');
                session.messages.push({ role: 'assistant', content: mainMenuReturn.text });
                return res.json({ success: true, ...mainMenuReturn });
                
            // ===== سوالات متداول (لینک) =====
            case 'faq':
                const faqText = "❓ **سوالات متداول**\n\n" +
                               "برای مشاهده سوالات متداول، به لینک زیر مراجعه کنید:\n\n" +
                               `🔗 ${SITE_LINKS.faq}\n\n` +
                               "پس از مطالعه، برای بازگشت به منوی اصلی، دکمه «بازگشت به منوی اصلی» را بزنید.";
                session.messages.push({ role: 'assistant', content: faqText });
                return res.json({ 
                    success: true, 
                    message: faqText,
                    menu: 'main',
                    isLink: true
                });
                
            // ===== راهنمای خرید (لینک) =====
            case 'buying_guide':
                const guideText = "🛍️ **راهنمای خرید**\n\n" +
                                 "برای مشاهده راهنمای کامل خرید، به لینک زیر مراجعه کنید:\n\n" +
                                 `🔗 ${SITE_LINKS.buying_guide}\n\n` +
                                 "پس از مطالعه، برای بازگشت به منوی اصلی، دکمه «بازگشت به منوی اصلی» را بزنید.";
                session.messages.push({ role: 'assistant', content: guideText });
                return res.json({ 
                    success: true, 
                    message: guideText,
                    menu: 'main',
                    isLink: true
                });
                
            // ===== قوانین و مقررات (لینک) =====
            case 'rules':
                const rulesText = "📜 **قوانین و مقررات**\n\n" +
                                 "برای مطالعه قوانین و مقررات سایت، به لینک زیر مراجعه کنید:\n\n" +
                                 `🔗 ${SITE_LINKS.rules}\n\n` +
                                 "پس از مطالعه، برای بازگشت به منوی اصلی، دکمه «بازگشت به منوی اصلی» را بزنید.";
                session.messages.push({ role: 'assistant', content: rulesText });
                return res.json({ 
                    success: true, 
                    message: rulesText,
                    menu: 'main',
                    isLink: true
                });
                
            // ===== بازگشت و تعویض کالا (لینک) =====
            case 'refund':
                const refundText = "🔄 **بازگشت و تعویض کالا**\n\n" +
                                  "برای مطالعه شرایط بازگشت و تعویض کالا، به لینک زیر مراجعه کنید:\n\n" +
                                  `🔗 ${SITE_LINKS.refund}\n\n` +
                                  "پس از مطالعه، برای بازگشت به منوی اصلی، دکمه «بازگشت به منوی اصلی» را بزنید.";
                session.messages.push({ role: 'assistant', content: refundText });
                return res.json({ 
                    success: true, 
                    message: refundText,
                    menu: 'main',
                    isLink: true
                });
                
            // ===== درباره ما (لینک) =====
            case 'about':
                const aboutText = "🏢 **درباره ما**\n\n" +
                                 "برای آشنایی بیشتر با شیک‌پوشان، به لینک زیر مراجعه کنید:\n\n" +
                                 `🔗 ${SITE_LINKS.about}\n\n` +
                                 "پس از مطالعه، برای بازگشت به منوی اصلی، دکمه «بازگشت به منوی اصلی» را بزنید.";
                session.messages.push({ role: 'assistant', content: aboutText });
                return res.json({ 
                    success: true, 
                    message: aboutText,
                    menu: 'main',
                    isLink: true
                });
                
            // ===== دانلود اپلیکیشن =====
            case 'app_download':
                const appMenu = generateMenu('app_download');
                session.messages.push({ role: 'assistant', content: appMenu.text });
                return res.json({ success: true, ...appMenu });
                
            // ===== اتصال به اپراتور =====
            case 'connect_human':
                const confirmMenu = generateMenu('confirm_operator');
                session.messages.push({ role: 'assistant', content: confirmMenu.text });
                return res.json({ success: true, ...confirmMenu });
                
            // ===== تأیید اتصال به اپراتور =====
            case 'confirm_operator_yes':
                const short = sessionId.substring(0, 12);
                botSessions.set(short, {
                    fullId: sessionId,
                    userInfo: session.userInfo || {},
                    chatId: null,
                    createdAt: new Date()
                });
                
                // اطلاع به تلگرام
                await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, 
                    `🔔 **درخواست اتصال به اپراتور**\n\n` +
                    `👤 کد جلسه: ${short}\n` +
                    `📊 تاریخچه: ${session.messages.length} پیام\n` +
                    `🕐 زمان: ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
                    `آخرین پیام کاربر: "${session.messages[session.messages.length - 1]?.content || 'ندارد'}"`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ پذیرش درخواست', callback_data: `accept_${short}` },
                                { text: '❌ رد درخواست', callback_data: `reject_${short}` }
                            ]]
                        }
                    }
                );
                
                const operatorText = "👤 **درخواست شما ثبت شد!**\n\n" +
                                   "کارشناسان ما در تلگرام مطلع شدند و به زودی با شما ارتباط برقرار می‌کنند.\n\n" +
                                   "⏳ **لطفاً منتظر بمانید...**\n" +
                                   `کد جلسه شما: **${short}**\n\n` +
                                   "اگر نیاز به بازگشت دارید، دکمه «بازگشت به منوی اصلی» را بزنید.";
                
                session.messages.push({ role: 'assistant', content: operatorText });
                return res.json({ 
                    success: true, 
                    message: operatorText,
                    menu: 'main',
                    operatorRequested: true,
                    sessionCode: short
                });
                
            // ===== رد اتصال به اپراتور =====
            case 'confirm_operator_no':
                const mainMenuNo = generateMenu('main');
                session.messages.push({ role: 'assistant', content: mainMenuNo.text });
                return res.json({ success: true, ...mainMenuNo });
                
            // ===== پاسخ پیش‌فرض برای متن آزاد =====
            default:
                // اگر متن وارد کرد (که نباید بکند)
                const warningText = "⚠️ **لطفاً فقط از دکمه‌ها استفاده کنید!**\n\n" +
                                   "سیستم ما فقط از طریق دکمه‌ها کار می‌کند.\n\n" +
                                   "لطفاً یکی از دکمه‌های زیر را انتخاب کنید:";
                
                const mainMenuWarning = generateMenu('main');
                const combinedText = warningText + "\n\n" + mainMenuWarning.text;
                
                session.messages.push({ role: 'assistant', content: combinedText });
                return res.json({ 
                    success: true, 
                    message: combinedText,
                    ...mainMenuWarning,
                    warning: true
                });
        }
        
    } catch (error) {
        console.error('❌ خطا در سیستم چت:', error);
        
        const errorText = "⚠️ **خطا در سیستم!**\n\n" +
                         "متأسفانه سیستم موقتاً با مشکل مواجه شده.\n\n" +
                         "لطفاً:\n" +
                         "۱. چند لحظه صبر کنید\n" +
                         "۲. صفحه را رفرش کنید\n" +
                         "۳. یا بعداً تلاش کنید\n\n" +
                         "با تشکر از صبر شما 🙏";
        
        return res.json({ 
            success: false, 
            message: errorText,
            error: true
        });
    }
});

// ==================== API شروع چت ====================
app.post('/api/start-chat', (req, res) => {
    try {
        const { sessionId, userInfo } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'شناسه جلسه الزامی است' });
        }
        
        const session = getSession(sessionId);
        if (userInfo) {
            session.userInfo = { ...session.userInfo, ...userInfo };
        }
        
        const welcomeText = "🎉 **به پشتیبانی هوشمند شیک‌پوشان خوش آمدید!**\n\n" +
                          "من اینجا هستم تا در زمینه‌های زیر کمکتان کنم:\n\n" +
                          "📦 پیگیری سفارش\n" +
                          "🛍️ راهنمایی خرید\n" +
                          "❓ پاسخ به سوالات\n" +
                          "👤 ارتباط با اپراتور\n\n" +
                          "**لطفاً یکی از دکمه‌های زیر را انتخاب کنید:**";
        
        const mainMenu = generateMenu('main');
        const combinedText = welcomeText + "\n\n" + mainMenu.text;
        
        session.messages.push({ 
            role: 'assistant', 
            content: combinedText,
            timestamp: new Date() 
        });
        
        res.json({ 
            success: true, 
            message: combinedText,
            ...mainMenu,
            sessionId: sessionId,
            welcome: true
        });
        
    } catch (error) {
        console.error('❌ خطا در شروع چت:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== سوکت ====================
io.on('connection', (socket) => {
    socket.on('join-session', (sessionId) => {
        socket.join(sessionId);
    });
    
    socket.on('user-message', async ({ sessionId, message }) => {
        if (!sessionId || !message) return;
        
        const short = sessionId.substring(0, 12);
        const info = botSessions.get(short);
        
        if (info?.chatId) {
            await bot.telegram.sendMessage(info.chatId, 
                `💬 **پیام جدید از کاربر**\n\n` +
                `🔢 کد: ${short}\n` +
                `📝 پیام: ${message}\n\n` +
                `🕐 ${new Date().toLocaleTimeString('fa-IR')}`);
        }
    });
    
    socket.on('user-file', async ({ sessionId, fileName, fileBase64 }) => {
        const short = sessionId.substring(0, 12);
        const info = botSessions.get(short);
        
        if (info?.chatId) {
            try {
                const buffer = Buffer.from(fileBase64, 'base64');
                await bot.telegram.sendDocument(info.chatId, {
                    source: buffer,
                    filename: fileName
                }, {
                    caption: `📎 **فایل از کاربر**\n\nکد: ${short}`
                });
                
                socket.emit('file-sent', { success: true });
            } catch (error) {
                socket.emit('file-error', { error: 'خطا در ارسال' });
            }
        }
    });
    
    socket.on('user-voice', async ({ sessionId, voiceBase64 }) => {
        const short = sessionId.substring(0, 12);
        const info = botSessions.get(short);
        
        if (info?.chatId) {
            try {
                const buffer = Buffer.from(voiceBase64, 'base64');
                await bot.telegram.sendVoice(info.chatId, {
                    source: buffer
                }, {
                    caption: `🎤 **ویس از کاربر**\n\nکد: ${short}`
                });
                
                socket.emit('voice-sent', { success: true });
            } catch (error) {
                socket.emit('voice-error', { error: 'خطا در ارسال' });
            }
        }
    });
});

// ==================== صفحه اصلی ====================
app.get('/', (req, res) => {
    res.json({
        name: 'شیک‌پوشان - پشتیبانی منو محور',
        version: '7.0.0',
        status: 'آنلاین',
        description: 'سیستم پشتیبانی کاملاً منو محور - کاربر فقط می‌تواند دکمه بزند',
        endpoints: {
            start: 'POST /api/start-chat',
            chat: 'POST /api/chat',
            health: 'GET /api/health'
        }
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== راه‌اندازی ====================
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 سرور روی پورت ${PORT} فعال شد`);
    console.log(`🌐 آدرس: https://ai-chat-support-production.up.railway.app`);
    console.log(`🛍️ API: ${SHOP_API_URL}`);
    
    try {
        await bot.telegram.setWebhook(`https://ai-chat-support-production.up.railway.app/telegram-webhook`);
        console.log('✅ وب‌هوک تلگرام تنظیم شد');
        
        await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, 
            `🤖 **سیستم پشتیبانی منو محور فعال شد**\n\n` +
            `✅ منوهای کاملاً قابل کلیک\n` +
            `✅ پیگیری سفارش با کد\n` +
            `✅ لینک‌های مستقیم به سایت\n` +
            `✅ اتصال به اپراتور\n\n` +
            `📅 ${new Date().toLocaleDateString('fa-IR')}\n` +
            `🕐 ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
            `✨ سیستم آماده خدمات‌رسانی است!`);
        
    } catch (error) {
        console.log('⚠️ Polling فعال شد');
        bot.launch();
    }
});
