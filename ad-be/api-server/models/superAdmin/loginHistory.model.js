const mongoose = require("mongoose");

const loginHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    ipAddress: {
      type: String,
      default: "-",
    },
    location: {
      country_name: {
        type: String,
        default: "-",
      },
      country_code: {
        type: String,
        default: "-",
      },
      state_name: {
        type: String,
        default: "-",
      },
      state_code: {
        type: String,
        default: "-",
      },
      city: {
        type: String,
        default: "-",
      },
      postal_code: {
        type: String,
        default: "-",
      },
      latitude: {
        type: String,
        default: "-",
      },
      longitude: {
        type: String,
        default: "-",
      },
    },
    timezone: {
      name: {
        type: String,
        default: "-",
      },
      abbreviation: {
        type: String,
        default: "-",
      },
      current_time: {
        type: String,
        default: "-",
      },
    },
  },
  {
    timestamps: true,
  }
);

// TTL index for 396-day data retention
loginHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("loginHistory", loginHistorySchema);
