// AI Chatbot Widget - Version 1.0
class ChatbotWidget {
    constructor(config = {}) {
        this.config = {
            serverUrl: config.serverUrl || window.location.origin.replace('http', 'ws'),
            sessionId: this.getSessionId(),
            autoOpen: config.autoOpen !== false,
            soundEnabled: config.soundEnabled !== false,
            ...config
        };
        
        this.state = {
            isOpen: false,
            isConnected: false,
            isTyping: false,
            mode: 'ai', // 'ai' or 'human'
            socket: null,
            sessionId: this.config.sessionId,
            messages: [],
            reconnectAttempts: 0,
            maxReconnectAttempts: 5
        };
        
        this.elements = {};
        this.sounds = {};
        
        this.init();
    }
    
    // Generate or retrieve session ID
    getSessionId() {
        let sessionId = localStorage.getItem('chatbot_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chatbot_session_id', sessionId);
        }
        return sessionId;
    }
    
    // Initialize widget
    init() {
        this.createElements();
        this.bindEvents();
        this.loadSounds();
        this.connectWebSocket();
        
        if (this.config.autoOpen) {
            setTimeout(() => this.openChat(), 3000);
        }
        
        // Update session info
        this.updateSessionInfo();
    }
    
    // Create DOM elements
    createElements() {
        // Store references to important elements
        this.elements = {
            container: document.getElementById('chatbot-container'),
            toggle: document.getElementById('chatToggle'),
            closeBtn: document.getElementById('closeChat'),
            messages: document.getElementById('chatMessages'),
            input: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendButton'),
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            humanPanel: document.getElementById('humanPanel'),
            cancelHuman: document.getElementById('cancelHuman'),
            notificationBadge: document.getElementById('notificationBadge')
        };
        
        // Add quick action handlers
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text');
                this.elements.input.value = text;
                this.sendMessage();
            });
        });
    }
    
    // Bind event listeners
    bindEvents() {
        // Toggle chat
        this.elements.toggle.addEventListener('click', () => this.openChat());
        this.elements.closeBtn.addEventListener('click', () => this.closeChat());
        
        // Send message
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Cancel human connection
        this.elements.cancelHuman.addEventListener('click', () => {
            this.hideHumanPanel();
            this.addMessage('اتصال به اپراتور لغو شد.', 'bot');
        });
        
        // Input focus
        this.elements.input.addEventListener('focus', () => {
            if (!this.state.isOpen) {
                this.openChat();
            }
        });
        
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.state.isOpen) {
                this.closeChat();
            }
        });
        
        // Prevent widget from closing when clicking inside
        this.elements.container.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && 
                !this.elements.container.contains(e.target) && 
                !this.elements.toggle.contains(e.target)) {
                this.closeChat();
            }
        });
    }
    
    // Load notification sounds
    loadSounds() {
        if (!this.config.soundEnabled) return;
        
        // Create notification sound using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
        } catch (error) {
            console.log('Audio not supported:', error);
        }
    }
    
    // WebSocket connection
    connectWebSocket() {
        const wsUrl = `${this.config.serverUrl.replace('http', 'ws')}?sessionId=${this.state.sessionId}`;
        
        try {
            this.state.socket = new WebSocket(wsUrl);
            
            this.state.socket.onopen = () => {
                console.log('WebSocket connected');
                this.state.isConnected = true;
                this.state.reconnectAttempts = 0;
                this.updateStatus(true);
                this.addMessage('اتصال برقرار شد!', 'system');
            };
            
            this.state.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };
            
            this.state.socket.onclose = () => {
                console.log('WebSocket disconnected');
                this.state.isConnected = false;
                this.updateStatus(false);
                
                // Attempt reconnection
                if (this.state.reconnectAttempts < this.state.maxReconnectAttempts) {
                    this.state.reconnectAttempts++;
                    setTimeout(() => this.connectWebSocket(), 3000 * this.state.reconnectAttempts);
                }
            };
            
            this.state.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.addMessage('خطا در اتصال به سرور', 'system');
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.fallbackToHTTP();
        }
    }
    
    // Handle incoming WebSocket messages
    handleSocketMessage(data) {
        switch (data.type || data.event) {
            case 'connected':
                this.addMessage('به پشتیبان هوشمند خوش آمدید!', 'bot');
                break;
                
            case 'ai_response':
                this.handleAIResponse(data);
                break;
                
            case 'human_connected':
                this.handleHumanConnected(data);
                break;
                
            case 'human_disconnected':
                this.handleHumanDisconnected(data);
                break;
                
            case 'human_message':
                this.addMessage(data.text, 'human');
                break;
                
            case 'status':
                this.addMessage(data.message, 'system');
                break;
                
            case 'error':
                this.addMessage(`خطا: ${data.message}`, 'system');
                break;
                
            default:
                console.log('Unknown message type:', data);
        }
    }
    
    // Handle AI response
    handleAIResponse(data) {
        this.hideTypingIndicator();
        
        if (data.needsHuman) {
            this.addMessage(data.text, 'bot');
            this.showHumanConnectButton();
        } else {
            this.addMessage(data.text, 'bot');
        }
    }
    
    // Handle human operator connection
    handleHumanConnected(data) {
        this.state.mode = 'human';
        this.hideHumanPanel();
        this.updateStatus(true, 'با اپراتور');
        this.addMessage(data.message || '✅ به اپراتور انسانی متصل شدید!', 'system');
        this.showNotification('اپراتور آنلاین شد');
    }
    
    // Handle human operator disconnect
    handleHumanDisconnected(data) {
        this.state.mode = 'ai';
        this.updateStatus(true, 'آنلاین');
        this.addMessage(data.message || 'اپراتور ارتباط را قطع کرد.', 'system');
    }
    
    // Fallback to HTTP if WebSocket fails
    fallbackToHTTP() {
        this.addMessage('استفاده از حالت آفلاین', 'system');
        
        // Override send method
        this.sendMessage = async (text) => {
            const message = text || this.elements.input.value.trim();
            if (!message) return;
            
            this.addMessage(message, 'user');
            this.elements.input.value = '';
            
            // Show typing indicator
            this.showTypingIndicator();
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: message,
                        sessionId: this.state.sessionId
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    if (data.needsHuman) {
                        this.addMessage(data.response, 'bot');
                        this.showHumanConnectButton();
                    } else {
                        this.addMessage(data.response, 'bot');
                    }
                } else {
                    throw new Error(data.error);
                }
                
            } catch (error) {
                this.addMessage('خطا در ارتباط با سرور', 'system');
            } finally {
                this.hideTypingIndicator();
            }
        };
    }
    
    // Send message
    async sendMessage(text) {
        const message = text || this.elements.input.value.trim();
        if (!message) return;
        
        // Add user message
        this.addMessage(message, 'user');
        this.elements.input.value = '';
        
        // If in AI mode, show typing indicator
        if (this.state.mode === 'ai') {
            this.showTypingIndicator();
        }
        
        // Send via WebSocket
        if (this.state.isConnected && this.state.socket) {
            this.state.socket.send(JSON.stringify({
                type: 'user_message',
                text: message,
                sessionId: this.state.sessionId
            }));
        } else {
            // Fallback to HTTP
            await this.sendMessageHTTP(message);
        }
        
        // Save to localStorage
        this.saveMessage(message, 'user');
    }
    
    // HTTP fallback for sending messages
    async sendMessageHTTP(message) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: this.state.sessionId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage(data.response, 'bot');
                
                if (data.needsHuman) {
                    this.showHumanConnectButton();
                }
            }
            
        } catch (error) {
            this.addMessage('خطا در ارسال پیام', 'system');
        } finally {
            this.hideTypingIndicator();
        }
    }
    
    // Connect to human operator
    async connectToHuman() {
        this.showHumanPanel();
        
        if (this.state.isConnected && this.state.socket) {
            this.state.socket.send(JSON.stringify({
                type: 'request_human',
                sessionId: this.state.sessionId
            }));
        } else {
            // HTTP fallback
            try {
                const response = await fetch('/api/connect-human', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: this.state.sessionId
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.addMessage('درخواست شما ارسال شد. لطفاً منتظر بمانید...', 'system');
                } else {
                    throw new Error(data.error);
                }
                
            } catch (error) {
                this.addMessage('خطا در اتصال به اپراتور', 'system');
                this.hideHumanPanel();
            }
        }
    }
    
    // Add message to chat
    addMessage(text, sender = 'bot') {
        const messageId = 'msg_' + Date.now();
        const timestamp = new Date().toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}-message`;
        messageElement.id = messageId;
        
        let senderName = 'پشتیبان هوشمند';
        let senderIcon = 'fas fa-robot';
        
        if (sender === 'user') {
            senderName = 'شما';
            senderIcon = 'fas fa-user';
        } else if (sender === 'human') {
            senderName = 'اپراتور';
            senderIcon = 'fas fa-headset';
        } else if (sender === 'system') {
            senderName = 'سیستم';
            senderIcon = 'fas fa-info-circle';
        }
        
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-sender">
                    <i class="${senderIcon}"></i> ${senderName}
                </div>
                <div class="message-text">${this.escapeHtml(text)}</div>
                <div class="message-time">${timestamp}</div>
            </div>
        `;
        
        this.elements.messages.appendChild(messageElement);
        this.scrollToBottom();
        
        // Play sound for incoming messages
        if (sender !== 'user' && this.config.soundEnabled) {
            this.playNotificationSound();
        }
        
        // Show notification badge if chat is closed
        if (!this.state.isOpen && sender !== 'user') {
            this.showNotificationBadge();
        }
        
        // Store message
        this.state.messages.push({
            id: messageId,
            text: text,
            sender: sender,
            timestamp: new Date()
        });
        
        // Limit messages in memory
        if (this.state.messages.length > 100) {
            this.state.messages = this.state.messages.slice(-50);
        }
    }
    
    // Show typing indicator
    showTypingIndicator() {
        if (this.state.isTyping) return;
        
        this.state.isTyping = true;
        
        const typingElement = document.createElement('div');
        typingElement.className = 'typing-indicator';
        typingElement.id = 'typingIndicator';
        
        typingElement.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <span>در حال تایپ...</span>
        `;
        
        this.elements.messages.appendChild(typingElement);
        this.scrollToBottom();
    }
    
    // Hide typing indicator
    hideTypingIndicator() {
        this.state.isTyping = false;
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    // Show human connect button
    showHumanConnectButton() {
        const button = document.createElement('button');
        button.className = 'human-connect-btn';
        button.innerHTML = `
            <i class="fas fa-headset"></i>
            اتصال به اپراتور انسانی
        `;
        
        button.addEventListener('click', () => {
            button.remove();
            this.connectToHuman();
        });
        
        this.elements.messages.appendChild(button);
        this.scrollToBottom();
    }
    
    // Show human connection panel
    showHumanPanel() {
        this.elements.humanPanel.style.display = 'block';
        this.state.mode = 'waiting';
    }
    
    // Hide human connection panel
    hideHumanPanel() {
        this.elements.humanPanel.style.display = 'none';
    }
    
    // Update connection status
    updateStatus(isConnected, customText = null) {
        const dot = this.elements.statusDot;
        const text = this.elements.statusText;
        
        if (isConnected) {
            dot.style.background = '#4ade80';
            text.textContent = customText || 'آنلاین';
        } else {
            dot.style.background = '#f87171';
            text.textContent = 'آفلاین';
            
            // Blink animation
            dot.style.animation = 'pulse 1s infinite';
        }
    }
    
    // Show notification badge
    showNotificationBadge() {
        const badge = this.elements.notificationBadge;
        const current = parseInt(badge.textContent) || 0;
        badge.textContent = current + 1;
        badge.style.display = 'flex';
    }
    
    // Clear notification badge
    clearNotificationBadge() {
        const badge = this.elements.notificationBadge;
        badge.textContent = '1';
        badge.style.display = 'none';
    }
    
    // Show desktop notification
    showNotification(message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('پشتیبان هوشمند', {
                body: message,
                icon: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png'
            });
        }
    }
    
    // Play notification sound
    playNotificationSound() {
        // Simple beep sound
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
            
        } catch (error) {
            // Audio not supported
        }
    }
    
    // Open chat widget
    openChat() {
        this.state.isOpen = true;
        this.elements.container.classList.add('active');
        this.elements.toggle.style.opacity = '0';
        this.elements.toggle.style.pointerEvents = 'none';
        
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
        
        // Focus input
        setTimeout(() => {
            this.elements.input.focus();
        }, 300);
        
        // Clear notification badge
        this.clearNotificationBadge();
    }
    
    // Close chat widget
    closeChat() {
        this.state.isOpen = false;
        this.elements.container.classList.remove('active');
        this.elements.toggle.style.opacity = '1';
        this.elements.toggle.style.pointerEvents = 'auto';
    }
    
    // Scroll to bottom of messages
    scrollToBottom() {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }
    
    // Save message to localStorage
    saveMessage(text, sender) {
        try {
            const chatHistory = JSON.parse(localStorage.getItem('chat_history') || '[]');
            chatHistory.push({
                text: text,
                sender: sender,
                timestamp: new Date().toISOString(),
                sessionId: this.state.sessionId
            });
            
            // Keep only last 50 messages
            if (chatHistory.length > 50) {
                chatHistory.splice(0, chatHistory.length - 50);
            }
            
            localStorage.setItem('chat_history', JSON.stringify(chatHistory));
        } catch (error) {
            console.error('Failed to save message:', error);
        }
    }
    
    // Update session info display
    updateSessionInfo() {
        // Update session ID in UI if needed
        const sessionInfo = document.getElementById('sessionInfo');
        if (sessionInfo) {
            sessionInfo.textContent = `شناسه: ${this.state.sessionId.substring(0, 8)}...`;
        }
    }
    
    // HTML escape
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Public methods
    open() {
        this.openChat();
    }
    
    close() {
        this.closeChat();
    }
    
    send(text) {
        this.sendMessage(text);
    }
    
    getSessionId() {
        return this.state.sessionId;
    }
    
    getMessages() {
        return [...this.state.messages];
    }
    
    destroy() {
        if (this.state.socket) {
            this.state.socket.close();
        }
        
        this.elements.container.remove();
        this.elements.toggle.remove();
        
        // Remove all event listeners
        document.removeEventListener('keydown', this.boundHandleEscape);
        document.removeEventListener('click', this.boundHandleOutsideClick);
    }
}

// Initialize chatbot when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.Chatbot = new ChatbotWidget({
        serverUrl: window.location.origin,
        autoOpen: false,
        soundEnabled: true
    });
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatbotWidget;
}
