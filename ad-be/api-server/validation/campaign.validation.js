const Joi = require("joi").extend(require("@joi/date"));

const createCampaign = async (req, res, next) => {
  const type = req.body.type;
  let schema;
  if (type == "Sponsored Products") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      type: Joi.string().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      targetingType: Joi.string().valid("MANUAL", "AUTO").required(),
      adGroupId: Joi.when("targetingType", {
        is: "MANUAL",
        then: Joi.required(),
      }),
      keywordIds: Joi.when("targetingType", {
        is: "MANUAL",
        then: Joi.required(),
      }),
      negativeKeywords: Joi.when("targetingType", {
        is: "MANUAL",
        then: Joi.optional(),
      }),
      asins: Joi.when("targetingType", {
        is: "MANUAL",
        then: Joi.required(),
      }),
      status: Joi.string().valid("ENABLED", "PAUSED").required(),
      budget: Joi.number().min(1).required(),
      startDate: Joi.date().format("YYYY-MM-DD").required(),
      endDate: Joi.date()
        .format("YYYY-MM-DD")
        .optional()
        .allow("")
        .when("startDate", {
          is: Joi.date().required(),
          then: Joi.date().min(Joi.ref("startDate")).optional(),
          otherwise: Joi.allow("").optional(),
        })
        .error(
          new Error("End date must be greater than or equal to start date!")
        ),
    });
  } else if (type == "Sponsored Brands") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      type: Joi.string().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      budgetType: Joi.string().valid("LIFETIME", "DAILY").required(),
      status: Joi.string().valid("ENABLED", "PAUSED").required(),
      budget: Joi.number().min(1).required(),
      startDate: Joi.date().format("YYYY-MM-DD").required(),
      endDate: Joi.when("budgetType", {
        is: "LIFETIME",
        then: Joi.date().min(Joi.ref("startDate")).required(),
        otherwise: Joi.date().allow("").min(Joi.ref("startDate")),
      }).error(
        new Error("End date must be greater than or equal to start date!")
      ),
    });
  } else if (type == "Sponsored Display") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      type: Joi.string().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      budget: Joi.number().min(1).required(),
      status: Joi.string().valid("ENABLED", "PAUSED", "ARCHIVED").required(),
      startDate: Joi.date().format("YYYY-MM-DD").required(),
      endDate: Joi.date()
        .format("YYYY-MM-DD")
        .min(Joi.ref("startDate"))
        .optional()
        .allow("")
        .error(
          new Error("End date must be greater than or equal to start dat!")
        ),
      costType: Joi.string().valid("cpc", "vcpm").required(),
    });
  } else {
    return res.status(203).send({
      isSuccess: false,
      message: "Type is required!",
    });
  }
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({
      isSuccess: false,
      message: "An internal server error occurred",
    });
  } else {
    next();
  }
};

const updateCampaigns = async (req, res, next) => {
  const type = req.body.type;
  let schema;
  if (type == "Sponsored Products") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      type: Joi.string().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      targetingType: Joi.string().valid("MANUAL", "AUTO").required(),
      budget: Joi.number().min(1).required(),
      startDate: Joi.date().format("YYYY-MM-DD").required(),
      status: Joi.string().valid("ENABLED", "PAUSED").required(),
      endDate: Joi.date()
        .format("YYYY-MM-DD")
        .optional()
        .allow("")
        .when("startDate", {
          is: Joi.date().required(),
          then: Joi.date().min(Joi.ref("startDate")).optional(),
          otherwise: Joi.optional(),
        })
        .error(
          new Error("End date must be greater than or equal to start date!")
        ),
    });
  } else if (type == "Sponsored Brands") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      type: Joi.string().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      budgetType: Joi.string().valid("LIFETIME", "DAILY").required(),
      budget: Joi.number().min(1).required(),
      startDate: Joi.date().format("YYYY-MM-DD").required(),
      status: Joi.string().valid("ENABLED", "PAUSED").required(),
      endDate: Joi.when("budgetType", {
        is: "LIFETIME",
        then: Joi.date().min(Joi.ref("startDate")).required(),
        otherwise: Joi.date().allow("").min(Joi.ref("startDate")),
      }).error(
        new Error("End date must be greater than or equal to start date!")
      ),
    });
  } else if (type == "Sponsored Display") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      type: Joi.string().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      budget: Joi.number().min(1).required(),
      startDate: Joi.date().format("YYYY-MM-DD").required(),
      status: Joi.string().valid("ENABLED", "PAUSED", "ARCHIVED").required(),
      endDate: Joi.date()
        .format("YYYY-MM-DD")
        .min(Joi.ref("startDate"))
        .optional()
        .allow("")
        .error(
          new Error("End date must be greater than or equal to start date!")
        ),
      costType: Joi.string().valid("cpc", "vcpm").required(),
    });
  } else {
    return res.status(203).send({
      isSuccess: false,
      message: "Type is required!",
    });
  }
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({
      isSuccess: false,
      message: "An internal server error occurred",
    });
  } else {
    next();
  }
};

module.exports = {
  createCampaign,
  updateCampaigns,
};
