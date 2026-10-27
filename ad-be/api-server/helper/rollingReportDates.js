'use strict';

// Report date bounds are inclusive. Rolling presets contain completed dates only.
const ROLLING_DAYS = Object.freeze({
  LAST_7_DAYS: 7,
  LAST_7_DAYS_1: 7,
  LAST_14_DAYS: 14,
  LAST_30_DAYS: 30,
  LAST_65_DAYS: 65,
  LAST_6_MONTHS: 180,
});

function getRollingReportDates(now, dateFilter) {
  const days = Object.prototype.hasOwnProperty.call(ROLLING_DAYS, dateFilter)
    ? ROLLING_DAYS[dateFilter] : undefined;
  if (!days) return undefined;
  return {
    fromDate: now.clone().subtract(days, 'days').format('YYYY-MM-DD'),
    toDate: now.clone().subtract(1, 'day').format('YYYY-MM-DD'),
  };
}

module.exports = { getRollingReportDates };
