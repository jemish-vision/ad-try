require("dotenv").config();
const mongoose = require("mongoose");
const { getAccessToken } = require("../api-server/helper/common");
const profileSchema = require("../api-server/models/profiles.model");
const amazonAxios = require("../api-server/helper/amazonAxios");
const { retryWithBackoff } = require("../api-server/helper/retryHelper");

async function main() {
  console.log("Connecting to MongoDB...");
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/AdvertiseIqCluster";
  await mongoose.connect(mongoUri);
  console.log("Connected successfully.");

  const profile = await profileSchema.findOne({ isActive: true });
  if (!profile) {
    console.error("No active profile found.");
    process.exit(1);
  }

  const checkConfigAds = await getAccessToken(profile.configId);
  if (!checkConfigAds || !checkConfigAds.adsAccessToken) {
    console.error("No access token.");
    process.exit(1);
  }

  const options = {
    method: "POST",
    url: `${profile.amazonUrl}/sp/productAds/list`,
    headers: {
      "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
      "Amazon-Advertising-API-Scope": profile.profileId,
      Authorization: "Bearer invalid_token_for_testing_123",
      Accept: "application/vnd.spProductAd.v3+json",
      "Content-Type": "application/vnd.spProductAd.v3+json",
    },
    data: { maxResults: 10 }
  };

  console.log("\n--- OUTER retryWithBackoff REAL ERROR TEST START ---");
  console.log("By removing Authorization header, we trigger a real 401 Authentication error.");
  console.log("This will trigger retryWithBackoff with real error logging.");

  const requests = Array.from({ length: 5 }).map((_, index) => {
    let attempts = 0;
    
    return retryWithBackoff(async () => {
      attempts++;
      return await amazonAxios(options);
    })
      .then(res => {
        console.log(`[SUCCESS] Request #${index + 1} completed on attempt #${attempts} with status ${res.status}`);
        return { status: res.status, index };
      })
      .catch(err => {
        console.error(`[FAILED PERMANENTLY] Request #${index + 1} failed after ${attempts} attempts. Error: ${err.message}`);
        return { status: err?.response?.status || err.message, index, error: true };
      });
  });

  const results = await Promise.all(requests);
  const successCount = results.filter(r => !r.error).length;
  const failureCount = results.filter(r => r.error).length;

  console.log(`\nTest Completed: Success: ${successCount}, Failed: ${failureCount}`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

main().catch(err => {
  console.error("Main execution failed:", err);
  mongoose.disconnect();
});
