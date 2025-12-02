const { Server } = require('socket.io');

function setupWebSocket(server, sessionManager) {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });
    
    io.on('connection', (socket) => {
        console.log(`🔌 WebSocket connected: ${socket.id}`);
        
        // Extract session ID from handshake
        const sessionId = socket.handshake.query.sessionId;
        
        if (!sessionId) {
            console.warn('⚠️ No sessionId provided, disconnecting');
            socket.disconnect();
            return;
        }
        
        // Register socket with session manager
        sessionManager.registerSocket(sessionId, socket.id);
        
        // Send connection confirmation
        socket.emit('connected', {
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            message: 'Connected to chat server'
        });
        
        // Handle incoming messages from website
        socket.on('user_message', async (data) => {
            try {
                const { text, sessionId: msgSessionId } = data;
                
                if (!text || !msgSessionId) {
                    socket.emit('error', { message: 'Invalid message format' });
                    return;
                }
                
                // Get session
                let session = sessionManager.getSession(msgSessionId);
                if (!session) {
                    // Create new session if doesn't exist
                    session = sessionManager.createSession({
                        userId: `user_${Date.now()}`,
                        ip: socket.handshake.address,
                        userAgent: socket.handshake.headers['user-agent']
                    });
                }
                
                // Add message to session
                sessionManager.addMessage(msgSessionId, {
                    type: 'user',
                    text: text,
                    socketId: socket.id
                });
                
                // Check session mode
                if (session.mode === 'ai') {
                    // Process with AI
                    const { processAIMessage } = require('./ai-service');
                    const aiResponse = await processAIMessage(text, msgSessionId);
                    
                    if (aiResponse.needsHuman) {
                        // Suggest human connection
                        socket.emit('ai_response', {
                            text: aiResponse.fallbackMessage || 'اطلاعات کافی برای پاسخ وجود ندارد.',
                            needsHuman: true,
                            sessionId: msgSessionId
                        });
                        
                        // Switch to human mode
                        sessionManager.updateSession(msgSessionId, { mode: 'human' });
                        
                        // Notify admin
                        const bot = require('./telegram-bot');
                        if (bot && bot.notifyNewHumanSession) {
                            bot.notifyNewHumanSession(session);
                        }
                        
                    } else {
                        // Send AI response
                        socket.emit('ai_response', {
                            text: aiResponse.aiResponse,
                            needsHuman: false,
                            sessionId: msgSessionId
                        });
                        
                        // Add AI response to session
                        sessionManager.addMessage(msgSessionId, {
                            type: 'ai',
                            text: aiResponse.aiResponse
                        });
                    }
                    
                } else if (session.mode === 'human') {
                    // Forward to Telegram if connected
                    if (session.telegramChatId) {
                        const bot = require('./telegram-bot');
                        if (bot && bot.sendToTelegram) {
                            await bot.sendToTelegram(
                                session.telegramChatId,
                                `👤 کاربر: ${text}`
                            );
                        }
                    } else {
                        // Waiting for operator
                        socket.emit('status', {
                            message: 'در انتظار اتصال اپراتور...',
                            sessionId: msgSessionId
                        });
                    }
                }
                
            } catch (error) {
                console.error('WebSocket message error:', error);
                socket.emit('error', {
                    message: 'خطا در پردازش پیام',
                    sessionId: data?.sessionId
                });
            }
        });
        
        // Handle human connection request
        socket.on('request_human', (data) => {
            const { sessionId } = data;
            
            if (!sessionId) {
                socket.emit('error', { message: 'Session ID required' });
                return;
            }
            
            const session = sessionManager.getSession(sessionId);
            if (!session) {
                socket.emit('error', { message: 'Session not found' });
                return;
            }
            
            // Switch to human mode
            sessionManager.updateSession(sessionId, { mode: 'human' });
            
            // Notify admin
            const bot = require('./telegram-bot');
            if (bot && bot.notifyNewHumanSession) {
                bot.notifyNewHumanSession(session);
            }
            
            socket.emit('human_requested', {
                message: 'درخواست شما برای اپراتور انسانی ارسال شد. لطفاً منتظر بمانید.',
                sessionId: sessionId
            });
        });
        
        // Handle disconnect
        socket.on('disconnect', (reason) => {
            console.log(`🔌 WebSocket disconnected: ${socket.id}, reason: ${reason}`);
            
            // Unregister socket
            if (sessionId) {
                sessionManager.unregisterSocket(sessionId);
            }
        });
        
        // Handle errors
        socket.on('error', (error) => {
            console.error(`WebSocket error for ${socket.id}:`, error);
        });
    });
    
    // Broadcast helper function
    io.broadcastToSession = (sessionId, event, data) => {
        const socketId = sessionManager.getSocketId(sessionId);
        if (socketId) {
            io.to(socketId).emit(event, data);
        }
    };
    
    return io;
}

module.exports = setupWebSocket;
