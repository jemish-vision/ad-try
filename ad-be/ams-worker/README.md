# Real-time SQS worker

`index.js` owns the queue lifecycle. `realtimeBatch.cjs` builds MongoDB updates and saves each batch.

## Message flow

1. Each configured region starts four SQS readers. Readers parse and validate each message.
2. Traffic messages become campaign and hourly `$inc` updates. Conversion, budget, and management messages go to the existing MongoDB queue worker because they have different update rules.
3. Readers add prepared messages to a shared queue buffer. The buffer flushes every 15 seconds or when it reaches 500 messages.
4. The worker saves deduplication markers and executes bulk updates in batches. Deduplication is handled via idempotencyId unique index.
5. After saving, the worker deletes those messages from SQS. If deletion fails, SQS redelivers them and the idempotency markers prevent the updates from running twice.

Invalid JSON, unsupported datasets, and messages without one clear active profile remain in SQS for retry. Conversion and management messages are acknowledged after they are durably staged; their later processing is owned by `processAMSQueue` in `campaign.controller.js`.

The worker ensures hourly identity indexes exist at startup. Standalone MongoDB instances are fully supported without requiring replica set transactions.

Check JavaScript syntax with `node --check ams-worker/index.js` and `node --check ams-worker/realtimeBatch.cjs`.
