const { test, describe } = require("node:test");
const assert = require("node:assert");
const { checkRuleAudit } = require("../../monitoring/checks/ruleAudit");

describe("Health Check: Rule & History Audit", () => {
  const baseNow = new Date("2026-11-03T10:00:00.000Z");

  test("Healthy case: zero stuck rules, no overdue rules, complete history audit", async () => {
    const mockDb = {
      budgetrules: {
        find: () => ({ toArray: async () => [] }),
      },
      targetingrules: {
        find: () => ({ toArray: async () => [] }),
      },
      placementrules: {
        find: () => ({ toArray: async () => [] }),
      },
      recomandationrules: {
        find: () => ({ toArray: async () => [] }),
      },
      rulerunhistories: {
        findOne: async () => ({ _id: "hist-1" }),
      },
    };

    const res = await checkRuleAudit({ db: mockDb, now: baseNow });
    assert.strictEqual(res.name, "rule_audit");
    assert.strictEqual(res.status, "OK");
    assert.strictEqual(res.details.stuckRules.length, 0);
    assert.strictEqual(res.details.overdueRules.length, 0);
  });

  test("Stuck rule warning: rule running for 20 minutes (> 15m threshold) returns WARN", async () => {
    const mockDb = {
      budgetrules: {
        find: (query) => {
          if (query.isRunning) {
            return {
              toArray: async () => [
                {
                  _id: "rule-budget-101",
                  profileId: 101,
                  isRunning: true,
                  lastStartedAt: new Date("2026-11-03T09:40:00.000Z"), // 20 mins ago
                },
              ],
            };
          }
          return { toArray: async () => [] };
        },
      },
    };

    const res = await checkRuleAudit({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.strictEqual(res.details.stuckRules.length, 1);
    assert.strictEqual(res.details.stuckRules[0].severity, "WARN");
    assert.ok(res.summary.includes("has been running for 20.0m"));
  });

  test("Stuck rule critical: rule running for 45 minutes (> 30m threshold) returns CRITICAL", async () => {
    const mockDb = {
      targetingrules: {
        find: (query) => {
          if (query.isRunning) {
            return {
              toArray: async () => [
                {
                  _id: "rule-targeting-202",
                  profileId: 202,
                  isRunning: true,
                  lastStartedAt: new Date("2026-11-03T09:15:00.000Z"), // 45 mins ago
                },
              ],
            };
          }
          return { toArray: async () => [] };
        },
      },
    };

    const res = await checkRuleAudit({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.strictEqual(res.details.stuckRules.length, 1);
    assert.strictEqual(res.details.stuckRules[0].severity, "CRITICAL");
    assert.ok(res.summary.includes("is STUCK running for 45.0m"));
  });

  test("Overdue rule: rule scheduled 2 hours ago that did not run returns WARN", async () => {
    const mockDb = {
      placementrules: {
        find: (query) => {
          if (query.nextRunTime) {
            return {
              toArray: async () => [
                {
                  _id: "rule-placement-303",
                  profileId: 303,
                  status: "ACTIVE",
                  isRunning: false,
                  nextRunTime: new Date("2026-11-03T08:00:00.000Z"), // 2 hours ago
                },
              ],
            };
          }
          return { toArray: async () => [] };
        },
      },
    };

    const res = await checkRuleAudit({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.strictEqual(res.details.overdueRules.length, 1);
    assert.ok(res.summary.includes("is overdue for execution by 2.0h"));
  });

  test("Missing audit history: executed rule without rulerunhistories returns WARN", async () => {
    const mockDb = {
      budgetrules: {
        find: (query) => {
          if (query.lastExecutedAt) {
            return {
              toArray: async () => [
                {
                  _id: "rule-budget-404",
                  profileId: 404,
                  isRunning: false,
                  lastExecutedAt: new Date("2026-11-03T09:30:00.000Z"),
                },
              ],
            };
          }
          return { toArray: async () => [] };
        },
      },
      rulerunhistories: {
        findOne: async () => null, // No history record found!
      },
    };

    const res = await checkRuleAudit({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.strictEqual(res.details.unloggedRules.length, 1);
    assert.ok(res.summary.includes("has NO audit history log"));
  });

  test("Missing DB connection returns CRITICAL safely", async () => {
    const res = await checkRuleAudit({ db: null, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.ok(res.summary.includes("Database connection not provided"));
  });
});
