// ISO 3166-1 alpha-2 codes (the format of Cloudflare's CF-IPCountry header). Names come from the browser
// (Intl.DisplayNames) in the current UI language.
export const COUNTRY_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","XK","YE","YT","ZA","ZM","ZW",
];

export const CURRENCY_CODES = [
  "USD","EUR","GBP","INR","AED","SAR","QAR","KWD","BHD","OMR","CAD","AUD","NZD","SGD","MYR","IDR","PHP","THB","VND","JPY","KRW","CNY","HKD","TWD",
  "BRL","MXN","ARS","CLP","COP","PEN","ZAR","NGN","EGP","KES","TRY","PLN","SEK","NOK","DKK","CHF","CZK","HUF","RON","ILS","PKR","BDT","LKR","NPR",
];

export const currencySymbols = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥", CNY: "¥", KRW: "₩", AUD: "A$", CAD: "C$", NZD: "NZ$", SGD: "S$", HKD: "HK$",
  AED: "AED ", SAR: "SAR ", BRL: "R$", MXN: "MX$", ZAR: "R", TRY: "₺", PLN: "zł ", CHF: "CHF ", SEK: "kr ", NOK: "kr ", DKK: "kr ",
  ILS: "₪", PHP: "₱", THB: "฿", VND: "₫", IDR: "Rp ", MYR: "RM ", NGN: "₦", PKR: "Rs ", BDT: "৳", EGP: "E£", KWD: "KD ",
};

/** Symbol (or "CODE ") for a currency. */
export const currencySymbol = (code) => {
  const c = String(code || "USD").toUpperCase();
  return currencySymbols[c] ?? `${c} `;
};

/** Localized country name, e.g. "IN" → "India". */
export const countryName = (code, lang) => {
  try {
    return new Intl.DisplayNames([lang || "en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
};

export const countryOptions = (lang) =>
  COUNTRY_CODES.map((c) => ({ value: c, label: `${countryName(c, lang)} (${c})` })).sort((a, b) => a.label.localeCompare(b.label));
