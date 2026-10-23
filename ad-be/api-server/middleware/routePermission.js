const { checkPermission } = require("../helper/common");

const validateRoutePermission = (pageName, actionType = "View Only", fallbackPermissions = []) => {
  return async (req, res, next) => {
    try {
      const organizationId = req?.organizationId;
      const userId = req?.user?._id;

      let permissionResult = await checkPermission(userId, pageName, actionType, true, organizationId);
      
      // If primary permission check fails, evaluate the fallbacks
      if (!permissionResult.hasPermission && Array.isArray(fallbackPermissions) && fallbackPermissions.length > 0) {
        for (const fallback of fallbackPermissions) {
          const fallbackAction = fallback?.actionType || "View Only";
          const fallbackResult = await checkPermission(userId, fallback?.pageName, fallbackAction, true, organizationId);
          if (fallbackResult.hasPermission) {
            permissionResult = fallbackResult;
            break; // Stop checking once we find a valid permission
          }
        }
      }

      if (!permissionResult.hasPermission) {
        return res.status(203).send({
          isSuccess: false,
          message: permissionResult.message,
        });
      }

      next();
    } catch (error) {
      return res.status(203).send({
        isSuccess: false,
        message: "Permission Validation Failed",
        error: error.message,
      });
    }
  };
};

module.exports = { validateRoutePermission };
