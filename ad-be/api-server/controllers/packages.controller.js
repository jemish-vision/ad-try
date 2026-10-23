const { write_logs } = require("../../winston/utility/logger");
const subscriptionHistorySchema = require("../models/subscriptionHistories.model");
const packageSchema = require("../models/packages.model");
const pageSchema = require("../models/superAdmin/pages.model");
const organizationSchema = require("../models/organization.model");
const mongoose = require("mongoose");
const { ROLES } = require("../constants/roles");

exports.getAllPackages = async (req, res) => {
  try {
    const isOwner = req?.role?.roleName === ROLES.SUPER_ADMIN;

    const pipeline = [
      ...(!isOwner ? [{ $match: { isActive: true } }] : []),
      { $sort: { price: 1 } }
    ];

    const packages = await packageSchema.aggregate(pipeline);

    return res.status(200).json({
      isSuccess: true,
      message: "Packages fetched successfully",
      data: packages,
    });

  } catch (error) {
      write_logs({ message: `[getAllPackages Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Something went wrong, please try again!",
      error: "An internal server error occurred",
    });
  }
};

exports.createPackages = async (req, res) => {
  try {
    const {
      name,
      allowAmazonConnection,
      amazonConnectLimit,
      price,
      monthlyPrice,
      yearlyPrice,
      profileLimit,
      numberOfInvites,
      numberOfOrganization,
      trialDays,
      isActive,
      isPublic,
      currency,
      description,
      features,
      isPopular,
      pages
    } = req.body;

    /* -------------------- 1. Validation -------------------- */
    if (!name) {
      return res.status(203).json({
        isSuccess: false,
        message: "Package name is required",
      });
    }

    if (price === undefined && monthlyPrice === undefined) {
      return res.status(203).json({
        isSuccess: false,
        message: "Package price is required",
      });
    }

    /* -------------------- 2. Check Duplicate -------------------- */
    const existingPackage = await packageSchema.findOne({ name: name.trim() }).lean();

    if (existingPackage) {
      return res.status(203).json({
        isSuccess: false,
        message: "Package with this name already exists",
      });
    }

    /* -------------------- 3. Create Package -------------------- */
    const connectLimit = amazonConnectLimit !== undefined ? amazonConnectLimit : (allowAmazonConnection !== undefined ? allowAmazonConnection : 0);
    const resolvedPrice = price !== undefined ? price : (monthlyPrice !== undefined ? monthlyPrice : 0);

    const formattedPages = Array.isArray(pages) ? pages.filter(p => p?.allocatedActions?.length > 0).map(p => ({
      pageId: p.pageId,
      allocatedActions: p.allocatedActions,
      allocatedOn: p.allocatedOn || new Date()
    })) : [];

    const newPackage = await packageSchema.create({
      name: name.trim(),
      allowAmazonConnection: connectLimit,
      amazonConnectLimit: connectLimit,
      price: resolvedPrice,
      monthlyPrice: monthlyPrice !== undefined ? monthlyPrice : resolvedPrice,
      yearlyPrice: yearlyPrice !== undefined ? yearlyPrice : 0,
      profileLimit: profileLimit !== undefined ? profileLimit : 0,
      numberOfInvites: numberOfInvites !== undefined ? numberOfInvites : 0,
      numberOfOrganization: numberOfOrganization !== undefined ? numberOfOrganization : 0,
      trialDays: trialDays || 0,
      isActive: isActive !== undefined ? isActive : true,
      isPublic: isPublic !== undefined ? isPublic : true,
      currency: currency || "USD",
      description: description || "",
      features: Array.isArray(features) ? features : [],
      isPopular: Boolean(isPopular),
      pages: formattedPages,
    });

    return res.status(200).json({
      isSuccess: true,
      message: "Package created successfully",
      data: newPackage,
    });

  } catch (error) {
      write_logs({ message: `[createPackages Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("createPackages error:", error);
    return res.status(203).json({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.changeStatusPackages = async (req, res) => {
  try {
    const { packageId, isActive } = req.body;

    if (!packageId) {
      return res.status(203).json({
        isSuccess: false,
        message: "packageId is required",
      });
    }

    const updatedPackage = await packageSchema.findByIdAndUpdate(packageId, { isActive }, { new: true });
    if (!updatedPackage) {
      return res.status(203).json({
        isSuccess: false,
        message: "Package not found",
      });
    }

    return res.status(200).json({
      isSuccess: true,
      message: "Package status updated successfully",
      data: updatedPackage,
    });

  } catch (error) {
      write_logs({ message: `[changeStatusPackages Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Something went wrong, please try again!",
      error: "An internal server error occurred",
    });
  }
};

exports.updatePackages = async (req, res) => {
  try {
    const {
      packageId,
      name,
      allowAmazonConnection,
      amazonConnectLimit,
      price,
      monthlyPrice,
      yearlyPrice,
      profileLimit,
      numberOfInvites,
      numberOfOrganization,
      trialDays,
      isActive,
      isPublic,
      currency,
      description,
      features,
      isPopular,
      pages,
    } = req.body;

    if (!packageId) {
      return res.status(203).json({
        isSuccess: false,
        message: "packageId is required",
      });
    }

    // Optional: prevent duplicate names
    if (name) {
      const exists = await packageSchema.findOne({ name: name.trim(), _id: { $ne: packageId } }).lean();
      if (exists) {
        return res.status(203).json({
          isSuccess: false,
          message: "Package with this name already exists",
        });
      }
    }

    const updateFields = {
      ...(name && { name: name.trim() }),
      ...(price !== undefined && { price }),
      ...(monthlyPrice !== undefined && { monthlyPrice, ...(price === undefined && { price: monthlyPrice }) }),
      ...(yearlyPrice !== undefined && { yearlyPrice }),
      ...(amazonConnectLimit !== undefined && { amazonConnectLimit, allowAmazonConnection: amazonConnectLimit }),
      ...(allowAmazonConnection !== undefined && amazonConnectLimit === undefined && { allowAmazonConnection, amazonConnectLimit: allowAmazonConnection }),
      ...(profileLimit !== undefined && { profileLimit }),
      ...(numberOfInvites !== undefined && { numberOfInvites }),
      ...(numberOfOrganization !== undefined && { numberOfOrganization }),
      ...(trialDays !== undefined && { trialDays }),
      ...(isActive !== undefined && { isActive }),
      ...(isPublic !== undefined && { isPublic }),
      ...(currency !== undefined && { currency }),
      ...(description !== undefined && { description }),
      ...(features !== undefined && { features: Array.isArray(features) ? features : [] }),
      ...(isPopular !== undefined && { isPopular: Boolean(isPopular) }),
    };

    if (Array.isArray(pages)) {
      updateFields.pages = pages.filter(p => p?.allocatedActions?.length > 0).map(p => ({
        pageId: p.pageId,
        allocatedActions: p.allocatedActions,
        allocatedOn: p.allocatedOn || new Date()
      }));
    }

    const updatedPackage = await packageSchema.findByIdAndUpdate(
      packageId,
      updateFields,
      { new: true }
    );

    if (!updatedPackage) {
      return res.status(203).json({
        isSuccess: false,
        message: "Package not found",
      });
    }

    return res.status(200).json({
      isSuccess: true,
      message: "Package updated successfully",
      data: updatedPackage,
    });

  } catch (error) {
      write_logs({ message: `[updatePackages Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Something went wrong, please try again!",
      error: "An internal server error occurred",
    });
  }
};

exports.deletePackages = async (req, res) => {
  try {
    const { packageId, newPlanId } = req.body;

    if (!packageId) {
      return res.status(203).json({
        isSuccess: false,
        message: "packageId is required",
      });
    }

    if (newPlanId) {
      await organizationSchema.updateMany(
        { planId: packageId },
        { $set: { planId: newPlanId } }
      );
    }

    const deletedPackage = await packageSchema.findByIdAndDelete(packageId);
    if (!deletedPackage) {
      return res.status(203).json({
        isSuccess: false,
        message: "Package not found",
      });
    }

    return res.status(200).json({
      isSuccess: true,
      message: "Package deleted successfully",
    });
  } catch (error) {
      write_logs({ message: `[deletePackages Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Something went wrong, please try again!",
      error: "An internal server error occurred",
    });
  }
};

exports.getSubscriptionHistory = async (req, res) => {
  try {
    const {
      pageNo = 1,
      perPage = 10,
      searchName,
      fieldName = "createdAt",
      sortType = "DESC",
      status, // active | cancelled | expired | all
    } = req.body;

    const skip = (pageNo - 1) * perPage;

    const matchStage = {};

    if (status && status !== "all") {
      matchStage.status = status;
    }

    const searchStage = searchName && {
      $or: [
        { "user.email": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
        { "user.fullName": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
        { "package.name": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
      ],
    };

    const sortStage = {
      [fieldName]: sortType === "ASC" ? 1 : -1,
    };

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "packages",
          localField: "packageId",
          foreignField: "_id",
          as: "package",
        },
      },
      { $unwind: { path: "$package", preserveNullAndEmptyArrays: true } },
      ...(searchStage ? [{ $match: searchStage }] : []),
      { $sort: sortStage },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: Number(perPage) },
            {
              $project: {
                _id: 1,
                price: 1,
                paymentDate: 1,
                startDate: 1,
                endDate: 1,
                status: 1,
                createdAt: 1,

                userId: "$user._id",
                email: "$user.email",
                fullName: "$user.fullName",

                packageId: "$package._id",
                packageName: "$package.name",
              },
            },
          ],
          totalRecords: [{ $count: "count" }],
          totalRevenue: [
            { $match: { price: { $gt: 0 } } },
            { $group: { _id: null, amount: { $sum: "$price" } } },
          ],
        },
      },
    ];

    const result = await subscriptionHistorySchema.aggregate(pipeline);

    const data = result[0]?.data || [];
    const totalRecords = result[0]?.totalRecords?.[0]?.count || 0;
    const totalRevenue = result[0]?.totalRevenue?.[0]?.amount || 0;

    return res.status(200).json({
      isSuccess: true,
      data,
      revenue: totalRevenue,
      totalRow: totalRecords ? { count: totalRecords } : {},
      currentPageNo: Number(pageNo),
      totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
    });

  } catch (error) {
      write_logs({ message: `[getSubscriptionHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "An internal server error occurred",
    });
  }
};

exports.getPackagePermissions = async (req, res) => {
  try {
    const { packageId } = req.body;
    const pkgObjectId = (packageId && mongoose.Types.ObjectId.isValid(packageId)) ? new mongoose.Types.ObjectId(packageId) : null;

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
      // 3. Lookup permissions of this package
      {
        $lookup: {
          from: "packages",
          let: { pageId: "$_id" },
          pipeline: [
            {
              $match: pkgObjectId ? { _id: pkgObjectId } : { _id: null }
            },
            { $unwind: "$pages" },
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$pages.pageId" }, { $toString: "$$pageId" }]
                }
              }
            },
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

    return res.status(200).send({
      message: "Page details with package permissions fetched",
      isSuccess: true,
      data: pages
    });

  } catch (error) {
      write_logs({ message: `[getPackagePermissions Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.log("getPackagePermissions error:", error);
    return res.status(500).send({
      message: "Something went wrong!",
      isSuccess: false,
      error: "An internal server error occurred"
    });
  }
};

exports.updatePackagePermissions = async (req, res) => {
  try {
    const { packageId, pages } = req.body;

    if (!packageId || !Array.isArray(pages)) {
      return res.status(400).send({
        message: "packageId and pages are required",
        isSuccess: false
      });
    }

    const packageDoc = await packageSchema.findById(packageId);
    if (!packageDoc) {
      return res.status(404).send({
        message: "Package not found",
        isSuccess: false
      });
    }

    const filteredPages = pages.filter(p => p?.allocatedActions?.length > 0);
    packageDoc.pages = filteredPages.map(p => ({
      ...p,
      allocatedOn: p.allocatedOn || new Date()
    }));

    const updated = await packageDoc.save();

    return res.status(200).send({
      message: "Package permissions updated successfully",
      isSuccess: true,
      data: updated
    });

  } catch (error) {
      write_logs({ message: `[updatePackagePermissions Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong",
      isSuccess: false,
      error: "An internal server error occurred"
    });
  }
};
