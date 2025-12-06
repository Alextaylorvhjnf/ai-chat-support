class ChatWidget {
    constructor(options = {}) {
        this.options = {
            backendUrl: options.backendUrl || window.location.origin,
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
            audioChunks: [],
            recordingTime: 0,
            showEmojiPicker: false
        };
        
        this.init();
    }

    init() {
        this.state.sessionId = this.generateSessionId();
        this.injectHTML();
        this.initEvents();
        this.connectWebSocket();
    }

    generateSessionId() {
        let sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_session_id', sessionId);
        }
        return sessionId;
    }

    injectHTML() {
        this.container = document.createElement('div');
        this.container.className = 'chat-widget';
        this.container.innerHTML = `
            <button class="chat-toggle-btn">
                <i class="fas fa-paper-plane"></i>
                <span class="notification-badge" style="display: none">0</span>
            </button>
            
            <div class="chat-window">
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo">C</div>
                        <div class="chat-title">
                            <h3>چت پشتیبانی</h3>
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
                
                <div class="chat-messages"></div>
                
                <div class="chat-tools">
                    <button class="tool-btn file-btn">
                        <i class="fas fa-image"></i>
                        <span>عکس/ویدیو</span>
                    </button>
                    <button class="tool-btn voice-btn">
                        <i class="fas fa-microphone"></i>
                        <span>ویس</span>
                    </button>
                    <input type="file" class="file-input" accept="image/*,video/*,.pdf,.doc,.docx" multiple>
                </div>
                
                <div class="upload-progress">
                    <div class="progress-bar"></div>
                </div>
                
                <div class="file-preview">
                    <div class="preview-content">
                        <div class="file-icon"><i class="fas fa-file"></i></div>
                        <div class="file-info">
                            <div class="file-name">نام فایل</div>
                            <div class="file-size">0 KB</div>
                        </div>
                        <button class="cancel-upload"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                
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
                
                <div class="typing-indicator">
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <span>در حال تایپ...</span>
                </div>
                
                <div class="connection-status">
                    <div class="status-message">
                        <i class="fas fa-wifi"></i>
                        <span>در حال اتصال...</span>
                    </div>
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
                
                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <textarea class="message-input" placeholder="پیام..." rows="1"></textarea>
                        <button class="send-btn"><i class="fas fa-paper-plane"></i></button>
                    </div>
                    <button class="human-support-btn">
                        <i class="fas fa-user-headset"></i>
                        درخواست پشتیبان انسانی
                    </button>
                </div>
                
                <div class="emoji-picker"></div>
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
            chatTools: this.container.querySelector('.chat-tools'),
            fileBtn: this.container.querySelector('.file-btn'),
            voiceBtn: this.container.querySelector('.voice-btn'),
            fileInput: this.container.querySelector('.file-input'),
            uploadProgress: this.container.querySelector('.upload-progress'),
            progressBar: this.container.querySelector('.progress-bar'),
            filePreview: this.container.querySelector('.file-preview'),
            voicePreview: this.container.querySelector('.voice-preview'),
            cancelUpload: this.container.querySelector('.cancel-upload'),
            emojiPicker: this.container.querySelector('.emoji-picker')
        };
        
        this.initEmojiPicker();
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
        
        this.elements.messageInput.addEventListener('input', () => {
            this.resizeTextarea();
            this.showTypingIndicator();
        });
        
        this.elements.messageInput.addEventListener('focus', () => {
            this.hideEmojiPicker();
        });
        
        this.elements.humanSupportBtn.addEventListener('click', () => this.connectToHuman());
        
        // File upload events
        this.elements.fileBtn.addEventListener('click', () => this.triggerFileInput());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.elements.cancelUpload.addEventListener('click', () => this.cancelFileUpload());
        
        // Voice recording events
        this.elements.voiceBtn.addEventListener('mousedown', () => this.startRecording());
        this.elements.voiceBtn.addEventListener('mouseup', () => this.stopRecording());
        this.elements.voiceBtn.addEventListener('mouseleave', () => this.stopRecording());
        
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && !this.elements.chatWindow.contains(e.target) && !this.elements.toggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
        
        // Add welcome message
        this.addMessage('assistant', '👋 سلام! من دستیار هوشمند شما هستم. چطور می‌تونم کمکتون کنم؟');
    }

    initEmojiPicker() {
        const emojis = ['😀', '😂', '🥰', '😎', '🤩', '😍', '👍', '👏', '🎉', '💯', '❤️', '🔥', '✨', '🌟', '💪'];
        this.elements.emojiPicker.innerHTML = '';
        
        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'emoji-btn';
            btn.textContent = emoji;
            btn.addEventListener('click', () => this.addEmoji(emoji));
            this.elements.emojiPicker.appendChild(btn);
        });
    }

    addEmoji(emoji) {
        const input = this.elements.messageInput;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        
        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
        this.resizeTextarea();
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

    showTypingIndicator() {
        // Show typing indicator after 500ms of inactivity
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            if (this.elements.messageInput.value.trim() && !this.state.isTyping) {
                // Send typing indicator to server
                if (this.state.socket && this.state.operatorConnected) {
                    this.state.socket.emit('typing', {
                        sessionId: this.state.sessionId,
                        isTyping: true
                    });
                }
            }
        }, 500);
    }

    showEmojiPicker() {
        this.elements.emojiPicker.classList.add('active');
        this.state.showEmojiPicker = true;
    }

    hideEmojiPicker() {
        this.elements.emojiPicker.classList.remove('active');
        this.state.showEmojiPicker = false;
    }

    // بقیه متدها مانند connectWebSocket، sendMessage، handleOperatorConnected و...
    // مانند کد قبلی باقی می‌مانند (با کمی تغییر برای قابلیت‌های جدید)

    triggerFileInput() {
        if (!this.state.operatorConnected) {
            this.showNotification('برای ارسال فایل باید به اپراتور متصل باشید');
            return;
        }
        this.elements.fileInput.click();
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        const file = files[0];
        
        // Show preview
        this.elements.filePreview.classList.add('active');
        this.elements.filePreview.querySelector('.file-name').textContent = file.name;
        this.elements.filePreview.querySelector('.file-size').textContent = this.formatFileSize(file.size);
        
        // Upload logic here...
    }

    cancelFileUpload() {
        this.elements.fileInput.value = '';
        this.elements.filePreview.classList.remove('active');
        this.hideUploadProgress();
    }

    startRecording() {
        if (!this.state.operatorConnected) {
            this.showNotification('برای ارسال ویس باید به اپراتور متصل باشید');
            return;
        }
        
        // Recording logic...
        this.elements.voicePreview.classList.add('active');
        this.elements.voiceBtn.classList.add('recording');
        this.state.isRecording = true;
    }

    stopRecording() {
        if (!this.state.isRecording) return;
        
        this.elements.voicePreview.classList.remove('active');
        this.elements.voiceBtn.classList.remove('recording');
        this.state.isRecording = false;
    }

    // Helper methods...
    formatFileSize(bytes) {
        if (bytes === 0) return '0 بایت';
        const k = 1024;
        const sizes = ['بایت', 'کیلوبایت', 'مگابایت'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    showNotification(text) {
        this.addMessage('system', text);
    }
}

// Initialize widget
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ChatWidget = new ChatWidget());
} else {
    window.ChatWidget = new ChatWidget();
}
