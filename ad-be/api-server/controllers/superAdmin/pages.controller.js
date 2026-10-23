const { write_logs } = require("../../../winston/utility/logger");
const pagesSchema = require("../../models/superAdmin/pages.model");
const pageActionSchema = require("../../models/superAdmin/pageAction.model");
const permissionSchema = require("../../models/superAdmin/permission.model");


exports.getAllPage = async (req, res) => {
  try {
    let {
      pageNo = 1,
      perPage = 10,
      search,
      sortType = 1,
      fieldName = "order"
    } = req.body;

    pageNo = Number(pageNo);
    perPage = Number(perPage);

    const filter = { pageName: { $ne: "Pages" } };

    if (search) {
      filter.$or = [
        { pageName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
        { pageSlug: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
        { displayName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }
      ];
    }

    const totalRecords = await pagesSchema.countDocuments(filter);

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "pageactions",
          localField: "_id",
          foreignField: "pageId",
          as: "actions"
        }
      },
      {
        $project: {
          pageName: 1,
          pageSlug: 1,
          displayName: 1,
          order: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          actions: {
            $map: {
              input: "$actions",
              as: "action",
              in: { _id: "$$action._id", actionType: "$$action.actionType" }
            }
          }
        }
      },
      { $sort: { [fieldName]: Number(sortType) } },
      { $skip: (pageNo - 1) * perPage },
      { $limit: perPage }
    ];
    const data = await pagesSchema.aggregate(pipeline);

    return res.status(200).send({
      isSuccess: true,
      data,
      currentPageNo: pageNo,
      totalRecords,
      totalPages: Math.ceil(totalRecords / perPage)
    });

  } catch (error) {
      write_logs({ message: `[getAllPage Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "An internal server error occurred"
    });
  }
};

exports.createPage = async (req, res) => {
  try {
    const { pageSlug, pageName, displayName, order = 0 } = req.body;

    if (!pageSlug || !pageName || !displayName) {
      return res.status(203).json({ isSuccess: false, message: "Page Slug, Name and Display Name are required" });
    }

    const existingPage = await pagesSchema.findOne({ $or: [{ pageName: pageName.trim() }, { pageSlug: pageSlug.trim() }] });
    if (existingPage) return res.status(203).json({ isSuccess: false, message: "Page already exists" });

    const page = await pagesSchema.create({ pageSlug: pageSlug.trim(), pageName: pageName.trim(), displayName: displayName.trim(), order: Number(order) || 0, isActive: true });

    const defaultActions = ["View Only", "Create", "Update", "Remove"];
    const actionsPayload = defaultActions.map((actionType) => ({
      pageId: page._id,
      actionType,
    }));
    const actions = await pageActionSchema.insertMany(actionsPayload);

    const responseData = {
      ...page.toObject(),
      actions: actions.map((action) => ({
        _id: action._id,
        actionType: action.actionType,
      })),
    };

    return res.status(200).json({
      isSuccess: true,
      message: "Page created successfully",
      data: responseData
    });
  } catch (error) {
      write_logs({ message: `[createPage Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "An internal server error occurred"
    });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const { _id, id, pageId, pageSlug, pageName, displayName, order } = req.body;
    const targetId = _id || id || pageId;
    if (!targetId) return res.status(203).json({ isSuccess: false, message: "Page document ID is required" });

    const page = await pagesSchema.findById(targetId);
    if (!page) return res.status(404).json({ isSuccess: false, message: "Page not found" });

    const existingPage = await pagesSchema.findOne({ _id: { $ne: targetId }, $or: [{ pageName: pageName.trim() }, { pageSlug: pageSlug.trim() }] });
    if (existingPage) return res.status(203).json({ isSuccess: false, message: "Page with this Name or Slug already exists" });

    await pagesSchema.updateOne({ _id: targetId }, { $set: { pageSlug: pageSlug.trim(), pageName: pageName.trim(), displayName: displayName.trim(), ...(order !== undefined && { order: Number(order) || 0 }) } });

    return res.status(200).json({
      isSuccess: true,
      message: "Page updated successfully"
    });
  } catch (error) {
      write_logs({ message: `[updatePage Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "An internal server error occurred"
    });
  }
};

exports.removePage = async (req, res) => {
  try {
    const { _id, id, pageId } = req.body;
    const targetId = _id || id || pageId;

    const page = await pagesSchema.findById(targetId);
    if (!page) return res.status(404).json({ isSuccess: false, message: "Page not found" });

    await pagesSchema.deleteOne({ _id: targetId });

    await pageActionSchema.deleteMany({ pageId: targetId });

    return res.status(200).json({
      isSuccess: true,
      message: "Page deleted successfully"
    });
  } catch (error) {
      write_logs({ message: `[removePage Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "An internal server error occurred"
    });
  }
};

exports.statusChangePage = async (req, res) => {
  try {
    const { _id, id, pageId } = req.body;
    const targetId = _id || id || pageId;
    const page = await pagesSchema.findById(targetId);
    if (!page) return res.status(404).json({ isSuccess: false, message: "Page not found" });

    page.isActive = !page.isActive;
    await page.save();

    return res.status(200).json({
      isSuccess: true,
      message: "Status updated successfully",
      data: page
    });
  } catch (error) {
      write_logs({ message: `[statusChangePage Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "An internal server error occurred"
    });
  }
};

exports.deletePage = async (req, res) => {
  const pageId = req.params.pageId;
  try {
    await pagesSchema
      .findByIdAndDelete(pageId)
      .then((page) => {
        if (!page)
          return res
            .status(203)
            .send({ message: "Page not found!", isSuccess: false });
        return res
          .status(200)
          .send({ message: "Page deleted successfully.", isSuccess: true });
      })
      .catch((error) => {
          write_logs({ message: `[deletePage Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[deletePage Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.listAllPageWithoutPagination = async (req, res) => {
  try {
    await pagesSchema
      .find()
      .sort({ _id: -1 })
      .then(async (data) => {
        const totalRecords = await pagesSchema.count();
        return res.status(200).send({
          data,
          totalRecords: totalRecords,
          isSuccess: true,
          message: "Page listing successfully.",
        });
      })
      .catch((error) => {
          write_logs({ message: `[listAllPageWithoutPagination Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[listAllPageWithoutPagination Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getPageById = async (req, res) => {
  const { pageId, userId } = req.body;
  try {
    await pageActionSchema
      .find({ pageId })
      .then(async (data) => {
        if (!data) {
          return res.status(203).send({
            isSuccess: false,
            message: "Page action not found.",
          });
        }
        const getUserPermission = await permissionSchema
          .findOne({ userId })
          .populate("pages.pageId", { pageName: 1, pageSlug: 1, displayName: 1, order: 1 })
          .populate("pages.allocatedActions.actionId", { actionType: 1 });
        let permissionData;
        if (getUserPermission) {
          permissionData = {
            pages: getUserPermission.pages.map((page) => ({
              pageId: page.pageId._id,
              pageName: page.pageId.pageName,
              allocatedOn: page.allocatedOn,
              allocatedActions: page.allocatedActions.map((action) => ({
                actionId: action.actionId._id,
                actionType: action.actionId.actionType,
                status: action.status,
              })),
            })),
          };
        } else {
          permissionData = { pages: [] };
        }
        let remainingActions;
        if (permissionData.pages.length > 0) {
          const assignedActions =
            permissionData.pages
              .find((page) => page.pageId == pageId)
              ?.allocatedActions.map((action) => action.actionId) || [];
          remainingActions = data.filter((action) => {
            return !assignedActions.some(
              (assignedAction) =>
                assignedAction.toString() == action._id.toString()
            );
          });
        } else {
          remainingActions = data;
        }
        return res.status(200).send({
          data: remainingActions,
          isSuccess: true,
          message: "Page action get successfully.",
        });
      })
      .catch((error) => {
          write_logs({ message: `[getPageById Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[getPageById Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.listRemainingPages = async (req, res) => {
  try {
    const userId = req.body.userId;
    const getUserPermission = await permissionSchema
      .findOne({ userId })
      .populate("pages.pageId", { pageName: 1, pageSlug: 1, displayName: 1, order: 1 })
      .populate("pages.allocatedActions.actionId", { actionType: 1 });
    let permissionData;
    if (getUserPermission) {
      permissionData = {
        pages: getUserPermission.pages.map((page) => ({
          pageId: page.pageId._id,
          pageName: page.pageId.pageName,
          allocatedOn: page.allocatedOn,
          allocatedActions: page.allocatedActions.map((action) => ({
            actionId: action.actionId._id,
            actionType: action.actionId.actionType,
            status: action.status,
          })),
        })),
      };
    } else {
      permissionData = { pages: [] };
    }
    const data = await pagesSchema.find().sort({ order: 1, createdAt: 1 }).lean();
    if (!data) {
      return res.status(203).send({
        isSuccess: false,
        message: "Page not found.",
      });
    }
    const filteredData = [];
    for (const item of data) {
      const pageActions = permissionData.pages.find(
        (page) => page.pageId.toString() == item._id.toString()
      );
      if (pageActions) {
        const pageActionTypes = await pageActionSchema
          .find({ pageId: item._id })
          .distinct("actionType");
        const hasUnassignedActionTypes = pageActionTypes.some(
          (actionType) =>
            !pageActions.allocatedActions.some(
              (action) => action.actionType == actionType
            )
        );
        if (hasUnassignedActionTypes) {
          filteredData.push(item);
        }
      } else {
        filteredData.push(item);
      }
    }
    return res.status(200).send({
      data: filteredData,
      isSuccess: true,
      message: "Page listing successfully.",
    });
  } catch (error) {
      write_logs({ message: `[listRemainingPages Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};
