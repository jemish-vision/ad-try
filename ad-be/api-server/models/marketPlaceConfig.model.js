const mongoose = require("mongoose");
const marketPlaceConfigSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    endPoint: {
      type: String,
      trim: true,
    },
    marketPlaceId: {
      type: String,
      trim: true,
    },
    countryCode: {
      type: String,
      trim: true,
    }
  },
  { timestamps: true }
);

// --- Performance Indexing ---
marketPlaceConfigSchema.index({marketPlaceId:1});
marketPlaceConfigSchema.index({countryCode:1});

module.exports = new mongoose.model("marketPlaceConfig", marketPlaceConfigSchema);
