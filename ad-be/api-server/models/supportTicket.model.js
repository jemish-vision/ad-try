const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    asanaTaskId: { type: String, required: false, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    needAdditionalMessage: { type: Boolean, default: false },
    message: { type: String, default: "" },
    needCC: { type: Boolean, default: false },
    ccEmail: { type: String, default: "" },
    image: { type: String, default: null },
    status: { type: String, default: "open" }, // open, closed, pending
  },
  { timestamps: true }
);


// --- Performance Indexing ---
supportTicketSchema.index({ asanaTaskId: 1 });
supportTicketSchema.index({ userId: 1, userEmail: 1 });

module.exports = new mongoose.model("supportTicket", supportTicketSchema);
