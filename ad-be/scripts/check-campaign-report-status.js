const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function check() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  console.log('--- 1. LATEST "Campaign Report" IN cronjobhistories ---');
  const cronHistories = await db.collection('cronjobhistories')
    .find({ cronName: { $regex: 'Campaign Report', $options: 'i' } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  if (cronHistories.length === 0) {
    console.log('No Campaign Report histories found.');
  } else {
    cronHistories.forEach(h => {
      const ist = new Date(h.createdAt.getTime() + (5.5 * 3600 * 1000));
      console.log(`[cronjobhistory] Status: ${h.status} | Date: ${h.historyDate} | Profile: ${h.profileId} | CreatedAt IST: ${ist.toISOString().replace('T', ' ').substring(0, 19)}`);
    });
  }

  console.log('\n--- 2. LATEST CAMPAIGN REPORTS IN reports COLLECTION ---');
  const campaignReports = await db.collection('reports')
    .find({ reportType: { $in: ['spCampaigns', 'sbCampaigns', 'sdCampaigns'] } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  if (campaignReports.length === 0) {
    console.log('No Campaign records found in reports collection.');
  } else {
    campaignReports.forEach(r => {
      const ist = new Date(r.createdAt.getTime() + (5.5 * 3600 * 1000));
      console.log(`[reports] Type: ${r.reportType} | Status: ${r.status} | Profile: ${r.profileId} | Start: ${r.startDate} End: ${r.endDate} | CreatedAt IST: ${ist.toISOString().replace('T', ' ').substring(0, 19)}`);
    });
  }

  console.log('\n--- 3. LATEST ANY REPORT IN reports COLLECTION ---');
  const anyReports = await db.collection('reports')
    .find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
  anyReports.forEach(r => {
    const ist = new Date(r.createdAt.getTime() + (5.5 * 3600 * 1000));
    console.log(`[reports] Type: ${r.reportType} | Status: ${r.status} | CreatedAt IST: ${ist.toISOString().replace('T', ' ').substring(0, 19)}`);
  });

  await mongoose.disconnect();
}

check().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
