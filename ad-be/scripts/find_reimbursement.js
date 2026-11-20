const fs = require('fs');

const files = [
  'api-server/controllers/reconciliationReimbursement.controller.js',
  'api-server/controllers/profitAnalysis.controller.js',
  'api-server/services/accountDataCleanup.service.js',
  'api-server/services/liveSyncAudit.service.js'
];

files.forEach(f => {
  const full = 'e:/Project/AdervertiseIQ/code/2/Node-AdvertiseIQ/' + f;
  if (!fs.existsSync(full)) return;
  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('reimbursementSchema') || line.includes('reimbursementModel') || line.includes('Reimbursement') || line.includes('reimbursements')) {
      console.log(`\n================== ${f}:${idx + 1} ==================`);
      for (let i = Math.max(0, idx - 4); i <= Math.min(lines.length - 1, idx + 8); i++) {
        console.log((i + 1) + ': ' + lines[i]);
      }
    }
  });
});
