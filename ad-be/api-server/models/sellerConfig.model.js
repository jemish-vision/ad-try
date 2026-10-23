const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../helper/crypto.helper");

const sellerConfigSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "organization",
            required: false,
            default: null,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: false,
            default: null,
        },
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
        },
        profileId: {
            type: Number,
            trim: true,
        },

        spClientId: { type: String, required: false },
        spClientSecret: { type: String, required: false },
        spAccessToken: { type: String, required: false },
        spRefreshToken: { type: String, required: false },
        sellerId: { type: String, required: false },

        isActive: { type: Boolean, trim: true, default: true },
        tokenExpire: { type: Number, required: false },
        spTokenExpiresAt: { type: Date, required: false },
        disconnectedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Helper to encrypt relevant doc fields
const encryptDoc = (doc) => {
  if (!doc) return;
  if (doc.spAccessToken) doc.spAccessToken = encrypt(doc.spAccessToken);
  if (doc.spRefreshToken) doc.spRefreshToken = encrypt(doc.spRefreshToken);
  if (doc.spClientSecret) doc.spClientSecret = encrypt(doc.spClientSecret);
};

// Helper to decrypt relevant doc fields
const decryptDoc = (doc) => {
  if (!doc) return;
  if (doc.spAccessToken) doc.spAccessToken = decrypt(doc.spAccessToken);
  if (doc.spRefreshToken) doc.spRefreshToken = decrypt(doc.spRefreshToken);
  if (doc.spClientSecret) doc.spClientSecret = decrypt(doc.spClientSecret);
};

// Pre-save hook (for doc.save() and Model.create())
sellerConfigSchema.pre("save", function(next) {
  encryptDoc(this);
  next();
});

// Post-save hook to decrypt in memory after saving
sellerConfigSchema.post("save", function(doc) {
  decryptDoc(doc);
});

// Pre-update hooks (for updateOne, updateMany, findOneAndUpdate)
sellerConfigSchema.pre(["updateOne", "findOneAndUpdate", "updateMany"], function(next) {
  const update = this.getUpdate();
  const filter = this.getQuery();
  if (!update) return next();

  // Direct top-level updates
  encryptDoc(update);

  // $set updates
  if (update.$set) {
    encryptDoc(update.$set);
  }
  
  const hasCredentialChange = (update.$set && (update.$set.spRefreshToken || update.$set.spClientSecret || update.$set.isActive === false)) ||
                              (update.spRefreshToken || update.spClientSecret || update.isActive === false);
  if (hasCredentialChange && filter) {
    const configId = filter?.configId || (this && this.configId);
    const profileId = filter?.profileId || (this && this.profileId);
    if (configId && profileId) {
      const { invalidateAccessToken } = require("../services/amazonAuth.service");
      invalidateAccessToken({ kind: "sp", configId: configId.toString(), profileId }).catch(() => {});
    }
  }

  next();
});

// Post-init hook for loaded Mongoose documents
sellerConfigSchema.post("init", function(doc) {
  decryptDoc(doc);
});

// Post-query hooks for find, findOne, and findOneAndUpdate
sellerConfigSchema.post("find", function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptDoc);
  }
});

sellerConfigSchema.post("findOne", function(doc) {
  decryptDoc(doc);
});

sellerConfigSchema.post("findOneAndUpdate", function(doc) {
  decryptDoc(doc);
});


// --- Performance Indexing ---
sellerConfigSchema.index({isActive:1,disconnectedAt:1});
sellerConfigSchema.index({isActive:1});

module.exports = mongoose.model("sellerConfig", sellerConfigSchema);

