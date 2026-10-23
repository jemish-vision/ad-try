const mongoose = require("mongoose");

const conditionType = [
  {
    from: Number,
    to: Number,
    Acos: Number,
  },
]

const defaultTargetAcosSchema = new mongoose.Schema(
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
    TOStargetAcos: {
      type: Number,
      default: 0,
    },
    PPtargetAcos: {
      type: Number,
      default: 0,
    },
    ROStargetAcos: {
      type: Number,
      default: 0,
    },
    dynamicTOSTarget: {
      type: Boolean,
      default: false
    },
    dynamicPPTarget: {
      type: Boolean,
      default: false
    },
    dynamicROSTarget: {
      type: Boolean,
      default: false
    },
    dynamicTOStargetAcos: conditionType,
    dynamicPPtargetAcos: conditionType,
    dynamicROStargetAcos: conditionType,
  },
  { timestamps: true }
);

// --- Performance Indexing ---
defaultTargetAcosSchema.index({profileId:1,type:1});

module.exports = new mongoose.model(
  "defaultTargetAcos",
  defaultTargetAcosSchema
);
