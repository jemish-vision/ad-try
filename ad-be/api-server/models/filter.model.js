const mongoose = require("mongoose");
const filterSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "page",
    },
    name: {
      type: String,
      trim: true,
    },
    value: {
      type: String,
      trim: true,
    },
    query: {
      type: String,
      trim: true,
    },
    isDefault: {
      type: Boolean,
      trim: true,
    },

    isSPFilter: { type: Boolean, trim: true, default: true },
    isSBFilter: { type: Boolean, trim: true, default: true },
    isSDFilter: { type: Boolean, trim: true, default: true },

    isActive: {
      type: Boolean,
      trim: true,
    }
  },
  { timestamps: true }
);

// --- Performance Indexing ---
filterSchema.index({pageId:1});
filterSchema.index({_id:1,userId:1});

module.exports = new mongoose.model("filter", filterSchema);
