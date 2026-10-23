const mongoose = require("mongoose");

const conditionType = [
  {
    from: Number,
    to: Number,
    Acos: Number,
  },
]

const targetAcosSBSDSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    targetAcos: {
      type: Number,
      default: 0,
    },
    dynamicTarget: {
      type: Boolean,
      default: false
    },
    dynamicTargetAcos: conditionType,
    campaignType: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
targetAcosSBSDSchema.index({campaignType:1});

module.exports = new mongoose.model("targetAcosSB-SD", targetAcosSBSDSchema);
