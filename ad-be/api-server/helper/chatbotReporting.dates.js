'use strict';

const moment = require('moment-timezone');
const DATE_FORMAT = 'YYYY-MM-DD';
const PRESETS = new Set(['yesterday', 'today', 'last_7_days', 'last_14_days',
  'last_30_days', 'this_week', 'last_week', 'custom']);
const MODES = new Set(['none', 'previous_period', 'previous_week', 'custom']);

function fail(message) {
  throw new RangeError(message);
}

function localDate(value, timezone) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('Dates must use YYYY-MM-DD');
  }

  const date = moment.tz(value, DATE_FORMAT, true, timezone);
  if (!date.isValid() || date.format(DATE_FORMAT) !== value) {
    fail('Invalid calendar date');
  }

  return date;
}

function assertFields(intent, discriminator, allowed) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    fail('Period intent must be an object');
  }
  if (!allowed.has(intent[discriminator])) {
    fail(`Unsupported ${discriminator}`);
  }

  const fields = intent[discriminator] === 'custom' ? [discriminator, 'fromDate',
    'toDate'] : [discriminator];
  if (Object.keys(intent).some(key => !fields.includes(key))) {
    fail('Unexpected period fields');
  }
}

function dayCount(start, last) {
  return last.clone().startOf('day').diff(start.clone().startOf('day'), 'days') + 1;
}

function customDates(intent, timezone, today) {
  const start = localDate(intent.fromDate, timezone);
  const last = localDate(intent.toDate, timezone);
  if (start.isAfter(last)) {
    fail('fromDate must not follow toDate');
  }
  if (last.isAfter(today)) {
    fail('Future reporting dates are not supported');
  }
  if (dayCount(start, last) > 366) {
    fail('Reporting periods cannot exceed 366 calendar days');
  }

  return {
    start,
    last
  };
}

function endOnDate(last, clock) {
  if (!clock) {
    return last.clone().add(1, 'day').startOf('day');
  }
  // Moment resolves nonexistent local DST times forward and ambiguous times to
  // the earlier offset. Comparisons preserve wall-clock time where it exists.
  return moment.tz(`${last.format(DATE_FORMAT)}T${clock.format('HH:mm:ss.SSS')}`,
    'YYYY-MM-DDTHH:mm:ss.SSS', true, last.tz());
}

function serialize(range) {
  if (!range.end.isAfter(range.start)) {
    fail('Reporting window must have positive duration');
  }

  return {
    fromDate: range.start.format(DATE_FORMAT),
    toDate: range.last.format(DATE_FORMAT),
    startAt: range.start.toISOString(),
    endBefore: range.end.toISOString(),
    isPartial: range.partial
  };
}

/** Resolve inclusive profile-local dates to start-inclusive/end-exclusive UTC instants. */
function resolveReportPeriods(
  periodIntent,
  comparisonIntent = { mode: 'none' },
  options = {}
) {
  const {
    timezone,
    now = new Date()
  } = options;
  if (typeof timezone !== 'string' || !moment.tz.zone(timezone)) {
    fail('A valid profile timezone is required');
  }
  // Strings must describe an instant, not an environment-dependent local time.
  if (!(now instanceof Date) && (typeof now !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/i.test(now))) {
    fail('now must be a Date or ISO instant with an offset');
  }

  const instant = now instanceof Date ? moment(now) : moment.parseZone(now, moment.ISO_8601, true);
  if (!instant.isValid()) {
    fail('Invalid now instant');
  }

  const currentTime = instant.clone().tz(timezone);
  const today = currentTime.clone().startOf('day');
  assertFields(periodIntent, 'preset', PRESETS);
  assertFields(comparisonIntent, 'mode', MODES);
  let start;
  let last;
  let partial = false;
  switch (periodIntent.preset) {
    case 'today':
      start = today.clone();
      last = today.clone();
      partial = true;
      break;
    case 'yesterday':
      start = today.clone().subtract(1, 'day');
      last = start.clone();
      break;
    case 'this_week':
      start = today.clone().startOf('isoWeek');
      last = today.clone();
      partial = true;
      break;
    case 'last_week':
      start = today.clone().startOf('isoWeek').subtract(1, 'week');
      last = start.clone().add(6, 'days');
      break;
    case 'custom':
      ({
        start,
        last
      } = customDates(periodIntent, timezone, today));
      partial = last.isSame(today);
      break;
    default: {
      const days = Number(periodIntent.preset.match(/^last_(\d+)_days$/)[1]);
      start = today.clone().subtract(days, 'days');
      last = today.clone().subtract(1, 'day');
    }
  }

  const current = {
    start,
    last,
    partial,
    end: partial ? currentTime.clone() : endOnDate(last)
  };
  const serializedCurrent = serialize(current);
  if (comparisonIntent.mode === 'none') {
    return {
      timezone,
      current: serializedCurrent,
      comparison: null
    };
  }
  let previousStart;
  let previousLast;
  const count = dayCount(start, last);
  if (comparisonIntent.mode === 'custom') {
    ({
      start: previousStart,
      last: previousLast
    } = customDates(comparisonIntent, timezone, today));
    if (dayCount(previousStart, previousLast) !== count) {
      fail('Comparison must contain the same number of calendar dates');
    }
  } else {
    const compareSameWeekdays = comparisonIntent.mode === 'previous_week'
      || periodIntent.preset === 'this_week';
    const shift = compareSameWeekdays ? 7 : count;
    // Reconstruct each boundary: a current date whose midnight is skipped can
    // start at 01:00, which must not leak into another date's start boundary.
    previousStart = localDate(start.clone().subtract(shift, 'days').format(DATE_FORMAT), timezone);
    previousLast = localDate(last.clone().subtract(shift, 'days').format(DATE_FORMAT), timezone);
  }

  const previous = {
    start: previousStart,
    last: previousLast,
    partial,
    end: endOnDate(previousLast, partial ? currentTime : null)
  };
  const serializedPrevious = serialize(previous);
  if (previous.end.isAfter(currentTime)) {
    fail('Comparison cannot extend into the future');
  }
  if (previous.start.isBefore(current.end) && previous.end.isAfter(current.start)) {
    fail('Comparison cannot overlap the current period');
  }
  if (previous.end.isAfter(current.start)) {
    fail('Comparison must precede the current period');
  }

  return {
    timezone,
    current: serializedCurrent,
    comparison: serializedPrevious
  };
}

module.exports = {
  resolveReportPeriods
};
