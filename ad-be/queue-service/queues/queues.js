const { Queue } = require("bullmq");
const { QUEUES } = require("./queueNames");
const { rulesJobOptions, syncJobOptions, spApiJobOptions } = require("./jobOptions");
const { getProducerConnection, getBullMQPrefix } = require("../config/bullmq.config");

let rulesQueue = null;
let hourlySyncQueue = null;
let spApiQueue = null;
let asinSnapshotQueue = null;
let outOfStockAdsQueue = null;
let fcInventoryLedgerQueue = null;
let producerConnection = null;

function getQueues() {
  if (!producerConnection) {
    producerConnection = getProducerConnection();
  }

  if (!rulesQueue) {
    rulesQueue = new Queue(QUEUES.RULES, {
      connection: producerConnection,
      prefix: getBullMQPrefix(),
      defaultJobOptions: rulesJobOptions,
    });
  }

  if (!hourlySyncQueue) {
    hourlySyncQueue = new Queue(QUEUES.HOURLY_SYNC, {
      connection: producerConnection,
      prefix: getBullMQPrefix(),
      defaultJobOptions: syncJobOptions,
    });
  }

  if (!spApiQueue) {
    spApiQueue = new Queue(QUEUES.SP_API, {
      connection: producerConnection,
      prefix: getBullMQPrefix(),
      defaultJobOptions: spApiJobOptions,
    });
  }

  if (!asinSnapshotQueue) {
    asinSnapshotQueue = new Queue(QUEUES.ASIN_SNAPSHOT, {
      connection: producerConnection,
      prefix: getBullMQPrefix(),
      defaultJobOptions: spApiJobOptions,
    });
  }

  // Daily dashboard list; own lane so long SP-API imports can't delay it.
  if (!outOfStockAdsQueue) {
    outOfStockAdsQueue = new Queue(QUEUES.OUT_OF_STOCK_ADS, {
      connection: producerConnection,
      prefix: getBullMQPrefix(),
      defaultJobOptions: spApiJobOptions,
    });
  }

  if (!fcInventoryLedgerQueue) {
    fcInventoryLedgerQueue = new Queue(QUEUES.FC_INVENTORY_LEDGER, {
      connection: producerConnection,
      prefix: getBullMQPrefix(),
      defaultJobOptions: spApiJobOptions,
    });
  }

  return {
    rulesQueue,
    hourlySyncQueue,
    spApiQueue,
    asinSnapshotQueue,
    outOfStockAdsQueue,
    fcInventoryLedgerQueue,
  };
}

async function closeQueues() {
  const closePromises = [];
  if (rulesQueue) {
    closePromises.push(rulesQueue.close());
    rulesQueue = null;
  }
  if (hourlySyncQueue) {
    closePromises.push(hourlySyncQueue.close());
    hourlySyncQueue = null;
  }
  if (spApiQueue) {
    closePromises.push(spApiQueue.close());
    spApiQueue = null;
  }
  if (asinSnapshotQueue) {
    closePromises.push(asinSnapshotQueue.close());
    asinSnapshotQueue = null;
  }
  if (outOfStockAdsQueue) {
    closePromises.push(outOfStockAdsQueue.close());
    outOfStockAdsQueue = null;
  }
  if (fcInventoryLedgerQueue) {
    closePromises.push(fcInventoryLedgerQueue.close());
    fcInventoryLedgerQueue = null;
  }
  await Promise.allSettled(closePromises);

  if (producerConnection) {
    await producerConnection.quit().catch(() => {});
    producerConnection = null;
  }
}

module.exports = {
  getQueues,
  closeQueues,
};
