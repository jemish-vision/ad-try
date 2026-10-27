const mongoose = require("mongoose");
const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT) || 3);

const zlib = require("zlib");
const { retryWithBackoff } = require("../helper/retryHelper");
const {
  getSPAccessToken,
  getActivePlanProfiles,
  parallelBulkWrite,
  downloadFile,
  unzipReport,
  getAllowedSyncProfiles,
} = require("../helper/common");
const amazonAxios = require("../helper/amazonAxios");
const { cron_logs } = require("../../winston/cronAutomation/logger");

const reportsSchema = require("../models/report.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const fulfillmentCenterSchema = require("../models/fulfillmentCenter.model");
const fulfillmentCenterMasterSchema = require("../models/fulfillmentCenterMaster.model");
const profilesSchema = require("../models/profiles.model");
const fcInventoryLedgerSchema = require("../models/fcInventoryLedger.model");
const fcStorageFeeSchema = require("../models/fcStorageFee.model");
const productListingSchema = require("../models/productListing.model");
const orderDetailsModel = require("../models/orderDetails.model");
const returnSchema = require("../models/return.model");
const inventorySchema = require("../models/inventory.model");
const postalCodeStateModel = require("../models/postalCodeState.model");

const {
  resolveFcLocation,
  registerDiscoveredWarehouses,
} = require("../helper/fcLocationHelper");

// Helper: Ensure directory exists
const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Universal helper to decompress any Amazon SP-API report file.
 * Handles GZIP (.gz), PKZIP (.zip), and plain text.
 */
async function decompressReportFile(inputFilePath, outputFilePath) {
  if (!fs.existsSync(inputFilePath)) return outputFilePath;
  let buf = fs.readFileSync(inputFilePath);

  // 1. If GZIP compressed (magic bytes 0x1f 0x8b), gunzip it
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      buf = zlib.gunzipSync(buf);
    } catch (e) {
      console.warn("[Decompress] GZIP unpack warning:", e.message);
    }
  }

  // 2. If PKZIP compressed (magic bytes 0x50 0x4b), extract inner file
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    try {
      const eocdSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
      const eocdIndex = buf.lastIndexOf(eocdSig);
      if (eocdIndex !== -1) {
        const cdOffset = buf.readUInt32LE(eocdIndex + 16);
        const cdSig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
        if (buf.slice(cdOffset, cdOffset + 4).equals(cdSig)) {
          const compSize = buf.readUInt32LE(cdOffset + 20);
          const compMethod = buf.readUInt16LE(cdOffset + 10);
          const locOffset = buf.readUInt32LE(cdOffset + 42);
          const locFnLen = buf.readUInt16LE(locOffset + 26);
          const locExLen = buf.readUInt16LE(locOffset + 28);
          const dataStart = locOffset + 30 + locFnLen + locExLen;
          const compData = buf.slice(dataStart, dataStart + compSize);
          if (compMethod === 8) {
            buf = zlib.inflateRawSync(compData);
          } else if (compMethod === 0) {
            buf = compData;
          }
        }
      }
    } catch (e) {
      console.warn("[Decompress] PKZIP unpack warning:", e.message);
    }
  }

  fs.writeFileSync(outputFilePath, buf);
  return outputFilePath;
}

exports.cronGenerateFcInventoryLedgerReport = async (customParam1 = null) => {
  cron_logs({ message: `[FC Ledger] Starting cronGenerateFcInventoryLedgerReport at ${moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")}`, log_type: "info" });
  try {
    const pastSyncObj = customParam1 && typeof customParam1 === "object" ? customParam1 : null;
    const cronjobid = pastSyncObj?.cronjobid;
    const recurring = pastSyncObj?.recurring ?? true;
    const targetProfileId = pastSyncObj?.profileId;
    const targetConfigId = pastSyncObj?.configId;
    let profiles = await getActivePlanProfiles(targetProfileId || "ALL", "sp", targetConfigId);
    if (!targetProfileId) {
      const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", recurring);
      profiles = profiles.filter((p) => allowedProfiles.some((item) => item.profileId === Number(p.profileId) && item.configId === String(p.configId)));
    }
    if (!profiles || profiles.length === 0) {
      if (cronjobid) await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { status: "FAILED" });
      cron_logs({ message: "[FC Ledger] No active profiles found.", log_type: "warn" });
      return;
    }
    const promises = profiles.map((profile) => limit(async () => {
      try {
        const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);
        if (!checkSPConfig) {
          cron_logs({ message: `[FC Ledger] SP token disconnected. profile=${profile.profileId}`, log_type: "warn" });
          return;
        }
        const now = moment().tz(profile.timezone || "Asia/Kolkata");
        const todayStr = now.format("YYYY-MM-DD");
        const startDate = pastSyncObj?.startDate || pastSyncObj?.date || now.clone().subtract(3, "days").format("YYYY-MM-DD");
        const requestedEndDate = pastSyncObj?.endDate || (pastSyncObj?.startDate ? pastSyncObj.startDate : pastSyncObj?.date) || now.clone().subtract(1, "days").format("YYYY-MM-DD");
        const endDate = moment(requestedEndDate).isAfter(todayStr) ? todayStr : requestedEndDate;
        let cronData = null;
        if (recurring) {
          cronData = await cronJobHistorySchema.findOneAndUpdate(
            { configId: profile.configId, profileId: profile.profileId, cronName: "FC Inventory Ledger", historyDate: todayStr },
            { $setOnInsert: { status: "PENDING" } },
            { upsert: true, new: true }
          );
        }
        const result = await generateFcLedgerReportForDate(profile, startDate, endDate, checkSPConfig, recurring);
        cron_logs({ message: `[FC Ledger] Profile=${profile.profileId}, result=${result}`, log_type: result === "FAILED" ? "error" : "info" });
        if (recurring && cronData?._id) {
          if (result === "COMPLETED" || result === "FAILED") {
            await cronJobHistorySchema.findByIdAndUpdate(cronData._id, { status: result });
          }
        }
        if (!recurring && cronjobid && result === "COMPLETED") {
          await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { status: "COMPLETED" });
        }
      } catch (error) {
        cron_logs({ message: `[FC Ledger] Profile ${profile.profileId} error: ${error.stack || error.message}`, log_type: "error" });
        if (!recurring && cronjobid) await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { status: "FAILED" });
      }
    }));
    await Promise.all(promises);
    cron_logs({ message: "[FC Ledger] All profiles processed.", log_type: "info" });
  } catch (error) {
    cron_logs({ message: `[FC Ledger] Error: ${error.stack || error.message || error}`, log_type: "error" });
  }
};

async function generateFcLedgerReportForDate(profile, startDate, endDate, token, recurring = true) {
  const reportTypeId = "GET_LEDGER_SUMMARY_VIEW_DATA";
  const todayStr = moment().tz(profile.timezone || "Asia/Kolkata").format("YYYY-MM-DD");
  if (!endDate) endDate = startDate;
  if (moment(endDate).isAfter(todayStr)) endDate = todayStr;
  const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
  if (!marketPlaceConfig) {
    cron_logs({ message: `[FC Ledger] Marketplace config not found: ${profile.marketplaceStringId}`, log_type: "error" });
    return "FAILED";
  }
  let existing = null;
  if (recurring) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    existing = await reportsSchema.findOne({
      profileId: profile.profileId,
      configId: profile.configId,
      reportTypeId,
      status: { $in: ["PENDING", "PROCESSING", "IN_QUEUE", "IN_PROGRESS"] },
      createdAt: { $gte: twentyFourHoursAgo },
    }).sort({ createdAt: -1 }).lean();

    if (!existing) {
      const alreadyCompleted = await reportsSchema.findOne({
        profileId: profile.profileId,
        configId: profile.configId,
        startDate,
        endDate,
        reportTypeId,
        status: "COMPLETED",
        createdAt: { $gte: twentyFourHoursAgo },
      }).sort({ createdAt: -1 }).lean();

      if (alreadyCompleted) {
        cron_logs({ message: `[FC Ledger] Profile ${profile.profileId} report already completed (${startDate} to ${endDate})`, log_type: "info" });
        return "COMPLETED";
      }
    }
  } else {
    existing = await reportsSchema.findOne({
      profileId: profile.profileId,
      configId: profile.configId,
      startDate,
      endDate,
      reportTypeId
    }).sort({ createdAt: -1 }).lean();
    if (existing?.status === "COMPLETED") return "COMPLETED";
    if (existing && !["PENDING", "PROCESSING", "IN_QUEUE", "IN_PROGRESS"].includes(existing.status)) {
      existing = null;
    }
  }
  if (existing && ["PENDING", "PROCESSING", "IN_QUEUE", "IN_PROGRESS"].includes(existing.status)) {
    try {
      const statusRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${existing.reportId}`,
        headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile.profileId }
      }));
      const processingStatus = statusRes?.data?.processingStatus;
      cron_logs({ message: `[FC Ledger] reportId=${existing.reportId}, status=${processingStatus}`, log_type: "info" });
      if (processingStatus === "DONE") {
        const reportDocumentId = statusRes?.data?.reportDocumentId;
        if (!reportDocumentId) {
          cron_logs({ message: `[FC Ledger] reportDocumentId missing for ${existing.reportId}`, log_type: "error" });
          return "FAILED";
        }
        const docRes = await retryWithBackoff(() => amazonAxios({
          method: "GET",
          url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${reportDocumentId}`,
          headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
          meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile.profileId }
        }));
        const downloadUrl = docRes?.data?.url;
        if (!downloadUrl) {
          cron_logs({ message: `[FC Ledger] Download URL missing for ${existing.reportId}`, log_type: "error" });
          return "FAILED";
        }
        const uploadDir = path.resolve(__dirname, "../../uploads/inventoryLedger");
        ensureDirExists(uploadDir);
        const rawFilePath = path.join(uploadDir, `fc_ledger_${existing.reportId}.raw`);
        const extractedFilePath = path.join(uploadDir, `fc_ledger_${existing.reportId}.txt`);
        await downloadFile(downloadUrl, rawFilePath);
        await decompressReportFile(rawFilePath, extractedFilePath);

        if (!fs.existsSync(extractedFilePath)) {
          cron_logs({ message: `[FC Ledger] Extracted file not found: ${extractedFilePath}`, log_type: "error" });
          return "FAILED";
        }
        console.log("[FC Ledger] Extracted file")
        const stats = fs.statSync(extractedFilePath);
        console.log("stats", stats.size)
        if (stats.size === 0) {
          cron_logs({ message: `[FC Ledger] Extracted file is empty`, log_type: "error" });
          return "FAILED";
        }
        console.log("Start processFcLedgerFile")
        const affectedRecords = await processFcLedgerFile(extractedFilePath, {
          profileId: profile.profileId,
          configId: profile.configId,
          sellerId: token?.sellerId,
          defaultDate: startDate
        });
        await reportsSchema.updateOne(
          { _id: existing._id },
          { $set: { status: "COMPLETED", processedAt: new Date(), recordCount: affectedRecords } }
        );
        return "COMPLETED";
      }
      if (["CANCELLED", "FATAL", "FAILED"].includes(processingStatus)) {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED", failedAt: new Date() } });
        existing = null;
      } else {
        return "PENDING";
      }
    } catch (error) {
      cron_logs({ message: `[FC Ledger] Poll error: ${error.stack || error.message}`, log_type: "error" });
      return "PENDING";
    }
  }
  if (!existing || existing.status === "FAILED") {
    try {
      const payload = {
        reportType: reportTypeId,
        marketplaceIds: [profile.marketplaceStringId],
        dataStartTime: `${startDate}T00:00:00Z`,
        dataEndTime: `${endDate}T23:59:59Z`,
        reportOptions: {
          aggregateByLocation: "FC",
          aggregatedByTimePeriod: "DAILY"
        }
      };
      const createResp = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
        headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
        data: payload,
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile.profileId }
      }));
      const reportId = createResp?.data?.reportId;
      if (!reportId) {
        cron_logs({ message: `[FC Ledger] Amazon reportId missing: ${JSON.stringify(createResp?.data)}`, log_type: "error" });
        return "FAILED";
      }
      await reportsSchema.create({
        profileId: profile.profileId,
        configId: profile.configId,
        reportId,
        startDate,
        endDate,
        adProduct: "INVENTORY",
        reportTypeId,
        reportName: "FC_INVENTORY_LEDGER",
        status: "PENDING"
      });
      cron_logs({ message: `[FC Ledger] Report created: ${reportId}`, log_type: "info" });
      return "PENDING";
    } catch (error) {
      cron_logs({ message: `[FC Ledger] Create report error: ${error.stack || error.message}`, log_type: "error" });
      return "FAILED";
    }
  }
  return existing?.status || "PENDING";
}

async function processFcLedgerFile(filePath, { profileId, configId, sellerId, defaultDate }) {
  console.log("-------------Starte to insert the data")
  if (!fs.existsSync(filePath)) throw new Error(`[FC Ledger] File not found: ${filePath}`);
  const stats = fs.statSync(filePath);
  if (!stats.size) throw new Error(`[FC Ledger] File is empty: ${filePath}`);
  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let headers = null;
  let delimiter = "\t";
  let bulkOps = [];
  const discoveredFcs = new Map();
  const BATCH_SIZE = 500;
  let totalRows = 0;
  let validRows = 0;
  let skippedRows = 0;
  let insertedCount = 0;
  let modifiedCount = 0;
  let upsertedCount = 0;

  const clean = (value) => value === undefined || value === null ? "" : String(value).replace(/^\uFEFF/, "").trim().replace(/^"(.*)"$/, "$1").trim();
  const normalizeHeader = (value) => clean(value).toLowerCase().replace(/\s+/g, " ").trim();
  const number = (value) => {
    if (value === undefined || value === null || value === "") return 0;
    const n = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  console.log("defaultDate", defaultDate);
  const parseDate = (value) => {
    if (!value) return defaultDate;
    const parsed = moment(String(value).trim(), ["MM/DD/YYYY", "YYYY-MM-DD", "YYYY/MM/DD", "DD/MM/YYYY", "MM-DD-YYYY", "DD-MM-YYYY"], true);
    return parsed.isValid() ? parsed.format("YYYY-MM-DD") : defaultDate;
  };


  const parseLine = (line, delimiter) => {
    const result = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        result.push(clean(current));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(clean(current));
    return result;
  };
  console.log("defaultDate", defaultDate);
  const flush = async () => {
    if (!bulkOps.length) return;
    const operations = bulkOps.splice(0);
    try {
      console.log("-----------------inserting the data----------------")
      const result = await fcInventoryLedgerSchema.bulkWrite(operations, { ordered: false });
      insertedCount += result?.insertedCount || 0;
      modifiedCount += result?.modifiedCount || 0;
      upsertedCount += result?.upsertedCount || 0;
      cron_logs({
        message: `[FC Ledger] MongoDB bulkWrite: inserted=${result?.insertedCount || 0}, modified=${result?.modifiedCount || 0}, upserted=${result?.upsertedCount || 0}, matched=${result?.matchedCount || 0}`,
        log_type: "info"
      });
    } catch (error) {
      cron_logs({ message: `[FC Ledger] MongoDB bulkWrite FAILED: ${error.stack || error.message}`, log_type: "error" });
      throw error;
    }
  };

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    if (!headers) {
      delimiter = line.includes("\t") ? "\t" : ",";
      headers = parseLine(line, delimiter).map(normalizeHeader);
      cron_logs({ message: `[FC Ledger] Headers: ${JSON.stringify(headers)}`, log_type: "info" });
      const required = ["date", "fnsku", "asin", "msku", "disposition", "ending warehouse balance", "location"];
      const missing = required.filter((field) => !headers.includes(field));
      if (missing.length) throw new Error(`[FC Ledger] Missing headers: ${missing.join(", ")}`);
      continue;
    }

    totalRows++;
    const columns = parseLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => { row[header] = columns[index] || ""; });

    const reportDate = parseDate(row["date"]);
    const fnsku = clean(row["fnsku"]);
    const asin = clean(row["asin"]);
    const sku = clean(row["msku"] || row["merchant-sku"] || row["seller-sku"] || row["sku"]);
    const title = clean(row["title"]);
    const disposition = clean(row["disposition"]).toUpperCase() || "SELLABLE";
    const fcCode = clean(row["location"] || row["fulfillment-center"] || row["fulfillment center"] || row["fulfillment_center"] || row["fc"]).toUpperCase();
    const countryCode = clean(row["country"] || row["country-code"] || row["country_code"]).toUpperCase() || "IN";

    if (!asin && !sku && !fnsku) {
      skippedRows++;
      continue;
    }

    if (!fcCode) {
      skippedRows++;
      continue;
    }

    validRows++;

    const startingWarehouseBalance = number(row["starting warehouse balance"] || row["starting-warehouse-balance"] || row["starting_warehouse_balance"]);
    const inTransitBetweenWarehouses = number(row["in transit between warehouses"] || row["in-transit-between-warehouses"] || row["in_transit_between_warehouses"]);
    const receipts = number(row["receipts"]);
    const customerShipments = number(row["customer shipments"] || row["customer-shipments"] || row["customer_shipments"]);
    const customerReturns = number(row["customer returns"] || row["customer-returns"] || row["customer_returns"]);
    const vendorReturns = number(row["vendor returns"] || row["vendor-returns"] || row["vendor_returns"]);
    const warehouseTransfers = number(row["warehouse transfer in/out"] || row["warehouse transfers"] || row["warehouse-transfers"] || row["warehouse_transfers"]);
    const foundInventory = number(row["found"]);
    const lostInventory = number(row["lost"]);
    const damagedInventory = number(row["damaged"]);
    const disposedInventory = number(row["disposed"]);
    const otherEvents = number(row["other events"] || row["other-events"] || row["other_events"]);
    const endingWarehouseBalance = number(row["ending warehouse balance"] || row["ending-warehouse-balance"] || row["ending_warehouse_balance"]);
    const unknownEvents = number(row["unknown events"] || row["unknown-events"] || row["unknown_events"]);
    const unfulfillableBalance = disposition !== "SELLABLE" ? endingWarehouseBalance : 0;

    discoveredFcs.set(fcCode, { fcCode, countryCode, source: "REPORT_LEDGER" });

    bulkOps.push({
      updateOne: {
        filter: {
          configId,
          profileId,
          reportDate,
          fcCode,
          sku,
          disposition
        },
        update: {
          $set: {
            sellerId,
            profileId,
            configId,
            reportDate,
            fcCode,
            countryCode,
            asin,
            sku,
            fnsku,
            title,
            disposition,
            startingWarehouseBalance,
            inTransitBetweenWarehouses,
            receipts,
            customerShipments,
            customerReturns,
            vendorReturns,
            warehouseTransfers,
            foundInventory,
            lostInventory,
            damagedInventory,
            disposedInventory,
            otherEvents,
            endingWarehouseBalance,
            unknownEvents,
            unfulfillableBalance,
            source: "GET_LEDGER_SUMMARY_VIEW_DATA",
            updatedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        upsert: true
      }
    });

    if (bulkOps.length >= BATCH_SIZE) await flush();
  }

  if (bulkOps.length) await flush();

  if (discoveredFcs.size) {
    try {
      await registerDiscoveredWarehouses(Array.from(discoveredFcs.values()));

    } catch (error) {
      cron_logs({ message: `[FC Ledger] FC registration failed: ${error.stack || error.message}`, log_type: "error" });
    }
  }

  const totalAffected = insertedCount + modifiedCount + upsertedCount;
  console.log("totalAffected", totalAffected);
  cron_logs({
    message: `[FC Ledger] Completed. rows=${totalRows}, valid=${validRows}, skipped=${skippedRows}, inserted=${insertedCount}, modified=${modifiedCount}, upserted=${upsertedCount}, FCs=${discoveredFcs.size}`,
    log_type: "info"
  });

  return totalAffected;
}


exports.cronGenerateFcStorageFeeReport = async (customParam1 = null) => {
  cron_logs({
    message: `[FC Storage] Starting cronGenerateFcStorageFeeReport at ${moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")}`,
    log_type: "info",
  });

  try {
    const pastSyncObj = customParam1 && typeof customParam1 === "object" ? customParam1 : null;
    const cronjobid = pastSyncObj?.cronjobid;
    const recurring = pastSyncObj?.recurring ?? true;
    const targetProfileId = pastSyncObj?.profileId;
    const targetConfigId = pastSyncObj?.configId;

    let profiles = await getActivePlanProfiles(targetProfileId || "ALL", "sp", targetConfigId);
    if (!targetProfileId) {
      const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", recurring);
      profiles = profiles.filter((p) =>
        allowedProfiles.some(
          (item) => item.profileId === Number(p.profileId) && item.configId === String(p.configId)
        )
      );
    }
    if (!profiles || profiles.length === 0) {
      if (cronjobid) await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { status: "FAILED" });
      cron_logs({ message: "[FC Storage] No active profiles found.", log_type: "warn" });
      return;
    }

    const promises = profiles.map((profile) =>
      limit(async () => {
        try {
          const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);
          if (!checkSPConfig) {
            cron_logs({ message: `[FC Storage] SP token disconnected. profile=${profile.profileId}`, log_type: "warn" });
            return;
          }

          const tz = profile.timezone || "Asia/Kolkata";
          const now = moment().tz(tz);
          const todayStr = now.format("YYYY-MM-DD");

          // Target month: based on 16th cutoff rule (until 16th: 2 months prior, after 16th: 1 month prior)
          const targetMonth = pastSyncObj?.month || getDefaultStorageFeeMonth(now);
          const startDate = pastSyncObj?.startDate || `${targetMonth}-01`;
          const endDate = pastSyncObj?.endDate || moment(startDate).endOf("month").format("YYYY-MM-DD");

          let cronData = null;
          if (recurring) {
            cronData = await cronJobHistorySchema.findOneAndUpdate(
              {
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "FC Storage Fee",
                historyDate: todayStr,
              },
              { $set: { status: "PENDING" } },
              { upsert: true, new: true }
            );
          }

          const result = await generateFcStorageFeeReportForMonth(profile, targetMonth, startDate, endDate, checkSPConfig, recurring);
          cron_logs({ message: `[FC Storage] Profile=${profile.profileId}, month=${targetMonth}, result=${result}`, log_type: result === "FAILED" ? "error" : "info" });

          if (recurring && cronData?._id) {
            await cronJobHistorySchema.findByIdAndUpdate(cronData._id, { status: result === "COMPLETED" ? "COMPLETED" : result });
          }
          if (!recurring && cronjobid && result === "COMPLETED") {
            await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { status: "COMPLETED" });
          }
        } catch (error) {
          cron_logs({ message: `[FC Storage] Profile ${profile.profileId} error: ${error.stack || error.message}`, log_type: "error" });
          if (!recurring && cronjobid) await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { status: "FAILED" });
        }
      })
    );

    await Promise.all(promises);
    cron_logs({ message: "[FC Storage] All profiles processed.", log_type: "info" });
  } catch (error) {
    cron_logs({
      message: `[FC Storage] Error: ${error.stack || error.message || error}`,
      log_type: "error",
    });
  }
};

async function generateFcStorageFeeReportForMonth(profile, targetMonth, startDate, endDate, token, recurring = true) {
  const reportTypeId = "GET_FBA_STORAGE_FEE_CHARGES_DATA";
  const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
  if (!marketPlaceConfig) {
    cron_logs({ message: `[FC Storage] Marketplace config not found: ${profile.marketplaceStringId}`, log_type: "error" });
    return "FAILED";
  }

  let existing = null;
  if (!recurring) {
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId: profile.profileId,
        configId: profile.configId,
        reportTypeId,
      })
      .sort({ createdAt: -1 })
      .lean();

    if (existing && existing.status === "COMPLETED") return "COMPLETED";
    if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING", "IN_QUEUE"].includes(existing.status)) {
      existing = null;
    }
  } else {
    // Recurring: check pending/in-progress report
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId: profile.profileId,
        configId: profile.configId,
        reportTypeId,
        status: { $in: ["PENDING", "PROCESSING", "IN_QUEUE", "IN_PROGRESS"] },
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!existing) {
    try {
      const createResp = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
          headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
          data: {
            reportType: reportTypeId,
            marketplaceIds: [profile.marketplaceStringId],
            dataStartTime: `${startDate}T00:00:00Z`,
            dataEndTime: `${endDate}T23:59:59Z`,
          },
          meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile.profileId },
        })
      );

      const reportId = createResp?.data?.reportId;
      if (!reportId) {
        cron_logs({ message: `[FC Storage] Amazon reportId missing: ${JSON.stringify(createResp?.data)}`, log_type: "error" });
        return "FAILED";
      }

      await reportsSchema.create({
        profileId: profile.profileId,
        configId: profile.configId,
        reportId,
        startDate,
        endDate,
        adProduct: "INVENTORY",
        reportTypeId,
        reportName: "FC_STORAGE_FEE",
        status: "PENDING",
      });

      cron_logs({ message: `[FC Storage] Report created: ${reportId} for ${startDate} to ${endDate}`, log_type: "info" });
      return "PENDING";
    } catch (createErr) {
      cron_logs({ message: `[FC Storage] Create report error: ${createErr.stack || createErr.message}`, log_type: "error" });
      return "FAILED";
    }
  }

  if (existing && ["PENDING", "PROCESSING", "IN_QUEUE", "IN_PROGRESS"].includes(existing.status)) {
    try {
      const statusRes = await retryWithBackoff(() =>
        amazonAxios({
          method: "GET",
          url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${existing.reportId}`,
          headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
          meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile.profileId },
        })
      );

      const processingStatus = statusRes?.data?.processingStatus;
      console.log("processingStatus", processingStatus)
      cron_logs({ message: `[FC Storage] reportId=${existing.reportId}, status=${processingStatus}`, log_type: "info" });

      if (processingStatus === "DONE") {
        const reportDocumentId = statusRes?.data?.reportDocumentId;
        if (!reportDocumentId) {
          cron_logs({ message: `[FC Storage] reportDocumentId missing for ${existing.reportId}`, log_type: "error" });
          return "FAILED";
        }

        const docRes = await retryWithBackoff(() =>
          amazonAxios({
            method: "GET",
            url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${reportDocumentId}`,
            headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
            meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile.profileId },
          })
        );

        const uploadDir = path.resolve(__dirname, "../../uploads/storageFee");
        ensureDirExists(uploadDir);

        const rawFilePath = path.join(uploadDir, `storage_fee_${existing.reportId}.raw`);
        const extractedFilePath = path.join(uploadDir, `storage_fee_${existing.reportId}.txt`);

        await downloadFile(docRes?.data?.url, rawFilePath);
        await decompressReportFile(rawFilePath, extractedFilePath);

        if (!fs.existsSync(extractedFilePath)) {
          cron_logs({ message: `[FC Storage] Extracted report file not found: ${extractedFilePath}`, log_type: "error" });
          return "FAILED";
        }

        const stats = fs.statSync(extractedFilePath);
        if (stats.size === 0) {
          cron_logs({ message: `[FC Storage] Extracted file is empty for report ${existing.reportId}`, log_type: "warn" });
          await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "COMPLETED", processedAt: new Date(), recordCount: 0 } });
          return "COMPLETED";
        }

        const { totalRows, validRows, upsertedCount } = await processStorageFeeFile(extractedFilePath, {
          profileId: profile.profileId,
          configId: profile.configId,
          sellerId: token?.sellerId,
          monthYear: targetMonth,
        });

        cron_logs({
          message: `[FC Storage] Completed processing: totalRows=${totalRows}, validRows=${validRows}, upserted=${upsertedCount}`,
          log_type: "info",
        });

        await reportsSchema.updateOne(
          { _id: existing._id },
          { $set: { status: "COMPLETED", processedAt: new Date(), recordCount: validRows } }
        );
        return "COMPLETED";
      }

      if (["CANCELLED", "FATAL", "FAILED"].includes(processingStatus)) {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED", failedAt: new Date() } });
        existing = null;
      } else {
        return "PENDING";
      }
    } catch (pollErr) {
      cron_logs({ message: `[FC Storage] Poll error: ${pollErr.message}`, log_type: "error" });
      return "PENDING";
    }
  }

  return existing?.status || "PENDING";
}

async function processStorageFeeFile(filePath, { profileId, configId, sellerId, monthYear }) {
  if (!fs.existsSync(filePath)) return { totalRows: 0, validRows: 0, upsertedCount: 0 };

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  let bulkOps = [];
  const discoveredFcs = new Map();
  const BATCH_SIZE = 1000;
  let totalRows = 0;
  let validRows = 0;
  let upsertedCount = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!headers) {
      const delimiter = trimmed.includes("\t") ? "\t" : ",";
      headers = trimmed.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
      continue;
    }

    totalRows++;
    const delimiter = line.includes("\t") ? "\t" : ",";
    const columns = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => {
      row[h] = columns[i] || "";
    });

    const fcCode = (
      row["fulfillment-center"] ||
      row["fulfillment-center-id"] ||
      row["fulfillment_center"] ||
      row["fulfillment center"] ||
      row["location"] ||
      "UNKNOWN"
    ).toUpperCase();

    const asin = row["asin"] || "";
    const sku = row["sku"] || row["seller-sku"] || row["msku"] || "";
    const fnsku = row["fnsku"] || "";
    const productName = row["product-name"] || row["title"] || row["item-name"] || "";
    const currency = row["currency"] || "INR";
    const productSizeTier = row["product-size-tier"] || row["size-tier"] || "";
    const rowMonth = row["month-of-charge"] || monthYear;

    if (!asin && !fnsku && !sku) continue;

    validRows++;

    // Track newly discovered FC from storage fee report
    if (fcCode && fcCode !== "UNKNOWN") {
      discoveredFcs.set(fcCode, {
        fcCode,
        countryCode: "IN",
        source: "REPORT_STORAGE_FEE",
      });
    }

    const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

    const avgQtyOnHand = num(row["average-quantity-on-hand"] || row["average_quantity_on_hand"]);
    const avgPendingRemoval = num(row["average-quantity-pending-removal"] || row["average_quantity_pending_removal"]);
    const totalAvgQty = num(row["total-average-quantity"] || row["total_average_quantity"]) || avgQtyOnHand;
    const estimatedFee = num(row["estimated-monthly-storage-fee"] || row["estimated_monthly_storage_fee"] || row["estimated-storage-fee"]);
    const itemVolume = num(row["item-volume"] || row["volume"] || row["volume-cubic-feet"] || row["estimated-total-item-volume"]);

    bulkOps.push({
      updateOne: {
        filter: {
          configId,
          profileId,
          monthYear: rowMonth,
          fcCode,
          asin,
          fnsku,
        },
        update: {
          $set: {
            sellerId,
            sku,
            productName,
            fulfillmentCenter: fcCode,
            averageQuantityOnHand: avgQtyOnHand,
            averageQuantityPendingRemoval: avgPendingRemoval,
            totalAverageQuantity: totalAvgQty,
            estimatedMonthlyStorageFee: estimatedFee,
            currency,
            volumeCubicFeet: itemVolume,
            productSizeTier,
          },
        },
        upsert: true,
      },
    });

    if (bulkOps.length >= BATCH_SIZE) {
      upsertedCount += bulkOps.length;
      await parallelBulkWrite(fcStorageFeeSchema, bulkOps.splice(0));
    }
  }

  if (bulkOps.length > 0) {
    upsertedCount += bulkOps.length;
    await parallelBulkWrite(fcStorageFeeSchema, bulkOps);
  }

  if (discoveredFcs.size > 0) {
    await registerDiscoveredWarehouses(Array.from(discoveredFcs.values()));
  }

  return { totalRows, validRows, upsertedCount };
}

// Helper: Sanitize and resolve profileId and configId
async function sanitizeProfileAndConfig(profileId, configId, user = null) {
  let cleanProfileId = null;
  if (profileId && typeof profileId === "object") {
    cleanProfileId = Number(profileId.value ?? profileId.profileId ?? (Array.isArray(profileId) ? profileId[0] : null));
  } else if (profileId) {
    cleanProfileId = Number(profileId);
  }

  let cleanConfigId = null;
  if (configId && typeof configId === "object") {
    cleanConfigId = configId.configId || configId._id || null;
  } else if (configId && typeof configId === "string") {
    cleanConfigId = configId.trim();
  }

  // If cleanConfigId is not valid ObjectId or missing, look up from profiles collection
  if ((!cleanConfigId || !mongoose.Types.ObjectId.isValid(cleanConfigId)) && cleanProfileId && !isNaN(cleanProfileId)) {
    try {
      const prof = await profilesSchema.findOne({ profileId: cleanProfileId }).select("configId").lean();
      if (prof?.configId) {
        cleanConfigId = String(prof.configId);
      }
    } catch (e) { }
  }

  // If cleanProfileId is missing or NaN, try to resolve from user permissions
  if ((!cleanProfileId || isNaN(cleanProfileId)) && user?._id) {
    try {
      const perm = await mongoose.model("profileBasedPermission").findOne({ userId: user._id, hasAccess: true }).lean();
      if (perm?.profileId) {
        cleanProfileId = Number(perm.profileId);
        if (!cleanConfigId && perm.configId) cleanConfigId = String(perm.configId);
      }
    } catch (e) { }
  }

  return { cleanProfileId, cleanConfigId };
}

exports.getFcInventoryCards = async (req, res) => {
  try {
    const { profileId, configId, date } = req.body;
    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);
    if (!cleanProfileId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Valid profileId is required.",
      });
    }

    const targetDate = await resolveReportDate(cleanProfileId, cleanConfigId, date);

    const matchQuery = {
      profileId: cleanProfileId,
      reportDate: targetDate,
    };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      matchQuery.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }

    // Aggregate ledger summary for the resolved date
    const aggResult = await fcInventoryLedgerSchema.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalEndingBalance: { $sum: "$endingWarehouseBalance" },
          totalInTransit: { $sum: "$inTransitBetweenWarehouses" },
          totalReceipts: { $sum: "$receipts" },
          totalCustomerShipments: { $sum: "$customerShipments" },
          totalCustomerReturns: { $sum: "$customerReturns" },
          totalDamaged: { $sum: "$damagedInventory" },
          totalLost: { $sum: "$lostInventory" },
          totalUnfulfillable: { $sum: "$unfulfillableBalance" },
          distinctFCs: { $addToSet: "$fcCode" },
          distinctSKUs: { $addToSet: "$sku" },
        },
      },
    ]);

    const stats = aggResult[0] || {
      totalEndingBalance: 0,
      totalInTransit: 0,
      totalReceipts: 0,
      totalCustomerShipments: 0,
      totalCustomerReturns: 0,
      totalDamaged: 0,
      totalLost: 0,
      totalUnfulfillable: 0,
      distinctFCs: [],
      distinctSKUs: [],
    };

    // Calculate current / latest month's estimated storage fee (using 16th cutoff rule)
    const defaultFeeMonth = getDefaultStorageFeeMonth(targetDate);
    const resolvedMonth = await resolveMonthYear(cleanProfileId, cleanConfigId, defaultFeeMonth);
    const feeMatch = {
      profileId: cleanProfileId,
      monthYear: resolvedMonth,
    };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      feeMatch.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }

    const feeResult = await fcStorageFeeSchema.aggregate([
      { $match: feeMatch },
      {
        $group: {
          _id: null,
          totalEstimatedFee: { $sum: "$estimatedMonthlyStorageFee" },
          totalVolumeCft: { $sum: "$volumeCubicFeet" },
        },
      },
    ]);

    const storageStats = feeResult[0] || { totalEstimatedFee: 0, totalVolumeCft: 0 };
    const latestAvailableDate = await getLatestReportDate(cleanProfileId, cleanConfigId);

    return res.status(200).json({
      isSuccess: true,
      message: "FC Inventory KPI cards fetched successfully.",
      data: {
        reportDate: targetDate,
        latestAvailableDate,
        totalUnits: stats.totalEndingBalance,
        totalActiveWarehouses: stats.distinctFCs.length,
        totalInTransitUnits: stats.totalInTransit,
        totalUnfulfillableUnits: stats.totalUnfulfillable || (stats.totalDamaged + stats.totalLost),
        totalReceiptsToday: stats.totalReceipts,
        totalShipmentsToday: stats.totalCustomerShipments,
        totalCustomerReturns: stats.totalCustomerReturns,
        totalUniqueSKUs: stats.distinctSKUs.length,
        estimatedMonthlyStorageFee: Math.round((storageStats.totalEstimatedFee || 0) * 100) / 100,
        totalVolumeCft: Math.round((storageStats.totalVolumeCft || 0) * 100) / 100,
        storageFeeMonth: resolvedMonth,
      },
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching FC cards.",
    });
  }
};


exports.getFcGeoDistribution = async (req, res) => {
  try {
    const { profileId, configId, date } = req.body;
    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);
    if (!cleanProfileId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Valid profileId is required.",
      });
    }

    const targetDate = await resolveReportDate(cleanProfileId, cleanConfigId, date);

    const matchQuery = {
      profileId: cleanProfileId,
      reportDate: targetDate,
    };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      matchQuery.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }

    // Aggregate by fulfillment center
    const fcAgg = await fcInventoryLedgerSchema.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$fcCode",
          totalUnits: { $sum: "$endingWarehouseBalance" },
          inTransit: { $sum: "$inTransitBetweenWarehouses" },
          unfulfillable: { $sum: "$unfulfillableBalance" },
          damaged: { $sum: "$damagedInventory" },
          receipts: { $sum: "$receipts" },
          customerShipments: { $sum: "$customerShipments" },
          skuCount: { $addToSet: "$sku" },
        },
      },
      { $sort: { totalUnits: -1 } },
    ]);

    // Enrich each FC with location details (City, State, Lat, Lng, Region)
    const enrichedFcList = [];
    const stateMap = {};

    for (const item of fcAgg) {
      const fcCode = item._id;
      const location = await resolveFcLocation(fcCode, "IN");

      const enriched = {
        fcCode,
        fcName: location.fcName,
        city: location.city,
        state: location.state,
        region: location.region,
        countryCode: location.countryCode,
        coordinates: location.coordinates,
        totalUnits: item.totalUnits,
        inTransit: item.inTransit,
        unfulfillable: item.unfulfillable,
        damaged: item.damaged,
        receipts: item.receipts,
        customerShipments: item.customerShipments,
        totalSkus: item.skuCount.length,
      };

      enrichedFcList.push(enriched);

      // Aggregate into State summary
      const stateKey = location.state || "Other";
      if (!stateMap[stateKey]) {
        stateMap[stateKey] = {
          state: stateKey,
          region: location.region,
          totalUnits: 0,
          inTransit: 0,
          unfulfillable: 0,
          warehouseCount: 0,
          warehouses: [],
          skus: new Set(),
        };
      }
      stateMap[stateKey].totalUnits += item.totalUnits;
      stateMap[stateKey].inTransit += item.inTransit;
      stateMap[stateKey].unfulfillable += item.unfulfillable;
      stateMap[stateKey].warehouseCount += 1;
      stateMap[stateKey].warehouses.push(fcCode);
      item.skuCount.forEach((s) => stateMap[stateKey].skus.add(s));
    }

    const stateDistribution = Object.values(stateMap).map((s) => ({
      state: s.state,
      region: s.region,
      totalUnits: s.totalUnits,
      inTransit: s.inTransit,
      unfulfillable: s.unfulfillable,
      warehouseCount: s.warehouseCount,
      warehouses: s.warehouses,
      totalSkus: s.skus.size,
    })).sort((a, b) => b.totalUnits - a.totalUnits);

    return res.status(200).json({
      isSuccess: true,
      message: "FC Geographic distribution fetched successfully.",
      data: {
        reportDate: targetDate,
        totalWarehouses: enrichedFcList.length,
        stateDistribution,
        fulfillmentCenters: enrichedFcList,
      },
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching geo distribution.",
    });
  }
};

/**
 * Helper to enrich FC items with imageURL and itemName from productListingSchema.
 */
async function enrichProductsWithListing(items, cleanProfileId, cleanConfigId) {
  if (!items || !items.length) return items;
  try {
    const asins = items.map((i) => i.asin).filter(Boolean);
    const skus = items.map((i) => i.sku).filter(Boolean);
    if (!asins.length && !skus.length) return items;

    const listingQuery = {
      profileId: cleanProfileId,
      $or: [
        ...(asins.length ? [{ asin: { $in: asins } }] : []),
        ...(skus.length ? [{ sku: { $in: skus } }] : []),
      ],
    };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      listingQuery.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }
    const listings = await productListingSchema
      .find(listingQuery, { asin: 1, sku: 1, imageURL: 1, imageUrl: 1, itemName: 1 })
      .lean();

    const listingBySku = new Map();
    const listingByAsin = new Map();
    for (const l of listings) {
      if (l.sku && !listingBySku.has(l.sku)) listingBySku.set(l.sku, l);
      if (l.asin && !listingByAsin.has(l.asin)) listingByAsin.set(l.asin, l);
    }

    for (const item of items) {
      const match = (item.sku && listingBySku.get(item.sku)) || (item.asin && listingByAsin.get(item.asin));
      if (match) {
        const img = match.imageURL || match.imageUrl || "";
        item.imageURL = img;
        item.imageUrl = img;
        if (!item.title && match.itemName) item.title = match.itemName;
        if (!item.productName && match.itemName) item.productName = match.itemName;
      }
    }
  } catch (err) {
    console.error("enrichProductsWithListing error:", err.message);
  }
  return items;
}

/**
 * @route POST /api/seller/warehouse/get-fc-grid
 * Returns paginated, searchable, filterable warehouse inventory grid.
 */
exports.getFcInventoryGrid = async (req, res) => {
  try {
    const {
      profileId,
      configId,
      date,
      fcCode,
      state,
      search,
      disposition,
      page = 1,
      limit: pageLimit = 25,
      sortBy = "endingWarehouseBalance",
      sortOrder = "desc",
    } = req.body;

    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);
    if (!cleanProfileId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Valid profileId is required.",
      });
    }

    const targetDate = await resolveReportDate(cleanProfileId, cleanConfigId, date);

    const matchQuery = {
      profileId: cleanProfileId,
      reportDate: targetDate,
    };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      matchQuery.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }

    if (fcCode && fcCode !== "ALL") {
      matchQuery.fcCode = fcCode.toUpperCase();
    }

    if (disposition && disposition !== "ALL") {
      matchQuery.disposition = disposition.toUpperCase();
    }

    if (search && search.trim()) {
      const cleanSearch = search.trim();
      matchQuery.$or = [
        { asin: { $regex: cleanSearch, $options: "i" } },
        { sku: { $regex: cleanSearch, $options: "i" } },
        { fnsku: { $regex: cleanSearch, $options: "i" } },
        { title: { $regex: cleanSearch, $options: "i" } },
        { fcCode: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const sortDirection = sortOrder.toLowerCase() === "asc" ? 1 : -1;
    const sortObj = { [sortBy]: sortDirection };

    const skip = (Number(page) - 1) * Number(pageLimit);

    const [items, totalCount] = await Promise.all([
      fcInventoryLedgerSchema.find(matchQuery).sort(sortObj).skip(skip).limit(Number(pageLimit)).lean(),
      fcInventoryLedgerSchema.countDocuments(matchQuery),
    ]);

    // Attach FC City, State and details
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const location = await resolveFcLocation(item.fcCode, item.countryCode);
        return {
          ...item,
          fcName: location.fcName,
          city: location.city,
          state: location.state,
          region: location.region,
        };
      })
    );

    await enrichProductsWithListing(enrichedItems, cleanProfileId, cleanConfigId);

    const latestAvailableDate = await getLatestReportDate(cleanProfileId, cleanConfigId);

    return res.status(200).json({
      isSuccess: true,
      message: "FC inventory grid data fetched successfully.",
      data: {
        totalRecords: totalCount,
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(pageLimit)),
        reportDate: targetDate,
        latestAvailableDate,
        items: enrichedItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching FC grid.",
    });
  }
};

/**
 * @route POST /api/seller/warehouse/get-fc-storage-fees
 * Returns storage fees breakdown by FC and ASIN.
 */
exports.getFcStorageFees = async (req, res) => {
  try {
    const { profileId, configId, monthYear, fcCode, page = 1, limit: pageLimit = 25 } = req.body;
    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);
    if (!cleanProfileId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Valid profileId is required.",
      });
    }

    const targetMonth = await resolveMonthYear(cleanProfileId, cleanConfigId, monthYear);
    const matchQuery = {
      profileId: cleanProfileId,
      monthYear: targetMonth,
    };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      matchQuery.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }

    if (fcCode && fcCode !== "ALL") {
      matchQuery.fcCode = fcCode.toUpperCase();
    }

    const skip = (Number(page) - 1) * Number(pageLimit);

    const [items, totalCount, summaryAgg] = await Promise.all([
      fcStorageFeeSchema.find(matchQuery).sort({ estimatedMonthlyStorageFee: -1 }).skip(skip).limit(Number(pageLimit)).lean(),
      fcStorageFeeSchema.countDocuments(matchQuery),
      fcStorageFeeSchema.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalFee: { $sum: "$estimatedMonthlyStorageFee" },
            totalUnits: { $sum: "$averageQuantityOnHand" },
            totalVolume: { $sum: "$volumeCubicFeet" },
          },
        },
      ]),
    ]);

    const summary = summaryAgg[0] || { totalFee: 0, totalUnits: 0, totalVolume: 0 };
    await enrichProductsWithListing(items, cleanProfileId, cleanConfigId);
    const availableMonths = await fcStorageFeeSchema.distinct("monthYear", { profileId: cleanProfileId });
    availableMonths.sort().reverse();

    return res.status(200).json({
      isSuccess: true,
      message: "Storage fee breakdown fetched successfully.",
      data: {
        monthYear: targetMonth,
        availableMonths,
        totalRecords: totalCount,
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(pageLimit)),
        summary: {
          totalEstimatedFee: Math.round(summary.totalFee * 100) / 100,
          totalAverageUnits: Math.round(summary.totalUnits),
          totalVolumeCubicFeet: Math.round(summary.totalVolume * 100) / 100,
        },
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching storage fees.",
    });
  }
};

/**
 * @route POST /api/seller/warehouse/sync-fc-storage-fees
 * Manually triggers SP-API report generation for FC Storage Fees for a given month.
 */
exports.syncFcStorageFees = async (req, res) => {
  try {
    const { profileId, configId, monthYear } = req.body;
    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);
    if (!cleanProfileId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Valid profileId is required.",
      });
    }

    const targetMonth = monthYear && /^\d{4}-\d{2}$/.test(monthYear)
      ? monthYear
      : getDefaultStorageFeeMonth();

    const startDate = `${targetMonth}-01`;
    const endDate = moment(startDate).endOf("month").format("YYYY-MM-DD");

    // Run report generator in background
    setImmediate(async () => {
      try {
        await exports.cronGenerateFcStorageFeeReport({
          profileId: cleanProfileId,
          configId: cleanConfigId,
          month: targetMonth,
          startDate,
          endDate,
          recurring: false,
        });
      } catch (err) {
        console.error("Error in background syncFcStorageFees:", err);
      }
    });

    return res.status(200).json({
      isSuccess: true,
      message: `Storage fee sync initiated for ${targetMonth}. SP-API report request submitted.`,
      data: {
        monthYear: targetMonth,
        startDate,
        endDate,
      },
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error triggering storage fee sync.",
    });
  }
};

/**
 * @route POST /api/seller/warehouse/get-fc-list
 * Returns list of distinct fulfillment centers for dropdown filters.
 */
exports.getFcList = async (req, res) => {
  try {
    const { profileId, configId } = req.body;
    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);

    // 1. Fetch all registered warehouses directly from fulfillmentCenter table & fulfillmentcentermasters
    const [dbWarehouses, masterWarehouses] = await Promise.all([
      fulfillmentCenterSchema.find({ isActive: true }).lean(),
      fulfillmentCenterMasterSchema.find().lean(),
    ]);

    // 2. Fetch distinct FC codes from current seller's ledger data
    const matchFilter = {};
    if (cleanProfileId) matchFilter.profileId = cleanProfileId;
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      matchFilter.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }
    const distinctLedgerCodes = await fcInventoryLedgerSchema.distinct("fcCode", matchFilter);

    const warehouseMap = new Map();

    // Populate from DB table
    for (const wh of dbWarehouses) {
      const locationText = wh.city || wh.state ? ` - ${wh.city ? `${wh.city}, ` : ""}${wh.state}` : "";
      warehouseMap.set(wh.fcCode, {
        fcCode: wh.fcCode,
        fcName: wh.fcName || `Amazon FC ${wh.fcCode}`,
        label: `${wh.fcCode}${locationText}`,
        city: wh.city || "Other",
        state: wh.state || "Other",
        region: wh.region || "Other",
        countryCode: wh.countryCode || "IN",
        source: wh.source || "AUTO_DETECTED",
      });
    }

    // Populate / enrich from master directory
    for (const m of masterWarehouses) {
      if (!warehouseMap.has(m.fcCode)) {
        const locationText = m.city || m.state ? ` - ${m.city ? `${m.city}, ` : ""}${m.state}` : "";
        warehouseMap.set(m.fcCode, {
          fcCode: m.fcCode,
          fcName: m.fcName || `Amazon FC ${m.fcCode}`,
          label: `${m.fcCode}${locationText}`,
          city: m.city || "Other",
          state: m.state || "Other",
          region: "Other",
          countryCode: m.country || "IN",
          source: m.source || "AMAZON_DIRECTORY",
        });
      } else {
        const existing = warehouseMap.get(m.fcCode);
        if ((!existing.city || existing.city === "Other") && m.city) existing.city = m.city;
        if ((!existing.state || existing.state === "Other") && m.state) existing.state = m.state;
        if ((!existing.fcName || existing.fcName === `Amazon FC ${existing.fcCode}`) && m.fcName) existing.fcName = m.fcName;
        const locationText = existing.city || existing.state ? ` - ${existing.city ? `${existing.city}, ` : ""}${existing.state}` : "";
        existing.label = `${existing.fcCode}${locationText}`;
      }
    }

    // Ensure any newly active ledger codes are also included and resolved
    for (const code of distinctLedgerCodes) {
      if (!warehouseMap.has(code)) {
        const loc = await resolveFcLocation(code, "IN");
        const locationText = loc.city || loc.state ? ` - ${loc.city ? `${loc.city}, ` : ""}${loc.state}` : "";
        warehouseMap.set(code, {
          fcCode: code,
          fcName: loc.fcName || `Amazon FC ${code}`,
          label: `${code}${locationText}`,
          city: loc.city || "Other",
          state: loc.state || "Other",
          region: loc.region || "Other",
          countryCode: loc.countryCode || "IN",
          source: "AUTO_DETECTED",
        });
      }
    }

    const fcDetails = Array.from(warehouseMap.values());
    fcDetails.sort((a, b) => a.fcCode.localeCompare(b.fcCode));

    return res.status(200).json({
      isSuccess: true,
      data: fcDetails,
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching FC list.",
    });
  }
};

/**
 * @route POST /api/seller/warehouse/warehouse-master-list
 * Returns all warehouses from fulfillmentCenter and fulfillmentcentermasters collections
 */
exports.getWarehouseMasterList = async (req, res) => {
  try {
    const { countryCode = "IN", search } = req.body;
    const matchQuery = { isActive: true };
    if (countryCode && countryCode !== "ALL") {
      matchQuery.countryCode = countryCode.toUpperCase();
    }
    if (search && search.trim()) {
      const cleanSearch = search.trim();
      matchQuery.$or = [
        { fcCode: { $regex: cleanSearch, $options: "i" } },
        { fcName: { $regex: cleanSearch, $options: "i" } },
        { city: { $regex: cleanSearch, $options: "i" } },
        { state: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const masterMatch = {};
    if (countryCode && countryCode !== "ALL") {
      masterMatch.country = countryCode.toUpperCase();
    }
    if (search && search.trim()) {
      const cleanSearch = search.trim();
      masterMatch.$or = [
        { fcCode: { $regex: cleanSearch, $options: "i" } },
        { fcName: { $regex: cleanSearch, $options: "i" } },
        { city: { $regex: cleanSearch, $options: "i" } },
        { state: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const [fcList, masterList] = await Promise.all([
      fulfillmentCenterSchema.find(matchQuery).lean(),
      fulfillmentCenterMasterSchema.find(masterMatch).lean(),
    ]);

    const mergedMap = new Map();
    for (const item of fcList) {
      mergedMap.set(item.fcCode, item);
    }

    for (const m of masterList) {
      if (!mergedMap.has(m.fcCode)) {
        mergedMap.set(m.fcCode, {
          _id: m._id,
          fcCode: m.fcCode,
          fcName: m.fcName || `Amazon FC ${m.fcCode}`,
          city: m.city || "Other",
          state: m.state || "Other",
          region: "Other",
          countryCode: m.country || "IN",
          pincode: m.postalCode || "",
          source: m.source || "AMAZON_DIRECTORY",
          isActive: true,
        });
      } else {
        const existing = mergedMap.get(m.fcCode);
        if ((!existing.city || existing.city === "Other") && m.city) existing.city = m.city;
        if ((!existing.state || existing.state === "Other") && m.state) existing.state = m.state;
        if ((!existing.fcName || existing.fcName === `Amazon FC ${existing.fcCode}`) && m.fcName) existing.fcName = m.fcName;
        if (!existing.pincode && m.postalCode) existing.pincode = m.postalCode;
      }
    }

    const list = Array.from(mergedMap.values()).sort((a, b) => a.fcCode.localeCompare(b.fcCode));

    return res.status(200).json({
      isSuccess: true,
      data: list,
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching warehouse master list.",
    });
  }
};

/**
 * @route POST /api/seller/warehouse/save-warehouse-location
 * Updates/enriches warehouse location details (city, state, region, pincode)
 */
exports.saveWarehouseLocation = async (req, res) => {
  try {
    const { fcCode, city, state, region, pincode, fcName, countryCode = "IN" } = req.body;
    if (!fcCode) {
      return res.status(200).json({
        isSuccess: false,
        message: "fcCode is required.",
      });
    }

    const cleanCode = String(fcCode).trim().toUpperCase();
    const updated = await fulfillmentCenterSchema.findOneAndUpdate(
      { fcCode: cleanCode, countryCode: countryCode.toUpperCase() },
      {
        $set: {
          city: city || "",
          state: state || "",
          region: region || "Other",
          pincode: pincode || "",
          fcName: fcName || `Amazon FC ${cleanCode}`,
          source: "USER_OVERRIDE",
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    // Also update fulfillmentcentermasters if present
    await fulfillmentCenterMasterSchema.updateOne(
      { fcCode: cleanCode },
      {
        $set: {
          city: city || "",
          state: state || "",
          fcName: fcName || `Amazon FC ${cleanCode}`,
          postalCode: pincode || "",
        },
      }
    ).catch(() => { });

    return res.status(200).json({
      isSuccess: true,
      message: "Warehouse location updated successfully.",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error saving warehouse location.",
    });
  }
};

/**
 * Helper: Find most recent date that has ledger data
 */
async function getLatestReportDate(profileId, configId) {
  const match = { profileId: Number(profileId) };
  if (configId && mongoose.Types.ObjectId.isValid(configId)) {
    match.configId = new mongoose.Types.ObjectId(configId);
  }

  let latestRecord = await fcInventoryLedgerSchema.findOne(match)
    .sort({ reportDate: -1 })
    .select("reportDate")
    .lean();

  if (!latestRecord && configId) {
    // Try profileId alone
    latestRecord = await fcInventoryLedgerSchema.findOne({ profileId: Number(profileId) })
      .sort({ reportDate: -1 })
      .select("reportDate")
      .lean();
  }

  return latestRecord?.reportDate || moment().subtract(1, "days").format("YYYY-MM-DD");
}

/**
 * Helper: Resolves report date. If requestedDate is provided, returns that exact date.
 * If not provided, falls back to the latest available report date in the ledger.
 */
async function resolveReportDate(profileId, configId, requestedDate) {
  if (requestedDate && typeof requestedDate === "string" && requestedDate.trim()) {
    return requestedDate.trim();
  }

  return await getLatestReportDate(profileId, configId);
}

/**
 * Helper: Computes the storage fee month based on the 16th cutoff rule:
 * - On or before the 16th of any month (day <= 16): Fee month is 2 months prior (e.g. Aug, 2026 until 16th Oct)
 * - After the 16th of any month (day > 16): Fee month is 1 month prior (e.g. Sep, 2026 from 17th Oct until 16th Nov)
 */
function getDefaultStorageFeeMonth(referenceDate = moment()) {
  const m = moment(referenceDate);
  return m.date() <= 16
    ? m.clone().subtract(2, "months").format("YYYY-MM")
    : m.clone().subtract(1, "months").format("YYYY-MM");
}
exports.getDefaultStorageFeeMonth = getDefaultStorageFeeMonth;

/**
 * Helper: Resolves the closest available storage fee month:
 * - If requestedMonth is provided in YYYY-MM format, uses it directly.
 * - Otherwise, checks the 16th cutoff default month.
 * - If DB has records for default month, returns it.
 * - Otherwise falls back to latest month present in DB, or default month.
 */
async function resolveMonthYear(profileId, configId, requestedMonth) {
  if (requestedMonth && typeof requestedMonth === "string" && /^\d{4}-\d{2}$/.test(requestedMonth.trim())) {
    return requestedMonth.trim();
  }

  const defaultMonth = getDefaultStorageFeeMonth();

  const match = { profileId: Number(profileId), monthYear: defaultMonth };
  if (configId && mongoose.Types.ObjectId.isValid(configId)) {
    match.configId = new mongoose.Types.ObjectId(configId);
  }

  const hasDefault = await fcStorageFeeSchema.exists(match);
  if (hasDefault) {
    return defaultMonth;
  }

  let latest = await fcStorageFeeSchema.findOne({ profileId: Number(profileId) })
    .sort({ monthYear: -1 })
    .select("monthYear")
    .lean();

  return latest?.monthYear || defaultMonth;
}

// ─── State-to-FC Mapping & Normalization for SKU Replenishment & MFN-to-FBA ──
const STATE_ALIAS_MAP = {
  tn: "Tamil Nadu",
  tamilnadu: "Tamil Nadu",
  "tamil nadu": "Tamil Nadu",
  chennai: "Tamil Nadu",
  wb: "West Bengal",
  westbengal: "West Bengal",
  "west bengal": "West Bengal",
  kolkata: "West Bengal",
  mh: "Maharashtra",
  maharashtra: "Maharashtra",
  maharastra: "Maharashtra",
  mumbai: "Maharashtra",
  pune: "Maharashtra",
  ka: "Karnataka",
  karnataka: "Karnataka",
  karnatka: "Karnataka",
  bangalore: "Karnataka",
  bengaluru: "Karnataka",
  kl: "Kerala",
  kerala: "Kerala",
  kochi: "Kerala",
  cochin: "Kerala",
  tg: "Telangana",
  ts: "Telangana",
  telangana: "Telangana",
  telengana: "Telangana",
  hyderabad: "Telangana",
  ap: "Andhra Pradesh",
  "andhra pradesh": "Andhra Pradesh",
  andhrapradesh: "Andhra Pradesh",
  dl: "Delhi",
  delhi: "Delhi",
  "new delhi": "Delhi",
  "nct of delhi": "Delhi",
  "delhi ncr": "Delhi",
  hr: "Haryana",
  haryana: "Haryana",
  gurugram: "Haryana",
  gurgaon: "Haryana",
  up: "Uttar Pradesh",
  "uttar pradesh": "Uttar Pradesh",
  uttarpradesh: "Uttar Pradesh",
  noida: "Uttar Pradesh",
  lucknow: "Uttar Pradesh",
  gj: "Gujarat",
  gujarat: "Gujarat",
  gujrat: "Gujarat",
  ahmedabad: "Gujarat",
  surat: "Gujarat",
  rj: "Rajasthan",
  rajasthan: "Rajasthan",
  jaipur: "Rajasthan",
  pb: "Punjab",
  punjab: "Punjab",
  mp: "Madhya Pradesh",
  "madhya pradesh": "Madhya Pradesh",
  madhyapradesh: "Madhya Pradesh",
  indore: "Madhya Pradesh",
  br: "Bihar",
  bihar: "Bihar",
  patna: "Bihar",
  od: "Odisha",
  or: "Odisha",
  odisha: "Odisha",
  orissa: "Odisha",
  as: "Assam",
  assam: "Assam",
  guwahati: "Assam",
  jh: "Jharkhand",
  jharkhand: "Jharkhand",
  cg: "Chhattisgarh",
  ct: "Chhattisgarh",
  chhattisgarh: "Chhattisgarh",
  chattisgarh: "Chhattisgarh",
  uk: "Uttarakhand",
  ut: "Uttarakhand",
  uttarakhand: "Uttarakhand",
  uttaranchal: "Uttarakhand",
  hp: "Himachal Pradesh",
  "himachal pradesh": "Himachal Pradesh",
  himachalpradesh: "Himachal Pradesh",
  jk: "Jammu and Kashmir",
  "jammu and kashmir": "Jammu and Kashmir",
  "jammu & kashmir": "Jammu and Kashmir",
  "j&k": "Jammu and Kashmir",
  ga: "Goa",
  goa: "Goa",
  ch: "Chandigarh",
  chandigarh: "Chandigarh",
  py: "Puducherry",
  puducherry: "Puducherry",
  pondicherry: "Puducherry",
  tr: "Tripura",
  tripura: "Tripura",
  ml: "Meghalaya",
  meghalaya: "Meghalaya",
  mn: "Manipur",
  manipur: "Manipur",
  nl: "Nagaland",
  nagaland: "Nagaland",
  ar: "Arunachal Pradesh",
  "arunachal pradesh": "Arunachal Pradesh",
  mz: "Mizoram",
  mizoram: "Mizoram",
  sk: "Sikkim",
  sikkim: "Sikkim",
  la: "Ladakh",
  ladakh: "Ladakh",
  an: "Andaman and Nicobar Islands",
  "andaman and nicobar islands": "Andaman and Nicobar Islands",
  "andaman & nicobar": "Andaman and Nicobar Islands",
  dd: "Dadra and Nagar Haveli and Daman and Diu",
  dn: "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
};

const STATE_TO_PRIMARY_FC = {
  "Tamil Nadu": { fcCode: "MAA4", city: "Chennai", region: "South" },
  Puducherry: { fcCode: "MAA4", city: "Chennai", region: "South" },
  "Andaman and Nicobar Islands": { fcCode: "MAA4", city: "Chennai", region: "South" },
  "West Bengal": { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Odisha: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Bihar: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Jharkhand: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Assam: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Meghalaya: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Tripura: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Manipur: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Mizoram: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Nagaland: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  "Arunachal Pradesh": { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Sikkim: { fcCode: "CCU1", city: "Kolkata", region: "East" },
  Maharashtra: { fcCode: "BOM7", city: "Mumbai / Bhiwandi", region: "West" },
  Goa: { fcCode: "BOM7", city: "Mumbai / Bhiwandi", region: "West" },
  "Madhya Pradesh": { fcCode: "BOM7", city: "Mumbai / Bhiwandi", region: "Central" },
  Chhattisgarh: { fcCode: "BOM7", city: "Mumbai / Bhiwandi", region: "Central" },
  Karnataka: { fcCode: "BLR5", city: "Bengaluru", region: "South" },
  Kerala: { fcCode: "VCMK", city: "Coimbatore / Kerala Hub", region: "South" },
  Lakshadweep: { fcCode: "VCMK", city: "Coimbatore / Kerala Hub", region: "South" },
  Telangana: { fcCode: "HYD8", city: "Hyderabad", region: "South" },
  "Andhra Pradesh": { fcCode: "HYD8", city: "Hyderabad", region: "South" },
  Delhi: { fcCode: "DEL4", city: "Delhi NCR", region: "North" },
  "Uttar Pradesh": { fcCode: "DEL4", city: "Delhi NCR", region: "North" },
  Uttarakhand: { fcCode: "DEL4", city: "Delhi NCR", region: "North" },
  Haryana: { fcCode: "DED3", city: "Gurugram / Bilaspur", region: "North" },
  Punjab: { fcCode: "DED3", city: "Gurugram / Bilaspur", region: "North" },
  Chandigarh: { fcCode: "DED3", city: "Gurugram / Bilaspur", region: "North" },
  "Himachal Pradesh": { fcCode: "DED3", city: "Gurugram / Bilaspur", region: "North" },
  "Jammu and Kashmir": { fcCode: "DED3", city: "Gurugram / Bilaspur", region: "North" },
  Ladakh: { fcCode: "DED3", city: "Gurugram / Bilaspur", region: "North" },
  Gujarat: { fcCode: "AMD2", city: "Ahmedabad", region: "West" },
  "Dadra and Nagar Haveli and Daman and Diu": { fcCode: "AMD2", city: "Ahmedabad", region: "West" },
  Rajasthan: { fcCode: "JAI2", city: "Jaipur", region: "North" },
};

const FC_CODE_DEFAULT_STATE = {
  AMD1: "Gujarat",
  AMD2: "Gujarat",
  STV1: "Gujarat",
  BLR1: "Karnataka",
  BLR2: "Karnataka",
  BLR4: "Karnataka",
  BLR5: "Karnataka",
  BLR7: "Karnataka",
  BLR8: "Karnataka",
  BOM1: "Maharashtra",
  BOM3: "Maharashtra",
  BOM4: "Maharashtra",
  BOM5: "Maharashtra",
  BOM7: "Maharashtra",
  PNQ1: "Maharashtra",
  PNQ2: "Maharashtra",
  PNQ3: "Maharashtra",
  NAG1: "Maharashtra",
  NAX1: "Maharashtra",
  HYD1: "Telangana",
  HYD2: "Telangana",
  HYD3: "Telangana",
  HYD7: "Telangana",
  HYD8: "Telangana",
  MAA1: "Tamil Nadu",
  MAA2: "Tamil Nadu",
  MAA4: "Tamil Nadu",
  CJB1: "Tamil Nadu",
  VCMK: "Kerala",
  COK1: "Kerala",
  DEL1: "Delhi",
  DEX3: "Delhi",
  DEL2: "Haryana",
  DEL4: "Haryana",
  DEL5: "Haryana",
  DED1: "Haryana",
  DED3: "Haryana",
  DED4: "Haryana",
  GGN1: "Haryana",
  CCU1: "West Bengal",
  CCU2: "West Bengal",
  JAI1: "Rajasthan",
  JAI2: "Rajasthan",
  LKO1: "Uttar Pradesh",
  GNZ1: "Uttar Pradesh",
  PAT1: "Bihar",
  IDR1: "Madhya Pradesh",
  BHO1: "Madhya Pradesh",
  ATQ1: "Punjab",
  LUD1: "Punjab",
  CHD1: "Chandigarh",
  BBI1: "Odisha",
  GAU1: "Assam",
  VTZ1: "Andhra Pradesh",
  VGA1: "Andhra Pradesh",
  RPR1: "Chhattisgarh",
};

const FC_PREFIX_STATE_MAP = {
  AMD: "Gujarat",
  STV: "Gujarat",
  BLR: "Karnataka",
  BOM: "Maharashtra",
  PNQ: "Maharashtra",
  NAG: "Maharashtra",
  NAX: "Maharashtra",
  HYD: "Telangana",
  MAA: "Tamil Nadu",
  CJB: "Tamil Nadu",
  VCM: "Kerala",
  COK: "Kerala",
  DEL: "Haryana",
  DED: "Haryana",
  GGN: "Haryana",
  DEX: "Delhi",
  CCU: "West Bengal",
  JAI: "Rajasthan",
  LKO: "Uttar Pradesh",
  GNZ: "Uttar Pradesh",
  PAT: "Bihar",
  IDR: "Madhya Pradesh",
  BHO: "Madhya Pradesh",
  ATQ: "Punjab",
  LUD: "Punjab",
  CHD: "Chandigarh",
  BBI: "Odisha",
  GAU: "Assam",
  VTZ: "Andhra Pradesh",
  VGA: "Andhra Pradesh",
  RPR: "Chhattisgarh",
};

function resolveStateFromPincodePrefix(pincode) {
  if (!pincode) return null;
  const digits = String(pincode).replace(/\D/g, "");
  if (digits.length < 2) return null;
  const p2 = parseInt(digits.slice(0, 2), 10);
  const p3 = digits.length >= 3 ? parseInt(digits.slice(0, 3), 10) : null;
  if (p2 === 11) return "Delhi";
  if (p2 >= 12 && p2 <= 13) return "Haryana";
  if (p2 >= 14 && p2 <= 16) return "Punjab";
  if (p2 === 17) return "Himachal Pradesh";
  if (p2 >= 18 && p2 <= 19) return "Jammu and Kashmir";
  if (p3 && p3 >= 244 && p3 <= 249) return "Uttarakhand";
  if (p2 >= 20 && p2 <= 28) return "Uttar Pradesh";
  if (p2 >= 30 && p2 <= 34) return "Rajasthan";
  if (p2 >= 36 && p2 <= 39) return "Gujarat";
  if (p3 === 403) return "Goa";
  if (p2 >= 40 && p2 <= 44) return "Maharashtra";
  if (p2 >= 45 && p2 <= 48) return "Madhya Pradesh";
  if (p2 === 49) return "Chhattisgarh";
  if (p2 === 50) return "Telangana";
  if (p2 >= 51 && p2 <= 53) return "Andhra Pradesh";
  if (p2 >= 56 && p2 <= 59) return "Karnataka";
  if (p2 >= 60 && p2 <= 64) return "Tamil Nadu";
  if (p2 >= 67 && p2 <= 69) return "Kerala";
  if (p2 >= 70 && p2 <= 74) return "West Bengal";
  if (p2 >= 75 && p2 <= 77) return "Odisha";
  if (p2 === 78) return "Assam";
  if (p2 === 79) return "Meghalaya";
  if (p3 && p3 >= 814 && p3 <= 835) return "Jharkhand";
  if (p2 >= 80 && p2 <= 85) return "Bihar";
  return null;
}

function normalizeIndianState(rawState, postalCode, cacheMap = {}) {
  if (rawState && typeof rawState === "string") {
    const cleaned = rawState
      .trim()
      .replace(/[.,_-]+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (cleaned && cleaned !== "unknown" && cleaned !== "null" && cleaned !== "n/a" && cleaned !== "other") {
      if (STATE_ALIAS_MAP[cleaned]) {
        return STATE_ALIAS_MAP[cleaned];
      }
      // Title-case fallback
      const titleCased = cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
      if (STATE_TO_PRIMARY_FC[titleCased]) {
        return titleCased;
      }
    }
  }

  const cleanPin = postalCode ? String(postalCode).trim() : "";
  if (cleanPin && cacheMap[cleanPin]?.state) {
    const cachedClean = String(cacheMap[cleanPin].state).trim().toLowerCase();
    if (STATE_ALIAS_MAP[cachedClean]) return STATE_ALIAS_MAP[cachedClean];
    return String(cacheMap[cleanPin].state)
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const prefixState = resolveStateFromPincodePrefix(cleanPin);
  if (prefixState) return prefixState;

  if (
    rawState &&
    String(rawState).trim() &&
    !["unknown", "other", "null", "n/a"].includes(String(rawState).trim().toLowerCase())
  ) {
    return String(rawState)
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return "Unknown";
}

function resolveStateForFcCode(fcCode, dbWhMap = new Map(), masterWhMap = new Map()) {
  const cleanCode = String(fcCode || "").trim().toUpperCase();
  if (!cleanCode) return "Unknown";

  const dbWh = dbWhMap.get(cleanCode);
  const masterWh = masterWhMap.get(cleanCode);

  // VCMK serves as the primary Kerala hub in Amazon India unless explicitly overridden by user
  if (cleanCode === "VCMK" && dbWh?.source !== "USER_OVERRIDE") {
    return "Kerala";
  }

  const rawState =
    (dbWh?.state && dbWh.state !== "Other" ? dbWh.state : "") ||
    (masterWh?.state && masterWh.state !== "Other" ? masterWh.state : "") ||
    (dbWh?.city && dbWh.city !== "Other" ? dbWh.city : "") ||
    (masterWh?.city && masterWh.city !== "Other" ? masterWh.city : "");
  const rawPin = dbWh?.pincode || masterWh?.postalCode || "";

  const normalized = normalizeIndianState(rawState, rawPin);
  if (normalized && normalized !== "Unknown") {
    return normalized;
  }

  if (FC_CODE_DEFAULT_STATE[cleanCode]) {
    return FC_CODE_DEFAULT_STATE[cleanCode];
  }

  const prefix = cleanCode.slice(0, 3);
  if (FC_PREFIX_STATE_MAP[prefix]) {
    return FC_PREFIX_STATE_MAP[prefix];
  }

  return "Unknown";
}

/**
 * @route POST /api/seller/warehouse/get-sku-fc-matrix
 * Product-wise FC matrix (State-wise Order Report + FC Inventory Ledger Stock):
 *  1. Orders : Delivered/Shipped orders from Order Report (`orderDetailsModel`), excluding
 *              Cancelled & Returned (`returnSchema`) orders, grouped by (SKU + Customer State).
 *  2. Stock  : SELLABLE `endingWarehouseBalance` on the snapshot date from FC Inventory Ledger (`per SKU + FC`).
 *  3. Lookup : Each FC maps to its State; `fc.orders` = state-wise order quantity for `(SKU, fcState)`.
 *  4. Send   : `max(0, fc.orders - fc.stock)` -> units to replenish into that FC.
 */
exports.getFcSkuMatrix = async (req, res) => {
  try {
    const {
      profileId,
      configId,
      date,
      fromDate,
      toDate,
      days = 30,
      fcCode,
      search,
      page = 1,
      limit: pageLimit = 25,
    } = req.body;

    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);
    if (!cleanProfileId) {
      return res.status(200).json({ isSuccess: false, message: "Valid profileId is required." });
    }

    const hasCustomRange =
      fromDate &&
      toDate &&
      moment(fromDate, "YYYY-MM-DD", true).isValid() &&
      moment(toDate, "YYYY-MM-DD", true).isValid();

    let periodDays = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
    if (hasCustomRange) {
      periodDays = Math.max(
        1,
        moment(toDate).startOf("day").diff(moment(fromDate).startOf("day"), "days") + 1
      );
    }

    const latestLedgerDate = await getLatestReportDate(cleanProfileId, cleanConfigId);
    const targetDate = await resolveReportDate(cleanProfileId, cleanConfigId, date);

    const baseMatch = { profileId: cleanProfileId };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      baseMatch.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }

    const profile = await profilesSchema.findOne(baseMatch).select("timezone").lean();
    const timezone = profile?.timezone || "Asia/Kolkata";
    const yesterday = moment().tz(timezone).subtract(1, "day").format("YYYY-MM-DD");
    const completedSnapshotDate = targetDate < yesterday ? targetDate : yesterday;

    const ledgerStartDate = hasCustomRange
      ? moment(fromDate).format("YYYY-MM-DD")
      : moment(completedSnapshotDate).subtract(periodDays - 1, "days").format("YYYY-MM-DD");
    const ledgerEndDate = hasCustomRange
      ? moment(toDate).format("YYYY-MM-DD")
      : completedSnapshotDate;

    // 1. Fetch FC-wise Stock on snapshot date + active FCs & SKUs from ledger
    const [stockRows, ledgerOrderRows, dbWarehouses, masterWarehouses] = await Promise.all([
      fcInventoryLedgerSchema.aggregate([
        { $match: { ...baseMatch, reportDate: targetDate, disposition: "SELLABLE" } },
        {
          $group: {
            _id: { sku: "$sku", fc: "$fcCode" },
            asin: { $first: "$asin" },
            title: { $first: "$title" },
            stock: { $sum: "$endingWarehouseBalance" },
          },
        },
      ]),
      fcInventoryLedgerSchema.aggregate([
        { $match: { ...baseMatch, reportDate: { $gte: ledgerStartDate, $lte: ledgerEndDate } } },
        {
          $group: {
            _id: { sku: "$sku", fc: "$fcCode" },
            asin: { $first: "$asin" },
            title: { $first: "$title" },
            orders: { $sum: { $abs: "$customerShipments" } },
          },
        },
      ]),
      fulfillmentCenterSchema.find({ isActive: true }).lean(),
      fulfillmentCenterMasterSchema.find().lean(),
    ]);

    const dbWhMap = new Map();
    for (const w of dbWarehouses) {
      if (w.fcCode) dbWhMap.set(String(w.fcCode).trim().toUpperCase(), w);
    }
    const masterWhMap = new Map();
    for (const m of masterWarehouses) {
      if (m.fcCode) masterWhMap.set(String(m.fcCode).trim().toUpperCase(), m);
    }

    const skuMap = new Map();
    const fcSet = new Set();
    const getRow = (sku, asin, title) => {
      if (!skuMap.has(sku)) {
        skuMap.set(sku, { sku, asin: asin || "", title: title || "", fcs: {} });
      }
      const row = skuMap.get(sku);
      if (!row.asin && asin) row.asin = asin;
      if (!row.title && title) row.title = title;
      return row;
    };
    const getFc = (row, fc) => {
      if (!row.fcs[fc]) row.fcs[fc] = { stock: 0, orders: 0, send: 0, ledgerOrders: 0 };
      return row.fcs[fc];
    };

    for (const r of stockRows) {
      if (!r._id?.sku || !r._id?.fc) continue;
      fcSet.add(r._id.fc);
      getFc(getRow(r._id.sku, r.asin, r.title), r._id.fc).stock += r.stock || 0;
    }
    for (const r of ledgerOrderRows) {
      if (!r._id?.sku || !r._id?.fc) continue;
      fcSet.add(r._id.fc);
      getFc(getRow(r._id.sku, r.asin, r.title), r._id.fc).ledgerOrders += r.orders || 0;
    }

    // Resolve each FC's state
    const fcStateMap = new Map();
    for (const fc of fcSet) {
      fcStateMap.set(fc, resolveStateForFcCode(fc, dbWhMap, masterWhMap));
    }

    // 2. Fetch Delivered/Shipped Orders from Order Report (`orderDetailsModel`), excluding Cancelled & Returned
    let orderEndDateStr = targetDate;
    let orderStartDateStr = moment(orderEndDateStr)
      .subtract(periodDays - 1, "days")
      .format("YYYY-MM-DD");

    if (hasCustomRange) {
      orderStartDateStr = moment(fromDate).format("YYYY-MM-DD");
      orderEndDateStr = moment(toDate).format("YYYY-MM-DD");
    } else {
      if (!date || targetDate >= latestLedgerDate) {
        const latestOrderDoc = await orderDetailsModel
          .findOne(baseMatch)
          .sort({ orderCreatedTime: -1 })
          .select("orderCreatedTime")
          .lean();
        if (latestOrderDoc?.orderCreatedTime) {
          const latestOrderStr = moment(latestOrderDoc.orderCreatedTime).tz(timezone).format("YYYY-MM-DD");
          if (latestOrderStr > orderEndDateStr) {
            orderEndDateStr = latestOrderStr;
          }
        }
      }
      orderEndDateStr = orderEndDateStr < yesterday ? orderEndDateStr : yesterday;
      orderStartDateStr = moment(orderEndDateStr)
        .subtract(periodDays - 1, "days")
        .format("YYYY-MM-DD");
    }

    const orderQuery = {
      ...baseMatch,
      orderCreatedTime: {
        $gte: moment.tz(orderStartDateStr, timezone).startOf("day").toDate(),
        $lte: moment.tz(orderEndDateStr, timezone).endOf("day").toDate(),
      },
      $or: [
        {
          orderStatus: {
            $in: [
              "SHIPPED",
              "Shipped",
              "shipped",
              "FULFILLED",
              "Fulfilled",
              "fulfilled",
              "SHIPPING",
              "Shipping",
              "shipping",
              "DELIVERED",
              "Delivered",
              "delivered",
            ],
          },
        },
        { orderStatus: { $regex: /^(SHIPPED|DELIVERED|FULFILLED)\s*-/i } },
      ],
    };

    const deliveredOrders = await orderDetailsModel
      .find(orderQuery)
      .select(
        "orderId orderStatus fulfillment.fulfilledBy recipient.deliveryAddress.stateOrRegion recipient.deliveryAddress.postalCode recipient.deliveryAddress.city orderItems"
      )
      .lean();

    // Fetch returned orders from returnSchema for the matched delivered orders to remove returned items
    const deliveredOrderIds = deliveredOrders.map((o) => o.orderId).filter(Boolean);
    const returnByOrderSku = new Map();
    const returnByOrderAsin = new Map();
    const returnedOrderFullSet = new Set();

    if (deliveredOrderIds.length > 0) {
      const returnMatch = {
        profileId: cleanProfileId,
        orderId: { $in: deliveredOrderIds },
      };
      if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
        returnMatch.configId = new mongoose.Types.ObjectId(cleanConfigId);
      }

      const returnDocs = await returnSchema
        .find(returnMatch)
        .select("orderId merchantSku asin returnQuantity")
        .lean();

      for (const ret of returnDocs) {
        const oid = String(ret.orderId || "").trim();
        if (!oid) continue;
        const rQty = Math.max(1, Number(ret.returnQuantity || 1));
        const rSku = String(ret.merchantSku || "").trim();
        const rAsin = String(ret.asin || "").trim();
        if (rSku) {
          const k = `${oid}|||${rSku}`;
          returnByOrderSku.set(k, (returnByOrderSku.get(k) || 0) + rQty);
        } else if (rAsin) {
          const k = `${oid}|||${rAsin}`;
          returnByOrderAsin.set(k, (returnByOrderAsin.get(k) || 0) + rQty);
        } else {
          returnedOrderFullSet.add(oid);
        }
      }
    }

    // Batch lookup pincodes where stateOrRegion is missing/unknown
    const missingPins = new Set();
    for (const ord of deliveredOrders) {
      const st = ord.recipient?.deliveryAddress?.stateOrRegion;
      const pin = ord.recipient?.deliveryAddress?.postalCode?.trim();
      if ((!st || String(st).trim().toLowerCase() === "unknown") && pin) {
        missingPins.add(pin);
      }
    }
    const pinCacheMap = {};
    if (missingPins.size > 0) {
      const cachedPins = await postalCodeStateModel
        .find({ pincode: { $in: Array.from(missingPins) } })
        .lean();
      for (const item of cachedPins) {
        if (item.pincode && item.state) {
          pinCacheMap[item.pincode] = { state: item.state, city: item.city || "" };
        }
      }
    }

    // 3. Aggregate state-wise order quantity per (SKU + State)
    const skuStateOrdersMap = new Map(); // sku -> Map(state -> netQty)
    let hasOrderReportData = false;

    for (const ord of deliveredOrders) {
      const oid = String(ord.orderId || "").trim();
      if (oid && returnedOrderFullSet.has(oid)) continue;

      const rawState = ord.recipient?.deliveryAddress?.stateOrRegion;
      const rawCity = ord.recipient?.deliveryAddress?.city;
      const pin = ord.recipient?.deliveryAddress?.postalCode;
      const normalizedState = normalizeIndianState(rawState || rawCity, pin, pinCacheMap);
      if (!normalizedState || normalizedState === "Unknown") continue;

      const isFbaOrder = ["AMAZON", "AFN", "FBA"].includes(
        String(ord.fulfillment?.fulfilledBy || "").trim().toUpperCase()
      );

      const items = Array.isArray(ord.orderItems) ? ord.orderItems : [];
      for (const item of items) {
        const sku = String(item?.product?.sellerSku || "").trim();
        if (!sku) continue;
        const rawQty = Number(item?.quantityOrdered || 0);
        if (rawQty <= 0) continue;

        const asin = String(item?.product?.asin || "").trim();
        const title = String(item?.product?.title || "").trim();

        // Subtract returned quantity if this order item was returned
        let netQty = rawQty;
        if (oid) {
          const skuKey = `${oid}|||${sku}`;
          const asinKey = `${oid}|||${asin}`;
          if (returnByOrderSku.has(skuKey)) {
            const remRet = returnByOrderSku.get(skuKey);
            const deduct = Math.min(netQty, remRet);
            netQty -= deduct;
            if (remRet - deduct > 0) returnByOrderSku.set(skuKey, remRet - deduct);
            else returnByOrderSku.delete(skuKey);
          } else if (asin && returnByOrderAsin.has(asinKey)) {
            const remRet = returnByOrderAsin.get(asinKey);
            const deduct = Math.min(netQty, remRet);
            netQty -= deduct;
            if (remRet - deduct > 0) returnByOrderAsin.set(asinKey, remRet - deduct);
            else returnByOrderAsin.delete(asinKey);
          }
        }
        if (netQty <= 0) continue;

        hasOrderReportData = true;
        if (!skuStateOrdersMap.has(sku)) {
          skuStateOrdersMap.set(sku, new Map());
        }
        const stateMapForSku = skuStateOrdersMap.get(sku);
        stateMapForSku.set(normalizedState, (stateMapForSku.get(normalizedState) || 0) + netQty);

        // Ensure FBA SKUs with orders are present in skuMap even if stock on targetDate is 0
        if (skuMap.has(sku) || isFbaOrder) {
          getRow(sku, asin, title);
        }
      }
    }

    // 4. Populate FC-wise Orders (from State-wise Order Report lookup) & Send = max(0, Orders - Stock)
    const allFcCodes = Array.from(fcSet).sort();
    for (const row of skuMap.values()) {
      const stateMapForSku = skuStateOrdersMap.get(row.sku);
      for (const fc of allFcCodes) {
        const cell = getFc(row, fc);
        if (hasOrderReportData) {
          const fcState = fcStateMap.get(fc);
          cell.orders = fcState && stateMapForSku ? stateMapForSku.get(fcState) || 0 : 0;
        } else {
          cell.orders = cell.ledgerOrders || 0;
        }
        cell.send = Math.max(0, cell.orders - cell.stock);
      }
    }

    const selectedFc = fcCode && fcCode !== "ALL" ? String(fcCode).toUpperCase() : null;

    let rows = Array.from(skuMap.values()).map((row) => {
      let totalStock = 0;
      let totalOrders = 0;
      let totalSend = 0;
      for (const [fc, v] of Object.entries(row.fcs)) {
        if (selectedFc && fc !== selectedFc) continue;
        v.send = Math.max(0, v.orders - v.stock);
        totalStock += v.stock;
        totalOrders += v.orders;
        totalSend += v.send;
      }
      return {
        ...row,
        totalStock,
        totalOrders,
        totalSend,
        avgDailyOrders: Math.round((totalOrders / periodDays) * 100) / 100,
      };
    });

    if (selectedFc) {
      rows = rows.filter((r) => r.fcs[selectedFc] && (r.fcs[selectedFc].stock > 0 || r.fcs[selectedFc].orders > 0));
    }

    // Enrich with product listing titles/ASINs before applying search filter so title/ASIN search is complete
    await enrichProductsWithListing(rows, cleanProfileId, cleanConfigId);

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.sku && r.sku.toLowerCase().includes(s)) ||
          (r.asin && r.asin.toLowerCase().includes(s)) ||
          (r.title && r.title.toLowerCase().includes(s))
      );
    }

    rows.sort((a, b) => b.totalOrders - a.totalOrders || b.totalStock - a.totalStock);

    const totalRecords = rows.length;
    const isExportAll = String(pageLimit).toUpperCase() === 'ALL' || Number(pageLimit) >= 5000;
    const effectiveLimit = isExportAll ? Math.max(totalRecords, 1) : Number(pageLimit) || 25;
    const skip = isExportAll ? 0 : (Number(page) - 1) * effectiveLimit;
    const items = rows.slice(skip, skip + effectiveLimit);

    const fcStatesObj = {};
    for (const [fc, st] of fcStateMap.entries()) {
      fcStatesObj[fc] = st;
    }

    return res.status(200).json({
      isSuccess: true,
      message: "SKU FC matrix fetched successfully.",
      data: {
        totalRecords,
        currentPage: Number(page),
        reportDate: targetDate,
        periodDays,
        periodStart: orderStartDateStr,
        periodEnd: orderEndDateStr,
        fcCodes: allFcCodes,
        fcStates: fcStatesObj,
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching SKU FC matrix.",
    });
  }
};

/**
 * @route POST /api/seller/warehouse/get-mfn-fba-recommendations
 * Analyzes state-wise sales for MFN SKUs and recommends appropriate FBA Fulfillment Centers (FC)
 * closer to high-demand states along with Suggested Qty to Send.
 */
exports.getMfnToFbaRecommendations = async (req, res) => {
  try {
    const {
      profileId,
      configId,
      fromDate,
      toDate,
      days = 30,
      sendPercentage = 70,
      minUnits = 1,
      fulfillmentFilter = "MFN",
      state: filterState,
      fcCode: filterFcCode,
      search,
      sortBy = "unitsSold",
      sortOrder = "desc",
      page = 1,
      limit: pageLimit = 25,
    } = req.body;

    const { cleanProfileId, cleanConfigId } = await sanitizeProfileAndConfig(profileId, configId, req.user);
    if (!cleanProfileId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Valid profileId is required.",
      });
    }

    const baseMatch = { profileId: cleanProfileId };
    if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
      baseMatch.configId = new mongoose.Types.ObjectId(cleanConfigId);
    }

    // Exclude cancelled / unfulfillable orders
    baseMatch.orderStatus = {
      $nin: [
        "CANCELLED",
        "Cancelled",
        "cancelled",
        "CANCELED",
        "Canceled",
        "canceled",
        "UNFULFILLABLE",
        "Unfulfillable",
        "unfulfillable",
      ],
    };

    // Filter for MFN orders by default (unless ALL is explicitly requested)
    if (String(fulfillmentFilter || "MFN").toUpperCase() === "MFN") {
      baseMatch["fulfillment.fulfilledBy"] = {
        $nin: ["AMAZON", "AFN", "FBA", "Amazon", "amazon", "afn", "fba"],
      };
    }

    const profile = await profilesSchema.findOne({ profileId: cleanProfileId }).select("timezone").lean();
    const timezone = profile?.timezone || "Asia/Kolkata";

    // Resolve date window
    let resolvedStart = null;
    let resolvedEnd = null;

    if (fromDate && toDate) {
      resolvedStart = moment.tz(fromDate, timezone).startOf("day").toDate();
      resolvedEnd = moment.tz(toDate, timezone).endOf("day").toDate();
    } else if (String(days).toUpperCase() !== "ALL") {
      const periodDays = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
      const end = moment().tz(timezone).subtract(1, "day");
      resolvedEnd = end.clone().endOf("day").toDate();
      resolvedStart = end.clone().subtract(periodDays - 1, "days").startOf("day").toDate();
    }

    const queryMatch = { ...baseMatch };
    if (resolvedStart && resolvedEnd) {
      queryMatch.orderCreatedTime = { $gte: resolvedStart, $lte: resolvedEnd };
    }

    let orders = await orderDetailsModel
      .find(queryMatch)
      .select(
        "orderId orderCreatedTime fulfillment.fulfilledBy recipient.deliveryAddress.stateOrRegion recipient.deliveryAddress.postalCode recipient.deliveryAddress.city orderItems"
      )
      .lean();

    // Collect pincodes where stateOrRegion is missing/unknown to batch lookup from postalCodeStateModel
    const missingStatePincodes = new Set();
    for (const ord of orders) {
      const st = ord.recipient?.deliveryAddress?.stateOrRegion;
      const pin = ord.recipient?.deliveryAddress?.postalCode?.trim();
      if ((!st || String(st).trim().toLowerCase() === "unknown") && pin) {
        missingStatePincodes.add(pin);
      }
    }

    const pinCacheMap = {};
    if (missingStatePincodes.size > 0) {
      const cachedPins = await postalCodeStateModel
        .find({ pincode: { $in: Array.from(missingStatePincodes) } })
        .lean();
      for (const item of cachedPins) {
        if (item.pincode && item.state) {
          pinCacheMap[item.pincode] = { state: item.state, city: item.city || "" };
        }
      }
    }

    // Load registered FCs from DB to enrich FC metadata
    const [dbFcs, masterFcs] = await Promise.all([
      fulfillmentCenterSchema.find({ isActive: true }).lean(),
      fulfillmentCenterMasterSchema.find().lean(),
    ]);
    const fcMetaMap = new Map();
    for (const m of masterFcs) {
      fcMetaMap.set(m.fcCode, {
        fcCode: m.fcCode,
        fcName: m.fcName || `Amazon FC ${m.fcCode}`,
        city: m.city || "",
        state: m.state || "",
      });
    }
    for (const d of dbFcs) {
      const existing = fcMetaMap.get(d.fcCode) || {};
      fcMetaMap.set(d.fcCode, {
        fcCode: d.fcCode,
        fcName: d.fcName || existing.fcName || `Amazon FC ${d.fcCode}`,
        city: d.city && d.city !== "Other" ? d.city : existing.city || "",
        state: d.state && d.state !== "Other" ? d.state : existing.state || "",
        region: d.region || existing.region || "",
      });
    }

    // Aggregate by (SKU + State)
    const skuStateMap = new Map();
    for (const ord of orders) {
      const rawState = ord.recipient?.deliveryAddress?.stateOrRegion;
      const pin = ord.recipient?.deliveryAddress?.postalCode;
      const normalizedState = normalizeIndianState(rawState, pin, pinCacheMap);
      if (!normalizedState || normalizedState === "Unknown") continue;

      const items = Array.isArray(ord.orderItems) ? ord.orderItems : [];
      for (const item of items) {
        const sku = String(item?.product?.sellerSku || "").trim();
        if (!sku) continue;
        const qty = Number(item?.quantityOrdered || 0);
        if (qty <= 0) continue;

        const asin = String(item?.product?.asin || "").trim();
        const title = String(item?.product?.title || "").trim();
        const price = Number(item?.product?.price || 0);

        const key = `${sku}|||${normalizedState}`;
        if (!skuStateMap.has(key)) {
          const primaryFcObj = STATE_TO_PRIMARY_FC[normalizedState] || {
            fcCode: "BOM7",
            city: normalizedState,
            region: "Other",
          };
          const fcCode = primaryFcObj.fcCode;
          const dbMeta = fcMetaMap.get(fcCode);

          skuStateMap.set(key, {
            sku,
            asin,
            title,
            state: normalizedState,
            region: primaryFcObj.region || dbMeta?.region || "Other",
            unitsSold: 0,
            ordersCount: 0,
            revenue: 0,
            orderIds: new Set(),
            suggestedFc: fcCode,
            fcCity: dbMeta?.city || primaryFcObj.city || "",
            fcName: dbMeta?.fcName || `${fcCode} (${primaryFcObj.city || normalizedState})`,
          });
        }

        const entry = skuStateMap.get(key);
        entry.unitsSold += qty;
        entry.revenue += price * qty;
        if (!entry.asin && asin) entry.asin = asin;
        if (!entry.title && title) entry.title = title;
        if (ord.orderId) entry.orderIds.add(ord.orderId);
      }
    }

    const ratio = Math.min(Math.max(Number(sendPercentage) || 70, 1), 200) / 100;
    const minUnitsThreshold = Math.max(parseInt(minUnits, 10) || 1, 1);

    // Fetch current FC stock (if any) and FBM stock for the SKUs
    const allSkus = Array.from(new Set(Array.from(skuStateMap.values()).map((r) => r.sku)));
    const fcStockMap = new Map();
    const fbmStockMap = new Map();

    if (allSkus.length > 0) {
      const targetLedgerDate = await getLatestReportDate(cleanProfileId, cleanConfigId);
      const ledgerMatch = {
        profileId: cleanProfileId,
        reportDate: targetLedgerDate,
        disposition: "SELLABLE",
        sku: { $in: allSkus },
      };
      if (cleanConfigId && mongoose.Types.ObjectId.isValid(cleanConfigId)) {
        ledgerMatch.configId = new mongoose.Types.ObjectId(cleanConfigId);
      }

      const [fcStockRows, invRows] = await Promise.all([
        fcInventoryLedgerSchema.aggregate([
          { $match: ledgerMatch },
          {
            $group: {
              _id: { sku: "$sku", fcCode: "$fcCode" },
              stock: { $sum: "$endingWarehouseBalance" },
            },
          },
        ]),
        inventorySchema
          .find({
            profileId: cleanProfileId,
            sku: { $in: allSkus },
          })
          .select("sku fulfillmentType currentStock totalStock")
          .lean(),
      ]);

      for (const r of fcStockRows) {
        fcStockMap.set(`${r._id.sku}|||${r._id.fcCode}`, r.stock || 0);
      }
      for (const inv of invRows) {
        if (inv.fulfillmentType === "FBM") {
          fbmStockMap.set(inv.sku, inv.totalStock ?? inv.currentStock ?? 0);
        }
      }
    }

    // Build rows and compute Suggested Qty to Send = Math.round(unitsSold * ratio)
    let allRows = [];
    const distinctStatesSet = new Set();
    const distinctFcsSet = new Set();

    for (const entry of skuStateMap.values()) {
      if (entry.unitsSold < minUnitsThreshold) continue;

      distinctStatesSet.add(entry.state);
      distinctFcsSet.add(entry.suggestedFc);

      const suggestedQty = Math.max(1, Math.round(entry.unitsSold * ratio));
      const currentFcStock = fcStockMap.get(`${entry.sku}|||${entry.suggestedFc}`) || 0;
      const fbmStock = fbmStockMap.get(entry.sku) ?? null;

      allRows.push({
        sku: entry.sku,
        asin: entry.asin,
        title: entry.title,
        state: entry.state,
        region: entry.region,
        unitsSold: entry.unitsSold,
        ordersCount: entry.orderIds.size,
        revenue: Math.round(entry.revenue * 100) / 100,
        suggestedFc: entry.suggestedFc,
        fcCity: entry.fcCity,
        fcName: entry.fcName,
        suggestedQty,
        currentFcStock,
        fbmStock,
      });
    }

    // Apply State, FC, and Search filters
    let filteredRows = allRows;
    if (filterState && filterState !== "ALL") {
      filteredRows = filteredRows.filter(
        (r) => r.state.toLowerCase() === String(filterState).trim().toLowerCase()
      );
    }
    if (filterFcCode && filterFcCode !== "ALL") {
      filteredRows = filteredRows.filter(
        (r) => r.suggestedFc.toUpperCase() === String(filterFcCode).trim().toUpperCase()
      );
    }
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      filteredRows = filteredRows.filter(
        (r) =>
          (r.sku && r.sku.toLowerCase().includes(q)) ||
          (r.asin && r.asin.toLowerCase().includes(q)) ||
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.state && r.state.toLowerCase().includes(q)) ||
          (r.suggestedFc && r.suggestedFc.toLowerCase().includes(q))
      );
    }

    // Compute overall summary and FC breakdown on filteredRows
    const uniqueSkus = new Set();
    const uniqueStates = new Set();
    const fcBreakdownMap = new Map();
    let totalUnitsSold = 0;
    let totalSuggestedQty = 0;

    for (const r of filteredRows) {
      uniqueSkus.add(r.sku);
      uniqueStates.add(r.state);
      totalUnitsSold += r.unitsSold;
      totalSuggestedQty += r.suggestedQty;

      if (!fcBreakdownMap.has(r.suggestedFc)) {
        fcBreakdownMap.set(r.suggestedFc, {
          fcCode: r.suggestedFc,
          fcCity: r.fcCity,
          region: r.region,
          states: new Set(),
          skus: new Set(),
          totalUnitsSold: 0,
          totalSuggestedQty: 0,
        });
      }
      const fcSummary = fcBreakdownMap.get(r.suggestedFc);
      fcSummary.states.add(r.state);
      fcSummary.skus.add(r.sku);
      fcSummary.totalUnitsSold += r.unitsSold;
      fcSummary.totalSuggestedQty += r.suggestedQty;
    }

    const fcBreakdown = Array.from(fcBreakdownMap.values())
      .map((f) => ({
        fcCode: f.fcCode,
        fcCity: f.fcCity,
        region: f.region,
        states: Array.from(f.states),
        skuCount: f.skus.size,
        totalUnitsSold: f.totalUnitsSold,
        totalSuggestedQty: f.totalSuggestedQty,
      }))
      .sort((a, b) => b.totalSuggestedQty - a.totalSuggestedQty || b.totalUnitsSold - a.totalUnitsSold);

    // Sort rows (default: Units Sold desc, then Suggested Qty desc, then SKU asc)
    const dir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    filteredRows.sort((a, b) => {
      if (sortBy === "sku") return dir * a.sku.localeCompare(b.sku);
      if (sortBy === "state") return dir * a.state.localeCompare(b.state) || b.unitsSold - a.unitsSold;
      if (sortBy === "suggestedFc") return dir * a.suggestedFc.localeCompare(b.suggestedFc) || b.unitsSold - a.unitsSold;
      if (sortBy === "suggestedQty") return dir * (a.suggestedQty - b.suggestedQty) || b.unitsSold - a.unitsSold;
      if (sortBy === "currentFcStock") return dir * ((a.currentFcStock || 0) - (b.currentFcStock || 0));
      return dir * (a.unitsSold - b.unitsSold) || b.suggestedQty - a.suggestedQty || a.sku.localeCompare(b.sku);
    });

    const totalRecords = filteredRows.length;
    const isExportAll = String(pageLimit).toUpperCase() === "ALL" || Number(pageLimit) >= 5000;
    const effectiveLimit = isExportAll ? Math.max(totalRecords, 1) : Number(pageLimit) || 25;
    const skip = isExportAll ? 0 : (Number(page) - 1) * effectiveLimit;
    const paginatedItems = filteredRows.slice(skip, skip + effectiveLimit);

    await enrichProductsWithListing(paginatedItems, cleanProfileId, cleanConfigId);

    return res.status(200).json({
      isSuccess: true,
      message: "MFN to FBA FC recommendations fetched successfully.",
      data: {
        totalRecords,
        currentPage: Number(page),
        totalPages: Math.ceil(totalRecords / effectiveLimit),
        periodStart: resolvedStart ? moment(resolvedStart).tz(timezone).format("YYYY-MM-DD") : null,
        periodEnd: resolvedEnd ? moment(resolvedEnd).tz(timezone).format("YYYY-MM-DD") : null,
        sendPercentage: Number(sendPercentage) || 70,
        minUnits: minUnitsThreshold,
        summary: {
          totalMfnSkus: uniqueSkus.size,
          totalStates: uniqueStates.size,
          totalSuggestedFcs: fcBreakdown.length,
          totalUnitsSold,
          totalSuggestedQty,
          fcBreakdown,
        },
        availableStates: Array.from(distinctStatesSet).sort(),
        availableFcs: Array.from(distinctFcsSet).sort(),
        items: paginatedItems,
      },
    });
  } catch (error) {
    console.error("getMfnToFbaRecommendations error:", error);
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching MFN to FBA recommendations.",
    });
  }
};

