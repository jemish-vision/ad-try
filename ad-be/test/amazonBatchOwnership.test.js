const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture({ beforeRequest, send } = {}) {
    const calls = [];
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/helper/amazonBatch.helper.js'), 'utf8'), {
        module,
        require(name) {
            if (name === './amazonAxios') return async options => {
                calls.push(options);
                if (send) return send(options, calls.length);
                return { status: 207, data: { targetingClauses: { success: options.data.targetingClauses } } };
            };
            if (name === './retryHelper') return { retryWithBackoff: async fn => {
                try { return await fn(); } catch (error) {
                    if (error.code !== 'ECONNRESET') throw error;
                    return fn();
                }
            } };
            return { cron_logs() {} };
        },
    });
    return { calls, run: () => module.exports.batchUpdateSPTargets({
        profile: { profileId: 123, amazonUrl: 'https://example.invalid' },
        checkConfigAds: {}, configId: 'fixture', items: [{ targetId: '11', bid: 3.59 }, { targetId: '12', bid: 3.59 }],
        batchSize: 1, beforeRequest,
    }) };
}

test('existing callers without an ownership hook still process all chunks', async () => {
    const f = fixture();
    const result = await f.run();
    assert.equal(f.calls.length, 2);
    assert.equal(result.successful.length, 2);
    assert.equal(result.failed.length, 0);
});

test('lost ownership before the first request prevents every Amazon send', async () => {
    const f = fixture({ beforeRequest: async () => { throw new Error('ownership lost'); } });
    const result = await f.run();
    assert.equal(f.calls.length, 0);
    assert.equal(result.successful.length, 0);
    assert.equal(result.failed.length, 2);
});

test('ownership is rechecked between chunks and confirmed successes are preserved', async () => {
    let checks = 0;
    const f = fixture({ beforeRequest: async () => { if (++checks > 1) throw new Error('ownership lost'); } });
    const result = await f.run();
    assert.equal(f.calls.length, 1);
    assert.equal(result.successful.length, 1);
    assert.equal(result.failed.length, 1);
});

test('ownership is rechecked before a transport retry and stale sends are blocked', async () => {
    let checks = 0;
    const f = fixture({
        beforeRequest: async () => { if (++checks > 1) throw new Error('ownership lost'); },
        send: async () => { const error = new Error('connection reset'); error.code = 'ECONNRESET'; throw error; },
    });
    const result = await f.run();
    assert.equal(f.calls.length, 1);
    assert.equal(result.successful.length, 0);
    assert.equal(result.failed.length, 2);
});
