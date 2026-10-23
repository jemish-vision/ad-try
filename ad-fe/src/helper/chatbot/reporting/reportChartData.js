import { getCurrencySymbol } from "../../currencyCode/CurrencyCode";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function chartNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatChartValue(value, unit, currencyCode) {
  const number = chartNumber(value);

  if (number === null) return "Unavailable";
  if (unit === "percent") return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  if (unit === "multiple") return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
  if (unit === "currency") {
    return `${getCurrencySymbol(currencyCode)}${number.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function metricKeys(block, dataset) {
  if (block.yKeys?.length) return block.yKeys;
  if (block.valueKey) return [block.valueKey];
  return dataset.columns.filter(column => column.type === "number").map(column => column.key).slice(0, 1);
}

export function cartesianData(block, dataset) {
  const rows = dataset.rows || [];
  const keys = metricKeys(block, dataset);
  const xKey = block.xKey;
  const categories = [...new Set(rows.map(row => String(row[xKey] ?? "Unknown")))];
  const columnLabel = key => dataset.columns.find(column => column.key === key)?.label || key;

  if (!block.seriesKey) {
    return {
      categories: rows.map(row => String(row[xKey] ?? "Unknown")),
      keys,
      series: keys.map(key => ({ name: columnLabel(key), data: rows.map(row => chartNumber(row[key])) })),
    };
  }

  const groups = [...new Set(rows.map(row => String(row[block.seriesKey] ?? "Unknown")))];
  const series = [];
  const seriesKeys = [];

  for (const group of groups) {
    for (const key of keys) {
      seriesKeys.push(key);
      series.push({
        name: keys.length === 1 ? group : `${group} · ${columnLabel(key)}`,
        data: categories.map(category => {
          const matching = rows.filter(row => String(row[xKey] ?? "Unknown") === category
            && String(row[block.seriesKey] ?? "Unknown") === group);
          // Duplicate chart coordinates cannot safely be summed for ratio metrics.
          return matching.length === 1 ? chartNumber(matching[0][key]) : null;
        }),
      });
    }
  }

  return { categories, keys: seriesKeys, series };
}

export function donutData(block, dataset) {
  const key = block.yKeys?.[0] || block.valueKey || metricKeys(block, dataset)[0];
  const valid = [];
  let missingCount = 0;

  for (const row of dataset.rows || []) {
    const value = chartNumber(row[key]);

    if (value === null || value < 0) {
      missingCount += 1;
    } else {
      valid.push({ label: String(row[block.xKey] ?? "Unknown"), value });
    }
  }

  valid.sort((left, right) => right.value - left.value);
  const positive = valid.filter(v => v.value > 0);
  const base = positive.length > 0 ? positive : valid;
  const slices = base.length <= 5
    ? base
    : [...base.slice(0, 4), { label: "Other", value: base.slice(4).reduce((sum, row) => sum + row.value, 0) }];

  return { key, missingCount, labels: slices.map(slice => slice.label), series: slices.map(slice => slice.value) };
}

export function heatmapData(block, dataset) {
  const key = block.valueKey || block.yKeys?.[0];
  const weekdayKey = block.yKeys?.[0] || "weekday";
  const hourKey = block.xKey || "hour";
  const cells = new Map();

  for (const row of dataset.rows || []) {
    const weekday = row[weekdayKey];
    const hour = Number(row[hourKey]);

    if (!WEEKDAYS.includes(weekday) || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;

    const coordinate = `${weekday}/${hour}`;
    const status = cells.has(coordinate) ? "conflicting_rows" : row.status || "observed";
    const usable = ["observed", "partial_coverage"].includes(status);
    cells.set(coordinate, { y: usable ? chartNumber(row[key]) : null, status });
  }

  return {
    key,
    series: WEEKDAYS.map(day => ({
      name: day,
      data: Array.from({ length: 24 }, (_, hour) => ({
        x: `${String(hour).padStart(2, "0")}:00`,
        ...(cells.get(`${day}/${hour}`) || { y: null, status: "missing" }),
      })),
    })),
  };
}
