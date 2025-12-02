// ویجت چت هوشمند APM Show
(function() {
    if (window.ChatWidgetLoaded) return;
    window.ChatWidgetLoaded = true;
    
    // بارگذاری فونت ایران یکان
    const fontLink = document.createElement('link');
    fontLink.href = 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
    
    // استایل‌ها
    const style = document.createElement('style');
    style.textContent = `
        .apm-chatbot-container {
            position: fixed;
            bottom: 25px;
            left: 25px;
            z-index: 1000000;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-chat-toggle {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 30px rgba(102, 126, 234, 0.5);
            transition: all 0.3s ease;
            animation: apm-pulse 2s infinite;
            position: relative;
            overflow: hidden;
            padding: 0;
        }
        
        .apm-chat-toggle:hover {
            transform: scale(1.15);
            box-shadow: 0 12px 40px rgba(102, 126, 234, 0.7);
        }
        
        .apm-chat-toggle img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
        }
        
        .apm-chat-toggle::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
            border-radius: 50%;
        }
        
        .apm-chat-toggle i {
            position: relative;
            z-index: 2;
            color: white;
            font-size: 28px;
        }
        
        @keyframes apm-pulse {
            0% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
            70% { box-shadow: 0 0 0 20px rgba(102, 126, 234, 0); }
            100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0); }
        }
        
        .apm-chat-window {
            position: absolute;
            bottom: 85px;
            left: 0;
            width: 400px;
            max-width: 90vw;
            height: 600px;
            max-height: 80vh;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-chat-window.active {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: all;
        }
        
        .apm-chat-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        
        .apm-chat-header h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-close-chat {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-close-chat:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        .apm-chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 15px;
            background: #f8fafc;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-message {
            max-width: 85%;
            padding: 15px;
            border-radius: 18px;
            line-height: 1.6;
            animation: apm-message-appear 0.3s ease;
            font-size: 14px;
            word-wrap: break-word;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        @keyframes apm-message-appear {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .apm-message.user {
            align-self: flex-end;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-bottom-right-radius: 5px;
        }
        
        .apm-message.bot {
            align-self: flex-start;
            background: white;
            color: #333;
            border-bottom-left-radius: 5px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            border-right: 4px solid #667eea;
        }
        
        .apm-chat-input-area {
            padding: 20px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            gap: 12px;
            background: white;
            flex-shrink: 0;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-chat-input {
            flex: 1;
            padding: 14px 20px;
            border: 2px solid #e5e7eb;
            border-radius: 25px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.3s;
            direction: rtl;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
            background: #f9fafb;
        }
        
        .apm-chat-input:focus {
            border-color: #667eea;
            background: white;
        }
        
        .apm-send-btn {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.3s;
            flex-shrink: 0;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-send-btn:hover {
            transform: scale(1.05);
        }
        
        .apm-send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .apm-typing-indicator {
            display: flex;
            gap: 8px;
            padding: 12px 20px;
            background: white;
            border-radius: 18px;
            width: fit-content;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            align-self: flex-start;
        }
        
        .apm-typing-indicator span {
            width: 10px;
            height: 10px;
            background: #9ca3af;
            border-radius: 50%;
            animation: apm-typing 1.4s infinite;
        }
        
        @keyframes apm-typing {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
            30% { transform: translateY(-8px); opacity: 1; }
        }
        
        .apm-confidence-badge {
            font-size: 11px;
            color: #6b7280;
            margin-top: 5px;
            display: flex;
            align-items: center;
            gap: 5px;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-confidence-bar {
            flex: 1;
            height: 4px;
            background: #e5e7eb;
            border-radius: 2px;
            overflow: hidden;
        }
        
        .apm-confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981, #3b82f6);
            border-radius: 2px;
            transition: width 0.3s;
        }
        
        @media (max-width: 768px) {
            .apm-chat-window {
                width: 360px;
                left: -140px;
            }
            
            .apm-chatbot-container {
                bottom: 20px;
                left: 20px;
            }
            
            .apm-chat-toggle {
                width: 60px;
                height: 60px;
            }
            
            .apm-chat-toggle i {
                font-size: 24px;
            }
        }
        
        @media (max-width: 480px) {
            .apm-chat-window {
                width: 320px;
                left: -110px;
                height: 500px;
            }
            
            .apm-chatbot-container {
                bottom: 15px;
                left: 15px;
            }
            
            .apm-chat-toggle {
                width: 55px;
                height: 55px;
            }
        }
        
        .apm-notification {
            position: absolute;
            top: -8px;
            right: -8px;
            background: #ef4444;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            animation: apm-notification-pulse 2s infinite;
        }
        
        @keyframes apm-notification-pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        .apm-suggestions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
        }
        
        .apm-suggestion-btn {
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 20px;
            padding: 8px 16px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            font-family: 'Vazirmatn', Tahoma, sans-serif !important;
        }
        
        .apm-suggestion-btn:hover {
            background: #e5e7eb;
            border-color: #9ca3af;
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
    
    // ایجاد ویجت
    const container = document.createElement('div');
    container.className = 'apm-chatbot-container';
    container.innerHTML = `
        <button class="apm-chat-toggle" id="apm-chat-toggle">
            <div class="apm-notification" id="apm-notification" style="display: none;">!</div>
            <i class="fas fa-comment-dots"></i>
        </button>
        
        <div class="apm-chat-window" id="apm-chat-window">
            <div class="apm-chat-header">
                <h3>
                    <i class="fas fa-headset"></i>
                    پشتیبانی هوشمند APM Show
                </h3>
                <button class="apm-close-chat" id="apm-close-chat">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="apm-chat-messages" id="apm-chat-messages">
                <div class="apm-message bot">
                    <strong>سلام! 👋 به پشتیبانی هوشمند APM Show خوش آمدید.</strong><br>
                    من می‌توانم در مورد سایز، ارسال، کیفیت محصولات و دیگر سوالات کمکتان کنم.
                    <div class="apm-suggestions" id="apm-suggestions">
                        <button class="apm-suggestion-btn" data-question="چطور سایز مناسب را انتخاب کنم؟">انتخاب سایز</button>
                        <button class="apm-suggestion-btn" data-question="چطور سفارشم را پیگیری کنم؟">پیگیری سفارش</button>
                        <button class="apm-suggestion-btn" data-question="زمان ارسال چقدر است؟">زمان ارسال</button>
                        <button class="apm-suggestion-btn" data-question="آیا بازگشت وجه امکان دارد؟">بازگشت وجه</button>
                    </div>
                </div>
            </div>
            
            <div class="apm-chat-input-area">
                <input type="text" 
                       class="apm-chat-input" 
                       id="apm-chat-input" 
                       placeholder="سوال خود را اینجا بنویسید..."
                       dir="rtl">
                
                <button class="apm-send-btn" id="apm-send-btn">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(container);
    
    // دریافت المان‌ها
    const toggleBtn = document.getElementById('apm-chat-toggle');
    const chatWindow = document.getElementById('apm-chat-window');
    const closeBtn = document.getElementById('apm-close-chat');
    const sendBtn = document.getElementById('apm-send-btn');
    const chatInput = document.getElementById('apm-chat-input');
    const messagesContainer = document.getElementById('apm-chat-messages');
    const suggestionsContainer = document.getElementById('apm-suggestions');
    const notification = document.getElementById('apm-notification');
    
    let isOpen = false;
    let messageCount = 0;
    
    // پیشنهادهای سریع
    const suggestions = [
        "چطور سایز مناسب را انتخاب کنم؟",
        "زمان ارسال چقدر است؟",
        "آیا بازگشت وجه امکان دارد؟",
        "کیفیت محصولات شما چگونه است؟",
        "چطور سفارشم را پیگیری کنم؟",
        "آیا امکان تعویض سایز وجود دارد؟",
        "محصولات ساخت کجا هستند؟",
        "قیمت‌ها چگونه تعیین می‌شوند؟"
    ];
    
    // ارسال پیام به سرور
    async function sendToServer(message) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: message })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error sending message:', error);
            return {
                reply: "متأسفانه در ارتباط با سرور مشکلی پیش آمد. لطفاً دوباره تلاش کنید.",
                confidence: 0,
                source: "error"
            };
        }
    }
    
    // نمایش نشانگر تایپ
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'apm-typing-indicator';
        typingDiv.id = 'apm-typing-indicator';
        
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
        const typingIndicator = document.getElementById('apm-typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
    
    // اضافه کردن پیام
    function addMessage(sender, text, confidence = 1.0) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `apm-message ${sender}`;
        
        let messageHTML = text;
        
        // اگر پیام از اپراتور انسانی درخواست کند
        if (text.includes('@apmshow_')) {
            messageHTML = text.replace('@apmshow_', '<a href="https://instagram.com/apmshow_" target="_blank" style="color: #667eea; font-weight: bold;">@apmshow_</a>');
        }
        
        // اگر فرستنده ربات است و confidence کمتر از 1 است
        if (sender === 'bot' && confidence < 0.8) {
            messageHTML += `
                <div class="apm-confidence-badge">
                    <span>دقت پاسخ: ${Math.round(confidence * 100)}%</span>
                    <div class="apm-confidence-bar">
                        <div class="apm-confidence-fill" style="width: ${confidence * 100}%"></div>
                    </div>
                </div>
            `;
        }
        
        messageDiv.innerHTML = messageHTML;
        messagesContainer.appendChild(messageDiv);
        
        // اضافه کردن پیشنهادهای جدید
        if (sender === 'bot' && confidence > 0.5) {
            addSuggestions();
        }
        
        scrollToBottom();
        messageCount++;
        
        // نمایش نوتیفیکیشن اگر چت بسته است
        if (!isOpen && sender === 'bot') {
            notification.style.display = 'flex';
            notification.textContent = messageCount;
        }
    }
    
    // اضافه کردن پیشنهادها
    function addSuggestions() {
        // حذف پیشنهادهای قبلی
        const oldSuggestions = suggestionsContainer.querySelectorAll('.apm-suggestion-btn');
        oldSuggestions.forEach(btn => btn.remove());
        
        // انتخاب 4 پیشنهاد تصادفی
        const shuffled = [...suggestions].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 4);
        
        selected.forEach(question => {
            const btn = document.createElement('button');
            btn.className = 'apm-suggestion-btn';
            btn.textContent = question;
            btn.dataset.question = question;
            btn.addEventListener('click', () => {
                chatInput.value = question;
                sendMessage();
            });
            suggestionsContainer.appendChild(btn);
        });
    }
    
    // اسکرول به پایین
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
            
            // تاخیر برای طبیعی‌تر شدن
            setTimeout(() => {
                hideTypingIndicator();
                addMessage('bot', response.reply, response.confidence);
                
                // فعال کردن دکمه ارسال
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }, 800 + Math.random() * 400);
            
        } catch (error) {
            console.error('Error:', error);
            hideTypingIndicator();
            
            setTimeout(() => {
                addMessage('bot', 'خطایی در پردازش سوال شما رخ داد. لطفاً دوباره تلاش کنید.', 0);
                
                // فعال کردن دکمه ارسال
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }, 300);
        }
    }
    
    // رویدادها
    toggleBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        
        if (isOpen) {
            chatWindow.classList.add('active');
            chatInput.focus();
            scrollToBottom();
            
            // پنهان کردن نوتیفیکیشن
            notification.style.display = 'none';
            messageCount = 0;
        } else {
            chatWindow.classList.remove('active');
        }
    });
    
    closeBtn.addEventListener('click', () => {
        isOpen = false;
        chatWindow.classList.remove('active');
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
        }
    });
    
    // بارگذاری لوگو
    setTimeout(() => {
        const logoUrl = 'http://myappadmin.info/ei_1762331920282-removebg-preview.png';
        
        // ایجاد image برای تست
        const testImg = new Image();
        testImg.onload = function() {
            // اگر لوگو لود شد، جایگزین کن
            const toggleIcon = toggleBtn.querySelector('i');
            toggleIcon.style.display = 'none';
            
            const img = document.createElement('img');
            img.src = logoUrl;
            img.alt = 'APM Show Chat';
            img.style.position = 'absolute';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '50%';
            
            toggleBtn.insertBefore(img, toggleIcon);
        };
        
        testImg.onerror = function() {
            console.log('لوگو لود نشد، از آیکون استفاده می‌شود');
        };
        
        testImg.src = logoUrl;
    }, 1000);
    
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
        },
        
        sendMessage: (text) => {
            if (text) {
                chatInput.value = text;
                sendMessage();
            }
        },
        
        setTheme: (theme) => {
            const isDark = theme === 'dark';
            chatWindow.style.backgroundColor = isDark ? '#1f2937' : 'white';
            chatWindow.style.color = isDark ? 'white' : '#333';
        },
        
        clearHistory: () => {
            messagesContainer.innerHTML = '';
            addMessage('bot', 'سلام! 👋 به پشتیبانی هوشمند APM Show خوش آمدید. چگونه می‌توانم کمکتان کنم?');
            addSuggestions();
        },
        
        addSuggestion: (question) => {
            if (!suggestions.includes(question)) {
                suggestions.push(question);
                addSuggestions();
            }
        }
    };
    
    console.log('🤖 چت‌بات هوشمند APM Show با موفقیت بارگذاری شد');
    console.log('کنترل با: window.APMChatbot');
    
    // نمایش پیام خوشامدگویی بعد از 3 ثانیه
    setTimeout(() => {
        if (!isOpen && messageCount === 0) {
            notification.style.display = 'flex';
            notification.textContent = '1';
            messageCount = 1;
        }
    }, 3000);
})();
