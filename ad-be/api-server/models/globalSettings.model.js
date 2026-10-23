const mongoose = require("mongoose");

const globalSettingSchema = new mongoose.Schema(
  {
    isMaintenanceMode: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("globalSettings", globalSettingSchema);
