const mongoose = require("mongoose");
const adNotificationSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    notificationTitle: {
      type: String,
      trim: true,
    },
    notificationText: {
      type: String,
      trim: true
    },
    searchable: {
      type: String,
      trim: true
    },
    seen: {
      type: Boolean,
      trim: true,
      default: false
    }
  },
  { timestamps: true }
);
module.exports = new mongoose.model("adNotification", adNotificationSchema);
