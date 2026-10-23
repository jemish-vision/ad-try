const Joi = require("joi");

const productAds = async (req, res, next) => {
  const { type, adtype } = req.body;
  let schema;
  if (type == "Sponsored Products") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      asins: Joi.string().optional(),
      sku: Joi.string().optional(),
      state: Joi.string().valid("ENABLED", "PAUSED").required(),
      campaign: Joi.number().required(),
      adGroupId: Joi.number().unsafe().required(),
      type: Joi.string().required(),
    });
  } else if (type == "Sponsored Display") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      sku: Joi.string().required().trim().messages({
        "string.empty": "Sku should not be empty!",
      }),
      state: Joi.string().valid("ENABLED", "PAUSED", "ARCHIVED").required(),
      campaign: Joi.number().required(),
      adGroupId: Joi.number().unsafe().required(),
      type: Joi.string().required(),
    });
  } else if (type == "Sponsored Brands" && adtype == "Product Collection") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      pageType: Joi.string().required().trim().messages({
        "string.empty": "Page type should not be empty!",
      }),
      url: Joi.string().required().trim().messages({
        "string.empty": "Url should not be empty!",
      }),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      asins: Joi.array().min(1).max(3).required(),
      brandName: Joi.string().required().trim().messages({
        "string.empty": "Brand name should not be empty!",
      }),
      customImageAssetId: Joi.string().optional().trim(),
      brandLogoAssetID: Joi.string().required().trim().messages({
        "string.empty": "Brand  logo  asset should not be empty!",
      }),
      headline: Joi.string().required().trim().messages({
        "string.empty": "Headline should not be empty!",
      }),
      state: Joi.string().valid("ENABLED", "PAUSED").required(),
      adGroupId: Joi.number().unsafe().required(),
      type: Joi.string().required(),
      adtype: Joi.string().required(),
    });
  } else if (type == "Sponsored Brands" && adtype == "Video") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      asins: Joi.array().min(1).max(1).required(),
      state: Joi.string().valid("ENABLED", "PAUSED").required(),
      adGroupId: Joi.number().unsafe().required(),
      type: Joi.string().required(),
      adtype: Joi.string().required(),
      videoAssetIds: Joi.string().required().trim().messages({
        "string.empty": "Video asset should not be empty!",
      }),
    });
  } else {
    return res.status(203).send({
      isSuccess: false,
      message: "Type and AdType required.",
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
  productAds,
};
