const mongoose = require("mongoose");

const recommendationOrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    profileId: {
      type: String,
      required: true,
      trim: true,
    },
    ruleIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "recomandationRules",
      },
    ],
  },
  { timestamps: true }
);

recommendationOrderSchema.index({ userId: 1, profileId: 1 }, { unique: true });

module.exports = mongoose.model("recommendationOrder", recommendationOrderSchema);
