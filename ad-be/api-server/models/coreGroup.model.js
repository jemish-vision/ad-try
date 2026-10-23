const mongoose = require("mongoose");

const coreGroupSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    maxDays: {
      type: Number,
      default: 90,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    type: {
      type: String,
      enum: ["ads", "seller"],
      default: "ads",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("coreGroup", coreGroupSchema);
