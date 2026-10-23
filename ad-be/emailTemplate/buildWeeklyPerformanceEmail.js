const METRIC_LABELS = {
  spend: "Ad Spend",
  revenue: "Revenue",
  acos: "Ad Cost of Sales (ACoS)",
  roas: "Return on Ad Spend (ROAS)",
  impressions: "Impressions",
  clicks: "Clicks",
  orders: "Orders",
  cpc: "Cost per Click (CPC)",
  cvr: "Conversion Rate (CVR)",
};

const CURRENCY_CONFIG = {
  INR: { symbol: "₹", badgeColor: "#e8f0fb", textColor: "#02468B" },
  USD: { symbol: "$", badgeColor: "#e8f5ee", textColor: "#166534" },
  EUR: { symbol: "€", badgeColor: "#fef3e2", textColor: "#92400e" },
  GBP: { symbol: "£", badgeColor: "#f3e8ff", textColor: "#6b21a8" },
};

const CURRENCY_METRICS = new Set(["spend", "revenue", "cpc"]);
const PERCENT_METRICS = new Set(["acos", "cvr"]);
const RATIO_METRICS = new Set(["roas"]);

// ─── Formatters ───────────────────────────────────────────────
function getSymbol(currency) {
  return (CURRENCY_CONFIG[currency] || { symbol: "$" }).symbol;
}

function formatCompact(key, value, currency = "USD") {
  const symbol = getSymbol(currency);
  if (value == null || value === "") return "—";
  const num = parseFloat(value);

  if (CURRENCY_METRICS.has(key)) {
    if (num >= 1000) return `${symbol}${(num / 1000).toFixed(2)}K`;
    return `${symbol}${num.toFixed(2)}`;
  }
  if (PERCENT_METRICS.has(key)) return `${num.toFixed(2)}%`;
  if (RATIO_METRICS.has(key)) return `${num.toFixed(2)}x`;

  // Plain numbers (impressions, clicks, orders) — compact above 1L
  if (num >= 100000) return `${(num / 100000).toFixed(2)}L`;
  return Number(num).toLocaleString("en-IN");
}

function formatFull(key, value, currency = "USD") {
  const symbol = getSymbol(currency);
  if (value == null || value === "") return "—";
  const num = parseFloat(value);

  if (CURRENCY_METRICS.has(key)) return `${symbol}${num.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  if (PERCENT_METRICS.has(key)) return `${num.toFixed(2)}%`;
  if (RATIO_METRICS.has(key)) return `${num.toFixed(2)}x`;
  return Number(num).toLocaleString("en-IN");
}

// ─── Helpers ──────────────────────────────────────────────────
function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function currencyBadgeHTML(currency) {
  const cfg = CURRENCY_CONFIG[currency] || { symbol: "?", badgeColor: "#eee", textColor: "#333" };
  return `<span style="background:${cfg.badgeColor}; color:${cfg.textColor}; font-size:10px; font-weight:700; padding:2px 7px; border-radius:4px; font-family:Arial,sans-serif;">${cfg.symbol} ${currency}</span>`;
}

// ─── Number cell with title tooltip (works in Gmail too) ──────
function numCell(key, value, currency, bgColor) {
  const compact = formatCompact(key, value, currency);
  const full = formatFull(key, value, currency);
  // "title" attribute works as native tooltip in all email clients & browsers
  return `<td title="${full}" style="padding:11px 14px; text-align:center; color:#374151; border-bottom:1px solid #edf0f4; font-family:'DM Mono',monospace,Arial; font-size:13px; background:${bgColor}; cursor:default;">${compact}</td>`;
}

// ─── Main builder ─────────────────────────────────────────────
function colHeader(label, dateRange) {
  return `
    <th style="color:rgba(255,255,255,0.9); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; padding:10px 14px; text-align:center; font-family:Arial,sans-serif; line-height:1.4;">
      ${label}
      <br/>
      <span style="font-size:10px; font-weight:400; opacity:0.75; text-transform:none; letter-spacing:0;">
        ${dateRange.from} – ${dateRange.to}
      </span>
    </th>
  `;
}

exports.buildWeeklyPerformanceEmail = ({ userName, profiles = [], dashboardUrl, dateRanges = {} }) => {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const periods = [
    { key: "last7Days", label: "Last 7 Days", tag: "Last 7 Days" },
    { key: "last30Days", label: "Last 30 Days", tag: "Last 30 Days" },
    { key: "mtd", label: "This Month (MTD)", tag: "This Month" },
    { key: "ytd", label: "This Year (YTD)", tag: "This Year" },
  ];

  const profilesHTML = profiles.map((p) => {
    const currency = (p.currency || "USD").toUpperCase();
    const initials = getInitials(p.companyName);

    const rows = Object.entries(METRIC_LABELS).map(([key, label], i) => {
      const bg = i % 2 === 0 ? "#ffffff" : "#f7fafd";
      const metricCell = `<td style="padding:11px 14px; font-weight:600; color:#0d1f3c; font-size:12px; font-family:'DM Sans',Arial,sans-serif; border-bottom:1px solid #edf0f4; background:${bg};">● ${label}</td>`;
      const dataCells = periods.map(({ key: period }) =>
        numCell(key, p.data[period]?.[key], currency, bg)
      ).join("");
      return `<tr>${metricCell}${dataCells}</tr>`;
    }).join("");

    return `
    <!-- Profile Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #dce6f0; border-radius:12px; overflow:hidden; margin-bottom:28px; border-collapse:separate;">

      <!-- Profile Header -->
      <tr style="background:#f7fafd;">
        <td colspan="5" style="padding:14px 20px; border-bottom:1.5px solid #dce6f0;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:40px; vertical-align:middle;">
                <div style="width:36px; height:36px; background:#02468B; border-radius:8px; text-align:center; line-height:36px; color:#fff; font-size:13px; font-weight:700; font-family:Arial,sans-serif;">${initials}</div>
              </td>
              <td style="padding-left:12px; vertical-align:middle;">
                <div style="font-size:15px; font-weight:700; color:#0d1f3c; font-family:'DM Sans',Arial,sans-serif;">${p.companyName}</div>
                <div style="font-size:12px; color:#7a90a8; margin-top:3px; font-family:Arial,sans-serif;">
                  ${p.profileName} &nbsp;·&nbsp; ${currencyBadgeHTML(currency)}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Column Headers -->
      <tr style="background:#02468B;">
        <th style="color:rgba(255,255,255,0.9); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; padding:10px 14px; text-align:left; font-family:Arial,sans-serif;">Metric</th>
        ${periods.map(({ label, key: pKey }) =>
      colHeader(label, dateRanges[pKey] || { from: "—", to: "—" })
    ).join("")}
      </tr>

      <!-- Data Rows -->
      ${rows}
    </table>
    `;
  }).join("");

  return `
  <div style="font-family:'DM Sans',Arial,sans-serif; background:#e8eef5; padding:32px 16px;">
  <div style="max-width:780px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 8px 40px rgba(2,70,139,0.12);">

    <!-- Header -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#02468B;">
      <tr>
        <td style="padding:24px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#fff; font-size:20px; font-weight:700; font-family:'DM Sans',Arial,sans-serif;">
                Advertise IQ
              </td>
              <td align="right">
                <span style="background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.9); font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; padding:5px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.2); font-family:Arial,sans-serif;">
                  Weekly Report
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Greeting -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5fb; border-bottom:1px solid #dce6f0;">
      <tr>
        <td style="padding:28px 36px;">
          <div style="display:inline-block; background:#02468B; color:#fff; font-size:11px; font-weight:600; padding:3px 12px; border-radius:20px; margin-bottom:12px; font-family:Arial,sans-serif;">${today}</div>
          <h1 style="margin:0 0 8px; font-size:22px; font-weight:700; color:#0d1f3c; font-family:'DM Sans',Arial,sans-serif;">Hello, ${userName || "User"} 👋</h1>
          <p style="margin:0; font-size:14px; color:#607080; font-family:Arial,sans-serif;">Here's your weekly advertising performance summary across all profiles.</p>
        </td>
      </tr>
    </table>

    <!-- Body -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:28px 36px;">
          ${profilesHTML}

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafd; border:1.5px solid #dce6f0; border-radius:12px;">
            <tr>
              <td style="padding:24px 20px; text-align:center;">
                <p style="margin:0 0 16px; font-size:14px; color:#607080; font-family:Arial,sans-serif;">Want deeper insights? View live charts and campaign breakdowns on your dashboard.</p>
                <a href="${dashboardUrl}" style="display:inline-block; background:#02468B; color:#fff; text-decoration:none; font-size:14px; font-weight:700; padding:13px 32px; border-radius:8px; font-family:Arial,sans-serif;">
                  Open My Dashboard
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Footer -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #edf0f4;">
      <tr>
        <td style="padding:20px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:12px; color:#aab5c0; font-family:Arial,sans-serif;">© ${new Date().getFullYear()} Advertise IQ. All rights reserved.</td>
              <td align="right">
                <a href="#" style="color:#02468B; font-size:12px; font-weight:500; text-decoration:none; font-family:Arial,sans-serif;">Unsubscribe</a>
                &nbsp;&nbsp;
                <a href="#" style="color:#02468B; font-size:12px; font-weight:500; text-decoration:none; font-family:Arial,sans-serif;">Preferences</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

  </div>
  </div>
  `;
};