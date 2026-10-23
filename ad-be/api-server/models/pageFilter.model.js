const mongoose = require("mongoose");
const pageFilterSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    profileId: {
      type: String,
      trim: true,
    },
    pageName: {
      type: String,
      trim: true,
    },
    filter: {
      type: String, // Stringified JSON array of filters
      trim: true,
    }
  },
  { timestamps: true }
);

pageFilterSchema.index({ userId: 1, profileId: 1, pageName: 1 }, { unique: true });

module.exports = mongoose.model("pageFilter", pageFilterSchema);
