const mongoose = require("mongoose");

const ruleBlockedTimeSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    },
  },
  { timestamps: true }
);

module.exports = new mongoose.model("ruleBlockedTime", ruleBlockedTimeSchema);
