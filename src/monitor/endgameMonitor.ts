// path: src/monitor/endgameMonitor.ts
/**
 * This file monitors the "Death" event from the Endgame contract
 * with enhanced error handling and reconnection capabilities.
 */

import { parseAbiItem, type Log } from "viem";
import { ENDGAME_CONTRACT_ADDRESS } from "../config";
import axios from "axios";
import { tweetDeath } from "../twitter/twitter";
import {
  watchEventWithErrorHandling,
  registerSubscription,
} from "../clients/wsClient";

const DEATH_EVENT_ABI = parseAbiItem("event Death(uint256 id)");
const METADATA_BASE_URI = "https://api.onchainheroes.xyz/hero/";

/**
 * Handle a single Death event log
 */
async function handleDeathLog(heroIdBig: bigint) {
  const heroIdNum = Number(heroIdBig);

  console.log(`[handleDeathLog] Received Death event for hero #${heroIdNum}.`);

  try {
    // Fetch metadata to include in the tweet
    const metadataUrl = `${METADATA_BASE_URI}${heroIdNum}`;
    console.log(
      `[handleDeathLog] Fetching hero #${heroIdNum} metadata from: ${metadataUrl}`
    );

    const res = await axios.get(metadataUrl, { timeout: 10000 });
    const metadata = res.data;

    const levelAttr = metadata?.attributes?.find(
      (attr: any) => attr.trait_type === "Season 1 Level"
    );
    const level = levelAttr ? levelAttr.value : undefined;

    // Tweet about hero death
    await tweetDeath(heroIdNum.toString(), metadata?.image, level);

    console.log(
      `[handleDeathLog] Hero #${heroIdNum} death tweet sent successfully.`
    );
  } catch (error) {
    console.error(
      `[handleDeathLog] Failed handling death for hero #${heroIdNum}:`,
      error
    );
    // Log but don't rethrow - we want to continue monitoring
  }
}

/**
 * Set up the event subscription with error handling
 */
function setupDeathEventSubscription() {
  console.log(
    "[monitorEndgameEvents] Setting up event subscription for Death events..."
  );

  // Use the enhanced watchEventWithErrorHandling function
  watchEventWithErrorHandling({
    address: ENDGAME_CONTRACT_ADDRESS as `0x${string}`,
    event: DEATH_EVENT_ABI,
    onLogs: async (logs: Log[]) => {
      for (const log of logs) {
        try {
          const { id } = log.args as { id: bigint };
          await handleDeathLog(id);
        } catch (error) {
          console.error(
            "[monitorEndgameEvents] Error processing death log:",
            error
          );
          // Continue with next log even if one fails
        }
      }
    },
    onError: (err: any) => {
      console.error("[monitorEndgameEvents] WebSocket error:", err);
      // No need to rethrow - our wrapper will handle errors properly
    },
  });
}

/**
 * Initialize monitoring with registration for reconnection
 */
export async function monitorEndgameEvents() {
  console.log("[monitorEndgameEvents] Starting Endgame monitor...");

  // Initial setup
  setupDeathEventSubscription();

  // Register for reconnection handling
  registerSubscription(() => {
    console.log(
      "[monitorEndgameEvents] Reconnecting - resetting event subscription..."
    );
    setupDeathEventSubscription();
  });

  console.log("[monitorEndgameEvents] Endgame monitoring is active.");
}
