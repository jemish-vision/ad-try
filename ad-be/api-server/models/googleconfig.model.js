const mongoose = require("mongoose");
const googleconfigSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    googleAccessToken: {
      type: String,
      trim: true,
    },
    googleRefreshToken: {
      type: String,
      trim: true,
    },
    googleTokenExpire: {
      type: Number,
      trim: true,
    },
    clientId: {
      type: String,
      trim: true,
    },
    clientSecret: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
googleconfigSchema.index({userId:1});

module.exports = new mongoose.model("googleconfig", googleconfigSchema, "googleconfig");
