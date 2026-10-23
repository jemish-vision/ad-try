const { write_logs } = require("../../../winston/utility/logger");
const userSchema = require("../../models/user.model");
const permissionSchema = require("../../models/superAdmin/permission.model");
const roleSchema = require("../../models/superAdmin/role.model");
const organizationSchema = require("../../models/organization.model");
const roleBasedPermissionSchema = require("../../models/roleBasedPermission.model");
const userInvitationSchema = require("../../models/userInvitation.model");
const { sendEmailHelper } = require("../../helper/emailHelper");
const { buildPermissionUpdateEmail } = require("../../../emailTemplate/buildPermissionUpdateEmail");
const { ROLES } = require("../../constants/roles");

const getOrgForUser = async (user) => {
    if (!user) return null;
    const userId = user._id;
    const orgQuery = user.organizationId ? { $or: [{ userId }, { _id: user.organizationId }] } : { userId };
    return await organizationSchema.findOne(orgQuery).lean();
};

exports.getAllRoles = async (req, res) => {
    try {
        const roleName = req.role?.roleName;
        const isSuperAdmin = roleName === ROLES.SUPER_ADMIN;
        let query = {};

        if (!isSuperAdmin) {
            const orgId = req?.organizationId || (await getOrgForUser(req.user))?._id;
            if (orgId) {
                query = { organizationId: orgId };
            } else {
                query = { _id: null };
            }
        } else {
            const orgId = req?.organizationId;
            if (orgId && orgId !== "null" && orgId !== "undefined") {
                query = { organizationId: orgId };
            }
        }

        const roles = await roleSchema.find(query).populate("organizationId", "organizationName").sort({ createdAt: -1 }).lean();
        return res.status(200).send({
            message: "Get role successfully",
            data: roles,
            isSuccess: true,
        });
    } catch (error) {
        write_logs({ message: `[getAllRoles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

exports.createRole = async (req, res) => {
    try {
        const { roleName } = req.body;
        const organizationId = req?.organizationId;
        if (!roleName || !roleName.trim()) {
            return res.status(203).send({
                message: "Role name is required",
                isSuccess: false
            });
        }

        const roleNameTrimmed = roleName.trim();
        const roleNameLower = roleNameTrimmed.toUpperCase();
        if ([ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(roleNameLower)) {
            return res.status(203).send({
                message: "Cannot create system protected role names.",
                isSuccess: false
            });
        }

        const roleNameUser = req.role?.roleName;
        const isSuperAdmin = roleNameUser === ROLES.SUPER_ADMIN;
        let targetOrgId = null;

        if (isSuperAdmin) {
            targetOrgId = organizationId || null;
        } else {
            targetOrgId = req?.organizationId || (await getOrgForUser(req.user))?._id;
            if (!targetOrgId) {
                return res.status(203).send({
                    message: "Organization not found for user",
                    isSuccess: false
                });
            }
        }

        // Check duplicate within organization or global
        const existing = await roleSchema.findOne({ roleName: roleNameTrimmed, organizationId: targetOrgId }).lean();
        if (existing) {
            return res.status(203).send({
                message: "Role with this name already exists!",
                isSuccess: false
            });
        }

        const role = await roleSchema.create({ roleName: roleNameTrimmed, organizationId: targetOrgId });

        return res.status(200).send({
            message: "Role saved successfully",
            isSuccess: true,
            data: { roleId: role?._id, _id: role?._id, roleName: role.roleName, organizationId: role.organizationId }
        });
    } catch (error) {
        write_logs({ message: `[createRole Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        if (error.code === 11000) {
            return res.status(203).send({
                message: "Role with this name already exists!",
                isSuccess: false,
            });
        }
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}


exports.updateRole = async (req, res) => {
    try {
        const { roleName, roleId } = req.body;
        const organizationId = req?.organizationId;
        if (!roleId || !roleName || !roleName.trim()) {
            return res.status(203).send({
                message: "Role ID and Name are required",
                isSuccess: false
            });
        }

        const role = await roleSchema.findById(roleId).lean();
        if (!role) {
            return res.status(203).send({
                message: "Role not found",
                isSuccess: false
            });
        }

        if ([ROLES.SUPER_ADMIN, ROLES.ADMIN].includes((role.roleName || "").toUpperCase()) && !role.organizationId) {
            return res.status(203).send({
                message: "System roles cannot be renamed.",
                isSuccess: false
            });
        }

        const roleNameUser = req.role?.roleName;
        const isSuperAdmin = roleNameUser === ROLES.SUPER_ADMIN;
        let targetOrgId = role.organizationId;

        if (!isSuperAdmin) {
            const orgId = req?.organizationId || (await getOrgForUser(req.user))?._id;
            if (!orgId || !role.organizationId || role.organizationId.toString() !== orgId.toString()) {
                return res.status(203).send({
                    message: "You are not authorized to update this role.",
                    isSuccess: false
                });
            }
            targetOrgId = orgId;
        } else if (organizationId !== undefined) {
            targetOrgId = organizationId || null;
        }

        const roleNameTrimmed = roleName.trim();
        const existing = await roleSchema.findOne({ roleName: roleNameTrimmed, organizationId: targetOrgId, _id: { $ne: roleId } }).lean();
        if (existing) {
            return res.status(203).send({
                message: "Role with this name already exists!",
                isSuccess: false
            });
        }

        await roleSchema.findOneAndUpdate(
            { _id: roleId },
            { $set: { roleName: roleNameTrimmed, organizationId: targetOrgId } }
        ).lean();

        return res.status(200).send({
            message: "Role updated successfully",
            isSuccess: true,
        });
    } catch (error) {
        write_logs({ message: `[updateRole Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        if (error.code === 11000) {
            return res.status(203).send({
                message: "Role with this name already exists!",
                isSuccess: false,
            });
        }
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

exports.deleteRole = async (req, res) => {
    try {
        const { id: roleId } = req.body;

        if (!roleId) {
            return res.status(203).send({
                message: "Role ID is required.",
                isSuccess: false,
            });
        }

        const role = await roleSchema.findOne({ _id: roleId }).lean();
        if (!role) {
            return res.status(203).send({
                message: "Role not found.",
                isSuccess: false,
            });
        }

        if ([ROLES.SUPER_ADMIN, ROLES.ADMIN].includes((role.roleName || "").toUpperCase()) && !role.organizationId) {
            return res.status(203).send({
                message: "System protected roles cannot be deleted.",
                isSuccess: false
            });
        }

        const roleNameUser = req.role?.roleName;
        const isSuperAdmin = roleNameUser === ROLES.SUPER_ADMIN;

        if (!isSuperAdmin) {
            const orgId = req?.organizationId || (await getOrgForUser(req.user))?._id;
            if (!orgId || !role.organizationId || role.organizationId.toString() !== orgId.toString()) {
                return res.status(203).send({
                    message: "You are not authorized to delete this role.",
                    isSuccess: false
                });
            }
        }

        const isRoleInUseByUsers = await roleBasedPermissionSchema.findOne({ roleId }).lean();
        if (isRoleInUseByUsers) {
            return res.status(203).send({
                message: "Cannot delete this role because it is currently assigned to one or more users.",
                isSuccess: false
            });
        }

        const isRoleInUseByInvites = await userInvitationSchema.findOne({ roleId, status: "PENDING" }).lean();
        if (isRoleInUseByInvites) {
            return res.status(203).send({
                message: "Cannot delete this role because there are pending invitations associated with it.",
                isSuccess: false
            });
        }

        await roleSchema.deleteOne({ _id: roleId });
        await permissionSchema.deleteOne({ roleId });

        return res.status(200).send({
            message: "Role deleted successfully.",
            isSuccess: true,
        });

    } catch (error) {
        write_logs({ message: `[deleteRole Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.updatePermission = async (req, res) => {
    try {
        const { roleId, pages } = req.body;
        if (!roleId || !Array.isArray(pages)) {
            return res.status(203).send({
                message: "roleId and pages are required",
                isSuccess: false
            });
        }

        const role = await roleSchema.findById(roleId).lean();
        if (!role) {
            return res.status(203).send({
                message: "Role not found",
                isSuccess: false
            });
        }

        // Permission document
        let permissionDoc = await permissionSchema.findOne({ roleId });
        const totalAllowedPages = pages?.filter(p => p?.allocatedActions && p?.allocatedActions?.length > 0);

        // First time → create
        if (!permissionDoc) {
            const filteredPages = pages.filter(p => p?.allocatedActions?.length > 0);
            permissionDoc = await permissionSchema.create({ roleId, pages: filteredPages, allocatedOn: new Date() });

            return res.status(200).send({
                message: "Permissions created successfully",
                isSuccess: true,
                data: permissionDoc
            });
        }

        // Update existing permissions
        pages.forEach(newPage => {
            const existingPageIndex = permissionDoc.pages.findIndex(p => p.pageId.toString() === newPage.pageId);

            if (!newPage.allocatedActions || newPage.allocatedActions.length === 0) {
                if (existingPageIndex !== -1) {
                    permissionDoc.pages.splice(existingPageIndex, 1);
                }
                return;
            }

            // Update or Add page
            if (existingPageIndex !== -1) {
                permissionDoc.pages[existingPageIndex].allocatedActions = newPage.allocatedActions;
            } else {
                permissionDoc.pages.push(newPage);
            }
        });

        // Save updated result
        const updated = await permissionDoc.save();

        // Find users who should be notified
        const users = await userSchema.find({ roleId, isRolePermissionChangeNotify: true });
        if (users.length > 0 && totalAllowedPages?.length) {
            const emailPromises = users.map(user =>
                sendEmailHelper(
                    user.email,
                    "🔔 Your permissions have been updated",
                    buildPermissionUpdateEmail({ userName: user?.fullName, dashboardUrl: process?.env?.FRONTEND_REDIRECT_URL })
                )
            );
            await Promise.allSettled(emailPromises);
            await userSchema.updateMany({ roleId, isRolePermissionChangeNotify: true }, { isRolePermissionChangeNotify: false });
        }

        return res.status(200).send({
            message: "Permissions updated successfully",
            isSuccess: true,
            data: updated
        });

    } catch (error) {
        write_logs({ message: `[updatePermission Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

