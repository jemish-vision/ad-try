const Joi = require("joi");

const saveAcos = async (req, res, next) => {
  const Schema = Joi.object({
    profileId: Joi.number().required(),
    type: Joi.string().required().error(new Error("Type required.")),
    _id: Joi.string().optional().error(new Error("Id required.")),
    TOStargetAcos: Joi.number()
      .required()
      .error(new Error("Top of search acos is required.")),
    PPtargetAcos: Joi.number()
      .required()
      .error(new Error("Product pages acos is required.")),
    ROStargetAcos: Joi.number()
      .required()
      .error(new Error("Rest of search acos is required.")),
    dynamicTOSTarget: Joi.boolean().optional(),
    dynamicPPTarget: Joi.boolean().optional(),
    dynamicROSTarget: Joi.boolean().optional(),
    dynamicTOStargetAcos: Joi.array().optional(),
    dynamicPPtargetAcos: Joi.array().optional(),
    dynamicROStargetAcos: Joi.array().optional(),
  });
  const { error } = Schema.validate(req.body);
  if (error) {
    return res.status(203).send({
      isSuccess: false,
      message: "An internal server error occurred",
    });
  } else {
    next();
  }
};

const saveAcosSBSD = async (req, res, next) => {
  const Schema = Joi.object({
    profileId: Joi.number().required(),
    type: Joi.string().required().error(new Error("Type required.")),
    campaignType: Joi.string()
      .valid("Sponsored Brands", "Sponsored Display")
      .required(),
    _id: Joi.string().optional().error(new Error("Id required.")),
    targetAcos: Joi.number()
      .required()
      .error(new Error("Target acos is required.")),
    dynamicTarget: Joi.boolean().optional(),
    dynamicTargetAcos: Joi.array().optional(),
  });
  const { error } = Schema.validate(req.body);
  if (error) {
    return res.status(203).send({
      isSuccess: false,
      message: "An internal server error occurred",
    });
  } else {
    next();
  }
};

const saveAcosCpcToDB = async (req, res, next) => {
  const Schema = Joi.object({
    campaignType: Joi.string()
      .valid("Sponsored Brands", "Sponsored Display")
      .required(),
    targetData: Joi.array()
      .min(1)
      .items(
        Joi.object({
          targetId: Joi.string()
            .required()
            .error(new Error("Target id required.")),
          targetAcos: Joi.number()
            .required()
            .error(new Error("Target acos is required.")),
          tagetCPCAmazon: Joi.number()
            .required()
            .error(new Error("Target Cpc in amazon is required.")),
        })
      )
      .required(),
    profileId: Joi.string().required(),
  });
  const { error } = Schema.validate(req.body);
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
  saveAcos,
  saveAcosSBSD,
  saveAcosCpcToDB,
};
