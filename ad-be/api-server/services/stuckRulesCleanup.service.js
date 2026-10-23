const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const budgetRulesSchema = require("../models/budgetRules.model");
const placementRulesSchema = require("../models/placementRules.model");
const recomandationRulesSchema = require("../models/recomandationRules.model");
const { cron_logs } = require("../../winston/cronAutomation/logger");

exports.cronUnlockStuckRules = async () => {
    try {
        const timeout = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
        const query = { isRunning: true, lastStartedAt: { $lt: timeout } };
        const update = { $set: { isRunning: false } };

        const [targetingRes, budgetRes, placementRes, recomRes] = await Promise.all([
            targetingRuleSchema.updateMany(query, update),
            budgetRulesSchema.updateMany(query, update),
            placementRulesSchema.updateMany(query, update),
            recomandationRulesSchema.updateMany(query, update)
        ]);

        const totalUnlocked = targetingRes.modifiedCount + budgetRes.modifiedCount + placementRes.modifiedCount + recomRes.modifiedCount;
        
        if (totalUnlocked > 0) {
            cron_logs({
                message: `Janitor unlocked ${totalUnlocked} stuck rules (Targeting: ${targetingRes.modifiedCount}, Budget: ${budgetRes.modifiedCount}, Placement: ${placementRes.modifiedCount}, Recommendation: ${recomRes.modifiedCount})`,
                log_type: "warn"
            });
        }
    } catch (error) {
        cron_logs({
            message: `Error unlocking stuck rules: ${error.message}`,
            log_type: "error"
        });
    }
};
