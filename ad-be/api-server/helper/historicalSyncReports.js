const CRON_JOBS = require('../../worker-service/cronJobs.enum');

// These scheduled Google Sheets exports read data already in AdvertiseIQ.
// They do not import Amazon history and are not part of onboarding approval.
const historicalReportFilter = {
    name: { $nin: [CRON_JOBS.BEST_PERFORMER_REPORT, CRON_JOBS.KEYWORD_ANALYSIS_REPORT] }
};

module.exports = { historicalReportFilter };
