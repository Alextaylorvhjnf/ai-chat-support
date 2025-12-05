const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const { Telegraf } = require('telegraf');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');
require('dotenv').config();

// ==================== تنظیمات ====================
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

// ==================== دیتابیس ====================
const pool = mysql.createPool({
  host: 'localhost',
  user: 'apmsho_shikpooshan',
  password: '5W2nn}@tkm8926G*',
  database: 'apmsho_shikpooshan',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// ==================== سرور ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ==================== کش ====================
const cache = new NodeCache({ stdTTL: 600 });
const telegramSessions = new Map();

// ==================== میدل‌ورها ====================
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== مدیریت نشست‌ها ====================
const getSession = (sessionId) => {
  let session = cache.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      messages: [
        { 
          role: 'ai', 
          content: 'سلام! به پشتیبانی هوشمند شیک‌پوشان خوش آمدید. 😊\n\nچگونه می‌توانم کمک کنم؟\n• کد رهگیری سفارش\n• صحبت با اپراتور\n• اطلاعات محصولات',
          timestamp: new Date().toISOString()
        }
      ],
      userInfo: {},
      connectedToHuman: false,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    cache.set(sessionId, session);
  }
  return session;
};

const updateSession = (sessionId, data) => {
  const session = getSession(sessionId);
  Object.assign(session, { ...data, lastActivity: new Date() });
  cache.set(sessionId, session);
  return session;
};

// ==================== تابع جستجوی سفارش (جدیدترین نسخه ووکامرس) ====================
async function findOrderByCode(trackingCode) {
  const cleanCode = trackingCode.trim();
  
  if (!cleanCode || cleanCode.length < 3) {
    return { 
      found: false, 
      message: 'کد وارد شده بسیار کوتاه است (حداقل ۳ رقم)',
      showOperatorButton: true 
    };
  }
  
  console.log(`🔍 جستجوی سفارش با کد: ${cleanCode}`);
  
  try {
    // روش ۱: جستجو در جدول wc_order_stats (جدیدترین نسخه ووکامرس)
    try {
      const [statsOrders] = await pool.execute(`
        SELECT 
          order_id,
          status,
          date_created,
          total_sales as total,
          num_items_sold as items_count
        FROM wp_wc_order_stats 
        WHERE order_id = ? 
           OR status LIKE ?
        ORDER BY date_created DESC
        LIMIT 1
      `, [cleanCode, `%${cleanCode}%`]);
      
      if (statsOrders.length > 0) {
        const order = statsOrders[0];
        
        // اطلاعات آدرس از جدول wc_order_addresses
        const [addresses] = await pool.execute(`
          SELECT 
            address_type,
            first_name,
            last_name,
            phone
          FROM wp_wc_order_addresses 
          WHERE order_id = ?
        `, [order.order_id]);
        
        // اطلاعات عملیاتی از جدول wc_order_operational_data
        const [operationalData] = await pool.execute(`
          SELECT 
            created_via,
            coupon_usages_count
          FROM wp_wc_order_operational_data 
          WHERE order_id = ?
        `, [order.order_id]);
        
        // محصولات از جدول wc_order_product_lookup
        const [products] = await pool.execute(`
          SELECT 
            product_id,
            variation_id,
            product_qty as quantity
          FROM wp_wc_order_product_lookup 
          WHERE order_id = ?
        `, [order.order_id]);
        
        // نام محصولات از جدول wp_posts
        let productNames = ['محصولات سفارش'];
        if (products.length > 0) {
          const productIds = products.map(p => p.product_id).join(',');
          const [productPosts] = await pool.execute(`
            SELECT post_title 
            FROM wp_posts 
            WHERE ID IN (${productIds})
          `);
          productNames = productPosts.map(p => p.post_title);
        }
        
        // وضعیت فارسی
        const statusMap = {
          'wc-pending': 'در انتظار پرداخت',
          'wc-processing': 'در حال پردازش',
          'wc-on-hold': 'در انتظار بررسی',
          'wc-completed': 'تکمیل شده',
          'wc-cancelled': 'لغو شده',
          'wc-refunded': 'مرجوع شده',
          'pending': 'در انتظار پرداخت',
          'processing': 'در حال پردازش',
          'on-hold': 'در انتظار بررسی',
          'completed': 'تکمیل شده',
          'cancelled': 'لغو شده',
          'refunded': 'مرجوع شده',
          'auto-draft': 'پیش‌نویس'
        };
        
        const customer = addresses.find(a => a.address_type === 'billing') || {};
        
        return {
          found: true,
          order: {
            id: order.order_id,
            tracking_code: cleanCode,
            date: new Date(order.date_created).toLocaleDateString('fa-IR'),
            status: statusMap[order.status] || order.status,
            total: order.total ? parseInt(order.total).toLocaleString('fa-IR') : '0',
            customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'مشتری',
            customer_phone: customer.phone || 'ندارد',
            payment_method: operationalData[0]?.created_via === 'checkout' ? 'آنلاین' : 'نقدی',
            products: productNames.slice(0, 10),
            items_count: order.items_count || products.length
          }
        };
      }
    } catch (error) {
      console.log('جدول جدید پیدا نشد، روش قدیمی را امتحان می‌کنیم...');
    }
    
    // روش ۲: جستجو در جدول‌های قدیمی ووکامرس
    // ۲-۱: جستجو در wp_posts (سفارشات)
    const [posts] = await pool.execute(`
      SELECT 
        ID as order_id,
        post_date,
        post_status,
        post_type
      FROM wp_posts
      WHERE post_type = 'shop_order'
        AND (ID = ? OR post_title LIKE ?)
      ORDER BY post_date DESC
      LIMIT 1
    `, [cleanCode, `%${cleanCode}%`]);
    
    if (posts.length > 0) {
      const order = posts[0];
      
      // اطلاعات از wp_postmeta
      const [metaResults] = await pool.execute(`
        SELECT meta_key, meta_value
        FROM wp_postmeta
        WHERE post_id = ?
          AND meta_key IN (
            '_order_total', '_billing_first_name', '_billing_last_name',
            '_billing_phone', '_billing_email', '_payment_method_title',
            '_order_status', '_shipping_method'
          )
      `, [order.order_id]);
      
      const meta = {};
      metaResults.forEach(row => {
        meta[row.meta_key] = row.meta_value;
      });
      
      // محصولات از wp_woocommerce_order_items
      const [items] = await pool.execute(`
        SELECT order_item_name
        FROM wp_woocommerce_order_items
        WHERE order_id = ? 
          AND order_item_type = 'line_item'
      `, [order.order_id]);
      
      // وضعیت فارسی
      const statusMap = {
        'wc-pending': 'در انتظار پرداخت',
        'wc-processing': 'در حال پردازش',
        'wc-on-hold': 'در انتظار بررسی',
        'wc-completed': 'تکمیل شده',
        'wc-cancelled': 'لغو شده',
        'wc-refunded': 'مرجوع شده',
        'pending': 'در انتظار پرداخت',
        'processing': 'در حال پردازش',
        'on-hold': 'در انتظار بررسی',
        'completed': 'تکمیل شده',
        'cancelled': 'لغو شده',
        'refunded': 'مرجوع شده'
      };
      
      return {
        found: true,
        order: {
          id: order.order_id,
          tracking_code: cleanCode,
          date: new Date(order.post_date).toLocaleDateString('fa-IR'),
          status: statusMap[meta._order_status] || meta._order_status || order.post_status,
          total: meta._order_total ? parseInt(meta._order_total).toLocaleString('fa-IR') : '0',
          customer_name: `${meta._billing_first_name || ''} ${meta._billing_last_name || ''}`.trim() || 'مشتری',
          customer_phone: meta._billing_phone || 'ندارد',
          customer_email: meta._billing_email || 'ندارد',
          payment_method: meta._payment_method_title || 'آنلاین',
          products: items.map(item => item.order_item_name).slice(0, 10) || ['محصولات سفارش'],
          shipping_method: meta._shipping_method || 'پست'
        }
      };
    }
    
    // روش ۳: جستجو در متادیتاهای قدیمی برای کد رهگیری
    const [trackingMeta] = await pool.execute(`
      SELECT p.ID as order_id, p.post_date, pm.meta_key, pm.meta_value
      FROM wp_posts p
      INNER JOIN wp_postmeta pm ON pm.post_id = p.ID
      WHERE p.post_type = 'shop_order'
        AND (
          pm.meta_value LIKE ?
          OR pm.meta_value = ?
        )
      ORDER BY p.post_date DESC
      LIMIT 1
    `, [`%${cleanCode}%`, cleanCode]);
    
    if (trackingMeta.length > 0) {
      const orderId = trackingMeta[0].order_id;
      
      // دریافت کامل اطلاعات سفارش
      const [orderInfo] = await pool.execute(`
        SELECT 
          p.ID,
          p.post_date,
          (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_order_total' LIMIT 1) as total,
          (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_billing_first_name' LIMIT 1) as first_name,
          (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_billing_last_name' LIMIT 1) as last_name,
          (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_billing_phone' LIMIT 1) as phone,
          (SELECT meta_value FROM wp_postmeta WHERE post_id = p.ID AND meta_key = '_order_status' LIMIT 1) as status
        FROM wp_posts p
        WHERE p.ID = ?
      `, [orderId]);
      
      if (orderInfo.length > 0) {
        const info = orderInfo[0];
        
        return {
          found: true,
          order: {
            id: info.ID,
            tracking_code: cleanCode,
            date: new Date(info.post_date).toLocaleDateString('fa-IR'),
            status: info.status === 'wc-completed' ? 'تکمیل شده' : 'در حال پردازش',
            total: info.total ? parseInt(info.total).toLocaleString('fa-IR') : '0',
            customer_name: `${info.first_name || ''} ${info.last_name || ''}`.trim() || 'مشتری',
            customer_phone: info.phone || 'ندارد',
            products: ['محصولات سفارش']
          }
        };
      }
    }
    
    // سفارش پیدا نشد
    return {
      found: false,
      message: `سفارشی با کد «${trackingCode}» پیدا نشد.`,
      suggestions: [
        'کد رهگیری را دقیق وارد کنید',
        'ممکن است شماره سفارش باشد (شماره سفارش را امتحان کنید)',
        'سفارش ممکن است هنوز در سیستم ثبت نشده باشد'
      ],
      showOperatorButton: true
    };
    
  } catch (error) {
    console.error('❌ خطا در جستجوی سفارش:', error);
    return {
      found: false,
      message: 'خطا در سرویس پیگیری. لطفاً با پشتیبانی تماس بگیرید.',
      error: error.message,
      showOperatorButton: true
    };
  }
}

// ==================== تابع جستجوی محصولات ====================
async function searchProducts(query = '', limit = 3) {
  try {
    const [products] = await pool.execute(`
      SELECT 
        p.ID,
        p.post_title as name,
        p.post_content as description,
        price.meta_value as price,
        sale.meta_value as sale_price,
        stock.meta_value as stock_status,
        sku.meta_value as sku
      FROM wp_posts p
      LEFT JOIN wp_postmeta price ON price.post_id = p.ID AND price.meta_key = '_price'
      LEFT JOIN wp_postmeta sale ON sale.post_id = p.ID AND sale.meta_key = '_sale_price'
      LEFT JOIN wp_postmeta stock ON stock.post_id = p.ID AND stock.meta_key = '_stock_status'
      LEFT JOIN wp_postmeta sku ON sku.post_id = p.ID AND sku.meta_key = '_sku'
      WHERE p.post_type = 'product'
        AND p.post_status = 'publish'
        AND (p.post_title LIKE ? OR sku.meta_value LIKE ?)
      ORDER BY p.post_date DESC
      LIMIT ?
    `, [`%${query}%`, `%${query}%`, limit]);
    
    return products.map(p => ({
      id: p.ID,
      name: p.name || 'محصول',
      price: parseInt(p.price) || 0,
      sale_price: parseInt(p.sale_price) || null,
      on_sale: p.sale_price && p.sale_price !== p.price,
      stock_status: p.stock_status === 'instock' ? 'موجود' : 'ناموجود',
      sku: p.sku || 'ندارد',
      url: `https://shikpooshaan.ir/?p=${p.ID}`
    }));
  } catch (error) {
    console.error('خطا در جستجوی محصولات:', error);
    return [];
  }
}

// ==================== تابع پردازش پیام ====================
async function processMessage(message, sessionId) {
  const session = getSession(sessionId);
  const cleanMsg = message.trim();
  
  // 1. تشخیص کد رهگیری (هر عددی)
  const codeMatch = cleanMsg.match(/\b\d{3,}\b/);
  if (codeMatch) {
    const trackingCode = codeMatch[0];
    console.log(`📦 درخواست پیگیری کد: ${trackingCode}`);
    
    const result = await findOrderByCode(trackingCode);
    
    if (result.found) {
      const order = result.order;
      const productsText = order.products
        .map((p, i) => `${i + 1}. ${p}`)
        .join('\n');
      
      return {
        type: 'order_found',
        text: `✅ **سفارش شما پیدا شد!**\n\n` +
              `📦 **کد رهگیری:** ${order.tracking_code}\n` +
              `👤 **مشتری:** ${order.customer_name}\n` +
              `📅 **تاریخ سفارش:** ${order.date}\n` +
              (order.customer_phone ? `📞 **تلفن:** ${order.customer_phone}\n` : '') +
              `🟢 **وضعیت:** ${order.status}\n` +
              `💳 **روش پرداخت:** ${order.payment_method}\n` +
              `💰 **مبلغ کل:** ${order.total} تومان\n\n` +
              `🛍️ **محصولات سفارش:**\n${productsText}\n\n` +
              `🚚 *سفارش شما در حال پردازش است و به زودی ارسال می‌شود.*\n\n` +
              `اگر سوال دیگری دارید، در خدمتم! 😊`,
        data: order
      };
    } else {
      // سفارش پیدا نشد - پاسخ بهبود یافته
      return {
        type: 'order_not_found',
        text: `🔍 **جستجوی کد «${trackingCode}»**\n\n` +
              `متأسفانه **سفارشی با این کد پیدا نشد**. 😔\n\n` +
              `**🔸 لطفاً بررسی کنید:**\n` +
              `• کد رهگیری را دقیق وارد کرده باشید\n` +
              `• ممکن است شماره سفارش باشد (شماره سفارش را امتحان کنید)\n` +
              `• سفارش ممکن است هنوز در سیستم ثبت نشده باشد\n\n` +
              `**🔸 راه‌های دیگر:**\n` +
              `📞 می‌توانید مستقیماً با پشتیبانی تماس بگیرید\n` +
              `👨‍💼 یا با **زدن دکمه «اتصال به اپراتور»** با پشتیبان انسانی صحبت کنید\n\n` +
              `آیا می‌خواهید با اپراتور انسانی صحبت کنید؟`,
        data: {
          trackingCode,
          showOperatorButton: true
        }
      };
    }
  }
  
  // 2. درخواست اپراتور
  const operatorKeywords = ['اپراتور', 'انسان', 'پشتیبانی', 'صحبت', 'تلفن', 'تماس', 'support'];
  const isOperatorRequest = operatorKeywords.some(keyword => 
    cleanMsg.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (isOperatorRequest) {
    return {
      type: 'operator_request',
      text: `👨‍💼 **درخواست اتصال به اپراتور**\n\n` +
            `✅ درخواست شما برای صحبت با پشتیبان انسانی **ثبت شد**.\n` +
            `⏳ لطفاً منتظر بمانید تا اپراتور پاسخ دهد...\n\n` +
            `📞 **زمان انتظار تقریبی:** ۲-۵ دقیقه\n` +
            `💬 به محض آماده شدن، اپراتور با شما تماس می‌گیرد.`
    };
  }
  
  // 3. سلام و احوالپرسی
  const greetingKeywords = ['سلام', 'درود', 'هلو', 'slm', 'salam', 'hello', 'hi', 'صبخ', 'عصر'];
  const isGreeting = greetingKeywords.some(keyword => 
    cleanMsg.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (isGreeting) {
    return {
      type: 'greeting',
      text: `سلام عزیزم! 😊\nبه **پشتیبانی هوشمند شیک‌پوشان** خوش آمدید.\n\n` +
            `✨ **چطور می‌تونم کمکتون کنم؟**\n\n` +
            `📦 **پیگیری سفارش:** کد رهگیری را وارد کنید\n` +
            `🛍️ **محصولات:** نام محصول را بنویسید\n` +
            `👨‍💼 **پشتیبانی:** کلمه "اپراتور" را تایپ کنید\n\n` +
            `لطفاً نیاز خود را انتخاب کنید...`
    };
  }
  
  // 4. محصولات
  const productKeywords = ['پیراهن', 'شلوار', 'کفش', 'لباس', 'تیشرت', 'خرید', 'محصول', 'پیشنهاد', 'قیمت'];
  const isProductRequest = productKeywords.some(keyword => 
    cleanMsg.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (isProductRequest) {
    const products = await searchProducts(cleanMsg, 3);
    
    if (products.length > 0) {
      let responseText = `🎯 **پیشنهادات ویژه برای شما:**\n\n`;
      
      products.forEach((product, index) => {
        const priceText = product.on_sale 
          ? `~~${product.price.toLocaleString('fa-IR')}~~ **${product.sale_price.toLocaleString('fa-IR')} تومان** 🔥`
          : `${product.price.toLocaleString('fa-IR')} تومان`;
        
        responseText += `${index + 1}. **${product.name}**\n`;
        responseText += `   💰 ${priceText}\n`;
        responseText += `   📦 ${product.stock_status}\n`;
        responseText += `   🔗 [مشاهده و خرید](${product.url})\n\n`;
      });
      
      responseText += `💡 *برای خرید روی لینک محصولات کلیک کنید یا با پشتیبانی تماس بگیرید.*`;
      
      return {
        type: 'products_found',
        text: responseText,
        data: { products }
      };
    }
  }
  
  // 5. پاسخ پیش‌فرض
  return {
    type: 'general',
    text: `🤔 **لطفاً مشخص کنید:**\n\n` +
          `📦 **پیگیری سفارش:** کد رهگیری یا شماره سفارش را وارد کنید\n` +
          `👨‍💼 **پشتیبانی:** کلمه "اپراتور" را بنویسید\n` +
          `🛍️ **محصولات:** نام محصول مورد نظر را تایپ کنید\n\n` +
          `چگونه می‌توانم به شما کمک کنم؟ 😊`
  };
}

// ==================== تلگرام ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ذخیره اطلاعات درخواست‌ها
const operatorRequests = new Map();

bot.action(/accept_(.+)/, async (ctx) => {
  const sessionId = ctx.match[1];
  const request = operatorRequests.get(sessionId);
  
  if (!request) {
    return ctx.answerCbQuery('درخواست منقضی شده است');
  }
  
  // اپراتور پذیرفت
  operatorRequests.set(sessionId, { ...request, operatorId: ctx.chat.id, accepted: true });
  
  const session = getSession(sessionId);
  session.connectedToHuman = true;
  cache.set(sessionId, session);
  
  await ctx.answerCbQuery('✅ پذیرفته شد');
  
  await ctx.editMessageText(`✅ **اپراتور متصل شد**\n\n` +
                           `👤 کاربر: ${request.userName || 'ناشناس'}\n` +
                           `🆔 کد: ${sessionId}\n` +
                           `⏰ زمان: ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
                           `💬 اکنون می‌توانید با کاربر چت کنید.`);
  
  // اطلاع به کاربر
  io.to(sessionId).emit('operator-connected', {
    message: '🎉 **اپراتور متصل شد!**\n\nلطفاً سوال خود را مطرح کنید. اپراتور پاسخ خواهد داد.'
  });
});

bot.action(/reject_(.+)/, async (ctx) => {
  const sessionId = ctx.match[1];
  operatorRequests.delete(sessionId);
  await ctx.answerCbQuery('❌ رد شد');
  
  // اطلاع به کاربر
  io.to(sessionId).emit('operator-rejected', {
    message: 'متأسفانه در حال حاضر اپراتور در دسترس نیست. لطفاً سوال خود را از من بپرسید یا بعداً تلاش کنید. 😊'
  });
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  
  // پیدا کردن جلسه‌ای که این اپراتور پذیرفته
  const entry = [...operatorRequests.entries()]
    .find(([_, req]) => req.operatorId === ctx.chat.id);
  
  if (entry) {
    const [sessionId, request] = entry;
    
    // ارسال پیام به کاربر
    io.to(sessionId).emit('operator-message', {
      message: ctx.message.text,
      operator: ctx.from.first_name || 'اپراتور',
      timestamp: new Date().toISOString()
    });
    
    // ذخیره در تاریخچه
    const session = getSession(sessionId);
    session.messages.push({
      role: 'operator',
      content: ctx.message.text,
      timestamp: new Date().toISOString()
    });
    cache.set(sessionId, session);
    
    await ctx.reply('✅ پیام شما ارسال شد.');
  }
});

// ==================== API ها ====================

// API اصلی چت
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId: inputSessionId, userInfo } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'پیام معتبر ارسال کنید'
      });
    }
    
    const sessionId = inputSessionId || uuidv4();
    const session = updateSession(sessionId, { userInfo });
    
    // ذخیره پیام کاربر
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    
    // بررسی اتصال اپراتور
    const operatorRequest = operatorRequests.get(sessionId);
    if (operatorRequest?.accepted && session.connectedToHuman) {
      // ارسال به اپراتور
      await bot.telegram.sendMessage(
        operatorRequest.operatorId,
        `👤 **پیام جدید از کاربر**\n\n` +
        `🆔 کد: ${sessionId}\n` +
        `👤 نام: ${session.userInfo?.name || 'ناشناس'}\n` +
        `💬 پیام:\n${message}\n\n` +
        `⏰ ${new Date().toLocaleTimeString('fa-IR')}`
      );
      
      return res.json({
        success: true,
        operatorConnected: true,
        message: 'پیام شما به اپراتور ارسال شد. منتظر پاسخ باشید...',
        sessionId
      });
    }
    
    // پردازش هوشمند پیام
    const response = await processMessage(message, sessionId);
    
    // ذخیره پاسخ
    session.messages.push({
      role: 'assistant',
      content: response.text,
      type: response.type,
      timestamp: new Date().toISOString()
    });
    
    // ارسال real-time اگر سوکت متصل است
    if (io.sockets.adapter.rooms.get(sessionId)) {
      io.to(sessionId).emit('ai-response', {
        message: response.text,
        type: response.type,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: response.text,
      type: response.type,
      data: response.data || null,
      sessionId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ خطا در API چت:', error);
    res.status(500).json({
      success: false,
      error: 'خطا در پردازش پیام',
      message: 'با عرض پوزش، خطایی در سیستم رخ داد. لطفاً دوباره تلاش کنید.'
    });
  }
});

// API درخواست اپراتور
app.post('/api/request-operator', async (req, res) => {
  try {
    const { sessionId, reason = 'درخواست اتصال به اپراتور' } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'شناسه جلسه الزامی است'
      });
    }
    
    const session = getSession(sessionId);
    const userName = session.userInfo?.name || 'ناشناس';
    
    // ذخیره درخواست
    operatorRequests.set(sessionId, {
      sessionId,
      userName,
      reason,
      operatorId: null,
      accepted: false,
      requestedAt: new Date()
    });
    
    // ارسال به تلگرام
    await bot.telegram.sendMessage(
      ADMIN_TELEGRAM_ID,
      `🔔 **درخواست پشتیبانی جدید**\n\n` +
      `🆔 **کد جلسه:** \`${sessionId}\`\n` +
      `👤 **کاربر:** ${userName}\n` +
      `📋 **دلیل:** ${reason}\n` +
      `⏰ **زمان:** ${new Date().toLocaleString('fa-IR')}\n\n` +
      `لطفاً درخواست را پذیرش یا رد کنید:`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ پذیرش درخواست', callback_data: `accept_${sessionId}` },
            { text: '❌ رد درخواست', callback_data: `reject_${sessionId}` }
          ]]
        }
      }
    );
    
    // اطلاع به کاربر
    io.to(sessionId).emit('operator-requested', {
      message: '✅ درخواست شما برای اپراتور ارسال شد.\n⏳ لطفاً منتظر پذیرش بمانید...'
    });
    
    res.json({
      success: true,
      message: 'درخواست شما برای اپراتور ارسال شد. منتظر پذیرش باشید...',
      pending: true,
      sessionId
    });
    
  } catch (error) {
    console.error('❌ خطا در API اپراتور:', error);
    res.status(500).json({
      success: false,
      error: 'خطا در ارسال درخواست'
    });
  }
});

// API پیگیری سفارش
app.post('/api/track', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.json({
        success: false,
        error: 'کد رهگیری الزامی است'
      });
    }
    
    const result = await findOrderByCode(code);
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'خطا در سرویس پیگیری'
    });
  }
});

// API وضعیت
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    sessions: cache.keys().length,
    operatorRequests: operatorRequests.size,
    uptime: process.uptime()
  });
});

// ==================== سوکت‌ها ====================
io.on('connection', (socket) => {
  console.log('🔌 کاربر متصل شد:', socket.id);
  
  socket.on('join-session', (sessionId) => {
    if (sessionId) {
      socket.join(sessionId);
      console.log(`📱 سوکت ${socket.id} به جلسه ${sessionId} پیوست`);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 کاربر قطع شد:', socket.id);
  });
});

// ==================== صفحه تست ====================
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تست سیستم پشتیبانی</title>
      <style>
        body { font-family: Tahoma; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        input, button, textarea { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
        button { background: #4A90E2; color: white; border: none; cursor: pointer; }
        button:hover { background: #357ae8; }
        .response { background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; white-space: pre-wrap; }
        .operator-btn { background: #FF6B6B; }
        .track-btn { background: #34A853; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🧪 تست سیستم پشتیبانی هوشمند</h1>
        
        <div>
          <input type="text" id="message" placeholder="پیام خود را وارد کنید...">
          <button onclick="sendMessage()">💬 ارسال پیام</button>
          <button class="track-btn" onclick="trackOrder()">📦 تست پیگیری سفارش</button>
          <button class="operator-btn" onclick="requestOperator()">👨‍💼 درخواست اپراتور</button>
        </div>
        
        <div>
          <h3>📝 پاسخ سیستم:</h3>
          <div id="response" class="response">آماده تست...</div>
        </div>
        
        <div>
          <h3>📊 اطلاعات جلسه:</h3>
          <div id="sessionInfo"></div>
        </div>
      </div>
      
      <script>
        const sessionId = 'test_' + Date.now();
        const API_URL = window.location.origin;
        
        function showResponse(text, isError = false) {
          const div = document.getElementById('response');
          div.innerHTML = text;
          div.style.color = isError ? '#d32f2f' : '#333';
        }
        
        function updateSessionInfo() {
          document.getElementById('sessionInfo').innerText = '🆔 کد جلسه: ' + sessionId;
        }
        
        async function sendMessage() {
          const message = document.getElementById('message').value.trim();
          if (!message) return;
          
          showResponse('⏳ در حال پردازش...');
          
          try {
            const response = await fetch(API_URL + '/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, sessionId })
            });
            
            const data = await response.json();
            
            if (data.success) {
              showResponse(data.message);
            } else {
              showResponse('❌ خطا: ' + (data.error || 'خطای ناشناخته'), true);
            }
          } catch (error) {
            showResponse('❌ خطای شبکه: ' + error.message, true);
          }
        }
        
        async function trackOrder() {
          const code = prompt('لطفاً کد رهگیری را وارد کنید:');
          if (!code) return;
          
          showResponse('🔍 در حال جستجوی سفارش...');
          
          try {
            const response = await fetch(API_URL + '/api/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code })
            });
            
            const data = await response.json();
            
            if (data.found) {
              showResponse('✅ سفارش پیدا شد!\\n\\n' + 
                          'کد: ' + data.order.tracking_code + '\\n' +
                          'مشتری: ' + data.order.customer_name + '\\n' +
                          'وضعیت: ' + data.order.status + '\\n' +
                          'مبلغ: ' + data.order.total + ' تومان');
            } else {
              showResponse('❌ ' + data.message + '\\n\\n' +
                          'آیا می‌خواهید با اپراتور صحبت کنید؟');
            }
          } catch (error) {
            showResponse('❌ خطا در پیگیری: ' + error.message, true);
          }
        }
        
        async function requestOperator() {
          showResponse('👨‍💼 در حال ارسال درخواست اپراتور...');
          
          try {
            const response = await fetch(API_URL + '/api/request-operator', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                sessionId, 
                reason: 'درخواست تست از صفحه آزمایشی' 
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              showResponse('✅ درخواست شما ارسال شد!\\n' +
                          'لطفاً منتظر پذیرش اپراتور باشید...');
            } else {
              showResponse('❌ خطا: ' + data.error, true);
            }
          } catch (error) {
            showResponse('❌ خطای شبکه: ' + error.message, true);
          }
        }
        
        // بارگذاری اولیه
        updateSessionInfo();
        showResponse('✅ سیستم آماده است.\\n\\n' +
                    'میتوانید:\\n' +
                    '1. کد رهگیری وارد کنید\\n' +
                    '2. "اپراتور" بنویسید\\n' +
                    '3. یا پیام دلخواه ارسال کنید');
        
        // تست اولیه
        setTimeout(() => {
          fetch(API_URL + '/api/status').then(r => r.json()).then(data => {
            console.log('وضعیت سرور:', data);
          });
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

// صفحه اصلی
app.get('/', (req, res) => {
  res.redirect('/test');
});

// ==================== راه‌اندازی ====================
async function startServer() {
  try {
    // تست اتصال دیتابیس
    const connection = await pool.getConnection();
    console.log('✅ اتصال به دیتابیس موفق');
    
    // تست ساختار
    const [tables] = await connection.execute("SHOW TABLES LIKE '%order%'");
    console.log('📊 جداول سفارشات:', tables.map(t => Object.values(t)[0]));
    
    connection.release();
    
    server.listen(PORT, '0.0.0.0', async () => {
      console.log(`🚀 سرور روی پورت ${PORT} فعال شد`);
      console.log(`🌐 آدرس تست: http://localhost:${PORT}/test`);
      
      try {
        // اطلاع به مدیر
        await bot.telegram.sendMessage(
          ADMIN_TELEGRAM_ID,
          `🟢 **سیستم پشتیبانی راه‌اندازی شد**\n\n` +
          `📡 آدرس: http://localhost:${PORT}\n` +
          `⏰ زمان: ${new Date().toLocaleString('fa-IR')}\n` +
          `💾 دیتابیس: متصل ✅\n` +
          `🤖 ربات: فعال ✅`
        );
        
        bot.launch();
      } catch (error) {
        console.log('⚠️ تلگرام: ', error.message);
      }
    });
    
  } catch (error) {
    console.error('❌ خطا در راه‌اندازی:', error);
    process.exit(1);
  }
}

// مدیریت خاموشی
process.on('SIGINT', async () => {
  console.log('🛑 خاموش کردن سرور...');
  try {
    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, '🔴 سیستم در حال خاموش شدن...');
  } catch (error) {
    console.error('خطا در خاموش کردن:', error);
  }
  process.exit(0);
});

// شروع
startServer();
