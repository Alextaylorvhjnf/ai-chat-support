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

        this.tabNotificationInterval = null;
        this.originalTitle = document.title;
        this.tabNotifyText = 'پیام جدید از پشتیبانی';

        this.init();
    }

    init() {
        this.state.sessionId = this.generateSessionId();
        this.injectStyles();
        this.injectHTML();
        this.initElements();
        this.initEvents();
        this.connectWebSocket();

        // ویجت همیشه نمایش داده میشه حتی اگر سوکت خطا بده
        this.elements.toggleBtn.style.display = 'flex';
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
        const style = document.createElement('style');
        style.textContent = `
            .chat-widget {
                position: fixed;
                ${this.options.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
                ${this.options.position.includes('left') ? 'left: 20px;' : 'right: 20px;'}
                z-index: 9999;
                font-family: Vazir, Tahoma, sans-serif;
            }
            .chat-toggle-btn {
                width: 60px;
                height: 60px;
                background: #3498db;
                color: white;
                border-radius: 50%;
                border: none;
                font-size: 28px;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }
            .notification-badge {
                position: absolute;
                top: -8px;
                right: -8px;
                background: #e74c3c;
                color: white;
                font-size: 12px;
                font-weight: bold;
                min-width: 22px;
                height: 22px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.4);
            }
            .chat-window {
                width: 380px;
                height: 550px;
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                display: none;
                flex-direction: column;
                overflow: hidden;
            }
            .chat-window.active { display: flex; }
            .chat-header {
                background: linear-gradient(135deg, #3498db, #2980b9);
                color: white;
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .chat-messages {
                flex: 1;
                padding: 15px;
                overflow-y: auto;
                background: #f8f9fa;
            }
            .message {
                margin-bottom: 15px;
                max-width: 80%;
            }
            .message.user {
                margin-left: auto;
            }
            .message-text {
                background: #3498db;
                color: white;
                padding: 12px 16px;
                border-radius: 18px;
                border-bottom-right-radius: 4px;
            }
            .message.user .message-text {
                background: #e3f2fd;
                color: #000;
                border-bottom-right-radius: 18px;
                border-bottom-left-radius: 4px;
            }
            .message-time {
                font-size: 11px;
                color: #999;
                text-align: right;
                margin-top: 5px;
            }
            .chat-input-area {
                padding: 15px;
                background: white;
                border-top: 1px solid #eee;
            }
            .input-wrapper {
                display: flex;
                align-items: center;
                background: #f1f3f4;
                border-radius: 25px;
                padding: 5px 10px;
            }
            .message-input {
                flex: 1;
                border: none;
                background: transparent;
                resize: none;
                outline: none;
                padding: 10px;
                font-size: 15px;
            }
            .send-btn {
                background: #3498db;
                color: white;
                border: none;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                cursor: pointer;
            }
            .human-support-btn {
                width: 100%;
                margin-top: 10px;
                background: #e74c3c;
                color: white;
                border: none;
                padding: 12px;
                border-radius: 25px;
                cursor: pointer;
                font-size: 15px;
            }
            .typing-indicator {
                display: none;
                padding: 10px;
                color: #999;
                font-size: 14px;
            }
            .typing-indicator.active { display: block; }
            .typing-dots span {
                display: inline-block;
                width: 8px;
                height: 8px;
                background: #999;
                border-radius: 50%;
                margin: 0 3px;
                animation: typing 1.4s infinite;
            }
            .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
            .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
            @keyframes typing {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-10px); }
            }
            .attach-btn, .voice-btn {
                background: transparent;
                border: none;
                font-size: 22px;
                cursor: pointer;
                padding: 8px;
                color: #666;
            }
            .voice-btn.recording {
                color: #e74c3c;
            }
        `;
        document.head.appendChild(style);
    }

    injectHTML() {
        this.container = document.createElement('div');
        this.container.className = 'chat-widget';
        this.container.innerHTML = `
            <button class="chat-toggle-btn">
                <i class="fas fa-comment-dots"></i>
                <span class="notification-badge" style="display: none;">0</span>
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
                        <button class="close-btn"><i class="fas fa-times"></i></button>
                    </div>
                </div>

                <div class="chat-messages">
                    <div class="message system">
                        <div class="message-text">
                            سلام! من دستیار هوشمند شما هستم. چطور می‌تونم کمکتون کنم؟
                        </div>
                        <div class="message-time">همین الان</div>
                    </div>
                </div>

                <div class="typing-indicator">
                    <div class="typing-dots"><span></span><span></span><span></span></div>
                    <span>در حال تایپ...</span>
                </div>

                <div class="operator-info" style="display: none;">
                    <div class="operator-card">
                        <div class="operator-avatar"><i class="fas fa-user-tie"></i></div>
                        <div class="operator-details">
                            <h4>اپراتور انسانی</h4>
                            <p>در حال حاضر با پشتیبان انسانی در ارتباط هستید</p>
                        </div>
                    </div>
                </div>

                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <textarea class="message-input" placeholder="پیام خود را بنویسید..." rows="1"></textarea>
                        <div class="input-buttons"></div>
                        <button class="send-btn"><i class="fas fa-paper-plane"></i></button>
                    </div>
                    <button class="human-support-btn">
                        <i class="fas fa-user-headset"></i> اتصال به اپراتور انسانی
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);
    }

    initElements() {
        this.elements = {
            toggleBtn: this.container.querySelector('.chat-toggle-btn'),
            chatWindow: this.container.querySelector('.chat-window'),
            closeBtn: this.container.querySelector('.close-btn'),
            messagesContainer: this.container.querySelector('.chat-messages'),
            messageInput: this.container.querySelector('.message-input'),
            sendBtn: this.container.querySelector('.send-btn'),
            humanSupportBtn: this.container.querySelector('.human-support-btn'),
            typingIndicator: this.container.querySelector('.typing-indicator'),
            operatorInfo: this.container.querySelector('.operator-info'),
            notificationBadge: this.container.querySelector('.notification-badge'),
            inputButtons: this.container.querySelector('.input-buttons')
        };
    }

    initEvents() {
        this.elements.toggleBtn.addEventListener('click', () => this.toggleChat());
        this.elements.closeBtn.addEventListener('click', () => this.closeChat());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.elements.messageInput.addEventListener('input', () => this.resizeTextarea());
        this.elements.humanSupportBtn.addEventListener('click', () => this.connectToHuman());

        // کلیک خارج از ویجت
        document.addEventListener('click', e => {
            if (this.state.isOpen && !this.container.contains(e.target)) {
                this.closeChat();
            }
        });
    }

    connectWebSocket() {
        try {
            const wsUrl = this.options.backendUrl.replace('http', 'ws');
            this.state.socket = io(wsUrl, { transports: ['websocket', 'polling'] });

            this.state.socket.on('connect', () => {
                this.state.isConnected = true;
                this.state.socket.emit('join-session', this.state.sessionId);
            });

            this.state.socket.on('operator-connected', () => {
                this.state.operatorConnected = true;
                this.elements.operatorInfo.style.display = 'block';
                this.addMessage('system', 'اپراتور انسانی متصل شد! حالا می‌تونید فایل و ویس هم بفرستید 😊');
                this.addFileAndVoiceInputs();
            });

            this.state.socket.on('operator-message', data => this.addMessage('operator', data.message));

        } catch (err) {
            console.log('سوکت خطا داد، ولی ویجت کار می‌کنه');
        }
    }

    addFileAndVoiceInputs() {
        if (this.elements.inputButtons.querySelector('.attach-btn')) return; // فقط یکبار اضافه بشه

        // فایل
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';
        this.elements.inputButtons.appendChild(fileInput);

        const fileBtn = document.createElement('button');
        fileBtn.innerHTML = '<i class="fas fa-paperclip"></i>';
        fileBtn.className = 'attach-btn';
        fileBtn.onclick = () => fileInput.click();
        this.elements.inputButtons.appendChild(fileBtn);

        fileInput.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const base64 = ev.target.result.split(',')[1];
                this.state.socket.emit('user-file', {
                    sessionId: this.state.sessionId,
                    fileName: file.name,
                    fileBase64: base64
                });
                this.addMessage('user', `فایل ارسال شد: ${file.name}`);
            };
            reader.readAsDataURL(file);
        };

        // ویس
        let recorder;
        const voiceBtn = document.createElement('button');
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        voiceBtn.className = 'voice-btn';
        this.elements.inputButtons.appendChild(voiceBtn);

        voiceBtn.onmousedown = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                recorder = new MediaRecorder(stream);
                const chunks = [];
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = ev => {
                        const base64 = ev.target.result.split(',')[1];
                        this.state.socket.emit('user-voice', {
                            sessionId: this.state.sessionId,
                            voiceBase64: base64
                        });
                        this.addMessage('user', 'ویس ارسال شد');
                    };
                    reader.readAsDataURL(blob);
                };
                recorder.start();
                voiceBtn.classList.add('recording');
            } catch (err) {
                this.addMessage('system', 'دسترسی به میکروفون داده نشد');
            }
        };

        voiceBtn.onmouseup = voiceBtn.onmouseleave = () => {
            if (recorder) recorder.stop();
            voiceBtn.classList.remove('recording');
        };
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
        const ta = this.elements.messageInput;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }

    async sendMessage() {
        const msg = this.elements.messageInput.value.trim();
        if (!msg || this.state.isTyping) return;

        this.addMessage('user', msg);
        this.elements.messageInput.value = '';
        this.resizeTextarea();
        this.setTyping(true);

        try {
            if (this.state.operatorConnected && this.state.socket) {
                this.state.socket.emit('user-message', { sessionId: this.state.sessionId, message: msg });
            } else {
                const res = await fetch(`${this.options.backendUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg, sessionId: this.state.sessionId })
                });
                const data = await res.json();
                if (data.success) this.addMessage('assistant', data.message);
            }
        } catch (err) {
            this.addMessage('system', 'خطا در ارسال پیام');
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
            const res = await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.state.sessionId, userInfo: { page: location.href } })
            });
            const data = await res.json();

            if (data.success) {
                this.addMessage('system', 'در حال اتصال به اپراتور انسانی...');
            }
        } catch (err) {
            this.elements.humanSupportBtn.innerHTML = '<i class="fas fa-user-headset"></i> اتصال به اپراتور انسانی';
            this.elements.humanSupportBtn.disabled = false;
        } finally {
            this.state.isConnecting = false;
        }
    }

    playNotificationSound() {
        const audio = new Audio('https://cdn.jsdelivr.net/gh/nokeedev/iphone-sms-tri-tone@master/tri-tone.mp3');
        audio.volume = 0.8;
        audio.play().catch(() => {});
    }

    showNotification() {
        let count = (parseInt(this.elements.notificationBadge.textContent) || 0) + 1;
        this.elements.notificationBadge.textContent = count > 99 ? '99+' : count;
        this.elements.notificationBadge.style.display = 'flex';
        this.elements.toggleBtn.classList.add('pulse');
        setTimeout(() => this.elements.toggleBtn.classList.remove('pulse'), 600);
    }

    resetNotification() {
        this.elements.notificationBadge.textContent = '0';
        this.elements.notificationBadge.style.display = 'none';
        if (this.tabNotificationInterval) {
            clearInterval(this.tabNotificationInterval);
            this.tabNotificationInterval = null;
            document.title = this.originalTitle;
        }
    }

    addMessage(type, text) {
        const el = document.createElement('div');
        el.className = `message ${type}`;

        const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

        let sender = '';
        if (type === 'user') sender = 'شما';
        if (type === 'assistant' || type === 'system') sender = 'پشتیبان هوشمند';
        if (type === 'operator') sender = 'اپراتور';

        el.innerHTML = `
            ${sender ? `<div class="message-sender"><span>${sender}</span></div>` : ''}
            <div class="message-text">${this.escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;

        this.elements.messagesContainer.appendChild(el);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;

        if (type !== 'user') {
            this.playNotificationSound();
            if (!this.state.isOpen) this.showNotification();
            if (document.hidden && type !== 'user') {
                if (!this.tabNotificationInterval) {
                    let toggle = false;
                    this.tabNotificationInterval = setInterval(() => {
                        document.title = toggle ? this.originalTitle : this.tabNotifyText;
                        toggle = !toggle;
                    }, 1500);
                }
            }
        }
    }

    setTyping(typing) {
        this.state.isTyping = typing;
        this.elements.typingIndicator.classList.toggle('active', typing);
        this.elements.sendBtn.disabled = typing;
        this.elements.messageInput.disabled = typing;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// راه‌اندازی خودکار — همیشه کار می‌کنه حتی اگر خطا بده
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new ChatWidget());
    } else {
        new ChatWidget();
    }
} catch (err) {
    console.log('ویجت لود شد ولی خطا داد:', err);
    // ویجت حتی با خطا هم نمایش داده میشه
    new ChatWidget();
}
