class ChatWidget {
    constructor(options = {}) {
        this.options = {
            backendUrl: options.backendUrl || window.location.origin,
            position: options.position || 'bottom-left',
            theme: options.theme || 'default',
            ...options
        };
        
        this.state = {
            isOpen: false,
            isConnected: false,
            operatorConnected: false,
            sessionId: null,
            socket: null,
            messages: [],
            isTyping: false,
            isConnecting: false,
            currentMenu: 'main',
            awaitingTrackingCode: false,
            lastOrderInfo: null,
            showButtons: true
        };
        
        this.menus = {
            main: {
                title: "🎯 **به پشتیبانی هوشمند شیک‌پوشان خوش آمدید!**",
                subtitle: "لطفاً یکی از گزینه‌های زیر را انتخاب کنید:",
                buttons: [
                    { id: 'track_order', text: "📦 پیگیری سفارش", icon: "📦" },
                    { id: 'faq', text: "❓ سوالات متداول", icon: "❓" },
                    { id: 'buying_guide', text: "🛍️ راهنمای خرید", icon: "🛍️" },
                    { id: 'rules', text: "📜 قوانین و مقررات", icon: "📜" },
                    { id: 'refund', text: "🔄 بازگشت و تعویض کالا", icon: "🔄" },
                    { id: 'about', text: "🏢 درباره ما", icon: "🏢" },
                    { id: 'app_download', text: "📱 دانلود اپلیکیشن", icon: "📱" },
                    { id: 'connect_human', text: "👤 اتصال به اپراتور انسانی", icon: "👤" }
                ],
                columns: 2
            },
            
            track_order: {
                title: "📦 **پیگیری سفارش**",
                subtitle: "برای پیگیری سفارش خود، کد پیگیری را وارد کنید.",
                buttons: [
                    { id: 'enter_tracking_code', text: "🎫 وارد کردن کد پیگیری", icon: "🎫" },
                    { id: 'back_to_main', text: "🔙 بازگشت به منوی اصلی", icon: "🔙" }
                ],
                columns: 2
            }
        };
        
        this.init();
    }

    generateSessionId() {
        let sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_session_id', sessionId);
        }
        return sessionId;
    }

    init() {
        this.state.sessionId = this.generateSessionId();
        this.injectStyles();
        this.injectHTML();
        this.initEvents();
        this.connectWebSocket();
        this.showMenu('main');
        console.log('Chat Widget initialized with session:', this.state.sessionId);
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* استایل‌های اصلی */
            .chat-widget {
                position: fixed;
                z-index: 999999;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            
            .chat-widget.bottom-left {
                bottom: 30px;
                left: 30px;
            }
            
            .chat-widget.bottom-right {
                bottom: 30px;
                right: 30px;
            }
            
            .chat-toggle-btn {
                width: 70px;
                height: 70px;
                border-radius: 50%;
                background: linear-gradient(145deg, #2d8cff, #1a73e8);
                border: none;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                box-shadow: 0 8px 25px rgba(45, 140, 255, 0.3);
                transition: all 0.3s ease;
            }
            
            .chat-toggle-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 12px 30px rgba(45, 140, 255, 0.4);
            }
            
            .chat-window {
                position: absolute;
                bottom: 90px;
                width: 400px;
                max-width: 90vw;
                height: 600px;
                max-height: 80vh;
                background: white;
                border-radius: 20px;
                box-shadow: 0 15px 50px rgba(0, 0, 0, 0.2);
                display: flex;
                flex-direction: column;
                opacity: 0;
                visibility: hidden;
                transform: translateY(20px);
                transition: all 0.3s ease;
            }
            
            .chat-window.active {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            .chat-header {
                padding: 20px;
                background: linear-gradient(145deg, #2d8cff, #1a73e8);
                color: white;
                border-radius: 20px 20px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .header-left {
                display: flex;
                align-items: center;
                gap: 15px;
            }
            
            .chat-logo {
                width: 50px;
                height: 50px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
            }
            
            .chat-title h3 {
                margin: 0;
                font-size: 18px;
            }
            
            .chat-title p {
                margin: 5px 0 0;
                opacity: 0.9;
                font-size: 14px;
            }
            
            .close-btn {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.3s;
            }
            
            .close-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                background: #f8f9fa;
            }
            
            /* استایل منو و دکمه‌ها */
            .menu-container {
                padding: 15px;
            }
            
            .menu-title {
                font-size: 18px;
                font-weight: bold;
                color: #333;
                margin-bottom: 10px;
                line-height: 1.4;
            }
            
            .menu-subtitle {
                font-size: 14px;
                color: #666;
                margin-bottom: 20px;
                line-height: 1.5;
            }
            
            .menu-buttons {
                display: grid;
                gap: 10px;
            }
            
            .menu-buttons.columns-2 {
                grid-template-columns: 1fr 1fr;
            }
            
            .menu-button {
                background: white;
                border: 2px solid #e9ecef;
                border-radius: 12px;
                padding: 15px;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .menu-button:hover {
                border-color: #2d8cff;
                background: #f0f7ff;
                transform: translateY(-2px);
            }
            
            .menu-button-icon {
                font-size: 24px;
            }
            
            .menu-button-text {
                font-size: 14px;
                font-weight: 500;
                color: #333;
                line-height: 1.4;
            }
            
            .input-container {
                padding: 20px;
                border-top: 1px solid #e9ecef;
                background: white;
            }
            
            .tracking-input-container {
                text-align: center;
            }
            
            .tracking-input-title {
                font-size: 16px;
                font-weight: bold;
                color: #333;
                margin-bottom: 15px;
            }
            
            .tracking-input-subtitle {
                font-size: 14px;
                color: #666;
                margin-bottom: 20px;
                line-height: 1.5;
            }
            
            .tracking-input {
                width: 100%;
                padding: 15px;
                border: 2px solid #e9ecef;
                border-radius: 12px;
                font-size: 16px;
                text-align: center;
                margin-bottom: 15px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            
            .tracking-input:focus {
                outline: none;
                border-color: #2d8cff;
            }
            
            .input-buttons {
                display: flex;
                gap: 10px;
            }
            
            .input-button {
                flex: 1;
                padding: 12px;
                border: none;
                border-radius: 10px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s;
            }
            
            .input-button.primary {
                background: #2d8cff;
                color: white;
            }
            
            .input-button.primary:hover {
                background: #1a73e8;
            }
            
            .input-button.secondary {
                background: #f8f9fa;
                color: #666;
                border: 2px solid #e9ecef;
            }
            
            .input-button.secondary:hover {
                background: #e9ecef;
            }
            
            /* استایل پیام‌ها */
            .message {
                margin-bottom: 20px;
                max-width: 80%;
                clear: both;
            }
            
            .message.user {
                float: left;
                margin-left: 0;
                margin-right: auto;
            }
            
            .message.assistant, .message.system {
                float: right;
                margin-left: auto;
                margin-right: 0;
            }
            
            .message-bubble {
                padding: 15px;
                border-radius: 18px;
                line-height: 1.5;
                font-size: 14px;
                word-wrap: break-word;
            }
            
            .message.user .message-bubble {
                background: #2d8cff;
                color: white;
                border-radius: 18px 18px 18px 4px;
            }
            
            .message.assistant .message-bubble,
            .message.system .message-bubble {
                background: white;
                color: #333;
                border: 1px solid #e9ecef;
                border-radius: 18px 18px 4px 18px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .message-time {
                font-size: 11px;
                color: #999;
                margin-top: 5px;
                text-align: right;
            }
            
            .message.user .message-time {
                text-align: left;
            }
            
            /* اعلان‌ها */
            .notification-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #e74c3c;
                color: white;
                font-size: 12px;
                font-weight: bold;
                min-width: 20px;
                height: 20px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
            }
            
            /* اپراتور */
            .operator-info {
                display: none;
                background: linear-gradient(145deg, #27ae60, #2ecc71);
                color: white;
                padding: 15px;
                margin: 10px 20px;
                border-radius: 12px;
                text-align: center;
            }
            
            .operator-info.active {
                display: block;
            }
            
            /* اسکرول بار */
            .chat-messages::-webkit-scrollbar {
                width: 6px;
            }
            
            .chat-messages::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }
            
            .chat-messages::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
            }
            
            .chat-messages::-webkit-scrollbar-thumb:hover {
                background: #a1a1a1;
            }
            
            /* رسپانسیو */
            @media (max-width: 480px) {
                .chat-window {
                    width: 95vw;
                    right: 2.5vw;
                    left: 2.5vw;
                }
                
                .menu-buttons.columns-2 {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    injectHTML() {
        this.container = document.createElement('div');
        this.container.className = `chat-widget ${this.options.position}`;
        this.container.innerHTML = `
            <button class="chat-toggle-btn">
                <i class="fas fa-comment-dots"></i>
                <span class="notification-badge" style="display: none">0</span>
            </button>
            <div class="chat-window">
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo"><i class="fas fa-robot"></i></div>
                        <div class="chat-title">
                            <h3>پشتیبانی شیک‌پوشان</h3>
                            <p>سیستم منو محور</p>
                        </div>
                    </div>
                    <div class="header-right">
                        <button class="close-btn"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="chat-messages"></div>
                <div class="operator-info">
                    <i class="fas fa-user-tie"></i>
                    <span>شما با اپراتور انسانی در ارتباط هستید</span>
                </div>
                <div class="menu-container"></div>
                <div class="input-container"></div>
            </div>
        `;
        document.body.appendChild(this.container);
        
        this.elements = {
            toggleBtn: this.container.querySelector('.chat-toggle-btn'),
            chatWindow: this.container.querySelector('.chat-window'),
            closeBtn: this.container.querySelector('.close-btn'),
            messagesContainer: this.container.querySelector('.chat-messages'),
            menuContainer: this.container.querySelector('.menu-container'),
            inputContainer: this.container.querySelector('.input-container'),
            operatorInfo: this.container.querySelector('.operator-info'),
            notificationBadge: this.container.querySelector('.notification-badge')
        };
    }

    initEvents() {
        this.elements.toggleBtn.addEventListener('click', () => this.toggleChat());
        this.elements.closeBtn.addEventListener('click', () => this.closeChat());
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && 
                !this.elements.chatWindow.contains(e.target) && 
                !this.elements.toggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
    }

    connectWebSocket() {
        try {
            const wsUrl = this.options.backendUrl.replace('http', 'ws');
            this.state.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5
            });
            
            this.state.socket.on('connect', () => {
                console.log('WebSocket connected');
                this.state.isConnected = true;
                this.state.socket.emit('join-session', this.state.sessionId);
            });
            
            this.state.socket.on('operator-connected', (data) => {
                this.handleOperatorConnected(data);
            });
            
            this.state.socket.on('operator-message', (data) => {
                this.addMessage('operator', data.message);
            });
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
        }
    }

    toggleChat() {
        this.state.isOpen = !this.state.isOpen;
        this.elements.chatWindow.classList.toggle('active');
        if (this.state.isOpen) {
            this.resetNotification();
        }
    }

    closeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
    }

    showMenu(menuId) {
        this.state.currentMenu = menuId;
        const menu = this.menus[menuId];
        
        if (!menu) {
            this.showMainMenu();
            return;
        }
        
        this.clearInputContainer();
        this.elements.menuContainer.innerHTML = `
            <div class="menu-title">${menu.title}</div>
            <div class="menu-subtitle">${menu.subtitle}</div>
            <div class="menu-buttons columns-${menu.columns || 2}">
                ${menu.buttons.map(button => `
                    <div class="menu-button" data-action="${button.id}">
                        <div class="menu-button-icon">${button.icon}</div>
                        <div class="menu-button-text">${button.text}</div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // اضافه کردن event listener برای دکمه‌ها
        this.elements.menuContainer.querySelectorAll('.menu-button').forEach(btn => {
            btn.addEventListener('click', () => this.handleButtonClick(btn.dataset.action));
        });
        
        this.showButtons = true;
    }

    handleButtonClick(action) {
        switch(action) {
            case 'track_order':
                this.showMenu('track_order');
                break;
                
            case 'enter_tracking_code':
                this.showTrackingInput();
                break;
                
            case 'back_to_main':
                this.showMenu('main');
                break;
                
            case 'faq':
                window.open('https://shikpooshaan.ir', '_blank');
                this.addMessage('system', 'صفحه سوالات متداول در تب جدید باز شد.');
                break;
                
            case 'buying_guide':
                window.open('https://shikpooshaan.ir/%d8%b1%d8%a7%d9%87%d9%86%d9%85%d8%a7%db%8c-%d8%ae%d8%b1%db%8c%d8%af/', '_blank');
                this.addMessage('system', 'راهنمای خرید در تب جدید باز شد.');
                break;
                
            case 'rules':
                window.open('https://shikpooshaan.ir/%d9%82%d9%88%d8%a7%d9%86%db%8c%d9%86/', '_blank');
                this.addMessage('system', 'قوانین و مقررات در تب جدید باز شد.');
                break;
                
            case 'refund':
                window.open('https://shikpooshaan.ir/refund_returns-2/', '_blank');
                this.addMessage('system', 'صفحه بازگشت و تعویض کالا در تب جدید باز شد.');
                break;
                
            case 'about':
                window.open('https://shikpooshaan.ir/about-us/', '_blank');
                this.addMessage('system', 'صفحه درباره ما در تب جدید باز شد.');
                break;
                
            case 'app_download':
                this.addMessage('assistant', '📱 **دانلود اپلیکیشن شیک‌پوشان**\n\n' +
                    'برای دانلود اپلیکیشن، به لینک زیر مراجعه کنید:\n\n' +
                    '🔗 https://shikpooshaan.ir/app-download\n\n' +
                    'ویژگی‌های اپلیکیشن:\n' +
                    '• مشاهده محصولات جدید\n' +
                    '• پیگیری آسان سفارشات\n' +
                    '• تخفیف‌های ویژه\n' +
                    '• خرید سریع و آسان');
                break;
                
            case 'connect_human':
                this.connectToHuman();
                break;
        }
    }

    showTrackingInput() {
        this.state.awaitingTrackingCode = true;
        this.showButtons = false;
        
        this.elements.menuContainer.innerHTML = '';
        this.elements.inputContainer.innerHTML = `
            <div class="tracking-input-container">
                <div class="tracking-input-title">🎫 وارد کردن کد پیگیری</div>
                <div class="tracking-input-subtitle">
                    لطفاً کد پیگیری خود را وارد کنید.<br>
                    کد پیگیری یک عدد ۴ تا ۲۰ رقمی است.
                </div>
                <input type="text" class="tracking-input" placeholder="مثال: 123456789" maxlength="20">
                <div class="input-buttons">
                    <button class="input-button secondary back-btn">🔙 بازگشت</button>
                    <button class="input-button primary submit-btn">✅ تایید و ارسال</button>
                </div>
            </div>
        `;
        
        const input = this.elements.inputContainer.querySelector('.tracking-input');
        const submitBtn = this.elements.inputContainer.querySelector('.submit-btn');
        const backBtn = this.elements.inputContainer.querySelector('.back-btn');
        
        input.focus();
        
        submitBtn.addEventListener('click', () => this.submitTrackingCode(input.value));
        backBtn.addEventListener('click', () => this.showMenu('track_order'));
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitTrackingCode(input.value);
            }
        });
    }

    async submitTrackingCode(code) {
        const cleanCode = code.trim();
        
        if (!cleanCode || cleanCode.length < 4) {
            this.addMessage('system', '❌ لطفاً یک کد معتبر وارد کنید (حداقل ۴ رقم)');
            return;
        }
        
        if (!/^\d+$/.test(cleanCode)) {
            this.addMessage('system', '❌ کد پیگیری باید فقط عدد باشد!');
            return;
        }
        
        this.state.awaitingTrackingCode = false;
        this.addMessage('user', `کد پیگیری: ${cleanCode}`);
        
        try {
            const response = await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: cleanCode, 
                    sessionId: this.state.sessionId 
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage('assistant', data.message);
                
                if (data.orderFound) {
                    this.addMessage('assistant', '\n\n🎯 **پیگیری شما کامل شد!**\n\n' +
                        'اگر سوال دیگری دارید، می‌توانید با زدن دکمه «اتصال به اپراتور انسانی» با اپراتور در تماس باشید.');
                }
                
                // برگشت به منوی اصلی بعد از 2 ثانیه
                setTimeout(() => {
                    this.showMenu('main');
                    this.clearInputContainer();
                }, 2000);
            }
        } catch (error) {
            this.addMessage('system', '❌ خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.');
            this.showMenu('track_order');
        }
    }

    async connectToHuman() {
        if (this.state.operatorConnected || this.state.isConnecting) return;
        
        this.state.isConnecting = true;
        this.addMessage('user', 'درخواست اتصال به اپراتور انسانی');
        
        try {
            const userInfo = { 
                name: 'کاربر سایت', 
                page: window.location.href,
                ip: 'user-ip' 
            };
            
            const response = await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sessionId: this.state.sessionId, 
                    userInfo 
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.state.operatorConnected = true;
                this.elements.operatorInfo.classList.add('active');
                
                this.addMessage('assistant', `✅ **درخواست شما ثبت شد!**\n\n` +
                    `کارشناسان ما به زودی با شما ارتباط برقرار می‌کنند.\n\n` +
                    `⏳ **لطفاً منتظر بمانید...**\n` +
                    `کد جلسه شما: **${data.sessionCode || this.state.sessionId.substring(0, 12)}**`);
                
                // مخفی کردن منوها
                this.showButtons = false;
                this.elements.menuContainer.innerHTML = '';
                this.clearInputContainer();
                
                this.addMessage('assistant', '\n\nاگر نیاز به بازگشت دارید، صفحه را رفرش کنید.');
            }
        } catch (error) {
            this.addMessage('system', '❌ خطا در ارسال درخواست. لطفاً دوباره تلاش کنید.');
        } finally {
            this.state.isConnecting = false;
        }
    }

    handleOperatorConnected(data) {
        this.state.operatorConnected = true;
        this.elements.operatorInfo.classList.add('active');
        this.addMessage('assistant', data.message || '🎉 اپراتور متصل شد!');
    }

    addMessage(type, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const time = new Date().toLocaleTimeString('fa-IR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageDiv.innerHTML = `
            <div class="message-bubble">${this.formatMessage(text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        this.elements.messagesContainer.appendChild(messageDiv);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        
        if (type === 'assistant' || type === 'operator' || type === 'system') {
            if (!this.state.isOpen) {
                this.showNotification();
            }
        }
    }

    formatMessage(text) {
        // تبدیل لینک‌ها به تگ <a>
        let formatted = text.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" style="color: #2d8cff; text-decoration: none;">$1</a>'
        );
        
        // تبدیل **متن** به <strong>
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // حفظ خطوط جدید
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    clearInputContainer() {
        this.elements.inputContainer.innerHTML = '';
    }

    showMainMenu() {
        this.showMenu('main');
    }

    showNotification() {
        let current = parseInt(this.elements.notificationBadge.textContent) || 0;
        current++;
        this.elements.notificationBadge.textContent = current;
        this.elements.notificationBadge.style.display = 'flex';
    }

    resetNotification() {
        this.elements.notificationBadge.textContent = '0';
        this.elements.notificationBadge.style.display = 'none';
    }
}

// راه‌اندازی خودکار
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ChatWidget = new ChatWidget();
    });
} else {
    window.ChatWidget = new ChatWidget();
}

window.initChatWidget = (options) => new ChatWidget(options);
