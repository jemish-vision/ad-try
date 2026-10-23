const mongoose = require("mongoose");

const specialDaySchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true }
);


// --- Performance Indexing ---
specialDaySchema.index({createdBy:1});

module.exports = new mongoose.model("specialDay", specialDaySchema);
