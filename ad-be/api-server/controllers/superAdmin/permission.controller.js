const { write_logs } = require("../../../winston/utility/logger");
const permissionSchema = require("../../models/superAdmin/permission.model");
const userSchema = require("../../models/user.model");
const mongoose = require("mongoose");
const pageSchema = require("../../models/superAdmin/pages.model");
const organizationSchema = require("../../models/organization.model");
const { ObjectId } = mongoose.Types;
const jwt = require("jsonwebtoken");
const { ROLES } = require("../../constants/roles");
const roleBasedPermissionSchema = require("../../models/roleBasedPermission.model");

const { getOrganizationUserPagePermission } = require("../../helper/common");

exports.getAdminPermission = async (req, res) => {
  try {
    const organizationId = req?.organizationId;
    const { id } = req?.user || {};

    const result = await getOrganizationUserPagePermission(organizationId, id);

    if (!result.isSuccess) {
      return res.status(203).send({
        message: result.message || "Permission not assign to this user!",
        isSuccess: false,
      });
    }

    let transformedData = result.data;
    if (transformedData?.pages?.length === 0) transformedData.pages = null;

    return res.status(200).send({
      message: "Permission get successfully.",
      isSuccess: true,
      data: transformedData,
    });
  } catch (error) {
      write_logs({ message: `[getAdminPermission Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getCustomerPermissions = async (req, res) => {
  try {
    const { roleId } = req.body;

    const pages = await pageSchema.aggregate([
      // 1. Filter Active pages
      {
        $match: {
          isActive: true
        }
      },
      // 2. Lookup actions of each page
      {
        $lookup: {
          from: "pageactions",
          localField: "_id",
          foreignField: "pageId",
          as: "actions"
        }
      },

      // 3. Lookup permissions of this user
      {
        $lookup: {
          from: "permissions",
          let: { pageId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$roleId", new mongoose.Types.ObjectId(roleId)] } } },
            { $unwind: "$pages" },
            { $match: { $expr: { $eq: ["$pages.pageId", "$$pageId"] } } },
            {
              $project: {
                allocatedActions: "$pages.allocatedActions"
              }
            }
          ],
          as: "permissionDetails"
        }
      },

      // 4. Flatten
      {
        $addFields: {
          allocatedActions: {
            $ifNull: [{ $arrayElemAt: ["$permissionDetails.allocatedActions", 0] }, []]
          }
        }
      },

      // 5. Clean output
      {
        $project: {
          permissionDetails: 0
        }
      }
    ]);

    const roleName = req.role?.roleName;
    const isSuperAdmin = roleName === ROLES.SUPER_ADMIN;

    let resultPages = pages;
    if (!isSuperAdmin) {
      const userId = req.user?._id;
      const orgId = req?.organizationId;
      const org = orgId ? await organizationSchema.findById(orgId).populate("planId").lean() : await organizationSchema.findOne({ $or: [{ userId }, { _id: req.user?.organizationId }] }).populate("planId").lean();
      const findPackage = org?.planId;

      if (findPackage && Array.isArray(findPackage.pages)) {
        const allowedMap = new Map();
        for (const pkgPage of findPackage.pages) {
          if (pkgPage?.pageId) {
            const allowedActions = new Set();
            if (Array.isArray(pkgPage.allocatedActions)) {
              for (const act of pkgPage.allocatedActions) {
                if (act?.status && act?.actionId) {
                  allowedActions.add((act.actionId._id || act.actionId).toString());
                }
              }
            }
            allowedMap.set((pkgPage.pageId._id || pkgPage.pageId).toString(), allowedActions);
          }
        }

        const filteredPages = [];
        for (const page of pages) {
          const pageIdStr = page._id.toString();
          if (allowedMap.has(pageIdStr)) {
            const allowedActionsSet = allowedMap.get(pageIdStr);
            const filteredActions = (page.actions || []).filter(act => allowedActionsSet.has(act._id.toString()));
            if (filteredActions.length > 0) {
              page.actions = filteredActions;
              page.allocatedActions = (page.allocatedActions || []).filter(act => act?.actionId && allowedActionsSet.has((act.actionId._id || act.actionId).toString()));
              filteredPages.push(page);
            }
          }
        }
        resultPages = filteredPages;
      }
    }

    return res.status(200).send({
      message: "Page details with permissions fetched",
      isSuccess: true,
      data: resultPages
    });

  } catch (error) {
      write_logs({ message: `[getCustomerPermissions Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.log(error);
    return res.status(500).send({
      message: "Something went wrong!",
      isSuccess: false,
      error: "An internal server error occurred"
    });
  }
};

exports.updateCustomerPermissions = async (req, res) => {
  try {
    const { userId, pages } = req.body;

    if (!userId || !Array.isArray(pages)) {
      return res.status(400).send({
        message: "userId and pages are required",
        isSuccess: false
      });
    }

    // Ensure user exists
    const user = await userSchema.findById(userId).lean();
    if (!user) {
      return res.status(404).send({
        message: "User not found",
        isSuccess: false
      });
    }

    // Permission document
    let permissionDoc = await permissionSchema.findOne({ userId });

    // First time → create
    if (!permissionDoc) {
      const filteredPages = pages.filter(p => p?.allocatedActions?.length > 0);
      permissionDoc = await permissionSchema.create({ userId, pages: filteredPages, allocatedOn: new Date() });

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

    return res.status(200).send({
      message: "Permissions updated successfully",
      isSuccess: true,
      data: updated
    });

  } catch (error) {
      write_logs({ message: `[updateCustomerPermissions Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong",
      isSuccess: false,
      error: "An internal server error occurred"
    });
  }
};

exports.updateCustomerPermission = async (req, res) => {
  try {
    const userId = new ObjectId("687091bf7743375a821e499f");
    const pageId = new ObjectId("64faa7dc15daa668a47a9756");
    const actionId = new ObjectId("68df5d95624f1c262ec54581");
    const status = true;

    const getUserPermission = await permissionSchema.findOne({ userId });
    if (!getUserPermission) {
      return res.status(203).send({
        message: "Permission not assign to this user!",
        isSuccess: false,
      });
    }
    const pageToUpdate = getUserPermission.pages.find(
      (page) => page.pageId == pageId
    );
    if (!pageToUpdate) {
      return res.status(203).send({
        message: "Page not found!",
        isSuccess: false,
      });
    }
    const actionToUpdate = pageToUpdate.allocatedActions.find(
      (action) => action.actionId == actionId
    );
    if (!actionToUpdate) {
      return res.status(203).send({
        message: "Action not found!",
        isSuccess: false,
      });
    }
    actionToUpdate.status = status;
    await getUserPermission.save();
    return res.status(200).send({
      message: "Permission updated successfully.",
      isSuccess: true,
      data: getUserPermission,
    });
  } catch (error) {
      write_logs({ message: `[updateCustomerPermission Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};
