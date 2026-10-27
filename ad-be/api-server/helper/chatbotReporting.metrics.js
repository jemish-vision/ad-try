'use strict';

// All rows must have one reporting grain. If grain metadata is supplied, it must
// be present and identical on every row. Callers also own duplicate prevention
// and tenant/profile/currency/attribution compatibility; this helper cannot infer
// those from numbers and must be invoked separately for incompatible groups.
const BASE_UNITS = Object.freeze({
  spend: 'currency',
  sales: 'currency',
  orders: 'count',
  clicks: 'count',
  impressions: 'count'
});

const STATUSES = new Set(['available', 'missing_data', 'no_sales', 'no_spend', 'no_clicks',
  'no_impressions', 'no_orders']);
const UNITS = new Set(['currency', 'count', 'percent', 'multiple']);

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function validateNumber(value, key, unit) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${key} must be a finite nonnegative number or null`);
  }
  if (unit === 'count' && !Number.isSafeInteger(value)) {
    throw new TypeError(`${key} must be a safe nonnegative integer`);
  }

  return value;
}

function validateConstituentNumber(value, key, unit) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${key} must be a finite number or null`);
  }
  if (['spend', 'clicks', 'impressions'].includes(key) && value < 0) {
    throw new TypeError(`${key} must be a finite nonnegative number or null`);
  }
  if (unit === 'count' && !Number.isSafeInteger(value)) {
    throw new TypeError(`${key} must be a safe integer`);
  }

  return value;
}

function finiteResult(value, label) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} exceeds numeric range`);
  }

  return value;
}

function aggregateTotals(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError('rows must be an array');
  }

  const totals = Object.fromEntries(Object.keys(BASE_UNITS).map(key => [key, 0]));
  let declaredGrain;
  let hasGrain = false;
  for (const [index, row] of rows.entries()) {
    assertRecord(row, `row ${index}`);
    const declared = Object.hasOwn(row, 'grain');
    if (declared && (typeof row.grain !== 'string' || !row.grain.trim())) {
      throw new TypeError('grain must be a nonempty string');
    }
    if (index === 0) {
      hasGrain = declared;
      declaredGrain = row.grain;
    } else if (declared !== hasGrain || declared && row.grain !== declaredGrain) {
      throw new TypeError('rows must use one consistent declared grain');
    }
    for (const [key, unit] of Object.entries(BASE_UNITS)) {
      // Validate every constituent even after a missing value has been seen.
      const value = validateConstituentNumber(row[key], key, unit);
      if (value === null || totals[key] === null) {
        totals[key] = null;
      } else {
        totals[key] = finiteResult(totals[key] + value, key);
      }
    }
  }

  for (const [key, unit] of Object.entries(BASE_UNITS)) {
    if (totals[key] !== null) {
      totals[key] = validateNumber(totals[key], key, unit);
    }
  }

  return totals;
}

function calculateMetrics(totals) {
  assertRecord(totals, 'totals');
  const values = {};
  const metrics = {};
  for (const [key, unit] of Object.entries(BASE_UNITS)) {
    const value = validateNumber(totals[key], key, unit);
    values[key] = value;
    metrics[key] = {
      value,
      unit,
      status: value === null ? 'missing_data' : 'available'
    };
  }

  const ratio = (key, numerator, denominator, unit, zeroStatus, multiplier = 1) => {
    const top = values[numerator];
    const bottom = values[denominator];
    let value = null;
    let status = 'available';
    if (top === null || bottom === null) {
      status = 'missing_data';
    } else if (bottom === 0) {
      status = zeroStatus;
    } else {
      value = finiteResult(top / bottom * multiplier, key);
    }
    metrics[key] = {
      value,
      unit,
      status
    };
  };

  ratio('acos', 'spend', 'sales', 'percent', 'no_sales', 100);
  ratio('roas', 'sales', 'spend', 'multiple', 'no_spend');
  ratio('cpc', 'spend', 'clicks', 'currency', 'no_clicks');
  ratio('cvr', 'orders', 'clicks', 'percent', 'no_clicks', 100);
  ratio('ctr', 'clicks', 'impressions', 'percent', 'no_impressions', 100);
  ratio('aov', 'sales', 'orders', 'currency', 'no_orders');

  return metrics;
}

function validateDescriptor(descriptor, label) {
  if (descriptor === null || descriptor === undefined) {
    return null;
  }
  assertRecord(descriptor, label);
  if (!UNITS.has(descriptor.unit) || !STATUSES.has(descriptor.status)) {
    throw new TypeError(`${label} has an invalid unit or status`);
  }

  const value = validateNumber(descriptor.value, label, descriptor.unit);
  if ((value === null) !== (descriptor.status !== 'available')) {
    throw new TypeError(`${label} value and availability status must agree`);
  }

  return {
    ...descriptor,
    value
  };
}

function compareMetric(currentDescriptor, previousDescriptor) {
  const current = validateDescriptor(currentDescriptor, 'current metric');
  const previous = validateDescriptor(previousDescriptor, 'previous metric');
  if (current && previous && current.unit !== previous.unit) {
    throw new TypeError('comparison metric units must match');
  }

  const comparison = {
    previousValue: previous?.value ?? null,
    absoluteChange: null,
    relativeChangePercent: null,
    percentagePointChange: null,
    status: 'unavailable'
  };

  if (current?.value == null || previous?.value == null) {
    return comparison;
  }
  comparison.absoluteChange = finiteResult(current.value - previous.value, 'absolute change');
  comparison.percentagePointChange = current.unit === 'percent' ? comparison.absoluteChange : null;
  if (previous.value === 0) {
    comparison.status = current.value === 0 ? 'both_zero' : 'new_activity';
  } else {
    comparison.status = 'comparable';
    comparison.relativeChangePercent = finiteResult(comparison.absoluteChange / previous.value * 100, 'relative change');
  }

  return comparison;
}

module.exports = {
  aggregateTotals,
  calculateMetrics,
  compareMetric
};
