const MATCH_TYPE_MAP = {
    EXACT: "Ex",
    PHRASE: "Ph",
    BROAD: "Br",
    TARGETING_EXPRESSION_PREDEFINED: "Auto",
    TARGETING_EXPRESSION: "PT",
};

const toTitleCase = (str) => str.replace(/\b\w/g, (c) => c.toUpperCase());

const MATCH_CODE_PATTERN = /^(Ex|Ph|Br|PT|Auto|EX|PH|BR)\s*-\s*/i;

function extractCampaignCore(campaignName) {
    if (!campaignName) return null;

    // Allow optional leading prefix like "RA - " or custom prefix before "SP - "
    // Pattern: (ANY_PREFIX - )? SP - MATCHTYPE -
    const prefixPattern = /^(?:[A-Za-z0-9_-]+\s*-\s*)?SP\s*-\s*(?:Ex|Ph|Br|PT|Auto|EX|PH|BR)\s*-\s*/i;
    const match = campaignName.match(prefixPattern);
    if (!match) return null;

    let rest = campaignName.slice(match[0].length);

    // Skip any extra stacked match-type segment e.g. "Ph - " in "SP - EX - Ph - Spirulina Powder | ..."
    if (MATCH_CODE_PATTERN.test(rest)) {
        rest = rest.replace(MATCH_CODE_PATTERN, "");
    }

    // Cut at first "|" or " - ", whichever comes first
    const pipeIdx = rest.indexOf("|");
    const dashIdx = rest.indexOf(" - ");
    let core;
    if (pipeIdx !== -1 && (dashIdx === -1 || pipeIdx < dashIdx)) {
        core = rest.slice(0, pipeIdx).trim();
    } else if (dashIdx !== -1) {
        core = rest.slice(0, dashIdx).trim();
    } else {
        core = rest.trim();
    }

    return core || null;
}

/**
 * Returns up to 6 suggested campaign names.
 *
 * @param {Object} data    - Campaign data object (searchTerm, products, campaignName, keywordType, etc.)
 * @param {string} type    - Match type key: "EXACT" | "PHRASE" | "BROAD" | "TARGETING_EXPRESSION" | "TARGETING_EXPRESSION_PREDEFINED"
 * @param {string} prefix  - Optional custom prefix from settings (e.g. "BRAND" or "IQ")
 * @returns {Array<{ name: string, source: "existing"|"ai", label: string }>}
 */
export function getSuggestedCampaignNames(data, type, prefix = "") {
    const products = [...new Set(data.products || [])];
    const keyword = data.searchTerm?.trim() || "";
    const matchType = MATCH_TYPE_MAP[type] || "Ex";
    const prefixStr = prefix && prefix.trim() ? `${prefix.trim()} - ` : "";

    // --- Slot 1: derive from existing campaignName ---
    const existingCore = extractCampaignCore(data.campaignName);
    const suggestions = [];

    if (existingCore) {
        suggestions.push({
            name: `${prefixStr}SP - ${matchType} - ${existingCore} | ${keyword}`,
            source: "existing",
            label: "Recommanded",
        });
    }

    // --- Slots 2-6: AI suggestions from common product words ---
    const normalize = (title) =>
        title
            .toLowerCase()
            .replace(/\([^)]*\)/g, "")                          // remove (Pack of 2), (...)
            .replace(/\b\d+(\.\d+)?\s?(g|kg|ml|l)\b/gi, "")    // remove sizes: 100g, 1kg, etc.
            .replace(/[|,/()-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const normalized = products.map(normalize);

    const wordCount = {};
    normalized.forEach((title) => {
        [...new Set(title.split(" "))].forEach((word) => {
            if (!word) return;
            wordCount[word] = (wordCount[word] || 0) + 1;
        });
    });

    const commonWords = Object.entries(wordCount)
        .filter(([, count]) => count === normalized.length)
        .map(([word]) => word);

    let aiSuggestions = [];

    if (commonWords.length && normalized[0]) {
        const orderedCommonWords = normalized[0]
            .split(" ")
            .filter((w) => commonWords.includes(w));

        for (let size = Math.min(5, orderedCommonWords.length); size >= 1; size--) {
            const phrase = orderedCommonWords.slice(-size).join(" ");
            aiSuggestions.push(`${prefixStr}SP - ${matchType} - ${toTitleCase(phrase)} | ${keyword}`);
        }
    } else {
        aiSuggestions.push(`${prefixStr}SP - ${matchType} - ${toTitleCase(keyword)} | ${keyword}`);
    }

    aiSuggestions = [...new Set(aiSuggestions)];

    let aiIndex = 0;
    for (const name of aiSuggestions) {
        if (suggestions.length >= 6) break;
        if (suggestions.find((s) => s.name === name)) continue;
        suggestions.push({
            name,
            source: "ai",
            label: aiIndex === 0 ? "Best match" : `Suggestion ${aiIndex + 1}`,
        });
        aiIndex++;
    }

    return suggestions.slice(0, 6);
}