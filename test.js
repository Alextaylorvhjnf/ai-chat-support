// فایل: test.js
const mysql = require('mysql2/promise');

async function test() {
  console.log('🔍 تست دیتابیس شیک‌پوشان...\n');
  
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'apmsho_shikpooshan',
    password: '5W2nn}@tkm8926G*',
    database: 'apmsho_shikpooshan'
  });

  try {
    // 1. تست اتصال
    console.log('✅ اتصال موفق\n');
    
    // 2. بررسی آخرین سفارشات
    console.log('📦 آخرین 5 سفارش:');
    const [orders] = await pool.execute(`
      SELECT ID, post_title, post_date, post_status
      FROM wp_posts 
      WHERE post_type = 'shop_order'
      ORDER BY ID DESC
      LIMIT 5
    `);
    
    orders.forEach(order => {
      console.log(`#${order.ID} | "${order.post_title}" | ${order.post_status} | ${order.post_date}`);
    });
    
    // 3. جستجوی 7123
    console.log('\n🔍 جستجوی "7123":');
    const [search7123] = await pool.execute(`
      SELECT ID, post_title, post_date, post_status
      FROM wp_posts 
      WHERE post_type = 'shop_order'
        AND (ID = 7123 OR post_title LIKE '%7123%')
    `);
    
    if (search7123.length > 0) {
      search7123.forEach(order => {
        console.log(`✅ پیدا شد: #${order.ID} - "${order.post_title}"`);
      });
    } else {
      console.log('❌ شماره 7123 پیدا نشد');
    }
    
    // 4. فرمت شماره سفارشات
    console.log('\n📝 نمونه فرمت‌ها:');
    const [formats] = await pool.execute(`
      SELECT DISTINCT post_title
      FROM wp_posts 
      WHERE post_type = 'shop_order'
      ORDER BY ID DESC
      LIMIT 3
    `);
    
    formats.forEach(f => {
      console.log(`"${f.post_title}"`);
    });

  } catch (error) {
    console.error('❌ خطا:', error.message);
  } finally {
    await pool.end();
  }
}

test();
