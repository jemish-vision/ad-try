const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../api-server/controllers/aplusContent.controller.js"), "utf8");

function fixture({ countryCode, marketplaceId, expectedLocale, existingLocale }) {
    const posts = [];
    const writes = [];
    const images = Array.from({ length: 5 }, (_, index) => ({
        title: `Banner ${index + 1}`, size: "970x300", uploadDestinationId: `upload-${index + 1}`,
    }));
    const job = {
        _id: "job", configId: "config", profileId: 123, marketplaceId,
        asin: "B0H7T979VV", type: "basic", imageModules: images,
        batchJobName: "batches/fixture", status: "PENDING", save: async () => {},
    };
    const mocks = {
      // Platform keys (the organization doesn't use its own AI keys in these tests)
      '../services/aiKeys/aiKeyRouting': { platformKey: () => 'platform-gemini-key', keyError: (p, k) => new Error(`${p} ${k}`), sendAiAccessError: () => false },
      '../services/aiKeys/aiKey.service': { personalKeyFor: () => null, getOrgKeyConfig: async () => ({ enabled: false, keys: {} }), classifyProviderError: () => null, markKeyProblem: async () => {}, scrub: (t) => String(t || '') },
        "../services/aiCredits/withAiCredits": { reserveAiCredits: async () => true },
        "../services/aiCredits/backgroundHolds": {
            imageCredits: async () => 0,
            settleBackgroundHold: async () => {},
            releaseBackgroundHold: async () => {},
        },
        "p-limit": { default: () => task => task() },
        "../helper/common": {
            getProfile: async () => ({ marketplaceStringId: marketplaceId }),
            getSPAccessToken: async () => ({ spAccessToken: "fixture" }),
        },
        "../helper/retryHelper": { retryWithBackoff: task => task() },
        "../helper/chatgpt": { generateAPlusModulesAI: async () => ({ _imageModules: images }) },
        "../helper/generateAPlusImages": {
            generateAndUploadModuleImages: async () => images,
            getAllVariationAsins: async ({ asin }) => [asin],
            addAsinsToAPlusContent: async () => {},
            uploadImageToAmazon: async ({ localPath }) => localPath,
        },
        "../helper/geminiBatch.helper": {
            checkBatchJobStatus: async () => ({
                isCompleted: true,
                responses: images.map(img => ({ candidates: [{ content: { parts: [{ inlineData: { data: img.uploadDestinationId } }] } }] })),
            }),
            saveBatchImageToDisk: async ({ base64Data }) => base64Data,
        },
        "../models/marketPlaceConfig.model": {
            findOne: () => ({ lean: async () => ({ countryCode, endPoint: "https://amazon.invalid", marketPlaceId: marketplaceId }) }),
        },
        "../models/asinAPlusContent.model": { bulkWrite: async ops => writes.push(...ops) },
        "../models/aPlusBatchJob.model": { find: () => ({ sort: () => ({ limit: async () => [job] }) }) },
        "../models/adNotification.model": { create: async () => {} },
        "../../winston/utility/logger": { write_logs: () => {} },
        "../../winston/cronAutomation/logger": { cron_logs: () => {} },
        "../helper/amazonAxios": async call => {
            if (call.method === "get") {
                const data = call.url.includes("/catalog/")
                    ? { summaries: [{ itemName: "Fixture" }] }
                    : { contentRecord: { contentDocument: { locale: existingLocale } } };
                return { status: 200, data };
            }
            posts.push(call);
            const locale = call.data.contentDocument.locale;
            if (locale !== expectedLocale) {
                throw Object.assign(new Error(`Invalid contentLocale=${locale.replace("-", "_")}`), {
                    response: { status: 400 },
                });
            }
            return { status: 200, data: { contentReferenceKey: "draft-fixture" } };
        },
    };
    const api = {};
    vm.runInNewContext(source, { exports: api, require: name => mocks[name] || {}, process: { env: {} } });
    const invoke = async (handler, extra = {}) => {
        const body = { asin: job.asin, profileId: job.profileId, generateImageOption: true, ...extra };
        const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
        await api[handler]({ config: { configId: job.configId }, body }, res);
        return res.data;
    };
    return { api, invoke, job, posts, writes };
}

for (const [countryCode, marketplaceId, expectedLocale] of [
    ["SA", "A17E79C6D8DWNP", "en-AE"],
    ["IN", "A21TJRUUN4KGV", "en-IN"],
    ["UK", "A1F83G8C2ARO7P", "en-GB"],
]) {
    test(`Product Listing creates a draft with five uploaded banners for ${countryCode}`, async () => {
        const f = fixture({ countryCode, marketplaceId, expectedLocale });
        const response = await f.invoke("createAIAPlusContent");
        assert.equal(response.isSuccess, true, response.message);
        assert.equal(response.data.contentReferenceKey, "draft-fixture");
        assert.equal(f.posts.length, 1);
        const document = f.posts[0].data.contentDocument;
        assert.equal(document.locale, expectedLocale);
        assert.equal(document.contentModuleList.length, 5);
        assert.equal(document.contentModuleList[4].standardImageTextOverlay.block.image.uploadDestinationId, "upload-5");
        assert.equal(f.writes[0].updateOne.filter.locale, expectedLocale.replace("-", "_"));
        assert.equal(f.writes[0].updateOne.update.$set.locale, expectedLocale.replace("-", "_"));
    });
}

test("regenerating banners retains the Amazon draft language", async () => {
    const f = fixture({ countryCode: "SA", marketplaceId: "A17E79C6D8DWNP", expectedLocale: "ar-AE", existingLocale: "ar-AE" });
    const response = await f.invoke("editAIAPlusContent", { contentReferenceKey: "draft-fixture" });
    assert.equal(response.isSuccess, true, response.message);
    assert.equal(f.posts[0].data.contentDocument.locale, "ar-AE");
    assert.equal(f.writes[0].updateOne.update.$set.locale, "ar_AE");
});

test("previously queued Saudi banner jobs create drafts in the marketplace locale", async () => {
    const f = fixture({ countryCode: "SA", marketplaceId: "A17E79C6D8DWNP", expectedLocale: "en-AE" });
    await f.api.cronProcessPendingAPlusBatchJobs();
    assert.equal(f.job.status, "COMPLETED");
    assert.equal(f.posts[0].data.contentDocument.locale, "en-AE");
    assert.equal(f.writes[0].updateOne.update.$set.locale, "en_AE");
});
