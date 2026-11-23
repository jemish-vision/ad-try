const moment = require("moment-timezone");
const { setTimeout: sleep } = require("node:timers/promises");

function historicalDateRange(days, now = moment.utc()) {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error("Historical sync days must be a positive integer");
  }
  const end = now.clone().subtract(1, "day");
  return {
    startDate: end.clone().subtract(days - 1, "days").format("YYYY-MM-DD"),
    endDate: end.format("YYYY-MM-DD"),
  };
}

function splitSyncDateRange(startDate, endDate) {
  const cursor = moment.utc(startDate, "YYYY-MM-DD", true);
  const end = moment.utc(endDate, "YYYY-MM-DD", true);
  if (!cursor.isValid() || !end.isValid() || cursor.isAfter(end)) {
    throw new Error(`Invalid profile sync date range: ${startDate} to ${endDate}`);
  }
  const ranges = [];
  while (cursor.isSameOrBefore(end, "day")) {
    const chunkEnd = moment.min(cursor.clone().add(29, "days"), end);
    ranges.push({ startDate: cursor.format("YYYY-MM-DD"), endDate: chunkEnd.format("YYYY-MM-DD") });
    cursor.add(30, "days");
  }
  return ranges;
}

function brandAnalyticsWeeks(startDate, endDate) {
  const start = moment.utc(startDate, "YYYY-MM-DD", true).day(0);
  const end = moment.utc(endDate, "YYYY-MM-DD", true);
  const weeks = [];
  for (let saturday = start.clone().add(6, "days"); saturday.isSameOrBefore(end); saturday.add(7, "days")) {
    weeks.push({
      startDate: saturday.clone().subtract(6, "days").format("YYYY-MM-DD"),
      endDate: saturday.format("YYYY-MM-DD"),
    });
  }
  return weeks;
}

const positiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
};

async function runHistoricalSyncQueue(jobs, {
  execute, fail, onError = () => {},
  maxAttempts = positiveInteger(process.env.MAX_AUTO_CRON_LIMIT, 3),
  retryDelay = positiveInteger(process.env.RETRY_DELAY_MS ?? process.env.RETRY_DELAT_MS, 60000),
  timeout = positiveInteger(process.env.HISTORICAL_SYNC_POLL_TIMEOUT_MS, 30 * 60 * 1000),
  wait = sleep,
  now = Date.now,
}) {
  const tasks = jobs.map(job => ({ job, attempts: 0, status: "PENDING", error: null }));
  async function run(task, phase) {
    if (phase !== "poll") task.attempts++;
    task.error = null;
    try {
      const result = await execute(task.job, phase);
      task.status = result?.status;
      task.error = result?.error;
      if (task.status !== "COMPLETED" && (task.status !== "PENDING" || !task.job.isReport)) {
        task.status = "FAILED";
      }
    } catch (error) {
      task.status = "FAILED";
      task.error = error.message;
      onError(task.job, error);
    }
  }

  // Finish the sequential first pass before checking Amazon for any results.
  for (const task of tasks) await run(task, task.job.isReport ? "submit" : undefined);

  const deadline = now() + timeout;
  const canRetry = task => task.status === "FAILED" && task.attempts < maxAttempts;
  let round = 0;
  while (now() < deadline && tasks.some(task => task.status === "PENDING" || canRetry(task))) {
    const immediatePoll = round++ === 0 && tasks.some(task => task.status === "PENDING");
    if (!immediatePoll) {
      await wait(Math.min(retryDelay, Math.max(0, deadline - now())));
    }
    for (const task of tasks) {
      if (now() >= deadline) break;
      if (task.status === "PENDING") await run(task, "poll");
    }
    if (immediatePoll) continue;
    for (const task of tasks) {
      if (now() >= deadline) break;
      if (canRetry(task)) {
        await run(task, task.job.isReport ? "submit" : undefined);
      }
    }
  }

  for (const task of tasks) {
    if (task.status === "COMPLETED") continue;
    const error = task.status === "PENDING"
      ? "Historical report polling timed out; previously submitted reports can be resumed"
      : task.error || "Historical cron did not complete within its retry limit";
    task.status = "FAILED";
    task.error = error;
    try {
      await fail(task.job, error);
    } catch (error) {
      onError(task.job, error);
    }
  }
  return tasks;
}

module.exports = { historicalDateRange, splitSyncDateRange, brandAnalyticsWeeks, runHistoricalSyncQueue };
