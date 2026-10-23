const rulesJobOptions = Object.freeze({
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 100,
});

const syncJobOptions = Object.freeze({
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 30000,
  },
  removeOnComplete: 500,
  removeOnFail: 200,
});

const spApiJobOptions = Object.freeze({
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 60000, // 1 min backoff
  },
  removeOnComplete: 200,
  removeOnFail: 100,
});

module.exports = {
  rulesJobOptions,
  syncJobOptions,
  spApiJobOptions,
};
