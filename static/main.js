// فایل اصلی JavaScript
console.log('Chatbot application loaded');

// بارگذاری FAQ برای صفحه اصلی
document.addEventListener('DOMContentLoaded', function() {
    // لود FAQها
    fetch('/api/faq')
        .then(response => response.json())
        .then(faqs => {
            console.log(`Loaded ${faqs.length} FAQ items`);
            
            // می‌توانید از FAQها در صفحه اصلی استفاده کنید
            if (window.updateFAQList) {
                window.updateFAQList(faqs);
            }
        })
        .catch(error => {
            console.error('Error loading FAQ:', error);
        });
});

// API عمومی
window.ChatbotAPI = {
    sendMessage: async function(message) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Error sending message:', error);
            return { reply: "خطا در ارسال پیام" };
        }
    },
    
    getFAQ: async function() {
        try {
            const response = await fetch('/api/faq');
            return await response.json();
        } catch (error) {
            console.error('Error getting FAQ:', error);
            return [];
        }
    }
};
