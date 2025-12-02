<!-- چت‌بات کاملاً مستقل APM Show - نسخه فوری -->
<script>
(function() {
    if (window.APMChatbotInstalled) return;
    window.APMChatbotInstalled = true;
    
    console.log('🚀 در حال بارگذاری چت‌بات APM Show...');
    
    // تاخیر 3 ثانیه قبل از نمایش
    setTimeout(() => {
        
        // 1. بارگذاری Font Awesome
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            document.head.appendChild(faLink);
        }
        
        // 2. بارگذاری فونت ایران یکان
        const fontLink = document.createElement('link');
        fontLink.href = 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
        
        // 3. استایل‌های زیبا
        const style = document.createElement('style');
        style.textContent = `
            /* چت‌بات */
            .apm-chatbot-ultimate {
                position: fixed;
                bottom: 25px;
                left: 25px;
                z-index: 2147483647;
                font-family: 'Vazirmatn', Tahoma, sans-serif;
            }
            
            /* دکمه چت */
            .apm-chat-btn {
                width: 70px;
                height: 70px;
                border-radius: 50%;
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 10px 30px rgba(124, 58, 237, 0.5);
                transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                animation: chat-pulse 2s infinite;
                position: relative;
                overflow: hidden;
            }
            
            @keyframes chat-pulse {
                0% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.7); }
                70% { box-shadow: 0 0 0 20px rgba(124, 58, 237, 0); }
                100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
            }
            
            .apm-chat-btn:hover {
                transform: scale(1.15) rotate(10deg);
                box-shadow: 0 15px 40px rgba(124, 58, 237, 0.7);
            }
            
            .apm-chat-btn i {
                color: white;
                font-size: 30px;
                z-index: 2;
                position: relative;
            }
            
            /* لوگو */
            .apm-chat-logo {
                position: absolute;
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 50%;
                z-index: 1;
            }
            
            /* پنجره چت */
            .apm-chat-box {
                position: absolute;
                bottom: 85px;
                left: 0;
                width: 400px;
                max-width: 90vw;
                height: 650px;
                max-height: 85vh;
                background: white;
                border-radius: 24px;
                box-shadow: 0 25px 100px rgba(0, 0, 0, 0.25);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                transform: translateY(30px) scale(0.9);
                transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                pointer-events: none;
                border: 2px solid rgba(124, 58, 237, 0.1);
            }
            
            .apm-chat-box.active {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: all;
            }
            
            /* هدر */
            .apm-chat-header {
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
                color: white;
                padding: 22px 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: relative;
                overflow: hidden;
            }
            
            .apm-chat-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                animation: shine 3s infinite;
            }
            
            @keyframes shine {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            
            .apm-chat-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
                display: flex;
                align-items: center;
                gap: 12px;
                position: relative;
                z-index: 1;
            }
            
            /* دکمه بستن زیبا */
            .apm-close-btn {
                background: rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(10px);
                border: none;
                color: white;
                width: 40px;
                height: 40px;
                border-radius: 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                z-index: 1;
            }
            
            .apm-close-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: rotate(90deg) scale(1.1);
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
            }
            
            /* پیام‌ها */
            .apm-messages {
                flex: 1;
                padding: 24px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 18px;
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            }
            
            .apm-msg {
                max-width: 82%;
                padding: 18px 20px;
                border-radius: 20px;
                line-height: 1.7;
                animation: msg-appear 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                font-size: 15px;
                position: relative;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
            
            @keyframes msg-appear {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            
            .apm-msg.user {
                align-self: flex-end;
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
                color: white;
                border-bottom-right-radius: 8px;
                box-shadow: 0 8px 16px rgba(124, 58, 237, 0.3);
            }
            
            .apm-msg.bot {
                align-self: flex-start;
                background: white;
                color: #1f2937;
                border-bottom-left-radius: 8px;
                border-right: 4px solid #7c3aed;
            }
            
            /* پیشنهادهای زیبا */
            .apm-suggestions {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-top: 24px;
                padding-top: 24px;
                border-top: 1px solid rgba(0, 0, 0, 0.08);
            }
            
            .apm-sug-btn {
                background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
                border: 2px solid transparent;
                border-radius: 16px;
                padding: 16px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
                color: #374151;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                text-align: center;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            }
            
            .apm-sug-btn:hover {
                background: linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(79, 70, 229, 0.1) 100%);
                border-color: #7c3aed;
                color: #7c3aed;
                transform: translateY(-3px);
                box-shadow: 0 8px 20px rgba(124, 58, 237, 0.15);
            }
            
            /* ناحیه ورودی */
            .apm-input-area {
                padding: 20px 24px;
                border-top: 1px solid rgba(0, 0, 0, 0.08);
                display: flex;
                gap: 12px;
                background: white;
                flex-shrink: 0;
            }
            
            .apm-input {
                flex: 1;
                padding: 16px 20px;
                border: 2px solid #e5e7eb;
                border-radius: 16px;
                font-size: 15px;
                outline: none;
                transition: all 0.3s;
                direction: rtl;
                background: #f9fafb;
                font-family: 'Vazirmatn', Tahoma, sans-serif;
            }
            
            .apm-input:focus {
                border-color: #7c3aed;
                background: white;
                box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.1);
            }
            
            .apm-send-btn {
                width: 56px;
                height: 56px;
                border-radius: 16px;
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
                color: white;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s;
                box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
            }
            
            .apm-send-btn:hover {
                transform: translateY(-2px) scale(1.05);
                box-shadow: 0 8px 20px rgba(124, 58, 237, 0.4);
            }
            
            /* نشانگر تایپ */
            .apm-typing {
                display: flex;
                gap: 10px;
                padding: 16px 24px;
                background: white;
                border-radius: 20px;
                width: fit-content;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                align-self: flex-start;
            }
            
            .apm-typing span {
                width: 12px;
                height: 12px;
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
                border-radius: 50%;
                animation: typing-bounce 1.4s infinite;
            }
            
            .apm-typing span:nth-child(1) { animation-delay: -0.32s; }
            .apm-typing span:nth-child(2) { animation-delay: -0.16s; }
            
            @keyframes typing-bounce {
                0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
                40% { transform: scale(1); opacity: 1; }
            }
            
            /* نوتیفیکیشن */
            .apm-notif {
                position: absolute;
                top: -8px;
                right: -8px;
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                font-weight: 800;
                animation: notif-pulse 2s infinite;
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
                border: 3px solid white;
                z-index: 3;
            }
            
            @keyframes notif-pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            
            /* انیمیشن ورود */
            @keyframes slide-up {
                from { opacity: 0; transform: translateY(30px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            
            .apm-slide-up {
                animation: slide-up 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
            
            /* رسپانسیو */
            @media (max-width: 768px) {
                .apm-chat-box {
                    width: 360px;
                    left: -140px;
                }
                
                .apm-chatbot-ultimate {
                    bottom: 20px;
                    left: 20px;
                }
                
                .apm-chat-btn {
                    width: 65px;
                    height: 65px;
                }
                
                .apm-suggestions {
                    grid-template-columns: 1fr;
                }
            }
            
            @media (max-width: 480px) {
                .apm-chat-box {
                    width: 320px;
                    left: -110px;
                    height: 550px;
                }
                
                .apm-chatbot-ultimate {
                    bottom: 15px;
                    left: 15px;
                }
                
                .apm-chat-btn {
                    width: 60px;
                    height: 60px;
                }
                
                .apm-chat-btn i {
                    font-size: 26px;
                }
            }
        `;
        document.head.appendChild(style);
        
        // 4. ایجاد HTML
        const container = document.createElement('div');
        container.className = 'apm-chatbot-ultimate apm-slide-up';
        container.innerHTML = `
            <button class="apm-chat-btn" id="apm-chat-btn">
                <div class="apm-notif" id="apm-notif" style="display: none;">!</div>
                <i class="fas fa-comments"></i>
            </button>
            
            <div class="apm-chat-box" id="apm-chat-box">
                <div class="apm-chat-header">
                    <h3>
                        <i class="fas fa-robot"></i>
                        من ربات هوشمند فروشگاه هستم
                    </h3>
                    <button class="apm-close-btn" id="apm-close-btn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="apm-messages" id="apm-messages">
                    <div class="apm-msg bot">
                        <strong>👋 سلام! من ربات هوشمند فروشگاه APM Show هستم</strong><br><br>
                        خوشحالم که در خدمت شما هستم. چطور می‌تونم کمکتون کنم؟<br><br>
                        <div class="apm-suggestions" id="apm-suggestions">
                            <button class="apm-sug-btn" data-question="چطور سایز مناسب را انتخاب کنم؟">
                                <i class="fas fa-ruler"></i>
                                انتخاب سایز
                            </button>
                            <button class="apm-sug-btn" data-question="سفارشم کی میرسه؟">
                                <i class="fas fa-shipping-fast"></i>
                                زمان ارسال
                            </button>
                            <button class="apm-sug-btn" data-question="کیفیت محصولات شما چطوره؟">
                                <i class="fas fa-award"></i>
                                کیفیت محصولات
                            </button>
                            <button class="apm-sug-btn" data-question="چطور سفارشم را پیگیری کنم؟">
                                <i class="fas fa-search"></i>
                                پیگیری سفارش
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="apm-input-area">
                    <input type="text" 
                           class="apm-input" 
                           id="apm-input" 
                           placeholder="سوال خود را بنویسید..."
                           dir="rtl">
                    
                    <button class="apm-send-btn" id="apm-send-btn">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // 5. دریافت المان‌ها
        const chatBtn = document.getElementById('apm-chat-btn');
        const chatBox = document.getElementById('apm-chat-box');
        const closeBtn = document.getElementById('apm-close-btn');
        const sendBtn = document.getElementById('apm-send-btn');
        const chatInput = document.getElementById('apm-input');
        const messages = document.getElementById('apm-messages');
        const suggestions = document.getElementById('apm-suggestions');
        const notif = document.getElementById('apm-notif');
        
        let isOpen = false;
        let msgCount = 0;
        
        // 6. پاسخ‌های هوشمند
        const responses = {
            'greeting': [
                "سلام عزیز! 😊 خوش اومدید. چه کمکی از دستم برمیاد؟",
                "درود! 👋 به پشتیبانی هوشمند APM Show خوش آمدید."
            ],
            'size': [
                "🤔 برای انتخاب سایز مناسب:\n\n1️⃣ از جدول سایز در صفحه محصول استفاده کنید\n2️⃣ اگر بین دو سایز مردد هستید:\n   • قد و وزن خود را بفرستید\n   • فرم بدن خود را توصیف کنید\n3️⃣ نکات مهم:\n   • لباس‌های فیت: یک سایز بزرگتر\n   • لباس‌های آزاد: سایز معمولی\n   • اگر شک دارید، سایز بزرگتر بهتره\n\nبرای راهنمایی دقیق‌تر، می‌تونم قد و وزنتون رو داشته باشم؟",
                "🎯 انتخاب سایز درست = رضایت بیشتر!\n\n• مشتریان با قد 160-170: سایز S/M\n• قد 170-180: سایز M/L\n• قد 180+: سایز L/XL\n\nاین یک راهنمای کلیه. بهترین کار استفاده از جدول سایز محصوله."
            ],
            'delivery': [
                "🚚 درباره زمان ارسال:\n\n• تولید اختصاصی: هر محصول برای شما ساخته می‌شه\n• کنترل کیفیت: هر مرحله بررسی دقیق می‌شه\n• دقت در دوخت: کیفیت بر سرعت اولویته\n\n⏱️ زمان‌بندی معمول:\n📦 آماده‌سازی: 1-2 روز\n🛠️ تولید: 2-3 روز\n📮 ارسال: 1-2 روز\n\n✅ جمع: 2-5 روز کاری\n\nآمار ما: 98% سفارشات در زمان مقرر تحویل داده شدن!",
                "⏳ درک می‌کنم که منتظر موندن سخت‌ه. اما دلیل تأخیر احتمالی:\n\n✨ کیفیت > سرعت\n✨ هر محصول اختصاصی تولید می‌شه\n✨ پارچه‌های درجه یک زمان بر می‌دارن\n✨ دوخت دقیق نیاز به صبر داره\n\nهدف ما اینه که محصولی به دستتون برسه که سال‌ها ازش لذت ببرید، نه اینکه سریع اما بی‌کیفیت!"
            ],
            'quality': [
                "🏆 کیفیت محصولات ما:\n\n• پارچه: درجه یک، ضد حساسیت، نرم و با دوام\n• دوخت: دقیق، با ماشین‌آلات پیشرفته\n• چاپ: ثابت، ضد آب، با کیفیت بالا\n• کنترل کیفیت: 3 مرحله بررسی قبل از ارسال\n\nما روی کیفیت مصالحه نمی‌کنیم چون می‌دونیم شما شایسته بهترین‌ها هستید!",
                "🔥 تفاوت محصولات ما:\n\n✓ تولید داخلی با نظارت مستقیم\n✓ مواد اولیه وارداتی و درجه یک\n✓ دوخت صنعتی و حرفه‌ای\n✓ طراحی منحصر به فرد\n✓ گارانتی سلامت کالا\n\nتا امروز بیش از 5000 مشتری راضی داشتیم که بهترین گواه کیفیت ماست!"
            ],
            'tracking': [
                "📦 برای پیگیری سفارش:\n\n1️⃣ شماره سفارش خود را بفرستید\n2️⃣ یا شماره موبایل ثبت‌شده را اعلام کنید\n3️⃣ یا منتظر پیامک کد رهگیری باشید\n\nاگر کد رهگیری ندارید، یعنی سفارش:\n• در حال آماده‌سازی است\n• یا در خط تولید قرار دارد\n• یا در مرحله کنترل کیفیت است\n\nنگران نباشید، به محض ارسال، کد رهگیری براتون فعال می‌شه!",
                "📍 وضعیت سفارشات:\n\n🔵 ثبت‌شده: در صف تولید\n🟡 در حال تولید: در دست ساخت\n🟢 آماده: در حال بسته‌بندی\n🚚 ارسال شده: کد رهگیری فعال شده\n\nشماره سفارشتون چنده؟ براتون چک می‌کنم."
            ],
            'return': [
                "↩️ سیاست بازگشت:\n\nمتأسفانه به دلیل تولید اختصاصی، بازگشت وجه پس از شروع تولید امکان‌پذیر نیست. دلیلش:\n\n• مواد اولیه مخصوص سفارش شما تهیه شده\n• زمان کارگاه اختصاص داده شده\n• نیروی انسانی برنامه‌ریزی شده\n\n🔄 اما راه‌حل:\n• قبل از خرید، سایز و مشخصات را دقیق بررسی کنید\n• در صورت موجود بودن، امکان تعویض سایز وجود دارد\n• برای راهنمایی بیشتر، قد و وزن خود را بفرستید"
            ],
            'price': [
                "💰 درباره قیمت‌ها:\n\nقیمت = کیفیت + زمان + دقت\n\n• مواد اولیه مرغوب\n• زمان تولید اختصاصی\n• دقت در دوخت و جزئیات\n• طراحی منحصر به فرد\n\nارزان بودن هدف ما نیست! هدف ما ارائه محصولی است که:\n✓ سال‌ها استفاده کنید\n✓ از کیفیتش لذت ببرید\n✓ به دوستان معرفی کنید\n\nهر ریالش ارزشش رو داره!"
            ],
            'default': [
                "سوال خوبی پرسیدید! برای پاسخ دقیق‌تر، لطفاً سوال خود را با جزئیات بیشتر بنویسید.",
                "متوجه منظورتون شدم. در حال حاضر اطلاعات کامل‌تری نیاز دارم. می‌تونید سوالتون رو به صورت واضح‌تر بپرسید؟",
                "برای پاسخ به این سوال، بهتره مستقیم با پشتیبانی تماس بگیرید. می‌تونم شماره تماس رو در اختیارتون بذارم."
            ]
        };
        
        // 7. تشخیص موضوع
        function getTopic(text) {
            text = text.toLowerCase();
            
            if (text.includes('سلام') || text.includes('درود') || text.includes('السلام')) return 'greeting';
            if (text.includes('سایز') || text.includes('اندازه') || text.includes('بزرگ') || text.includes('کوچک') || text.includes('قد') || text.includes('وزن')) return 'size';
            if (text.includes('زمان') || text.includes('ارسال') || text.includes('تاخیر') || text.includes('کی میرسه') || text.includes('چند روز') || text.includes('دیر')) return 'delivery';
            if (text.includes('کیفیت') || text.includes('جنس') || text.includes('پارچه') || text.includes('چرم') || text.includes('نخ')) return 'quality';
            if (text.includes('پیگیری') || text.includes('وضعیت') || text.includes('کجاست') || text.includes('تحویل')) return 'tracking';
            if (text.includes('بازگشت') || text.includes('مرجوع') || text.includes('عودت') || text.includes('پول') || text.includes('تضمین')) return 'return';
            if (text.includes('قیمت') || text.includes('هزینه') || text.includes('گرون') || text.includes('ارزان') || text.includes('تخفیف')) return 'price';
            
            return 'default';
        }
        
        // 8. اضافه کردن پیام
        function addMsg(sender, text) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `apm-msg ${sender}`;
            msgDiv.textContent = text;
            
            messages.appendChild(msgDiv);
            scrollToBottom();
        }
        
        // 9. نشانگر تایپ
        function showTyping() {
            const typing = document.createElement('div');
            typing.className = 'apm-typing';
            typing.id = 'apm-typing';
            typing.innerHTML = '<span></span><span></span><span></span>';
            messages.appendChild(typing);
            scrollToBottom();
        }
        
        function hideTyping() {
            const typing = document.getElementById('apm-typing');
            if (typing) typing.remove();
        }
        
        // 10. اسکرول
        function scrollToBottom() {
            setTimeout(() => {
                messages.scrollTop = messages.scrollHeight;
            }, 100);
        }
        
        // 11. ارسال پیام
        function sendMsg() {
            const text = chatInput.value.trim();
            if (!text) return;
            
            // نمایش پیام کاربر
            addMsg('user', text);
            chatInput.value = '';
            
            // تشخیص موضوع و پاسخ
            showTyping();
            
            setTimeout(() => {
                hideTyping();
                
                const topic = getTopic(text);
                const topicResponses = responses[topic] || responses['default'];
                const response = topicResponses[Math.floor(Math.random() * topicResponses.length)];
                
                addMsg('bot', response);
                msgCount++;
                
                // اگر کاربر درخواست اپراتور کرد
                if (text.includes('انسان') || text.includes('اپراتور') || text.includes('واقعی') || text.includes('زنده')) {
                    setTimeout(() => {
                        addMsg('bot', '💡 برای ارتباط با اپراتور انسانی، لطفاً به آی‌دی اینستاگرام ما پیام دهید: @apmshow_\n\nتیم پشتیبانی در سریع‌ترین زمان پاسخگوی شماست.');
                    }, 1000);
                }
                
                // اگر چت بسته بود، نوتیفیکیشن نشون بده
                if (!isOpen && msgCount === 1) {
                    notif.style.display = 'flex';
                }
            }, 1500 + Math.random() * 1000);
        }
        
        // 12. رویدادها
        chatBtn.addEventListener('click', () => {
            isOpen = !isOpen;
            chatBox.classList.toggle('active', isOpen);
            if (isOpen) {
                chatInput.focus();
                scrollToBottom();
                notif.style.display = 'none';
                msgCount = 0;
            }
        });
        
        closeBtn.addEventListener('click', () => {
            isOpen = false;
            chatBox.classList.remove('active');
        });
        
        sendBtn.addEventListener('click', sendMsg);
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMsg();
            }
        });
        
        // پیشنهادهای سریع
        suggestions.addEventListener('click', (e) => {
            if (e.target.classList.contains('apm-sug-btn')) {
                const question = e.target.dataset.question;
                chatInput.value = question;
                sendMsg();
            }
        });
        
        // بستن با کلیک خارج
        document.addEventListener('click', (e) => {
            if (isOpen && !chatBox.contains(e.target) && !chatBtn.contains(e.target)) {
                isOpen = false;
                chatBox.classList.remove('active');
            }
        });
        
        // 13. لوگو
        setTimeout(() => {
            const logoUrl = 'http://myappadmin.info/ei_1762331920282-removebg-preview.png';
            const img = new Image();
            img.onload = function() {
                const icon = chatBtn.querySelector('i');
                icon.style.display = 'none';
                
                const logo = document.createElement('img');
                logo.className = 'apm-chat-logo';
                logo.src = logoUrl;
                logo.alt = 'APM Show';
                
                chatBtn.appendChild(logo);
                chatBtn.appendChild(icon.cloneNode(true));
            };
            img.src = logoUrl;
        }, 1000);
        
        console.log('✅ چت‌بات APM Show با موفقیت نصب شد!');
        
        // 14. نمایش نوتیفیکیشن بعد از 5 ثانیه
        setTimeout(() => {
            if (!isOpen) {
                notif.style.display = 'flex';
                notif.textContent = '!';
            }
        }, 5000);
        
    }, 3000); // تاخیر 3 ثانیه
    
})();
</script>
