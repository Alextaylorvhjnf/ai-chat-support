class ChatWidget {
    constructor(options = {}) {
        this.options = {
            backendUrl: options.backendUrl || window.location.origin,
            ...options
        };

        this.state = {
            isOpen: false,
            sessionId: null,
            socket: null,
            operatorConnected: false,  // مهم: وقتی این true شد هوش مصنوعی قطع میشه
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
        console.log('ویجت چت آماده شد - session:', this.state.sessionId);
    }

    generateSessionId() {
        let id = localStorage.getItem('chat_session_id');
        if (!id) {
            id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_session_id', id);
        }
        return id;
    }

    injectStyles() {
        if (!document.querySelector('link[href*="widget.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${this.options.backendUrl}/widget.css`;
            document.head.appendChild(link);
        }
    }

    injectHTML() {
        this.container = document.createElement('div');
        this.container.className = 'chat-widget';
        this.container.innerHTML = `
            <button class="chat-toggle-btn"><i class="fas fa-comment-dots"></i><span class="notification-badge">0</span></button>
            <div class="chat-window">
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo"><i class="fas fa-robot"></i></div>
                        <div class="chat-title"><h3>پشتیبان هوشمند</h3><p>آنلاین</p></div>
                    </div>
                    <button class="close-btn"><i class="fas fa-times"></i></button>
                </div>
                <div class="chat-messages">
                    <div class="message system">
                        <div class="message-text">سلام! چطور می‌تونم کمکتون کنم؟</div>
                        <div class="message-time">همین الان</div>
                    </div>
                </div>
                <div class="operator-info" style="display:none;">
                    <div class="operator-card">
                        <div class="operator-avatar"><i class="fas fa-user-tie"></i></div>
                        <div class="operator-details">
                            <h4>اپراتور انسانی متصل شد</h4>
                            <p>حالا مستقیم با پشتیبان در ارتباط هستید</p>
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
            operatorInfo: this.container.querySelector('.operator-info'),
            notificationBadge: this.container.querySelector('.notification-badge')
        };
    }

    initEvents() {
        this.elements.toggleBtn.onclick = () => this.toggleChat();
        this.elements.closeBtn.onclick = () => this.closeChat();
        this.elements.sendBtn.onclick = () => this.sendMessage();
        this.elements.messageInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        };
        this.elements.messageInput.oninput = () => this.resizeTextarea();
        this.elements.humanSupportBtn.onclick = () => this.connectToHuman();
    }

    connectWebSocket() {
        const wsUrl = this.options.backendUrl.replace('http', 'ws');
        this.state.socket = io(wsUrl, { transports: ['websocket'] });

        this.state.socket.on('connect', () => {
            this.state.socket.emit('join-session', this.state.sessionId);
        });

        this.state.socket.on('operator-connected', () => {
            this.state.operatorConnected = true;
            this.elements.operatorInfo.style.display = 'block';
            this.elements.humanSupportBtn.style.display = 'none';  // دکمه ناپدید میشه
            this.addMessage('system', 'اپراتور انسانی متصل شد! حالا مستقیم با پشتیبان صحبت می‌کنید.');
        });

        this.state.socket.on('operator-message', (data) => {
            this.addMessage('operator', data.message || data);
        });
    }

    toggleChat() {
        this.state.isOpen = !this.state.isOpen;
        this.elements.chatWindow.classList.toggle('active', this.state.isOpen);
        if (this.state.isOpen) this.elements.messageInput.focus();
    }

    closeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
    }

    resizeTextarea() {
        const ta = this.elements.messageInput;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }

    // تابع اصلی ارسال پیام
    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message) return;

        this.addMessage('user', message);
        this.elements.messageInput.value = '';
        this.resizeTextarea();

        // اگر به اپراتور وصل باشه → فقط به سرور بفرست (هوش مصنوعی دیگه جواب نمیده)
        if (this.state.operatorConnected) {
            await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId: this.state.sessionId })
            });
            return;
        }

        // در غیر اینصورت → هوش مصنوعی
        try {
            const res = await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId: this.state.sessionId })
            });
            const data = await res.json();

            if (data.success) {
                this.addMessage('assistant', data.message);
            }
            if (data.requiresHuman) {
                this.elements.humanSupportBtn.textContent = 'اتصال به اپراتور (توصیه شده)';
                this.elements.humanSupportBtn.style.background = '#ff9500';
            }
        } catch {
            this.addMessage('system', 'خطا در ارتباط');
        }
    }

    async connectToHuman() {
        if (this.state.operatorConnected || this.state.isConnecting) return;
        this.state.isConnecting = true;
        this.elements.humanSupportBtn.disabled = true;
        this.elements.humanSupportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال اتصال...';

        try {
            await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.state.sessionId,
                    userInfo: { name: 'کاربر سایت', page: location.href }
                })
            });
            this.addMessage('system', 'درخواست شما ارسال شد. منتظر پذیرش اپراتور باشید...');
        } catch {
            this.addMessage('system', 'خطا در ارسال درخواست');
            this.elements.humanSupportBtn.innerHTML = '<i class="fas fa-user-headset"></i> اتصال به اپراتور انسانی';
            this.elements.humanSupportBtn.disabled = false;
        } finally {
            this.state.isConnecting = false;
        }
    }

    addMessage(type, text) {
        const el = document.createElement('div');
        el.className = `message ${type}`;
        const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        const icons = { user: 'fa-user', assistant: 'fa-robot', operator: 'fa-user-tie', system: 'fa-info-circle' };
        const names = { user: 'شما', assistant: 'هوش مصنوعی', operator: 'اپراتور', system: 'سیستم' };

        el.innerHTML = `
            <div class="message-sender"><i class="fas ${icons[type]}"></i> <span>${names[type]}</span></div>
            <div class="message-text">${this.escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;

        this.elements.messagesContainer.appendChild(el);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;

        if (!this.state.isOpen) {
            this.elements.notificationBadge.textContent = (parseInt(this.elements.notificationBadge.textContent) || 0) + 1;
            this.elements.notificationBadge.style.display = 'block';
        }
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
