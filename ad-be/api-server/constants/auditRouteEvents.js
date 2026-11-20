// Keys are the Express mount path followed by the registered route pattern.
// Keep reads, routine scheduled imports, and routes with dedicated audit writers out of this table.
const modules = {
  "user": {
    "/createUser": "TEAM_USER_CREATED",
    "/superAdminLoginAsUser": "SUPER_ADMIN_IMPERSONATION",
    "/updateUser": "TEAM_USER_UPDATED",
    "/deleteUser": "TEAM_USER_DELETED",
    "/updateProfileAccess": "PROFILE_ACCESS_UPDATED",
    "/toggleMockMode": "MOCK_MODE_UPDATED",
    "/updateProfile": "USER_PROFILE_UPDATED",
    "/inviteUser": "TEAM_INVITATION_CREATED",
    "/cancelInvitation": "TEAM_INVITATION_CANCELLED",
    "/resendInvitation": "TEAM_INVITATION_RESENT",
    "/acceptInvitation": "TEAM_INVITATION_ACCEPTED",
    "/rejectInvitation": "TEAM_INVITATION_REJECTED",
    "/registortUser": "USER_REGISTERED",
    "/sendOtp": "EMAIL_VERIFICATION_REQUESTED",
    "/verifyOtp": "EMAIL_VERIFICATION_CHECKED",
    "/forgotPassword": "PASSWORD_RESET_REQUESTED",
    "/verifyAndEnable2fa": "TWO_FACTOR_ENABLED",
    "/disable2fa": "TWO_FACTOR_DISABLED",
    "/saveTrialSubscription": "TRIAL_SUBSCRIPTION_CREATED",
    "/createSubscription": "SUBSCRIPTION_CHECKOUT_CREATED",
    "/cancelSubscription": "SUBSCRIPTION_CANCELLED",
    "/stripeWebhook": "BILLING_WEBHOOK_PROCESSED",
    "/verifyPaymentSession": "PAYMENT_SESSION_VERIFIED",
  },
  "customer": {
    "/send2faEmailOtp": "TWO_FACTOR_EMAIL_CHALLENGE_REQUESTED",
    "/createSupportTicket": "SUPPORT_TICKET_CREATED",
    "/sendSupportTicketMessage": "SUPPORT_TICKET_MESSAGE_SENT",
    "/saveFilter": "SAVED_FILTER_UPDATED",
    "/savePageFilter": "PAGE_FILTER_UPDATED",
    "/deleteFilter": "SAVED_FILTER_DELETED",
    "/saveChatSession": "CHAT_SESSION_SAVED",
    "/renameChatSession": "CHAT_SESSION_RENAMED",
    "/deleteChatSession": "CHAT_SESSION_DELETED",
    "/clearChatSessions": "CHAT_SESSIONS_CLEARED",
    "/migrateChatSessions": "CHAT_SESSIONS_MIGRATED",
  },
  "organization": {
    "/create": "ORGANIZATION_CREATED",
    "/update": "ORGANIZATION_UPDATED",
    "/select": "ORGANIZATION_SELECTED",
    "/superAdmin/update": "ORGANIZATION_PLAN_UPDATED",
  },
  "role": {
    "/createRole": "ROLE_CREATED",
    "/updateRole": "ROLE_UPDATED",
    "/deleteRole": "ROLE_DELETED",
    "/updatePermission": "ROLE_PERMISSIONS_UPDATED",
  },
  "permission": {
    "/updateCustomerPermission": "CUSTOMER_PERMISSION_UPDATED",
    "/updateCustomerPermissions": "CUSTOMER_PERMISSIONS_UPDATED",
  },
  "pages": {
    "/create": "ACCESS_PAGE_CREATED",
    "/update": "ACCESS_PAGE_UPDATED",
    "/remove": "ACCESS_PAGE_REMOVED",
    "/statusChange": "ACCESS_PAGE_STATUS_CHANGED",
  },
  "packages": {
    "/create": "PLAN_CREATED",
    "/update": "PLAN_UPDATED",
    "/delete": "PLAN_DELETED",
    "/changeStatus": "PLAN_STATUS_CHANGED",
    "/updatePackagePermissions": "PLAN_PERMISSIONS_UPDATED",
  },
  "pricing-regions": {
    "/create": "PRICING_REGION_CREATED",
    "/update": "PRICING_REGION_UPDATED",
    "/changeStatus": "PRICING_REGION_STATUS_CHANGED",
    "/delete": "PRICING_REGION_DELETED",
    "/plan-prices/update": "REGIONAL_PLAN_PRICES_UPDATED",
    "/organizations/update": "ORGANIZATION_BILLING_UPDATED",
  },
  "google": { "/disconnect": "GOOGLE_ACCOUNT_DISCONNECTED" },
  "amazon": {
    "/updateCampaignStatus": "CAMPAIGN_STATUS_UPDATED",
    "/addCampaigns": "CAMPAIGNS_ADDED",
    "/createSBCampaigns": "SPONSORED_BRANDS_CAMPAIGN_CREATED",
    "/savePLHistory": "CAMPAIGN_PROFIT_HISTORY_SAVED",
    "/removePLHistory": "CAMPAIGN_PROFIT_HISTORY_REMOVED",
  },
  "targeting": {
    "/createKeywords": "TARGETING_KEYWORDS_CREATED",
    "/adjustBid": "TARGETING_BID_UPDATED",
    "/changeStatus": "TARGETING_STATUS_UPDATED",
    "/manualRunTargetingRule/:ruleId": "TARGETING_RULE_RUN_REQUESTED",
    "/ruleReverted": "TARGETING_RULE_REVERTED",
    "/importTargetingRule": "TARGETING_RULE_IMPORTED",
  },
  "placement": {
    "/updatePlacementBid": "PLACEMENT_BID_UPDATED",
    "/saveInDB": "PLACEMENT_BID_SAVED",
    "/applyInAmazon": "PLACEMENT_BID_APPLIED",
    "/manualRunPlacementRule/:ruleId": "PLACEMENT_RULE_RUN_REQUESTED",
    "/ruleReverted": "PLACEMENT_RULE_REVERTED",
    "/importBidPlacementRule": "PLACEMENT_RULE_IMPORTED",
  },
  "budgetRule": {
    "/manualRun/:ruleId": "BUDGET_RULE_RUN_REQUESTED",
    "/ruleReverted": "BUDGET_RULE_REVERTED",
    "/importBudgetRule": "BUDGET_RULE_IMPORTED",
  },
  "search-term": {
    "/manualRunSearchTermRule/": "SEARCH_TERM_RULE_RUN_REQUESTED",
    "/importSearchTermRule": "SEARCH_TERM_RULE_IMPORTED",
  },
  "dayparting-stretegy": { "/importDaypartingRule": "DAYPARTING_RULE_IMPORTED" },
  "recommendation": {
    "/tags/create": "RECOMMENDATION_TAG_CREATED",
    "/tags/rename": "RECOMMENDATION_TAG_RENAMED",
    "/tags/delete": "RECOMMENDATION_TAG_DELETED",
    "/importRecommandationRule": "RECOMMENDATION_RULE_IMPORTED",
    "/runRecommendationSnapshot": "RECOMMENDATION_SNAPSHOT_REQUESTED",
    "/applyRuleRecommendation/:ruleId": "RECOMMENDATION_APPLY_RESULT",
    "/deleteRecommendation/:ruleId": "RECOMMENDATION_DISMISS_RESULT",
  },
  "product": {
    "/saveProductAdsData": "PRODUCT_AD_SETTINGS_UPDATED",
    "/bulkUpdateProductAds": "PRODUCT_ADS_BULK_UPDATED",
  },
  "seller/order": { "/applyListingOptimization": "LISTING_OPTIMIZATION_APPLIED" },
  "aplusContent": {
    "/create": "APLUS_DRAFT_CREATED",
    "/edit": "APLUS_DRAFT_UPDATED",
    "/submitForApproval": "APLUS_APPROVAL_SUBMITTED",
  },
  "seller/inventory": {
    "/save-aging-config": "INVENTORY_AGING_SETTINGS_UPDATED",
    "/delete-ASIN-inventory-settings": "ASIN_INVENTORY_OVERRIDE_REMOVED",
    "/save-warehouse-planning": "WAREHOUSE_PLANNING_UPDATED",
  },
  "seller/warehouse": {
    "/save-warehouse-location": "WAREHOUSE_LOCATION_UPDATED",
    "/sync-fc-storage-fees": "WAREHOUSE_STORAGE_FEE_SYNC_REQUESTED",
  },
  "cronJob": {
    "/changeStatus": "GLOBAL_CRON_STATUS_CHANGED",
    "/SyncPastData": "HISTORICAL_BACKFILL_REQUESTED",
    "/manuallyRunCronJob": "MANUAL_CRON_REQUESTED",
    "/createMasterCronJob": "MASTER_CRON_CREATED",
    "/updateMasterCronJob": "MASTER_CRON_UPDATED",
  },
  "superAdmin": { "/system-diagnostic/drain-staged": "STAGED_QUEUE_DRAIN_REQUESTED" },
  "rule-blocked-time": {
    "/createRuleBlockedTime": "RULE_BLOCKED_TIME_CREATED",
    "/updateRuleBlockedTime": "RULE_BLOCKED_TIME_UPDATED",
    "/deleteRuleBlockedTime": "RULE_BLOCKED_TIME_DELETED",
  },
  "holiday": {
    "/create": "HOLIDAY_CREATED",
    "/update": "HOLIDAY_UPDATED",
    "/delete": "HOLIDAY_DELETED",
    "/saveSpecialDaysReminder": "SPECIAL_DAY_REMINDER_UPDATED",
  },
  "retention": {
    "/createRetention": "RETENTION_RULE_CREATED", "/create": "RETENTION_RULE_CREATED",
    "/updateRetention": "RETENTION_RULE_UPDATED", "/update": "RETENTION_RULE_UPDATED",
    "/deleteRetention": "RETENTION_RULE_DELETED", "/delete": "RETENTION_RULE_DELETED",
    "/changeStatusRetention": "RETENTION_RULE_STATUS_CHANGED", "/changeStatus": "RETENTION_RULE_STATUS_CHANGED",
  },
  "health-score": {
    "/createHealthScoreSetting": "HEALTH_SCORE_SETTING_CREATED",
    "/updateHealthScoreSetting": "HEALTH_SCORE_SETTING_UPDATED",
    "/deleteHealthScoreSetting": "HEALTH_SCORE_SETTING_DELETED",
  },
  "performance-score": {
    "/createPerformanceScoreSetting": "PERFORMANCE_SCORE_SETTING_CREATED",
    "/updatePerformanceScoreSetting": "PERFORMANCE_SCORE_SETTING_UPDATED",
    "/deletePerformanceScoreSetting": "PERFORMANCE_SCORE_SETTING_DELETED",
  },
  "products": { "/history-settings": "COMPETITOR_HISTORY_SETTINGS_UPDATED" },
  "support": { "/closeSupportTicket": "SUPPORT_TICKET_CLOSED" },
  "asana": { "/assignSupportUser": "SUPPORT_ASSIGNMENT_UPDATED", "/addWebhook": "ASANA_WEBHOOK_CONFIGURATION_UPDATED" },
  "columns": { "/updateColumns": "TABLE_COLUMNS_UPDATED", "/updateChartSettings": "CHART_SETTINGS_UPDATED" },
  "chart-settings": { "/updateChartSettings": "CHART_SETTINGS_UPDATED" },
};

const eventsByPath = new Map(Object.entries(modules).flatMap(([module, routes]) =>
  Object.entries(routes).map(([route, event]) => [`/api/${module}${route}`, event])
));

const explicitEvents = [
  "ACCOUNT_DATA_CLEANUP", "ADS_PROFILES_SAVED", "HISTORICAL_SYNC_ACCEPTED",
  "HISTORICAL_SYNC_COMPLETED", "HISTORICAL_SYNC_FAILED", "PROFILE_SYNC_SETTINGS_SUBMIT",
  "PROFILE_SYNC_SETTINGS_TOGGLE", "SELLER_CONFIG_CONNECT_FAILED", "SELLER_CREDENTIAL_REFRESH",
  "SEARCH_TERM_ADD_AS_NEGATIVE_PRODUCT", "APLUS_APPROVAL_STATUS_CHANGED",
];

const events = [...new Set([...eventsByPath.values(), ...explicitEvents])];
const getMutationPaths = new Set(["/api/asana/addWebhook", "/api/google/disconnect", "/api/product/bulkUpdateProductAds"]);

function eventForRoute(method, path) {
  if (method === "HEAD" || method === "OPTIONS" || (method === "GET" && !getMutationPaths.has(path))) return undefined;
  return eventsByPath.get(path);
}

module.exports = { events, eventForRoute };
