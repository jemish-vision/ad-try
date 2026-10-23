const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
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
      enum: [
        "USER_LOGIN",
        "USER_LOGOUT",
        "GOOGLE_USER_LOGIN",

        "PASSWORD_CHANGE",

        "CONFIG_CONNECT",
        "CONFIG_RECONNECT",
        "CONFIG_DISCONNECT",

        "SELLER_CONFIG_CONNECT",
        "SELLER_CONFIG_RECONNECT",
        "SELLER_CONFIG_DISCONNECT",
        "SELLER_CONFIG_SUBSCRIPTIONS",
        "SELLER_CONFIG_LINK_EXISTING",

        "CSRF_ATTEMPT_EXPIRE",
        "CSRF_ATTEMPT_INVALID",

        "PLACEMENT_RULE_CREATION",
        "PLACEMENT_RULE_UPDATE",
        "PLACEMENT_RULE_DELETION",
        "PLACEMENT_RULE_STATUS_CHANGE",

        "BUDGET_RULE_CREATION",
        "BUDGET_RULE_UPDATE",
        "BUDGET_RULE_DELETION",
        "BUDGET_RULE_STATUS_CHANGE",

        "TARGETING_RULE_CREATION",
        "TARGETING_RULE_UPDATE",
        "TARGETING_RULE_DELETION",
        "TARGETING_RULE_STATUS_CHANGE",

        "SEARCH_TERM_RULE_CREATION",
        "SEARCH_TERM_RULE_UPDATE",
        "SEARCH_TERM_RULE_DELETION",
        "SEARCH_TERM_RULE_STATUS_CHANGE",

        "DAYPARTING_RULE_CREATION",
        "DAYPARTING_RULE_UPDATE",
        "DAYPARTING_RULE_DELETION",
        "DAYPARTING_RULE_STATUS_CHANGE",

        "RECOMMENDATION_RULE_CREATION",
        "RECOMMENDATION_RULE_UPDATE",
        "RECOMMENDATION_RULE_DELETION",
        "RECOMMENDATION_RULE_STATUS_CHANGE",
        "RECOMMENDATION_APPLIED",
        "RECOMMENDATION_DISMISSED",

        "CRON_JOB_SETTINGS",
        "INVENTORY_SETTINGS",
        "FBA_CONFIGURATION",
        "REIMBURSEMENT_SETTINGS",

        "CAMPAIGN_CREATION",
        "CAMPAIGN_BID_THRESHOLD",
        "CAMPAIGN_NOTIFICATION_THRESHOLD",

        "PRODUCT_CREATION",
        "PRODUCT_PRICE_UPDATE",
        "PRODUCT_NOTIFICATION_THRESHOLD",

        "CAMPAIGN_PRODUCT_ELIGIBILITY_THRESHOLD",
        "RULES_SETTINGS",

        "SEARCH_TERM_ADD_AS_KEYWORD",
        "SEARCH_TERM_ADD_AS_NEGATIVE_KEYWORD",
        "SEARCH_TERM_REMOVED",

        "MAINTENANCE_MODE_ENABLED",
        "MAINTENANCE_MODE_DISABLED",
      ],
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
  },
  { timestamps: true }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });

auditLogSchema.index({ event: 1 });

// TTL index for 396-day data retention
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = mongoose.model("auditLog", auditLogSchema);