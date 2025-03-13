// path: src/index.ts
/**
 * Main entry point with enhanced error handling and process event listeners
 * to ensure the application can handle errors gracefully and remain running.
 */

import { monitorStakingEvents } from "./monitor/stakingMonitor";
import { initTwitterClient } from "./twitter/twitter";
import { connectMongoDB } from "./db";
import { MONGO_URI } from "./config";
import { startQueueProcessing } from "./monitor/revealQueue";
import { monitorEndgameEvents } from "./monitor/endgameMonitor";

// Set up global error handlers to prevent app crashes
process.on("uncaughtException", (error) => {
  console.error("[PROCESS] Uncaught Exception:", error);
  // Don't exit the process - we want to keep running despite errors
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[PROCESS] Unhandled Promise Rejection:", reason);
  // Don't exit the process - we want to keep running despite errors
});

// Graceful shutdown handler
function setupGracefulShutdown() {
  const signals = ["SIGINT", "SIGTERM", "SIGUSR2"];

  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`[PROCESS] Received ${signal}, shutting down gracefully...`);

      try {
        // Any cleanup logic would go here
        // Allow time for final operations and log flushing
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log("[PROCESS] Graceful shutdown completed.");
      } catch (err) {
        console.error("[PROCESS] Error during graceful shutdown:", err);
      }

      process.exit(0);
    });
  }
}

/**
 * Main application function with enhanced error handling.
 * Each component is wrapped in try-catch to ensure failures
 * in one component don't prevent others from starting.
 */
async function main() {
  console.log("[main] Starting application...");
  setupGracefulShutdown();

  // Connect to MongoDB with retry logic
  let mongoConnected = false;
  const maxMongoRetries = 5;
  let mongoRetryCount = 0;

  while (!mongoConnected && mongoRetryCount < maxMongoRetries) {
    try {
      mongoRetryCount++;
      await connectMongoDB(MONGO_URI);
      mongoConnected = true;
      console.log("[main] MongoDB connection established successfully.");
    } catch (error) {
      const retryDelay = Math.min(1000 * 2 ** mongoRetryCount, 30000);
      console.error(
        `[main] MongoDB connection failed (attempt ${mongoRetryCount}/${maxMongoRetries}). Retrying in ${retryDelay / 1000}s...`,
        error
      );
      if (mongoRetryCount < maxMongoRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        console.error(
          "[main] Maximum MongoDB connection retries reached. Continuing without MongoDB..."
        );
        // We'll continue initialization but some features might not work
      }
    }
  }

  // Initialize Twitter client
  try {
    await initTwitterClient();
    console.log("[main] Twitter client initialized successfully.");
  } catch (error) {
    console.error("[main] Failed to initialize Twitter client:", error);
    console.log("[main] Continuing without Twitter functionality...");
    // Continue without Twitter - the app can still monitor events
  }

  // Start monitoring staking events
  try {
    await monitorStakingEvents();
    console.log("[main] Staking events monitoring started successfully.");
  } catch (error) {
    console.error("[main] Failed to start staking events monitoring:", error);
    // Continue with other components
  }

  // Start monitoring death events
  try {
    await monitorEndgameEvents();
    console.log("[main] Endgame events monitoring started successfully.");
  } catch (error) {
    console.error("[main] Failed to start endgame events monitoring:", error);
    // Continue with other components
  }

  // Start the reveal queue processing
  try {
    startQueueProcessing();
    console.log("[main] Reveal queue processing started successfully.");
  } catch (error) {
    console.error("[main] Failed to start reveal queue processing:", error);
    // Continue anyway
  }

  console.log("[main] Application startup complete. Service is now running.");

  // Keep the process alive
  setInterval(() => {
    console.log("[main] Service heartbeat - still running.");
  }, 1800000); // Log every 30 minutes as a heartbeat
}

// Start the application
main().catch((error) => {
  console.error("[main] Critical error in main application flow:", error);
  // Even if main() fails, we don't exit
});
