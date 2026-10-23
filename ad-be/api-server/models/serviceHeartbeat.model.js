const mongoose = require("mongoose");

const serviceHeartbeatSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, unique: true }, // e.g., 'worker-service'
    lastPing: { type: Date, default: Date.now },
    status: { type: String, enum: ["RUNNING", "DOWN"], default: "RUNNING" },
    alertSent: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("serviceHeartbeat", serviceHeartbeatSchema);
