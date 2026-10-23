const affectedCampaignByRuleSchema = require("../models/affectedCampaignByRule.model");
const campaignsSchema = require("../models/campaign.model");
const sbCampaignsSchema = require("../models/sbCampaign.model");
const sdCampaignsSchema = require("../models/sdCampaign.model");
const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const budgetRulesSchema = require("../models/budgetRules.model");
const placementRulesSchema = require("../models/placementRules.model");
const searchTermRuleSchema = require("../models/searchTermRules.model");
const profilesSchema = require("../models/profiles.model");
const { getRuleDate } = require("../helper/common");
const moment = require("moment-timezone");

/**
 * Record a rule execution change with full lifecycle tracking:
 * - If an existing active record exists and the setting value has changed, close the old record (isActive: false)
 * - Create a new active record (isActive: true) and log the initial metric snapshot in metricsHistory
 */
exports.recordRuleExecutionChange = async ({
  configId,
  profileId,
  userId,
  ruleSchema,
  ruleId,
  ruleDate,
  ruleTime,
  type = "SP",
  campaignId,
  adGroupId = null,
  keywordId = null,
  targetId = null,
  placement = null,
  searchTerm = null,
  name = "",
  adGroupName = "",
  targetName = "",
  targetType = "",
  changed = "bid",
  oldValue = "",
  newValue = "",
  conditionSnapshot = null,
  metrics = {},
  notes = "Initial rule execution change",
}) => {
  try {
    const currentDate = ruleDate || moment().format("YYYY-MM-DD");
    const currentTime = ruleTime || moment().format("hh:mm A");

    const matchQuery = {
      configId,
      profileId: Number(profileId),
      ruleSchema,
      ruleId,
      type,
      campaignId: Number(campaignId),
      ...(adGroupId ? { adGroupId: Number(adGroupId) } : {}),
      ...(targetId ? { targetId: String(targetId) } : {}),
      ...(placement ? { placement: String(placement) } : {}),
      ...(searchTerm ? { searchTerm: String(searchTerm) } : {}),
      isActive: true,
    };

    const existingActive = await affectedCampaignByRuleSchema.findOne(matchQuery).lean();

    const snapshot = {
      conditionSnapshot,
      timestamp: new Date(),
      date: currentDate,
      time: currentTime,
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      spend: Number(metrics.spend) || 0,
      sales: Number(metrics.sales) || 0,
      orders: Number(metrics.orders) || 0,
      acos: Number(metrics.acos) || 0,
      roas: Number(metrics.roas) || 0,
      cpc: Number(metrics.cpc) || 0,
      ctr: Number(metrics.ctr) || 0,
      settingValue: String(newValue ?? ""),
      eventType: "INITIAL_EXECUTION",
      notes,
    };

    // If an active record already exists with a DIFFERENT value, close old record
    if (existingActive) {
      const isDifferentValue = String(existingActive.newValue) !== String(newValue);

      if (isDifferentValue) {
        // Finalize old record
        await affectedCampaignByRuleSchema.findByIdAndUpdate(existingActive._id, {
          $set: {
            isActive: false,
            closedAt: new Date(),
          },
          $push: {
            metricsHistory: {
              ...snapshot,
              eventType: "FINAL_SNAPSHOT",
              notes: `Setting changed from ${existingActive.newValue} to ${newValue}. Lifecycle completed.`,
            },
          },
        });

        // Handle returning to baseline (e.g. dayparting 0% slot restoring previous base value)
        const isReturningToBaseline = String(newValue) === String(existingActive.oldValue) || String(oldValue) === String(newValue);
        if (isReturningToBaseline) {
          // Check if a reversion record already exists for this rule and time slot to avoid duplicates
          const existingRevert = await affectedCampaignByRuleSchema.findOne({
            configId,
            profileId: Number(profileId),
            ruleSchema,
            ruleId,
            ruleDate: currentDate,
            ruleTime: currentTime,
            type,
            campaignId: Number(campaignId),
            ...(adGroupId ? { adGroupId: Number(adGroupId) } : {}),
            ...(targetId ? { targetId: String(targetId) } : {}),
            ...(placement ? { placement: String(placement) } : {}),
            ...(searchTerm ? { searchTerm: String(searchTerm) } : {}),
          });

          if (existingRevert) {
            return existingRevert;
          }

          // Create an inactive record with isReverted: true representing the restoration to baseline
          const revertRecord = new affectedCampaignByRuleSchema({
            conditionSnapshot,
            configId,
            profileId: Number(profileId),
            userId,
            ruleSchema,
            ruleId,
            ruleDate: currentDate,
            ruleTime: currentTime,
            type,
            campaignId: Number(campaignId),
            adGroupId: adGroupId ? Number(adGroupId) : (existingActive.adGroupId ? Number(existingActive.adGroupId) : null),
            keywordId: keywordId ? Number(keywordId) : (existingActive.keywordId ? Number(existingActive.keywordId) : null),
            targetId: targetId ? String(targetId) : (existingActive.targetId ? String(existingActive.targetId) : null),
            placement: placement ? String(placement) : (existingActive.placement ? String(existingActive.placement) : null),
            searchTerm: searchTerm ? String(searchTerm) : (existingActive.searchTerm ? String(existingActive.searchTerm) : null),
            name: name || existingActive.name,
            adGroupName: adGroupName || existingActive.adGroupName,
            targetName: targetName || existingActive.targetName,
            targetType: targetType || existingActive.targetType,
            changed,
            oldValue: String(existingActive.newValue),
            newValue: String(newValue ?? existingActive.oldValue),
            isActive: false,
            isReverted: true,
            closedAt: new Date(),
            impressions: snapshot.impressions,
            clicks: snapshot.clicks,
            spend: snapshot.spend,
            sales: snapshot.sales,
            orders: snapshot.orders,
            acos: snapshot.acos,
            roas: snapshot.roas,
            cpc: snapshot.cpc,
            ctr: snapshot.ctr,
            metricsHistory: [
              {
                ...snapshot,
                eventType: "REVERT_TO_BASELINE",
                notes: `Restored to baseline (${existingActive.newValue} -> ${newValue}). Dayparting schedule return to base.`,
              },
            ],
          });

          return await revertRecord.save();
        }

        // Create new active record for the new non-baseline adjustment
        const newRecord = new affectedCampaignByRuleSchema({
          conditionSnapshot,
          configId,
          profileId: Number(profileId),
          userId,
          ruleSchema,
          ruleId,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type,
          campaignId: Number(campaignId),
          adGroupId: adGroupId ? Number(adGroupId) : null,
          keywordId: keywordId ? Number(keywordId) : null,
          targetId: targetId ? String(targetId) : null,
          placement: placement ? String(placement) : null,
          searchTerm: searchTerm ? String(searchTerm) : null,
          name: name || existingActive.name,
          adGroupName: adGroupName || existingActive.adGroupName,
          targetName: targetName || existingActive.targetName,
          targetType: targetType || existingActive.targetType,
          changed,
          oldValue: String(existingActive.oldValue || oldValue),
          newValue: String(newValue ?? ""),
          isActive: true,
          impressions: snapshot.impressions,
          clicks: snapshot.clicks,
          spend: snapshot.spend,
          sales: snapshot.sales,
          orders: snapshot.orders,
          acos: snapshot.acos,
          roas: snapshot.roas,
          cpc: snapshot.cpc,
          ctr: snapshot.ctr,
          metricsHistory: [snapshot],
        });

        return await newRecord.save();
      } else {
        // Same value already active, append periodic sync snapshot
        const syncSnapshot = {
          ...snapshot,
          eventType: "CRON_SNAPSHOT",
          notes: notes && notes !== "Initial rule execution change" ? notes : "Periodic metric sync snapshot",
        };

        return await affectedCampaignByRuleSchema.findByIdAndUpdate(
          existingActive._id,
          {
            $set: {
              name: name || existingActive.name,
              adGroupName: adGroupName || existingActive.adGroupName,
              targetName: targetName || existingActive.targetName,
              targetType: targetType || existingActive.targetType,
              impressions: snapshot.impressions,
              clicks: snapshot.clicks,
              spend: snapshot.spend,
              sales: snapshot.sales,
              orders: snapshot.orders,
              acos: snapshot.acos,
              roas: snapshot.roas,
              cpc: snapshot.cpc,
              ctr: snapshot.ctr,
            },
            $push: { metricsHistory: syncSnapshot },
          },
          { new: true }
        );
      }
    }

    // Create fresh initial active record
    const newRecord = new affectedCampaignByRuleSchema({
      conditionSnapshot,
      configId,
      profileId: Number(profileId),
      userId,
      ruleSchema,
      ruleId,
      ruleDate: currentDate,
      ruleTime: currentTime,
      type,
      campaignId: Number(campaignId),
      adGroupId: adGroupId ? Number(adGroupId) : null,
      keywordId: keywordId ? Number(keywordId) : null,
      targetId: targetId ? String(targetId) : null,
      placement: placement ? String(placement) : null,
      searchTerm: searchTerm ? String(searchTerm) : null,
      name,
      adGroupName,
      targetName,
      targetType,
      changed,
      oldValue: String(oldValue ?? ""),
      newValue: String(newValue ?? ""),
      isActive: true,
      impressions: snapshot.impressions,
      clicks: snapshot.clicks,
      spend: snapshot.spend,
      sales: snapshot.sales,
      orders: snapshot.orders,
      acos: snapshot.acos,
      roas: snapshot.roas,
      cpc: snapshot.cpc,
      ctr: snapshot.ctr,
      metricsHistory: [snapshot],
    });

    return await newRecord.save();
  } catch (error) {
    console.error("[recordRuleExecutionChange Error]", error);
    return null;
  }
};

/**
 * Append periodic metric snapshot to all currently active affected records
 */
exports.appendMetricSnapshot = async ({
  configId,
  profileId,
  campaignId,
  targetId = null,
  placement = null,
  searchTerm = null,
  metrics = {},
  eventType = "CRON_SNAPSHOT",
  notes = "Periodic metric tracking snapshot",
}) => {
  try {
    const matchQuery = {
      configId,
      profileId: Number(profileId),
      campaignId: Number(campaignId),
      ...(targetId ? { targetId: String(targetId) } : {}),
      ...(placement ? { placement: String(placement) } : {}),
      ...(searchTerm ? { searchTerm: String(searchTerm) } : {}),
      isActive: true,
    };

    const activeRecords = await affectedCampaignByRuleSchema.find(matchQuery);
    if (!activeRecords || !activeRecords.length) return false;

    const snapshot = {
      timestamp: new Date(),
      date: moment().format("YYYY-MM-DD"),
      time: moment().format("hh:mm A"),
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      spend: Number(metrics.spend) || 0,
      sales: Number(metrics.sales) || 0,
      orders: Number(metrics.orders) || 0,
      acos: Number(metrics.acos) || 0,
      roas: Number(metrics.roas) || 0,
      cpc: Number(metrics.cpc) || 0,
      ctr: Number(metrics.ctr) || 0,
      eventType,
      notes,
    };

    await Promise.all(
      activeRecords.map(async (record) => {
        await affectedCampaignByRuleSchema.findByIdAndUpdate(record._id, {
          $set: {
            impressions: snapshot.impressions,
            clicks: snapshot.clicks,
            spend: snapshot.spend,
            sales: snapshot.sales,
            orders: snapshot.orders,
            acos: snapshot.acos,
            roas: snapshot.roas,
            cpc: snapshot.cpc,
            ctr: snapshot.ctr,
          },
          $push: {
            metricsHistory: {
              ...snapshot,
              settingValue: String(record.newValue || ""),
            },
          },
        });
      })
    );

    return true;
  } catch (error) {
    console.error("[appendMetricSnapshot Error]", error);
    return false;
  }
};

/**
 * Enrich affected items in rule history with live/latest campaign-level metrics (ACOS, ROAS, Spend, Sales)
 * calculated based on each rule's configured Date Filter (reportDate).
 */
exports.enrichWithCampaignMetrics = async (rules, profileId, ruleType = "") => {
  try {
    if (!Array.isArray(rules) || !rules.length || !profileId) return rules;

    // 1. Fetch profile fallback timezone
    const profileDoc = await profilesSchema
      .findOne({ profileId: Number(profileId) }, { timezone: 1 })
      .lean()
      .catch(() => null);
    const fallbackTimezone = profileDoc?.timezone || "America/Los_Angeles";

    // 2. Identify rules with missing reportDate or conditions
    const missingRuleIds = [];
    rules.forEach((rule) => {
      const hasReportDate =
        rule.reportDate ||
        rule.budgetRule?.reportDate ||
        rule.placementRule?.reportDate ||
        rule.searchTermRule?.reportDate ||
        rule.targetingrules?.reportDate;
      const hasConditions =
        rule.conditions !== undefined ||
        rule.budgetRule?.conditions !== undefined ||
        rule.placementRule?.conditions !== undefined ||
        rule.searchTermRule?.conditions !== undefined ||
        rule.targetingrules?.conditions !== undefined;
      if ((!hasReportDate || !hasConditions) && rule.ruleId) {
        missingRuleIds.push(rule.ruleId);
      }
    });

    const ruleDocMap = new Map();
    if (missingRuleIds.length > 0) {
      const uniqueMissing = [...new Set(missingRuleIds.map(String))];
      const normalizedType = String(ruleType).toLowerCase();
      let queryPromises = [];

      if (normalizedType.includes("targeting")) {
        queryPromises.push(
          targetingRuleSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => [])
        );
      } else if (normalizedType.includes("budget")) {
        queryPromises.push(
          budgetRulesSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => [])
        );
      } else if (normalizedType.includes("placement")) {
        queryPromises.push(
          placementRulesSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => [])
        );
      } else if (normalizedType.includes("search")) {
        queryPromises.push(
          searchTermRuleSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => [])
        );
      } else {
        queryPromises = [
          targetingRuleSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => []),
          budgetRulesSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => []),
          placementRulesSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => []),
          searchTermRuleSchema.find({ _id: { $in: uniqueMissing } }, { reportDate: 1, toDate: 1, timezone: 1, conditions: 1 }).lean().catch(() => []),
        ];
      }

      const results = await Promise.all(queryPromises);
      results.flat().forEach((doc) => {
        if (doc && doc._id) {
          ruleDocMap.set(String(doc._id), doc);
        }
      });
    }

    // 3. Resolve Date Filter and date range for each rule
    rules.forEach((rule) => {
      const parentDoc = ruleDocMap.get(String(rule.ruleId));
      const rawDateFilter =
        rule.reportDate ||
        rule.budgetRule?.reportDate ||
        rule.placementRule?.reportDate ||
        rule.searchTermRule?.reportDate ||
        rule.targetingrules?.reportDate ||
        parentDoc?.reportDate;

      const rawToDate =
        rule.toDate ||
        rule.budgetRule?.toDate ||
        rule.placementRule?.toDate ||
        rule.searchTermRule?.toDate ||
        rule.targetingrules?.toDate ||
        parentDoc?.toDate;

      const rawTimezone =
        rule.timezone ||
        rule.budgetRule?.timezone ||
        rule.placementRule?.timezone ||
        rule.searchTermRule?.timezone ||
        rule.targetingrules?.timezone ||
        parentDoc?.timezone ||
        fallbackTimezone;

      if (!rule.conditions) {
        rule.conditions =
          rule.budgetRule?.conditions ||
          rule.placementRule?.conditions ||
          rule.searchTermRule?.conditions ||
          rule.targetingrules?.conditions ||
          parentDoc?.conditions ||
          [];
      }

      const dateFilter = rawDateFilter ? String(rawDateFilter).trim() : "LIFETIME";
      let rangeKey = "LIFETIME";
      let dateRange = null;

      if (dateFilter && dateFilter !== "LIFETIME") {
        const calculated = getRuleDate(rawTimezone, dateFilter, rawToDate);
        if (calculated && calculated.fromDate && calculated.toDate) {
          rangeKey = `${calculated.fromDate}_${calculated.toDate}`;
          dateRange = calculated;
        }
      }

      rule._resolvedDateFilter = dateFilter;
      rule._resolvedRangeKey = rangeKey;
      rule._resolvedDateRange = dateRange;
    });

    // 4. Group campaign IDs by rangeKey
    const rangeGroups = new Map();
    rules.forEach((rule) => {
      const rKey = rule._resolvedRangeKey;
      if (!rangeGroups.has(rKey)) {
        rangeGroups.set(rKey, {
          dateRange: rule._resolvedDateRange,
          campaignIds: new Set(),
        });
      }
      const group = rangeGroups.get(rKey);
      const items = [
        ...(rule.affectedCampaigns || []),
        ...(rule.affectedTargets || []),
        ...(rule.affectedPlacements || []),
        ...(rule.affectedSearchTerms || []),
      ];
      items.forEach((item) => {
        if (item && item.campaignId) {
          group.campaignIds.add(Number(item.campaignId));
        }
      });
    });

    // 5. Query aggregations per rangeKey
    const metricsMap = new Map(); // `${rangeKey}_${campaignId}` => { spend, sales, acos, roas }

    await Promise.all(
      Array.from(rangeGroups.entries()).map(async ([rKey, { dateRange, campaignIds }]) => {
        if (!campaignIds || campaignIds.size === 0) return;
        const cIds = Array.from(campaignIds);

        const matchStage = {
          profileId: Number(profileId),
          campaignId: { $in: cIds },
        };
        if (dateRange && dateRange.fromDate && dateRange.toDate) {
          matchStage.reportDate = { $gte: dateRange.fromDate, $lte: dateRange.toDate };
        }

        const pipeline = [
          { $match: matchStage },
          {
            $group: {
              _id: "$campaignId",
              spend: { $sum: "$spend" },
              sales: { $sum: "$sales" },
              impressions: { $sum: "$impressions" },
              clicks: { $sum: "$clicks" },
              orders: { $sum: "$orders" },
            },
          },
        ];

        const [spMetrics, sbMetrics, sdMetrics] = await Promise.all([
          campaignsSchema.aggregate(pipeline).catch(() => []),
          sbCampaignsSchema.aggregate(pipeline).catch(() => []),
          sdCampaignsSchema.aggregate(pipeline).catch(() => []),
        ]);

        const aggregatedCampMap = new Map();
        [...spMetrics, ...sbMetrics, ...sdMetrics].forEach((m) => {
          if (!m || !m._id) return;
          const cid = Number(m._id);
          const prev = aggregatedCampMap.get(cid) || { spend: 0, sales: 0 };
          prev.spend += Number(m.spend) || 0;
          prev.sales += Number(m.sales) || 0;
          aggregatedCampMap.set(cid, prev);
        });

        aggregatedCampMap.forEach((val, cid) => {
          const spend = Number(val.spend.toFixed(2));
          const sales = Number(val.sales.toFixed(2));
          const acos = sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0;
          const roas = spend > 0 ? Number((sales / spend).toFixed(2)) : (sales > 0 ? 9999 : 0);
          metricsMap.set(`${rKey}_${cid}`, {
            spend,
            sales,
            acos,
            roas,
          });
        });
      })
    );

    // 6. Enrich all affected items with date-filter-aware campaign metrics
    rules.forEach((rule) => {
      const rKey = rule._resolvedRangeKey;
      const dateFilter = rule._resolvedDateFilter;
      const dateRange = rule._resolvedDateRange;

      const listKeys = ["affectedCampaigns", "affectedTargets", "affectedPlacements", "affectedSearchTerms"];
      listKeys.forEach((key) => {
        if (Array.isArray(rule[key])) {
          rule[key] = rule[key].map((item) => {
            if (!item) return item;
            const cid = Number(item.campaignId);
            const campMetrics = metricsMap.get(`${rKey}_${cid}`);
            if (campMetrics) {
              return {
                ...item,
                campaignAcos: campMetrics.acos,
                campaignRoas: campMetrics.roas,
                campaignSpend: campMetrics.spend,
                campaignSales: campMetrics.sales,
                acos: campMetrics.acos,
                roas: campMetrics.roas,
                ruleDateFilter: dateFilter,
                ...(dateRange ? { ruleDateRange: dateRange } : {}),
              };
            } else if (cid) {
              return {
                ...item,
                campaignAcos: 0,
                campaignRoas: 0,
                campaignSpend: 0,
                campaignSales: 0,
                acos: 0,
                roas: 0,
                ruleDateFilter: dateFilter,
                ...(dateRange ? { ruleDateRange: dateRange } : {}),
              };
            }
            return item;
          });
        }
      });

      rule.reportDate = dateFilter;
      if (dateRange) rule.reportDateRange = dateRange;
      delete rule._resolvedDateFilter;
      delete rule._resolvedRangeKey;
      delete rule._resolvedDateRange;
    });

    return rules;
  } catch (error) {
    console.error("[enrichWithCampaignMetrics Error]", error);
    return rules;
  }
};

