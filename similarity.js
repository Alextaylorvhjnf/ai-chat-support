/**
 * موتور جستجوی شباهت متنی برای FAQ
 * پیاده‌سازی Cosine Similarity و TF-IDF
 */

class SimilaritySearch {
    constructor() {
        this.stopWords = this.getPersianStopWords();
        this.tokenCache = new Map();
    }
    
    // لیست کلمات توقف فارسی
    getPersianStopWords() {
        return new Set([
            'در', 'به', 'از', 'که', 'این', 'را', 'با', 'است', 'یک', 'برای',
            'آن', 'هم', 'بود', 'شد', 'تا', 'کرد', 'شده', 'شود', 'باشد',
            'های', 'هایش', 'ترین', 'تر', 'می', 'هایم', 'ها', 'و', 'یا',
            'اما', 'اگر', 'چون', 'چه', 'همان', 'همین', 'همه', 'همچنین',
            'بر', 'بی', 'چه', 'خواهد', 'دیگر', 'رو', 'زیر', 'سپس', 'غم',
            'قبل', 'لا', 'مگر', 'نه', 'ولی', 'پس', 'چرا', 'چگونه', 'کجا',
            'کدام', 'کس', 'کی', 'گو', 'گیرد', 'گفت', 'یعنی', 'آیا', 'اند'
        ]);
    }
    
    // پیش‌پردازش متن: نرمال‌سازی، حذف علائم و tokenization
    preprocess(text) {
        const cacheKey = `preprocess:${text}`;
        if (this.tokenCache.has(cacheKey)) {
            return this.tokenCache.get(cacheKey);
        }
        
        // تبدیل به حروف کوچک
        let processed = text.toLowerCase();
        
        // حذف علائم نگارشی
        processed = processed.replace(/[\.،؛:!?؟,;'"`\[\]{}()<>]/g, ' ');
        
        // حذف اعداد
        processed = processed.replace(/\d+/g, ' ');
        
        // حذف فاصله‌های اضافی
        processed = processed.replace(/\s+/g, ' ').trim();
        
        // tokenization
        const tokens = processed.split(' ').filter(token => token.length > 1);
        
        // حذف کلمات توقف
        const filteredTokens = tokens.filter(token => !this.stopWords.has(token));
        
        // stem ساده برای کلمات فارسی
        const stemmedTokens = filteredTokens.map(token => this.simpleStem(token));
        
        this.tokenCache.set(cacheKey, stemmedTokens);
        return stemmedTokens;
    }
    
    // stemming ساده برای فارسی
    simpleStem(word) {
        // حذف پسوندهای رایج فارسی
        const suffixes = ['ها', 'های', 'ترین', 'تر', 'ی', 'ان', 'ات', 'م', 'ت', 'ش'];
        
        for (const suffix of suffixes) {
            if (word.endsWith(suffix) && word.length > suffix.length + 1) {
                return word.slice(0, -suffix.length);
            }
        }
        
        return word;
    }
    
    // ساخت بردار TF برای یک متن
    buildTFVector(tokens) {
        const vector = {};
        let maxFreq = 0;
        
        // شمارش فرکانس‌ها
        for (const token of tokens) {
            vector[token] = (vector[token] || 0) + 1;
            maxFreq = Math.max(maxFreq, vector[token]);
        }
        
        // نرمال‌سازی به TF
        for (const token in vector) {
            vector[token] = vector[token] / maxFreq;
        }
        
        return vector;
    }
    
    // محاسبه IDF برای تمام مستندات
    calculateIDF(documents) {
        const idf = {};
        const N = documents.length;
        
        for (const doc of documents) {
            const uniqueTokens = new Set(doc.tokens);
            for (const token of uniqueTokens) {
                idf[token] = (idf[token] || 0) + 1;
            }
        }
        
        // محاسبه IDF واقعی
        for (const token in idf) {
            idf[token] = Math.log(N / (idf[token] + 1)) + 1; // Smoothing
        }
        
        return idf;
    }
    
    // محاسبه Cosine Similarity بین دو بردار
    cosineSimilarity(vecA, vecB) {
        // جمع آوری تمام کلیدها
        const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (const key of allKeys) {
            const a = vecA[key] || 0;
            const b = vecB[key] || 0;
            
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }
        
        if (normA === 0 || normB === 0) {
            return 0;
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    
    // جستجوی بهترین تطابق در FAQ
    findBestMatch(query, faqData, threshold = 0.3) {
        if (!faqData || faqData.length === 0) {
            return null;
        }
        
        // پیش‌پردازش سوال
        const queryTokens = this.preprocess(query);
        const queryVector = this.buildTFVector(queryTokens);
        
        // محاسبه IDF برای FAQ (اگر لازم باشد)
        const documents = faqData.map(faq => ({
            tokens: this.preprocess(faq.question),
            faq: faq
        }));
        
        const idf = this.calculateIDF(documents);
        
        let bestMatch = null;
        let bestScore = 0;
        
        // محاسبه شباهت با هر سوال FAQ
        for (const doc of documents) {
            // ساخت بردار TF برای سوال FAQ
            const docVector = this.buildTFVector(doc.tokens);
            
            // اعمال IDF برای تبدیل به TF-IDF
            const queryTFIDF = {};
            const docTFIDF = {};
            
            // برای سوال کاربر
            for (const token in queryVector) {
                queryTFIDF[token] = queryVector[token] * (idf[token] || 1);
            }
            
            // برای سوال FAQ
            for (const token in docVector) {
                docTFIDF[token] = docVector[token] * (idf[token] || 1);
            }
            
            // محاسبه شباهت
            const similarity = this.cosineSimilarity(queryTFIDF, docTFIDF);
            
            // ذخیره بهترین تطابق
            if (similarity > bestScore) {
                bestScore = similarity;
                bestMatch = {
                    question: doc.faq.question,
                    answer: doc.faq.answer,
                    score: similarity,
                    tokens: doc.tokens
                };
            }
        }
        
        // اگر بهترین امتیاز بالاتر از آستانه باشد
        if (bestScore >= threshold) {
            console.log(`🔍 تطابق FAQ یافت شد: ${bestScore.toFixed(3)}`);
            return bestMatch;
        }
        
        console.log(`🔍 هیچ تطابق FAQ بالاتر از آستانه ${threshold} یافت نشد (بهترین: ${bestScore.toFixed(3)})`);
        return null;
    }
    
    // جستجوی چندتایی (برای پیشنهادات)
    findTopMatches(query, faqData, limit = 3, threshold = 0.1) {
        if (!faqData || faqData.length === 0) {
            return [];
        }
        
        // پیش‌پردازش سوال
        const queryTokens = this.preprocess(query);
        const queryVector = this.buildTFVector(queryTokens);
        
        // محاسبه IDF
        const documents = faqData.map(faq => ({
            tokens: this.preprocess(faq.question),
            faq: faq
        }));
        
        const idf = this.calculateIDF(documents);
        
        const matches = [];
        
        // محاسبه شباهت با هر سوال
        for (const doc of documents) {
            const docVector = this.buildTFVector(doc.tokens);
            
            // تبدیل به TF-IDF
            const queryTFIDF = {};
            const docTFIDF = {};
            
            for (const token in queryVector) {
                queryTFIDF[token] = queryVector[token] * (idf[token] || 1);
            }
            
            for (const token in docVector) {
                docTFIDF[token] = docVector[token] * (idf[token] || 1);
            }
            
            const similarity = this.cosineSimilarity(queryTFIDF, docTFIDF);
            
            if (similarity >= threshold) {
                matches.push({
                    question: doc.faq.question,
                    answer: doc.faq.answer,
                    score: similarity,
                    tokens: doc.tokens
                });
            }
        }
        
        // مرتب‌سازی بر اساس امتیاز
        matches.sort((a, b) => b.score - a.score);
        
        // برگرداندن بهترین matches
        return matches.slice(0, limit);
    }
    
    // محاسبه شباهت بین دو متن مستقیم
    calculateTextSimilarity(text1, text2) {
        const tokens1 = this.preprocess(text1);
        const tokens2 = this.preprocess(text2);
        
        const vector1 = this.buildTFVector(tokens1);
        const vector2 = this.buildTFVector(tokens2);
        
        return this.cosineSimilarity(vector1, vector2);
    }
}

// تابع سراسری برای استفاده در سایر فایل‌ها
function calculateSimilarity(text1, text2) {
    const similarityEngine = new SimilaritySearch();
    return similarityEngine.calculateTextSimilarity(text1, text2);
}

// تابع جستجوی FAQ
function searchFAQ(query, faqData, threshold = 0.3) {
    const similarityEngine = new SimilaritySearch();
    return similarityEngine.findBestMatch(query, faqData, threshold);
}

// تابع جستجوی چندتایی
function searchFAQMultiple(query, faqData, limit = 3, threshold = 0.1) {
    const similarityEngine = new SimilaritySearch();
    return similarityEngine.findTopMatches(query, faqData, limit, threshold);
}

// اکسپورت برای استفاده در ماژول‌ها
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SimilaritySearch,
        calculateSimilarity,
        searchFAQ,
        searchFAQMultiple
    };
}
