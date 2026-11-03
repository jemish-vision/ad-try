/** Drain all targeting items with a bounded number of active tasks, without
 * allocating one pending promise per item. Results retain input ordering.
 * This is a concurrency cap, not a requests-per-second quota; Amazon 429s still
 * use the existing retry/backoff policy and unconfirmed items fail the slot.
 */
function targetingItemConcurrency(value = process.env.TARGETING_RULE_ITEM_CONCURRENCY) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 25) : 5;
}
async function settleTargetingItems(items, worker, { concurrency } = {}) {
    if (!Array.isArray(items)) throw new TypeError('Targeting items must be an array');
    if (typeof worker !== 'function') throw new TypeError('Targeting worker must be a function');
    const results = new Array(items.length);
    let cursor = 0;
    const run = async () => {
        while (cursor < items.length) {
            const index = cursor++;
            try { results[index] = { status: 'fulfilled', value: await worker(items[index], index) }; }
            catch (reason) { results[index] = { status: 'rejected', reason }; }
        }
    };
    await Promise.all(Array.from({ length: Math.min(items.length, targetingItemConcurrency(concurrency)) }, run));
    return results;
}
module.exports = { settleTargetingItems, targetingItemConcurrency };
