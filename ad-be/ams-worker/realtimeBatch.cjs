const crypto = require("node:crypto");
const mongoose = require("mongoose");
const moment = require("moment-timezone");

const TRAFFIC_DATASETS = new Set(["sp-traffic", "sb-traffic", "sd-traffic"]);

function finiteNumber(value, field) {
    const number = Number(value);
    if (value === undefined || value === null || value === "" || !Number.isFinite(number)) {
        throw new Error(`Invalid ${field}`);
    }
    return number;
}

function trafficInstructions(body, profile) {
    if (!TRAFFIC_DATASETS.has(body.dataset_id)) throw new Error("Unsupported traffic dataset");
    if (!body.time_window_start || !moment(body.time_window_start, moment.ISO_8601, true).isValid()) {
        throw new Error("Invalid time_window_start");
    }
    if (!profile?.configId || !Number.isFinite(Number(profile.profileId))) {
        throw new Error("Invalid profile");
    }

    const timezone = profile.timezone || "UTC";
    const start = moment(body.time_window_start, moment.ISO_8601, true).tz(timezone);
    const reportDate = start.format("YYYY-MM-DD");
    const campaignId = finiteNumber(body.campaign_id, "campaign_id");
    const adGroupId = finiteNumber(body.ad_group_id, "ad_group_id");
    const keywordId = finiteNumber(body.keyword_id ?? body.target_id, "keyword_id/target_id");
    const impressions = finiteNumber(body.impressions ?? 0, "impressions");
    const clicks = finiteNumber(body.clicks ?? 0, "clicks");
    const cost = finiteNumber(body.cost ?? 0, "cost");
    if (!body.marketplace_id) throw new Error("Missing marketplace_id");

    const placement = {
        "Other on-Amazon": "Rest of Search",
        "Other Placements": "Rest of Search",
        "Detail Page on-Amazon": "Product pages",
        "Top of Search on-Amazon": "Top of Search",
        "Top of Search": "Top of Search",
    }[body.placement] || "";
    const type = body.dataset_id.slice(0, 2).toUpperCase();
    const campaignFilter = {
        profileId: profile.profileId,
        configId: profile.configId,
        campaignId,
        reportDate,
    };
    const hourlyFilter = {
        configId: profile.configId,
        profileId: profile.profileId,
        reportDate,
        campaignId,
        adGroupId,
        keywordId,
        placement,
        startTime: start.format("HH:mm"),
        type,
    };
    const hourlySet = {
        marketplaceId: body.marketplace_id,
        endTime: start.clone().add(1, "hour").format("HH:mm"),
    };
    if (body.keyword_text !== undefined) hourlySet.keywordText = body.keyword_text;
    if (body.match_type !== undefined) hourlySet.matchType = body.match_type;

    return {
        campaignKind: type,
        campaignOp: {
            updateOne: {
                filter: campaignFilter,
                update: {
                    $inc: {
                        "streaming.impressions": impressions,
                        "streaming.clicks": clicks,
                        "streaming.spend": cost,
                    },
                    $set: { "streaming.lastSyncAt": new Date() },
                },
                upsert: true,
            },
        },
        hourlyOp: {
            updateOne: {
                filter: hourlyFilter,
                update: {
                    $inc: { impressions, clicks, spends: cost },
                    $set: hourlySet,
                },
                upsert: true,
            },
        },
    };
}

function messageKey(item, queueUrl) {
    if (item.kind === "traffic") {
        return String(item.body.idempotency_id || `sqs:${queueUrl}:${item.messageId}`);
    }
    return `staged:${queueUrl}:${item.messageId}`;
}

function stagedDocument(item, queueUrl) {
    const hash = crypto.createHash("sha256").update(`${queueUrl}:${item.messageId}`).digest();
    return {
        _id: new mongoose.Types.ObjectId(hash.subarray(0, 12)),
        messageId: item.messageId,
        receiptHandle: item.receiptHandle,
        body: item.body,
        message: item.message,
    };
}

async function claimNewMessages(batch, queueUrl, processedModel) {
    const keys = batch.map((item) => messageKey(item, queueUrl));
    const existing = await processedModel.find(
        { idempotencyId: { $in: keys } },
        { idempotencyId: 1 },
    ).lean();
    const claimed = new Set(existing.map((doc) => doc.idempotencyId));
    const fresh = [];

    for (let index = 0; index < batch.length; index++) {
        if (claimed.has(keys[index])) continue;
        claimed.add(keys[index]);
        fresh.push({ item: batch[index], key: keys[index] });
    }

    if (fresh.length) {
        try {
            await processedModel.insertMany(
                fresh.map(({ key }) => ({ idempotencyId: key })),
                { ordered: false },
            );
        } catch (error) {
            // E11000 duplicate keys are expected when parallel workers encounter the same idempotencyId
            if (!error.writeErrors && error.code !== 11000) throw error;
        }
    }
    return fresh.map(({ item }) => item);
}

function groupUpdates(items, queueUrl) {
    const updates = { SP: [], SB: [], SD: [], hourly: [], staged: [] };
    for (const item of items) {
        if (item.kind === "traffic") {
            updates[item.instructions.campaignKind].push(item.instructions.campaignOp);
            updates.hourly.push(item.instructions.hourlyOp);
        } else {
            updates.staged.push({ insertOne: { document: stagedDocument(item, queueUrl) } });
        }
    }
    return updates;
}

async function writeUpdates(updates, models) {
    for (const [kind, model] of [["SP", models.sp], ["SB", models.sb], ["SD", models.sd]]) {
        if (updates[kind].length) await model.bulkWrite(updates[kind], { ordered: false });
    }
    if (updates.hourly.length) await models.hourly.bulkWrite(updates.hourly, { ordered: false });
    if (updates.staged.length) await models.staged.bulkWrite(updates.staged, { ordered: false });
}

// Persist batch without MongoDB transactions (supports standalone MongoDB instances)
async function persistBatch(batch, queueUrl, models, connection) {
    const newMessages = await claimNewMessages(batch, queueUrl, models.processed);
    const updates = groupUpdates(newMessages, queueUrl);
    await writeUpdates(updates, models);
    return [...new Set(batch.map((item) => item.receiptHandle))];
}

module.exports = { TRAFFIC_DATASETS, trafficInstructions, persistBatch, messageKey };
