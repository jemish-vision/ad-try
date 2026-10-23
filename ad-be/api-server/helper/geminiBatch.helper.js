const axios = require("axios");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { write_logs } = require("../../winston/utility/logger");

const IMAGE_MODEL = () => process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

function parseSize(size) {
  const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(String(size || "").trim());
  if (!m) return { width: 970, height: 600 };
  const width = Number(m[1]) || 970;
  const height = Number(m[2]) || 600;
  return { width, height };
}

async function resizeToExact(base64, size) {
  const buf = Buffer.from(base64, "base64");
  const pipeline = sharp(buf, { failOn: "none" });
  const target = parseSize(size);

  const work = pipeline.resize(target.width, target.height, {
    fit: "cover",
    position: "centre",
    kernel: "lanczos3",
    withoutEnlargement: false,
  });

  const out = await work
    .sharpen({ sigma: 0.4 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return out;
}

/**
 * Submits an asynchronous batch image generation request to Google Gemini Batch API (50% cost discount)
 */
exports.submitAPlusImageBatchJob = async ({ imageModules = [], productRef = null, type = "basic" }) => {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_KEY is not configured");

  const model = IMAGE_MODEL();
  const requests = imageModules.map((mod) => {
    const size = mod.size || (type === "premium" ? "970x600" : "970x300");
    const parts = [];

    if (productRef?.data) {
      parts.push({
        inlineData: {
          mimeType: productRef.mimeType || "image/png",
          data: productRef.data,
        },
      });
    }

    parts.push({
      text:
        `${mod.prompt}\n\nGenerate ONE finished landscape image. Target the exact dimensions ${size} pixels ` +
        `(landscape) — compose the whole banner for that shape and fill it edge to edge. ` +
        `The PRODUCT itself must look like a REAL photographed product with true-to-life colors, real texture and soft lighting. ` +
        `Render the product medium and prominent, and keep EVERY line of its label text razor-SHARP, crisp and fully LEGIBLE. ` +
        `Do NOT blur, distort, warp, or generate fake text.`,
    });

    return {
      request: {
        contents: [{ role: "user", parts }],
      },
    };
  });

  const batchEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent?key=${apiKey}`;

  const payload = {
    batch: {
      input_config: {
        requests: {
          requests,
        },
      },
    },
  };

  try {
    const res = await axios.post(batchEndpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    });

    const batchJobName = res.data?.name || res.data?.batchJobName || `batch-${Date.now()}`;
    write_logs({
      message: `Gemini Batch submitted successfully: ${batchJobName} (${requests.length} modules, type=${type})`,
      log_type: "info",
    });

    return {
      batchJobName,
      rawResponse: res.data,
      isImmediate: Boolean(res.data?.response?.responses || res.data?.responses),
      responses: res.data?.response?.responses || res.data?.responses || null,
    };
  } catch (error) {
    write_logs({
      message: `submitAPlusImageBatchJob API attempt error: ${error?.response?.data?.error?.message || error.message}`,
      log_type: "warn",
    });
    throw error;
  }
};

/**
 * Polls Google Gemini Batch Job status
 */
exports.checkBatchJobStatus = async (batchJobName) => {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_KEY is not configured");

  // Ensure batchJobName has proper prefix
  const cleanName = batchJobName.startsWith("batches/") ? batchJobName : `batches/${batchJobName}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${apiKey}`;

  const res = await axios.get(endpoint, { timeout: 30000 });
  const data = res.data;

  const state = data?.metadata?.state || data?.state || data?.status || "BATCH_STATE_RUNNING";
  const isCompleted =
    state === "BATCH_STATE_SUCCEEDED" ||
    state === "SUCCEEDED" ||
    state === "COMPLETED" ||
    Boolean(data?.response?.responses || data?.responses);
  const isFailed =
    state === "BATCH_STATE_FAILED" ||
    state === "FAILED" ||
    state === "BATCH_STATE_CANCELLED" ||
    state === "CANCELLED";

  return {
    state,
    isCompleted,
    isFailed,
    error: data?.error?.message || data?.metadata?.error?.message || null,
    responses: data?.response?.responses || data?.responses || data?.output?.responses || [],
  };
};

/**
 * Processes completed batch image data and saves it locally
 */
exports.saveBatchImageToDisk = async ({ base64Data, size, imageKey, title }) => {
  const dir = path.join(process.cwd(), "uploads/aplus");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const resizedBuffer = await resizeToExact(base64Data, size);
  const filePath = path.join(dir, `${imageKey}-${Date.now()}.png`);
  fs.writeFileSync(filePath, resizedBuffer);

  return filePath;
};
