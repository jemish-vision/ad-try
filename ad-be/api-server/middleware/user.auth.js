const { default: mongoose } = require("mongoose");
const { AsyncLocalStorage } = require("async_hooks");
const userSchema = require("../models/user.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const roleSchema = require("../models/superAdmin/role.model");
const configSchema = require("../models/config.model");
const organizationSchema = require("../models/organization.model");
const roleBasedPermissionSchema = require("../models/roleBasedPermission.model");
const MockTestingData = require("../models/mockTestingData.model");
const jwt = require("jsonwebtoken");

// Request-scoped AsyncLocalStorage to enforce "No Amazon API calls" in Demo Mode
const demoRequestStorage = new AsyncLocalStorage();

const isDemoModeActive = () => {
  const store = demoRequestStorage.getStore();
  return Boolean(store?.isMockUser);
};

// In-memory cache for auth sessions with 60s TTL to eliminate query storm on simultaneous API requests
// Passive on-demand eviction (0 background timers, 0 event loop overhead)
const authCache = new Map();
const AUTH_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const MAX_AUTH_CACHE_SIZE = 500;

const clearAuthCache = (userId) => {
  if (!userId) {
    authCache.clear();
    return;
  }
  const prefix = `${userId}_`;
  for (const key of authCache.keys()) {
    if (key.startsWith(prefix)) {
      authCache.delete(key);
    }
  }
};

// Enforce Demo Account Restrictions:
// ❌ No real changes applied to Amazon
// ❌ No real bulk actions
// ❌ No Amazon API calls
const DEMO_BULK_BLOCKED_PATTERNS = [
  /\/applyInAmazon\b/i,
  /\/bulkUpdateProductAds\b/i,
  /\/importBidPlacementRule\b/i,
  /\/importTargetingRule\b/i,
  /\/importSearchTermRule\b/i,
  /\/manualRunPlacementRule\b/i,
  /\/manualRunTargetingRule\b/i,
  /\/manualRunSearchTermRule\b/i,
  /\/syncLast30Days\b/i,
  /\/cronList/i,
  /\/amazonRedirect\b/i,
  /\/amazonSPRedirect\b/i,
  /\/amazonDisconnect\b/i,
  /\/manageSubscribeAMS\b/i,
  /\/addToNegative\b/i,
  /\/addToNegativeProduct\b/i,
  /\/addNegativeToCampaign\b/i,
];

const hasMultiItemBulkPayload = (body) => {
  if (!body || typeof body !== "object") return false;
  const bulkArrayKeys = [
    "ids",
    "targetIds",
    "campaignIds",
    "campaigns",
    "targets",
    "updateTargets",
    "productAds",
    "placements",
    "searchTerms",
    "negativeKeywords",
    "negativeTargets",
    "rules",
  ];
  for (const key of bulkArrayKeys) {
    if (Array.isArray(body[key]) && body[key].length > 1) {
      return true;
    }
  }
  return false;
};

const handleDemoModeRestrictions = async (req, res) => {
  const url = String(req.originalUrl || req.url || "");
  const method = String(req.method || "GET").toUpperCase();

  // 1. Block explicit bulk/sync/live-Amazon action endpoints
  for (const pattern of DEMO_BULK_BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      res.status(200).send({
        isSuccess: false,
        isDemoRestriction: true,
        message: "Demo Mode Restriction: Real bulk actions and live changes to Amazon are disabled in Demo Account.",
      });
      return true;
    }
  }

  // 2. Block multi-item bulk mutation payloads on write methods
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && hasMultiItemBulkPayload(req.body)) {
    res.status(200).send({
      isSuccess: false,
      isDemoRestriction: true,
      message: "Demo Mode Restriction: Bulk actions on multiple items are disabled in Demo Account.",
    });
    return true;
  }

  // 3. Intercept single-item live Amazon mutation routes so NO real changes are applied to Amazon
  //    and NO real database tables are modified (updates only mock_testing_data or returns demo notice)
  if (/\/updateCampaignStatus\b/i.test(url)) {
    const { campaignId, status, name, budget, startDate, endDate } = req.body || {};
    if (campaignId) {
      const updateFields = {};
      if (status) updateFields["payload.status"] = status;
      if (name) updateFields["payload.name"] = name;
      if (budget !== undefined) updateFields["payload.budget"] = Number(budget);
      if (startDate) updateFields["payload.startDate"] = startDate;
      if (endDate !== undefined) updateFields["payload.endDate"] = endDate;
      if (Object.keys(updateFields).length > 0) {
        await MockTestingData.updateMany(
          { module: "CAMPAIGN", recordKey: String(campaignId) },
          { $set: updateFields }
        );
      }
    }
    res.status(200).send({
      isSuccess: true,
      isDemoSimulated: true,
      message: "Demo Mode: Campaign updated locally in sandbox (no changes sent to Amazon).",
    });
    return true;
  }

  if (/\/targeting\/adjustBid\b/i.test(url)) {
    const { targetId, bid } = req.body || {};
    if (targetId && bid !== undefined) {
      await MockTestingData.updateMany(
        { module: "TARGETING", recordKey: String(targetId) },
        { $set: { "payload.bid": Number(bid), "payload.currentBid": Number(bid) } }
      );
    }
    res.status(200).send({
      isSuccess: true,
      isDemoSimulated: true,
      message: "Demo Mode: Target bid updated locally in sandbox (no changes sent to Amazon).",
    });
    return true;
  }

  if (/\/targeting\/changeStatus\b/i.test(url)) {
    const { targetId, status, state } = req.body || {};
    const nextState = status || state;
    if (targetId && nextState) {
      await MockTestingData.updateMany(
        { module: "TARGETING", recordKey: String(targetId) },
        { $set: { "payload.state": String(nextState).toUpperCase(), "payload.status": String(nextState).toUpperCase() } }
      );
    }
    res.status(200).send({
      isSuccess: true,
      isDemoSimulated: true,
      message: "Demo Mode: Target status updated locally in sandbox (no changes sent to Amazon).",
    });
    return true;
  }

  if (/\/placement\/(updatePlacementBid|saveInDB)\b/i.test(url)) {
    res.status(200).send({
      isSuccess: true,
      isDemoSimulated: true,
      message: "Demo Mode: Placement multiplier simulated in sandbox (no real changes applied to Amazon).",
    });
    return true;
  }

  if (/\/(addToNegative|addToNegativeProduct|addNegativeToCampaign|addNegativeTargetings|removeSearchTerm)\b/i.test(url)) {
    res.status(200).send({
      isSuccess: true,
      isDemoSimulated: true,
      message: "Demo Mode: Negative targeting action simulated in sandbox (no real changes applied to Amazon).",
    });
    return true;
  }

  return false;
};

const verifyToken = async (req, res, next) => {
  const token = req.header("authorization") || req.headers["x-access-token"] || req.body.token;
  if (!token) {
    return res.status(203).send({ message: "Token is required", isSuccess: false });
  }
  const bearerToken = token.split(" ")[1];
  try {
    jwt.verify(
      bearerToken,
      process.env.CUSTOMER_TOKEN_KEY,
      { algorithms: ["HS256"] },
      async (error, authData) => {

        if (error) {
          return res.status(203).send({ error: "An internal server error occurred", message: "Invalid token", isSuccess: false });
        }

        const rawConfigId = req?.headers?.["x-config-id"] || req?.body?.configId || req?.query?.configId;
        const configId = String(rawConfigId) === "000000000000000000000001" ? null : rawConfigId;
        const configIdHeader = rawConfigId;
        const validConfigObjectId = configId && mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : null;
        const orgIdHeader = req?.headers?.["x-organization-id"] || req?.headers?.["organizationid"] || req?.query?.organizationId || req?.body?.organizationId || null;

        const cacheKey = `${authData?.user_id}_${authData?.roleId}_${configId || "none"}_${orgIdHeader || "none"}`;
        const cached = authCache.get(cacheKey);

        if (cached) {
          if (cached.expiresAt <= Date.now()) {
            authCache.delete(cacheKey);
          } else {
            if (!cached.user || cached.user.isActive === false) {
              return res.status(203).send({ message: "User account is inactive or disabled", isSuccess: false });
            }

            req.user = { ...cached.user, id: cached.user._id };
            req.config = cached.config;
            req.role = cached.role;
            req.organizationId = cached.organizationId;

            const isDemoRequest = Boolean(cached.user?.isMockUser);
            if (isDemoRequest) {
              req.isMockTestingUser = true;
              req.user.isMockUser = true;
              req.config = {
                configId: new mongoose.Types.ObjectId("000000000000000000000001"),
                profileId: 99999901,
              };
              const handled = await handleDemoModeRestrictions(req, res);
              if (handled) return;
              return demoRequestStorage.run({ isMockUser: true, userId: req.user._id }, () => next());
            }

            if (validConfigObjectId && !req.config) {
              const isOwnerOrAdmin = cached.role?.roleName === "SUPER_ADMIN" || cached.role?.roleName === "ADMIN";
              if (isOwnerOrAdmin) {
                req.config = { configId: validConfigObjectId };
              } else {
                return res.status(203).send({ message: "Access denied. You do not have permission to access this resource.", isSuccess: false });
              }
            }

            return next();
          }
        }

        let user = await userSchema.findOne({ _id: authData?.user_id }).lean();
        let role = await roleSchema.findOne({ _id: authData?.roleId }).lean();

        if (!user || user?.isActive === false) {
          return res.status(203).send({ message: "User account is inactive or disabled", isSuccess: false });
        }

        const pipeline = [
          { $match: { userId: user?._id, hasAccess: true, ...(validConfigObjectId && { configId: validConfigObjectId }) } },
          {
            $lookup: {
              from: "profiles",
              let: { pId: "$profileId", cId: "$configId" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$profileId", "$$pId"] },
                        { $eq: ["$configId", "$$cId"] },
                        { $eq: ["$isActive", true] }
                      ]
                    }
                  }
                }
              ],
              as: "profile"
            }
          },
          { $unwind: "$profile" },
          { $project: { _id: 0, profileId: "$profile.profileId", configId: "$profile.configId" } },
          { $limit: 1 }
        ];
        const profiles = await profileBasedPermissionSchema.aggregate(pipeline);

        req.user = user;
        req.user.id = user._id;
        req.config = profiles?.[0];
        req.role = role;

        if (user?.isMockUser) {
          req.config = {
            configId: new mongoose.Types.ObjectId("000000000000000000000001"),
            profileId: 99999901,
          };
        }

        let orgId = orgIdHeader;
        if (orgId && orgId !== "null" && orgId !== "undefined" && mongoose.Types.ObjectId.isValid(orgId)) {
          orgId = new mongoose.Types.ObjectId(orgId);
        } else orgId = null;

        if (!orgId && (req.config?.configId || validConfigObjectId)) {
          const configDoc = await configSchema.findById(req.config?.configId || validConfigObjectId).lean();
          if (configDoc?.organizationId) orgId = configDoc.organizationId;
        }

        if (!orgId) {
          const org = await organizationSchema.findOne({ $or: [{ userId: user?._id }, { _id: user?.organizationId }] }).lean();
          if (org?._id) orgId = org._id;
        }

        if (!orgId) {
          const rolePerm = await roleBasedPermissionSchema.findOne({ userId: user?._id }).sort({ createdAt: -1 }).lean();
          if (rolePerm?.organizationId) orgId = rolePerm.organizationId;
        }

        req.organizationId = orgId;

        // Maintain bounded cache size without background timers
        if (authCache.size >= MAX_AUTH_CACHE_SIZE) {
          const oldestKey = authCache.keys().next().value;
          if (oldestKey) authCache.delete(oldestKey);
        }

        authCache.set(cacheKey, {
          user,
          role,
          config: req.config,
          organizationId: orgId,
          expiresAt: Date.now() + AUTH_CACHE_TTL_MS
        });

        const isDemoNonCached = Boolean(user?.isMockUser);
        if (isDemoNonCached) {
          req.isMockTestingUser = true;
          req.user.isMockUser = true;
          req.config = {
            configId: new mongoose.Types.ObjectId("000000000000000000000001"),
            profileId: 99999901,
          };
          const handled = await handleDemoModeRestrictions(req, res);
          if (handled) return;
          return demoRequestStorage.run({ isMockUser: true, userId: user._id }, () => next());
        }

        if (validConfigObjectId && !req.config) {
          const isOwnerOrAdmin = role?.roleName === "SUPER_ADMIN" || role?.roleName === "ADMIN";
          if (isOwnerOrAdmin) {
            req.config = { configId: validConfigObjectId };
          } else {
            return res.status(203).send({ message: "Access denied. You do not have permission to access this resource.", isSuccess: false });
          }
        }

        next();
      }
    );
  } catch (error) {
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};
module.exports = { verifyToken, clearAuthCache, isDemoModeActive };
