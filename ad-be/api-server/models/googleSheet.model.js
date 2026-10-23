const mongoose = require("mongoose");

const googleSheetSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    currentYear: {
      type: Number,
    },
    fileName: {
      type: String 
    },
    googleSheetId: {
      type: String,
      trim: true,
    }
  },
  {
    timestamps: true,
  }
);


// --- Performance Indexing ---
googleSheetSchema.index({fileName:1});
googleSheetSchema.index({userId:1,profileId:1,currentYear:1,fileName:1});

module.exports = new mongoose.model("googlesheets", googleSheetSchema);
