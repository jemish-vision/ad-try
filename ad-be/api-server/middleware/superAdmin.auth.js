const { ROLES } = require("../constants/roles");

exports.requireSuperAdmin = (req, res, next) => {
  const roleName = req?.role?.roleName;
  if (roleName === ROLES.SUPER_ADMIN) {
    return next();
  }
  return res.status(403).json({
    message: "Access Forbidden: Owners Only",
    isSuccess: false,
  });
};
