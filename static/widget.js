// چت‌بات حرفه‌ای APM Show - نسخه 2.0
(function() {
    if (window.APMChatbotV2) return;
    window.APMChatbotV2 = true;
    
    console.log('🚀 در حال بارگذاری چت‌بات حرفه‌ای APM Show...');
    
    // تنظیمات
    const CONFIG = {
        API_URL: 'https://web-production-4063.up.railway.app/api/chat',
        LOAD_DELAY: 3000, // 3 ثانیه تاخیر
        AUTO_OPEN: false, // باز شدن خودکار
        SHOW_NOTIFICATION: true,
        PRIMARY_COLOR: '#7c3aed',
        SECONDARY_COLOR: '#4f46e5',
        ACCENT_COLOR: '#f59e0b'
    };
    
    // استایل‌های زیبا
    const style = document.createElement('style');
    style.textContent = `
        /* فونت ایران یکان */
        @import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css');
        
        /* ویجت چت */
        .apm-chatbot-v2 {
            position: fixed;
            bottom: 30px;
            left: 30px;
            z-index: 2147483647;
            font-family: 'Vazirmatn', Tahoma, sans-serif;
        }
        
        /* دکمه باز کردن چت */
        .apm-chat-toggle-v2 {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, ${CONFIG.SECONDARY_COLOR} 100%);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 32px rgba(124, 58, 237, 0.4);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            padding: 0;
        }
        
        .apm-chat-toggle-v2:hover {
            transform: scale(1.15) rotate(5deg);
            box-shadow: 0 12px 48px rgba(124, 58, 237, 0.6);
        }
        
        .apm-chat-toggle-v2::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.9), rgba(79, 70, 229, 0.9));
            border-radius: 50%;
        }
        
        .apm-chat-toggle-v2::after {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR}, ${CONFIG.ACCENT_COLOR}, ${CONFIG.SECONDARY_COLOR});
            border-radius: 50%;
            z-index: -1;
            animation: apm-rotate 3s linear infinite;
            opacity: 0.7;
        }
        
        @keyframes apm-rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .apm-chat-toggle-v2 i {
            position: relative;
            z-index: 2;
            color: white;
            font-size: 28px;
            transition: transform 0.3s;
        }
        
        /* پنجره چت */
        .apm-chat-window-v2 {
            position: absolute;
            bottom: 85px;
            left: 0;
            width: 420px;
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
            font-family: 'Vazirmatn', Tahoma, sans-serif;
            border: 1px solid rgba(124, 58, 237, 0.1);
        }
        
        .apm-chat-window-v2.active {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: all;
        }
        
        /* هدر پنجره چت */
        .apm-chat-header-v2 {
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, ${CONFIG.SECONDARY_COLOR} 100%);
            color: white;
            padding: 22px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            position: relative;
            overflow: hidden;
        }
        
        .apm-chat-header-v2::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0,0 L100,0 L100,100 Z" fill="rgba(255,255,255,0.1)"/></svg>');
            background-size: cover;
            opacity: 0.1;
        }
        
        .apm-chat-header-v2 h3 {
            margin: 0;
            font-size: 17px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 12px;
            position: relative;
            z-index: 1;
        }
        
        .apm-chat-header-v2 h3 i {
            font-size: 20px;
            color: ${CONFIG.ACCENT_COLOR};
        }
        
        /* دکمه بستن زیبا */
        .apm-close-chat-v2 {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 38px;
            height: 38px;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            z-index: 1;
            backdrop-filter: blur(10px);
        }
        
        .apm-close-chat-v2:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: rotate(90deg) scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .apm-close-chat-v2 i {
            font-size: 18px;
            transition: transform 0.3s;
        }
        
        /* ناحیه پیام‌ها */
        .apm-chat-messages-v2 {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 18px;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            background-attachment: fixed;
        }
        
        /* پیام‌ها */
        .apm-message-v2 {
            max-width: 82%;
            padding: 18px 20px;
            border-radius: 20px;
            line-height: 1.7;
            animation: apm-message-appear 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 15px;
            word-wrap: break-word;
            position: relative;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        
        @keyframes apm-message-appear {
            from {
                opacity: 0;
                transform: translateY(20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }
        
        /* پیام کاربر */
        .apm-message-v2.user {
            align-self: flex-end;
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, ${CONFIG.SECONDARY_COLOR} 100%);
            color: white;
            border-bottom-right-radius: 8px;
            box-shadow: 0 8px 16px rgba(124, 58, 237, 0.3);
        }
        
        .apm-message-v2.user::before {
            content: '';
            position: absolute;
            bottom: 0;
            right: -8px;
            width: 0;
            height: 0;
            border-left: 10px solid transparent;
            border-right: 10px solid transparent;
            border-bottom: 10px solid ${CONFIG.PRIMARY_COLOR};
            transform: rotate(45deg);
        }
        
        /* پیام ربات */
        .apm-message-v2.bot {
            align-self: flex-start;
            background: white;
            color: #1f2937;
            border-bottom-left-radius: 8px;
            border-right: 4px solid ${CONFIG.PRIMARY_COLOR};
        }
        
        .apm-message-v2.bot::before {
            content: '';
            position: absolute;
            bottom: 0;
            left: -8px;
            width: 0;
            height: 0;
            border-left: 10px solid transparent;
            border-right: 10px solid transparent;
            border-bottom: 10px solid white;
            transform: rotate(-45deg);
        }
        
        /* ناحیه ورودی */
        .apm-chat-input-area-v2 {
            padding: 20px 24px;
            border-top: 1px solid rgba(0, 0, 0, 0.08);
            display: flex;
            gap: 12px;
            background: white;
            flex-shrink: 0;
        }
        
        .apm-chat-input-v2 {
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
        
        .apm-chat-input-v2:focus {
            border-color: ${CONFIG.PRIMARY_COLOR};
            background: white;
            box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.1);
        }
        
        .apm-chat-input-v2::placeholder {
            color: #9ca3af;
        }
        
        /* دکمه ارسال */
        .apm-send-btn-v2 {
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, ${CONFIG.SECONDARY_COLOR} 100%);
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }
        
        .apm-send-btn-v2:hover {
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 8px 20px rgba(124, 58, 237, 0.4);
        }
        
        .apm-send-btn-v2:active {
            transform: translateY(0) scale(0.98);
        }
        
        .apm-send-btn-v2:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        /* نشانگر تایپ */
        .apm-typing-indicator-v2 {
            display: flex;
            gap: 10px;
            padding: 16px 24px;
            background: white;
            border-radius: 20px;
            width: fit-content;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            align-self: flex-start;
            margin-bottom: 10px;
        }
        
        .apm-typing-indicator-v2 span {
            width: 12px;
            height: 12px;
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, ${CONFIG.SECONDARY_COLOR} 100%);
            border-radius: 50%;
            animation: apm-typing-bounce 1.4s infinite;
        }
        
        .apm-typing-indicator-v2 span:nth-child(1) { animation-delay: -0.32s; }
        .apm-typing-indicator-v2 span:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes apm-typing-bounce {
            0%, 80%, 100% { 
                transform: scale(0);
                opacity: 0.5;
            }
            40% { 
                transform: scale(1);
                opacity: 1;
            }
        }
        
        /* پیشنهادهای سریع */
        .apm-suggestions-v2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(0, 0, 0, 0.06);
        }
        
        .apm-suggestion-btn-v2 {
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            border: 1px solid #d1d5db;
            border-radius: 14px;
            padding: 14px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            text-align: center;
            color: #374151;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .apm-suggestion-btn-v2:hover {
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR}15 0%, ${CONFIG.SECONDARY_COLOR}15 100%);
            border-color: ${CONFIG.PRIMARY_COLOR};
            color: ${CONFIG.PRIMARY_COLOR};
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);
        }
        
        .apm-suggestion-btn-v2 i {
            font-size: 14px;
            transition: transform 0.3s;
        }
        
        .apm-suggestion-btn-v2:hover i {
            transform: translateX(2px);
        }
        
        /* نوتیفیکیشن */
        .apm-notification-v2 {
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
            animation: apm-notification-pulse 2s infinite;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
            border: 3px solid white;
        }
        
        @keyframes apm-notification-pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        
        /* انیمیشن ورود */
        @keyframes apm-fade-in-up {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .apm-fade-in {
            animation: apm-fade-in-up 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        /* اسکرول بار زیبا */
        .apm-chat-messages-v2::-webkit-scrollbar {
            width: 8px;
        }
        
        .apm-chat-messages-v2::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
        }
        
        .apm-chat-messages-v2::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, ${CONFIG.SECONDARY_COLOR} 100%);
            border-radius: 4px;
        }
        
        .apm-chat-messages-v2::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(135deg, ${CONFIG.SECONDARY_COLOR} 0%, ${CONFIG.PRIMARY_COLOR} 100%);
        }
        
        /* ریسپانسیو */
        @media (max-width: 768px) {
            .apm-chat-window-v2 {
                width: 380px;
                left: -140px;
                height: 600px;
            }
            
            .apm-chatbot-v2 {
                bottom: 20px;
                left: 20px;
            }
            
            .apm-chat-toggle-v2 {
                width: 65px;
                height: 65px;
            }
            
            .apm-chat-toggle-v2 i {
                font-size: 26px;
            }
            
            .apm-suggestions-v2 {
                grid-template-columns: 1fr;
            }
        }
        
        @media (max-width: 480px) {
            .apm-chat-window-v2 {
                width: 340px;
                left: -100px;
                height: 550px;
            }
            
            .apm-chatbot-v2 {
                bottom: 15px;
                left: 15px;
            }
            
            .apm-chat-toggle-v2 {
                width: 60px;
                height: 60px;
            }
            
            .apm-chat-toggle-v2 i {
                font-size: 24px;
            }
            
            .apm-chat-input-v2 {
                padding: 14px 16px;
                font-size: 14px;
            }
            
            .apm-send-btn-v2 {
                width: 52px;
                height: 52px;
            }
        }
    `;
    
    document.head.appendChild(style);
    
    // بارگذاری Font Awesome
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(faLink);
    }
    
    // تاخیر 3 ثانیه قبل از نمایش
    setTimeout(() => {
        createChatbot();
    }, CONFIG.LOAD_DELAY);
    
    function createChatbot() {
        // ایجاد HTML ویجت
        const container = document.createElement('div');
        container.className = 'apm-chatbot-v2 apm-fade-in';
        container.innerHTML = `
            <button class="apm-chat-toggle-v2" id="apm-chat-toggle-v2">
                <div class="apm-notification-v2" id="apm-notification-v2" style="display: none;"></div>
                <i class="fas fa-comments"></i>
            </button>
            
            <div class="apm-chat-window-v2" id="apm-chat-window-v2">
                <div class="apm-chat-header-v2">
                    <h3>
                        <i class="fas fa-robot"></i>
                        ربات هوشمند APM Show
                    </h3>
                    <button class="apm-close-chat-v2" id="apm-close-chat-v2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="apm-chat-messages-v2" id="apm-chat-messages-v2">
                    <div class="apm-message-v2 bot">
                        <strong>👋 سلام! من ربات هوشمند فروشگاه APM Show هستم</strong><br><br>
                        خوشحالم که در خدمت شما هستم. می‌توانم در زمینه‌های زیر کمک کنم:<br><br>
                        • انتخاب سایز مناسب لباس و کفش<br>
                        • پیگیری وضعیت سفارشات<br>
                        • اطلاعات درباره کیفیت محصولات<br>
                        • راهنمایی درباره زمان ارسال<br>
                        • پاسخ به سوالات متداول<br><br>
                        چطور می‌تونم کمکتون کنم؟
                        
                        <div class="apm-suggestions-v2" id="apm-suggestions-v2">
                            <button class="apm-suggestion-btn-v2" data-question="چطور سایز مناسب را انتخاب کنم؟">
                                <i class="fas fa-ruler"></i>
                                انتخاب سایز
                            </button>
                            <button class="apm-suggestion-btn-v2" data-question="سفارشم کی میرسه؟">
                                <i class="fas fa-shipping-fast"></i>
                                زمان ارسال
                            </button>
                            <button class="apm-suggestion-btn-v2" data-question="کیفیت محصولات شما چطوره؟">
                                <i class="fas fa-award"></i>
                                کیفیت محصولات
                            </button>
                            <button class="apm-suggestion-btn-v2" data-question="چطور سفارشم را پیگیری کنم؟">
                                <i class="fas fa-search"></i>
                                پیگیری سفارش
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="apm-chat-input-area-v2">
                    <input type="text" 
                           class="apm-chat-input-v2" 
                           id="apm-chat-input-v2" 
                           placeholder="سوال خود را اینجا بنویسید..."
                           dir="rtl">
                    
                    <button class="apm-send-btn-v2" id="apm-send-btn-v2">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // دریافت المان‌ها
        const toggleBtn = document.getElementById('apm-chat-toggle-v2');
        const chatWindow = document.getElementById('apm-chat-window-v2');
        const closeBtn = document.getElementById('apm-close-chat-v2');
        const sendBtn = document.getElementById('apm-send-btn-v2');
        const chatInput = document.getElementById('apm-chat-input-v2');
        const messagesContainer = document.getElementById('apm-chat-messages-v2');
        const suggestionsContainer = document.getElementById('apm-suggestions-v2');
        const notification = document.getElementById('apm-notification-v2');
        
        let isOpen = false;
        let messageCount = 0;
        let conversationHistory = [];
        
        // پیشنهادهای سریع
        const suggestions = [
            {
                text: "چطور سایز مناسب را انتخاب کنم؟",
                icon: "fas fa-ruler",
                category: "size"
            },
            {
                text: "سفارشم کی میرسه؟",
                icon: "fas fa-shipping-fast",
                category: "delivery"
            },
            {
                text: "کیفیت محصولات شما چطوره؟",
                icon: "fas fa-award",
                category: "quality"
            },
            {
                text: "چطور سفارشم را پیگیری کنم؟",
                icon: "fas fa-search",
                category: "tracking"
            },
            {
                text: "آیا امکان بازگشت وجه وجود دارد؟",
                icon: "fas fa-undo",
                category: "return"
            },
            {
                text: "محصولات ساخت کجا هستند؟",
                icon: "fas fa-industry",
                category: "origin"
            },
            {
                text: "قیمت‌ها چطور تعیین می‌شوند؟",
                icon: "fas fa-tag",
                category: "price"
            },
            {
                text: "آیا امکان تعویض سایز وجود دارد؟",
                icon: "fas fa-exchange-alt",
                category: "exchange"
            }
        ];
        
        // ارسال پیام به سرور
        async function sendToServer(message) {
            try {
                console.log(`📤 ارسال پیام به سرور: ${message}`);
                
                const response = await fetch(CONFIG.API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ message: message })
                });
                
                if (!response.ok) {
                    throw new Error(`خطای HTTP: ${response.status}`);
                }
                
                const data = await response.json();
                console.log(`📥 پاسخ از سرور: ${data.reply.substring(0, 50)}...`);
                return data;
                
            } catch (error) {
                console.error('❌ خطا در ارسال پیام:', error);
                
                // در صورت خطا، از پاسخ‌های محلی استفاده می‌کنیم
                return getFallbackResponse(message);
            }
        }
        
        // پاسخ‌های محلی برای مواقع قطعی سرور
        function getFallbackResponse(message) {
            const msg = message.toLowerCase();
            
            if (msg.includes('سایز') || msg.includes('اندازه')) {
                return {
                    reply: "برای انتخاب سایز مناسب، پیشنهاد می‌کنم از جدول سایز در صفحه محصول استفاده کنید. اگر بین دو سایز مردد هستید، قد و وزن خود را بفرستید تا بهترین سایز را پیشنهاد کنم. معمولاً اگر فرم بدنی استاندارد دارید، سایز معمولی برای شما مناسب است.",
                    confidence: 0.9,
                    source: "fallback"
                };
            }
            
            if (msg.includes('کی میرسه') || msg.includes('زمان ارسال') || msg.includes('تاخیر')) {
                return {
                    reply: "به دلیل حجم بالای سفارشات و تولیدی بودن مجموعه، برخی سفارشات ممکن است ۲-۵ روز کاری زمان ببرد. اما نگران نباشید، تمام سفارشات ۱۰۰٪ به دست شما می‌رسند. ما کیفیت و دقت را به سرعت ترجیح می‌دهیم تا بهترین محصول را دریافت کنید.",
                    confidence: 0.9,
                    source: "fallback"
                };
            }
            
            if (msg.includes('کیفیت') || msg.includes('جنس')) {
                return {
                    reply: "تمام محصولات ما تولید داخلی و با مواد اولیه درجه یک هستند. پارچه‌ها با کیفیت بالا، دوخت دقیق و کنترل کیفیت شدید تولید می‌شوند. قبل از ارسال هر محصول بررسی نهایی می‌شود تا از سلامت آن مطمئن شویم.",
                    confidence: 0.9,
                    source: "fallback"
                };
            }
            
            if (msg.includes('پیگیری') || msg.includes('وضعیت')) {
                return {
                    reply: "برای پیگیری سفارش، شماره سفارش خود را بفرستید. همچنین پس از ارسال، کد رهگیری برای شما پیامک می‌شود. اگر هنوز کد رهگیری دریافت نکرده‌اید، سفارش در حال آماده‌سازی است.",
                    confidence: 0.9,
                    source: "fallback"
                };
            }
            
            if (msg.includes('بازگشت') || msg.includes('عودت') || msg.includes('پول')) {
                return {
                    reply: "به دلیل تولید اختصاصی و برنامه‌ریزی بر اساس سفارشات، بازگشت وجه پس از شروع تولید امکان‌پذیر نیست. این رویه برای حفظ کیفیت و برنامه‌ریزی دقیق ضروری است. لطفاً قبل از خرید، سایز و مشخصات را به دقت بررسی کنید.",
                    confidence: 0.9,
                    source: "fallback"
                };
            }
            
            // پاسخ پیش‌فرض
            return {
                reply: "متوجه سوال شما شدم. در حال حاضر به دلیل برخی مشکلات فنی، پاسخ کامل را نمی‌توانم ارائه دهم. لطفاً سوال خود را با جزئیات بیشتر مطرح کنید یا با پشتیبانی تماس بگیرید.",
                confidence: 0.5,
                source: "fallback"
            };
        }
        
        // نمایش نشانگر تایپ
        function showTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'apm-typing-indicator-v2';
            typingDiv.id = 'apm-typing-indicator-v2';
            
            typingDiv.innerHTML = `
                <span></span>
                <span></span>
                <span></span>
            `;
            
            messagesContainer.appendChild(typingDiv);
            scrollToBottom();
        }
        
        // پنهان کردن نشانگر تایپ
        function hideTypingIndicator() {
            const typingIndicator = document.getElementById('apm-typing-indicator-v2');
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }
        
        // اضافه کردن پیام
        function addMessage(sender, text, confidence = 1.0) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `apm-message-v2 ${sender}`;
            
            let messageHTML = text;
            
            // اگر پیام از اپراتور انسانی درخواست کند
            if (text.includes('@apmshow_')) {
                messageHTML = text.replace('@apmshow_', '<a href="https://instagram.com/apmshow_" target="_blank" style="color: #7c3aed; font-weight: bold; text-decoration: none;">@apmshow_</a>');
            }
            
            // اگر فرستنده ربات است و confidence کمتر از 1 است
            if (sender === 'bot' && confidence < 0.9) {
                messageHTML += `<div style="margin-top: 10px; font-size: 12px; color: #6b7280; opacity: 0.8;">
                    <i class="fas fa-info-circle"></i> پاسخ بر اساس دانش قبلی من
                </div>`;
            }
            
            messageDiv.innerHTML = messageHTML;
            messagesContainer.appendChild(messageDiv);
            
            conversationHistory.push({
                sender: sender,
                text: text,
                time: new Date().toLocaleTimeString('fa-IR'),
                confidence: confidence
            });
            
            // اضافه کردن پیشنهادهای جدید بعد از پاسخ ربات
            if (sender === 'bot' && confidence > 0.5) {
                setTimeout(() => {
                    addSuggestions();
                }, 300);
            }
            
            scrollToBottom();
            messageCount++;
            
            // نمایش نوتیفیکیشن اگر چت بسته است
            if (!isOpen && sender === 'bot' && CONFIG.SHOW_NOTIFICATION) {
                notification.style.display = 'flex';
                notification.textContent = messageCount > 9 ? '9+' : messageCount;
            }
        }
        
        // اضافه کردن پیشنهادها
        function addSuggestions() {
            // حذف پیشنهادهای قبلی
            const oldSuggestions = suggestionsContainer.querySelectorAll('.apm-suggestion-btn-v2');
            oldSuggestions.forEach(btn => btn.remove());
            
            // انتخاب 4 پیشنهاد تصادفی
            const shuffled = [...suggestions].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, 4);
            
            selected.forEach(suggestion => {
                const btn = document.createElement('button');
                btn.className = 'apm-suggestion-btn-v2';
                btn.innerHTML = `
                    <i class="${suggestion.icon}"></i>
                    ${suggestion.text}
                `;
                btn.dataset.question = suggestion.text;
                btn.addEventListener('click', () => {
                    chatInput.value = suggestion.text;
                    sendMessage();
                });
                suggestionsContainer.appendChild(btn);
            });
        }
        
        // اسکرول به پایین
        function scrollToBottom() {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
        
        // ارسال پیام
        async function sendMessage() {
            const text = chatInput.value.trim();
            
            if (!text) return;
            
            // غیرفعال کردن دکمه ارسال
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            // ذخیره متن و پاک کردن input
            const userMessage = text;
            chatInput.value = '';
            
            // نمایش پیام کاربر
            addMessage('user', userMessage);
            
            // نمایش نشانگر تایپ
            showTypingIndicator();
            
            try {
                // ارسال به سرور
                const response = await sendToServer(userMessage);
                
                // تاخیر برای طبیعی‌تر شدن (بین 1 تا 2 ثانیه)
                const delay = 1000 + Math.random() * 1000;
                
                setTimeout(() => {
                    hideTypingIndicator();
                    addMessage('bot', response.reply, response.confidence);
                    
                    // فعال کردن دکمه ارسال
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                    
                    // اگر کاربر سوالی پرسید که مربوط به تأخیر بود
                    if (userMessage.includes('تاخیر') || userMessage.includes('دیر') || userMessage.includes('کی میرسه')) {
                        setTimeout(() => {
                            addMessage('bot', "🔍 نکته مهم: علت تأخیر در ارسال، توجه به کیفیت و دقت در تولید است. هر محصول با حوصله و دقت بالا تولید می‌شود تا شما رضایت کامل داشته باشید. معمولاً محصولاتی که با کیفیت بالا تولید می‌شوند کمی زمان‌بر هستند.", 0.8);
                        }, 1500);
                    }
                    
                }, delay);
                
            } catch (error) {
                console.error('Error:', error);
                hideTypingIndicator();
                
                setTimeout(() => {
                    addMessage('bot', 'متأسفانه در پردازش سوال شما مشکلی پیش آمد. لطفاً دوباره تلاش کنید یا سوال خود را به صورت واضح‌تر مطرح کنید.', 0.3);
                    
                    // فعال کردن دکمه ارسال
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                }, 500);
            }
        }
        
        // رویدادها
        toggleBtn.addEventListener('click', () => {
            isOpen = !isOpen;
            
            if (isOpen) {
                chatWindow.classList.add('active');
                toggleBtn.style.transform = 'scale(1.1)';
                chatInput.focus();
                scrollToBottom();
                
                // پنهان کردن نوتیفیکیشن
                notification.style.display = 'none';
                messageCount = 0;
                
                // باز شدن با انیمیشن زیبا
                setTimeout(() => {
                    toggleBtn.style.transform = 'scale(1)';
                }, 300);
            } else {
                chatWindow.classList.remove('active');
                toggleBtn.style.transform = 'scale(1)';
            }
        });
        
        closeBtn.addEventListener('click', () => {
            isOpen = false;
            chatWindow.classList.remove('active');
            toggleBtn.style.transform = 'scale(1)';
        });
        
        sendBtn.addEventListener('click', sendMessage);
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // باز کردن چت با کلیک روی نوتیفیکیشن
        notification.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isOpen) {
                isOpen = true;
                chatWindow.classList.add('active');
                chatInput.focus();
                scrollToBottom();
                notification.style.display = 'none';
                messageCount = 0;
            }
        });
        
        // بستن چت با کلیک خارج
        document.addEventListener('click', (e) => {
            if (isOpen && 
                !chatWindow.contains(e.target) && 
                !toggleBtn.contains(e.target)) {
                isOpen = false;
                chatWindow.classList.remove('active');
                toggleBtn.style.transform = 'scale(1)';
            }
        });
        
        // بارگذاری لوگو
        setTimeout(() => {
            const logoUrl = 'http://myappadmin.info/ei_1762331920282-removebg-preview.png';
            
            // تست لوگو
            const testImg = new Image();
            testImg.onload = function() {
                // ایجاد عنصر img برای لوگو
                const toggleIcon = toggleBtn.querySelector('i');
                toggleIcon.style.display = 'none';
                
                const img = document.createElement('img');
                img.src = logoUrl;
                img.alt = 'APM Show';
                img.style.position = 'absolute';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '50%';
                img.style.zIndex = '1';
                
                toggleBtn.insertBefore(img, toggleIcon);
                
                // اضافه کردن شفافیت به پس‌زمینه
                toggleBtn.style.setProperty('--gradient-opacity', '0.8');
            };
            
            testImg.onerror = function() {
                console.log('لوگو لود نشد، از آیکون استفاده می‌شود');
            };
            
            testImg.src = logoUrl;
        }, 1000);
        
        // تست اتصال به سرور
        testConnection();
        
        // API عمومی
        window.APMChatbot = {
            open: () => {
                isOpen = true;
                chatWindow.classList.add('active');
                chatInput.focus();
                scrollToBottom();
                notification.style.display = 'none';
                messageCount = 0;
            },
            
            close: () => {
                isOpen = false;
                chatWindow.classList.remove('active');
                toggleBtn.style.transform = 'scale(1)';
            },
            
            sendMessage: (text) => {
                if (text) {
                    chatInput.value = text;
                    sendMessage();
                }
            },
            
            setConfig: (newConfig) => {
                Object.assign(CONFIG, newConfig);
            },
            
            clearHistory: () => {
                messagesContainer.innerHTML = '';
                conversationHistory = [];
                
                // پیام خوشامدگویی جدید
                const welcomeMsg = document.createElement('div');
                welcomeMsg.className = 'apm-message-v2 bot';
                welcomeMsg.innerHTML = `
                    <strong>👋 سلام! من ربات هوشمند فروشگاه APM Show هستم</strong><br><br>
                    خوشحالم که در خدمت شما هستم. می‌توانم در زمینه‌های زیر کمک کنم:<br><br>
                    • انتخاب سایز مناسب لباس و کفش<br>
                    • پیگیری وضعیت سفارشات<br>
                    • اطلاعات درباره کیفیت محصولات<br>
                    • راهنمایی درباره زمان ارسال<br>
                    • پاسخ به سوالات متداول<br><br>
                    چطور می‌تونم کمکتون کنم؟
                `;
                
                messagesContainer.appendChild(welcomeMsg);
                addSuggestions();
                scrollToBottom();
            },
            
            getHistory: () => {
                return [...conversationHistory];
            }
        };
        
        console.log('✅ چت‌بات حرفه‌ای APM Show با موفقیت بارگذاری شد');
        console.log('🎮 کنترل با: window.APMChatbot');
        
        // نمایش نوتیفیکیشن بعد از 5 ثانیه
        setTimeout(() => {
            if (!isOpen && CONFIG.SHOW_NOTIFICATION && messageCount === 0) {
                notification.style.display = 'flex';
                notification.textContent = '!';
            }
        }, 5000);
    }
    
    // تست اتصال به سرور
    async function testConnection() {
        try {
            const response = await fetch(CONFIG.API_URL.replace('/api/chat', '/health'), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ اتصال به سرور برقرار است:', data);
            } else {
                console.warn('⚠️ سرور پاسخ داد اما وضعیت غیرمعمول:', response.status);
            }
        } catch (error) {
            console.warn('⚠️ تست اتصال به سرور ناموفق بود (ممکن است API متفاوت باشد)');
        }
    }
})();
