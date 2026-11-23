export function normalizeRecommendationDateRange(range) {
  if (!Array.isArray(range) || !range[0] || !range[1]) return null;
  const dates = range.slice(0, 2).map(value => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        ? date : new Date(NaN);
    }
    return new Date(value);
  });
  if (dates.some(value => !Number.isFinite(value.getTime())) || dates[0] > dates[1]) return null;
  return dates;
}

export function recommendationDateRangePayload(range) {
  const dates = normalizeRecommendationDateRange(range);
  if (!dates) return {};
  const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { fromDate: ymd(dates[0]), toDate: ymd(dates[1]) };
}
