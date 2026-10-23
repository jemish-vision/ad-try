import * as dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { SQSClient, ReceiveMessageCommand, DeleteMessageBatchCommand } from "@aws-sdk/client-sqs";
import campaignsSchema from "../api-server/models/campaign.model.js";
import sbCampaignsSchema from "../api-server/models/sbCampaign.model.js";
import sdCampaignsSchema from "../api-server/models/sdCampaign.model.js";
import profileSchema from "../api-server/models/profiles.model.js";
import keywordsHourlyPerformanceSchema from "../api-server/models/keywordsHourlyPerformanceSchema.model.js";
import processedSQSMessageSchema from "../api-server/models/processedSQSMessage.model.js";
import SQSMessageSchema from "../api-server/models/sqsMessages.model.js";
import { write_logs } from "../winston/ams/logger.js";
import { ARN_MAP } from "../api-server/helper/amsArn.js";
import realtimeBatch from "./realtimeBatch.cjs";

// Message flow: poll SQS -> validate and prepare -> buffer -> save in MongoDB
// -> delete from SQS. A message stays in SQS when preparation or saving fails.
const { TRAFFIC_DATASETS, trafficInstructions, persistBatch } = realtimeBatch;
// Let this worker flush before the shared connection's shutdown handler closes MongoDB.
process.env.CUSTOM_SHUTDOWN = "true";
const { ensureDbConnected, closeMongoConnection } = (await import("../shared/connection.js")).default;
const READERS_PER_REGION = 4;
const BUFFER_FLUSH_INTERVAL_MS = 15_000;
const MAX_BUFFER_SIZE = 500;
const LEGACY_DATASETS = new Set([
    "sp-conversion", "sb-conversion", "sd-conversion", "budget-usage",
    "campaigns", "ads-campaign-management-campaigns",
    "adgroups", "ads-campaign-management-adgroups",
    "targets", "ads-campaign-management-targets",
]);

const models = {
    sp: campaignsSchema,
    sb: sbCampaignsSchema,
    sd: sdCampaignsSchema,
    hourly: keywordsHourlyPerformanceSchema,
    processed: processedSQSMessageSchema,
    staged: SQSMessageSchema,
};
const queueBuffers = new Map();
let activeProfiles = new Map();
let stopping = false;
const readerPromises = [];

async function main() {
    await prepareDatabase();
    await refreshProfilesCache();
    startProfileRefreshTimer();
    startReaders();
}

async function refreshProfilesCache() {
    try {
        const profiles = await profileSchema.find({ isActive: true }).lean();
        const next = new Map();
        for (const profile of profiles) {
            if (!profile.marketplaceStringId || !profile.advertiserId) continue;
            const key = `${profile.marketplaceStringId}_${profile.advertiserId}`;
            next.set(key, next.has(key) ? null : profile);
        }
        activeProfiles = next;
    } catch (err) {
        write_logs({
            message: `[ams-worker] refreshProfilesCache error: ${err?.message || err}`,
            log_type: "error",
        });
    }
}

// A missing or ambiguous profile must never become an acknowledged metric update.
async function findActiveProfile(body) {
    if (!body.marketplace_id || !body.advertiser_id) throw new Error("Missing profile identity");
    const key = `${body.marketplace_id}_${body.advertiser_id}`;
    if (activeProfiles.has(key)) {
        const profile = activeProfiles.get(key);
        if (!profile) throw new Error(`Ambiguous active profile for ${key}`);
        return profile;
    }

    // Query failures and unknown profiles stay in SQS for retry.
    const profiles = await profileSchema.find({
        marketplaceStringId: body.marketplace_id,
        advertiserId: body.advertiser_id,
        isActive: true,
    }).limit(2).lean();
    if (profiles.length !== 1) throw new Error(`${profiles.length ? "Ambiguous" : "No"} active profile for ${key}`);
    activeProfiles.set(key, profiles[0]);
    return profiles[0];
}

// SQS accepts at most ten receipt handles per delete request.
async function deleteMessagesBatchInChunks(receipts, buffer) {
    let failed = 0;
    for (let index = 0; index < receipts.length; index += 10) {
        const chunk = receipts.slice(index, index + 10);
        try {
            const response = await buffer.sqsClient.send(new DeleteMessageBatchCommand({
                QueueUrl: buffer.sqsQueueUrl,
                Entries: chunk.map((receiptHandle, entry) => ({ Id: String(entry), ReceiptHandle: receiptHandle })),
            }));
            failed += response.Failed?.length || 0;
            if (response.Failed?.length) {
                write_logs({
                    message: `[${buffer.regionName}] SQS delete failures: ${JSON.stringify(response.Failed)}`,
                    log_type: "error",
                });
            }
        } catch (error) {
            failed += chunk.length;
            write_logs({
                message: `[${buffer.regionName}] SQS delete error: ${error?.message || error}`,
                log_type: "error",
            });
        }
    }
    return failed;
}

// Save first. Only committed messages are eligible for SQS deletion.
async function saveAndAcknowledgeBatch(buffer, batch) {
    try {
        const receipts = await persistBatch(batch, buffer.sqsQueueUrl, models, mongoose.connection);
        const failedDeletes = await deleteMessagesBatchInChunks(receipts, buffer);
        write_logs({
            message: `[${buffer.regionName}] committed ${batch.length} messages; SQS delete failures: ${failedDeletes}`,
            log_type: failedDeletes ? "error" : "info",
        });
    } catch (error) {
        // These messages remain in SQS for retry.
        write_logs({
            message: `[${buffer.regionName}] Batch processing failed: ${error?.stack || error}`,
            log_type: "error",
        });
    }
}

// One flush per queue at a time. Messages received during a flush stay in the buffer.
async function flushQueueBuffer(buffer) {
    if (buffer.flushPromise) return buffer.flushPromise;
    if (!buffer.items.length) return;

    const batch = buffer.items.splice(0, buffer.items.length);
    buffer.flushPromise = saveAndAcknowledgeBatch(buffer, batch);
    try {
        await buffer.flushPromise;
    } finally {
        buffer.flushPromise = null;
        if (buffer.items.length >= MAX_BUFFER_SIZE) void flushQueueBuffer(buffer);
    }
}

function getOrCreateQueueBuffer({ regionName, sqsQueueUrl }) {
    if (queueBuffers.has(sqsQueueUrl)) return queueBuffers.get(sqsQueueUrl);
    const buffer = {
        regionName,
        sqsQueueUrl,
        sqsClient: new SQSClient({
            region: regionName,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        }),
        items: [],
        flushPromise: null,
        abortController: new AbortController(),
        timer: null,
    };
    buffer.timer = setInterval(() => { void flushQueueBuffer(buffer); }, BUFFER_FLUSH_INTERVAL_MS);
    queueBuffers.set(sqsQueueUrl, buffer);
    return buffer;
}

// Translate one SQS message into either direct traffic updates or a legacy queue record.
async function prepareMessage(message) {
    const body = JSON.parse(message.Body);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object");
    if (!message.MessageId || !message.ReceiptHandle) throw new Error("Missing SQS identity");

    const item = {
        body,
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle,
    };
    if (TRAFFIC_DATASETS.has(body.dataset_id)) {
        const profile = await findActiveProfile(body);
        return { ...item, kind: "traffic", instructions: trafficInstructions(body, profile) };
    }

    if (LEGACY_DATASETS.has(body.dataset_id) || body.Type === "SubscriptionConfirmation") {
        // The existing Mongo queue worker owns conversion snapshots and management events.
        if (body.Type !== "SubscriptionConfirmation") await findActiveProfile(body);
        return { ...item, kind: "staged", message: JSON.stringify(message) };
    }

    throw new Error(`Unsupported dataset ${body.dataset_id || "missing"}`);
}

async function receiveAndBufferMessages(buffer, workerId) {
    const response = await buffer.sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: buffer.sqsQueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 120,
    }), { abortSignal: buffer.abortController.signal });

    const validItems = [];
    for (const message of response.Messages || []) {
        try {
            validItems.push(await prepareMessage(message));
        } catch (error) {
            write_logs({
                message: `[${buffer.regionName}/${workerId}] Message ${message.MessageId} left in SQS for retry: ${error?.message || error}`,
                log_type: "error",
            });
        }
    }

    if (validItems.length) {
        buffer.items.push(...validItems);
        if (buffer.items.length >= MAX_BUFFER_SIZE) await flushQueueBuffer(buffer);
    }
}

// Four independent readers share this queue's in-memory buffer.
async function startQueueWorker(buffer, workerId) {
    while (!stopping) {
        try {
            await receiveAndBufferMessages(buffer, workerId);
        } catch (error) {
            if (stopping) break;
            write_logs({ message: `[${workerId}] Poll error: ${error?.message || error}`, log_type: "error" });
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
}

async function prepareDatabase() {
    await ensureDbConnected();
    try {
        await processedSQSMessageSchema.collection.createIndex({ idempotencyId: 1 }, { unique: true });
    } catch (err) {
        write_logs({
            message: `[ams-worker] processedSQSMessage index note: ${err?.message || err}`,
            log_type: "info",
        });
    }

    try {
        // Concurrent upserts benefit from a unique hourly identity
        await keywordsHourlyPerformanceSchema.collection.createIndex({
            configId: 1, profileId: 1, reportDate: 1, campaignId: 1,
            adGroupId: 1, keywordId: 1, placement: 1, startTime: 1, type: 1,
        }, { unique: true, name: "unique_stream_hourly_identity" });
    } catch (err) {
        // If historical data contains duplicate keys, log warning and fall back to a non-unique compound index
        // so that ams-worker startup is not blocked and live ingestion continues.
        write_logs({
            message: `[ams-worker] Warning: unique_stream_hourly_identity unique index could not be created due to historical duplicates (${err?.message || err}). Creating non-unique index instead.`,
            log_type: "warn",
        });
        try {
            await keywordsHourlyPerformanceSchema.collection.createIndex({
                configId: 1, profileId: 1, reportDate: 1, campaignId: 1,
                adGroupId: 1, keywordId: 1, placement: 1, startTime: 1, type: 1,
            }, { name: "stream_hourly_identity" });
        } catch (fallbackErr) {
            write_logs({
                message: `[ams-worker] Fallback index note: ${fallbackErr?.message || fallbackErr}`,
                log_type: "warn",
            });
        }
    }
}

function startProfileRefreshTimer() {
    setInterval(() => {
        refreshProfilesCache().catch((error) => write_logs({
            message: `[ams-worker] Profile cache refresh failed: ${error?.message || error}`,
            log_type: "error",
        }));
    }, 5 * 60 * 1000);
}

function startReaders() {
    for (const cfg of Object.values(ARN_MAP).filter((entry) => entry?.sqsQueueUrl && entry?.regionName)) {
        const buffer = getOrCreateQueueBuffer(cfg);
        for (let index = 1; index <= READERS_PER_REGION; index++) {
            readerPromises.push(startQueueWorker(buffer, `${cfg.regionName}-reader-${index}`));
        }
    }
}

async function gracefulShutdown(signal) {
    if (stopping) return;
    stopping = true;
    write_logs({ message: `[ams-worker] ${signal}: finishing received messages`, log_type: "info" });
    for (const buffer of queueBuffers.values()) {
        clearInterval(buffer.timer);
        buffer.abortController.abort();
    }
    await Promise.allSettled(readerPromises);
    for (const buffer of queueBuffers.values()) {
        if (buffer.flushPromise) await buffer.flushPromise;
        await flushQueueBuffer(buffer);
    }
    await closeMongoConnection(signal);
    process.exit(0);
}

process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });

main().catch(async (error) => {
    write_logs({ message: `[ams-worker] Startup failed: ${error?.stack || error}`, log_type: "error" });
    await closeMongoConnection("startup failure");
    process.exit(1);
});
