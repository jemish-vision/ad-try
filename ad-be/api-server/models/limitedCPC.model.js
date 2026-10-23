const mongoose = require("mongoose");
const limitedCPCSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
    },
    conditions: [
      {
        fieldName: String,
        from: Number,
        to: Number,
        increaseBid: Number,
        decreaseBid: Number,
      },
    ],
  },
  { timestamps: true }
);

// --- Performance Indexing ---
limitedCPCSchema.index({profileId:1});

module.exports = new mongoose.model("limitedCPC", limitedCPCSchema);
