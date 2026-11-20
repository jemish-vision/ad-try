const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const { execSync } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function gatherMetrics() {
  console.log("==================================================================");
  console.log("           ADVERTISEIQ SERVER & RESOURCE DIAGNOSTIC               ");
  console.log("==================================================================");

  // 1. Host Machine & OS Specs
  const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
  const usedMemGB = (totalMemGB - freeMemGB).toFixed(2);
  const memUsagePercent = ((usedMemGB / totalMemGB) * 100).toFixed(1);

  const cpus = os.cpus();
  console.log("\n--- [1] HOST MACHINE SPECIFICATIONS ---");
  console.log(`OS Platform       : ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`Host Name         : ${os.hostname()}`);
  console.log(`CPU Model         : ${cpus[0]?.model || "Unknown"}`);
  console.log(`CPU Cores/Threads : ${cpus.length} physical/logical cores @ ${cpus[0]?.speed} MHz`);
  console.log(`Total RAM         : ${totalMemGB} GB`);
  console.log(`Used RAM          : ${usedMemGB} GB (${memUsagePercent}%)`);
  console.log(`Free RAM          : ${freeMemGB} GB`);
  console.log(`System Uptime     : ${(os.uptime() / 3600).toFixed(1)} hours`);

  // 2. Disks
  console.log("\n--- [2] DISK VOLUMES & STORAGE ---");
  try {
    const diskOut = execSync('powershell -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, Size, FreeSpace | ConvertTo-Json"', { encoding: "utf8" });
    const disks = JSON.parse(diskOut);
    const diskArray = Array.isArray(disks) ? disks : [disks];
    for (const d of diskArray) {
      if (!d.Size) continue;
      const total = (d.Size / 1024 / 1024 / 1024).toFixed(2);
      const free = (d.FreeSpace / 1024 / 1024 / 1024).toFixed(2);
      const used = (total - free).toFixed(2);
      const pct = ((used / total) * 100).toFixed(1);
      console.log(`Drive ${d.DeviceID} (${d.VolumeName || "Local Disk"}): Total ${total} GB | Used ${used} GB (${pct}%) | Free ${free} GB`);
    }
  } catch (err) {
    console.log("Could not query disk volumes:", err.message);
  }

  // 3. Process inspection (Node & MongoDB processes with command lines)
  console.log("\n--- [3] RUNNING WORKLOAD PROCESSES (NODE & MONGOD) ---");
  try {
    const psScript = `
      Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|mongod' } |
      Select-Object ProcessId, Name, WorkingSetSize, CommandLine | ConvertTo-Json -Depth 2
    `;
    const procOut = execSync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, { encoding: "utf8" });
    if (procOut && procOut.trim()) {
      const procs = JSON.parse(procOut);
      const procArray = Array.isArray(procs) ? procs : [procs];
      let totalNodeRAM = 0;
      for (const p of procArray) {
        const wsMB = (p.WorkingSetSize / 1024 / 1024).toFixed(1);
        if (p.Name.toLowerCase() === "node.exe") totalNodeRAM += Number(wsMB);
        const cmd = (p.CommandLine || "").substring(0, 100);
        console.log(`- PID ${p.ProcessId.toString().padEnd(6)} | ${p.Name.padEnd(11)} | RAM: ${wsMB.padStart(7)} MB | Cmd: ${cmd}`);
      }
      console.log(`\n=> Total RAM consumed by Node.js processes: ${(totalNodeRAM / 1024).toFixed(2)} GB (${totalNodeRAM.toFixed(1)} MB)`);
    }
  } catch (err) {
    console.log("Process check note:", err.message);
  }

  // 4. Live MongoDB Cluster Diagnostic
  console.log("\n--- [4] MONGODB CLUSTER HARDWARE & MEMORY FOOTPRINT ---");
  const uri = process.env.MONGO_URI || process.env.DB_URL;
  if (!uri) {
    console.log("No MONGO_URI in .env");
    return;
  }
  const cleanUri = uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
  console.log(`Connecting to: ${cleanUri}...`);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;

    // Database stats
    const dbStats = await db.stats();
    console.log(`\nDatabase Name       : ${dbStats.db}`);
    console.log(`Collections Count   : ${dbStats.collections}`);
    console.log(`Total Documents     : ${dbStats.objects.toLocaleString()}`);
    console.log(`Uncompressed Data   : ${(dbStats.dataSize / 1024 / 1024 / 1024).toFixed(2)} GB (${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Storage on Disk     : ${(dbStats.storageSize / 1024 / 1024 / 1024).toFixed(2)} GB (${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Total Index Footprint: ${(dbStats.indexSize / 1024 / 1024 / 1024).toFixed(2)} GB (${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB)`);

    // Top 10 largest collections by total size (data + index)
    console.log(`\nTop 10 Largest Collections (Storage + Index):`);
    const colls = await db.listCollections().toArray();
    const collStatsList = [];
    for (const c of colls) {
      if (c.name.startsWith("system.")) continue;
      try {
        const cs = await db.command({ collStats: c.name });
        collStatsList.push({
          name: c.name,
          docs: cs.count,
          dataMB: cs.size / 1024 / 1024,
          storageMB: cs.storageSize / 1024 / 1024,
          indexMB: cs.totalIndexSize / 1024 / 1024,
          totalMB: (cs.storageSize + cs.totalIndexSize) / 1024 / 1024
        });
      } catch (_) {}
    }

    collStatsList.sort((a, b) => b.totalMB - a.totalMB);
    for (const c of collStatsList.slice(0, 10)) {
      console.log(`- ${c.name.padEnd(30)}: ${c.docs.toLocaleString().padStart(10)} docs | Data: ${c.dataMB.toFixed(1).padStart(7)} MB | Disk: ${c.storageMB.toFixed(1).padStart(7)} MB | Index: ${c.indexMB.toFixed(1).padStart(7)} MB | Total: ${c.totalMB.toFixed(1).padStart(8)} MB`);
    }

    // Server status (Memory, WiredTiger, Connections)
    try {
      const serverStatus = await db.admin().command({ serverStatus: 1 });
      console.log(`\nMongoDB Engine Version : ${serverStatus.version}`);
      console.log(`Server Host / Node     : ${serverStatus.host}`);
      console.log(`MongoDB Server Uptime  : ${(serverStatus.uptime / 3600).toFixed(1)} hours (${(serverStatus.uptime / 86400).toFixed(1)} days)`);

      // Memory
      const mem = serverStatus.mem;
      if (mem) {
        console.log(`\nMongoDB Memory Usage on its Host:`);
        console.log(`- Resident RAM (in memory) : ${mem.resident} MB (${(mem.resident / 1024).toFixed(2)} GB)`);
        console.log(`- Virtual Memory Allocated : ${mem.virtual} MB (${(mem.virtual / 1024).toFixed(2)} GB)`);
      }

      // WiredTiger Cache
      const wt = serverStatus.wiredTiger?.cache;
      if (wt) {
        const maxCacheGB = (wt["maximum bytes configured"] / 1024 / 1024 / 1024).toFixed(2);
        const inCacheGB = (wt["bytes currently in the cache"] / 1024 / 1024 / 1024).toFixed(2);
        const dirtyGB = (wt["tracked dirty bytes in the cache"] / 1024 / 1024 / 1024).toFixed(2);
        console.log(`\nWiredTiger Cache Status:`);
        console.log(`- Configured Max Cache  : ${maxCacheGB} GB`);
        console.log(`- Currently in Cache    : ${inCacheGB} GB (${((inCacheGB / maxCacheGB) * 100).toFixed(1)}% full)`);
        console.log(`- Dirty Bytes in Cache  : ${dirtyGB} GB`);
        console.log(`- Pages Read into Cache : ${wt["pages read into cache"].toLocaleString()}`);
        console.log(`- Pages Written from Cache: ${wt["pages written from cache"].toLocaleString()}`);
      }

      // Connections
      const conn = serverStatus.connections;
      if (conn) {
        console.log(`\nActive Connections:`);
        console.log(`- Current Open Connections: ${conn.current}`);
        console.log(`- Available Connections   : ${conn.available}`);
        console.log(`- Total Created Historical: ${conn.totalCreated.toLocaleString()}`);
      }

      // Network
      const net = serverStatus.network;
      if (net) {
        console.log(`\nNetwork I/O:`);
        console.log(`- Inbound Traffic         : ${(net.bytesIn / 1024 / 1024 / 1024).toFixed(2)} GB`);
        console.log(`- Outbound Traffic        : ${(net.bytesOut / 1024 / 1024 / 1024).toFixed(2)} GB`);
        console.log(`- Total Requests Handled  : ${net.numRequests.toLocaleString()}`);
      }

      // Concurrent Operations
      const opcounters = serverStatus.opcounters;
      if (opcounters) {
        console.log(`\nOperational Counters (Lifetime Operations):`);
        console.log(`- Inserts : ${opcounters.insert.toLocaleString()}`);
        console.log(`- Queries : ${opcounters.query.toLocaleString()}`);
        console.log(`- Updates : ${opcounters.update.toLocaleString()}`);
        console.log(`- Deletes : ${opcounters.delete.toLocaleString()}`);
        console.log(`- Commands: ${opcounters.command.toLocaleString()}`);
      }
    } catch (adminErr) {
      console.log("Note on admin serverStatus:", adminErr.message);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error("Error connecting to Mongo:", err.message);
  }

  console.log("\n==================================================================");
  console.log("                    DIAGNOSTIC COMPLETE                           ");
  console.log("==================================================================");
}

gatherMetrics().catch(console.error);
