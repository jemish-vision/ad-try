export const getCurrencySymbol = (code) => {
  let currenccy = code;
  if (!currenccy) {
    try {
      const profile = localStorage.getItem("profile");
      if (profile) {
        const parsed = JSON.parse(profile);
        if (parsed?.currencyCode) {
          currenccy = parsed.currencyCode;
        }
      }
    } catch (e) {}
  }
  if (!currenccy || typeof currenccy !== "string") {
    currenccy = "INR";
  }

  const map = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    CAD: "C$",
    AUD: "A$",
    JPY: "¥",
    AED: "AED",
    SAR: "SAR",
    MXN: "$",
    BRL: "R$",
    SEK: "kr",
    PLN: "zł",
    SGD: "S$",
    TRY: "₺",
  };
  if (map[currenccy]) return map[currenccy];

  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currenccy,
    }).formatToParts(0);
    const symbolPart = parts.find((part) => part.type === 'currency');
    return symbolPart ? symbolPart.value : currenccy;
  } catch (err) {
    return currenccy || "₹";
  }
};

const MARKETPLACE_MIN_BIDS = {
  INR: 1.00,
  USD: 0.02,
  CAD: 0.02,
  GBP: 0.02,
  EUR: 0.02,
  JPY: 2.00,
  AUD: 0.10,
  MXN: 0.10,
  BRL: 0.07,
  AED: 0.24,
  SAR: 0.24,
  SGD: 0.02,
  TRY: 0.50,
  SEK: 0.20,
  PLN: 0.10,
  EGP: 0.24,
};

const COUNTRY_MIN_BIDS = {
  IN: 1.00,
  US: 0.02,
  CA: 0.02,
  UK: 0.02,
  GB: 0.02,
  DE: 0.02,
  FR: 0.02,
  IT: 0.02,
  ES: 0.02,
  NL: 0.02,
  JP: 2.00,
  AU: 0.10,
  MX: 0.10,
  BR: 0.07,
  AE: 0.24,
  SA: 0.24,
  SG: 0.02,
  TR: 0.50,
  SE: 0.20,
  PL: 0.10,
  EG: 0.24,
};

export const getMarketplaceMinBid = (currencyCode, countryCode) => {
  let curr = currencyCode;
  let country = countryCode;

  if (!curr && !country) {
    try {
      const profile = localStorage.getItem("profile");
      if (profile) {
        const parsed = JSON.parse(profile);
        curr = parsed?.currencyCode || parsed?.profile?.currencyCode;
        country = parsed?.countryCode || parsed?.profile?.countryCode;
      }
    } catch (e) {}
  }

  if (curr && typeof curr === "string") {
    const upperCurr = curr.trim().toUpperCase();
    if (MARKETPLACE_MIN_BIDS[upperCurr] !== undefined) {
      return MARKETPLACE_MIN_BIDS[upperCurr];
    }
  }

  if (country && typeof country === "string") {
    const upperCountry = country.trim().toUpperCase();
    if (COUNTRY_MIN_BIDS[upperCountry] !== undefined) {
      return COUNTRY_MIN_BIDS[upperCountry];
    }
  }

  return 0.02;
};

function CurrencyCode(amount, code) {
  let num = amount;
  let currenccy = code;

  if (typeof amount === "object" && amount !== null) {
    currenccy = amount.code || amount.currencyCode;
    num = amount.amount !== undefined ? amount.amount : 0;
  }

  let defaultCurrency = "INR";
  try {
    const profile = localStorage.getItem("profile");
    if (profile) {
      const parsed = JSON.parse(profile);
      if (parsed?.currencyCode) {
        defaultCurrency = parsed.currencyCode;
      }
    }
  } catch (e) {}

  if (!currenccy || typeof currenccy !== "string") {
    currenccy = defaultCurrency;
  }

  if (num === undefined || num === null) {
    num = 0;
  }

  try {
    const currency = Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currenccy,
    }).format(num);
    return currency;
  } catch (err) {
    return `${currenccy} ${num}`;
  }
}

export default CurrencyCode;