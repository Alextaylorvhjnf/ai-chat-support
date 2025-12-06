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
            fileInput: null,
            isRecording: false,
            mediaRecorder: null,
            audioChunks: []
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
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.18); }
                100% { transform: scale(1); }
            }
            
            @keyframes recording {
                0% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(231, 76, 60, 0); }
                100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
            }
            
            .chat-toggle-btn.pulse {
                animation: pulse 0.6s ease-in-out;
            }
            
            .notification-badge {
                position: absolute;
                top: -8px;
                right: -8px;
                background: #e74c3c;
                color: white;
                font-size: 11px;
                font-weight: bold;
                min-width: 18px;
                height: 18px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            
            .chat-tools {
                display: flex;
                gap: 8px;
                margin-bottom: 10px;
                opacity: 0;
                transform: translateY(10px);
                transition: all 0.3s ease;
            }
            
            .chat-tools.active {
                opacity: 1;
                transform: translateY(0);
            }
            
            .tool-btn {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 8px 15px;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                font-size: 13px;
                color: #495057;
                transition: all 0.2s;
            }
            
            .tool-btn:hover {
                background: #e9ecef;
                transform: translateY(-2px);
            }
            
            .tool-btn.recording {
                background: #ffeaea;
                border-color: #e74c3c;
                color: #e74c3c;
                animation: recording 1.5s infinite;
            }
            
            .file-input {
                display: none;
            }
            
            .upload-progress {
                background: #e9ecef;
                border-radius: 4px;
                height: 4px;
                margin-top: 5px;
                overflow: hidden;
                display: none;
            }
            
            .upload-progress.active {
                display: block;
            }
            
            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #4dabf7, #339af0);
                width: 0%;
                transition: width 0.3s;
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
                <span class="notification-badge" style="display: none">0</span>
            </button>
            
            <div class="chat-window">
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo"><i class=""></i></div>
                        <div class="chat-title">
                            <h3>پشتیبان هوشمند</h3>
                            <p>پاسخگوی سوالات شما</p>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="chat-status">
                            <span class="status-dot"></span>
                            <span>آنلاین</span>
                        </div>
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
                
                <div class="connection-status">
                    <div class="status-message">
                        <i class="fas fa-wifi"></i>
                        <span>در حال اتصال...</span>
                    </div>
                </div>
                
                <div class="typing-indicator">
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <span>در حال تایپ...</span>
                </div>
                
                <div class="operator-info">
                    <div class="operator-card">
                        <div class="operator-avatar"><i class="fas fa-user-tie"></i></div>
                        <div class="operator-details">
                            <h4><i class="fas fa-shield-alt"></i> اپراتور انسانی</h4>
                            <p>در حال حاضر با پشتیبان انسانی در ارتباط هستید</p>
                        </div>
                    </div>
                </div>
                
                <!-- این بخش جدید اضافه شده -->
                <div class="chat-tools">
                    <button class="tool-btn file-btn" title="ارسال فایل">
                        <i class="fas fa-paperclip"></i>
                        <span>ارسال فایل</span>
                    </button>
                    <button class="tool-btn voice-btn" title="ضبط صوت">
                        <i class="fas fa-microphone"></i>
                        <span>ضبط صوت</span>
                    </button>
                    <input type="file" class="file-input" multiple>
                    <div class="upload-progress">
                        <div class="progress-bar"></div>
                    </div>
                </div>
                
                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <textarea class="message-input" placeholder="پیام خود را بنویسید..." rows="1"></textarea>
                        <button class="send-btn"><i class="fas fa-paper-plane"></i></button>
                    </div>
                    <button class="human-support-btn">
                        <i class="fas fa-user-headset"></i>
                        اتصال به اپراتور انسانی
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
            chatStatus: this.container.querySelector('.chat-status'),
            // عناصر جدید
            chatTools: this.container.querySelector('.chat-tools'),
            fileBtn: this.container.querySelector('.file-btn'),
            voiceBtn: this.container.querySelector('.voice-btn'),
            fileInput: this.container.querySelector('.file-input'),
            uploadProgress: this.container.querySelector('.upload-progress'),
            progressBar: this.container.querySelector('.progress-bar')
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
        
        // رویدادهای جدید برای فایل و ویس
        this.elements.fileBtn.addEventListener('click', () => this.triggerFileInput());
        this.elements.voiceBtn.addEventListener('mousedown', () => this.startRecording());
        this.elements.voiceBtn.addEventListener('mouseup', () => this.stopRecording());
        this.elements.voiceBtn.addEventListener('mouseleave', () => this.stopRecording());
        this.elements.voiceBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        this.elements.voiceBtn.addEventListener('touchend', () => this.stopRecording());
        
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && !this.elements.chatWindow.contains(e.target) && !this.elements.toggleBtn.contains(e.target)) {
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
                this.updateConnectionStatus(true);
                this.state.socket.emit('join-session', this.state.sessionId);
            });
            
            this.state.socket.on('operator-connected', (data) => {
                this.handleOperatorConnected(data);
            });
            
            this.state.socket.on('operator-message', (data) => {
                this.addMessage('operator', data.message);
            });
            
            // رویدادهای جدید برای فایل و ویس
            this.state.socket.on('file-sent', (data) => {
                this.addMessage('system', data.message || '✅ فایل با موفقیت ارسال شد!');
                this.hideUploadProgress();
            });
            
            this.state.socket.on('file-error', (data) => {
                this.addMessage('system', `❌ خطا در ارسال فایل: ${data.error || 'خطای ناشناخته'}`);
                this.hideUploadProgress();
            });
            
            this.state.socket.on('voice-sent', (data) => {
                this.addMessage('system', data.message || '✅ پیام صوتی ارسال شد!');
            });
            
            this.state.socket.on('voice-error', (data) => {
                this.addMessage('system', `❌ خطا در ارسال پیام صوتی: ${data.error || 'خطای ناشناخته'}`);
            });
            
            this.state.socket.on('connect_error', () => {
                this.updateConnectionStatus(false);
            });
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
        }
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.classList.remove('active');
            this.elements.chatStatus.innerHTML = `<span class="status-dot"></span><span>آنلاین</span>`;
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
            
            // بررسی و نمایش دکمه‌های ابزار
            this.updateToolButtons();
        }
    }

    closeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
    }

    updateToolButtons() {
        // فقط زمانی دکمه‌های فایل/ویس رو نشون بده که به اپراتور متصل شده باشی
        if (this.state.operatorConnected) {
            this.elements.chatTools.classList.add('active');
        } else {
            this.elements.chatTools.classList.remove('active');
        }
    }

    triggerFileInput() {
        if (!this.state.operatorConnected) {
            this.addMessage('system', '⚠️ ابتدا باید به اپراتور انسانی متصل باشید تا بتوانید فایل ارسال کنید.');
            return;
        }
        this.elements.fileInput.click();
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        if (!this.state.operatorConnected) {
            this.addMessage('system', '⚠️ ابتدا باید به اپراتور انسانی متصل باشید.');
            return;
        }
        
        for (let file of files) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                this.addMessage('system', `❌ فایل "${file.name}" بسیار بزرگ است (حداکثر 10 مگابایت)`);
                continue;
            }
            
            const reader = new FileReader();
            reader.onloadstart = () => this.showUploadProgress(file.name);
            
            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    this.updateUploadProgress(percent);
                }
            };
            
            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                
                this.addMessage('user', `📎 ارسال فایل: ${file.name} (${this.formatFileSize(file.size)})`);
                
                this.state.socket.emit('user-file', {
                    sessionId: this.state.sessionId,
                    fileName: file.name,
                    fileBase64: base64
                });
            };
            
            reader.onerror = () => {
                this.addMessage('system', `❌ خطا در خواندن فایل "${file.name}"`);
                this.hideUploadProgress();
            };
            
            reader.readAsDataURL(file);
        }
        
        // ریست کردن input
        event.target.value = '';
    }

    showUploadProgress(fileName) {
        this.elements.uploadProgress.classList.add('active');
        this.elements.progressBar.style.width = '0%';
    }

    updateUploadProgress(percent) {
        this.elements.progressBar.style.width = `${percent}%`;
    }

    hideUploadProgress() {
        this.elements.uploadProgress.classList.remove('active');
        setTimeout(() => {
            this.elements.progressBar.style.width = '0%';
        }, 300);
    }

    async startRecording() {
        if (!this.state.operatorConnected) {
            this.addMessage('system', '⚠️ ابتدا باید به اپراتور انسانی متصل باشید تا بتوانید پیام صوتی ارسال کنید.');
            return;
        }
        
        if (this.state.isRecording) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.state.mediaRecorder = new MediaRecorder(stream);
            this.state.audioChunks = [];
            
            this.state.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.state.audioChunks.push(event.data);
                }
            };
            
            this.state.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/webm' });
                
                if (audioBlob.size > 5 * 1024 * 1024) { // 5MB limit
                    this.addMessage('system', '❌ پیام صوتی بسیار بزرگ است (حداکثر 5 مگابایت)');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target.result.split(',')[1];
                    
                    this.addMessage('user', '🎤 ارسال پیام صوتی');
                    
                    this.state.socket.emit('user-voice', {
                        sessionId: this.state.sessionId,
                        voiceBase64: base64
                    });
                };
                
                reader.readAsDataURL(audioBlob);
                
                // قطع کردن stream
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.state.mediaRecorder.start();
            this.state.isRecording = true;
            this.elements.voiceBtn.classList.add('recording');
            this.elements.voiceBtn.innerHTML = '<i class="fas fa-stop-circle"></i><span>توقف ضبط</span>';
            
        } catch (error) {
            console.error('خطا در ضبط صدا:', error);
            this.addMessage('system', '❌ دسترسی به میکروفون امکان‌پذیر نیست. لطفاً مجوزها را بررسی کنید.');
        }
    }

    stopRecording() {
        if (!this.state.isRecording || !this.state.mediaRecorder) return;
        
        if (this.state.mediaRecorder.state !== 'inactive') {
            this.state.mediaRecorder.stop();
        }
        
        this.state.isRecording = false;
        this.elements.voiceBtn.classList.remove('recording');
        this.elements.voiceBtn.innerHTML = '<i class="fas fa-microphone"></i><span>ضبط صوت</span>';
    }

    resizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message || this.state.isTyping) return;
        
        this.addMessage('user', message);
        this.elements.messageInput.value = '';
        this.resizeTextarea();
        this.setTyping(true);
        
        try {
            if (this.state.operatorConnected) {
                this.state.socket.emit('user-message', {
                    sessionId: this.state.sessionId,
                    message: message
                });
                console.log('پیام به اپراتور انسانی ارسال شد');
            } else {
                await this.sendToAI(message);
            }
        } catch (error) {
            console.error('Send message error:', error);
            this.addMessage('system', 'خطا در ارسال پیام. لطفاً دوباره تلاش کنید.');
        } finally {
            this.setTyping(false);
        }
    }

    async sendToAI(message) {
        try {
            const response = await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId: this.state.sessionId })
            });
            
            const data = await response.json();
            if (data.success) {
                this.addMessage('assistant', data.message);
                
                if (data.connectedToHuman) {
                    this.state.operatorConnected = true;
                    this.elements.operatorInfo.classList.add('active');
                    this.updateToolButtons();
                }
            }
        } catch (error) {
            this.addMessage('system', 'خطا در ارتباط با سرور');
        }
    }

    async connectToHuman() {
        if (this.state.operatorConnected || this.state.isConnecting) return;
        
        this.state.isConnecting = true;
        this.elements.humanSupportBtn.disabled = true;
        this.elements.humanSupportBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> در حال اتصال...`;
        
        try {
            const userInfo = { 
                name: 'کاربر سایت', 
                page: location.href,
                browser: navigator.userAgent 
            };
            
            const res = await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.state.sessionId, userInfo })
            });
            
            const data = await res.json();
            if (data.success) {
                this.addMessage('system', '✅ درخواست شما برای اتصال به اپراتور ثبت شد. منتظر پذیرش باشید...');
                
                this.elements.humanSupportBtn.innerHTML = `<i class="fas fa-clock"></i> در انتظار پذیرش`;
                this.elements.humanSupportBtn.style.background = '#ff9500';
                
                // اینجا منتظر می‌مونیم تا اپراتور قبول کنه
                // در handleOperatorConnected وضعیت به روز می‌شه
            } else {
                this.resetHumanSupportButton();
                this.addMessage('system', '❌ خطا در اتصال به اپراتور');
            }
        } catch (err) {
            this.addMessage('system', 'خطا در اتصال به سرور');
            this.resetHumanSupportButton();
        } finally {
            this.state.isConnecting = false;
        }
    }

    resetHumanSupportButton() {
        this.elements.humanSupportBtn.innerHTML = `<i class="fas fa-user-headset"></i> اتصال به اپراتور انسانی`;
        this.elements.humanSupportBtn.style.background = '#ff6b6b';
        this.elements.humanSupportBtn.disabled = false;
    }

    handleOperatorConnected(data) {
        this.state.operatorConnected = true;
        this.elements.operatorInfo.classList.add('active');
        this.updateToolButtons(); // این خط رو اضافه کردیم
        
        // به روز رسانی دکمه
        this.elements.humanSupportBtn.innerHTML = `<i class="fas fa-user-check"></i> متصل به اپراتور`;
        this.elements.humanSupportBtn.style.background = 'linear-gradient(145deg, #2ecc71, #27ae60)';
        this.elements.humanSupportBtn.disabled = true;
        
        this.addMessage('system', data.message || '🎉 اپراتور انسانی متصل شد! حالا می‌توانید فایل و پیام صوتی نیز ارسال کنید.');
    }

    // سایر متدها (همان قبلی) ...
    playNotificationSound() {
        // کد قبلی
    }

    showNotification(count = 1) {
        // کد قبلی
    }

    resetNotification() {
        // کد قبلی
    }

    startTabNotification() {
        // کد قبلی
    }

    stopTabNotification() {
        // کد قبلی
    }

    addMessage(type, text) {
        // کد قبلی (با کمی تغییر برای پیام‌های فایل)
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        
        let icon = '', sender = '';
        if (type === 'user') { icon = '<i class="fas fa-user"></i>'; sender = 'شما'; }
        if (type === 'assistant') { icon = '<i class="fas fa-robot"></i>'; sender = 'پشتیبان هوشمند'; }
        if (type === 'operator') { icon = '<i class="fas fa-user-tie"></i>'; sender = 'اپراتور انسانی'; }
        if (type === 'system') { icon = '<i class="fas fa-info-circle"></i>'; sender = 'سیستم'; }
        
        messageEl.innerHTML = `
            ${icon ? `<div class="message-sender">${icon}<span>${sender}</span></div>` : ''}
            <div class="message-text">${this.escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        this.elements.messagesContainer.appendChild(messageEl);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        
        this.state.messages.push({ type, text, time });
        
        if (type === 'operator' || type === 'assistant' || type === 'system') {
            this.playNotificationSound();
            if (!this.state.isOpen) this.showNotification();
            if (document.hidden) this.startTabNotification();
        }
    }

    setTyping(typing) {
        this.state.isTyping = typing;
        this.elements.typingIndicator.classList.toggle('active', typing);
        this.elements.sendBtn.disabled = typing;
        this.elements.messageInput.disabled = typing;
        if (!typing) this.elements.messageInput.focus();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 بایت';
        const k = 1024;
        const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// راه‌اندازی خودکار
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ChatWidget = new ChatWidget());
} else {
    window.ChatWidget = new ChatWidget();
}

window.initChatWidget = (options) => new ChatWidget(options);
