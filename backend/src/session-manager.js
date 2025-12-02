const NodeCache = require('node-cache');
const { v4: uuidv4 } = require('uuid');

class SessionManager {
    constructor() {
        // Cache sessions for 1 hour
        this.sessions = new NodeCache({ 
            stdTTL: 3600, 
            checkperiod: 600,
            useClones: false 
        });
        
        this.userSockets = new Map(); // sessionId -> socketId
        this.telegramSessions = new Map(); // telegramChatId -> sessionId
    }
    
    createSession(userData = {}) {
        const sessionId = uuidv4();
        const session = {
            id: sessionId,
            userId: userData.userId || `user_${Date.now()}`,
            mode: 'ai', // 'ai' or 'human'
            telegramChatId: null,
            createdAt: new Date(),
            connectedAt: null,
            messages: [],
            userInfo: {
                ip: userData.ip,
                userAgent: userData.userAgent,
                referrer: userData.referrer
            }
        };
        
        this.sessions.set(sessionId, session);
        console.log(`✅ Session created: ${sessionId}`);
        
        return session;
    }
    
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    
    updateSession(sessionId, updates) {
        const session = this.getSession(sessionId);
        if (!session) return null;
        
        Object.assign(session, updates);
        this.sessions.set(sessionId, session);
        
        return session;
    }
    
    addMessage(sessionId, message) {
        const session = this.getSession(sessionId);
        if (!session) return false;
        
        if (!session.messages) {
            session.messages = [];
        }
        
        session.messages.push({
            ...message,
            timestamp: new Date()
        });
        
        // Keep only last 100 messages
        if (session.messages.length > 100) {
            session.messages = session.messages.slice(-100);
        }
        
        this.sessions.set(sessionId, session);
        return true;
    }
    
    connectToTelegram(sessionId, telegramChatId) {
        const session = this.getSession(sessionId);
        if (!session) return false;
        
        session.mode = 'human';
        session.telegramChatId = telegramChatId;
        session.connectedAt = new Date();
        
        this.sessions.set(sessionId, session);
        this.telegramSessions.set(telegramChatId, sessionId);
        
        console.log(`🔗 Session ${sessionId} connected to Telegram: ${telegramChatId}`);
        return true;
    }
    
    disconnectFromTelegram(telegramChatId) {
        const sessionId = this.telegramSessions.get(telegramChatId);
        if (!sessionId) return false;
        
        const session = this.getSession(sessionId);
        if (session) {
            session.mode = 'ai';
            session.telegramChatId = null;
            this.sessions.set(sessionId, session);
        }
        
        this.telegramSessions.delete(telegramChatId);
        return true;
    }
    
    getSessionByTelegramChatId(telegramChatId) {
        const sessionId = this.telegramSessions.get(telegramChatId);
        return sessionId ? this.getSession(sessionId) : null;
    }
    
    registerSocket(sessionId, socketId) {
        this.userSockets.set(sessionId, socketId);
    }
    
    unregisterSocket(sessionId) {
        this.userSockets.delete(sessionId);
    }
    
    getSocketId(sessionId) {
        return this.userSockets.get(sessionId);
    }
    
    cleanupExpiredSessions() {
        const stats = this.sessions.getStats();
        console.log(`🧹 Session cleanup - Active: ${stats.keys}, Hits: ${stats.hits}, Misses: ${stats.misses}`);
    }
    
    getStats() {
        const stats = this.sessions.getStats();
        return {
            activeSessions: stats.keys,
            userSockets: this.userSockets.size,
            telegramConnections: this.telegramSessions.size,
            cacheHits: stats.hits,
            cacheMisses: stats.misses
        };
    }
    
    getAllSessions() {
        const sessionKeys = this.sessions.keys();
        const sessions = [];
        
        for (const key of sessionKeys) {
            const session = this.getSession(key);
            if (session) {
                sessions.push(session);
            }
        }
        
        return sessions;
    }
}

module.exports = SessionManager;
