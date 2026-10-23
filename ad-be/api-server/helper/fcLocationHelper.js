const fulfillmentCenterSchema = require("../models/fulfillmentCenter.model");
const fulfillmentCenterMasterSchema = require("../models/fulfillmentCenterMaster.model");

/**
 * 100% Dynamic Fulfillment Center & Warehouse Helper.
 * All warehouse records are discovered, ingested, and maintained dynamically
 * from Amazon SP-API reports (GET_LEDGER_SUMMARY_VIEW_DATA, GET_FBA_STORAGE_FEE_CHARGES_DATA, GET_GST_STR_ADHOC).
 */

/**
 * Resolves FC location strictly from the database (fulfillmentcenters + fulfillmentcentermasters).
 * If unseen, automatically creates and persists the new warehouse record in the DB table.
 */
async function resolveFcLocation(fcCode, countryCode = "IN") {
  if (!fcCode) {
    return {
      fcCode: "UNKNOWN",
      fcName: "Unknown Warehouse",
      city: "Unknown",
      state: "Unknown",
      region: "Unknown",
      countryCode,
      pincode: "",
      coordinates: { lat: null, lng: null },
    };
  }

  const cleanCode = String(fcCode).trim().toUpperCase();
  const cleanCountry = String(countryCode || "IN").trim().toUpperCase();

  try {
    const dbFc = await fulfillmentCenterSchema.findOne({ fcCode: cleanCode, countryCode: cleanCountry }).lean();
    
    // Check if dbFc has full details (city, state)
    if (dbFc && dbFc.city && dbFc.city !== "Other" && dbFc.state && dbFc.state !== "Other") {
      return {
        fcCode: cleanCode,
        fcName: dbFc.fcName || `Amazon FC ${cleanCode}`,
        city: dbFc.city,
        state: dbFc.state,
        region: dbFc.region || "Other",
        countryCode: dbFc.countryCode || cleanCountry,
        pincode: dbFc.pincode || "",
        coordinates: dbFc.coordinates || { lat: null, lng: null },
        gstin: dbFc.gstin || "",
        source: dbFc.source || "AUTO_DETECTED",
      };
    }

    // Try finding in fulfillmentCenterMasterSchema
    const masterFc = await fulfillmentCenterMasterSchema.findOne({ fcCode: cleanCode }).lean();
    if (masterFc && (masterFc.city || masterFc.state || masterFc.fcName)) {
      const resolved = {
        fcCode: cleanCode,
        fcName: masterFc.fcName || dbFc?.fcName || `Amazon FC ${cleanCode}`,
        city: masterFc.city || dbFc?.city || "Other",
        state: masterFc.state || dbFc?.state || "Other",
        region: dbFc?.region || "Other",
        countryCode: masterFc.country || dbFc?.countryCode || cleanCountry,
        pincode: masterFc.postalCode || dbFc?.pincode || "",
        coordinates: dbFc?.coordinates || { lat: null, lng: null },
        gstin: dbFc?.gstin || "",
        source: masterFc.source || dbFc?.source || "AMAZON_DIRECTORY",
      };

      // Persist / enrich in fulfillmentCenterSchema for fast future queries
      await fulfillmentCenterSchema.updateOne(
        { fcCode: cleanCode, countryCode: cleanCountry },
        {
          $set: {
            fcName: resolved.fcName,
            city: resolved.city,
            state: resolved.state,
            pincode: resolved.pincode,
            isActive: true,
          },
        },
        { upsert: true }
      ).catch(() => {});

      return resolved;
    }

    if (dbFc) {
      return {
        fcCode: cleanCode,
        fcName: dbFc.fcName || `Amazon FC ${cleanCode}`,
        city: dbFc.city || "Other",
        state: dbFc.state || "Other",
        region: dbFc.region || "Other",
        countryCode: dbFc.countryCode || cleanCountry,
        pincode: dbFc.pincode || "",
        coordinates: dbFc.coordinates || { lat: null, lng: null },
        gstin: dbFc.gstin || "",
        source: dbFc.source || "AUTO_DETECTED",
      };
    }
  } catch (err) {
    console.error(`Error resolving FC from DB for ${cleanCode}:`, err);
  }

  // Create new dynamic warehouse record directly in the DB table
  const newFcRecord = {
    fcCode: cleanCode,
    fcName: `Amazon FC ${cleanCode}`,
    city: "",
    state: "",
    region: "Other",
    countryCode: cleanCountry,
    pincode: "",
    coordinates: { lat: null, lng: null },
    source: "AUTO_DETECTED",
    isActive: true,
  };

  try {
    await fulfillmentCenterSchema.updateOne(
      { fcCode: cleanCode, countryCode: cleanCountry },
      { $setOnInsert: newFcRecord },
      { upsert: true }
    );
  } catch (insertErr) {
    // Ignore duplicate race conditions
  }

  return {
    ...newFcRecord,
    city: "Other",
    state: "Other",
  };
}

/**
 * Batch register/enrich any newly discovered warehouses found during report streaming/parsing.
 * Dynamically inserts new warehouse codes into the fulfillmentCenter collection or updates location info.
 */
async function registerDiscoveredWarehouses(warehouseList = []) {
  if (!Array.isArray(warehouseList) || warehouseList.length === 0) return 0;

  try {
    const ops = [];
    const masterOps = [];
    const seen = new Set();

    // 1. Preload master records to auto-enrich city, state, region, and pincode
    const allCodes = warehouseList
      .map((w) => (w?.fcCode ? String(w.fcCode).trim().toUpperCase() : ""))
      .filter(Boolean);

    const masterDocs = await fulfillmentCenterMasterSchema
      .find({ fcCode: { $in: allCodes } })
      .lean();

    const masterMap = new Map();
    for (const m of masterDocs) {
      masterMap.set(m.fcCode, m);
    }

    for (const wh of warehouseList) {
      if (!wh || !wh.fcCode) continue;
      const cleanCode = String(wh.fcCode).trim().toUpperCase();
      const cleanCountry = String(wh.countryCode || "IN").trim().toUpperCase();
      const key = `${cleanCode}_${cleanCountry}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const master = masterMap.get(cleanCode);

      // Resolve city, state, region, and pincode: prefer direct report data, fallback to master
      const city =
        wh.city && wh.city !== "Other"
          ? wh.city
          : master?.city && master.city !== "Other"
          ? master.city
          : "";

      const state =
        wh.state && wh.state !== "Other"
          ? wh.state
          : master?.state && master.state !== "Other"
          ? master.state
          : "";

      const region =
        wh.region && wh.region !== "Other"
          ? wh.region
          : master?.region && master.region !== "Other"
          ? master.region
          : "";

      const pincode = wh.pincode || master?.postalCode || "";
      const fcName =
        wh.fcName ||
        master?.fcName ||
        (city && state ? `${cleanCode} - ${city}, ${state}` : `Amazon FC ${cleanCode}`);

      const setFields = {
        isActive: true,
      };
      if (city) setFields.city = city;
      if (state) setFields.state = state;
      if (region) setFields.region = region;
      if (pincode) setFields.pincode = pincode;
      if (fcName) setFields.fcName = fcName;
      if (wh.gstin) setFields.gstin = wh.gstin;
      if (wh.source) setFields.source = wh.source;

      const setOnInsertFields = {
        fcCode: cleanCode,
        countryCode: cleanCountry,
        coordinates: wh.coordinates || master?.coordinates || { lat: null, lng: null },
      };

      if (!setFields.fcName) setOnInsertFields.fcName = `Amazon FC ${cleanCode}`;
      if (!setFields.region) setOnInsertFields.region = "Other";
      if (!setFields.pincode) setOnInsertFields.pincode = "";
      if (!setFields.city) setOnInsertFields.city = "";
      if (!setFields.state) setOnInsertFields.state = "";
      if (!setFields.source) setOnInsertFields.source = "AUTO_DETECTED";

      ops.push({
        updateOne: {
          filter: { fcCode: cleanCode, countryCode: cleanCountry },
          update: {
            $set: setFields,
            $setOnInsert: setOnInsertFields,
          },
          upsert: true,
        },
      });

      // If wh came with official city & state (e.g. from Amazon GST STR report), sync into master catalog too
      if (wh.city && wh.state) {
        masterOps.push({
          updateOne: {
            filter: { fcCode: cleanCode },
            update: {
              $set: {
                fcCode: cleanCode,
                fcName: fcName,
                city: wh.city,
                state: wh.state,
                country: cleanCountry,
                postalCode: pincode,
                source: wh.source || "AMAZON_REPORT",
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length > 0) {
      await fulfillmentCenterSchema.bulkWrite(ops, { ordered: false });
    }
    if (masterOps.length > 0) {
      await fulfillmentCenterMasterSchema.bulkWrite(masterOps, { ordered: false }).catch(() => {});
    }
    return ops.length;
  } catch (err) {
    console.error("Error batch registering discovered warehouses:", err.message);
  }
  return 0;
}

/**
 * Upsert dynamic FC location mappings extracted from GST STR reports.
 */
async function upsertGstFcLocations(fcRecords = []) {
  if (!Array.isArray(fcRecords) || fcRecords.length === 0) return 0;
  return registerDiscoveredWarehouses(
    fcRecords.map((r) => ({
      ...r,
      source: "REPORT_GST",
    }))
  );
}

module.exports = {
  resolveFcLocation,
  registerDiscoveredWarehouses,
  upsertGstFcLocations,
};
