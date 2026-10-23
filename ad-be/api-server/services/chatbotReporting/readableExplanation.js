'use strict';

const LABELS = {
  spend: 'Spend',
  sales: 'Ad sales',
  acos: 'ACOS',
  roas: 'ROAS',
  orders: 'Orders',
  cpc: 'CPC',
  cvr: 'Conversion rate',
  clicks: 'Clicks',
  impressions: 'Impressions',
  ctr: 'Click-through rate',
  aov: 'Average order value',
  tacos: 'TACOS',
  profit: 'Profit',
  stock: 'Stock',
  days_of_stock: 'Days of stock',
};

// Reuse the three formatting rules across cards and table summaries.
// Match the KPI cards' grouping (ReportKPICards.formatMetricValue). Both are pinned
// to en-US so the narrative and the cards never disagree (e.g. 1,507,100 in both,
// never 15,07,100 in the text beside 1,507,100 on the card).
const NUMBER_FORMATTERS = {
  currency: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  count: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  ratio: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
};

function formatValue(value, unit, currencyCode) {
  if (!Number.isFinite(value)) return 'Not available';
  const formatter = NUMBER_FORMATTERS[unit] || NUMBER_FORMATTERS.ratio;
  const number = formatter.format(value);
  if (unit === 'percent') return `${number}%`;
  if (unit === 'multiple') return `${number}×`;
  if (unit === 'currency') return `${currencyCode || 'Amount'} ${number}`;
  return number;
}

function profileLabel(report, profileId) {
  const profiles = report.scope?.profiles || [];
  const index = profiles.findIndex(profile => profile.profileId === profileId);
  return profiles[index]?.name || (profiles.length > 1 ? `Profile ${index + 1}` : 'Selected profile');
}

function adTypeLabel(adType) {
  return { SP: 'Sponsored Products', SB: 'Sponsored Brands', SD: 'Sponsored Display' }[adType] || '';
}

function scopeLabel(report, profileId, adType, currencyCode) {
  return [profileLabel(report, profileId), adTypeLabel(adType), currencyCode].filter(Boolean).join(' · ');
}

function missingRequirements(report) {
  const raw = (report.freshness?.missingInputs || []).join(' ');
  const messages = [];
  if (/coverage|complete.*source|matched reporting periods|conflict.free/i.test(raw)) {
    messages.push('Some advertising records are still being checked. Available figures may change as reporting completes.');
  }
  if (/keyword inventory/i.test(raw)) messages.push('A current keyword list is needed to check which search terms are already keywords.');
  if (/target ACOS/i.test(raw)) messages.push('Tell me your target ACOS to evaluate growth opportunities.');
  if (/budget exhaustion|budget utilization/i.test(raw)) messages.push('Budget history is needed to identify campaigns that ran out of budget.');
  if (/hourly orders?|units.*order|order conversion/i.test(raw)) {
    messages.push('Hourly order counts are not available, so I cannot reliably compare conversion rates or identify wasted spend by hour or weekday.');
  }
  if (/total.*sales.*organic|reconciled.*total.*sales/i.test(raw)) {
    messages.push('Total product sales, including organic sales, are needed to complete this product report.');
  }
  if (/Seller account.*connection|SP-API/i.test(raw)) {
    messages.push("This profile's Amazon Seller account is not connected, so product sales, inventory, profit and TACOS are unavailable. Connect the Seller account to enable these reports; advertising reports still work.");
  }
  if (/costs|fees/i.test(raw)) messages.push('Product costs and fees are needed to calculate profit after advertising.');
  if (/inventory|sellable stock/i.test(raw) && !/keyword inventory/i.test(raw)) messages.push('Current product inventory is needed to identify low stock.');
  if (/No matching rule-history records/i.test(raw)) {
    messages.push('No matching rule-history records were found for this period. This does not confirm that no changes occurred.');
  }
  if (/too much hourly data|shorter date range/i.test(raw)) {
    messages.push('This report contains too much hourly data to load. Try fewer dates or select one campaign.');
  }
  if (/applied.*event|applied.*timestamp|rule effectiveness/i.test(raw)) messages.push('A confirmed rule change and comparable results before and after it are needed to evaluate rule performance.');
  if (/intraday|partial period|partial hour|today.*updating/i.test(raw)) messages.push('Today is still updating. A reliable comparison for today is not available yet.');
  if (raw && !messages.length) messages.push('Some information needed for this answer is not available yet.');
  return [...new Set(messages)];
}

function explainReport(report) {
  const paragraphs = [];
  const weekdayReport = report.category === 'time' && (report.datasets || []).some(dataset => (
    dataset.columns?.some(column => column.key === 'weekday')
      && !dataset.columns.some(column => column.key === 'hour')
  ));
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const timeDimensions = report.category === 'time'
    ? (report.datasets || []).find(dataset => /^report_\d+$/.test(dataset.id))?.columns
      ?.map(column => column.key).filter(key => ['hour', 'weekday'].includes(key)) || []
    : [];
  const readableTimeName = (row, rawName) => {
    const values = String(rawName).split(' / ');
    const time = { hour: row.hour, weekday: row.weekday };
    if (values.length === timeDimensions.length && values.every(value => /^\d{1,2}$/.test(value))) {
      timeDimensions.forEach((key, index) => { time[key] ??= Number(values[index]); });
    }
    const day = weekdays[time.weekday];
    const hour = Number.isInteger(time.hour) && time.hour >= 0 && time.hour <= 23
      ? `${String(time.hour).padStart(2, '0')}:00` : '';
    return [day, hour].filter(Boolean).join(' ') || String(rawName);
  };
  const hasAnalysisText = report.text && !report.text.startsWith('Read-only ') && !report.text.includes('automatic explanations, opportunity checks and anomaly analysis are added in Step 5');
  if (report.status === 'partial') {
    paragraphs.push('Here are the available results. Some data is incomplete, so these figures may change.');
  }
  if (report.status === 'unavailable') paragraphs.push('I do not have enough information to answer this reliably yet.');
  if (report.status === 'empty') {
    paragraphs.push(report.category === 'rules'
      ? 'No rule changes were recorded for this period.'
      : 'No results matched this report. This does not mean the account had no activity.');
  }

  // Use each calculated value with its own label and unit. Percent values are
  // already percentages; multiplying them by 100 would change the answer.
  const groups = new Map();
  for (const card of report.cards || []) {
    const profile = report.scope?.profiles?.find(item => card.title?.includes(item.profileId))
      || report.scope?.profiles?.[0];
    const adType = card.title?.match(/\b(SP|SB|SD)\b/)?.[1];
    const currency = card.currencyCode || profile?.currencyCode;
    const label = scopeLabel(report, profile?.profileId, adType, currency);
    if (!groups.has(label)) groups.set(label, []);
    const value = `${LABELS[card.metric] || card.metric}: ${formatValue(card.value, card.unit, currency)}`;
    groups.get(label).push(value);
  }
  for (const [label, values] of groups) paragraphs.push(`**${label}**\n${values.join(' · ')}`);

  if (hasAnalysisText) {
    let cleanText = report.text;
    for (const [index, profile] of (report.scope?.profiles || []).entries()) {
      cleanText = cleanText.replaceAll(profile.profileId, report.scope.profiles.length === 1 ? 'Selected profile' : `Profile ${index + 1}`);
    }
    cleanText = cleanText.replace(/^(?:Selected profile|Profile \d+)\/(?:SP|SB|SD):\s*/gm, '');
    paragraphs.push(cleanText);
  }

  if (!groups.size && !hasAnalysisText && !['empty', 'unavailable'].includes(report.status)) {
    const sources = (report.blocks || []).filter(block => block.type === 'table' && !/comparison\s*$/.test(block.title || ''));
    let remaining = 5;
    for (const block of sources) {
      const dataset = report.datasets?.find(item => item.id === block.datasetId);
      if (!dataset?.rows?.length || !remaining) continue;
      const columns = dataset.columns.filter(column => LABELS[column.key] && column.type === 'number');
      if (!columns.length) continue;
      const first = dataset.rows[0];
      paragraphs.push(`**${scopeLabel(report, first.profileId, first.adType, dataset.currencyCode)}**`);
      for (const row of dataset.rows.slice(0, remaining)) {
        const rawName = row.name || row.searchTerm || row.placement || row.productId || 'Result';
        const name = timeDimensions.length ? readableTimeName(row, rawName) : weekdayReport && /^[0-6]$/.test(String(rawName))
          ? weekdays[Number(rawName)]
          : String(rawName).replace(/\b\d{13,20}\b/g, 'Selected profile');
        const values = columns.map(column => `${LABELS[column.key]}: ${formatValue(row[column.key], column.unit, dataset.currencyCode)}`);
        paragraphs.push(`${name} — ${values.join(' · ')}`);
        remaining -= 1;
      }
    }
    if (remaining < 5) paragraphs.push('See the table for the remaining results.');
  }

  // Analysis text must not hide missing inputs, such as keyword inventory or
  // confirmed rule events. These limits still apply when a table has rows.
  paragraphs.push(...missingRequirements(report));
  if (report.status === 'partial' && ['change', 'unusual'].includes(report.category)) {
    paragraphs.push('These results do not establish a confirmed cause.');
  }
  return paragraphs.join('\n\n') || 'The available results are shown below.';
}

module.exports = { explainReport, formatValue, missingRequirements };
