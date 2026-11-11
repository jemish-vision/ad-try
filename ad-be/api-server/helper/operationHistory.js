const crypto = require("crypto");
const mongoose = require("mongoose");

function historyPersistenceError(error) {
  if (error?.historyPersistenceFailure) return error;
  const failure = new Error(error?.message || String(error), { cause: error });
  failure.historyPersistenceFailure = true;
  return failure;
}

// A retry of one operation and transition reuses the same document identity.
function historyDocumentId(operationId, doc) {
  if (!operationId) throw historyPersistenceError("History operation identity is required");
  const identity = [String(operationId), String(doc.configId || ""), String(doc.profileId || ""),
    doc.type || "", String(doc.changeLevel || ""), String(doc.adGroupId || ""),
    String(doc.historyEntityId || doc.targetId || ""), doc.targeting || "",
    doc.matchType || "", doc.placement || "", doc.changeType || "", doc.source || "",
    doc.oldValue == null ? null : String(doc.oldValue), doc.newValue == null ? null : String(doc.newValue)];
  return new mongoose.Types.ObjectId(crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24));
}

async function insertOperationHistory(model, docs, operationId) {
  try {
    const operations = (docs || []).filter(doc => {
      const oldValue = doc.oldValue;
      const newValue = doc.newValue;
      return oldValue == null || oldValue === "—" || newValue == null ||
        !String(oldValue).trim() || String(oldValue).trim() !== String(newValue).trim();
    }).map(doc => ({
      updateOne: {
        filter: { _id: historyDocumentId(operationId, doc) },
        update: { $setOnInsert: { ...doc, createdAt: doc.createdAt || new Date(), updatedAt: doc.updatedAt || doc.createdAt || new Date() } },
        upsert: true,
        timestamps: false,
      },
    }));
    if (!operations.length) return;
    // Retrying these same upserts also repairs partial unordered writes.
    // Propagate errors. An unscoped insert fallback would duplicate successes.
    return await model.bulkWrite(operations, { ordered: false, timestamps: false });
  } catch (error) {
    throw historyPersistenceError(error);
  }
}

module.exports = { historyDocumentId, insertOperationHistory, historyPersistenceError };
