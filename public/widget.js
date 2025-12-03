/**
 * AI Chatbot Widget - Complete Version
 * Version: 3.0.0
 * Features:
 * - Real-time chat with AI
 * - Telegram human support
 * - WebSocket communication
 * - Session management
 * - Professional UI
 */

class ChatWidget {
    constructor(options = {}) {
        // Default configuration
        this.config = {
            backendUrl: options.backendUrl || window.location.origin,
            position: options.position || 'bottom-left',
            theme: options.theme || 'default',
            autoOpen: options.autoOpen || false,
            showNotification: options.showNotification !== false,
            sessionId: options.sessionId || null,
            userInfo: options.userInfo || {},
            ...options
        };

        // State management
        this.state = {
            isOpen: false,
            isConnected: false,
            isConnecting: false,
            operatorConnected: false,
            operatorTyping: false,
            sessionId: null,
            socket: null,
            messages: [],
            unreadCount: 0,
            aiTyping: false,
            humanTyping: false,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5
        };

        // DOM elements cache
        this.elements = {};

        // Initialize
        this.init();
    }

    // ==================== INITIALIZATION ====================
    
    init() {
        console.log('🚀 AI Chat Widget Initializing...');
        
        // Generate session ID
        this.state.sessionId = this.generateSessionId();
        
        // Inject HTML and CSS
        this.injectHTML();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Initialize WebSocket
        this.initWebSocket();
        
        // Load saved messages
        this.loadSavedSession();
        
        // Auto-open if configured
        if (this.config.autoOpen) {
            setTimeout(() => this.openChat(), 1000);
        }
        
        console.log('✅ Chat Widget initialized with session:', this.state.sessionId);
    }
    
    generateSessionId() {
        if (this.config.sessionId) return this.config.sessionId;
        
        // Try to get from localStorage
        let sessionId = localStorage.getItem('chat_session_id');
        
        if (!sessionId) {
            // Generate new session ID
            const timestamp = Date.now();
            const random = Math.random().toString(36).substr(2, 9);
            sessionId = `session_${timestamp}_${random}`;
            
            // Save to localStorage
            localStorage.setItem('chat_session_id', sessionId);
            localStorage.setItem('chat_session_created', new Date().toISOString());
        }
        
        return sessionId;
    }
    
    injectHTML() {
        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'chat-widget';
        this.container.id = 'chat-widget-container';
        
        // Widget HTML
        this.container.innerHTML = `
            <!-- Toggle Button -->
            <button class="chat-toggle-btn" id="chat-toggle">
                <i class="fas fa-comment-dots"></i>
                <span class="btn-text">پشتیبانی</span>
                <span class="notification-badge" id="notification-badge">0</span>
            </button>
            
            <!-- Chat Window -->
            <div class="chat-window" id="chat-window">
                <!-- Header -->
                <div class="chat-header">
                    <div class="header-left">
                        <div class="chat-logo">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="chat-title">
                            <h3>پشتیبان هوشمند</h3>
                            <p>پاسخگوی سوالات شما</p>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="chat-status" id="chat-status">
                            <span class="status-dot"></span>
                            <span>آنلاین</span>
                        </div>
                        <button class="close-btn" id="close-chat">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Messages Container -->
                <div class="chat-messages" id="chat-messages">
                    <!-- Welcome message will be added here -->
                </div>
                
                <!-- Connection Status -->
                <div class="connection-status" id="connection-status">
                    <div class="status-message">
                        <i class="fas fa-wifi"></i>
                        <span id="status-text">در حال اتصال...</span>
                    </div>
                </div>
                
                <!-- Typing Indicators -->
                <div class="typing-indicator" id="ai-typing">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span>پشتیبان هوشمند در حال تایپ...</span>
                </div>
                
                <div class="typing-indicator" id="human-typing">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span>اپراتور در حال تایپ...</span>
                </div>
                
                <!-- Operator Info -->
                <div class="operator-info" id="operator-info">
                    <div class="operator-card">
                        <div class="operator-avatar">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div class="operator-details">
                            <h4><i class="fas fa-shield-alt"></i> اپراتور انسانی</h4>
                            <p id="operator-status-text">در حال اتصال به اپراتور...</p>
                        </div>
                    </div>
                </div>
                
                <!-- Chat Input -->
                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <textarea 
                            class="message-input" 
                            id="message-input" 
                            placeholder="پیام خود را بنویسید..."
                            rows="1"
                            maxlength="1000"
                            aria-label="متن پیام"></textarea>
                        <button class="send-btn" id="send-button">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <button class="human-support-btn" id="human-support-btn">
                        <i class="fas fa-user-headset"></i>
                        <span id="human-btn-text">اتصال به اپراتور انسانی</span>
                    </button>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(this.container);
        
        // Cache DOM elements
        this.cacheElements();
        
        // Add welcome message
        this.addWelcomeMessage();
    }
    
    cacheElements() {
        this.elements = {
            toggleBtn: document.getElementById('chat-toggle'),
            chatWindow: document.getElementById('chat-window'),
            closeBtn: document.getElementById('close-chat'),
            messagesContainer: document.getElementById('chat-messages'),
            messageInput: document.getElementById('message-input'),
            sendBtn: document.getElementById('send-button'),
            humanSupportBtn: document.getElementById('human-support-btn'),
            aiTyping: document.getElementById('ai-typing'),
            humanTyping: document.getElementById('human-typing'),
            connectionStatus: document.getElementById('connection-status'),
            statusText: document.getElementById('status-text'),
            operatorInfo: document.getElementById('operator-info'),
            operatorStatusText: document.getElementById('operator-status-text'),
            notificationBadge: document.getElementById('notification-badge'),
            chatStatus: document.getElementById('chat-status'),
            humanBtnText: document.getElementById('human-btn-text')
        };
    }
    
    addWelcomeMessage() {
        const welcomeMessages = [
            "سلام! 👋 من پشتیبان هوشمند شما هستم. چطور می‌تونم کمکتون کنم؟",
            "درود! 🌟 خوش آمدید. من اینجام تا به سوالات شما پاسخ بدم.",
            "سلام عزیز! 😊 آماده‌ام تا شما رو راهنمایی کنم.",
            "به پشتیبانی هوشمند خوش اومدید! 🚀 چطور می‌تونم خدمتتون باشم؟"
        ];
        
        const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        
        this.addMessage('assistant', randomMessage, true);
    }
    
    // ==================== EVENT LISTENERS ====================
    
    initEventListeners() {
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
        this.elements.messageInput.addEventListener('input', () => this.resizeTextarea());
        
        // Human support
        this.elements.humanSupportBtn.addEventListener('click', () => this.connectToHuman());
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && 
                !this.elements.chatWindow.contains(e.target) && 
                !this.elements.toggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
        
        // Handle window focus/blur for notifications
        window.addEventListener('focus', () => this.resetNotificationBadge());
        window.addEventListener('blur', () => this.checkUnreadMessages());
    }
    
    // ==================== WEBSOCKET COMMUNICATION ====================
    
    initWebSocket() {
        try {
            const wsUrl = this.config.backendUrl.replace('http', 'ws');
            console.log('🔌 Connecting WebSocket to:', wsUrl);
            
            this.state.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: this.state.maxReconnectAttempts,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000
            });
            
            // Socket event listeners
            this.setupSocketListeners();
            
        } catch (error) {
            console.error('❌ WebSocket initialization failed:', error);
            this.showConnectionError('خطا در اتصال به سرور');
        }
    }
    
    setupSocketListeners() {
        const socket = this.state.socket;
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            this.state.isConnected = true;
            this.state.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            
            // Join session room
            socket.emit('join-session', this.state.sessionId);
        });
        
        socket.on('connect_error', (error) => {
            console.error('❌ WebSocket connection error:', error);
            this.state.isConnected = false;
            this.updateConnectionStatus(false, 'خطا در اتصال');
        });
        
        socket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', reason);
            this.state.isConnected = false;
            this.updateConnectionStatus(false, 'اتصال قطع شد');
            
            // Attempt reconnection
            if (this.state.reconnectAttempts < this.state.maxReconnectAttempts) {
                this.state.reconnectAttempts++;
                console.log(`🔄 Reconnection attempt ${this.state.reconnectAttempts}`);
            }
        });
        
        socket.on('reconnect', (attemptNumber) => {
            console.log(`✅ Reconnected after ${attemptNumber} attempts`);
            this.state.isConnected = true;
            this.updateConnectionStatus(true);
        });
        
        socket.on('reconnect_error', (error) => {
            console.error('❌ Reconnection error:', error);
        });
        
        socket.on('reconnect_failed', () => {
            console.error('❌ Reconnection failed');
            this.showConnectionError('اتصال ناموفق بود. لطفاً صفحه را رفرش کنید.');
        });
        
        // Application events
        socket.on('operator-connected', (data) => {
            this.handleOperatorConnected(data);
        });
        
        socket.on('operator-disconnected', (data) => {
            this.handleOperatorDisconnected(data);
        });
        
        socket.on('operator-message', (data) => {
            this.handleOperatorMessage(data);
        });
        
        socket.on('operator-typing', (data) => {
            this.handleOperatorTyping(data);
        });
        
        socket.on('operator-accepted', (data) => {
            this.handleOperatorAccepted(data);
        });
        
        socket.on('operator-rejected', (data) => {
            this.handleOperatorRejected(data);
        });
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.addMessage('system', `خطای سیستم: ${error.message}`);
        });
    }
    
    // ==================== MESSAGE HANDLING ====================
    
    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        
        if (!message || this.state.aiTyping) return;
        
        // Clear input
        this.elements.messageInput.value = '';
        this.resizeTextarea();
        
        // Add user message to UI
        this.addMessage('user', message);
        
        // Disable input during processing
        this.setInputState(false);
        
        try {
            if (this.state.operatorConnected) {
                // Send to human operator
                await this.sendToHumanOperator(message);
            } else {
                // Send to AI
                await this.sendToAI(message);
            }
        } catch (error) {
            console.error('Send message error:', error);
            this.addMessage('system', '❌ خطا در ارسال پیام. لطفاً دوباره تلاش کنید.');
        } finally {
            // Re-enable input
            this.setInputState(true);
        }
    }
    
    async sendToAI(message) {
        // Show typing indicator
        this.showTypingIndicator('ai');
        
        try {
            const response = await fetch(`${this.config.backendUrl}/api/chat`, {
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
            
            // Hide typing indicator
            this.hideTypingIndicator('ai');
            
            if (data.success) {
                this.addMessage('assistant', data.message);
                
                // If AI suggests human support
                if (data.requiresHuman) {
                    this.updateHumanSupportButton('پیشنهاد سیستم', '#ff9500');
                }
            } else {
                this.addMessage('system', data.message || 'خطا در دریافت پاسخ');
            }
            
        } catch (error) {
            console.error('AI request error:', error);
            this.hideTypingIndicator('ai');
            this.addMessage('system', '❌ خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.');
        }
    }
    
    async sendToHumanOperator(message) {
        try {
            const response = await fetch(`${this.config.backendUrl}/api/send-to-operator`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.state.sessionId,
                    message: message
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                this.addMessage('system', '❌ خطا در ارسال پیام به اپراتور');
            }
            
        } catch (error) {
            console.error('Send to operator error:', error);
            this.addMessage('system', '❌ خطا در ارتباط با اپراتور');
        }
    }
    
    async connectToHuman() {
        if (this.state.operatorConnected || this.state.isConnecting) return;
        
        this.state.isConnecting = true;
        this.setHumanSupportButtonState('loading', 'در حال اتصال...');
        
        try {
            const userInfo = {
                name: this.config.userInfo.name || 'کاربر سایت',
                email: this.config.userInfo.email || '',
                phone: this.config.userInfo.phone || '',
                page: window.location.href,
                referrer: document.referrer,
                userAgent: navigator.userAgent.substring(0, 100)
            };
            
            console.log('👤 Requesting human connection...');
            
            const response = await fetch(`${this.config.backendUrl}/api/connect-human`, {
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
            console.log('Connect response:', data);
            
            if (data.success) {
                this.state.operatorConnected = true;
                this.showOperatorInfo();
                this.addMessage('system', data.message);
                
                this.setHumanSupportButtonState('connected', 'متصل به اپراتور');
                
                console.log('✅ Connected to human operator');
                
            } else {
                this.addMessage('system', `❌ ${data.error || 'خطا در اتصال به اپراتور'}`);
                
                if (data.details) {
                    console.error('Connection error details:', data.details);
                }
                
                this.resetHumanSupportButton();
            }
            
        } catch (error) {
            console.error('❌ Connect to human error:', error);
            this.addMessage('system', '❌ خطا در ارتباط با سرور');
            this.resetHumanSupportButton();
            
        } finally {
            this.state.isConnecting = false;
        }
    }
    
    // ==================== OPERATOR EVENT HANDLERS ====================
    
    handleOperatorConnected(data) {
        this.state.operatorConnected = true;
        this.showOperatorInfo();
        this.addMessage('operator', data.message);
        this.setHumanSupportButtonState('connected', 'متصل به اپراتور');
        this.showNotification('اپراتور انسانی متصل شد');
    }
    
    handleOperatorDisconnected(data) {
        this.state.operatorConnected = false;
        this.hideOperatorInfo();
        this.addMessage('system', data.message);
        this.resetHumanSupportButton();
        this.showNotification('اپراتور از گفتگو خارج شد');
    }
    
    handleOperatorMessage(data) {
        this.addMessage('operator', data.message);
        this.showNotification('پیام جدید از اپراتور');
    }
    
    handleOperatorTyping(data) {
        if (data.typing) {
            this.showTypingIndicator('human');
        } else {
            this.hideTypingIndicator('human');
        }
    }
    
    handleOperatorAccepted(data) {
        this.state.operatorConnected = true;
        this.showOperatorInfo();
        this.addMessage('system', data.message);
        this.setHumanSupportButtonState('connected', 'متصل به اپراتور');
        this.updateOperatorStatus('آنلاین و آماده پاسخگویی');
        this.showNotification('اپراتور درخواست شما را پذیرفت');
    }
    
    handleOperatorRejected(data) {
        this.state.operatorConnected = false;
        this.hideOperatorInfo();
        this.addMessage('system', data.message);
        this.resetHumanSupportButton();
        this.showNotification('اپراتور درخواست را رد کرد');
    }
    
    // ==================== UI METHODS ====================
    
    toggleChat() {
        this.state.isOpen = !this.state.isOpen;
        
        if (this.state.isOpen) {
            this.openChat();
        } else {
            this.closeChat();
        }
    }
    
    openChat() {
        this.elements.chatWindow.classList.add('active');
        this.elements.toggleBtn.style.opacity = '0.7';
        this.state.isOpen = true;
        
        // Focus input
        setTimeout(() => {
            this.elements.messageInput.focus();
        }, 300);
        
        // Reset notification badge
        this.resetNotificationBadge();
        
        // Mark messages as read
        this.markMessagesAsRead();
    }
    
    closeChat() {
        this.elements.chatWindow.classList.remove('active');
        this.elements.toggleBtn.style.opacity = '1';
        this.state.isOpen = false;
    }
    
    addMessage(type, text, isWelcome = false) {
        const message = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            type: type,
            text: text,
            timestamp: new Date(),
            read: this.state.isOpen
        };
        
        // Add to state
        this.state.messages.push(message);
        
        // Create message element
        const messageEl = this.createMessageElement(type, text);
        
        // Add to container
        this.elements.messagesContainer.appendChild(messageEl);
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Save to localStorage
        this.saveMessage(message);
        
        // Update unread count if chat is closed
        if (!this.state.isOpen && !isWelcome) {
            this.state.unreadCount++;
            this.updateNotificationBadge();
            
            // Show desktop notification
            if (this.config.showNotification && document.hidden) {
                this.showDesktopNotification(type, text);
            }
        }
        
        // Add animation
        setTimeout(() => {
            messageEl.classList.add('new-message');
        }, 10);
    }
    
    createMessageElement(type, text) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        
        const time = new Date().toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let senderIcon, senderText;
        
        switch(type) {
            case 'user':
                senderIcon = '<i class="fas fa-user"></i>';
                senderText = 'شما';
                break;
            case 'assistant':
                senderIcon = '<i class="fas fa-robot"></i>';
                senderText = 'پشتیبان هوشمند';
                break;
            case 'operator':
                senderIcon = '<i class="fas fa-user-tie"></i>';
                senderText = 'اپراتور انسانی';
                break;
            case 'system':
                senderIcon = '<i class="fas fa-info-circle"></i>';
                senderText = 'سیستم';
                break;
        }
        
        messageEl.innerHTML = `
            ${type !== 'system' ? `
            <div class="message-sender">
                ${senderIcon}
                <span>${senderText}</span>
            </div>
            ` : ''}
            <div class="message-text">${this.escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        return messageEl;
    }
    
    showTypingIndicator(type) {
        if (type === 'ai') {
            this.state.aiTyping = true;
            this.elements.aiTyping.classList.add('active');
        } else if (type === 'human') {
            this.state.humanTyping = true;
            this.elements.humanTyping.classList.add('active');
        }
        this.scrollToBottom();
    }
    
    hideTypingIndicator(type) {
        if (type === 'ai') {
            this.state.aiTyping = false;
            this.elements.aiTyping.classList.remove('active');
        } else if (type === 'human') {
            this.state.humanTyping = false;
            this.elements.humanTyping.classList.remove('active');
        }
    }
    
    showOperatorInfo() {
        this.elements.operatorInfo.classList.add('active');
        this.elements.operatorStatusText.textContent = 'در حال گفتگو با اپراتور انسانی';
    }
    
    hideOperatorInfo() {
        this.elements.operatorInfo.classList.remove('active');
    }
    
    updateOperatorStatus(text) {
        this.elements.operatorStatusText.textContent = text;
    }
    
    // ==================== UTILITY METHODS ====================
    
    resizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
    
    setInputState(enabled) {
        this.elements.messageInput.disabled = !enabled;
        this.elements.sendBtn.disabled = !enabled;
        
        if (enabled) {
            setTimeout(() => {
                this.elements.messageInput.focus();
            }, 100);
        }
    }
    
    updateConnectionStatus(connected, message = null) {
        if (connected) {
            this.elements.connectionStatus.classList.remove('active');
            this.elements.chatStatus.innerHTML = `
                <span class="status-dot"></span>
                <span>آنلاین</span>
            `;
        } else {
            this.elements.connectionStatus.classList.add('active');
            if (message) {
                this.elements.statusText.textContent = message;
            }
        }
    }
    
    showConnectionError(message) {
        this.addMessage('system', `❌ ${message}`);
        this.updateConnectionStatus(false, message);
    }
    
    updateNotificationBadge() {
        if (this.state.unreadCount > 0) {
            this.elements.notificationBadge.textContent = this.state.unreadCount;
            this.elements.notificationBadge.style.display = 'flex';
            
            // Animate badge
            this.elements.notificationBadge.style.animation = 'none';
            setTimeout(() => {
                this.elements.notificationBadge.style.animation = 'badgePulse 2s infinite';
            }, 10);
        } else {
            this.elements.notificationBadge.style.display = 'none';
        }
    }
    
    resetNotificationBadge() {
        this.state.unreadCount = 0;
        this.updateNotificationBadge();
    }
    
    markMessagesAsRead() {
        this.state.messages.forEach(msg => msg.read = true);
        this.resetNotificationBadge();
    }
    
    setHumanSupportButtonState(state, text = null) {
        const btn = this.elements.humanSupportBtn;
        
        switch(state) {
            case 'loading':
                btn.innerHTML = '<div class="loading-spinner"></div>در حال اتصال...';
                btn.disabled = true;
                break;
                
            case 'connected':
                btn.innerHTML = '<i class="fas fa-user-check"></i>متصل به اپراتور';
                btn.style.background = 'linear-gradient(145deg, #2ecc71, #27ae60)';
                btn.disabled = true;
                break;
                
            case 'default':
                this.resetHumanSupportButton();
                break;
        }
        
        if (text && this.elements.humanBtnText) {
            this.elements.humanBtnText.textContent = text;
        }
    }
    
    resetHumanSupportButton() {
        const btn = this.elements.humanSupportBtn;
        btn.innerHTML = '<i class="fas fa-user-headset"></i><span id="human-btn-text">اتصال به اپراتور انسانی</span>';
        btn.style.background = '';
        btn.disabled = false;
    }
    
    updateHumanSupportButton(text, color = '') {
        if (this.elements.humanBtnText) {
            this.elements.humanBtnText.textContent = text;
        }
        if (color) {
            this.elements.humanSupportBtn.style.background = color;
        }
    }
    
    showNotification(message) {
        // Update badge
        if (!this.state.isOpen) {
            this.state.unreadCount++;
            this.updateNotificationBadge();
        }
        
        // Browser notification
        if (this.config.showNotification && document.hidden && Notification.permission === 'granted') {
            new Notification('پشتیبان هوشمند', {
                body: message,
                icon: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
                tag: 'chat-notification'
            });
        }
    }
    
    showDesktopNotification(type, message) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    this.createNotification(type, message);
                }
            });
        } else if (Notification.permission === 'granted') {
            this.createNotification(type, message);
        }
    }
    
    createNotification(type, message) {
        let title = 'پشتیبان هوشمند';
        
        if (type === 'operator') title = '📩 پیام از اپراتور';
        else if (type === 'assistant') title = '🤖 پاسخ پشتیبان';
        
        new Notification(title, {
            body: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
            icon: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
            tag: 'chat-message'
        });
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 100);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ==================== SESSION MANAGEMENT ====================
    
    saveMessage(message) {
        try {
            const savedMessages = JSON.parse(localStorage.getItem('chat_messages') || '[]');
            savedMessages.push({
                type: message.type,
                text: message.text,
                timestamp: message.timestamp.toISOString()
            });
            
            // Keep only last 100 messages
            if (savedMessages.length > 100) {
                savedMessages.splice(0, savedMessages.length - 100);
            }
            
            localStorage.setItem('chat_messages', JSON.stringify(savedMessages));
        } catch (error) {
            console.error('Error saving message:', error);
        }
    }
    
    loadSavedSession() {
        try {
            // Load messages
            const savedMessages = JSON.parse(localStorage.getItem('chat_messages') || '[]');
            
            // Load operator status
            const operatorConnected = localStorage.getItem('chat_operator_connected') === 'true';
            if (operatorConnected) {
                this.state.operatorConnected = true;
                this.showOperatorInfo();
                this.setHumanSupportButtonState('connected', 'متصل به اپراتور');
            }
            
            // Add saved messages (skip if too many)
            if (savedMessages.length > 0 && savedMessages.length < 50) {
                savedMessages.forEach(msg => {
                    this.addMessage(msg.type, msg.text, true);
                });
            }
            
        } catch (error) {
            console.error('Error loading session:', error);
            localStorage.removeItem('chat_messages');
            localStorage.removeItem('chat_operator_connected');
        }
    }
    
    checkUnreadMessages() {
        // This method can be used to check for new messages when window regains focus
        // Currently handled by window focus event
    }
    
    // ==================== PUBLIC METHODS ====================
    
    open() {
        this.openChat();
    }
    
    close() {
        this.closeChat();
    }
    
    send(text) {
        if (text && typeof text === 'string') {
            this.elements.messageInput.value = text;
            this.sendMessage();
        }
    }
    
    clear() {
        this.state.messages = [];
        this.elements.messagesContainer.innerHTML = '';
        localStorage.removeItem('chat_messages');
        this.addWelcomeMessage();
    }
    
    destroy() {
        // Cleanup
        if (this.state.socket) {
            this.state.socket.disconnect();
        }
        
        // Remove from DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // Remove event listeners
        document.removeEventListener('click', this.boundOutsideClickHandler);
        window.removeEventListener('focus', this.boundFocusHandler);
        window.removeEventListener('blur', this.boundBlurHandler);
        
        console.log('🗑️ Chat Widget destroyed');
    }
    
    getState() {
        return {
            isOpen: this.state.isOpen,
            isConnected: this.state.isConnected,
            operatorConnected: this.state.operatorConnected,
            sessionId: this.state.sessionId,
            messageCount: this.state.messages.length,
            unreadCount: this.state.unreadCount
        };
    }
    
    getMessages() {
        return [...this.state.messages];
    }
}

// ==================== GLOBAL INITIALIZATION ====================

// Wait for DOM and dependencies to be ready
function initializeChatWidget(options = {}) {
    // Wait for Socket.io if not loaded
    if (typeof io === 'undefined') {
        console.warn('Socket.io not loaded yet, waiting...');
        
        // Load Socket.io
        const socketScript = document.createElement('script');
        socketScript.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
        socketScript.async = true;
        socketScript.crossOrigin = 'anonymous';
        
        socketScript.onload = () => {
            console.log('✅ Socket.io loaded, initializing widget...');
            window.ChatWidgetInstance = new ChatWidget(options);
        };
        
        socketScript.onerror = () => {
            console.error('❌ Failed to load Socket.io');
            // Initialize without Socket.io (limited functionality)
            window.ChatWidgetInstance = new ChatWidget(options);
        };
        
        document.head.appendChild(socketScript);
        
    } else {
        // Socket.io already loaded
        window.ChatWidgetInstance = new ChatWidget(options);
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Check if auto-init is requested via data attributes
        const scriptTag = document.querySelector('script[data-chatbot-init]');
        if (scriptTag) {
            const backendUrl = scriptTag.getAttribute('data-backend-url');
            const position = scriptTag.getAttribute('data-position');
            const autoOpen = scriptTag.getAttribute('data-auto-open') === 'true';
            
            initializeChatWidget({
                backendUrl: backendUrl,
                position: position,
                autoOpen: autoOpen
            });
        }
    });
} else {
    // DOM already loaded
    const scriptTag = document.querySelector('script[data-chatbot-init]');
    if (scriptTag) {
        const backendUrl = scriptTag.getAttribute('data-backend-url');
        const position = scriptTag.getAttribute('data-position');
        const autoOpen = scriptTag.getAttribute('data-auto-open') === 'true';
        
        initializeChatWidget({
            backendUrl: backendUrl,
            position: position,
            autoOpen: autoOpen
        });
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChatWidget, initializeChatWidget };
}

// Global access
window.ChatWidget = ChatWidget;
window.initChatWidget = initializeChatWidget;
window.destroyChatWidget = function() {
    if (window.ChatWidgetInstance) {
        window.ChatWidgetInstance.destroy();
        window.ChatWidgetInstance = null;
    }
};

// Request notification permission on user interaction
document.addEventListener('click', function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    document.removeEventListener('click', requestNotificationPermission);
});

console.log('🤖 AI Chat Widget script loaded successfully');
