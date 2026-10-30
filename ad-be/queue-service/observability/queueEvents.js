const { QueueEvents } = require("bullmq");
const os = require("os");
const { QUEUES } = require("../queues/queueNames");
const { getEventsConnection, getBullMQPrefix } = require("../config/bullmq.config");
const { cron_logs } = require("../../winston/cronAutomation/logger");

let rulesEvents = null;
let syncEvents = null;
let spApiEvents = null;
let eventsConnection = null;

function setupQueueEventListeners(eventsInstance, queueName) {
  eventsInstance.on("waiting", ({ jobId }) => {
    // BullMQ waiting event
  });

  eventsInstance.on("active", ({ jobId, prev }) => {
    console.log(`[QueueEvents][${queueName}] Job active: ${jobId} (prev: ${prev})`);
  });

  eventsInstance.on("completed", ({ jobId, returnvalue }) => {
    console.log(`[QueueEvents][${queueName}] Job completed: ${jobId}`);
  });

  eventsInstance.on("failed", ({ jobId, failedReason, prev }) => {
    cron_logs({
      message: `[QueueEvents][${queueName}] Job failed: ${jobId}, reason: ${failedReason} (prev: ${prev})`,
      log_type: "error",
    });
  });

  eventsInstance.on("stalled", ({ jobId }) => {
    cron_logs({
      message: `[QueueEvents][${queueName}] Job stalled: ${jobId} (Lock expired or worker lost; BullMQ will re-queue)`,
      log_type: "warn",
    });
  });

  eventsInstance.on("progress", ({ jobId, data }) => {
    console.log(`[QueueEvents][${queueName}] Job progress: ${jobId}`, data);
  });

  eventsInstance.on("error", (err) => {
    cron_logs({
      message: `[QueueEvents][${queueName}] Queue error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
  });
}

function startQueueEventsObserver() {
  if (rulesEvents && syncEvents && spApiEvents) {
    return { rulesEvents, syncEvents, spApiEvents };
  }

  eventsConnection = getEventsConnection();

  rulesEvents = new QueueEvents(QUEUES.RULES, {
    connection: eventsConnection,
    prefix: getBullMQPrefix(),
  });

  syncEvents = new QueueEvents(QUEUES.HOURLY_SYNC, {
    connection: eventsConnection,
    prefix: getBullMQPrefix(),
  });

  spApiEvents = new QueueEvents(QUEUES.SP_API, {
    connection: eventsConnection,
    prefix: getBullMQPrefix(),
  });

  setupQueueEventListeners(rulesEvents, QUEUES.RULES);
  setupQueueEventListeners(syncEvents, QUEUES.HOURLY_SYNC);
  setupQueueEventListeners(spApiEvents, QUEUES.SP_API);

  console.log(`[QueueEvents] Started observer on ${os.hostname()} (pid: ${process.pid})`);

  return { rulesEvents, syncEvents, spApiEvents };
}

async function closeQueueEventsObserver() {
  const promises = [];
  if (rulesEvents) {
    promises.push(rulesEvents.close());
    rulesEvents = null;
  }
  if (syncEvents) {
    promises.push(syncEvents.close());
    syncEvents = null;
  }
  if (spApiEvents) {
    promises.push(spApiEvents.close());
    spApiEvents = null;
  }
  await Promise.allSettled(promises);

  if (eventsConnection) {
    await eventsConnection.quit().catch(() => {});
    eventsConnection = null;
  }
  console.log(`[QueueEvents] Observer closed gracefully.`);
}

// Standalone execution support
if (require.main === module) {
  startQueueEventsObserver();

  const handleShutdown = async (signal) => {
    console.log(`[QueueEvents] Received ${signal}, shutting down...`);
    await closeQueueEventsObserver();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

module.exports = {
  startQueueEventsObserver,
  closeQueueEventsObserver,
};
