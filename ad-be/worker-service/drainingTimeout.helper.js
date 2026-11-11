// A deadline cannot cancel a JavaScript promise. Keep the worker slot and
// running-task guard until the actual operation settles, even after a timeout.
async function withDrainingTimeout(promise, ms, name, onTimeout = () => {}) {
  let timeoutError;
  const timer = setTimeout(() => {
    timeoutError = new Error(`Job ${name} exceeded ${ms}ms timeout`);
    // Notification failures must not crash the worker or release its slot.
    Promise.resolve().then(() => onTimeout(timeoutError)).catch(() => {});
  }, ms);
  try {
    const result = await promise;
    if (timeoutError) throw timeoutError;
    return result;
  } catch (error) {
    if (timeoutError && error !== timeoutError) timeoutError.cause = error;
    throw timeoutError || error;
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { withDrainingTimeout };
