const mongoose = require("mongoose");

const supportTicketMessageSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "SupportTicket", required: true },
    from: { type: String, enum: ["user", "bot"], required: true },
    text: { type: String, default: "" },
    image: { type: String, default: null },
  },
  { timestamps: true }
);


// --- Performance Indexing ---
supportTicketMessageSchema.index({ticketId:1});

module.exports = new mongoose.model("supportTicketMessage", supportTicketMessageSchema);
