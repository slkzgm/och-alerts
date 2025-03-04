// path: src/monitor/endgameMonitor.ts
/**
 * This file monitors the "Death" event from the Endgame contract (CA: 0xeea334b302bd8b1b96d4ef73b8f4467a347da6f0)
 * and tweets when a hero has died. The logic closely follows the existing structure and best practices
 * seen in stakingMonitor.ts, with a safe production-ready approach and all logs/comments in English.
 */

import { createPublicClient, webSocket, parseAbiItem, type Log } from "viem";
import { abstract } from "viem/chains";

import { ENDGAME_CONTRACT_ADDRESS, WS_RPC_URL } from "../config"; // We'll add ENDGAME_CONTRACT_ADDRESS in config.ts
import axios from "axios";
import { tweetDeath } from "../twitter/twitter";
import { sharedWsClient } from "../client/wsClient"; // We'll add a new tweetDeath function, similar to tweetReveal.

const DEATH_EVENT_ABI = parseAbiItem("event Death(uint256 id)");

/**
 * Example metadata endpoint (assuming the same structure as for reveals).
 * Adjust if your endpoints differ for "dead heroes".
 */
const METADATA_BASE_URI = "https://api.onchainheroes.xyz/hero/";

/**
 * Start monitoring the Endgame contract for "Death" events.
 * Call this function from your main entry point (e.g. src/index.ts).
 */
export async function monitorEndgameEvents() {
  console.log("[monitorEndgameEvents] Starting real-time Endgame monitor...");

  sharedWsClient.watchEvent({
    address: ENDGAME_CONTRACT_ADDRESS as `0x${string}`,
    event: DEATH_EVENT_ABI,
    onLogs: async (logs: Log[]) => {
      for (const log of logs) {
        const { id } = log.args as { id: bigint };
        await handleDeathLog(id);
      }
    },
    onError: (err: any) => {
      console.error("[monitorEndgameEvents] WebSocket error:", err);
    },
  });

  console.log("[monitorEndgameEvents] Real-time Endgame monitoring is active.");
}

/**
 * Handles a single "Death" log. We parse heroId, optionally wait a few seconds,
 * fetch metadata to confirm, tweet, and mark the hero as dead in DB.
 */
async function handleDeathLog(heroIdBig: bigint) {
  const heroIdNum = Number(heroIdBig);

  console.log(
    `[handleDeathLog] Received Death event for hero #${heroIdNum}. Checking DB...`
  );

  try {
    // Attempt to fetch metadata (if you want to include image or other info in the tweet)
    const metadataUrl = `${METADATA_BASE_URI}${heroIdNum}`;
    console.log(
      `[handleDeathLog] Fetching hero #${heroIdNum} metadata from: ${metadataUrl}`
    );

    const res = await axios.get(metadataUrl, { timeout: 10000 });
    const metadata = res.data;
    const level = (metadata?.attributes.find(
      (attr) => attr.trait_type === "Season 1 Level"
    )).value;

    // Tweet about hero death
    await tweetDeath(heroIdNum.toString(), metadata?.image, level);

    console.log(
      `[handleDeathLog] Hero #${heroIdNum} marked as dead and tweet sent.`
    );
  } catch (error) {
    console.error(
      `[handleDeathLog] Failed handling death for hero #${heroIdNum}:`,
      error
    );
  }
}
