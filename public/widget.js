class ChatWidget {
    constructor(options = {}) {
        this.options = {
            backendUrl: options.backendUrl || window.location.origin,
            position: options.position || 'bottom-left',
            theme: options.theme || 'light',
            companyName: options.companyName || 'شیک‌پوشان',
            autoOpen: options.autoOpen || false,
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
            isRecording: false,
            mediaRecorder: null,
            audioChunks: [],
            recordingTime: 0,
            recordingTimer: null,
            currentUploads: [],
            unreadCount: 0,
            lastMessageTime: null,
            fileQueue: []
        };
        
        this.tabNotificationInterval = null;
        this.originalTitle = document.title;
        this.typingTimeout = null;
        
        this.init();
    }

    init() {
        this.state.sessionId = this.generateSessionId();
        this.checkPreviousConnection();
        this.injectStyles();
        this.injectHTML();
        this.initEvents();
        this.connectWebSocket();
        this.setupNotification();
        
        if (this.options.autoOpen) {
            setTimeout(() => this.openChat(), 1000);
        }
        
        console.log('✨ ویجت چت با موفقیت راه‌اندازی شد. Session ID:', this.state.sessionId);
    }

    generateSessionId() {
        let sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_session_id', sessionId);
        }
        return sessionId;
    }

    checkPreviousConnection() {
        const connected = localStorage.getItem('operator_connected');
        const requestTime = localStorage.getItem('operator_request_time');
        
        if (connected === 'true') {
            this.state.operatorConnected = true;
        }
        
        if (requestTime) {
            const timeDiff = Date.now() - parseInt(requestTime);
            if (timeDiff > 30000) { // بیشتر از 30 ثانیه گذشته
                localStorage.removeItem('operator_request_time');
            }
        }
    }

    injectStyles() {
        if (!document.querySelector('link[href*="widget.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${this.options.backendUrl}/widget.css`;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        }
    }

    injectHTML() {
        this.container = document.createElement('div');
        this.container.className = 'chat-widget';
        this.container.innerHTML = `
            <!-- دکمه شناور اینستاگرامی -->
            <button class="chat-toggle-btn" aria-label="باز کردن چت">
                <i class="fas fa-paper-plane"></i>
                <span class="notification-badge" style="display: none">0</span>
            </button>
            
            <!-- پنجره چت -->
            <div class="chat-window">
                <!-- هدر -->
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo"></div>
                        <div class="chat-title">
                            <h3>${this.options.companyName}</h3>
                            <p>پشتیبانی آنلاین</p>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="chat-status">
                            <span class="status-dot"></span>
                            <span>آنلاین</span>
                        </div>
                        <button class="close-btn" aria-label="بستن پنجره چت">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- پیام‌ها -->
                <div class="chat-messages"></div>
                
                <!-- وضعیت اتصال -->
                <div class="connection-status">
                    <div class="status-message">
                        <i class="fas fa-wifi"></i>
                        <span>در حال اتصال...</span>
                    </div>
                </div>
                
                <!-- نشانگر تایپ -->
                <div class="typing-indicator">
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <span>در حال تایپ...</span>
                </div>
                
                <!-- اطلاعات اپراتور -->
                <div class="operator-info">
                    <div class="operator-card">
                        <div class="operator-avatar">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div class="operator-details">
                            <h4><i class="fas fa-shield-alt"></i> اپراتور انسانی</h4>
                            <p>در حال حاضر با پشتیبان انسانی در ارتباط هستید</p>
                        </div>
                    </div>
                </div>
                
                <!-- ابزارهای ارسال (فایل و ویس) -->
                <div class="chat-tools">
                    <button class="tool-btn file-btn" aria-label="ارسال فایل" title="ارسال فایل">
                        <i class="fas fa-image"></i>
                        <span>عکس/ویدیو</span>
                    </button>
                    <button class="tool-btn voice-btn" aria-label="ضبط صدا" title="ضبط صدا">
                        <i class="fas fa-microphone"></i>
                        <span>ویس</span>
                    </button>
                    <input type="file" class="file-input" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" multiple>
                </div>
                
                <!-- نوار پیشرفت آپلود -->
                <div class="upload-progress">
                    <div class="progress-bar"></div>
                </div>
                
                <!-- پیش‌نمایش فایل -->
                <div class="file-preview">
                    <div class="preview-content">
                        <div class="file-icon"><i class="fas fa-file"></i></div>
                        <div class="file-info">
                            <div class="file-name">در حال آپلود...</div>
                            <div class="file-size">0 KB</div>
                        </div>
                        <button class="cancel-upload" aria-label="لغو آپلود">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- پیش‌نمایش ویس -->
                <div class="voice-preview">
                    <div class="voice-content">
                        <div class="voice-wave">
                            <span class="wave-bar"></span>
                            <span class="wave-bar"></span>
                            <span class="wave-bar"></span>
                            <span class="wave-bar"></span>
                            <span class="wave-bar"></span>
                            <span class="wave-bar"></span>
                            <span class="wave-bar"></span>
                            <span class="wave-bar"></span>
                        </div>
                        <div class="voice-duration">0:00</div>
                    </div>
                </div>
                
                <!-- ناحیه ورودی -->
                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <textarea class="message-input" 
                                  placeholder="پیام خود را بنویسید..." 
                                  rows="1"
                                  aria-label="پیام"
                                  maxlength="2000"></textarea>
                        <button class="send-btn" aria-label="ارسال پیام">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <button class="human-support-btn">
                        <i class="fas fa-user-headset"></i>
                        <span>درخواست پشتیبان انسانی</span>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        
        // جمع‌آوری المان‌های مورد نیاز
        this.elements = {
            toggleBtn: this.container.querySelector('.chat-toggle-btn'),
            chatWindow: this.container.querySelector('.chat-window'),
            closeBtn: this.container.querySelector('.close-btn'),
            messagesContainer: this.container.querySelector('.chat-messages'),
            messageInput: this.container.querySelector('.message-input'),
            sendBtn: this.container.querySelector('.send-btn'),
            humanSupportBtn: this.container.querySelector('.human-support-btn'),
            typingIndicator: this.container.querySelector('.typing-indicator'),
            connectionStatus: this.container.querySelector('.connection-status'),
            operatorInfo: this.container.querySelector('.operator-info'),
            notificationBadge: this.container.querySelector('.notification-badge'),
            chatStatus: this.container.querySelector('.chat-status'),
            chatTools: this.container.querySelector('.chat-tools'),
            fileBtn: this.container.querySelector('.file-btn'),
            voiceBtn: this.container.querySelector('.voice-btn'),
            fileInput: this.container.querySelector('.file-input'),
            uploadProgress: this.container.querySelector('.upload-progress'),
            progressBar: this.container.querySelector('.progress-bar'),
            filePreview: this.container.querySelector('.file-preview'),
            voicePreview: this.container.querySelector('.voice-preview'),
            cancelUpload: this.container.querySelector('.cancel-upload')
        };
        
        // اضافه کردن پیام خوش‌آمد
        setTimeout(() => {
            this.addMessage('assistant', 
                `👋 سلام! به پشتیبانی آنلاین ${this.options.companyName} خوش آمدید! 😊\n\n` +
                `من دستیار هوشمند شما هستم و می‌تونم در موارد زیر کمکتون کنم:\n\n` +
                `🔍 **جستجوی محصولات و بررسی موجودی**\n` +
                `📦 **پیگیری سفارشات با کد رهگیری**\n` +
                `💰 **اطلاعات قیمت و تخفیف‌ها**\n` +
                `🎯 **پیشنهاد محصولات ویژه**\n\n` +
                `برای شروع، کد پیگیری سفارش خود را وارد کنید یا محصول مورد نظرتان را جستجو کنید.`
            );
        }, 500);
    }

    initEvents() {
        // رویداد دکمه باز کردن/بستن
        this.elements.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleChat();
        });
        
        this.elements.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeChat();
        });
        
        // رویدادهای ارسال پیام
        this.elements.sendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.sendMessage();
        });
        
        this.elements.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.elements.messageInput.addEventListener('input', () => {
            this.resizeTextarea();
            this.handleTyping();
        });
        
        // رویداد دکمه اتصال به اپراتور
        this.elements.humanSupportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.connectToHuman();
        });
        
        // رویدادهای فایل
        this.elements.fileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.triggerFileInput();
        });
        
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e);
        });
        
        this.elements.cancelUpload.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cancelFileUpload();
        });
        
        // رویدادهای ضبط صدا
        this.elements.voiceBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startRecording();
        });
        
        this.elements.voiceBtn.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            this.stopRecording();
        });
        
        this.elements.voiceBtn.addEventListener('mouseleave', () => {
            this.stopRecording();
        });
        
        // رویدادهای لمسی برای موبایل
        this.elements.voiceBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        
        this.elements.voiceBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });
        
        // بستن چت با کلیک خارج
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && 
                !this.elements.chatWindow.contains(e.target) && 
                !this.elements.toggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
        
        // بستن با کلید ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.state.isOpen) {
                this.closeChat();
            }
        });
        
        // نمایش نوتیفیکیشن وقتی تب فعال نیست
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state.unreadCount > 0) {
                this.startTabNotification();
            } else {
                this.stopTabNotification();
            }
        });
    }

    connectWebSocket() {
        try {
            const wsUrl = this.options.backendUrl.replace(/^http/, 'ws');
            this.state.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                timeout: 20000
            });
            
            // رویدادهای سوکت
            this.state.socket.on('connect', () => {
                console.log('✅ سوکت متصل شد');
                this.state.isConnected = true;
                this.updateConnectionStatus(true);
                
                // عضویت در سشن
                this.state.socket.emit('join-session', this.state.sessionId);
                
                // اگر قبلاً به اپراتور متصل بودیم، وضعیت رو چک کنیم
                if (this.state.operatorConnected) {
                    this.state.socket.emit('reconnect-operator', {
                        sessionId: this.state.sessionId
                    });
                }
            });
            
            this.state.socket.on('operator-connected', (data) => {
                console.log('✅ اپراتور متصل شد');
                this.handleOperatorConnected(data);
            });
            
            this.state.socket.on('operator-message', (data) => {
                console.log('📩 پیام از اپراتور:', data);
                this.addMessage('operator', data.message, data.timestamp);
            });
            
            this.state.socket.on('ai-message', (data) => {
                console.log('🤖 پیام از AI:', data);
                this.addMessage('assistant', data.message);
                this.setTyping(false);
            });
            
            this.state.socket.on('file-sent', (data) => {
                this.showNotification('✅ فایل با موفقیت ارسال شد');
                this.hideUploadProgress();
            });
            
            this.state.socket.on('file-error', (data) => {
                this.showNotification(`❌ خطا در ارسال فایل: ${data.error || 'خطای ناشناخته'}`);
                this.hideUploadProgress();
            });
            
            this.state.socket.on('voice-sent', (data) => {
                this.showNotification('✅ پیام صوتی ارسال شد');
            });
            
            this.state.socket.on('voice-error', (data) => {
                this.showNotification(`❌ خطا در ارسال پیام صوتی: ${data.error || 'خطای ناشناخته'}`);
            });
            
            this.state.socket.on('disconnect', () => {
                console.log('❌ سوکت قطع شد');
                this.state.isConnected = false;
                this.updateConnectionStatus(false);
            });
            
            this.state.socket.on('connect_error', (error) => {
                console.error('❌ خطای اتصال سوکت:', error);
                this.state.isConnected = false;
                this.updateConnectionStatus(false);
            });
            
        } catch (error) {
            console.error('❌ خطا در اتصال سوکت:', error);
            this.state.isConnected = false;
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.classList.remove('active');
            this.elements.chatStatus.innerHTML = `
                <span class="status-dot"></span>
                <span>آنلاین</span>
            `;
        } else {
            this.elements.connectionStatus.classList.add('active');
        }
    }

    toggleChat() {
        this.state.isOpen = !this.state.isOpen;
        this.elements.chatWindow.classList.toggle('active');
        
        if (this.state.isOpen) {
            this.openChat();
        } else {
            this.closeChat();
        }
    }

    openChat() {
        this.state.isOpen = true;
        this.elements.chatWindow.classList.add('active');
        this.elements.messageInput.focus();
        
        // بازنشانی شمارنده خوانده‌نشده‌ها
        this.state.unreadCount = 0;
        this.resetNotification();
        
        // به روزرسانی دکمه‌های ابزار
        this.updateToolButtons();
        
        // پخش صدای باز شدن
        this.playSound('open');
        
        // ارسال رویداد بازدید
        this.trackEvent('chat_opened');
    }

    closeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
        
        // پخش صدای بسته شدن
        this.playSound('close');
    }

    resizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    handleTyping() {
        clearTimeout(this.typingTimeout);
        
        if (this.elements.messageInput.value.trim() && !this.state.isTyping) {
            // ارسال وضعیت تایپ به سرور
            if (this.state.socket && this.state.operatorConnected) {
                this.state.socket.emit('typing', {
                    sessionId: this.state.sessionId,
                    isTyping: true
                });
            }
        }
        
        this.typingTimeout = setTimeout(() => {
            if (this.state.socket && this.state.operatorConnected) {
                this.state.socket.emit('typing', {
                    sessionId: this.state.sessionId,
                    isTyping: false
                });
            }
        }, 1000);
    }

    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        
        if (!message) {
            this.elements.messageInput.focus();
            return;
        }
        
        if (this.state.isTyping) {
            return;
        }
        
        // اضافه کردن پیام کاربر
        this.addMessage('user', message);
        
        // پاک کردن فیلد ورودی
        this.elements.messageInput.value = '';
        this.resizeTextarea();
        
        // نمایش نشانگر تایپ
        this.setTyping(true);
        
        try {
            if (this.state.operatorConnected) {
                // ارسال به اپراتور انسانی
                this.state.socket.emit('user-message', {
                    sessionId: this.state.sessionId,
                    message: message,
                    timestamp: new Date().toISOString()
                });
                
                console.log('📤 پیام به اپراتور ارسال شد:', message);
                
            } else {
                // ارسال به هوش مصنوعی
                await this.sendToAI(message);
            }
            
            // ذخیره پیام در تاریخچه محلی
            this.saveMessageToHistory('user', message);
            
        } catch (error) {
            console.error('❌ خطا در ارسال پیام:', error);
            this.addMessage('system', '⚠️ خطا در ارسال پیام. لطفاً دوباره تلاش کنید.');
            this.setTyping(false);
        }
    }

    async sendToAI(message) {
        try {
            const response = await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: this.state.sessionId,
                    userInfo: {
                        name: 'کاربر سایت',
                        page: window.location.href,
                        browser: navigator.userAgent
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage('assistant', data.message);
                
                // اگر سیستم پیشنهاد اتصال به اپراتور داد
                if (data.suggestHuman) {
                    this.showHumanSupportSuggestion();
                }
                
                // اگر وضعیت اتصال به اپراتور برگردانده شد
                if (data.connectedToHuman !== undefined) {
                    this.state.operatorConnected = data.connectedToHuman;
                    this.updateToolButtons();
                }
                
            } else {
                throw new Error(data.message || 'خطا در دریافت پاسخ');
            }
            
        } catch (error) {
            console.error('❌ خطا در ارتباط با سرور:', error);
            
            let errorMessage = '⚠️ خطا در ارتباط با سرور';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = '🌐 خطا در اتصال اینترنت. لطفاً اتصال خود را بررسی کنید.';
            }
            
            this.addMessage('system', errorMessage);
            
        } finally {
            this.setTyping(false);
        }
    }

    async connectToHuman() {
        // چک کردن اتصال فعلی
        if (this.state.operatorConnected) {
            this.addMessage('system', '✅ شما در حال حاضر به اپراتور انسانی متصل هستید.');
            return;
        }
        
        if (this.state.isConnecting) {
            return;
        }
        
        this.state.isConnecting = true;
        
        // ذخیره متن اصلی دکمه
        const originalHTML = this.elements.humanSupportBtn.innerHTML;
        const originalBackground = this.elements.humanSupportBtn.style.background;
        const originalBorderColor = this.elements.humanSupportBtn.style.borderColor;
        
        // تغییر ظاهر دکمه به حالت لودینگ
        this.elements.humanSupportBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>در حال اتصال...</span>
        `;
        this.elements.humanSupportBtn.disabled = true;
        this.elements.humanSupportBtn.style.background = 'linear-gradient(135deg, #ff9500, #ff7b00)';
        this.elements.humanSupportBtn.style.borderColor = '#ff9500';
        
        try {
            // آماده کردن اطلاعات کاربر
            const userInfo = {
                name: this.getUserName(),
                page: window.location.href,
                browser: navigator.userAgent,
                referrer: document.referrer || 'مستقیم',
                device: this.getDeviceType(),
                location: await this.getUserLocation()
            };
            
            console.log('📡 درخواست اتصال به اپراتور:', userInfo);
            
            // ارسال درخواست به API
            const response = await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.state.sessionId,
                    userInfo: userInfo
                })
            });
            
            if (!response.ok) {
                throw new Error(`خطای HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ درخواست اتصال ثبت شد:', data);
                
                // ذخیره زمان درخواست
                localStorage.setItem('operator_request_time', Date.now().toString());
                localStorage.setItem('operator_session_code', data.sessionCode || '');
                
                // نمایش پیام به کاربر
                this.addMessage('system', 
                    '⏳ **درخواست شما ثبت شد!**\n\n' +
                    `کد جلسه: **${data.sessionCode || 'در حال انتساب'}**\n\n` +
                    'کارشناسان ما در تلگرام مطلع شدند و به زودی با شما ارتباط برقرار می‌کنند.\n' +
                    'لطفاً منتظر بمانید...'
                );
                
                // تغییر دکمه به حالت انتظار
                this.elements.humanSupportBtn.innerHTML = `
                    <i class="fas fa-clock"></i>
                    <span>در انتظار پذیرش</span>
                `;
                this.elements.humanSupportBtn.style.background = 'linear-gradient(135deg, #ff9500, #e67e22)';
                
                // ارسال رویداد سوکت
                if (this.state.socket) {
                    this.state.socket.emit('human-support-request', {
                        sessionId: this.state.sessionId,
                        userInfo: userInfo,
                        requestTime: new Date().toISOString()
                    });
                }
                
                // تایمر انتظار (30 ثانیه)
                setTimeout(() => {
                    if (!this.state.operatorConnected) {
                        this.addMessage('system', 
                            '⏰ **هنوز پاسخی دریافت نشد**\n\n' +
                            'متأسفانه در حال حاضر هیچ اپراتوری در دسترس نیست.\n' +
                            'لطفاً:\n' +
                            '• چند دقیقه دیگر دوباره تلاش کنید\n' +
                            '• از طریق سایر روش‌های ارتباطی با ما در تماس باشید\n' +
                            '• یا سوال خود را برای من بنویسید تا کمکتان کنم.'
                        );
                        this.resetHumanSupportButton(originalHTML, originalBackground, originalBorderColor);
                    }
                }, 30000);
                
            } else {
                throw new Error(data.message || 'خطا در ثبت درخواست');
            }
            
        } catch (error) {
            console.error('❌ خطا در اتصال به اپراتور:', error);
            
            let errorMessage = '⚠️ خطا در اتصال به سرور';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = '🌐 خطا در ارتباط اینترنت. لطفاً اتصال خود را بررسی کنید.';
            } else if (error.message.includes('خطای HTTP: 429')) {
                errorMessage = '⏳ درخواست‌های زیادی ارسال کرده‌اید. لطفاً کمی صبر کنید.';
            }
            
            this.addMessage('system', errorMessage);
            
            // بازگرداندن دکمه به حالت اولیه بعد از 3 ثانیه
            setTimeout(() => {
                this.resetHumanSupportButton(originalHTML, originalBackground, originalBorderColor);
            }, 3000);
            
        } finally {
            this.state.isConnecting = false;
        }
    }

    resetHumanSupportButton(originalHTML, originalBackground, originalBorderColor) {
        this.elements.humanSupportBtn.innerHTML = `
            <i class="fas fa-user-headset"></i>
            <span>درخواست پشتیبان انسانی</span>
        `;
        this.elements.humanSupportBtn.disabled = false;
        this.elements.humanSupportBtn.style.background = originalBackground || 'linear-gradient(135deg, #f0f8ff, #e3f2fd)';
        this.elements.humanSupportBtn.style.borderColor = originalBorderColor || '#0095f6';
    }

    handleOperatorConnected(data) {
        console.log('🎉 اپراتور متصل شد:', data);
        
        this.state.operatorConnected = true;
        
        // ذخیره در localStorage
        localStorage.setItem('operator_connected', 'true');
        localStorage.removeItem('operator_request_time');
        
        // نمایش بخش اپراتور
        this.elements.operatorInfo.classList.add('active');
        
        // فعال کردن ابزارهای ارسال
        this.updateToolButtons();
        
        // تغییر دکمه اتصال
        this.elements.humanSupportBtn.innerHTML = `
            <i class="fas fa-user-check"></i>
            <span>متصل به اپراتور</span>
        `;
        this.elements.humanSupportBtn.disabled = true;
        this.elements.humanSupportBtn.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
        this.elements.humanSupportBtn.style.borderColor = '#27ae60';
        
        // نمایش پیام خوش‌آمد اپراتور
        const welcomeMessage = data.message || 
            '🎉 **به پشتیبانی انسانی خوش آمدید!**\n\n' +
            'حالا می‌توانید:\n' +
            '📎 فایل‌های خود را ارسال کنید\n' +
            '🎤 پیام صوتی بفرستید\n' +
            '💬 با جزئیات کامل سوال خود را مطرح کنید\n\n' +
            'منتظر سوال شما هستم! 😊';
        
        this.addMessage('system', welcomeMessage);
        
        // ارسال پیام خوش‌آمد به اپراتور
        if (this.state.socket) {
            this.state.socket.emit('operator-joined', {
                sessionId: this.state.sessionId,
                message: 'کاربر به چت پیوسته است'
            });
        }
        
        // پخش صدای اتصال
        this.playSound('connect');
    }

    updateToolButtons() {
        if (this.state.operatorConnected) {
            this.elements.chatTools.classList.add('active');
        } else {
            this.elements.chatTools.classList.remove('active');
        }
    }

    triggerFileInput() {
        if (!this.state.operatorConnected) {
            this.showNotification('⚠️ برای ارسال فایل باید ابتدا به اپراتور انسانی متصل شوید.');
            return;
        }
        
        this.elements.fileInput.click();
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        // چک کردن اتصال به اپراتور
        if (!this.state.operatorConnected) {
            this.showNotification('⚠️ ابتدا به اپراتور انسانی متصل شوید.');
            this.elements.fileInput.value = '';
            return;
        }
        
        // پردازش هر فایل
        for (let file of files) {
            await this.processFileUpload(file);
        }
        
        // پاک کردن input
        this.elements.fileInput.value = '';
    }

    async processFileUpload(file) {
        // چک کردن حجم فایل (حداکثر 20MB)
        const MAX_SIZE = 20 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            this.showNotification(`❌ فایل "${file.name}" بسیار بزرگ است (حداکثر 20 مگابایت)`);
            return;
        }
        
        // چک کردن نوع فایل
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/quicktime',
            'audio/mpeg', 'audio/wav', 'audio/ogg',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        
        if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|pdf|doc|docx|txt)$/i)) {
            this.showNotification(`❌ نوع فایل "${file.name}" پشتیبانی نمی‌شود`);
            return;
        }
        
        // نمایش پیش‌نمایش
        this.showFilePreview(file);
        
        try {
            // تبدیل به Base64
            const base64 = await this.fileToBase64(file);
            
            // نمایش نوار پیشرفت
            this.showUploadProgress();
            
            // ارسال از طریق سوکت
            this.state.socket.emit('user-file', {
                sessionId: this.state.sessionId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileBase64: base64.split(',')[1] // حذف header data:image/jpeg;base64,
            });
            
            // نمایش پیام در چت
            this.addMessage('user', `📎 ارسال فایل: ${file.name} (${this.formatFileSize(file.size)})`);
            
        } catch (error) {
            console.error('❌ خطا در آپلود فایل:', error);
            this.showNotification('❌ خطا در آپلود فایل');
            this.hideUploadProgress();
            this.hideFilePreview();
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    showFilePreview(file) {
        this.elements.filePreview.querySelector('.file-name').textContent = file.name;
        this.elements.filePreview.querySelector('.file-size').textContent = this.formatFileSize(file.size);
        
        // تغییر آیکون بر اساس نوع فایل
        const icon = this.elements.filePreview.querySelector('.file-icon i');
        if (file.type.startsWith('image/')) {
            icon.className = 'fas fa-image';
        } else if (file.type.startsWith('video/')) {
            icon.className = 'fas fa-video';
        } else if (file.type.startsWith('audio/')) {
            icon.className = 'fas fa-music';
        } else if (file.type === 'application/pdf') {
            icon.className = 'fas fa-file-pdf';
        } else if (file.type.includes('word') || file.name.match(/\.(doc|docx)$/i)) {
            icon.className = 'fas fa-file-word';
        } else {
            icon.className = 'fas fa-file';
        }
        
        this.elements.filePreview.classList.add('active');
    }

    hideFilePreview() {
        this.elements.filePreview.classList.remove('active');
    }

    cancelFileUpload() {
        this.hideFilePreview();
        this.hideUploadProgress();
        this.elements.fileInput.value = '';
        
        // TODO: لغو آپلودهای در حال انجام
    }

    showUploadProgress() {
        this.elements.uploadProgress.classList.add('active');
        
        // شبیه‌سازی پیشرفت
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                setTimeout(() => {
                    this.hideUploadProgress();
                }, 1000);
            }
            this.elements.progressBar.style.width = `${progress}%`;
        }, 200);
    }

    hideUploadProgress() {
        this.elements.uploadProgress.classList.remove('active');
        setTimeout(() => {
            this.elements.progressBar.style.width = '0%';
        }, 300);
    }

    async startRecording() {
        if (!this.state.operatorConnected) {
            this.showNotification('⚠️ برای ارسال ویس باید ابتدا به اپراتور انسانی متصل شوید.');
            return;
        }
        
        if (this.state.isRecording) {
            return;
        }
        
        try {
            // درخواست دسترسی به میکروفون
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            
            this.state.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });
            
            this.state.audioChunks = [];
            this.state.recordingTime = 0;
            
            this.state.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.state.audioChunks.push(event.data);
                }
            };
            
            this.state.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.state.audioChunks, { 
                    type: 'audio/webm' 
                });
                
                // چک کردن حجم (حداکثر 5MB)
                if (audioBlob.size > 5 * 1024 * 1024) {
                    this.showNotification('❌ پیام صوتی بسیار بزرگ است (حداکثر 5 مگابایت)');
                    return;
                }
                
                // نمایش پیام در چت
                this.addMessage('user', `🎤 پیام صوتی (${this.formatTime(this.state.recordingTime)})`);
                
                try {
                    // تبدیل به Base64
                    const base64 = await this.blobToBase64(audioBlob);
                    
                    // ارسال از طریق سوکت
                    this.state.socket.emit('user-voice', {
                        sessionId: this.state.sessionId,
                        voiceBase64: base64.split(',')[1],
                        duration: this.state.recordingTime
                    });
                    
                } catch (error) {
                    console.error('❌ خطا در ارسال ویس:', error);
                    this.showNotification('❌ خطا در ارسال پیام صوتی');
                }
                
                // پاک کردن تایمر
                clearInterval(this.state.recordingTimer);
                this.state.recordingTimer = null;
                
                // قطع کردن stream
                stream.getTracks().forEach(track => track.stop());
                
                // مخفی کردن پیش‌نمایش
                this.hideVoicePreview();
            };
            
            // شروع ضبط
            this.state.mediaRecorder.start(1000); // جمع‌آوری داده هر 1 ثانیه
            
            this.state.isRecording = true;
            
            // نمایش پیش‌نمایش
            this.showVoicePreview();
            
            // شروع تایمر
            this.state.recordingTimer = setInterval(() => {
                this.state.recordingTime++;
                this.updateVoiceDuration();
            }, 1000);
            
            // پخش صدای شروع ضبط
            this.playSound('record_start');
            
        } catch (error) {
            console.error('❌ خطا در دسترسی به میکروفون:', error);
            
            let errorMessage = '❌ دسترسی به میکروفون امکان‌پذیر نیست';
            if (error.name === 'NotAllowedError') {
                errorMessage = '⚠️ لطفاً دسترسی میکروفون را در مرورگر خود فعال کنید';
            } else if (error.name === 'NotFoundError') {
                errorMessage = '❌ میکروفون یافت نشد';
            }
            
            this.showNotification(errorMessage);
        }
    }

    stopRecording() {
        if (!this.state.isRecording || !this.state.mediaRecorder) {
            return;
        }
        
        if (this.state.mediaRecorder.state === 'recording') {
            this.state.mediaRecorder.stop();
        }
        
        this.state.isRecording = false;
        
        // پخش صدای توقف ضبط
        this.playSound('record_stop');
        
        // اگر ضبط کمتر از 1 ثانیه بود، لغو کن
        if (this.state.recordingTime < 1) {
            clearInterval(this.state.recordingTimer);
            this.state.recordingTimer = null;
            this.hideVoicePreview();
            this.showNotification('ضبط لغو شد');
            return;
        }
    }

    showVoicePreview() {
        this.elements.voiceBtn.classList.add('recording');
        this.elements.voicePreview.classList.add('active');
        this.updateVoiceDuration();
    }

    hideVoicePreview() {
        this.elements.voiceBtn.classList.remove('recording');
        this.elements.voicePreview.classList.remove('active');
    }

    updateVoiceDuration() {
        const minutes = Math.floor(this.state.recordingTime / 60);
        const seconds = this.state.recordingTime % 60;
        this.elements.voicePreview.querySelector('.voice-duration').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    addMessage(type, text, timestamp = null) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        
        const time = timestamp ? new Date(timestamp) : new Date();
        const timeStr = time.toLocaleTimeString('fa-IR', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        });
        
        let icon = '', sender = '', senderClass = '';
        
        switch (type) {
            case 'user':
                icon = '<i class="fas fa-user"></i>';
                sender = 'شما';
                senderClass = 'user-sender';
                break;
            case 'assistant':
                icon = '<i class="fas fa-robot"></i>';
                sender = 'دستیار هوشمند';
                senderClass = 'assistant-sender';
                break;
            case 'operator':
                icon = '<i class="fas fa-user-tie"></i>';
                sender = 'اپراتور انسانی';
                senderClass = 'operator-sender';
                break;
            case 'system':
                icon = '<i class="fas fa-info-circle"></i>';
                sender = 'سیستم';
                senderClass = 'system-sender';
                break;
        }
        
        messageEl.innerHTML = `
            ${sender ? `
                <div class="message-sender ${senderClass}">
                    ${icon}
                    <span>${sender}</span>
                </div>
            ` : ''}
            <div class="message-text">${this.formatMessage(text)}</div>
            <div class="message-time">${timeStr}</div>
        `;
        
        this.elements.messagesContainer.appendChild(messageEl);
        
        // اسکرول به پایین
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 100);
        
        // ذخیره در تاریخچه
        this.state.messages.push({
            type,
            text,
            timestamp: time.toISOString(),
            sender,
            senderClass
        });
        
        // اگر چت باز نیست، نوتیفیکیشن بده
        if (!this.state.isOpen && (type === 'assistant' || type === 'operator' || type === 'system')) {
            this.state.unreadCount++;
            this.showNotification();
            this.playSound('message');
            
            if (document.hidden) {
                this.startTabNotification();
            }
        }
        
        // ذخیره آخرین زمان پیام
        this.state.lastMessageTime = time;
    }

    formatMessage(text) {
        // تبدیل لینک‌ها به تگ <a>
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        text = text.replace(urlRegex, url => 
            `<a href="${url}" target="_blank" rel="noopener noreferrer" class="message-link">${url}</a>`
        );
        
        // تبدیل خطوط جدید به <br>
        text = text.replace(/\n/g, '<br>');
        
        // هایلایت کلمات کلیدی
        const highlights = [
            { regex: /\*\*(.*?)\*\*/g, replace: '<strong>$1</strong>' },
            { regex: /\*(.*?)\*/g, replace: '<em>$1</em>' },
            { regex: /__(.*?)__/g, replace: '<u>$1</u>' },
            { regex: /~~(.*?)~~/g, replace: '<s>$1</s>' },
            { regex: /`(.*?)`/g, replace: '<code>$1</code>' }
        ];
        
        highlights.forEach(highlight => {
            text = text.replace(highlight.regex, highlight.replace);
        });
        
        return text;
    }

    setTyping(typing) {
        this.state.isTyping = typing;
        this.elements.typingIndicator.classList.toggle('active', typing);
        this.elements.sendBtn.disabled = typing;
        this.elements.messageInput.disabled = typing;
        
        if (!typing) {
            this.elements.messageInput.focus();
        }
    }

    showNotification(count = 1) {
        if (!this.state.isOpen) {
            this.state.unreadCount += count;
            this.elements.notificationBadge.textContent = this.state.unreadCount;
            this.elements.notificationBadge.style.display = 'flex';
            
            // انیمیشن دکمه
            this.elements.toggleBtn.classList.add('pulse');
            setTimeout(() => {
                this.elements.toggleBtn.classList.remove('pulse');
            }, 600);
        }
    }

    resetNotification() {
        this.state.unreadCount = 0;
        this.elements.notificationBadge.textContent = '0';
        this.elements.notificationBadge.style.display = 'none';
        this.stopTabNotification();
    }

    playSound(type) {
        if (!this.options.sounds) return;
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        let frequency = 800;
        let duration = 0.1;
        
        switch (type) {
            case 'open':
                frequency = 600;
                duration = 0.2;
                break;
            case 'close':
                frequency = 400;
                duration = 0.15;
                break;
            case 'message':
                frequency = 700;
                duration = 0.1;
                break;
            case 'connect':
                frequency = [800, 1000, 1200];
                duration = 0.3;
                break;
            case 'record_start':
                frequency = 1000;
                duration = 0.05;
                break;
            case 'record_stop':
                frequency = 600;
                duration = 0.05;
                break;
        }
        
        oscillator.type = 'sine';
        
        if (Array.isArray(frequency)) {
            oscillator.frequency.setValueAtTime(frequency[0], audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(frequency[1], audioContext.currentTime + duration * 0.5);
            oscillator.frequency.exponentialRampToValueAtTime(frequency[2], audioContext.currentTime + duration);
        } else {
            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        }
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    }

    setupNotification() {
        // درخواست مجوز نوتیفیکیشن
        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => {
                Notification.requestPermission();
            }, 3000);
        }
    }

    startTabNotification() {
        if (this.tabNotificationInterval) return;
        
        let isOriginal = true;
        this.tabNotificationInterval = setInterval(() => {
            document.title = isOriginal ? 
                `(${this.state.unreadCount}) پیام جدید` : 
                this.originalTitle;
            isOriginal = !isOriginal;
        }, 1500);
    }

    stopTabNotification() {
        if (this.tabNotificationInterval) {
            clearInterval(this.tabNotificationInterval);
            this.tabNotificationInterval = null;
            document.title = this.originalTitle;
        }
    }

    // Helper Methods
    getUserName() {
        // تلاش برای دریافت نام کاربر از کوکی یا localStorage
        return localStorage.getItem('user_name') || 
               this.getCookie('user_name') || 
               'کاربر سایت';
    }

    getDeviceType() {
        const ua = navigator.userAgent;
        if (/mobile/i.test(ua)) return 'موبایل';
        if (/tablet/i.test(ua)) return 'تبلت';
        return 'دسکتاپ';
    }

    async getUserLocation() {
        try {
            if ('geolocation' in navigator) {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: false,
                        timeout: 5000,
                        maximumAge: 60000
                    });
                });
                
                return {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
            }
        } catch (error) {
            console.log('موقعیت مکانی در دسترس نیست');
        }
        return null;
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 بایت';
        const k = 1024;
        const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    saveMessageToHistory(type, message) {
        const history = JSON.parse(localStorage.getItem('chat_history') || '[]');
        history.push({
            type,
            message,
            timestamp: new Date().toISOString(),
            sessionId: this.state.sessionId
        });
        
        // فقط 100 پیام آخر را نگه دار
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
        
        localStorage.setItem('chat_history', JSON.stringify(history));
    }

    showHumanSupportSuggestion() {
        // اگر کاربر چند بار با AI چت کرده، پیشنهاد اتصال به اپراتور بده
        const aiMessages = this.state.messages.filter(m => m.type === 'assistant').length;
        if (aiMessages >= 3 && !this.state.operatorConnected && !this.state.isConnecting) {
            setTimeout(() => {
                this.addMessage('system', 
                    '💡 **پیشنهاد ویژه:**\n\n' +
                    'اگر سوال پیچیده‌ای دارید یا نیاز به توضیح بیشتری هست،\n' +
                    'می‌توانید به اپراتور انسانی متصل شوید.\n\n' +
                    '🔗 **مزایا:**\n' +
                    '• پاسخ‌های دقیق و تخصصی\n' +
                    '• امکان ارسال فایل و پیام صوتی\n' +
                    '• راهنمایی قدم‌به‌قدم\n\n' +
                    'برای اتصال، دکمه "درخواست پشتیبان انسانی" را بزنید.'
                );
            }, 2000);
        }
    }

    trackEvent(eventName, data = {}) {
        // ارسال رویدادهای تحلیلی (اختیاری)
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, {
                ...data,
                session_id: this.state.sessionId,
                page_path: window.location.pathname
            });
        }
        
        // ارسال به سرور خودتان
        try {
            fetch(`${this.options.backendUrl}/api/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: eventName,
                    sessionId: this.state.sessionId,
                    timestamp: new Date().toISOString(),
                    ...data
                })
            });
        } catch (error) {
            // Silent fail
        }
    }

    // Public API Methods
    open() {
        this.openChat();
    }

    close() {
        this.closeChat();
    }

    send(text) {
        if (text && !this.state.isTyping) {
            this.elements.messageInput.value = text;
            this.sendMessage();
        }
    }

    destroy() {
        // قطع اتصالات
        if (this.state.socket) {
            this.state.socket.disconnect();
        }
        
        // پاک کردن عناصر
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // پاک کردن تایمرها
        this.stopTabNotification();
        clearTimeout(this.typingTimeout);
        
        console.log('🧹 ویجت چت از بین رفت');
    }
}

// اتولود ویجت وقتی DOM آماده است
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ChatWidget = new ChatWidget();
    });
} else {
    window.ChatWidget = new ChatWidget();
}

// API عمومی برای استفاده خارجی
window.initChatWidget = (options) => {
    return new ChatWidget(options);
};

// دسترسی به نمونه ویجت از کنسول
if (typeof console !== 'undefined') {
    console.info('📱 ویجت چت آماده است! برای دسترسی از "ChatWidget" استفاده کنید.');
}
