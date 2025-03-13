// path: src/monitor/stakingMonitor.ts
/**
 * Monitor for staking events with enhanced error handling and reconnection capabilities.
 * Uses the improved WebSocket client for robust operation.
 */

import { parseAbiItem, type Log } from "viem";
import { STAKING_CONTRACT_ADDRESS } from "../config";
import { Hero } from "../db/hero.model";
import { setHeroRevealed } from "../utils/heroRevealCheck";
import { tweetReveal } from "../twitter/twitter";
import axios from "axios";
import {
  watchEventWithErrorHandling,
  registerSubscription,
} from "../clients/wsClient";

const STAKING_EVENT_ABI = parseAbiItem(
  "event Staked(address owner, uint256 tokenId, uint256 timestamp)"
);

const unrevealedTokensSet: Set<number> = new Set();
const UNREVEALED_URL = "https://storage.onchainheroes.xyz/unrevealed/hero.gif";

/**
 * Handle a single staking event log
 */
async function handleStakingLog(owner: string, tokenIdBig: bigint) {
  const tokenIdNum = Number(tokenIdBig);

  if (!unrevealedTokensSet.has(tokenIdNum)) {
    // It's either already revealed or not relevant
    return;
  }

  console.log(
    `[handleStakingLog] Token #${tokenIdNum} is unrevealed; scheduling metadata fetch...`
  );

  setTimeout(async () => {
    try {
      const metadataUrl = `https://api.onchainheroes.xyz/hero/${tokenIdNum}`;
      console.log(
        `[handleStakingLog] Fetching metadata for token #${tokenIdNum} at: ${metadataUrl}`
      );
      const res = await axios.get(metadataUrl, { timeout: 10000 });
      const metadata = res.data;

      // If image is still "unrevealed" => do nothing
      if (metadata.image === UNREVEALED_URL) {
        console.log(
          `[handleStakingLog] Token #${tokenIdNum} is STILL unrevealed. Not setting DB to revealed.`
        );
        return;
      }

      const levelAttr = metadata?.attributes?.find(
        (attr: any) => attr.trait_type === "Season 1 Level"
      );
      const level = levelAttr ? levelAttr.value : undefined;

      // Otherwise, it's revealed => tweet and update DB
      if (level && level > 1) {
        console.log(
          `[handleStakingLog] Token #${tokenIdNum} level > 1. Already revealed.`
        );
      } else {
        console.log(
          `[handleStakingLog] Token #${tokenIdNum} is revealed! Tweeting now...`
        );
        await tweetReveal(tokenIdNum.toString(), owner, metadata.image);
      }

      await setHeroRevealed(tokenIdNum.toString());
      unrevealedTokensSet.delete(tokenIdNum);
      console.log(
        `[handleStakingLog] Token #${tokenIdNum} marked revealed and removed from set.`
      );
    } catch (error) {
      console.error(
        `[handleStakingLog] Failed to fetch or reveal token #${tokenIdNum}:`,
        error
      );
      // If you want a more robust retry, keep token in set (which we do by default).
      // We'll attempt again next time we see a "Staked" event, or after re-running initMetadata.
    }
  }, 15_000);
}

/**
 * Load all tokens that are isRevealed=false from DB into an in-memory Set.
 */
async function loadUnrevealedTokens() {
  console.log("[monitorStakingEvents] Loading unrevealed tokens from DB...");
  try {
    const unrevealedHeroes = await Hero.find(
      { isRevealed: false },
      { tokenId: 1 }
    ).lean();

    for (const hero of unrevealedHeroes) {
      unrevealedTokensSet.add(hero.tokenId);
    }

    console.log(
      `[monitorStakingEvents] Loaded ${unrevealedHeroes.length} unrevealed tokens into memory.`
    );
  } catch (error) {
    console.error(
      "[monitorStakingEvents] Error loading unrevealed tokens:",
      error
    );
    // Allow continuation with empty set - we'll retry loading on reconnection
  }
}

/**
 * Set up the event subscription with error handling
 */
function setupEventSubscription() {
  console.log(
    "[monitorStakingEvents] Setting up event subscription for Staked events..."
  );

  // Use the enhanced watchEventWithErrorHandling function
  watchEventWithErrorHandling({
    address: STAKING_CONTRACT_ADDRESS as `0x${string}`,
    event: STAKING_EVENT_ABI,
    onLogs: async (logs: Log[]) => {
      for (const log of logs) {
        try {
          const { owner, tokenId } = log.args as {
            owner: string;
            tokenId: bigint;
            timestamp: bigint;
          };
          await handleStakingLog(owner, tokenId);
        } catch (error) {
          console.error("[monitorStakingEvents] Error processing log:", error);
          // Continue with next log even if one fails
        }
      }
    },
    onError: (err: any) => {
      console.error("[monitorStakingEvents] WebSocket error:", err);
      // No need to rethrow - our wrapper will handle errors properly
    },
  });
}

/**
 * Initialize monitoring with registration for reconnection
 */
export async function monitorStakingEvents() {
  console.log("[monitorStakingEvents] Starting staking event monitor...");

  // Initial setup
  await loadUnrevealedTokens();
  setupEventSubscription();

  // Register for reconnection handling
  registerSubscription(async () => {
    console.log(
      "[monitorStakingEvents] Reconnecting - reloading unrevealed tokens..."
    );
    await loadUnrevealedTokens();
    setupEventSubscription();
  });

  console.log("[monitorStakingEvents] Staking event monitoring is active.");
}
