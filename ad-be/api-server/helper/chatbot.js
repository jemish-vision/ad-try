const supportQASchema = require("../models/supportQA.model");

const stopWords = [
    "i", "me", "my", "we", "us", "our", "you", "your", "he", "she", "it", "they", "them",
    "is", "am", "are", "was", "were", "be", "been", "being", "a", "an", "the", "and",
    "or", "but", "of", "for", "on", "in", "to", "with", "at", "by", "from", "as", "this",
    "that", "these", "those", "do", "does", "did", "have", "has", "had", "will", "would",
    "can", "could", "should"
];

exports.getMeaningfulWord = (message) => {
    if (!message) return [];
    return message.toLowerCase().replace(/[^\w\s]/gi, "").split(/\s+/).filter(w => w && !stopWords.includes(w));
}

exports.getMostMatchedFAQ = async (message) => {
    const userWords = this.getMeaningfulWord(message)
    if (!userWords.length) return null;

    const faqs = await supportQASchema.find().lean();
    let bestMatch = null;
    let highestPercentage = 0;

    faqs.forEach((faq) => {
        const faqWords = faq.question.toLowerCase().replace(/[^\w\s]/gi, "").split(/\s+/).filter((w) => w && !stopWords.includes(w));

        if (!faqWords.length) return;

        // Count matched words
        const matchedWords = userWords.filter((w) => faqWords.includes(w));

        // Match percentage: matched words / total FAQ words
        const percentage = (matchedWords.length / faqWords.length) * 100;

        if (percentage > highestPercentage) {
            highestPercentage = percentage;
            bestMatch = faq;
        }
    });

    if (!bestMatch) return null;

    return {
        question: bestMatch.question,
        answer: bestMatch.answer,
        matchPercentage: Math.round(highestPercentage),
    };
}