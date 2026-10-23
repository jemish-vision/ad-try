const mongoose = require("mongoose");

const spProfileSettingSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },

    profileId: {
      type: Number,
      trim: true,
    },

    isReconsilationNotification: {
      type: Boolean,
      default: true,
    },

  },
  { timestamps: true }
);


// --- Performance Indexing ---
spProfileSettingSchema.index({configId:1,profileId:1});

module.exports = new mongoose.model("spProfileSetting", spProfileSettingSchema);
