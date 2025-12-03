// frontend/chatbot-widget.js
class ChatbotWidget {
  constructor(options = {}) {
    this.options = {
      serverUrl: options.serverUrl || window.location.origin.replace('http', 'ws'),
      position: options.position || 'bottom-right',
      primaryColor: options.primaryColor || '#4361ee',
      secondaryColor: options.secondaryColor || '#3a0ca3',
      botName: options.botName || 'پشتیبان هوشمند',
      botAvatar: options.botAvatar || '🤖',
      humanAvatar: options.humanAvatar || '👨‍💼',
      userAvatar: options.userAvatar || '👤',
      ...options
    };
    
    this.sessionId = null;
    this.socket = null;
    this.isOpen = false;
    this.isHumanMode = false;
    this.messages = [];
    
    this.init();
  }
  
  init() {
    this.createWidget();
    this.connectWebSocket();
    this.loadStyles();
  }
  
  createWidget() {
    // Create container
    this.container = document.createElement('div');
    this.container.className = 'chatbot-widget-container';
    this.container.style.cssText = `
      position: fixed;
      ${this.options.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      ${this.options.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
      z-index: 999999;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    
    // Create button
    this.button = document.createElement('button');
    this.button.className = 'chatbot-toggle-button';
    this.button.innerHTML = `
      <span class="chatbot-icon">💬</span>
      <span class="chatbot-text">پشتیبانی</span>
    `;
    this.button.style.cssText = `
      background: ${this.options.primaryColor};
      color: white;
      border: none;
      border-radius: 50px;
      padding: 12px 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
    `;
    
    this.button.onclick = () => this.toggleChat();
    this.button.onmouseenter = () => {
      this.button.style.transform = 'scale(1.05)';
      this.button.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
    };
    this.button.onmouseleave = () => {
      this.button.style.transform = 'scale(1)';
      this.button.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    };
    
    // Create chat window
    this.chatWindow = document.createElement('div');
    this.chatWindow.className = 'chatbot-window';
    this.chatWindow.style.cssText = `
      position: absolute;
      ${this.options.position.includes('bottom') ? 'bottom: 70px;' : 'top: 70px;'}
      ${this.options.position.includes('right') ? 'right: 0;' : 'left: 0;'}
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;
    
    // Create header
    const header = document.createElement('div');
    header.className = 'chatbot-header';
    header.style.cssText = `
      background: ${this.options.primaryColor};
      color: white;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    `;
    header.innerHTML = `
      <div class="chatbot-header-icon" style="font-size: 24px;">${this.options.botAvatar}</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 16px;">${this.options.botName}</div>
        <div style="font-size: 12px; opacity: 0.9;" id="chat-status">آنلاین</div>
      </div>
      <button id="chat-close" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 4px;">×</button>
    `;
    
    // Create messages container
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'chatbot-messages';
    this.messagesContainer.style.cssText = `
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    
    // Create input area
    const inputArea = document.createElement('div');
    inputArea.className = 'chatbot-input-area';
    inputArea.style.cssText = `
      padding: 15px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 10px;
    `;
    
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'پیام خود را بنویسید...';
    this.input.style.cssText = `
      flex: 1;
      padding: 12px 15px;
      border: 2px solid #eee;
      border-radius: 10px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.3s;
    `;
    this.input.onfocus = () => this.input.style.borderColor = this.options.primaryColor;
    this.input.onblur = () => this.input.style.borderColor = '#eee';
    this.input.onkeypress = (e) => {
      if (e.key === 'Enter') this.sendMessage();
    };
    
    const sendButton = document.createElement('button');
    sendButton.innerHTML = '📤';
    sendButton.style.cssText = `
      background: ${this.options.primaryColor};
      color: white;
      border: none;
      border-radius: 10px;
      width: 44px;
      cursor: pointer;
      font-size: 18px;
      transition: background 0.3s;
    `;
    sendButton.onclick = () => this.sendMessage();
    sendButton.onmouseenter = () => sendButton.style.background = this.options.secondaryColor;
    sendButton.onmouseleave = () => sendButton.style.background = this.options.primaryColor;
    
    // Assemble chat window
    inputArea.appendChild(this.input);
    inputArea.appendChild(sendButton);
    
    this.chatWindow.appendChild(header);
    this.chatWindow.appendChild(this.messagesContainer);
    this.chatWindow.appendChild(inputArea);
    
    // Add close button handler
    header.querySelector('#chat-close').onclick = () => this.toggleChat();
    
    // Assemble container
    this.container.appendChild(this.button);
    this.container.appendChild(this.chatWindow);
    
    // Add to page
    document.body.appendChild(this.container);
    
    // Add welcome message
    this.addMessage({
      sender: 'bot',
      message: 'سلام! 👋 من پشتیبان هوشمند شما هستم. چطور می‌تونم کمکتون کنم؟',
      timestamp: new Date()
    });
  }
  
  loadStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .chatbot-messages::-webkit-scrollbar {
        width: 6px;
      }
      .chatbot-messages::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
      }
      .chatbot-messages::-webkit-scrollbar-thumb {
        background: #ccc;
        border-radius: 3px;
      }
      .chatbot-messages::-webkit-scrollbar-thumb:hover {
        background: #aaa;
      }
      .message {
        max-width: 80%;
        padding: 12px 16px;
        border-radius: 18px;
        line-height: 1.4;
        word-wrap: break-word;
      }
      .message-user {
        background: ${this.options.primaryColor};
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }
      .message-bot {
        background: #f0f2f5;
        color: #333;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      .message-human {
        background: #e3f2fd;
        color: #1565c0;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        border: 1px solid #bbdefb;
      }
      .message-time {
        font-size: 11px;
        opacity: 0.7;
        margin-top: 4px;
        text-align: right;
      }
      .human-connect-button {
        background: linear-gradient(135deg, ${this.options.primaryColor}, ${this.options.secondaryColor});
        color: white;
        border: none;
        border-radius: 10px;
        padding: 10px 20px;
        margin: 10px 0;
        cursor: pointer;
        font-weight: 600;
        text-align: center;
        transition: transform 0.3s;
      }
      .human-connect-button:hover {
        transform: translateY(-2px);
      }
      .typing-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .typing-dot {
        width: 8px;
        height: 8px;
        background: #ccc;
        border-radius: 50%;
        animation: typing 1.4s infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = this.options.serverUrl || `${protocol}//${window.location.host}`;
    
    this.socket = new WebSocket(serverUrl);
    
    this.socket.onopen = () => {
      console.log('Connected to WebSocket server');
      document.getElementById('chat-status').textContent = 'آنلاین';
      document.getElementById('chat-status').style.color = '#4caf50';
    };
    
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'session-init') {
        this.sessionId = data.sessionId;
        console.log('Session initialized:', this.sessionId);
      } else if (data.type === 'message-to-website') {
        this.handleIncomingMessage(data);
      } else if (data.type === 'human-connected') {
        this.isHumanMode = true;
        document.getElementById('chat-status').textContent = 'متصل به اپراتور';
        document.getElementById('chat-status').style.color = '#ff9800';
        this.addMessage({
          sender: 'system',
          message: data.message,
          timestamp: new Date()
        });
      } else if (data.type === 'error') {
        this.addMessage({
          sender: 'system',
          message: `خطا: ${data.message}`,
          timestamp: new Date()
        });
      }
    };
    
    this.socket.onclose = () => {
      console.log('Disconnected from WebSocket server');
      document.getElementById('chat-status').textContent = 'آفلاین';
      document.getElementById('chat-status').style.color = '#f44336';
      
      // Try to reconnect after 5 seconds
      setTimeout(() => this.connectWebSocket(), 5000);
    };
    
    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.addMessage({
        sender: 'system',
        message: 'خطای اتصال. لطفاً صفحه را رفرش کنید.',
        timestamp: new Date()
      });
    };
  }
  
  handleIncomingMessage(data) {
    if (data.showHumanButton) {
      const buttonContainer = document.createElement('div');
      buttonContainer.style.textAlign = 'center';
      buttonContainer.innerHTML = `
        <div class="message message-bot">
          ${data.message}
        </div>
        <button class="human-connect-button" onclick="window.chatbotWidget.connectToHuman()">
          اتصال به اپراتور انسانی
        </button>
      `;
      this.messagesContainer.appendChild(buttonContainer);
    } else {
      this.addMessage({
        sender: data.sender === 'human' ? 'human' : 'bot',
        message: data.message,
        timestamp: new Date()
      });
    }
    
    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  addMessage({ sender, message, timestamp }) {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${sender}`;
    
    const timeString = timestamp.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    messageEl.innerHTML = `
      <div>${message}</div>
      <div class="message-time">${timeString}</div>
    `;
    
    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  sendMessage() {
    const message = this.input.value.trim();
    if (!message || !this.sessionId) return;
    
    // Add user message to chat
    this.addMessage({
      sender: 'user',
      message: message,
      timestamp: new Date()
    });
    
    // Send to server
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const messageData = {
        type: 'message-from-website',
        sessionId: this.sessionId,
        message: message
      };
      this.socket.send(JSON.stringify(messageData));
    }
    
    // Clear input
    this.input.value = '';
  }
  
  connectToHuman() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const connectData = {
        type: 'connect-to-human',
        sessionId: this.sessionId
      };
      this.socket.send(JSON.stringify(connectData));
      
      // Show typing indicator
      const typingEl = document.createElement('div');
      typingEl.className = 'message message-bot';
      typingEl.innerHTML = `
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      `;
      this.messagesContainer.appendChild(typingEl);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }
  
  toggleChat() {
    this.isOpen = !this.isOpen;
    this.chatWindow.style.display = this.isOpen ? 'flex' : 'none';
    
    if (this.isOpen) {
      this.input.focus();
      // Scroll to bottom
      setTimeout(() => {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }, 100);
    }
  }
}

// Expose to global scope
window.ChatbotWidget = ChatbotWidget;
