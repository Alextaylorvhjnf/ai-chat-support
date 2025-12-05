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

// ==================== کش و سشن‌ها ====================
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
            preferences: {},
            conversationState: 'idle',
            awaitingTrackingCode: false,
            lastOrderInfo: null
        };
        cache.set(id, s);
    }
    return s;
};

// ==================== منوی تعاملی هوشمند ====================
const interactiveMenu = {
    // منوی اصلی
    main: {
        title: "🎯 **منوی اصلی خدمات**\n\nلطفاً یکی از گزینه‌ها را انتخاب کنید:",
        options: [
            { id: 'track_order', text: "📦 پیگیری سفارش", emoji: "📦" },
            { id: 'order_not_received', text: "❌ سفارشم نرسیده", emoji: "❌" },
            { id: 'order_status', text: "🔄 وضعیت سفارشم", emoji: "🔄" },
            { id: 'product_search', text: "🔍 جستجوی محصول", emoji: "🔍" },
            { id: 'suggestions', text: "🎁 پیشنهاد محصولات", emoji: "🎁" },
            { id: 'connect_human', text: "👤 صحبت با اپراتور", emoji: "👤" }
        ]
    },
    
    // پیگیری سفارش
    track_order: {
        title: "📦 **پیگیری سفارش**\n\nبرای پیگیری سفارش خود، یکی از گزینه‌های زیر را انتخاب کنید:",
        options: [
            { id: 'enter_tracking_code', text: "🎫 وارد کردن کد پیگیری", emoji: "🎫" },
            { id: 'dont_have_code', text: "❓ کد پیگیری ندارم", emoji: "❓" },
            { id: 'back_to_main', text: "🔙 بازگشت به منوی اصلی", emoji: "🔙" }
        ]
    },
    
    // سفارش نرسیده
    order_not_received: {
        title: "❌ **سفارشم هنوز نرسیده**\n\nاگر سفارش شما با تأخیر مواجه شده، لطفاً وضعیت خود را انتخاب کنید:",
        options: [
            { id: 'late_delivery', text: "⏳ ارسال با تأخیر", emoji: "⏳" },
            { id: 'lost_package', text: "📭 بسته گم شده", emoji: "📭" },
            { id: 'wrong_address', text: "🏠 آدرس اشتباه", emoji: "🏠" },
            { id: 'back_to_main', text: "🔙 بازگشت به منوی اصلی", emoji: "🔙" }
        ]
    },
    
    // وضعیت سفارش
    order_status: {
        title: "🔄 **وضعیت سفارش**\n\nبرای بررسی وضعیت سفارش خود، یکی از گزینه‌ها را انتخاب کنید:",
        options: [
            { id: 'status_processing', text: "⚙️ در حال پردازش", emoji: "⚙️" },
            { id: 'status_shipped', text: "🚚 ارسال شده", emoji: "🚚" },
            { id: 'status_delivered', text: "✅ تحویل داده شده", emoji: "✅" },
            { id: 'back_to_main', text: "🔙 بازگشت به منوی اصلی", emoji: "🔙" }
        ]
    }
};

// ==================== تولید منو ====================
function generateMenu(menuType) {
    const menu = interactiveMenu[menuType];
    if (!menu) return '';
    
    let menuText = menu.title + "\n\n";
    
    menu.options.forEach((option, index) => {
        menuText += `${option.emoji} **${index + 1}. ${option.text}**\n`;
    });
    
    return menuText;
}

// ==================== پاسخ‌های تعاملی ====================
const responses = {
    welcome: () => {
        const welcomes = [
            "سلام عزیزم! 🌸 خوشحالم که پیدات کردم! من کارمند هوشمند شیک‌پوشانم و اینجام تا کمکت کنم! 😊",
            "درود! ✨ به پشتیبانی هوشمند شیک‌پوشان خوش آمدید! من اینجام تا راهنماییتون کنم! 🌟",
            "هلوووو! 🎉 چه خوب شد که اومدین! من دستیار هوشمندتونم، آماده‌ام تا کمکتون کنم! 💖"
        ];
        return welcomes[Math.floor(Math.random() * welcomes.length)];
    },
    
    trackingPrompt: () => {
        return "🎫 **لطفاً کد پیگیری سفارش خود را وارد کنید:**\n\n" +
               "کد پیگیری معمولاً یک عدد ۴ تا ۲۰ رقمی است که بعد از ثبت سفارش براتون ارسال شده.\n\n" +
               "💡 **راهنمایی:** می‌تونید کد رو از ایمیل تأیید سفارش یا پیامک دریافتی پیدا کنید.";
    },
    
    noTrackingCode: () => {
        return "❓ **اگر کد پیگیری ندارید، نگران نباشید!**\n\n" +
               "می‌تونید:\n" +
               "۱. به ایمیل خود مراجعه کنید و کد پیگیری رو پیدا کنید\n" +
               "۲. با ارسال نام و شماره تماس، ما براتون چک می‌کنیم\n" +
               "۳. یا با اپراتور صحبت کنید تا کمکتون کنند\n\n" +
               "چه کاری رو ترجیح می‌دید؟";
    },
    
    orderProcessing: () => {
        return "⚙️ **سفارش شما در حال پردازش است!** ✨\n\n" +
               "کارشناسان ما دارن با دقت سفارشتون رو آماده می‌کنن. معمولاً این مرحله ۲۴ تا ۴۸ ساعت زمان می‌بره.\n\n" +
               "✅ **به زودی:**\n" +
               "• بسته‌بندی حرفه‌ای\n" +
               "• کنترل کیفیت نهایی\n" +
               "• آماده‌سازی برای ارسال\n\n" +
               "اگر تا ۴۸ ساعت آینده خبری نشد، دوباره پیگیری کنید.";
    },
    
    orderShipped: () => {
        return "🚚 **سفارش شما ارسال شده!** 🎉\n\n" +
               "بسته شما تحویل پست داده شده و در مسیر رسیدن به شماست!\n\n" +
               "📦 **مراحل بعدی:**\n" +
               "۱. دریافت کد رهگیری پست\n" +
               "۲. پیگیری آنلاین مرسوله\n" +
               "۳. دریافت درب منزل\n\n" +
               "اگر کد رهگیری پست رو دارید، برام بفرستید تا وضعیت دقیق رو براتون چک کنم.";
    },
    
    orderDelivered: () => {
        return "✅ **سفارش شما تحویل داده شده!** 🎊\n\n" +
               "عالی! بسته شما با موفقیت تحویل گرفته شده.\n\n" +
               "❤️ **امیدواریم از خریدتون راضی باشید!**\n" +
               "اگر سوال یا نظری دارید، خوشحال می‌شم کمکتون کنم.\n\n" +
               "برای پیگیری سفارش‌های جدید، کد پیگیری رو وارد کنید.";
    },
    
    lateDeliveryAdvice: () => {
        return "⏳ **سفارش با تأخیر در ارسال**\n\n" +
               "متأسفیم که با تأخیر مواجه شدید! معمولاً این اتفاق به دلایل زیر می‌افته:\n\n" +
               "🔸 **ممکنه:**\n" +
               "• انبار در حال بررسی نهایی\n" +
               "• حجم بالای سفارشات\n" +
               "• تأخیر در تأمین بعضی محصولات\n\n" +
               "🔸 **پیشنهاد من:**\n" +
               "۱. لطفاً کد پیگیری رو وارد کنید تا وضعیت دقیق رو ببینیم\n" +
               "۲. یا اجازه بدید با اپراتور تماس بگیرم تا پیگیری کنن\n\n" +
               "کد پیگیری رو دارید؟";
    },
    
    lostPackageAdvice: () => {
        return "📭 **بسته گم شده**\n\n" +
               "اوه نه! نگران نباشید، ما پیگیری می‌کنیم.\n\n" +
               "🔸 **لطفاً این کارها رو انجام بدید:**\n" +
               "۱. کد پیگیری پست رو وارد کنید\n" +
               "۲. شماره تماس و آدرس رو تأیید کنید\n" +
               "۳. اجازه بدید با اپراتور تماس بگیرم\n\n" +
               "🔸 **ما قول می‌دیم:**\n" +
               "• پیگیری فوری با اداره پست\n" +
               "• جبران خسارت در صورت گم شدن\n" +
               "• ارسال مجدد اگر لازم باشه\n\n" +
               "کد پیگیری پست رو دارید؟";
    },
    
    wrongAddressAdvice: () => {
        return "🏠 **آدرس اشتباه**\n\n" +
               "اگر آدرس اشتباه وارد کردید، نگران نباشید!\n\n" +
               "🔸 **اقدامات لازم:**\n" +
               "۱. کد پیگیری رو وارد کنید\n" +
               "۲. آدرس صحیح رو بهم بگید\n" +
               "۳. با اپراتور صحبت کنید تا اصلاح کنن\n\n" +
               "🔸 **توجه:**\n" +
               "تا قبل از ارسال، امکان تغییر آدرس وجود داره\n" +
               "بعد از ارسال، باید با پست هماهنگ کنیم\n\n" +
               "کد پیگیری سفارش رو دارید؟";
    },
    
    orderPreparation: () => {
        return "✨ **سفارشت داره آماده میشه!** 🎁\n\n" +
               "کارکنان انبار ما با دقت دارن سفارشتون رو جمع می‌کنن:\n\n" +
               "✅ **مراحل آماده‌سازی:**\n" +
               "• انتخاب محصولات از انبار\n" +
               "• کنترل کیفیت و بازرسی\n" +
               "• بسته‌بندی حرفه‌ای\n" +
               "• الصاق برگه سفارش\n\n" +
               "⏳ **زمان تخمینی:**\n" +
               "امروز یا فردا آماده ارسال میشه!\n\n" +
               "لطفاً صبور باشید و منتظر خبرهای خوب ما 😊";
    },
    
    orderShippedSoon: () => {
        return "🚀 **به زودی ارسال میشه!** 📦\n\n" +
               "سفارشتون تقریباً آماده است و در مرحله نهایی قرار داره:\n\n" +
               "🎯 **وضعیت فعلی:**\n" +
               "• بسته‌بندی تکمیل شده\n" +
               "• بارکد الصاق شده\n" +
               "• در انتظار پیک پست\n\n" +
               "📅 **برنامه ارسال:**\n" +
               "فردا صبح تحویل پست داده میشه\n" +
               "بعدازظهر کد رهگیری رو دریافت می‌کنید\n\n" +
               "یک روز دیگه پیام بدید تا کد رهگیری رو براتون چک کنم!";
    },
    
    thanks: () => {
        const thanksList = [
            "خواهش می‌کنم عزیزم! 🤗 خوشحالم که تونستم کمک کنم.",
            "قربونت برم! 💝 همیشه در خدمت شما هستم.",
            "چشم قشنگم! 🌸 هر زمان که نیاز داشتین، در کنارتونم."
        ];
        return thanksList[Math.floor(Math.random() * thanksList.length)];
    },
    
    error: () => {
        return "⚠️ **اوه! مشکلی پیش اومده!**\n\n" +
               "سیستم موقتاً پاسخ نمی‌ده. لطفاً:\n\n" +
               "۱. چند لحظه صبر کنید\n" +
               "۲. دوباره تلاش کنید\n" +
               "۳. یا 'اپراتور' رو تایپ کنید\n\n" +
               "با تشکر از صبر شما 🙏";
    }
};

// ==================== تحلیل پیام هوشمند ====================
function analyzeMessage(message) {
    const lower = message.toLowerCase();
    
    // تشخیص کد پیگیری
    const codeMatch = message.match(/\b(\d{4,20})\b/);
    if (codeMatch) {
        return { 
            type: 'tracking_code_input', 
            code: codeMatch[1],
            isCode: true 
        };
    }
    
    // تشخیص منو
    if (lower.includes('منو') || lower.includes('گزینه') || lower.includes('راهنما')) {
        return { type: 'show_menu' };
    }
    
    // تشخیص پیگیری سفارش
    if (lower.includes('پیگیری') || lower.includes('پیگیر') || 
        lower.includes('وضعیت سفارش') || lower.includes('سفارشم') ||
        lower.includes('کجاست سفارشم') || lower.includes('رسید سفارش')) {
        return { type: 'track_order_request' };
    }
    
    // تشخیص سفارش نرسیده
    if (lower.includes('نرسیده') || lower.includes('نرسید') || 
        lower.includes('دیر کرد') || lower.includes('تأخیر') ||
        lower.includes('کی میرسه') || lower.includes('کی میاد')) {
        return { type: 'order_not_received' };
    }
    
    // تشخیص وضعیت
    if (lower.includes('وضعیت') || lower.includes('چیکار شد') || 
        lower.includes('آماده') || lower.includes('ارسال') ||
        lower.includes('شد پس') || lower.includes('چی شد')) {
        return { type: 'order_status_inquiry' };
    }
    
    // تشخیص محصول
    if (lower.includes('قیمت') || lower.includes('موجودی') || 
        lower.includes('خرید') || lower.includes('محصول') ||
        lower.includes('تیشرت') || lower.includes('هودی') ||
        lower.includes('شلوار') || lower.includes('کت')) {
        return { type: 'product_search' };
    }
    
    // تشخیص پیشنهاد
    if (lower.includes('پیشنهاد') || lower.includes('پیشنهادی') || 
        lower.includes('چی خوبه') || lower.includes('چی بخریم')) {
        return { type: 'suggestion_request' };
    }
    
    // تشخیص سلام
    if (/^(سلام|درود|هلو|سلامتی|صبح|عصر|شب)/.test(lower)) {
        return { type: 'greeting' };
    }
    
    // تشخیص تشکر
    if (lower.includes('ممنون') || lower.includes('مرسی') || 
        lower.includes('متشکرم') || lower.includes('دستت درد نکنه')) {
        return { type: 'thanks' };
    }
    
    // تشخیص اپراتور
    if (lower.includes('اپراتور') || lower.includes('انسان') || 
        lower.includes('کارمند') || lower.includes('پشتیبان')) {
        return { type: 'operator_request' };
    }
    
    // اگر عدد ۱-۶ برای منو
    const menuOption = parseInt(message);
    if (!isNaN(menuOption) && menuOption >= 1 && menuOption <= 6) {
        return { type: 'menu_selection', option: menuOption };
    }
    
    return { type: 'general' };
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

// ==================== جستجوی محصول ====================
async function searchProducts(keyword) {
    try {
        const result = await callShopAPI('search_product_advanced', { keyword });
        
        if (result.products && result.products.length > 0) {
            return {
                success: true,
                products: result.products.slice(0, 5),
                count: result.products.length
            };
        }
        
        return { success: false, products: [] };
        
    } catch (error) {
        return { success: false, products: [] };
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
        message: '🎉 اپراتور متصل شد! لطفاً سوال خود را بپرسید.'
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

// ==================== سیستم چت تعاملی ====================
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
        
        const analysis = analyzeMessage(message);
        
        // ========== اگر منتظر کد پیگیری هستیم ==========
        if (session.awaitingTrackingCode) {
            session.awaitingTrackingCode = false;
            
            if (analysis.isCode) {
                const trackResult = await trackOrder(analysis.code);
                
                if (trackResult.success) {
                    const order = trackResult.order;
                    
                    const reply = `✅ **سفارش شما پیدا شد!** 🎉\n\n` +
                                 `📦 **کد سفارش:** ${order.number}\n` +
                                 `👤 **مشتری:** ${order.customer_name}\n` +
                                 `📅 **تاریخ:** ${order.date}\n` +
                                 `🟢 **وضعیت:** ${order.status}\n` +
                                 `💰 **مبلغ:** ${Number(order.total).toLocaleString('fa-IR')} تومان\n\n` +
                                 `🛍️ **محصولات:**\n` +
                                 `${order.items.map((item, i) => `   ${i+1}. ${item}`).join('\n')}\n\n` +
                                 `✨ **پیگیری شما کامل شد!**\n` +
                                 `اگر سوال دیگری دارید، در خدمتتونم. 😊\n\n` +
                                 `برای بازگشت به منوی اصلی، "منو" رو تایپ کنید.`;
                    
                    session.messages.push({ role: 'assistant', content: reply });
                    session.lastOrderInfo = order;
                    
                    return res.json({ 
                        success: true, 
                        message: reply,
                        orderFound: true 
                    });
                    
                } else {
                    const reply = `❌ **سفارشی با این کد پیدا نشد!**\n\n` +
                                 `کد **${analysis.code}** در سیستم ما ثبت نیست.\n\n` +
                                 `🔸 **ممکنه:**\n` +
                                 `• کد رو اشتباه وارد کردید\n` +
                                 `• سفارش هنوز ثبت نشده\n` +
                                 `• مشکل فنی موقتی باشه\n\n` +
                                 `🔸 **پیشنهاد:**\n` +
                                 `۱. کد رو دوباره چک کنید\n` +
                                 `۲. "منو" رو برای گزینه‌های بیشتر تایپ کنید\n` +
                                 `۳. یا با "اپراتور" صحبت کنید`;
                    
                    session.messages.push({ role: 'assistant', content: reply });
                    return res.json({ success: true, message: reply });
                }
            } else {
                // اگر کد وارد نکرد
                const reply = `🎫 **لطفاً فقط کد پیگیری وارد کنید!**\n\n` +
                             `کد پیگیری یک عدد ۴ تا ۲۰ رقمی است.\n\n` +
                             `اگر کد ندارید:\n` +
                             `۱. "منو" رو تایپ کنید\n` +
                             `۲. گزینه "کد پیگیری ندارم" رو انتخاب کنید\n` +
                             `۳. یا با "اپراتور" صحبت کنید`;
                
                session.awaitingTrackingCode = true;
                session.messages.push({ role: 'assistant', content: reply });
                return res.json({ success: true, message: reply });
            }
        }
        
        // ========== اگر انتخاب منو ==========
        if (analysis.type === 'menu_selection') {
            const option = analysis.option;
            
            // منوی اصلی
            if (session.conversationState === 'idle') {
                switch(option) {
                    case 1: // پیگیری سفارش
                        session.conversationState = 'tracking_menu';
                        const trackingMenu = generateMenu('track_order');
                        session.messages.push({ role: 'assistant', content: trackingMenu });
                        return res.json({ success: true, message: trackingMenu });
                        
                    case 2: // سفارشم نرسیده
                        session.conversationState = 'order_not_received_menu';
                        const notReceivedMenu = generateMenu('order_not_received');
                        session.messages.push({ role: 'assistant', content: notReceivedMenu });
                        return res.json({ success: true, message: notReceivedMenu });
                        
                    case 3: // وضعیت سفارشم
                        session.conversationState = 'order_status_menu';
                        const statusMenu = generateMenu('order_status');
                        session.messages.push({ role: 'assistant', content: statusMenu });
                        return res.json({ success: true, message: statusMenu });
                        
                    case 4: // جستجوی محصول
                        session.conversationState = 'product_search';
                        const searchReply = "🔍 **جستجوی محصول**\n\nلطفاً نام محصول مورد نظر خود را وارد کنید:\n\n" +
                                           "مثلاً:\n• تیشرت مردانه\n• هودی زمستانی\n• شلوار جین\n• یا هر محصول دیگه‌ای";
                        session.messages.push({ role: 'assistant', content: searchReply });
                        return res.json({ success: true, message: searchReply });
                        
                    case 5: // پیشنهاد محصولات
                        const popularResult = await callShopAPI('get_popular_products', { limit: 4 });
                        
                        if (popularResult.products && popularResult.products.length > 0) {
                            let suggestionReply = "🎁 **پیشنهادات ویژه من برای شما:** ✨\n\n";
                            
                            popularResult.products.forEach((product, index) => {
                                suggestionReply += `**${index + 1}. ${product.name}**\n`;
                                suggestionReply += `   💰 قیمت: ${Number(product.price || 0).toLocaleString('fa-IR')} تومان\n`;
                                suggestionReply += `   🔗 ${product.url}\n\n`;
                            });
                            
                            suggestionReply += "اگر محصول خاصی مد نظر دارید، نامش رو بگید.\n" +
                                              "برای بازگشت به منو، \"منو\" رو تایپ کنید.";
                            
                            session.messages.push({ role: 'assistant', content: suggestionReply });
                            return res.json({ success: true, message: suggestionReply });
                        } else {
                            const noSuggestionReply = "🎁 **فعلاً محصولی برای پیشنهاد ندارم!**\n\n" +
                                                     "می‌تونید:\n" +
                                                     "۱. محصول خاصی رو جستجو کنید\n" +
                                                     "۲. یا بعداً دوباره سر بزنید\n\n" +
                                                     "برای بازگشت به منو، \"منو\" رو تایپ کنید.";
                            session.messages.push({ role: 'assistant', content: noSuggestionReply });
                            return res.json({ success: true, message: noSuggestionReply });
                        }
                        
                    case 6: // اپراتور
                        const short = sessionId.substring(0, 12);
                        botSessions.set(short, {
                            fullId: sessionId,
                            userInfo: session.userInfo || {},
                            chatId: null,
                            createdAt: new Date()
                        });
                        
                        await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, 
                            `🔔 **درخواست اتصال از منو**\n\n` +
                            `👤 کاربر: ${session.userInfo?.name || 'ناشناس'}\n` +
                            `🔢 کد: ${short}\n\n` +
                            `🕐 ${new Date().toLocaleTimeString('fa-IR')}`,
                            {
                                reply_markup: {
                                    inline_keyboard: [[
                                        { text: '✅ پذیرش', callback_data: `accept_${short}` },
                                        { text: '❌ رد', callback_data: `reject_${short}` }
                                    ]]
                                }
                            }
                        );
                        
                        const operatorReply = `✅ **درخواست شما ثبت شد!**\n\n` +
                                             `کارشناسان ما به زودی با شما ارتباط برقرار می‌کنند.\n\n` +
                                             `⏳ **لطفاً منتظر بمانید...**\n` +
                                             `کد جلسه: **${short}**\n\n` +
                                             `می‌تونید ادامه بدید یا "منو" رو برای بازگشت تایپ کنید.`;
                        
                        session.messages.push({ role: 'assistant', content: operatorReply });
                        return res.json({ success: true, message: operatorReply });
                }
            }
            
            // منوی پیگیری سفارش
            if (session.conversationState === 'tracking_menu') {
                switch(option) {
                    case 1: // وارد کردن کد پیگیری
                        session.awaitingTrackingCode = true;
                        const trackingPrompt = responses.trackingPrompt();
                        session.messages.push({ role: 'assistant', content: trackingPrompt });
                        return res.json({ success: true, message: trackingPrompt });
                        
                    case 2: // کد پیگیری ندارم
                        const noCodeReply = responses.noTrackingCode();
                        session.messages.push({ role: 'assistant', content: noCodeReply });
                        return res.json({ success: true, message: noCodeReply });
                        
                    case 3: // بازگشت
                        session.conversationState = 'idle';
                        const mainMenu = generateMenu('main');
                        session.messages.push({ role: 'assistant', content: mainMenu });
                        return res.json({ success: true, message: mainMenu });
                }
            }
            
            // منوی سفارش نرسیده
            if (session.conversationState === 'order_not_received_menu') {
                switch(option) {
                    case 1: // ارسال با تأخیر
                        const lateReply = responses.lateDeliveryAdvice();
                        session.awaitingTrackingCode = true;
                        session.messages.push({ role: 'assistant', content: lateReply });
                        return res.json({ success: true, message: lateReply });
                        
                    case 2: // بسته گم شده
                        const lostReply = responses.lostPackageAdvice();
                        session.awaitingTrackingCode = true;
                        session.messages.push({ role: 'assistant', content: lostReply });
                        return res.json({ success: true, message: lostReply });
                        
                    case 3: // آدرس اشتباه
                        const addressReply = responses.wrongAddressAdvice();
                        session.awaitingTrackingCode = true;
                        session.messages.push({ role: 'assistant', content: addressReply });
                        return res.json({ success: true, message: addressReply });
                        
                    case 4: // بازگشت
                        session.conversationState = 'idle';
                        const mainMenu2 = generateMenu('main');
                        session.messages.push({ role: 'assistant', content: mainMenu2 });
                        return res.json({ success: true, message: mainMenu2 });
                }
            }
            
            // منوی وضعیت سفارش
            if (session.conversationState === 'order_status_menu') {
                switch(option) {
                    case 1: // در حال پردازش
                        const processingReply = responses.orderProcessing();
                        session.messages.push({ role: 'assistant', content: processingReply });
                        return res.json({ success: true, message: processingReply });
                        
                    case 2: // ارسال شده
                        const shippedReply = responses.orderShipped();
                        session.messages.push({ role: 'assistant', content: shippedReply });
                        return res.json({ success: true, message: shippedReply });
                        
                    case 3: // تحویل داده شده
                        const deliveredReply = responses.orderDelivered();
                        session.messages.push({ role: 'assistant', content: deliveredReply });
                        return res.json({ success: true, message: deliveredReply });
                        
                    case 4: // بازگشت
                        session.conversationState = 'idle';
                        const mainMenu3 = generateMenu('main');
                        session.messages.push({ role: 'assistant', content: mainMenu3 });
                        return res.json({ success: true, message: mainMenu3 });
                }
            }
        }
        
        // ========== تحلیل عادی پیام‌ها ==========
        switch(analysis.type) {
            case 'track_order_request':
                session.conversationState = 'tracking_menu';
                const trackingMenu = generateMenu('track_order');
                session.messages.push({ role: 'assistant', content: trackingMenu });
                return res.json({ success: true, message: trackingMenu });
                
            case 'order_not_received':
                session.conversationState = 'order_not_received_menu';
                const notReceivedMenu = generateMenu('order_not_received');
                session.messages.push({ role: 'assistant', content: notReceivedMenu });
                return res.json({ success: true, message: notReceivedMenu });
                
            case 'order_status_inquiry':
                if (session.lastOrderInfo) {
                    // اگر سفارش قبلی داشت
                    const statusReply = `🔄 **وضعیت سفارش قبلی شما:**\n\n` +
                                       `📦 کد: ${session.lastOrderInfo.number}\n` +
                                       `🟢 وضعیت: ${session.lastOrderInfo.status}\n\n` +
                                       `برای پیگیری سفارش جدید، کد پیگیری رو وارد کنید\n` +
                                       `یا "منو" رو برای گزینه‌های بیشتر تایپ کنید.`;
                    session.messages.push({ role: 'assistant', content: statusReply });
                    return res.json({ success: true, message: statusReply });
                } else {
                    session.conversationState = 'order_status_menu';
                    const statusMenu = generateMenu('order_status');
                    session.messages.push({ role: 'assistant', content: statusMenu });
                    return res.json({ success: true, message: statusMenu });
                }
                
            case 'product_search':
                session.conversationState = 'product_search';
                const searchReply = "🔍 **جستجوی محصول**\n\nلطفاً نام محصول مورد نظر خود را وارد کنید:\n\n" +
                                   "مثلاً:\n• تیشرت مردانه\n• هودی زمستانی\n• شلوار جین\n• یا هر محصول دیگه‌ای";
                session.messages.push({ role: 'assistant', content: searchReply });
                return res.json({ success: true, message: searchReply });
                
            case 'suggestion_request':
                const popularResult = await callShopAPI('get_popular_products', { limit: 4 });
                
                if (popularResult.products && popularResult.products.length > 0) {
                    let suggestionReply = "🎁 **پیشنهادات ویژه من برای شما:** ✨\n\n";
                    
                    popularResult.products.forEach((product, index) => {
                        suggestionReply += `**${index + 1}. ${product.name}**\n`;
                        suggestionReply += `   💰 قیمت: ${Number(product.price || 0).toLocaleString('fa-IR')} تومان\n`;
                        suggestionReply += `   🔗 ${product.url}\n\n`;
                    });
                    
                    suggestionReply += "اگر محصول خاصی مد نظر دارید، نامش رو بگید.\n" +
                                      "برای بازگشت به منو، \"منو\" رو تایپ کنید.";
                    
                    session.messages.push({ role: 'assistant', content: suggestionReply });
                    return res.json({ success: true, message: suggestionReply });
                }
                break;
                
            case 'greeting':
                const welcomeMsg = responses.welcome();
                const mainMenu = generateMenu('main');
                const greetingReply = `${welcomeMsg}\n\n${mainMenu}`;
                
                session.conversationState = 'idle';
                session.messages.push({ role: 'assistant', content: greetingReply });
                return res.json({ success: true, message: greetingReply });
                
            case 'thanks':
                const thanksReply = `${responses.thanks()}\n\n` +
                                   `برای بازگشت به منوی اصلی، "منو" رو تایپ کنید.`;
                session.messages.push({ role: 'assistant', content: thanksReply });
                return res.json({ success: true, message: thanksReply });
                
            case 'operator_request':
                const short = sessionId.substring(0, 12);
                botSessions.set(short, {
                    fullId: sessionId,
                    userInfo: session.userInfo || {},
                    chatId: null,
                    createdAt: new Date()
                });
                
                await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, 
                    `🔔 **درخواست اپراتور**\n\n` +
                    `👤 کاربر: ${session.userInfo?.name || 'ناشناس'}\n` +
                    `🔢 کد: ${short}\n\n` +
                    `🕐 ${new Date().toLocaleTimeString('fa-IR')}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ پذیرش', callback_data: `accept_${short}` },
                                { text: '❌ رد', callback_data: `reject_${short}` }
                            ]]
                        }
                    }
                );
                
                const operatorReply = `✅ **درخواست شما ثبت شد!**\n\n` +
                                     `کارشناسان ما به زودی با شما ارتباط برقرار می‌کنند.\n\n` +
                                     `⏳ **لطفاً منتظر بمانید...**\n` +
                                     `کد جلسه: **${short}**\n\n` +
                                     `می‌تونید ادامه بدید یا "منو" رو برای بازگشت تایپ کنید.`;
                
                session.messages.push({ role: 'assistant', content: operatorReply });
                return res.json({ success: true, message: operatorReply });
                
            case 'show_menu':
                session.conversationState = 'idle';
                const menu = generateMenu('main');
                session.messages.push({ role: 'assistant', content: menu });
                return res.json({ success: true, message: menu });
                
            case 'general':
                // اگر در حالت جستجوی محصول
                if (session.conversationState === 'product_search') {
                    const searchResult = await searchProducts(message);
                    
                    if (searchResult.success && searchResult.products.length > 0) {
                        let productReply = `🎯 **${searchResult.count} محصول پیدا کردم:** ✨\n\n`;
                        
                        searchResult.products.forEach((product, index) => {
                            productReply += `**${index + 1}. ${product.name}**\n`;
                            productReply += `   💰 قیمت: ${Number(product.price || 0).toLocaleString('fa-IR')} تومان\n`;
                            
                            if (product.stock_status) {
                                const stockEmoji = product.in_stock ? '✅' : '❌';
                                productReply += `   📦 موجودی: ${stockEmoji} ${product.stock_status}\n`;
                            }
                            
                            if (product.url) {
                                productReply += `   🔗 ${product.url}\n`;
                            }
                            
                            productReply += '\n';
                        });
                        
                        productReply += `💡 برای بازگشت به منو، "منو" رو تایپ کنید.`;
                        
                        session.messages.push({ role: 'assistant', content: productReply });
                        return res.json({ success: true, message: productReply });
                        
                    } else {
                        const noProductReply = `❌ **محصولی با نام "${message}" پیدا نکردم!**\n\n` +
                                             `می‌تونید:\n` +
                                             `۱. نام دقیق‌تر رو وارد کنید\n` +
                                             `۲. از پیشنهادات ما دیدن کنید\n` +
                                             `۳. یا "منو" رو برای گزینه‌های بیشتر تایپ کنید`;
                        
                        session.messages.push({ role: 'assistant', content: noProductReply });
                        return res.json({ success: true, message: noProductReply });
                    }
                }
                
                // پاسخ پیش‌فرض
                const defaultReply = `🤔 **متوجه پیامتون شدم!**\n\n` +
                                   `برای استفاده بهتر از خدمات ما، لطفاً:\n\n` +
                                   `۱. "منو" رو تایپ کنید تا گزینه‌ها رو ببینید\n` +
                                   `۲. یا مستقیم بگید چه کمکی می‌تونم بکنم\n\n` +
                                   `من اینجام تا کمکتون کنم! 😊`;
                
                session.messages.push({ role: 'assistant', content: defaultReply });
                return res.json({ success: true, message: defaultReply });
        }
        
        // پاسخ نهایی در صورت خطا
        const fallbackReply = generateMenu('main');
        session.messages.push({ role: 'assistant', content: fallbackReply });
        return res.json({ success: true, message: fallbackReply });
        
    } catch (error) {
        console.error('❌ خطا در سیستم چت:', error);
        
        const errorReply = responses.error();
        return res.json({ 
            success: false, 
            message: errorReply 
        });
    }
});

// ==================== API اضافی ====================
app.post('/api/connect-human', async (req, res) => {
    const { sessionId, userInfo } = req.body;
    const session = getSession(sessionId);
    
    if (userInfo) {
        session.userInfo = { ...session.userInfo, ...userInfo };
    }
    
    const short = sessionId.substring(0, 12);
    botSessions.set(short, {
        fullId: sessionId,
        userInfo: session.userInfo,
        chatId: null,
        createdAt: new Date()
    });
    
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, 
        `🔔 **درخواست اتصال**\n\n` +
        `👤 کاربر: ${session.userInfo?.name || 'ناشناس'}\n` +
        `🔢 کد: ${short}\n\n` +
        `🕐 ${new Date().toLocaleTimeString('fa-IR')}`,
        {
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ پذیرش', callback_data: `accept_${short}` },
                    { text: '❌ رد', callback_data: `reject_${short}` }
                ]]
            }
        }
    );
    
    res.json({ 
        success: true, 
        pending: true,
        message: 'درخواست شما برای اتصال به اپراتور ثبت شد.',
        sessionCode: short
    });
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
                `💬 **پیام از کاربر ${short}:**\n\n${message}`);
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
                    caption: `📎 فایل از کاربر ${short}`
                });
                
                socket.emit('file-sent', { success: true });
            } catch (error) {
                socket.emit('file-error', { error: error.message });
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
                    caption: `🎤 ویس از کاربر ${short}`
                });
                
                socket.emit('voice-sent', { success: true });
            } catch (error) {
                socket.emit('voice-error', { error: error.message });
            }
        }
    });
});

// ==================== صفحه اصلی ====================
app.get('/', (req, res) => {
    res.json({
        name: 'شیک‌پوشان - پشتیبانی تعاملی',
        version: '6.0.0',
        status: 'آنلاین',
        features: [
            'منوی تعاملی هوشمند',
            'پیگیری سفارش با مکالمه طبیعی',
            'مدیریت سفارشات نرسیده',
            'جستجوی محصولات',
            'اتصال به اپراتور',
            'پشتیبانی فایل و ویس'
        ],
        message: 'سیستم پشتیبانی تعاملی آماده خدمات‌رسانی است!'
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
            `🤖 **سیستم پشتیبانی تعاملی فعال شد**\n\n` +
            `✅ منوی هوشمند: فعال\n` +
            `✅ پیگیری تعاملی: فعال\n` +
            `✅ جستجوی محصول: فعال\n\n` +
            `📅 ${new Date().toLocaleDateString('fa-IR')}\n` +
            `🕐 ${new Date().toLocaleTimeString('fa-IR')}`);
        
    } catch (error) {
        console.log('⚠️ Polling فعال شد');
        bot.launch();
    }
});
