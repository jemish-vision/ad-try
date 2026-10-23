const { default: mongoose } = require("mongoose");
const userSchema = require("../models/user.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const roleSchema = require("../models/superAdmin/role.model");
const configSchema = require("../models/config.model");
const organizationSchema = require("../models/organization.model");
const roleBasedPermissionSchema = require("../models/roleBasedPermission.model");
const jwt = require("jsonwebtoken");

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

        const configId = req?.headers?.["x-config-id"] || req?.body?.configId || req?.query?.configId;
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

            req.user = cached.user;
            req.user.id = cached.user._id;
            req.config = cached.config;
            req.role = cached.role;
            req.organizationId = cached.organizationId;

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
module.exports = { verifyToken, clearAuthCache };
