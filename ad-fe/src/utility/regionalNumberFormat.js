/**
 * Regional Currency & Number Formatting Utility (Phase 3 - Task 10)
 * Handles Indian Numbering System (Lakhs/Crores) vs Western Numbering (Thousands/Millions/Billions)
 * dynamically based on marketplace / currencyCode.
 */

export const CURRENCY_SYMBOLS = {
  INR: "₹",
  USD: "$",
  CAD: "CA$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  AUD: "A$",
  AED: "AED ",
  SAR: "SAR ",
  MXN: "MX$",
  BRL: "R$",
  SGD: "S$",
};

export function getCurrencySymbol(currencyCode = "INR") {
  return CURRENCY_SYMBOLS[currencyCode] || "$";
}

export function isIndianMarketplace(marketplace = "", currencyCode = "") {
  const mp = (marketplace || "").toUpperCase().trim();
  const cur = (currencyCode || "").toUpperCase().trim();
  return mp === "IN" || mp === "INDIA" || cur === "INR";
}

/**
 * Compact currency formatter:
 * For India: ₹1.24L, ₹3.50Cr, ₹45.2k, ₹850
 * For Global: $1.24M, $3.50B, $45.2k, $850
 */
export function formatRegionalCurrency(amount, currencyCode = "INR", marketplace = "IN", decimals = 2) {
  if (amount == null || isNaN(amount)) return "—";
  const num = Number(amount);
  const isNegative = num < 0;
  const abs = Math.abs(num);
  const symbol = getCurrencySymbol(currencyCode);
  const isIndia = isIndianMarketplace(marketplace, currencyCode);

  let formatted = "";
  if (isIndia) {
    if (abs >= 10000000) {
      formatted = `${(abs / 10000000).toFixed(decimals).replace(/\.00$/, "")}Cr`;
    } else if (abs >= 100000) {
      formatted = `${(abs / 100000).toFixed(decimals).replace(/\.00$/, "")}L`;
    } else if (abs >= 1000) {
      formatted = `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    } else {
      formatted = abs.toLocaleString("en-IN", { maximumFractionDigits: decimals });
    }
  } else {
    if (abs >= 1000000000) {
      formatted = `${(abs / 1000000000).toFixed(decimals).replace(/\.00$/, "")}B`;
    } else if (abs >= 1000000) {
      formatted = `${(abs / 1000000).toFixed(decimals).replace(/\.00$/, "")}M`;
    } else if (abs >= 1000) {
      formatted = `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    } else {
      formatted = abs.toLocaleString("en-US", { maximumFractionDigits: decimals });
    }
  }

  return `${isNegative ? "-" : ""}${symbol}${formatted}`;
}

/**
 * Full currency formatting with regional thousand/lakh separators:
 * e.g. ₹ 1,23,456.78 (India) or $ 123,456.78 (US)
 */
export function formatFullRegionalCurrency(amount, currencyCode = "INR", marketplace = "IN", decimals = 2) {
  if (amount == null || isNaN(amount)) return "—";
  const num = Number(amount);
  const symbol = getCurrencySymbol(currencyCode);
  const isIndia = isIndianMarketplace(marketplace, currencyCode);
  const locale = isIndia ? "en-IN" : "en-US";

  return `${symbol}${num.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Compact number formatting (counts, orders, clicks):
 * e.g. 1.25L vs 125k
 */
export function formatRegionalNumber(value, marketplace = "IN", decimals = 1) {
  if (value == null || isNaN(value)) return "0";
  const num = Number(value);
  const isNegative = num < 0;
  const abs = Math.abs(num);
  const isIndia = isIndianMarketplace(marketplace);

  let formatted = "";
  if (isIndia) {
    if (abs >= 10000000) {
      formatted = `${(abs / 10000000).toFixed(decimals).replace(/\.0$/, "")}Cr`;
    } else if (abs >= 100000) {
      formatted = `${(abs / 100000).toFixed(decimals).replace(/\.0$/, "")}L`;
    } else if (abs >= 1000) {
      formatted = `${(abs / 1000).toFixed(decimals).replace(/\.0$/, "")}k`;
    } else {
      formatted = abs.toLocaleString("en-IN");
    }
  } else {
    if (abs >= 1000000000) {
      formatted = `${(abs / 1000000000).toFixed(decimals).replace(/\.0$/, "")}B`;
    } else if (abs >= 1000000) {
      formatted = `${(abs / 1000000).toFixed(decimals).replace(/\.0$/, "")}M`;
    } else if (abs >= 1000) {
      formatted = `${(abs / 1000).toFixed(decimals).replace(/\.0$/, "")}k`;
    } else {
      formatted = abs.toLocaleString("en-US");
    }
  }

  return `${isNegative ? "-" : ""}${formatted}`;
}

/**
 * Full regional number formatting with commas (e.g., 80,99,653 in IN vs 8,099,653 in US)
 */
export function formatFullRegionalNumber(value, marketplace = "IN", decimals = 0) {
  if (value == null || isNaN(value)) return "0";
  const num = Number(value);
  const isIndia = isIndianMarketplace(marketplace);
  const locale = isIndia ? "en-IN" : "en-US";
  return num.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
