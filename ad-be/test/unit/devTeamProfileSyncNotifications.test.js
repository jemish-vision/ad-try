const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const {
  buildNewProfileConnectionEmail,
  buildDataSyncRequestEmail,
} = require("../../emailTemplate/buildProfileAndSyncNotificationEmail");

const configSource = fs.readFileSync(
  require.resolve("../../api-server/controllers/config.controller"),
  "utf8"
);

function loadExport(name, dependencies) {
  const start = configSource.indexOf(`exports.${name} =`);
  const end = configSource.indexOf("\nexports.", start + 1);
  assert.ok(start >= 0);
  const context = { exports: {}, writeAuditEvent: async () => {}, ...dependencies };
  vm.runInNewContext(configSource.slice(start, end < 0 ? undefined : end), context);
  return context.exports[name];
}

const reply = () => {
  const res = {
    code: null,
    body: null,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
  };
  return res;
};

test("buildNewProfileConnectionEmail escapes HTML and lists connected profiles", () => {
  const html = buildNewProfileConnectionEmail({
    user: { fullName: "Alice <Admin>", email: "alice@example.com", companyName: "Acme" },
    organization: { organizationName: "Acme Org", planId: { planName: "Pro" } },
    config: { companyName: "Acme Ads" },
    profiles: [
      { name: "Acme US", profileId: 123456, countryCode: "US", currencyCode: "USD", type: "seller" },
    ],
    connectedAt: "2026-11-25T03:30:00.000Z",
    ipAddress: "127.0.0.1",
  });

  assert.match(html, /New Advertising Profile Connected/);
  assert.match(html, /Alice &lt;Admin&gt;/);
  assert.match(html, /Acme US/);
  assert.match(html, /123456/);
  assert.match(html, /Pro/);
});

test("buildDataSyncRequestEmail lists requested groups, days, and pending status", () => {
  const html = buildDataSyncRequestEmail({
    user: { fullName: "Bob", email: "bob@example.com" },
    organization: { organizationName: "Beta Org", planId: { name: "Enterprise" } },
    config: { companyName: "Beta Co" },
    profile: { name: "Beta UK", profileId: 98765, countryCode: "UK", currencyCode: "GBP" },
    profileId: 98765,
    type: "ads",
    requestedRecords: [
      { groupId: "CAMPAIGNS", selectedSyncDays: 90, requestStatus: "PENDING" },
    ],
    groups: [{ id: "CAMPAIGNS", title: "Campaigns & Ad Groups" }],
    requestedAt: "2026-11-25T03:30:00.000Z",
  });

  assert.match(html, /New Profile Data Sync Requested/);
  assert.match(html, /Campaigns &amp; Ad Groups/);
  assert.match(html, /90 days/);
  assert.match(html, /PENDING/);
  assert.match(html, /Beta UK/);
});

test("saveAmazonProfiles notifies dev team only for newly added profiles", async () => {
  const notifications = [];
  const configId = "111111111111111111111111";
  const verifiedProfiles = [
    { profileId: 101, name: "Existing US", countryCode: "US", currencyCode: "USD", timezone: "UTC", type: "seller" },
    { profileId: 102, name: "New CA", countryCode: "CA", currencyCode: "CAD", timezone: "UTC", type: "seller" },
  ];

  const saveAmazonProfiles = loadExport("saveAmazonProfiles", {
    configSchema: {
      findById: () => ({ lean: async () => ({ _id: configId, organizationId: "org-1", companyName: "Acme" }) }),
      find: () => ({ select: () => ({ lean: async () => [{ _id: configId }] }) }),
    },
    canManageAdsConfig: () => true,
    fetchOnboardingAdsProfiles: async () => verifiedProfiles,
    organizationSchema: {
      findById: () => ({ populate: () => ({ lean: async () => ({ planId: { profileLimit: 10 } }) }) }),
    },
    profileSchema: {
      distinct: async () => [101],
      bulkWrite: async () => {},
    },
    profileBasedPermissionSchema: { bulkWrite: async () => {} },
    cronJobSchema: { find: () => ({ lean: async () => [] }) },
    cronJobSchedularSchema: { bulkWrite: async () => {} },
    clearProfileCache: async () => {},
    clearActivePlanProfilesCache: async () => {},
    linkSellerConfigWithAdsConfig: async () => {},
    write_logs: () => {},
    notifyNewProfileConnection: async (payload) => notifications.push(payload),
  });

  const res = reply();
  await saveAmazonProfiles(
    { user: { _id: "user-1" }, body: { configId, selectedProfiles: [{ profileId: 101 }, { profileId: 102 }] } },
    res
  );

  assert.equal(res.code, 200);
  assert.equal(notifications.length, 1);
  assert.deepEqual(Array.from(notifications[0].profiles, (p) => p.profileId), [102]);
});

test("saveSynchronizationDetails notifies dev team only for new or changed PENDING data requests", async () => {
  const notifications = [];
  const configId = "111111111111111111111111";
  const records = [
    { _id: "r1", configId, profileId: 7, type: "ads", groupId: "CAMPAIGNS", selectedSyncDays: 30, requestStatus: "COMPLETED" },
  ];

  const saveSynchronizationDetails = loadExport("saveSynchronizationDetails", {
    mongoose: { isValidObjectId: (id) => /^[a-f0-9]{24}$/.test(id) },
    configSchema: { findById: () => ({ lean: async () => ({ _id: configId, organizationId: "org-1", companyName: "Acme" }) }) },
    canManageAdsConfig: () => true,
    coreGroupSchema: {
      find: (query) => ({ lean: async () => query.id.$in.map((id) => ({ id, title: `${id} Title`, maxDays: 90 })) }),
    },
    synchronizeDetailsSchema: {
      find: () => {
        const lean = async () => records.map((r) => ({ ...r }));
        return { lean, sort: () => ({ lean }) };
      },
      findOneAndUpdate: (filter, update) => ({
        lean: async () => {
          const rec = { ...filter, ...update.$setOnInsert, _id: "r2" };
          records.push(rec);
          return rec;
        },
      }),
      deleteMany: async () => ({ deletedCount: 0 }),
    },
    write_logs: () => {},
    notifyDataSyncRequest: async (payload) => notifications.push(payload),
  });

  const res = reply();
  await saveSynchronizationDetails(
    {
      user: { _id: "user-1" },
      body: {
        configId,
        profileId: 7,
        type: "ads",
        items: [
          { groupId: "CAMPAIGNS", selectedSyncDays: 30 },
          { groupId: "TARGETING", selectedSyncDays: 60 },
        ],
      },
    },
    res
  );

  assert.equal(res.code, 200);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].profileId, 7);
  assert.equal(notifications[0].type, "ads");
  assert.deepEqual(
    notifications[0].requestedRecords.map((r) => [r.groupId, r.selectedSyncDays, r.requestStatus]),
    [["TARGETING", 60, "PENDING"]]
  );
});
