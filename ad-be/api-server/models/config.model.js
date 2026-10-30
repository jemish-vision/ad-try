const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../helper/crypto.helper");

const configSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: false },
        organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: false, default: null },

        adsClientId: { type: String, required: false },
        adsClientSeceret: { type: String, required: false },
        adsAccessToken: { type: String, required: false },
        adsRefressToken: { type: String, required: false },

        isActive: { type: Boolean, trim: true, default: true },
        tokenExpire: { type: Number, required: false },
        adsTokenExpiresAt: { type: Date, required: false },
        disconnectedAt: { type: Date, default: null },
        isDataDeletionStopped: { type: Boolean, default: false },
        dataDeletionStoppedAt: { type: Date, default: null },
        dataDeletionStoppedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
        deletionReminder15SentAt: { type: Date, default: null },
        deletionReminder1SentAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Helper to encrypt relevant doc fields
const encryptDoc = (doc) => {
  if (!doc) return;
  if (doc.adsAccessToken) doc.adsAccessToken = encrypt(doc.adsAccessToken);
  if (doc.adsRefressToken) doc.adsRefressToken = encrypt(doc.adsRefressToken);
  if (doc.adsClientSeceret) doc.adsClientSeceret = encrypt(doc.adsClientSeceret);
};

// Helper to decrypt relevant doc fields
const decryptDoc = (doc) => {
  if (!doc) return;
  if (doc.adsAccessToken) doc.adsAccessToken = decrypt(doc.adsAccessToken);
  if (doc.adsRefressToken) doc.adsRefressToken = decrypt(doc.adsRefressToken);
  if (doc.adsClientSeceret) doc.adsClientSeceret = decrypt(doc.adsClientSeceret);
};

// Pre-save hook (for doc.save() and Model.create())
configSchema.pre("save", function(next) {
  encryptDoc(this);
  next();
});

// Post-save hook to decrypt in memory after saving
configSchema.post("save", function(doc) {
  decryptDoc(doc);
});

// Pre-update hooks (for updateOne, updateMany, findOneAndUpdate)
configSchema.pre(["updateOne", "findOneAndUpdate", "updateMany"], function(next) {
  const update = this.getUpdate();
  const filter = this.getQuery();
  if (!update) return next();

  // Direct top-level updates
  encryptDoc(update);

  // $set updates
  if (update.$set) {
    encryptDoc(update.$set);
  }

  const hasCredentialChange = (update.$set && (update.$set.adsRefressToken || update.$set.adsClientSeceret || update.$set.isActive === false)) ||
                              (update.adsRefressToken || update.adsClientSeceret || update.isActive === false);
  if (hasCredentialChange && filter && filter?._id) {
    const { invalidateAccessToken } = require("../services/amazonAuth.service");
    invalidateAccessToken({ kind: "ads", configId: filter._id.toString() }).catch(() => {});
  }
  
  next();
});

// Post-init hook for loaded Mongoose documents
configSchema.post("init", function(doc) {
  decryptDoc(doc);
});

// Post-query hooks for find, findOne, and findOneAndUpdate
configSchema.post("find", function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptDoc);
  }
});

configSchema.post("findOne", function(doc) {
  decryptDoc(doc);
});

configSchema.post("findOneAndUpdate", function(doc) {
  decryptDoc(doc);
});

module.exports = mongoose.model("config", configSchema);
