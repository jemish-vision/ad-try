const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },

    name: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      default: "#02468B"
    },
    startDate: {
      type: String,
      trim: true,
    },
    endDate: {
      type: String,
      trim: true,
      default: null,
    },

    reminderDates: {
      type: [Number],
      default: [],
    },

    protectionEnable: {
      type: Boolean,
      default: false
    },
    protectionAction: {
      type: String,
      enum: [null, "PAUSE_RULES", "PAUSE_CAMPAIGNS"],
      trim: true,
      default: null
    },
    changeHistory: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = new mongoose.model("holiday", holidaySchema);
