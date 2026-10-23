const AuditLog = require('../models/auditLog.model');

async function logAudit(event, message, metadata, userId) {
  try {
    const audit = new AuditLog({ userId, event, message, metadata });
    await audit.save();
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

async function logAuditBatch(entries) {
  if (!entries.length) return;
  try {
    await AuditLog.insertMany(entries, { ordered: false });
  } catch (err) {
    // Audit logging remains best effort, as with individual logAudit calls.
    console.error('Failed to log audit events:', err);
  }
}

module.exports = { logAudit, logAuditBatch };
