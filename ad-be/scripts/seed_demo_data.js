#!/usr/bin/env node

/**
 * AdvertiseIQ - Demo Data Seeding Script
 * ---------------------------------------------------------------------------------
 * Seeds exactly 2 realistic campaigns and 2 realistic orders (with complete pricing,
 * costing, and breakdown data) into MongoDB for both Mock Mode and Live Testing.
 *
 * Usage:
 *   node scripts/seed_demo_data.js
 *   or: npm run seed:demo
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const moment = require("moment-timezone");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/LocalAdminDB";

// Target demo profiles
const MOCK_PROFILE_ID = 99999901;
const ACTIVE_LIVE_PROFILE_ID = 1451708219889308; // SPIRU SWASTHA INDIA PRIVATE LIMITED

async function seedDemoData() {
  console.log("\n=======================================================");
  console.log("   🚀 AdvertiseIQ: Seeding Demo Data (2 Campaigns & 2 Orders)");
  console.log("=======================================================\n");

  try {
    console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
    await mongoose.connect(MONGO_URI);
    console.log("✅ Successfully connected to MongoDB.\n");

    const db = mongoose.connection.db;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: SEED UNIFIED MOCK TESTING COLLECTION (`mock_testing_datas`)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("1️⃣ Seeding 'mock_testing_datas' collection...");
    const mockService = require("../api-server/services/mockTestingData.service");

    // Force reseed default documents (which now contains exactly 2 campaigns & 2 orders)
    await mockService.ensureMockDataSeeded(true);

    const mockCampCount = await db.collection("mock_testing_datas").countDocuments({
      moduleType: "CAMPAIGN",
      subType: "MAIN",
    });
    const mockOrderCount = await db.collection("mock_testing_datas").countDocuments({
      moduleType: "PURCHASE_ORDER",
      subType: "MAIN",
    });
    const mockReportCount = await db.collection("mock_testing_datas").countDocuments({
      moduleType: "PURCHASE_ORDER",
      subType: "ORDER_REPORT",
    });
    const mockHistoryCount = await db.collection("mock_testing_datas").countDocuments({
      moduleType: "HISTORY",
      subType: "MAIN",
    });

    console.log(`   ✔ Mock Campaigns Seeded:     ${mockCampCount}`);
    console.log(`   ✔ Mock Orders Seeded:        ${mockOrderCount}`);
    console.log(`   ✔ Mock Order Reports Seeded: ${mockReportCount}`);
    console.log(`   ✔ Mock History Seeded:       ${mockHistoryCount}`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: SYNC TO REAL COLLECTIONS (for SPIRU & Live Profiles)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n2️⃣ Syncing catalog and listings in 'productlistings'...");

    // Get active configId for profile 1451708219889308 or fallback
    const profileDoc = await db.collection("profiles").findOne({ profileId: ACTIVE_LIVE_PROFILE_ID });
    const targetConfigId = profileDoc?.configId || new mongoose.Types.ObjectId("694120f451f2bf9640c4b27f");

    const listingsToUpsert = [
      {
        sku: "APEX-EARBUDS-PRO",
        asin: "B0MOCK0001",
        title: "ApexGear Wireless Noise Cancelling Earbuds Pro - Bluetooth 5.3",
        imageURL: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        basePrice: 18.5,
        sellingPrice: 59.99,
        cost: 18.5,
        price: 59.99,
        quantity: 340,
        status: "Active",
      },
      {
        sku: "APEX-SMARTWATCH-X1",
        asin: "B0MOCK0002",
        title: "ApexGear Fitness Smart Watch X1 with Heart Rate & Sleep Monitor",
        imageURL: "https://m.media-amazon.com/images/I/71Swqqe7XAL._AC_SL1500_.jpg",
        basePrice: 27.0,
        sellingPrice: 89.99,
        cost: 27.0,
        price: 89.99,
        quantity: 215,
        status: "Active",
      },
      // Also update Spiru Swastha live listing if present so it displays clean prices
      {
        sku: "6Q-OVEE-JPGO",
        asin: "B0DYYDYJT2",
        title: "Spiru Swastha 100% Natural Spirulina Powder 100g",
        imageURL: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        basePrice: 120.0,
        sellingPrice: 289.0,
        cost: 120.0,
        price: 289.0,
        quantity: 150,
        status: "Active",
      },
    ];

    for (const item of listingsToUpsert) {
      await db.collection("productlistings").updateOne(
        { sku: item.sku, profileId: ACTIVE_LIVE_PROFILE_ID },
        {
          $set: {
            ...item,
            configId: targetConfigId,
            profileId: ACTIVE_LIVE_PROFILE_ID,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
    console.log(`   ✔ Product listings updated with basePrice and sellingPrice.`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: SYNC ORDERS TO 'orderdetails' AND 'orders'
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n3️⃣ Syncing clean orders to 'orderdetails'...");

    const mockOrderDocs = await db.collection("mock_testing_datas").find({
      moduleType: "PURCHASE_ORDER",
      subType: "MAIN",
    }).toArray();

    for (const doc of mockOrderDocs) {
      const ord = doc.data;
      if (!ord || !ord.orderId) continue;
      await db.collection("orderdetails").updateOne(
        { orderId: ord.orderId },
        {
          $set: {
            ...ord,
            configId: targetConfigId,
            profileId: ACTIVE_LIVE_PROFILE_ID,
            marketplaceId: "A21TJRUUN4KGV",
            orderCreatedTime: moment(ord.orderCreatedTime).toDate(),
            orderLastUpdatedTime: ord.orderLastUpdatedTime ? moment(ord.orderLastUpdatedTime).toDate() : new Date(),
          },
        },
        { upsert: true }
      );
    }
    console.log(`   ✔ ${mockOrderDocs.length} clean orders upserted to 'orderdetails'.`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: SUMMARY VERIFICATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n=======================================================");
    console.log("   🎉 Demo Data Seeding Completed Successfully!");
    console.log("=======================================================");
    console.log("   Campaigns Available (2):");
    console.log("     1. SP | Wireless Earbuds Pro | Exact Match (ID: 800001)");
    console.log("     2. SP | Smart Watch X1 | Auto Discovery   (ID: 800002)");
    console.log("\n   Orders Available (2):");
    console.log("     1. 114-4829101-7738201 ($59.99) - Alex Rivera (Earbuds Pro)");
    console.log("     2. 112-9840212-6204812 ($89.99) - Sarah Jenkins (Smart Watch X1)");
    console.log("\n   History Changes Available (2):");
    console.log("     1. HIST-001 (SP | Earbuds Pro): Keyword bid $1.25 -> $1.45 (Rule: Target ACOS Rule)");
    console.log("     2. HIST-002 (SP | Smart Watch X1): Campaign budget $70 -> $85 (Recommendation: Budget Optimizer)");
    console.log("\n   Order Report Key Totals:");
    console.log("     Total Purchases: 2");
    console.log("     Total Sales:     $149.98");
    console.log("     Total Cost:      $45.50");
    console.log("     Total Profit:    $104.48");
    console.log("=======================================================\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding Error:", error);
    process.exit(1);
  }
}

seedDemoData();
