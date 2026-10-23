/**
 * Standard graceful shutdown orchestrator for Queue workers and producers.
 */
function registerGracefulShutdown({
  serviceName,
  onShutdown,
  timeoutMs = parseInt(process.env.QUEUE_SHUTDOWN_TIMEOUT_MS, 10) || 120000,
}) {
  let isShuttingDown = false;

  const shutdownHandler = async (signal) => {
    if (isShuttingDown) {
      console.warn(`[Shutdown][${serviceName}] Shutdown already in progress. Ignoring repeated ${signal}.`);
      return;
    }
    isShuttingDown = true;
    console.log(`[Shutdown][${serviceName}] Received ${signal}. Initiating graceful shutdown (timeout: ${timeoutMs}ms)...`);

    // Safety force exit timer
    const forceExitTimer = setTimeout(() => {
      console.error(`[Shutdown][${serviceName}] Shutdown timed out after ${timeoutMs}ms. Forcing process exit.`);
      process.exit(1);
    }, timeoutMs);

    if (forceExitTimer.unref) {
      forceExitTimer.unref();
    }

    try {
      if (typeof onShutdown === "function") {
        await onShutdown(signal);
      }
      console.log(`[Shutdown][${serviceName}] Shutdown completed cleanly.`);
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      console.error(`[Shutdown][${serviceName}] Error during shutdown:`, err);
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
  process.on("SIGINT", () => shutdownHandler("SIGINT"));

  return {
    isShuttingDown: () => isShuttingDown,
  };
}

module.exports = {
  registerGracefulShutdown,
};
