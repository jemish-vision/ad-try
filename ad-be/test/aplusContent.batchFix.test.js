const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

test("checkBatchJobStatus extracts Gemini v1beta response.inlinedResponses.inlinedResponses", async () => {
  process.env.GOOGLE_AI_STUDIO_KEY = "test-key";
  const origGet = axios.get;
  axios.get = async () => ({
    data: {
      name: "batches/abc123",
      done: true,
      metadata: {
        state: "BATCH_STATE_SUCCEEDED",
      },
      response: {
        "@type": "type.googleapis.com/google.ai.generativelanguage.v1beta.GenerateContentBatchOutput",
        inlinedResponses: {
          inlinedResponses: [
            { response: { candidates: [{ content: { parts: [{ inlineData: { data: "AAAA", mimeType: "image/jpeg" } }] } }] } },
          ],
        },
      },
    },
  });

  try {
    const { checkBatchJobStatus, extractBatchResponses } = require("../api-server/helper/geminiBatch.helper");
    const status = await checkBatchJobStatus("batches/abc123");
    assert.equal(status.isCompleted, true);
    assert.equal(status.isFailed, false);
    assert.equal(status.responses.length, 1);
    assert.equal(status.responses[0].response.candidates[0].content.parts[0].inlineData.data, "AAAA");

    const fromMeta = extractBatchResponses({
      metadata: { output: { inlinedResponses: { inlinedResponses: [{ response: { ok: true } }] } } },
    });
    assert.equal(fromMeta.length, 1);
    assert.equal(fromMeta[0].response.ok, true);
  } finally {
    axios.get = origGet;
  }
});

test("scheduleRegistry maps APlusBatchPoll to SP_API APLUS_BATCH_POLL", () => {
  const { resolveMigratedSchedule } = require("../queue-service/scheduler/scheduleRegistry");
  const { QUEUES, SP_API_TASKS } = require("../queue-service/queues/queueNames");
  const mapped = resolveMigratedSchedule("APlus Batch Poll");
  assert.deepEqual(mapped, {
    queue: QUEUES.SP_API,
    task: SP_API_TASKS.APLUS_BATCH_POLL,
    family: "sp-api",
  });
});

test("createAIAPlusContent defaults useBatch=false for immediate image generation", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../api-server/controllers/aplusContent.controller.js"), "utf8");
  assert.match(src, /useBatch\s*=\s*false/);
});
