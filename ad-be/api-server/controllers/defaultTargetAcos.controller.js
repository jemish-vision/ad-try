const { write_logs } = require("../../winston/utility/logger");
const { logAudit } = require("../helpers/auditHelper");
const campaignSettingSchema = require("../models/camapignSetting.model");
const campaignBidThresholdSchema = require("../models/campaignBidThreshold.model");
const defaultTargetAcosSchema = require("../models/defaultTargetAcos.model");
const targetAcosSBSDSchema = require("../models/targetAcosSB-SD.model");

exports.saveAcos = async (req, res) => {
  const configId = req?.config?.configId;
  const { profileId, type, TOStargetAcos, PPtargetAcos, ROStargetAcos } =
    req.body;
  try {
    await defaultTargetAcosSchema
      .findOneAndUpdate(
        { configId, type },
        {
          configId,
          profileId,
          type,
          TOStargetAcos,
          PPtargetAcos,
          ROStargetAcos,
          dynamicTOSTarget: req?.body?.dynamicTOSTarget,
          dynamicTOStargetAcos: req?.body?.dynamicTOStargetAcos,
          dynamicPPTarget: req?.body?.dynamicPPTarget,
          dynamicPPtargetAcos: req?.body?.dynamicPPtargetAcos,
          dynamicROSTarget: req?.body?.dynamicROSTarget,
          dynamicROStargetAcos: req?.body?.dynamicROStargetAcos
        },
        {
          new: true,
          upsert: true,
        }
      )
      .then((data) => {
        return res.status(200).send({
          isSuccess: true,
          message: "Data updated successfully",
          data,
        });
      })
      .catch((error) => {
          write_logs({ message: `[saveAcos Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res
          .status(203)
          .send({ message: "An internal server error occurred", error, isSuccess: false });
      });
  } catch (error) {
      write_logs({ message: `[saveAcos Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res
      .status(203)
      .send({ message: "An internal server error occurred", error, isSuccess: false });
  }
};

exports.getAcos = async (req, res) => {
  const configId = req?.config?.configId;
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(203).send({
      isSuccess: false,
      message: "ProfileId required!",
    });
  }
  try {

    const getAcosData = await defaultTargetAcosSchema.find({ configId, profileId }).lean().sort({ createdAt: 1 });
    if (!getAcosData) {
      return res.status(203).send({
        isSuccess: false,
        message: "SP acos data not found!",
      });
    }
    const getAcosDataSB = await targetAcosSBSDSchema.find({ configId, profileId, campaignType: "Sponsored Brands" }).lean().sort({ createdAt: 1 });;
    if (!getAcosDataSB) {
      return res.status(203).send({
        isSuccess: false,
        message: "SB acos data not found!",
      });
    }
    const getAcosDataSD = await targetAcosSBSDSchema.find({ configId, profileId, campaignType: "Sponsored Display" }).lean();
    if (!getAcosDataSD) {
      return res.status(203).send({
        isSuccess: false,
        message: "SD acos data not found!",
      });
    }

    const campaignSetting = await campaignSettingSchema.findOne({ configId, profileId }, { targetAcos: 1, bidLimitTargetACOS: 1, productEligibilityThreshold: 1 }).lean();

    return res.status(200).send({
      isSuccess: true,
      message: "Data get successfully",
      spData: getAcosData,
      sbData: getAcosDataSB,
      sdData: getAcosDataSD,
      campaignSetting
    });
  } catch (error) {
      write_logs({ message: `[getAcos Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res
      .status(203)
      .send({ message: "An internal server error occurred", error, isSuccess: false });
  }
};

exports.saveAcosSB = async (req, res) => {
  const configId = req?.config?.configId;
  const { profileId, type, targetAcos, campaignType } = req.body;
  try {
    if (campaignType == "Sponsored Brands") {
      await targetAcosSBSDSchema
        .findOneAndUpdate(
          { configId, type, campaignType },
          {
            configId,
            profileId,
            type,
            targetAcos,
            dynamicTarget: req?.body?.dynamicTarget,
            dynamicTargetAcos: req?.body?.dynamicTargetAcos,
            campaignType,
          },
          {
            new: true,
            upsert: true,
          }
        )
        .then(async (data) => {
          return res.status(200).send({
            isSuccess: true,
            message: "Data updated successfully",
            data,
          });
        })
        .catch((error) => {
            write_logs({ message: `[saveAcosSB Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
          return res
            .status(203)
            .send({ message: "An internal server error occurred", error, isSuccess: false });
        });
    } else if (campaignType == "Sponsored Display") {
      await targetAcosSBSDSchema
        .findOneAndUpdate(
          { configId, type, campaignType },
          {
            configId,
            profileId,
            type,
            targetAcos,
            campaignType,
            dynamicTarget: req?.body?.dynamicTarget,
            dynamicTargetAcos: req?.body?.dynamicTargetAcos,
          },
          {
            new: true,
            upsert: true,
          }
        )
        .then(async (data) => {
          return res.status(200).send({
            isSuccess: true,
            message: "Data updated successfully",
            data,
          });
        })
        .catch((error) => {
            write_logs({ message: `[saveAcosSB Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
          return res
            .status(203)
            .send({ message: "An internal server error occurred", error, isSuccess: false });
        });
    }
  } catch (error) {
      write_logs({ message: `[saveAcosSB Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res
      .status(203)
      .send({ message: "An internal server error occurred", error, isSuccess: false });
  }
};

exports.saveAcosCampagin = async (req, res) => {
  const configId = req?.config?.configId;
  let { profileId, targetAcos, bidLimitTargetACOS, productEligibilityThreshold } = req.body;

  try {
    // Normalize values ONCE
    targetAcos = Number(targetAcos);

    const existingSetting = await campaignSettingSchema.findOne({ configId, profileId }).lean();

    // Update main setting first
    await campaignSettingSchema.findOneAndUpdate(
      { configId, profileId },
      { targetAcos, bidLimitTargetACOS, productEligibilityThreshold },
      { upsert: true, new: true }
    ).lean();

    // Update thresholds ONLY if targetAcos changed
    if (existingSetting && existingSetting.targetAcos !== targetAcos) {
      await campaignBidThresholdSchema.updateMany(
        { configId, profileId },
        { $set: { targetACOS: targetAcos } }
      );
    }

    await logAudit("CAMPAIGN_PRODUCT_ELIGIBILITY_THRESHOLD", `Campaign product eligibility threshold updated successfully.`, { targetAcos, bidLimitTargetACOS, productEligibilityThreshold }, req?.user?.id);

    return res.status(200).send({
      isSuccess: true,
      message: "Data updated successfully",
    });

  } catch (error) {
      write_logs({ message: `[saveAcosCampagin Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "An internal server error occurred",
      error,
    });
  }
};