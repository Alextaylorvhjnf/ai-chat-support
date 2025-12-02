(function() {
    'use strict';
    
    const config = {
        serverUrl: window.location.origin.replace('http://', 'ws://').replace('https://', 'wss://'),
        apiUrl: window.location.origin,
        position: 'bottom-right',
        primaryColor: '#007bff',
        title: 'پشتیبانی آنلاین',
        welcomeMessage: 'سلام! 👋 چطور می‌تونم کمک‌تون کنم؟'
    };
    
    let state = {
        isOpen: false,
        isConnected: false,
        userId: null,
        sessionId: null,
        messages: [],
        chatMode: 'ai'
    };
    
    let elements = {};
    let ws = null;
    
    function createWidget() {
        // ایجاد المان‌های HTML
        const widgetContainer = document.createElement('div');
        widgetContainer.id = 'ai-chat-widget';
        widgetContainer.className = 'ai-chat-widget-container';
        
        const toggleButton = document.createElement('button');
        toggleButton.id = 'ai-chat-toggle';
        toggleButton.className = 'ai-chat-toggle';
        toggleButton.innerHTML = '💬';
        toggleButton.title = config.title;
        toggleButton.addEventListener('click', toggleChat);
        
        const chatWindow = document.createElement('div');
        chatWindow.id = 'ai-chat-window';
        chatWindow.className = 'ai-chat-window hidden';
        
        // هدر چت
        const chatHeader = document.createElement('div');
        chatHeader.className = 'ai-chat-header';
        chatHeader.innerHTML = `
            <div class="ai-chat-title">${config.title}</div>
            <div class="ai-chat-status" id="ai-chat-status">● در حال اتصال...</div>
            <button class="ai-chat-close">×</button>
        `;
        chatHeader.querySelector('.ai-chat-close').addEventListener('click', toggleChat);
        
        // بدنه چت
        const chatBody = document.createElement('div');
        chatBody.className = 'ai-chat-body';
        chatBody.id = 'ai-chat-body';
        
        // فوتر چت
        const chatFooter = document.createElement('div');
        chatFooter.className = 'ai-chat-footer';
        chatFooter.innerHTML = `
            <div class="ai-chat-input-container">
                <input type="text" class="ai-chat-input" id="ai-chat-input" placeholder="پیام خود را بنویسید..." disabled>
                <button class="ai-chat-send-btn" id="ai-chat-send-btn" disabled>↗</button>
            </div>
            <div class="ai-chat-typing hidden" id="ai-chat-typing">
                <div class="typing-dots"><span></span><span></span><span></span></div> در حال تایپ...
            </div>
        `;
        
        // مونتاژ
        chatWindow.appendChild(chatHeader);
        chatWindow.appendChild(chatBody);
        chatWindow.appendChild(chatFooter);
        
        widgetContainer.appendChild(toggleButton);
        widgetContainer.appendChild(chatWindow);
        
        document.body.appendChild(widgetContainer);
        
        // ذخیره المان‌ها
        elements = {
            container: widgetContainer,
            toggleButton: toggleButton,
            window: chatWindow,
            body: chatBody,
            input: document.getElementById('ai-chat-input'),
            sendButton: document.getElementById('ai-chat-send-btn'),
            statusIndicator: document.getElementById('ai-chat-status'),
            typingIndicator: document.getElementById('ai-chat-typing')
        };
        
        // رویدادها
        elements.sendButton.addEventListener('click', sendMessage);
        elements.input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });
        
        // ایجاد sessionId
        state.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // اتصال WebSocket
        connectWebSocket();
        
        // اضافه کردن پیام خوش‌آمدگویی
        addMessage({
            text: config.welcomeMessage,
            sender: 'ai'
        });
    }
    
    function connectWebSocket() {
        try {
            updateStatus('connecting', 'در حال اتصال...');
            ws = new WebSocket(config.serverUrl);
            
            ws.onopen = function() {
                console.log('WebSocket connected');
                state.isConnected = true;
                updateStatus('connected', '● آنلاین');
                enableInput();
            };
            
            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };
            
            ws.onclose = function() {
                console.log('WebSocket disconnected');
                state.isConnected = false;
                updateStatus('disconnected', '● آفلاین');
                disableInput();
                setTimeout(connectWebSocket, 5000);
            };
            
            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
                updateStatus('error', '● خطا در اتصال');
            };
        } catch (error) {
            console.error('Error connecting WebSocket:', error);
        }
    }
    
    function handleWebSocketMessage(data) {
        switch (data.type) {
            case 'connection':
                state.userId = data.userId;
                console.log('User ID received:', state.userId);
                break;
                
            case 'ai_response':
                addMessage({
                    text: data.message,
                    sender: 'ai'
                });
                
                if (data.requiresHuman) {
                    showHumanSupportButton(data.sessionId);
                }
                break;
                
            case 'human_connected':
                state.chatMode = 'human';
                addMessage({
                    text: data.message,
                    sender: 'system'
                });
                updateStatus('human', '● متصل به اپراتور');
                break;
                
            case 'admin_message':
                addMessage({
                    text: data.message,
                    sender: 'admin'
                });
                break;
        }
    }
    
    function sendMessage() {
        const text = elements.input.value.trim();
        if (!text || !state.isConnected || !ws) return;
        
        addMessage({
            text: text,
            sender: 'user'
        });
        
        const messageData = {
            type: 'message',
            content: text,
            sessionId: state.sessionId
        };
        
        ws.send(JSON.stringify(messageData));
        elements.input.value = '';
    }
    
    function addMessage(message) {
        state.messages.push(message);
        
        const messageElement = document.createElement('div');
        messageElement.className = `ai-chat-message ai-chat-message-${message.sender}`;
        
        const time = new Date().toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let senderName = 'شما';
        if (message.sender === 'ai') senderName = 'دستیار هوش مصنوعی';
        if (message.sender === 'admin') senderName = 'اپراتور';
        if (message.sender === 'system') senderName = 'سیستم';
        
        messageElement.innerHTML = `
            <div class="ai-chat-message-header">
                <span class="ai-chat-message-sender">${senderName}</span>
                <span class="ai-chat-message-time">${time}</span>
            </div>
            <div class="ai-chat-message-content">${escapeHtml(message.text)}</div>
        `;
        
        elements.body.appendChild(messageElement);
        elements.body.scrollTop = elements.body.scrollHeight;
    }
    
    function showHumanSupportButton(sessionId) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'ai-chat-human-support';
        buttonContainer.innerHTML = `
            <div class="ai-chat-human-support-message">
                مایلید با اپراتور انسانی صحبت کنید؟
            </div>
            <button class="ai-chat-human-support-btn" data-session-id="${sessionId}">
                اتصال به اپراتور انسانی
            </button>
        `;
        
        elements.body.appendChild(buttonContainer);
        
        const button = buttonContainer.querySelector('.ai-chat-human-support-btn');
        button.addEventListener('click', function() {
            const sessionId = this.getAttribute('data-session-id');
            connectToHuman(sessionId);
            buttonContainer.remove();
        });
    }
    
    function connectToHuman(sessionId) {
        if (!state.isConnected || !ws) return;
        
        ws.send(JSON.stringify({
            type: 'connect_to_human',
            sessionId: sessionId
        }));
        
        addMessage({
            text: 'درخواست اتصال به اپراتور انسانی ارسال شد...',
            sender: 'system'
        });
    }
    
    function toggleChat() {
        state.isOpen = !state.isOpen;
        if (state.isOpen) {
            elements.window.classList.remove('hidden');
            elements.toggleButton.classList.add('active');
            elements.input.focus();
        } else {
            elements.window.classList.add('hidden');
            elements.toggleButton.classList.remove('active');
        }
    }
    
    function updateStatus(status, text) {
        if (elements.statusIndicator) {
            elements.statusIndicator.textContent = text;
            elements.statusIndicator.className = 'ai-chat-status ai-chat-status-' + status;
        }
    }
    
    function enableInput() {
        elements.input.disabled = false;
        elements.input.placeholder = 'پیام خود را بنویسید...';
        elements.sendButton.disabled = false;
    }
    
    function disableInput() {
        elements.input.disabled = true;
        elements.input.placeholder = 'در حال اتصال...';
        elements.sendButton.disabled = true;
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // بارگذاری CSS
    if (!document.getElementById('ai-chat-widget-styles')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = config.apiUrl + '/widget.css';
        link.id = 'ai-chat-widget-styles';
        document.head.appendChild(link);
    }
    
    // API عمومی
    window.AIChatWidget = {
        init: createWidget,
        open: toggleChat,
        close: toggleChat,
        sendMessage: sendMessage
    };
    
    // اجرای خودکار
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createWidget);
    } else {
        createWidget();
    }
})();
