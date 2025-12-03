class EnhancedChatWidget {
    constructor(options = {}) {
        this.options = {
            backendUrl: options.backendUrl || window.location.origin,
            position: options.position || 'bottom-right',
            theme: options.theme || 'modern',
            primaryColor: options.primaryColor || '#4f46e5',
            secondaryColor: options.secondaryColor || '#7c3aed',
            language: options.language || 'fa',
            enableFileUpload: options.enableFileUpload !== false,
            enableVoice: options.enableVoice !== false,
            autoOpen: options.autoOpen || false,
            greetingMessage: options.greetingMessage || 'سلام! 👋 من دستیار هوشمند شما هستم. چطور می‌تونم کمکتون کنم؟',
            ...options
        };
        
        this.state = {
            isOpen: false,
            isConnected: false,
            operatorConnected: false,
            isConnecting: false,
            sessionId: null,
            socket: null,
            messages: [],
            isTyping: false,
            unreadCount: 0,
            isUploading: false,
            isRecording: false,
            mediaRecorder: null,
            audioChunks: []
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
        
        // Auto open if configured
        if (this.options.autoOpen) {
            setTimeout(() => this.toggleChat(), 1500);
        }
        
        console.log('Enhanced Chat Widget initialized with session:', this.state.sessionId);
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
        const styleId = 'enhanced-chat-widget-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .enhanced-chat-widget {
                --primary: ${this.options.primaryColor};
                --primary-light: ${this.hexToRgba(this.options.primaryColor, 0.1)};
                --secondary: ${this.options.secondaryColor};
                --bg: #ffffff;
                --text: #1f2937;
                --text-light: #6b7280;
                --border: #e5e7eb;
                --shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
                --radius: 16px;
                --success: #10b981;
                --warning: #f59e0b;
                --error: #ef4444;
                --ai-bubble: #f3f4f6;
                --user-bubble: var(--primary);
                font-family: 'Vazirmatn', 'Segoe UI', Tahoma, Geneva, sans-serif;
            }
            
            .enhanced-chat-widget * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
            
            .enhanced-chat-widget {
                position: fixed;
                z-index: 999999;
                bottom: 24px;
                right: 24px;
                direction: rtl;
            }
            
            /* Toggle Button */
            .chat-toggle-btn {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                border: none;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                box-shadow: 0 4px 20px rgba(79, 70, 229, 0.3);
                transition: all 0.3s ease;
                position: relative;
            }
            
            .chat-toggle-btn:hover {
                transform: scale(1.1) rotate(5deg);
                box-shadow: 0 6px 25px rgba(79, 70, 229, 0.4);
            }
            
            .toggle-pulse {
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: var(--primary);
                animation: pulse 2s infinite;
                opacity: 0.3;
            }
            
            @keyframes pulse {
                0% { transform: scale(1); opacity: 0.3; }
                70% { transform: scale(1.3); opacity: 0; }
                100% { transform: scale(1.3); opacity: 0; }
            }
            
            .notification-badge {
                position: absolute;
                top: -5px;
                left: -5px;
                background: var(--error);
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: bounce 0.5s ease;
            }
            
            @keyframes bounce {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.2); }
            }
            
            /* Chat Window */
            .chat-window {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 380px;
                height: 600px;
                background: var(--bg);
                border-radius: var(--radius);
                box-shadow: var(--shadow);
                display: none;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid var(--border);
                transform: translateY(20px);
                opacity: 0;
                transition: all 0.3s ease;
            }
            
            .chat-window.active {
                display: flex;
                transform: translateY(0);
                opacity: 1;
                animation: slideUp 0.3s ease;
            }
            
            @keyframes slideUp {
                from {
                    transform: translateY(20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            /* Header */
            .chat-header {
                padding: 20px;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                color: white;
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: relative;
                overflow: hidden;
            }
            
            .header-bg {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0,0 L100,0 L100,100 Z" fill="rgba(255,255,255,0.1)"/></svg>');
                background-size: cover;
            }
            
            .header-left {
                display: flex;
                align-items: center;
                gap: 12px;
                position: relative;
                z-index: 1;
            }
            
            .chat-logo {
                width: 40px;
                height: 40px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                backdrop-filter: blur(10px);
            }
            
            .chat-title h3 {
                font-size: 16px;
                margin-bottom: 4px;
            }
            
            .chat-title p {
                font-size: 12px;
                opacity: 0.9;
            }
            
            .header-right {
                display: flex;
                align-items: center;
                gap: 12px;
                position: relative;
                z-index: 1;
            }
            
            .chat-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                background: rgba(255, 255, 255, 0.2);
                padding: 4px 8px;
                border-radius: 12px;
                backdrop-filter: blur(10px);
            }
            
            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--success);
                animation: blink 2s infinite;
            }
            
            .status-dot.offline {
                background: var(--error);
                animation: none;
            }
            
            @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .header-actions {
                display: flex;
                gap: 8px;
            }
            
            .header-btn {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                backdrop-filter: blur(10px);
            }
            
            .header-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: rotate(15deg);
            }
            
            /* Messages Container */
            .chat-messages {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                background: linear-gradient(180deg, #f9fafb 0%, #ffffff 100%);
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            
            .message {
                max-width: 85%;
                animation: messageAppear 0.3s ease;
            }
            
            @keyframes messageAppear {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .message.user {
                align-self: flex-end;
            }
            
            .message.assistant, .message.operator {
                align-self: flex-start;
            }
            
            .message-bubble {
                padding: 12px 16px;
                border-radius: 18px;
                position: relative;
                word-break: break-word;
            }
            
            .message.user .message-bubble {
                background: linear-gradient(135deg, var(--user-bubble), var(--secondary));
                color: white;
                border-bottom-right-radius: 4px;
            }
            
            .message.assistant .message-bubble,
            .message.operator .message-bubble {
                background: var(--ai-bubble);
                color: var(--text);
                border-bottom-left-radius: 4px;
            }
            
            .message-text {
                line-height: 1.5;
            }
            
            .message-time {
                font-size: 11px;
                opacity: 0.7;
                margin-top: 4px;
                text-align: left;
            }
            
            .message.user .message-time {
                text-align: right;
                color: rgba(255, 255, 255, 0.8);
            }
            
            .message-avatar {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                position: absolute;
                top: 0;
            }
            
            .message.user .message-avatar {
                right: -36px;
                background: var(--primary);
                color: white;
            }
            
            .message.assistant .message-avatar,
            .message.operator .message-avatar {
                left: -36px;
                background: var(--ai-bubble);
                color: var(--primary);
            }
            
            /* Typing Indicator */
            .typing-indicator {
                display: none;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                background: var(--ai-bubble);
                border-radius: 18px;
                align-self: flex-start;
                margin-bottom: 16px;
                border-bottom-left-radius: 4px;
            }
            
            .typing-indicator.active {
                display: flex;
                animation: typingPulse 1.5s infinite;
            }
            
            @keyframes typingPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            .typing-dots {
                display: flex;
                gap: 4px;
            }
            
            .typing-dots span {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--text-light);
                animation: typing 1.4s infinite;
            }
            
            .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
            .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
            
            @keyframes typing {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-5px); }
            }
            
            /* Connection Status */
            .connection-status {
                display: none;
                padding: 12px 20px;
                background: var(--warning);
                color: white;
                font-size: 14px;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .connection-status.active {
                display: flex;
            }
            
            /* Input Area */
            .chat-input-area {
                padding: 20px;
                border-top: 1px solid var(--border);
                background: var(--bg);
            }
            
            .input-wrapper {
                display: flex;
                gap: 12px;
                align-items: flex-end;
                margin-bottom: 12px;
            }
            
            .message-input {
                flex: 1;
                padding: 12px 16px;
                border: 1px solid var(--border);
                border-radius: 12px;
                resize: none;
                font-family: inherit;
                font-size: 14px;
                line-height: 1.5;
                max-height: 120px;
                transition: all 0.2s ease;
                background: var(--bg);
                color: var(--text);
            }
            
            .message-input:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 3px var(--primary-light);
            }
            
            .input-actions {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
            }
            
            .input-action-btn {
                width: 36px;
                height: 36px;
                border-radius: 10px;
                border: 1px solid var(--border);
                background: var(--bg);
                color: var(--text-light);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .input-action-btn:hover {
                background: var(--primary-light);
                color: var(--primary);
                border-color: var(--primary);
            }
            
            .input-action-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .send-btn {
                width: 44px;
                height: 44px;
                border-radius: 12px;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                border: none;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .send-btn:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
            }
            
            .send-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* Quick Actions */
            .quick-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 12px;
            }
            
            .quick-action {
                padding: 8px 12px;
                background: var(--primary-light);
                color: var(--primary);
                border: none;
                border-radius: 20px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .quick-action:hover {
                background: var(--primary);
                color: white;
            }
            
            /* Human Support */
            .human-support-btn {
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #ff6b6b, #ee5a52);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.3s ease;
                font-weight: 500;
            }
            
            .human-support-btn:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            }
            
            .human-support-btn:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }
            
            .human-support-btn.connected {
                background: linear-gradient(135deg, #10b981, #059669);
            }
            
            .human-support-btn.pending {
                background: linear-gradient(135deg, #f59e0b, #d97706);
            }
            
            /* File Upload */
            .file-preview {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--ai-bubble);
                border-radius: 8px;
                margin-bottom: 12px;
                animation: slideIn 0.3s ease;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            .file-info {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .file-name {
                font-size: 12px;
                font-weight: 500;
            }
            
            .file-size {
                font-size: 11px;
                color: var(--text-light);
            }
            
            .file-progress {
                height: 4px;
                background: var(--border);
                border-radius: 2px;
                overflow: hidden;
                margin-top: 4px;
            }
            
            .file-progress-bar {
                height: 100%;
                background: var(--primary);
                width: 0%;
                transition: width 0.3s ease;
            }
            
            .file-cancel {
                background: none;
                border: none;
                color: var(--error);
                cursor: pointer;
                font-size: 14px;
            }
            
            /* Voice Recording */
            .voice-recording {
                display: none;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background: var(--error);
                color: white;
                border-radius: 12px;
                margin-bottom: 12px;
                animation: pulse 2s infinite;
            }
            
            .voice-recording.active {
                display: flex;
            }
            
            .recording-info {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .recording-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: white;
                animation: recording 1s infinite;
            }
            
            @keyframes recording {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .recording-time {
                font-family: monospace;
                font-size: 14px;
            }
            
            .recording-actions {
                display: flex;
                gap: 8px;
            }
            
            /* Welcome Message */
            .welcome-message {
                background: linear-gradient(135deg, var(--primary-light), white);
                border-radius: 16px;
                padding: 20px;
                margin-bottom: 16px;
                text-align: center;
                animation: welcomeSlide 0.5s ease;
            }
            
            @keyframes welcomeSlide {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .welcome-icon {
                font-size: 32px;
                margin-bottom: 12px;
                color: var(--primary);
            }
            
            .welcome-title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text);
            }
            
            .welcome-text {
                font-size: 14px;
                color: var(--text-light);
                line-height: 1.5;
            }
            
            /* Suggestions */
            .suggestions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 12px;
            }
            
            .suggestion {
                padding: 8px 16px;
                background: var(--primary-light);
                color: var(--primary);
                border: 1px solid var(--primary);
                border-radius: 20px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .suggestion:hover {
                background: var(--primary);
                color: white;
                transform: translateY(-2px);
            }
            
            /* Scrollbar */
            .chat-messages::-webkit-scrollbar {
                width: 6px;
            }
            
            .chat-messages::-webkit-scrollbar-track {
                background: transparent;
            }
            
            .chat-messages::-webkit-scrollbar-thumb {
                background: var(--border);
                border-radius: 3px;
            }
            
            .chat-messages::-webkit-scrollbar-thumb:hover {
                background: var(--text-light);
            }
            
            /* Responsive */
            @media (max-width: 480px) {
                .enhanced-chat-widget {
                    bottom: 16px;
                    right: 16px;
                }
                
                .chat-window {
                    width: calc(100vw - 32px);
                    height: 80vh;
                    bottom: 76px;
                    right: 0;
                }
                
                .message {
                    max-width: 90%;
                }
            }
            
            /* Dark Mode Support */
            @media (prefers-color-scheme: dark) {
                .enhanced-chat-widget {
                    --bg: #1f2937;
                    --text: #f9fafb;
                    --text-light: #d1d5db;
                    --border: #374151;
                    --ai-bubble: #374151;
                    --shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                }
                
                .message-input {
                    background: #374151;
                    color: #f9fafb;
                }
                
                .message-input::placeholder {
                    color: #9ca3af;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    injectHTML() {
        this.container = document.createElement('div');
        this.container.className = 'enhanced-chat-widget';
        this.container.innerHTML = `
            <!-- Pulsing Background -->
            <div class="toggle-pulse" style="display: none"></div>
            
            <!-- Toggle Button -->
            <button class="chat-toggle-btn">
                <i class="fas fa-comments"></i>
                <span class="notification-badge" style="display: none">0</span>
            </button>
            
            <!-- Chat Window -->
            <div class="chat-window">
                <!-- Header -->
                <div class="chat-header">
                    <div class="header-bg"></div>
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
                        <div class="chat-status">
                            <span class="status-dot"></span>
                            <span>آنلاین</span>
                        </div>
                        <div class="header-actions">
                            <button class="header-btn minimize-btn" title="کوچک کردن">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button class="header-btn close-btn" title="بستن">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Welcome Message -->
                <div class="welcome-message">
                    <div class="welcome-icon">
                        <i class="fas fa-headset"></i>
                    </div>
                    <div class="welcome-title">به پشتیبان هوشمند خوش آمدید</div>
                    <div class="welcome-text">${this.options.greetingMessage}</div>
                    <div class="suggestions">
                        <button class="suggestion" data-question="قیمت محصولات؟">💰 قیمت محصولات</button>
                        <button class="suggestion" data-question="زمان تحویل؟">🚚 زمان تحویل</button>
                        <button class="suggestion" data-question="گارانتی محصولات؟">🛡️ گارانتی</button>
                        <button class="suggestion" data-question="روش‌های پرداخت؟">💳 روش پرداخت</button>
                    </div>
                </div>
                
                <!-- Messages Container -->
                <div class="chat-messages">
                    <!-- Messages will be added here dynamically -->
                </div>
                
                <!-- File Preview -->
                <div class="file-preview" style="display: none">
                    <i class="fas fa-file"></i>
                    <div class="file-info">
                        <div class="file-name">در حال آپلود...</div>
                        <div class="file-size">0 KB</div>
                        <div class="file-progress">
                            <div class="file-progress-bar"></div>
                        </div>
                    </div>
                    <button class="file-cancel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Voice Recording -->
                <div class="voice-recording">
                    <div class="recording-info">
                        <div class="recording-dot"></div>
                        <span>در حال ضبط صدا...</span>
                        <span class="recording-time">00:00</span>
                    </div>
                    <div class="recording-actions">
                        <button class="header-btn stop-recording">
                            <i class="fas fa-stop"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Typing Indicator -->
                <div class="typing-indicator">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span>در حال تایپ...</span>
                </div>
                
                <!-- Connection Status -->
                <div class="connection-status">
                    <i class="fas fa-wifi"></i>
                    <span>در حال اتصال به سرور...</span>
                </div>
                
                <!-- Quick Actions -->
                <div class="quick-actions">
                    <button class="quick-action" data-action="price">💰 قیمت</button>
                    <button class="quick-action" data-action="delivery">🚚 ارسال</button>
                    <button class="quick-action" data-action="support">🛟 پشتیبانی</button>
                    <button class="quick-action" data-action="order">📦 پیگیری سفارش</button>
                </div>
                
                <!-- Input Area -->
                <div class="chat-input-area">
                    <div class="input-actions">
                        ${this.options.enableFileUpload ? `
                            <button class="input-action-btn" id="file-upload-btn" title="ارسال فایل">
                                <i class="fas fa-paperclip"></i>
                            </button>
                            <input type="file" id="file-input" style="display: none">
                        ` : ''}
                        ${this.options.enableVoice ? `
                            <button class="input-action-btn" id="voice-btn" title="ضبط صدا">
                                <i class="fas fa-microphone"></i>
                            </button>
                        ` : ''}
                        <button class="input-action-btn" id="emoji-btn" title="ایموجی">
                            <i class="far fa-smile"></i>
                        </button>
                    </div>
                    
                    <div class="input-wrapper">
                        <textarea class="message-input" placeholder="پیام خود را بنویسید..." rows="1"></textarea>
                        <button class="send-btn">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    
                    <button class="human-support-btn">
                        <i class="fas fa-user-headset"></i>
                        <span>اتصال به اپراتور انسانی</span>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        
        // Cache DOM elements
        this.elements = {
            toggleBtn: this.container.querySelector('.chat-toggle-btn'),
            togglePulse: this.container.querySelector('.toggle-pulse'),
            chatWindow: this.container.querySelector('.chat-window'),
            minimizeBtn: this.container.querySelector('.minimize-btn'),
            closeBtn: this.container.querySelector('.close-btn'),
            messagesContainer: this.container.querySelector('.chat-messages'),
            welcomeMessage: this.container.querySelector('.welcome-message'),
            messageInput: this.container.querySelector('.message-input'),
            sendBtn: this.container.querySelector('.send-btn'),
            humanSupportBtn: this.container.querySelector('.human-support-btn'),
            typingIndicator: this.container.querySelector('.typing-indicator'),
            connectionStatus: this.container.querySelector('.connection-status'),
            notificationBadge: this.container.querySelector('.notification-badge'),
            chatStatus: this.container.querySelector('.chat-status'),
            statusDot: this.container.querySelector('.status-dot'),
            suggestions: this.container.querySelectorAll('.suggestion'),
            quickActions: this.container.querySelectorAll('.quick-action'),
            fileUploadBtn: this.container.querySelector('#file-upload-btn'),
            fileInput: this.container.querySelector('#file-input'),
            filePreview: this.container.querySelector('.file-preview'),
            fileProgressBar: this.container.querySelector('.file-progress-bar'),
            fileCancelBtn: this.container.querySelector('.file-cancel'),
            voiceBtn: this.container.querySelector('#voice-btn'),
            voiceRecording: this.container.querySelector('.voice-recording'),
            stopRecordingBtn: this.container.querySelector('.stop-recording'),
            recordingTime: this.container.querySelector('.recording-time'),
            emojiBtn: this.container.querySelector('#emoji-btn'),
            inputActionBtns: this.container.querySelectorAll('.input-action-btn')
        };
    }
    
    initEvents() {
        // Toggle chat
        this.elements.toggleBtn.addEventListener('click', () => this.toggleChat());
        this.elements.minimizeBtn.addEventListener('click', () => this.minimizeChat());
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
        
        // Suggestions
        this.elements.suggestions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const question = e.target.dataset.question;
                this.elements.messageInput.value = question;
                this.sendMessage();
            });
        });
        
        // Quick actions
        this.elements.quickActions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleQuickAction(action);
            });
        });
        
        // Human support
        this.elements.humanSupportBtn.addEventListener('click', () => this.connectToHuman());
        
        // File upload
        if (this.elements.fileUploadBtn) {
            this.elements.fileUploadBtn.addEventListener('click', () => {
                this.elements.fileInput.click();
            });
            
            this.elements.fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files[0]);
            });
            
            this.elements.fileCancelBtn.addEventListener('click', () => {
                this.cancelFileUpload();
            });
        }
        
        // Voice recording
        if (this.elements.voiceBtn) {
            this.elements.voiceBtn.addEventListener('click', () => {
                if (!this.state.isRecording) {
                    this.startVoiceRecording();
                } else {
                    this.stopVoiceRecording();
                }
            });
            
            this.elements.stopRecordingBtn.addEventListener('click', () => {
                this.stopVoiceRecording();
            });
        }
        
        // Emoji picker
        if (this.elements.emojiBtn) {
            this.elements.emojiBtn.addEventListener('click', () => {
                this.showEmojiPicker();
            });
        }
        
        // Input action buttons hover effect
        this.elements.inputActionBtns.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.1)';
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'scale(1)';
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
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                this.toggleChat();
            }
        });
    }
    
    connectWebSocket() {
        try {
            const wsUrl = this.options.backendUrl.replace('http', 'ws');
            this.state.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                timeout: 20000
            });
            
            this.state.socket.on('connect', () => {
                console.log('WebSocket connected');
                this.state.isConnected = true;
                this.updateConnectionStatus(true);
                this.showPulseEffect(false);
                
                // Join session
                this.state.socket.emit('join', this.state.sessionId);
            });
            
            this.state.socket.on('operator-accepted', (data) => {
                this.addMessage('system', data.message);
                this.state.operatorConnected = true;
                this.elements.humanSupportBtn.classList.add('connected');
                this.elements.humanSupportBtn.innerHTML = `
                    <i class="fas fa-user-check"></i>
                    <span>متصل به اپراتور</span>
                `;
            });
            
            this.state.socket.on('operator-rejected', (data) => {
                this.addMessage('system', data.message);
                this.state.operatorConnected = false;
                this.elements.humanSupportBtn.classList.remove('connected');
                this.resetHumanSupportButton();
            });
            
            this.state.socket.on('operator-connected', (data) => {
                this.handleOperatorConnected(data);
            });
            
            this.state.socket.on('operator-message', (data) => {
                this.addMessage('operator', data.message);
            });
            
            this.state.socket.on('ai-response', (data) => {
                this.addMessage('assistant', data.message);
                this.setTyping(false);
                
                // Show suggestions if available
                if (data.suggestions && data.suggestions.length > 0) {
                    this.showSuggestions(data.suggestions);
                }
            });
            
            this.state.socket.on('typing', () => {
                this.setTyping(true);
            });
            
            this.state.socket.on('connect_error', (error) => {
                console.error('WebSocket connection error:', error);
                this.updateConnectionStatus(false);
                this.showPulseEffect(true);
            });
            
            this.state.socket.on('disconnect', (reason) => {
                console.log('WebSocket disconnected:', reason);
                this.state.isConnected = false;
                this.updateConnectionStatus(false);
                this.showPulseEffect(true);
            });
            
        } catch (error) {
            console.error('WebSocket initialization failed:', error);
            this.showPulseEffect(true);
        }
    }
    
    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.classList.remove('active');
            this.elements.statusDot.classList.remove('offline');
            this.elements.chatStatus.innerHTML = `
                <span class="status-dot"></span>
                <span>آنلاین</span>
            `;
        } else {
            this.elements.connectionStatus.classList.add('active');
            this.elements.statusDot.classList.add('offline');
            this.elements.chatStatus.innerHTML = `
                <span class="status-dot offline"></span>
                <span>آفلاین</span>
            `;
        }
    }
    
    showPulseEffect(show) {
        this.elements.togglePulse.style.display = show ? 'block' : 'none';
    }
    
    toggleChat() {
        this.state.isOpen = !this.state.isOpen;
        this.elements.chatWindow.classList.toggle('active');
        
        if (this.state.isOpen) {
            this.elements.messageInput.focus();
            this.resetNotification();
            
            // Hide welcome message after first opening
            setTimeout(() => {
                this.elements.welcomeMessage.style.display = 'none';
            }, 5000);
        } else {
            this.minimizeChat();
        }
    }
    
    minimizeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
        this.elements.chatWindow.style.transform = 'translateY(20px) scale(0.9)';
        this.elements.chatWindow.style.opacity = '0';
        
        setTimeout(() => {
            this.elements.chatWindow.style.transform = '';
            this.elements.chatWindow.style.opacity = '';
        }, 300);
    }
    
    closeChat() {
        this.state.isOpen = false;
        this.elements.chatWindow.classList.remove('active');
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
        
        // Clear input
        this.elements.messageInput.value = '';
        this.resizeTextarea();
        
        // Disable input
        this.setTyping(true);
        
        try {
            if (this.state.operatorConnected) {
                // Send to operator via API
                await this.sendToOperator(message);
            } else {
                // Send to AI
                await this.sendToAI(message);
            }
        } catch (error) {
            console.error('Send message error:', error);
            this.addMessage('system', 'خطا در ارسال پیام. لطفاً دوباره تلاش کنید.');
            this.setTyping(false);
        }
    }
    
    async sendToAI(message) {
        // Emit typing indicator
        if (this.state.socket) {
            this.state.socket.emit('typing');
        }
        
        try {
            const response = await fetch(`${this.options.backendUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: this.state.sessionId,
                    timestamp: new Date().toISOString()
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage('assistant', data.message);
                
                // If AI suggests human support
                if (data.requiresHuman) {
                    this.elements.humanSupportBtn.innerHTML = `
                        <i class="fas fa-user-headset"></i>
                        <span>اتصال به اپراتور (پیشنهاد سیستم)</span>
                    `;
                    this.elements.humanSupportBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                }
                
                // Show quick actions based on context
                this.updateQuickActions(data.context);
            } else {
                this.addMessage('system', data.message || 'خطا در پردازش درخواست');
            }
            
        } catch (error) {
            console.error('AI request error:', error);
            this.addMessage('system', 'خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.');
        }
    }
    
    async sendToOperator(message) {
        try {
            const response = await fetch(`${this.options.backendUrl}/api/send-to-operator`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.state.sessionId,
                    message: message,
                    timestamp: new Date().toISOString()
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                this.addMessage('system', 'خطا در ارسال پیام به اپراتور');
            }
            
        } catch (error) {
            console.error('Operator request error:', error);
            this.addMessage('system', 'خطا در ارتباط با اپراتور');
        }
    }
    
    async connectToHuman() {
        if (this.state.operatorConnected || this.state.isConnecting) return;
        
        this.state.isConnecting = true;
        this.elements.humanSupportBtn.disabled = true;
        this.elements.humanSupportBtn.classList.add('pending');
        this.elements.humanSupportBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>در حال اتصال...</span>
        `;
        
        try {
            const userInfo = {
                name: this.getUserName(),
                email: this.getUserEmail(),
                phone: this.getUserPhone(),
                page: window.location.href,
                userAgent: navigator.userAgent,
                referrer: document.referrer,
                language: navigator.language,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
            
            console.log('👤 Requesting human connection...');
            
            const response = await fetch(`${this.options.backendUrl}/api/connect-human`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.state.sessionId,
                    userInfo: userInfo,
                    messages: this.state.messages.slice(-10) // Last 10 messages for context
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.state.operatorConnected = true;
                this.elements.humanSupportBtn.classList.remove('pending');
                this.elements.humanSupportBtn.classList.add('connected');
                this.addMessage('system', data.message);
                
                // Update button
                this.elements.humanSupportBtn.innerHTML = `
                    <i class="fas fa-user-check"></i>
                    <span>متصل به اپراتور</span>
                `;
                
                console.log('✅ Connected to human operator');
            } else {
                this.addMessage('system', `❌ ${data.error || 'خطا در اتصال به اپراتور'}`);
                this.resetHumanSupportButton();
            }
            
        } catch (error) {
            console.error('❌ Connect to human error:', error);
            this.addMessage('system', '❌ خطا در ارتباط با سرور');
            this.resetHumanSupportButton();
        } finally {
            this.state.isConnecting = false;
            this.elements.humanSupportBtn.disabled = false;
        }
    }
    
    getUserName() {
        // Try to get name from localStorage or cookies
        return localStorage.getItem('user_name') || 'کارگران سایت';
    }
    
    getUserEmail() {
        return localStorage.getItem('user_email') || '';
    }
    
    getUserPhone() {
        return localStorage.getItem('user_phone') || '';
    }
    
    resetHumanSupportButton() {
        this.elements.humanSupportBtn.classList.remove('connected', 'pending');
        this.elements.humanSupportBtn.innerHTML = `
            <i class="fas fa-user-headset"></i>
            <span>اتصال به اپراتور انسانی</span>
        `;
        this.elements.humanSupportBtn.style.background = '';
    }
    
    handleOperatorConnected(data) {
        this.state.operatorConnected = true;
        this.elements.humanSupportBtn.classList.add('connected');
        this.addMessage('operator', data.message);
        this.resetHumanSupportButton();
    }
    
    addMessage(type, text) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        
        const time = new Date().toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let avatarIcon = '';
        let avatarClass = '';
        
        switch(type) {
            case 'user':
                avatarIcon = '<i class="fas fa-user"></i>';
                avatarClass = 'user-avatar';
                break;
            case 'assistant':
                avatarIcon = '<i class="fas fa-robot"></i>';
                avatarClass = 'ai-avatar';
                break;
            case 'operator':
                avatarIcon = '<i class="fas fa-user-tie"></i>';
                avatarClass = 'operator-avatar';
                break;
            case 'system':
                avatarIcon = '<i class="fas fa-info-circle"></i>';
                avatarClass = 'system-avatar';
                break;
        }
        
        const isSystem = type === 'system';
        
        messageEl.innerHTML = `
            ${!isSystem ? `
            <div class="message-avatar ${avatarClass}">
                ${avatarIcon}
            </div>
            ` : ''}
            <div class="message-bubble">
                ${isSystem ? `<div class="system-icon">${avatarIcon}</div>` : ''}
                <div class="message-text">${this.formatMessage(text)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        this.elements.messagesContainer.appendChild(messageEl);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        
        // Add to state
        this.state.messages.push({ 
            type, 
            text, 
            time,
            timestamp: Date.now()
        });
        
        // Show notification if chat is closed
        if (!this.state.isOpen && type !== 'user') {
            this.showNotification();
        }
    }
    
    formatMessage(text) {
        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const formattedText = text.replace(urlRegex, url => 
            `<a href="${url}" target="_blank" rel="noopener noreferrer" class="message-link">${url}</a>`
        );
        
        // Convert line breaks
        return formattedText.replace(/\n/g, '<br>');
    }
    
    setTyping(typing) {
        this.state.isTyping = typing;
        
        if (typing) {
            this.elements.typingIndicator.classList.add('active');
            this.elements.sendBtn.disabled = true;
            this.elements.messageInput.disabled = true;
        } else {
            this.elements.typingIndicator.classList.remove('active');
            this.elements.sendBtn.disabled = false;
            this.elements.messageInput.disabled = false;
            this.elements.messageInput.focus();
        }
    }
    
    showNotification() {
        this.state.unreadCount++;
        const badge = this.elements.notificationBadge;
        badge.textContent = this.state.unreadCount > 99 ? '99+' : this.state.unreadCount;
        badge.style.display = 'flex';
        
        // Animate toggle button
        this.elements.toggleBtn.style.animation = 'shake 0.5s ease';
        setTimeout(() => {
            this.elements.toggleBtn.style.animation = '';
        }, 500);
    }
    
    resetNotification() {
        this.state.unreadCount = 0;
        const badge = this.elements.notificationBadge;
        badge.textContent = '0';
        badge.style.display = 'none';
    }
    
    handleQuickAction(action) {
        const actions = {
            price: 'قیمت محصولات شما چقدر است؟',
            delivery: 'زمان تحویل سفارشات چند روز است؟',
            support: 'چطور می‌توانم با پشتیبانی تماس بگیرم؟',
            order: 'چطور می‌توانم سفارشم را پیگیری کنم؟'
        };
        
        if (actions[action]) {
            this.elements.messageInput.value = actions[action];
            this.sendMessage();
        }
    }
    
    updateQuickActions(context) {
        // Update quick actions based on conversation context
        // This is a simplified version - you can expand it based on your needs
        if (context && context.includes('price')) {
            // Show pricing related actions
        }
    }
    
    async handleFileUpload(file) {
        if (!file) return;
        
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            this.addMessage('system', 'حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.');
            return;
        }
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
        if (!allowedTypes.includes(file.type)) {
            this.addMessage('system', 'نوع فایل مجاز نیست. فقط عکس، PDF و متن قابل قبول است.');
            return;
        }
        
        this.state.isUploading = true;
        this.elements.filePreview.style.display = 'flex';
        this.elements.filePreview.querySelector('.file-name').textContent = file.name;
        this.elements.filePreview.querySelector('.file-size').textContent = this.formatFileSize(file.size);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', this.state.sessionId);
        
        try {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    this.elements.fileProgressBar.style.width = `${percentComplete}%`;
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        this.addMessage('user', `📎 فایل ارسال شد: ${file.name}`);
                        this.elements.filePreview.style.display = 'none';
                    } else {
                        this.addMessage('system', 'خطا در آپلود فایل.');
                    }
                } else {
                    this.addMessage('system', 'خطا در آپلود فایل.');
                }
                this.state.isUploading = false;
            });
            
            xhr.addEventListener('error', () => {
                this.addMessage('system', 'خطا در آپلود فایل.');
                this.state.isUploading = false;
                this.elements.filePreview.style.display = 'none';
            });
            
            xhr.open('POST', `${this.options.backendUrl}/api/upload`);
            xhr.send(formData);
            
        } catch (error) {
            console.error('File upload error:', error);
            this.addMessage('system', 'خطا در آپلود فایل.');
            this.state.isUploading = false;
            this.elements.filePreview.style.display = 'none';
        }
    }
    
    cancelFileUpload() {
        this.state.isUploading = false;
        this.elements.filePreview.style.display = 'none';
        // In a real implementation, you would cancel the XHR request
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async startVoiceRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.addMessage('system', 'ضبط صدا در مرورگر شما پشتیبانی نمی‌شود.');
            return;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.state.mediaRecorder = new MediaRecorder(stream);
            this.state.audioChunks = [];
            
            this.state.mediaRecorder.addEventListener('dataavailable', (event) => {
                this.state.audioChunks.push(event.data);
            });
            
            this.state.mediaRecorder.addEventListener('stop', async () => {
                const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/wav' });
                await this.sendVoiceMessage(audioBlob);
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            });
            
            this.state.mediaRecorder.start();
            this.state.isRecording = true;
            this.elements.voiceRecording.classList.add('active');
            this.elements.voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
            this.elements.voiceBtn.style.color = 'var(--error)';
            
            // Start recording timer
            this.startRecordingTimer();
            
        } catch (error) {
            console.error('Voice recording error:', error);
            this.addMessage('system', 'خطا در دسترسی به میکروفون.');
        }
    }
    
    stopVoiceRecording() {
        if (this.state.mediaRecorder && this.state.isRecording) {
            this.state.mediaRecorder.stop();
            this.state.isRecording = false;
            this.elements.voiceRecording.classList.remove('active');
            this.elements.voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            this.elements.voiceBtn.style.color = '';
            clearInterval(this.recordingTimer);
        }
    }
    
    startRecordingTimer() {
        let seconds = 0;
        this.recordingTimer = setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            this.elements.recordingTime.textContent = 
                `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            // Auto stop after 2 minutes
            if (seconds >= 120) {
                this.stopVoiceRecording();
            }
        }, 1000);
    }
    
    async sendVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        formData.append('sessionId', this.state.sessionId);
        
        try {
            const response = await fetch(`${this.options.backendUrl}/api/voice`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage('user', '🎤 پیام صوتی ارسال شد');
                if (data.transcript) {
                    this.addMessage('assistant', data.transcript);
                }
            } else {
                this.addMessage('system', 'خطا در پردازش پیام صوتی.');
            }
        } catch (error) {
            console.error('Voice message error:', error);
            this.addMessage('system', 'خطا در ارسال پیام صوتی.');
        }
    }
    
    showEmojiPicker() {
        // Simple emoji picker implementation
        const emojis = ['😊', '😂', '🥰', '😎', '🤔', '👍', '❤️', '🔥', '🎉', '🤝'];
        
        if (this.emojiPicker) {
            this.emojiPicker.remove();
            this.emojiPicker = null;
            return;
        }
        
        this.emojiPicker = document.createElement('div');
        this.emojiPicker.className = 'emoji-picker';
        this.emojiPicker.style.cssText = `
            position: absolute;
            bottom: 100%;
            right: 0;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 8px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            z-index: 1000000;
        `;
        
        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            btn.style.cssText = `
                width: 32px;
                height: 32px;
                border: none;
                background: none;
                cursor: pointer;
                font-size: 20px;
                border-radius: 6px;
                transition: background 0.2s;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#f3f4f6';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'none';
            });
            btn.addEventListener('click', () => {
                this.elements.messageInput.value += emoji;
                this.emojiPicker.remove();
                this.emojiPicker = null;
                this.elements.messageInput.focus();
            });
            this.emojiPicker.appendChild(btn);
        });
        
        this.elements.emojiBtn.parentElement.appendChild(this.emojiPicker);
        
        // Close picker when clicking outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (this.emojiPicker && 
                    !this.emojiPicker.contains(e.target) && 
                    e.target !== this.elements.emojiBtn) {
                    this.emojiPicker.remove();
                    this.emojiPicker = null;
                }
            }, { once: true });
        });
    }
    
    showSuggestions(suggestions) {
        const container = document.createElement('div');
        container.className = 'suggestions';
        container.style.marginTop = '12px';
        
        suggestions.forEach(suggestion => {
            const btn = document.createElement('button');
            btn.className = 'suggestion';
            btn.textContent = suggestion;
            btn.addEventListener('click', () => {
                this.elements.messageInput.value = suggestion;
                this.sendMessage();
                container.remove();
            });
            container.appendChild(btn);
        });
        
        this.elements.messagesContainer.appendChild(container);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }
    
    // Public API methods
    open() {
        this.toggleChat();
    }
    
    close() {
        this.closeChat();
    }
    
    send(message) {
        this.elements.messageInput.value = message;
        this.sendMessage();
    }
    
    setUserInfo({ name, email, phone }) {
        if (name) localStorage.setItem('user_name', name);
        if (email) localStorage.setItem('user_email', email);
        if (phone) localStorage.setItem('user_phone', phone);
    }
    
    getHistory() {
        return this.state.messages;
    }
    
    clearHistory() {
        this.state.messages = [];
        this.elements.messagesContainer.innerHTML = '';
        this.addMessage('system', 'تاریخچه گفتگو پاک شد.');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.EnhancedChatWidget = new EnhancedChatWidget();
    });
} else {
    window.EnhancedChatWidget = new EnhancedChatWidget();
}

// Global initialization function
window.initEnhancedChatWidget = function(options) {
    return new EnhancedChatWidget(options);
};
