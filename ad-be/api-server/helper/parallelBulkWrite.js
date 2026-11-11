const pLimit = require("p-limit").default;
const { write_logs } = require("../../winston/utility/logger");
// A per-call cap multiplies when report importers overlap. Share one process lane.
const configuredConcurrency = Number(process.env.BULK_WRITE_CONCURRENCY);
const bulkWriteConcurrency = Number.isSafeInteger(configuredConcurrency) && configuredConcurrency > 0
  ? configuredConcurrency : 2;
const bulkWriteLimit = pLimit(bulkWriteConcurrency);

const parallelBulkWrite = async (model, ops, BULK_BATCH = Number(process.env.BATCH) || 1000) => {
  if (!ops || ops.length === 0) return { insertedCount: 0, modifiedCount: 0, upsertedCount: 0 };

  if (!Number.isSafeInteger(BULK_BATCH) || BULK_BATCH < 1) throw new RangeError("Bulk batch size must be a positive integer");
  const chunks = [];
  while (ops.length) {
    chunks.push(ops.splice(0, BULK_BATCH));
  }

  const CONCURRENCY = bulkWriteConcurrency;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const chunkGroup = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunkGroup.map((chunk) => bulkWriteLimit(async () => {
        try {
          return await model.bulkWrite(chunk, { ordered: false });
        } catch (err) {
          const modelName = model?.modelName || model?.collection?.collectionName || 'UnknownModel';

          // Extract specific write errors from MongoBulkWriteError
          const writeErrors = err.writeErrors || [];
          const nonDuplicateErrors = writeErrors.filter(e => e.code !== 11000);

          if (nonDuplicateErrors.length > 0 || (writeErrors.length === 0 && err.code !== 11000)) {
            // Detailed diagnostic logging for non-duplicate errors (e.g. code 121 validation, type mismatch, disk/network)
            const errorDetails = nonDuplicateErrors.slice(0, 5).map(e => ({
              code: e.code,
              message: e.errmsg || e.message,
              opFilter: e.op?.filter || e.op?.q || (e.op?.insertOne ? e.op.document?._id : undefined)
            }));

            write_logs({
              message: `[BulkWrite Error] ${modelName} failed with ${nonDuplicateErrors.length} write errors. Sample errors: ${JSON.stringify(errorDetails)}. Underlying: ${err.message}`,
              log_type: "error"
            });

            // STRICT: Propagate failure so report importer knows writes failed!
            throw err;
          }

          // If every write error is strictly a duplicate key (11000), log warning and continue
          if (writeErrors.length > 0 && nonDuplicateErrors.length === 0) {
            write_logs({
              message: `[BulkWrite DuplicateKey Notice] ${modelName} encountered ${writeErrors.length} duplicate keys (E11000) during unordered bulk write. Skipping duplicates.`,
              log_type: "warn"
            });
            return err.result;
          }

          // Any other error (network down, pool exhausted, authentication, validation) must throw!
          write_logs({
            message: `[BulkWrite Critical Failure] ${modelName} failed: ${err.message}`,
            log_type: "error"
          });
          throw err;
        }
      }))
    );
    // Do not release the caller's import lock while sibling writes are running.
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
  }
};

module.exports = { parallelBulkWrite };
