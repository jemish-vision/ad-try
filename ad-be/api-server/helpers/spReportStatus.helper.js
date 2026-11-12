/**
 * SP-API Reports API (2021-06-30) processingStatus handling.
 *
 * Amazon reports end in DONE, CANCELLED or FATAL. CANCELLED usually means there was no data
 * for the requested range (e.g. no reimbursements), FATAL means processing failed. Neither
 * ever becomes DONE, so treating them as "still pending" leaves the report row stuck in PENDING.
 */

const TERMINAL_WITHOUT_DOCUMENT = Object.freeze({
  CANCELLED: {
    status: "CANCELLED",
    result: "COMPLETED", // nothing to import — the run is finished
    message: "Amazon cancelled the report (usually no data for the requested date range).",
  },
  FATAL: {
    status: "FATAL",
    result: "ERROR",
    message: "Amazon report processing failed (FATAL).",
  },
});

/**
 * If processingStatus is CANCELLED/FATAL, marks the stored report row accordingly and returns
 * the value the caller should return ("COMPLETED" | "ERROR"). Returns null for any other status.
 *
 * @param {import("mongoose").Model} reportsSchema
 * @param {{ _id: any, reportId?: string }} existing stored report row
 * @param {string} processingStatus Amazon processingStatus
 */
async function settleTerminalReportStatus(reportsSchema, existing, processingStatus) {
  const terminal = TERMINAL_WITHOUT_DOCUMENT[processingStatus];
  if (!terminal) return null;
  if (existing?._id) {
    await reportsSchema.updateOne(
      { _id: existing._id },
      { $set: { status: terminal.status, errorMessage: terminal.message, completedAt: new Date() } }
    );
  }
  return terminal.result;
}

/** Stored report statuses that mean "this date range is settled; don't request it again". */
const SETTLED_REPORT_STATUSES = Object.freeze(["COMPLETED", "CANCELLED"]);

module.exports = { settleTerminalReportStatus, SETTLED_REPORT_STATUSES, TERMINAL_WITHOUT_DOCUMENT };
