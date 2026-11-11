const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const mongoose = require("mongoose");

function fixture() {
    const rows = new Map();
    let failOnce = false;
    const keyFor = query => JSON.stringify([String(query.userId), query.pageName]);
    const model = {
        findOne(query) {
            return { lean: async () => rows.get(keyFor(query)) || null };
        },
        findOneAndUpdate(query, update, options = {}) {
            return { lean: async () => {
                const key = keyFor(query);
                if (failOnce) {
                    failOnce = false;
                    rows.set(key, { ...query, ...update.$set, _id: update.$setOnInsert._id });
                    throw Object.assign(new Error("Concurrent insert won"), { code: 11000 });
                }
                let row = rows.get(key);
                if (!row && options.upsert) row = { ...query, _id: update.$setOnInsert._id };
                if (!row) return null;
                Object.assign(row, update.$set);
                rows.set(key, row);
                return row;
            } };
        },
    };
    const exports = {};
    vm.runInNewContext(fs.readFileSync(require.resolve("../api-server/controllers/customColumns.controller"), "utf8"), {
        exports,
        require(name) {
            if (name === "crypto") return require("node:crypto");
            if (name === "mongoose") return mongoose;
            if (name.includes("logger")) return { write_logs() {} };
            return model;
        },
    });
    async function call(method, userId, body) {
        let result;
        await exports[method]({ user: { _id: userId }, body }, {
            status(code) { this.code = code; return this; },
            send(data) { result = { code: this.code, data }; },
        });
        return result;
    }
    return { call, rows, collide: () => { failOnce = true; } };
}

test("chart preferences remain separate by authenticated user and view", async () => {
    const fixtureData = fixture();
    for (const [user, page, setting] of [["a", "Campaign", "Weekly"], ["a", "Targeting", "Monthly"], ["b", "Campaign", "Daily"]]) {
        const saved = await fixtureData.call("updateChartSettings", user, { pageName: page, settings: { granularity: setting } });
        assert.equal(saved.code, 200);
        const loaded = await fixtureData.call("getChartSettings", user, { pageName: page });
        assert.equal(loaded.data.data.settings.granularity, setting);
    }
    assert.equal(fixtureData.rows.size, 3);
});

test("simultaneous first saves use one stable identity and profile changes keep view preferences", async () => {
    const fixtureData = fixture();
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
        fixtureData.call("updateChartSettings", "a", { pageName: "Campaign", profileId: index, settings: { showDataLabels: true } })));
    assert(results.every(result => result.code === 200));
    assert.equal(new Set(results.map(result => String(result.data.data._id))).size, 1);
    assert.equal(fixtureData.rows.size, 1);
});

test("duplicate-key race retries the winning user/view document", async () => {
    const fixtureData = fixture();
    fixtureData.collide();
    const result = await fixtureData.call("updateChartSettings", "a", { pageName: "Campaign", settings: { viewMode: "table" } });
    assert.equal(result.code, 200);
    assert.equal(result.data.data.settings.viewMode, "table");
    assert.equal(fixtureData.rows.size, 1);
});

test("legacy saved documents retain their ID when updated", async () => {
    const fixtureData = fixture();
    const id = new mongoose.Types.ObjectId();
    fixtureData.rows.set(JSON.stringify(["a", "Campaign"]), { _id: id, userId: "a", pageName: "Campaign", settings: {} });
    const result = await fixtureData.call("updateChartSettings", "a", { pageName: "Campaign", settings: { viewMode: "table" } });
    assert.equal(String(result.data.data._id), String(id));
});

test("invalid settings cannot replace an existing preference object", async () => {
    const fixtureData = fixture();
    for (const settings of [null, [], "invalid"]) {
        const result = await fixtureData.call("updateChartSettings", "a", { pageName: "Campaign", settings });
        assert.equal(result.code, 400);
    }
    assert.equal(fixtureData.rows.size, 0);
});
