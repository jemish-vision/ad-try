const AUTO_TARGETING_MAP = {
    QUERY_HIGH_REL_MATCHES: "close-match",
    QUERY_BROAD_REL_MATCHES: "loose-match",
    ASIN_SUBSTITUTE_RELATED: "substitutes",
    ASIN_ACCESSORY_RELATED: "complements",
    similarProduct: "similar-product",
};

const MATCH_TYPE_MAP = {
    asinSameAs: "Product target - Exact",
    asinCategorySameAs: "Product target - Category",
    asinBrandSameAs: "Brand target",
    similarProduct: "Product target - Expanded",
};

function predicateToSegment({ type, value }) {
    switch (type) {
        case "asinSameAs": return `asin="${value}"`;
        case "asinCategorySameAs": return `Category: ${value}`;
        case "asinBrandSameAs": return `brand="${value}"`;
        case "similarProduct": return `asin-expanded="${value}"`;
        case "asinPriceGreaterThan": return `Price: > ${value}`;
        case "asinPriceLessThan": return `Price: < ${value}`;
        case "asinPriceBetween": return `Price: ${value}`;
        case "asinReviewRatingGreaterThan": return `Rating: > ${value}`;
        case "asinReviewRatingLessThan": return `Rating: < ${value}`;
        case "asinReviewRatingBetween": return `Rating: ${value}`;
        case "asinIsPrimeShippingEligible": return `Prime: ${value}`;
        case "asinAgeRangeSameAs": return `Age Range: ${value}`;
        case "asinGenreSameAs": return `Genre: ${value}`;
        default: return type ?? "";
    }
}

export function resolveTargeting(targetingClause) {
    const {
        expressionType,
        expression = [],
        resolvedExpression = [],
    } = targetingClause;

    let targeting = "";
    let matchType = "";
    let keywordType = "";

    const displayPredicates = expression.map((expr, index) => ({
        type: expr.type,
        value: resolvedExpression[index]?.value ?? expr.value,
    }));

    if (expressionType === "auto") {
        keywordType = "TARGETING_EXPRESSION_PREDEFINED";

        const primaryType = expression[0]?.type ?? "";
        const autoLabel = AUTO_TARGETING_MAP[primaryType] ?? "";

        targeting = autoLabel;
        matchType = autoLabel ? `Automatic - ${autoLabel}` : "";

    } else if (expressionType === "manual") {
        keywordType = "TARGETING_EXPRESSION";

        const primaryType = expression[0]?.type ?? "";

        targeting = displayPredicates.map(predicateToSegment).filter(Boolean).join(", ");
        matchType = MATCH_TYPE_MAP[primaryType] ?? primaryType;
    }

    return { targeting, matchType, keywordType };
}