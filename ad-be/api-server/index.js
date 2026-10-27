const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const http = require("http");
require("dotenv").config();
const socketIO = require("socket.io");
const path = require("path");
const app = express();
app.use(compression({
  level: 6,
  threshold: 1024,
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
const server = http.createServer(app);
const io = socketIO(server, {
  maxHttpBufferSize: 1e6,        // 1MB max message size
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket'],     // Avoid polling fallback (creates extra connections)
  allowUpgrades: false,
});
const cors = require("cors");
const { write_logs } = require("../winston/connection/logger");
const { globalLimiter } = require("./middleware/rateLimiter");
const { monitorWorkerService, checkWorkerHealth } = require("./helper/heartbeat.helper");

// ✅ Track server start time
const SERVER_START_TIME = new Date();

// Serve static files from the "public" folder
app.use("/public", express.static(path.join(__dirname, "../public"), {
  setHeaders: (res, filePath) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    const ext = path.extname(filePath).toLowerCase();
    if ([".html", ".htm", ".svg", ".xml"].includes(ext)) {
      res.setHeader("Content-Disposition", "attachment");
    }
  }
}));

app.set("view engine", "ejs");

const allowedOrigins = `${process.env.ALLOWED_ORIGINS},${process.env.BASE_URL}`.split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins?.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(globalLimiter);
app.use(express.static("template"));
//DataBase Configration
require("../shared/connection");
const GlobalSettings = require("./models/globalSettings.model");

GlobalSettings.findOne().lean().then(settings => {
  if (settings) {
    app.locals.isMaintenanceMode = settings.isMaintenanceMode;
  } else {
    app.locals.isMaintenanceMode = false;
  }
}).catch(err => console.error("Error fetching GlobalSettings:", err));

app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (obj) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      obj.isMaintenanceMode = req.app.locals.isMaintenanceMode || false;
    }
    return originalJson.call(this, obj);
  };
  next();
});

app.use("/uploads", express.static(path.join(path.resolve(), "uploads"), {
  setHeaders: (res, filePath) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    const ext = path.extname(filePath).toLowerCase();
    if ([".html", ".htm", ".svg", ".xml"].includes(ext)) {
      res.setHeader("Content-Disposition", "attachment");
    }
  }
}));

const { stripeWebhook } = require("./controllers/user.controller");
app.post(
  "/api/user/stripeWebhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use((req, res, next) => {
  const rawAdType = req.headers["adtype"];
  // "All" means SP + SB + SD combined. Preserve it verbatim; anything else
  // unrecognised still falls back to SP (the single default).
  const normalized = typeof rawAdType === "string" ? rawAdType.trim() : "";
  const validTypes = ["SP", "SB", "SD"];

  if (normalized.toLowerCase() === "all") req.adType = "All";
  else if (normalized && validTypes.includes(normalized.toUpperCase())) req.adType = normalized.toUpperCase();
  else req.adType = "SP";

  next();
});

// ✅ Server status route — returns last restart time + uptime
app.get("/api/server/status", (req, res) => {
  const now = new Date();
  const uptimeMs = now - SERVER_START_TIME;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);

  const { isRedisReady } = require("./services/redis.service");
  res.json({
    status: "Running",
    redisReady: isRedisReady(),
    lastRestartTime: SERVER_START_TIME.toISOString(),
    lastRestartTimeLocal: SERVER_START_TIME.toLocaleString(),
    uptime: { hours: uptimeHours, minutes: uptimeMinutes % 60, seconds: uptimeSeconds % 60, totalSeconds: uptimeSeconds },
  });
});

app.get("/api/worker-health", checkWorkerHealth);

//Admin
app.use("/api/device", require("./routes/device.route"));
app.use("/api/amazon", require("./routes/campaign.route"));
app.use("/api/google", require("./routes/google.route"));
app.use("/api/customer", require("./routes/customer.route"));
app.use("/api/customer/chatbot-reporting", require("./routes/chatbotReporting.route").createSummaryRouter());
app.use("/api/organization", require("./routes/organization.route"));
app.use("/api/budgetRule", require("./routes/budgetRule.route"));
app.use("/api/cronJob", require("./routes/cronJob.route"));
app.use("/api/placement", require("./routes/placement.route"));
app.use("/api/adGroup", require("./routes/adGroups.route"));
app.use("/api/keyword", require("./routes/keyword.route"));
app.use("/api/product", require("./routes/productAds.route"));
app.use("/api/search-term", require("./routes/searchTerm.route"));
app.use("/api/targeting", require("./routes/targrting.route"));
app.use("/api/setting", require("./routes/defaultTargetAcos.route"));
app.use("/api/seller/order", require("./routes/order.route"));
app.use("/api/seller/inventory", require("./routes/inventory.route"));
app.use("/api/seller/warehouse", require("./routes/fcInventory.route"));
app.use("/api/seller/product-performance", require("./routes/productPerformance.route"));
app.use("/api/dayparting-stretegy", require("./routes/daypartingstretegy.route"));
app.use("/api/user", require("./routes/user.route"));
app.use("/api/config", require("./routes/config.route"));
app.use("/api/packages", require("./routes/packages.route"));
app.use("/api/asana", require("./routes/asana.route"));
app.use("/api/holiday", require("./routes/holiday.route"));
app.use("/api/health-score", require("./routes/healthScoreSetting.route"));
app.use("/api/performance-score", require("./routes/performanceScoreSetting.route"));
app.use("/api/dashboard", require("./routes/dashboard.route"));
app.use("/api/deals", require("./routes/deals.route.js"));
app.use("/api/recommendation", require("./routes/recommendation.route"));
app.use("/api/coupon", require("./routes/coupon.route"));
app.use("/api/reconciliation-reimbursement", require("./routes/reconciliationReimbursement.route.js"));
app.use("/api/transactions", require("./routes/transactions.route.js"));
app.use("/api/products", require("./routes/products.route.js"));
app.use("/api/aplusContent", require("./routes/aplusContent.route.js"));
app.use("/api/auditLog", require("./routes/auditLog.route.js"));
app.use("/api/brandAnalytics", require("./routes/brandAnalytics.route"));
app.use("/api/profit-analysis", require("./routes/profitAnalysis.route"));

//Super admin
app.use("/api/pages", require("./routes/superAdmin/pages.route"));
app.use("/api/columns", require("./routes/customColumns.route"));
app.use("/api/permission", require("./routes/superAdmin/permission.route"));
app.use("/api/role", require("./routes/superAdmin/role.route"));
app.use("/api/superAdmin", require("./routes/superAdmin/superAdmin.route"));
app.use("/api/support", require("./routes/superAdmin/support.route"));
app.use("/api/rule-blocked-time", require("./routes/superAdmin/ruleBlockedTime.route"));
app.use("/api/retention", require("./routes/retention.route"));
app.use("/api/admin/global-settings", require("./routes/admin/globalSettings.route"));

// Global 404 Route Not Found Handler
app.use((req, res, next) => {
  res.status(404).json({
    isSuccess: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Server Error Handler
app.use((err, req, res, next) => {
  write_logs({
    message: `[Global Error Handler] ${err.message || err} | Route: ${req.method} ${req.originalUrl}`,
    log_type: "error",
  });

  // Handle Multer file upload errors specifically
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(203).json({
        isSuccess: false,
        message: "File size exceeds the allowed limit.",
      });
    }
    return res.status(203).json({
      isSuccess: false,
      message: err.message || "File upload error occurred.",
    });
  }

  const statusCode = err?.status || err?.statusCode || 500;
  return res.status(statusCode).json({
    isSuccess: false,
    message: err.message || "Internal Server Error. Please try again later.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected: " + socket.id);

  // Listen for chat messages
  socket.on("message", (data) => {
    console.log("Message received:", data);

    // Broadcast the message to all connected clients
    io.emit("message", data);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
  });
});

// listening port
const PORT = process.env.PORT || 3000;
server.listen(PORT, (error) => {
  if (error) {
    write_logs({
      message: error?.message,
      log_type: "error",
    });
  } else {
    write_logs({
      message: `🚀 Server RESTARTED at ${SERVER_START_TIME.toISOString()} — listening on port ${PORT}`,
      log_type: "info",
    });
    // Start worker-service health monitoring check every 1 minute
    setInterval(async () => {
      await monitorWorkerService();
    }, 60 * 1000);
  }
});

const gracefulShutdown = async (signal) => {
  write_logs({ message: `Received ${signal}, initiating graceful shutdown...`, log_type: "info" });
  server.close(async () => {
    try {
      const { closeRedis } = require("./services/redis.service");
      await closeRedis();
      const mongoose = require("mongoose");
      await mongoose.connection.close();
      write_logs({ message: "Graceful shutdown complete.", log_type: "info" });
      process.exit(0);
    } catch (err) {
      write_logs({ message: `Error during shutdown: ${err.message}`, log_type: "error" });
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

