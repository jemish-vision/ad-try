const { getRollingReportDates } = require('./rollingReportDates');

// Share completed rolling dates with every other rule family.
function getTargetingRuleDate(now, dateFilter, fallback) {
  const rollingDates = getRollingReportDates(now, dateFilter);
  if (rollingDates) return rollingDates;
  if (dateFilter === 'YESTERDAY') {
    const yesterday = now.clone().subtract(1, 'day').format('YYYY-MM-DD');
    return { fromDate: yesterday, toDate: yesterday };
  }
  const lookback = /^LAST_(\d+)_DAYS(_1)?$/.exec(dateFilter || '');
  if (lookback && Number(lookback[1]) > 0) {
    const end = now.clone().subtract(lookback[2] ? 1 : 0, 'day');
    return {
      fromDate: end.clone().subtract(Number(lookback[1]) - 1, 'day').format('YYYY-MM-DD'),
      toDate: end.format('YYYY-MM-DD'),
    };
  }
  return fallback;
}
module.exports = { getTargetingRuleDate };
