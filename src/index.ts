// path: src/index.ts
// Dev note: Main entry point. We connect to DB, init Twitter, start monitoring, and also start the reveal queue processing loop.

import { monitorStakingEvents } from "./monitor/stakingMonitor";
import { initTwitterClient } from "./twitter/twitter";
import { connectMongoDB } from "./db";
import { MONGO_URI } from "./config";
import { startQueueProcessing } from "./monitor/revealQueue";
import { monitorEndgameEvents } from "./monitor/endgameMonitor";

async function main() {
  try {
    console.log("[main] Starting application...");
    await connectMongoDB(MONGO_URI);
    await initTwitterClient();

    // Start monitoring staking events
    await monitorStakingEvents();

    // Start monitoring death events (new logic)
    await monitorEndgameEvents();

    // Start the reveal queue processing loop
    startQueueProcessing();
  } catch (error) {
    console.error("[main] Error in main application flow:", error);
    process.exit(1);
  }
}

main();
