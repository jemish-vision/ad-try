const Joi = require("joi");

const adGroup = async (req, res, next) => {
  const type = req.body.type;
  let schema;
  if (type == "Sponsored Products") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      defaultBid: Joi.number().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      state: Joi.string().valid("ENABLED", "PAUSED", "ARCHIVED").required(),
      campaignId: Joi.number().required(),
      type: Joi.string().required(),
    });
  } else if (type == "Sponsored Brands") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      state: Joi.string().valid("ENABLED", "PAUSED", "ARCHIVED").required(),
      campaignId: Joi.number().required(),
      type: Joi.string().required(),
    });
  } else if (type == "Sponsored Display") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      defaultBid: Joi.number().optional(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      state: Joi.string().valid("ENABLED", "PAUSED", "ARCHIVED").required(),
      campaignId: Joi.number().required(),
      creativeType: Joi.string().valid("IMAGE", "VIDEO").optional(),
      bidOptimization: Joi.string()
        .valid("clicks", "conversions", "reach")
        .optional(),
      type: Joi.string().required(),
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
  adGroup,
};
