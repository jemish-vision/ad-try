const mongoose = require("mongoose");

const specialDayReminderSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },

    specialDayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "specialDay",
    },

    reminderDates: {
      type: [Number],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = new mongoose.model("specialDayReminder", specialDayReminderSchema);
