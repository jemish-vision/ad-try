const { ROLES } = require("../constants/roles");

const verifyCronAuth = (req, res, next) => {
  const cronSecret = req.headers["x-cron-secret"] || req.query.cronSecret;
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret === expectedSecret) {
    return next();
  }

  // Also allow if caller is authenticated admin / owner
  if (req.user && [ROLES.SUPER_ADMIN].includes(req?.role?.roleName)) {
    return next();
  }

  return res.status(401).json({
    isSuccess: false,
    message: "Unauthorized: Invalid or missing cron authentication secret.",
  });
};

module.exports = { verifyCronAuth };
