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
            isConnecting: false
        };

        this.init();
    }

    init() {
        this.state.sessionId = this.generateSessionId();
        this.injectStyles();
        this.injectHTML();
        this.initEvents();
        this.connectWebSocket();

        console.log('Chat Widget initialized with session:', this.state.sessionId);
    }

    generateSessionId() {
        let sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_session_id', sessionId);
        }
        return sessionId;
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
            <button class="chat-toggle-btn">
                <i class="fas fa-comment-dots"></i>
                <span class="notification-badge" style="display: none">0</span>
            </button>

            <div class="chat-window">
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo"><i class="fas fa-robot"></i></div>
                        <div class="chat-title">
                            <h3>پشتیبان هوشمند</h3>
                            <p>پاسخگوی سوالات شما</p>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="chat-status"><span class="status-dot"></span><span>آنلاین</span></div>
                        <button class="close-btn"><i class="fas fa-times"></i></button>
                    </div>
                </div>

                <div class="chat-messages">
                    <div class="message system">
                        <div class="message-text">سلام! من دستیار هوشمند شما هستم. چطور می‌تونم کمکتون کنم؟</div>
                        <div class="message-time">همین الان</div>
                    </div>
                </div>

                <div class="connection-status"><div class="status-message"><i class="fas fa-wifi"></i><span>در حال اتصال...</span></div></div>
                <div class="typing-indicator"><div class="typing-dots"><span></span><span></span><span></span></div><span>در حال تایپ...</span></div>

                <div class="operator-info">
                    <div class="operator-card">
                        <div class="operator-avatar"><i class="fas fa-user-tie"></i></div>
                        <div class="operator-details">
                            <h4><i class="fas fa-shield-alt"></i> اپراتور انسانی</h4>
                            <p>در حال حاضر با پشتیبان انسانی در ارتباط هستید</p>
                        </div>
                    </div>
                </div>

                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <textarea class="message-input" placeholder="پیام خود را بنویسید..." rows="1"></textarea>
                        <button class="send-btn"><i class="fas fa-paper-plane"></i></button>
                    </div>
                    <button class="human-support-btn">
                        <i class="fas fa-user-headset"></i> اتصال به اپراتور انسانی
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

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
            chatStatus: this.container.querySelector('.chat-status')
        };
    }

    initEvents() {
        this.elements.toggleBtn.addEventListener('click', () => this.toggleChat());
        this.elements.closeBtn.addEventListener('click', () => this.closeChat());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.elements.messageInput.addEventListener('input', () => this.resizeTextarea());
        this.elements.humanSupportBtn.addEventListener('click', () => this.connectToHuman());

        document.addEventListener('click', (e) => {
            if (this.state.isOpen && !this.elements.chatWindow.contains(e.target) && !this.elements.toggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
    }

    connectWebSocket() {
        try {
            const wsUrl = this.options.backendUrl.replace('http', 'ws');
            this.state.socket = io(wsUrl, { transports: ['websocket', 'polling'], reconnection: true });

            this.state.socket.on('connect', () => {
                console.log('WebSocket connected');
                this.state.isConnected = true;
                this.updateConnectionStatus(true);
                this.state.socket.emit('join-session', this.state.sessionId);
            });

            this.state.socket.on('operator-connected', () => {
                this.state.operatorConnected = true;
                this.elements.operatorInfo.classList.add('active');
                this.addMessage('system', 'اپراتور متصل شد! حالا می‌تونید چت کنید.');
                this.elements.humanSupportBtn.innerHTML = '<i class="fas fa-user-check"></i> متصل به اپراتور';
                this.elements.humanSupportBtn.style.background = 'linear-gradient(145deg, #2ecc71, #27ae60)';
                this.elements.humanSupportBtn.disabled = true;
            });

            this.state.socket.on('operator-message', (data) => {
                this.addMessage('operator', data.message || data);
            });

            this.state.socket.on('connect_error', () => this.updateConnectionStatus(false));
        } catch (err) { console.error('WebSocket error:', err); }
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.classList.remove('active');
            this.elements.chatStatus.innerHTML = '<span class="status-dot"></span><span>آنلاین</span>';
        } else {
            this.elements.connectionStatus.classList.add('active');
        }
    }

    toggleChat() {
        this.state.isOpen = !this.state.isOpen;
        this.elements.chatWindow.classList.toggle('active');
        if (this.state.isOpen) {
            this.elements.messageInput.focus();
            this.resetNotification();
        }
    }

    closeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
    }

    resizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    // تابع اصلی ارسال پیام - اینجاست که همه چیز درست شد!
    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message || this.state.isTyping) return;

        this.addMessage('user', message);
        this.elements.messageInput.value = '';
        this.resizeTextarea();
        this.setTyping(true);

        try {
            // همیشه به /api/chat بفرست (حتی وقتی اپراتور وصله!)
            const res = await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId: this.state.sessionId })
            });

            const data = await res.json();

            if (data.operatorConnected) {
                // پیام به اپراتور رفت
                console.log('پیام به اپراتور ارسال شد');
            } else if (data.success) {
                this.addMessage('assistant', data.message);
            } else if (data.requiresHuman) {
                this.elements.humanSupportBtn.innerHTML = '<i class="fas fa-user-headset"></i> اتصال به اپراتور (توصیه شده)';
                this.elements.humanSupportBtn.style.background = '#ff9500';
            }
        } catch (err) {
            console.error('خطا در ارسال پیام:', err);
            this.addMessage('system', 'خطا در ارسال پیام. دوباره تلاش کنید.');
        } finally {
            this.setTyping(false);
        }
    }

    async connectToHuman() {
        if (this.state.operatorConnected || this.state.isConnecting) return;

        this.state.isConnecting = true;
        this.elements.humanSupportBtn.disabled = true;
        this.elements.humanSupportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال اتصال...';

        try {
            const userInfo = {
                name: 'کاربر سایت',
                page: location.href,
                userAgent: navigator.userAgent
            };

            const res = await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.state.sessionId, userInfo })
            });

            const data = await res.json();

            if (data.success) {
                this.addMessage('system', 'درخواست شما ارسال شد. منتظر پذیرش اپراتور باشید...');
            } else {
                this.addMessage('system', 'خطا در اتصال به اپراتور');
                this.resetHumanSupportButton();
            }
        } catch (err) {
            console.error(err);
            this.addMessage('system', 'خطا در ارتباط با سرور');
            this.resetHumanSupportButton();
        } finally {
            this.state.isConnecting = false;
        }
    }

    resetHumanSupportButton() {
        this.elements.humanSupportBtn.innerHTML = '<i class="fas fa-user-headset"></i> اتصال به اپراتور انسانی';
        this.elements.humanSupportBtn.style.background = '#ff6b6b';
        this.elements.humanSupportBtn.disabled = false;
    }

    addMessage(type, text) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;

        const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        const icons = { user: 'fa-user', assistant: 'fa-robot', operator: 'fa-user-tie', system: 'fa-info-circle' };
        const names = { user: 'شما', assistant: 'پشتیبان هوشمند', operator: 'اپراتور', system: 'سیستم' };

        messageEl.innerHTML = `
            <div class="message-sender">
                <i class="fas ${icons[type]}"></i>
                <span>${names[type]}</span>
            </div>
            <div class="message-text">${this.escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;

        this.elements.messagesContainer.appendChild(messageEl);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;

        if (!this.state.isOpen) this.showNotification();
    }

    setTyping(typing) {
        this.state.isTyping = typing;
        this.elements.typingIndicator.classList.toggle('active', typing);
        this.elements.sendBtn.disabled = typing;
        this.elements.messageInput.disabled = typing;
    }

    showNotification() {
        const badge = this.elements.notificationBadge;
        badge.textContent = (parseInt(badge.textContent) || 0) + 1;
        badge.style.display = 'flex';
    }

    resetNotification() {
        this.elements.notificationBadge.textContent = '0';
        this.elements.notificationBadge.style.display = 'none';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// راه‌اندازی خودکار
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ChatWidget = new ChatWidget());
} else {
    window.ChatWidget = new ChatWidget();
}

window.initChatWidget = (options) => new ChatWidget(options);
