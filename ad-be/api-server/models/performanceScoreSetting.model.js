const mongoose = require("mongoose");

const performanceScoreSettingSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },

    scoreName: {
      type: String,
      trim: true,
    },

    conditions: [
      {
        queryOperator: String,
        conditionType: String,
        conditionStringValue: String,
        conditionOperator: String,
        conditionValue: Number,
        conditionMaxValue: Number,
        useTargetAcos: Boolean,
      },
    ],
  },
  { timestamps: true }
);


// --- Performance Indexing ---
performanceScoreSettingSchema.index({configId:1,profileId:1});

module.exports = new mongoose.model("performanceScoreSetting", performanceScoreSettingSchema);
