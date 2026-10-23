const mongoose = require("mongoose");
const pageActionSchema = new mongoose.Schema(
  {
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "page",
    },
    actionType: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("pageAction", pageActionSchema);
