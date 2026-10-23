const { formatTimeBlock } = require("../contracts/jobId");

/**
 * Rounds a Date down to the nearest minute boundary (0 seconds, 0 ms).
 */
function toMinuteBoundary(dateInput = new Date()) {
  const d = new Date(dateInput);
  d.setUTCSeconds(0, 0);
  return d;
}

/**
 * Rounds a Date down to the nearest hour boundary (0 minutes, 0 seconds, 0 ms).
 */
function toHourBoundary(dateInput = new Date()) {
  const d = new Date(dateInput);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * Generates an array of historical hourly occurrences for bounded recovery at startup.
 * @param {number} lookbackHours
 * @returns {Date[]} Array of Date objects for past hour occurrences
 */
function getBoundedLookbackHours(lookbackHours = 2) {
  const occurrences = [];
  const nowHour = toHourBoundary(new Date());

  for (let i = lookbackHours; i >= 1; i--) {
    const pastHour = new Date(nowHour.getTime() - i * 60 * 60 * 1000);
    occurrences.push(pastHour);
  }

  return occurrences;
}

module.exports = {
  toMinuteBoundary,
  toHourBoundary,
  getBoundedLookbackHours,
  formatTimeBlock,
};
