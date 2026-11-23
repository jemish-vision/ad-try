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
  EGP: "EGP ",
  TRY: "₺",
  PLN: "zł ",
  SEK: "kr ",
};

/** Currency of the selected profile (localStorage "profile"), e.g. "SAR". Falls back to INR. */
export function getActiveCurrencyCode() {
  try {
    const raw = localStorage.getItem("profile");
    const parsed = raw ? JSON.parse(raw) : null;
    const code = parsed?.currencyCode || parsed?.profile?.currencyCode;
    if (code && typeof code === "string") return code.toUpperCase();
  } catch (e) { /* ignore */ }
  return "INR";
}

/** Symbol for a currency; unknown codes show the code itself (e.g. "QAR "), never another currency's symbol. */
export function getCurrencySymbol(currencyCode) {
  const code = String(currencyCode || getActiveCurrencyCode()).toUpperCase();
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

/**
 * Indian (lakh/crore) grouping? Decided by the currency when one is known — a SAR or USD amount is
 * never grouped the Indian way, whatever the marketplace default is.
 */
export function isIndianMarketplace(marketplace = "", currencyCode = "") {
  const cur = (currencyCode || "").toUpperCase().trim();
  if (cur) return cur === "INR";
  const mp = (marketplace || "").toUpperCase().trim();
  return mp === "IN" || mp === "INDIA";
}

/**
 * Compact currency formatter:
 * For India: ₹1.24L, ₹3.50Cr, ₹45.2k, ₹850
 * For Global: $1.24M, $3.50B, $45.2k, $850
 */
export function formatRegionalCurrency(amount, currencyCode, marketplace = "IN", decimals = 2) {
  if (amount == null || isNaN(amount)) return "—";
  currencyCode = currencyCode || getActiveCurrencyCode();
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
export function formatFullRegionalCurrency(amount, currencyCode, marketplace = "IN", decimals = 2) {
  if (amount == null || isNaN(amount)) return "—";
  currencyCode = currencyCode || getActiveCurrencyCode();
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
