// src/index.ts

/**
 * This file is the entry point of the application.
 */

import { monitorStakingEvents } from "./stakingMonitor";
import { initTwitterClient } from './twitter';

async function main() {
    try {
        console.log("[main] Starting staking monitor...");
        await initTwitterClient();
        await monitorStakingEvents();
    } catch (error) {
        console.error("[main] Error in main application flow:", error);
        process.exit(1);
    }
}

main();
