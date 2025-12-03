class ChatWidget {
    constructor(options = {}) {
        this.options = {
            backendUrl: options.backendUrl || window.location.origin,
            position: options.position || 'bottom-right',
            theme: options.theme || 'default',
            language: options.language || 'fa',
            ...options
        };
        
        this.state = {
            isOpen: false,
            isConnected: false,
            operatorConnected: false,
            operatorPending: false,
            sessionId: null,
            socket: null,
            messages: [],
            isTyping: false,
            isConnecting: false,
            lastMessageFromOperator: null
        };
        
        this.init();
    }
    
    init() {
        // Generate session ID
        this.state.sessionId = this.generateSessionId();
        
        // Inject CSS and HTML
        this.injectStyles();
        this.injectHTML();
        
        // Initialize event listeners
        this.initEvents();
        
        // Connect to WebSocket
        this.connectWebSocket();
        
        console.log('💬 Chat Widget initialized with session:', this.state.sessionId.substring(0, 12));
    }
    
    generateSessionId() {
        let sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
            localStorage.setItem('chat_session_id', sessionId);
        }
        return sessionId;
    }
    
    injectStyles() {
        // CSS is already loaded via widget.css
        // Just ensure it's loaded
        if (!document.querySelector('link[href*="widget.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${this.options.backendUrl}/widget.css`;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        }
        
        // Add FontAwesome if not present
        if (!document.querySelector('link[href*="fontawesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            document.head.appendChild(faLink);
        }
    }
    
    injectHTML() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'chat-widget';
        this.container.setAttribute('dir', 'rtl');
        
        this.container.innerHTML = `
            <!-- Toggle Button -->
            <button class="chat-toggle-btn">
                <i class="fas fa-comments"></i>
                <span class="notification-badge">0</span>
                <div class="pulse-ring"></div>
            </button>
            
            <!-- Chat Window -->
            <div class="chat-window">
                <!-- Header -->
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo">
                            <i class="fas fa-headset"></i>
                        </div>
                        <div class="chat-title">
                            <h3>پشتیبانی آنلاین</h3>
                            <p class="status-text">آماده پاسخگویی</p>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="chat-status">
                            <span class="status-dot"></span>
                            <span class="status-text">آنلاین</span>
                        </div>
                        <button class="close-btn" title="بستن">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Messages Container -->
                <div class="chat-messages">
                    <!-- Welcome Message -->
                    <div class="message system">
                        <div class="message-sender">
                            <i class="fas fa-robot"></i>
                            <span>دستیار هوشمند</span>
                        </div>
                        <div class="message-text">
                            سلام! 👋 به سیستم پشتیبانی خوش آمدید.
                            من می‌تونم به سوالات شما پاسخ بدم.
                            برای صحبت با اپراتور انسانی، روی دکمه "اتصال به اپراتور" کلیک کنید.
                        </div>
                        <div class="message-time">همین الان</div>
                    </div>
                </div>
                
                <!-- Connection Status -->
                <div class="connection-status">
                    <div class="status-message">
                        <i class="fas fa-wifi-slash"></i>
                        <span>در حال اتصال به سرور...</span>
                    </div>
                </div>
                
                <!-- Typing Indicator -->
                <div class="typing-indicator">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span>اپراتور در حال تایپ است...</span>
                </div>
                
                <!-- Operator Info -->
                <div class="operator-info">
                    <div class="operator-card">
                        <div class="operator-avatar">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div class="operator-details">
                            <h4><i class="fas fa-shield-alt"></i> در حال گفتگو با اپراتور</h4>
                            <p class="operator-name">منتظر پذیرش اپراتور...</p>
                        </div>
                    </div>
                </div>
                
                <!-- Input Area -->
                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <textarea 
                            class="message-input" 
                            placeholder="پیام خود را اینجا بنویسید..." 
                            rows="1"
                            dir="auto"
                        ></textarea>
                        <div class="input-actions">
                            <button class="emoji-btn" title="ایموجی">
                                <i class="far fa-smile"></i>
                            </button>
                            <button class="send-btn" title="ارسال">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="action-buttons">
                        <button class="human-support-btn">
                            <i class="fas fa-user-headset"></i>
                            <span class="btn-text">اتصال به اپراتور انسانی</span>
                            <span class="btn-loader" style="display: none">
                                <i class="fas fa-spinner fa-spin"></i>
                            </span>
                        </button>
                        
                        <div class="quick-actions">
                            <button class="quick-btn" data-text="سلام، نیاز به کمک دارم">سلام 👋</button>
                            <button class="quick-btn" data-text="قیمت محصولات را می‌خواهم">💰 قیمت</button>
                            <button class="quick-btn" data-text="با مدیر صحبت کنم">👨‍💼 مدیر</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        
        // Cache DOM elements
        this.elements = {
            toggleBtn: this.container.querySelector('.chat-toggle-btn'),
            chatWindow: this.container.querySelector('.chat-window'),
            closeBtn: this.container.querySelector('.close-btn'),
            messagesContainer: this.container.querySelector('.chat-messages'),
            messageInput: this.container.querySelector('.message-input'),
            sendBtn: this.container.querySelector('.send-btn'),
            humanSupportBtn: this.container.querySelector('.human-support-btn'),
            humanSupportText: this.container.querySelector('.human-support-btn .btn-text'),
            humanSupportLoader: this.container.querySelector('.human-support-btn .btn-loader'),
            typingIndicator: this.container.querySelector('.typing-indicator'),
            connectionStatus: this.container.querySelector('.connection-status'),
            operatorInfo: this.container.querySelector('.operator-info'),
            operatorName: this.container.querySelector('.operator-name'),
            notificationBadge: this.container.querySelector('.notification-badge'),
            statusText: this.container.querySelector('.status-text'),
            quickButtons: this.container.querySelectorAll('.quick-btn'),
            emojiBtn: this.container.querySelector('.emoji-btn')
        };
    }
    
    initEvents() {
        // Toggle chat
        this.elements.toggleBtn.addEventListener('click', () => this.toggleChat());
        this.elements.closeBtn.addEventListener('click', () => this.closeChat());
        
        // Send message
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        this.elements.messageInput.addEventListener('input', () => {
            this.resizeTextarea();
        });
        
        // Human support button
        this.elements.humanSupportBtn.addEventListener('click', () => this.connectToHuman());
        
        // Quick action buttons
        this.elements.quickButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text');
                this.elements.messageInput.value = text;
                this.sendMessage();
            });
        });
        
        // Close chat when clicking outside
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && 
                !this.elements.chatWindow.contains(e.target) && 
                !this.elements.toggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
        
        // Window focus/blur events
        window.addEventListener('focus', () => {
            if (this.state.socket && !this.state.socket.connected) {
                this.connectWebSocket();
            }
        });
    }
    
    connectWebSocket() {
        try {
            if (this.state.socket) {
                this.state.socket.disconnect();
            }
            
            const wsUrl = this.options.backendUrl.replace('http', 'ws');
            console.log('🔗 Connecting WebSocket to:', wsUrl);
            
            this.state.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000
            });
            
            // WebSocket events
            this.state.socket.on('connect', () => {
                console.log('✅ WebSocket connected');
                this.state.isConnected = true;
                this.updateConnectionStatus(true);
                
                // Join session room
                this.state.socket.emit('join-session', this.state.sessionId);
                console.log('📨 Joined session:', this.state.sessionId.substring(0, 12));
            });
            
            this.state.socket.on('operator-connected', (data) => {
                console.log('👤 Operator connected:', data);
                this.state.operatorConnected = true;
                this.state.operatorPending = false;
                
                // Update operator info
                this.elements.operatorInfo.classList.add('active');
                this.elements.operatorName.textContent = data.operatorName || 'اپراتور';
                
                // Update button
                this.updateHumanSupportButton('connected');
                
                // Add system message
                this.addMessage('system', data.message || '✅ اپراتور درخواست شما را پذیرفت!');
                
                // Update status
                this.updateStatus('با اپراتور در ارتباط');
            });
            
            this.state.socket.on('operator-rejected', (data) => {
                console.log('❌ Operator rejected:', data);
                this.state.operatorConnected = false;
                this.state.operatorPending = false;
                
                // Update button
                this.updateHumanSupportButton('default');
                
                // Add system message
                this.addMessage('system', data.message || '❌ اپراتور در حال حاضر مشغول است.');
                
                // Show retry option
                setTimeout(() => {
                    this.addMessage('system', 'می‌توانید دقایقی دیگر مجدداً تلاش کنید یا سوال خود را از هوش مصنوعی بپرسید.');
                }, 1500);
            });
            
            this.state.socket.on('operator-message', (data) => {
                console.log('📨 Message from operator:', data);
                this.state.lastMessageFromOperator = new Date();
                this.addMessage('operator', data.message);
                
                // Show typing indicator off
                this.showTyping(false);
            });
            
            this.state.socket.on('operator-typing', (data) => {
                this.showTyping(data.typing);
            });
            
            this.state.socket.on('operator-requested', (data) => {
                console.log('🔄 Operator requested:', data);
                this.state.operatorPending = true;
                this.updateHumanSupportButton('pending');
                this.addMessage('system', data.message || 'درخواست شما به اپراتور ارسال شد...');
            });
            
            this.state.socket.on('message-sent', (data) => {
                if (!data.success) {
                    this.addMessage('system', `❌ خطا در ارسال: ${data.error || 'خطای ناشناخته'}`);
                }
            });
            
            this.state.socket.on('connect_error', (error) => {
                console.error('❌ WebSocket connection error:', error);
                this.updateConnectionStatus(false);
                this.state.isConnected = false;
                
                // Retry after 5 seconds
                setTimeout(() => {
                    if (!this.state.isConnected) {
                        this.connectWebSocket();
                    }
                }, 5000);
            });
            
            this.state.socket.on('disconnect', (reason) => {
                console.log('🔌 WebSocket disconnected:', reason);
                this.state.isConnected = false;
                this.updateConnectionStatus(false);
            });
            
        } catch (error) {
            console.error('❌ WebSocket initialization failed:', error);
        }
    }
    
    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.classList.remove('active');
            this.elements.statusText.textContent = 'آنلاین';
            this.elements.toggleBtn.classList.add('connected');
        } else {
            this.elements.connectionStatus.classList.add('active');
            this.elements.statusText.textContent = 'آفلاین';
            this.elements.toggleBtn.classList.remove('connected');
        }
    }
    
    updateStatus(text) {
        this.elements.statusText.textContent = text;
    }
    
    toggleChat() {
        this.state.isOpen = !this.state.isOpen;
        this.elements.chatWindow.classList.toggle('active');
        this.elements.toggleBtn.classList.toggle('active');
        
        if (this.state.isOpen) {
            this.elements.messageInput.focus();
            this.resetNotification();
            
            // Scroll to bottom
            setTimeout(() => {
                this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
            }, 100);
        }
    }
    
    closeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
        this.elements.toggleBtn.classList.remove('active');
    }
    
    resizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
    
    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        
        if (!message || this.state.isTyping) return;
        
        // Add user message
        this.addMessage('user', message);
        
        // Clear and reset input
        this.elements.messageInput.value = '';
        this.elements.messageInput.style.height = 'auto';
        
        // Disable input during processing
        this.setInputState(false);
        
        try {
            if (this.state.operatorConnected) {
                // Send to operator via WebSocket
                await this.sendToOperator(message);
            } else {
                // Send to AI
                await this.sendToAI(message);
            }
        } catch (error) {
            console.error('❌ Send message error:', error);
            this.addMessage('system', '⚠️ خطا در ارسال پیام. لطفاً دوباره تلاش کنید.');
        } finally {
            this.setInputState(true);
        }
    }
    
    async sendToAI(message) {
        try {
            this.showTyping(true, 'assistant');
            
            const response = await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: this.state.sessionId
                })
            });
            
            const data = await response.json();
            this.showTyping(false);
            
            if (data.success) {
                this.addMessage('assistant', data.message);
                
                // If AI suggests human support
                if (data.requiresHuman && !this.state.operatorConnected) {
                    this.elements.humanSupportText.textContent = 'اتصال به اپراتور (پیشنهاد شده)';
                    this.elements.humanSupportBtn.classList.add('suggested');
                }
            } else {
                this.addMessage('system', data.message || 'خطا در پردازش درخواست');
            }
            
        } catch (error) {
            console.error('❌ AI request error:', error);
            this.showTyping(false);
            this.addMessage('system', '❌ خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.');
        }
    }
    
    async sendToOperator(message) {
        return new Promise((resolve, reject) => {
            if (!this.state.socket || !this.state.socket.connected) {
                reject(new Error('اتصال برقرار نیست'));
                return;
            }
            
            // Show typing indicator for operator
            this.showTyping(true, 'operator');
            
            // Emit message to operator via WebSocket
            this.state.socket.emit('send-to-operator', {
                sessionId: this.state.sessionId,
                message: message
            }, (response) => {
                this.showTyping(false);
                
                if (response && response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response?.error || 'خطا در ارسال'));
                }
            });
            
            // Timeout after 10 seconds
            setTimeout(() => {
                this.showTyping(false);
                reject(new Error('Timeout'));
            }, 10000);
        });
    }
    
    async connectToHuman() {
        if (this.state.operatorConnected || this.state.operatorPending || this.state.isConnecting) {
            return;
        }
        
        this.state.isConnecting = true;
        this.state.operatorPending = true;
        
        // Update button state
        this.updateHumanSupportButton('connecting');
        
        try {
            const userInfo = {
                name: 'کاربر سایت',
                page: window.location.href,
                userAgent: navigator.userAgent.substring(0, 100),
                referrer: document.referrer || 'مستقیم',
                language: navigator.language,
                platform: navigator.platform,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
            
            console.log('👤 Requesting human connection...', {
                sessionId: this.state.sessionId.substring(0, 12),
                userInfo
            });
            
            const response = await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.state.sessionId,
                    userInfo: userInfo
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Connection request sent successfully');
                this.addMessage('system', data.message || '✅ درخواست شما به اپراتور ارسال شد.');
                
                // Button will be updated by WebSocket events
            } else {
                console.error('❌ Connection failed:', data.error);
                this.state.operatorPending = false;
                this.updateHumanSupportButton('default');
                this.addMessage('system', `❌ ${data.error || 'خطا در اتصال به اپراتور'}`);
            }
            
        } catch (error) {
            console.error('❌ Connect to human error:', error);
            this.state.operatorPending = false;
            this.updateHumanSupportButton('default');
            this.addMessage('system', '❌ خطا در ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.');
        } finally {
            this.state.isConnecting = false;
        }
    }
    
    updateHumanSupportButton(state) {
        const btn = this.elements.humanSupportBtn;
        const text = this.elements.humanSupportText;
        const loader = this.elements.humanSupportLoader;
        
        btn.classList.remove('connecting', 'pending', 'connected', 'suggested');
        
        switch(state) {
            case 'connecting':
                btn.classList.add('connecting');
                text.textContent = 'در حال اتصال...';
                loader.style.display = 'inline-block';
                btn.disabled = true;
                break;
                
            case 'pending':
                btn.classList.add('pending');
                text.textContent = 'منتظر پذیرش اپراتور';
                loader.style.display = 'inline-block';
                btn.disabled = true;
                break;
                
            case 'connected':
                btn.classList.add('connected');
                text.textContent = 'متصل به اپراتور';
                loader.style.display = 'none';
                btn.disabled = true;
                break;
                
            default:
                text.textContent = 'اتصال به اپراتور انسانی';
                loader.style.display = 'none';
                btn.disabled = false;
                break;
        }
    }
    
    showTyping(show, type = 'operator') {
        if (show) {
            this.elements.typingIndicator.classList.add('active');
            this.elements.typingIndicator.querySelector('span:last-child').textContent = 
                type === 'operator' ? 'اپراتور در حال تایپ است...' : 'پشتیبان در حال پاسخگویی است...';
        } else {
            this.elements.typingIndicator.classList.remove('active');
        }
    }
    
    setInputState(enabled) {
        this.state.isTyping = !enabled;
        this.elements.messageInput.disabled = !enabled;
        this.elements.sendBtn.disabled = !enabled;
        
        if (enabled) {
            this.elements.messageInput.focus();
        }
    }
    
    addMessage(type, text) {
        // Remove typing indicator if present
        this.showTyping(false);
        
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        
        const time = new Date().toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let senderIcon = '';
        let senderText = '';
        let messageClass = '';
        
        switch(type) {
            case 'user':
                senderIcon = '<i class="fas fa-user"></i>';
                senderText = 'شما';
                messageClass = 'user-message';
                break;
            case 'assistant':
                senderIcon = '<i class="fas fa-robot"></i>';
                senderText = 'پشتیبان هوشمند';
                messageClass = 'ai-message';
                break;
            case 'operator':
                senderIcon = '<i class="fas fa-user-tie"></i>';
                senderText = 'اپراتور';
                messageClass = 'operator-message';
                break;
            case 'system':
                senderIcon = '<i class="fas fa-info-circle"></i>';
                senderText = 'سیستم';
                messageClass = 'system-message';
                break;
        }
        
        messageEl.innerHTML = `
            <div class="message-header">
                <div class="message-sender">
                    ${senderIcon}
                    <span>${senderText}</span>
                </div>
                <div class="message-time">${time}</div>
            </div>
            <div class="message-text">${this.formatMessage(text)}</div>
        `;
        
        this.elements.messagesContainer.appendChild(messageEl);
        
        // Scroll to bottom
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 50);
        
        // Add to state
        this.state.messages.push({ 
            type, 
            text, 
            time,
            timestamp: new Date().toISOString()
        });
        
        // Trim messages if too many
        if (this.state.messages.length > 100) {
            this.state.messages = this.state.messages.slice(-50);
        }
        
        // Show notification if chat is closed
        if (!this.state.isOpen && type !== 'user') {
            this.showNotification();
        }
    }
    
    formatMessage(text) {
        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        text = text.replace(urlRegex, url => 
            `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
        );
        
        // Convert line breaks to <br>
        text = text.replace(/\n/g, '<br>');
        
        // Escape HTML (except for our own tags)
        const div = document.createElement('div');
        div.textContent = text;
        let safeText = div.innerHTML;
        
        // Restore our links and line breaks
        safeText = safeText.replace(/&lt;a /g, '<a ').replace(/&lt;\/a&gt;/g, '</a>');
        safeText = safeText.replace(/&lt;br&gt;/g, '<br>');
        
        return safeText;
    }
    
    showNotification() {
        const badge = this.elements.notificationBadge;
        const currentCount = parseInt(badge.textContent) || 0;
        badge.textContent = currentCount + 1;
        badge.style.display = 'flex';
        
        // Add pulse effect
        this.elements.toggleBtn.classList.add('pulse');
        
        // Remove pulse after animation
        setTimeout(() => {
            this.elements.toggleBtn.classList.remove('pulse');
        }, 1500);
    }
    
    resetNotification() {
        const badge = this.elements.notificationBadge;
        badge.textContent = '0';
        badge.style.display = 'none';
    }
    
    // Public methods
    open() {
        if (!this.state.isOpen) {
            this.toggleChat();
        }
    }
    
    close() {
        if (this.state.isOpen) {
            this.closeChat();
        }
    }
    
    sendMessage(text) {
        if (text) {
            this.elements.messageInput.value = text;
        }
        this.sendMessage();
    }
    
    connectOperator() {
        this.connectToHuman();
    }
    
    getSessionId() {
        return this.state.sessionId;
    }
    
    getMessages() {
        return [...this.state.messages];
    }
    
    isOperatorConnected() {
        return this.state.operatorConnected;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ChatWidget = new ChatWidget();
    });
} else {
    window.ChatWidget = new ChatWidget();
}

// Global initialization function
window.initChatWidget = function(options) {
    if (window.ChatWidgetInstance) {
        console.warn('Chat widget already initialized');
        return window.ChatWidgetInstance;
    }
    
    window.ChatWidgetInstance = new ChatWidget(options);
    return window.ChatWidgetInstance;
};

// Auto-initialize if data attribute is present
if (document.currentScript && document.currentScript.dataset.autoInit !== 'false') {
    document.addEventListener('DOMContentLoaded', () => {
        const script = document.currentScript;
        const options = {
            backendUrl: script.dataset.backendUrl || window.location.origin,
            position: script.dataset.position || 'bottom-right',
            theme: script.dataset.theme || 'default'
        };
        
        window.ChatWidget = new ChatWidget(options);
    });
}
