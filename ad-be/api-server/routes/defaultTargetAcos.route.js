const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/user.auth");
const {
  saveAcos,
  getAcos,
  saveAcosSB,
  saveAcosCampagin,
} = require("../controllers/defaultTargetAcos.controller");
const validation = require("../validation/defaultTargetAcos.validation");

router.post("/defaultTargetAcos/saveAcos", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.UPDATE }]), validation.saveAcos, saveAcos);
router.post("/defaultTargetAcos/getAcos", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.VIEW_ONLY }, { pageName: SYSTEM_PAGES.SEARCH_TERM_RULE, actionType: PAGE_ACTIONS.VIEW_ONLY }]), getAcos);
router.post("/defaultTargetAcos/saveAcosSBSD", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.UPDATE }]), validation.saveAcosSBSD, saveAcosSB);

router.post("/defaultTargetAcos/saveAcosCampagin", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.UPDATE }]), saveAcosCampagin);

module.exports = router;
