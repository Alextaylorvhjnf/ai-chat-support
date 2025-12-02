const axios = require('axios');

class AIService {
    constructor() {
        this.apiKey = process.env.GROQ_API_KEY;
        this.apiUrl = process.env.GROQ_API_URL;
        this.model = process.env.AI_MODEL || 'llama3-8b-8192';
        
        if (!this.apiKey) {
            throw new Error('GROQ_API_KEY is required');
        }
    }
    
    async processMessage(message, sessionId) {
        try {
            const response = await axios.post(
                this.apiUrl,
                {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'شما یک دستیار هوشمند فارسی هستید. پاسخ‌های شما باید کوتاه، مفید و به زبان فارسی باشد. اگر اطلاعات کافی برای پاسخ ندارید، صادقانه بگویید که نمی‌دانید و کاربر را به اپراتور انسانی ارجاع دهید.'
                        },
                        {
                            role: 'user',
                            content: message
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 1024,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            if (response.data.choices && response.data.choices.length > 0) {
                const aiResponse = response.data.choices[0].message.content;
                
                // Check if AI couldn't answer properly
                const cannotAnswerPatterns = [
                    'نمی دانم',
                    'اطلاعاتی ندارم',
                    'نمی‌توانم پاسخ دهم',
                    'پاسخ آن را نمی‌دانم',
                    'سوال خود را دقیق‌تر بیان کنید'
                ];
                
                const cannotAnswer = cannotAnswerPatterns.some(pattern => 
                    aiResponse.toLowerCase().includes(pattern)
                );
                
                if (cannotAnswer || aiResponse.length < 10) {
                    return {
                        aiResponse: aiResponse,
                        needsHuman: true,
                        fallbackMessage: 'اطلاعات کافی برای پاسخ وجود ندارد. در صورت تمایل می‌توانید به اپراتور انسانی متصل شوید.'
                    };
                }
                
                return {
                    aiResponse: aiResponse,
                    needsHuman: false
                };
            }
            
            throw new Error('No response from AI');
            
        } catch (error) {
            console.error('AI Service Error:', error.message);
            
            if (error.response) {
                console.error('AI Response Error:', error.response.data);
            }
            
            return {
                aiResponse: null,
                needsHuman: true,
                fallbackMessage: 'خطا در پردازش پیام. لطفاً به اپراتور انسانی متصل شوید.',
                error: error.message
            };
        }
    }
    
    canAnswer(message) {
        // Simple check if message is valid for AI
        const minLength = 3;
        const maxLength = 500;
        
        if (!message || message.length < minLength) {
            return false;
        }
        
        if (message.length > maxLength) {
            return false;
        }
        
        // Check for inappropriate content
        const blockedPatterns = [
            /سکس/gi,
            /پورن/gi,
            /فحش/gi,
            /ناسزا/gi
        ];
        
        return !blockedPatterns.some(pattern => pattern.test(message));
    }
}

// Singleton instance
const aiService = new AIService();

module.exports = {
    processAIMessage: (message, sessionId) => aiService.processMessage(message, sessionId),
    canAnswer: (message) => aiService.canAnswer(message)
};
