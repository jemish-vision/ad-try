const mongoose = require("mongoose");
const adNotificationSettingSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    lowACOS: {
      type: Number,
      trim: true,
    },
    highACOS: {
      type: Number,
      trim: true
    },
    status: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

// --- Performance Indexing ---
adNotificationSettingSchema.index({profileId:1,configId:1});
adNotificationSettingSchema.index({profileId:1});

module.exports = new mongoose.model("adNotificationSetting", adNotificationSettingSchema);
