const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: function () { return this.actorType === 'user'; },
      index: true,
    },

    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: false,
    },

    sellerConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "sellerConfig",
      required: false,
    },

    event: {
      type: String,
      enum: require("../constants/auditEvents").events,
      required: true,
    },

    message: {
      type: String,
      required: false,
    },

    ipAddress: {
      type: String,
      required: false,
    },

    userAgent: {
      type: String,
      required: false,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    actorType: { type: String, enum: ['user', 'system', 'integration', 'anonymous'], default: function () { return this.userId ? 'user' : 'system'; } },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'organization', default: null },
    profileId: { type: String, maxlength: 32, match: /^\d{1,32}$/ },
    resourceType: { type: String, maxlength: 100 },
    resourceId: { type: String, maxlength: 200 },
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE', 'PARTIAL', 'PENDING', 'DENIED'], default: 'SUCCESS' },
    previousValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    source: { type: String, enum: ['api', 'ui', 'worker', 'webhook', 'integration', 'system'], default: 'api' },
    operationId: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);

auditLogSchema.pre('validate', function () {
  const { sanitizeAuditValue } = require('../helpers/auditHelper');
  for (const field of ['metadata', 'previousValue', 'newValue', 'message', 'userAgent']) {
    if (this[field] !== undefined) this[field] = sanitizeAuditValue(this[field]);
  }
});

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

auditLogSchema.index({ event: 1 });

// TTL index for 396-day data retention
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = mongoose.model("auditLog", auditLogSchema);
