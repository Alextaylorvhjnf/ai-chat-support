const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

class Session {
  constructor(id, userInfo = {}) {
    this.id = id;
    this.userInfo = userInfo;
    this.messages = [];
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.connectedToHuman = false;
    this.telegramChatId = null;
    this.operatorId = null;
    this.isActive = true;
  }

  addMessage(role, content) {
    const message = {
      id: uuidv4(),
      role, // 'user', 'ai', 'operator', 'system'
      content,
      timestamp: new Date()
    };
    
    this.messages.push(message);
    this.lastActivity = new Date();
    
    // Keep only last 50 messages
    if (this.messages.length > 50) {
      this.messages = this.messages.slice(-50);
    }
    
    return message;
  }

  connectToHuman(telegramChatId, operatorId) {
    this.connectedToHuman = true;
    this.telegramChatId = telegramChatId;
    this.operatorId = operatorId;
    this.addMessage('system', 'Connected to human operator');
  }

  disconnectFromHuman() {
    this.connectedToHuman = false;
    this.telegramChatId = null;
    this.operatorId = null;
    this.addMessage('system', 'Disconnected from human operator');
  }

  getContext() {
    return this.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  isExpired(timeoutMinutes = 30) {
    const now = new Date();
    const diffMinutes = (now - this.lastActivity) / (1000 * 60);
    return diffMinutes > timeoutMinutes;
  }

  toJSON() {
    return {
      id: this.id,
      userInfo: this.userInfo,
      messageCount: this.messages.length,
      connectedToHuman: this.connectedToHuman,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      isActive: this.isActive
    };
  }
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanupSessions(), 5 * 60 * 1000); // 5 minutes
  }

  createSession(sessionId = null, userInfo = {}) {
    const id = sessionId || uuidv4();
    const session = new Session(id, userInfo);
    this.sessions.set(id, session);
    
    console.log(`Session created: ${id}`);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId, updates) {
    const session = this.getSession(sessionId);
    if (session && updates) {
      Object.assign(session, updates);
      session.lastActivity = new Date();
    }
    return session;
  }

  endSession(sessionId) {
    const session = this.getSession(sessionId);
    if (session) {
      session.isActive = false;
      session.addMessage('system', 'Session ended');
    }
    return session;
  }

  getActiveSessions() {
    return Array.from(this.sessions.values())
      .filter(session => session.isActive && !session.isExpired());
  }

  getHumanConnectedSessions() {
    return this.getActiveSessions()
      .filter(session => session.connectedToHuman);
  }

  findSessionByTelegramChatId(chatId) {
    for (const session of this.sessions.values()) {
      if (session.telegramChatId === chatId && session.isActive) {
        return session;
      }
    }
    return null;
  }

  cleanupSessions() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [id, session] of this.sessions.entries()) {
      if (session.isExpired(60)) { // 60 minutes timeout for cleanup
        this.sessions.delete(id);
        cleanedCount++;
        console.log(`Cleaned expired session: ${id}`);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned ${cleanedCount} expired sessions`);
    }
    
    return cleanedCount;
  }

  getStats() {
    const active = this.getActiveSessions();
    const humanConnected = this.getHumanConnectedSessions();
    
    return {
      totalSessions: this.sessions.size,
      activeSessions: active.length,
      humanConnectedSessions: humanConnected.length,
      averageMessages: active.length > 0 
        ? active.reduce((sum, s) => sum + s.messages.length, 0) / active.length 
        : 0
    };
  }
}

module.exports = SessionManager;
