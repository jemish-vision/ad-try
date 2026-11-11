/**
 * Fake clock for tests. Returns a fixed "now" so date logic is deterministic.
 *
 *   const clock = createFakeClock("2026-10-09T05:30:00.000Z");
 *   clock.now();            // Date
 *   clock.advance(60_000);  // move forward 60s
 */
function createFakeClock(start = "2026-01-01T00:00:00.000Z") {
  let current = new Date(start).getTime();
  if (Number.isNaN(current)) throw new Error(`Invalid start date: ${start}`);
  return {
    now: () => new Date(current),
    nowMs: () => current,
    advance(ms) {
      current += ms;
      return new Date(current);
    },
    set(date) {
      current = new Date(date).getTime();
    },
  };
}

module.exports = { createFakeClock };
