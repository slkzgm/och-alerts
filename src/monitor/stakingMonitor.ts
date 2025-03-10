// path: src/monitor/stakingMonitor.ts
// Dev note: Purely real-time monitor without historical sync.
// We store in memory all tokens that the DB believes is unrevealed.
// When we detect a "Staked" event for one of these tokens,
// we wait 15s, fetch metadata, and only mark isRevealed=true if `metadata.image` != the unrevealed URL.

import { createPublicClient, webSocket, parseAbiItem, type Log } from "viem";
import { abstract } from "viem/chains";

import { STAKING_CONTRACT_ADDRESS, WS_RPC_URL } from "../config";
import { Hero } from "../db/hero.model";
import { setHeroRevealed } from "../utils/heroRevealCheck";
import { tweetReveal } from "../twitter/twitter";
import axios from "axios";
import { sharedWsClient } from "../client/wsClient"; // We'll do a direct axios call to metadata here or you can import fetchMetadata function

const STAKING_EVENT_ABI = parseAbiItem(
  "event Staked(address owner, uint256 tokenId, uint256 timestamp)"
);

const unrevealedTokensSet: Set<number> = new Set();
const UNREVEALED_URL = "https://storage.onchainheroes.xyz/unrevealed/hero.gif";

/**
 * Start the real-time monitor:
 *  1) Load all unrevealed tokens from DB into memory.
 *  2) Subscribe to "Staked" event over WebSocket.
 */
export async function monitorStakingEvents() {
  console.log("[monitorStakingEvents] Starting real-time monitor...");
  await loadUnrevealedTokens();
  watchNewEvents();
  console.log("[monitorStakingEvents] Real-time monitoring is active.");
}

/**
 * Load all tokens that are isRevealed=false from DB into an in-memory Set.
 */
async function loadUnrevealedTokens() {
  console.log("[monitorStakingEvents] Loading unrevealed tokens from DB...");
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
}

/**
 * Set up the WebSocket subscription for the "Staked" event.
 */
function watchNewEvents() {
  sharedWsClient.watchEvent({
    address: STAKING_CONTRACT_ADDRESS as `0x${string}`,
    event: STAKING_EVENT_ABI,
    onLogs: async (logs: Log[]) => {
      for (const log of logs) {
        const { owner, tokenId } = log.args as {
          owner: string;
          tokenId: bigint;
          timestamp: bigint;
        };
        await handleStakingLog(owner, tokenId);
      }
    },
    onError: (err: any) => {
      console.error("[watchNewEvents] WebSocket error:", err);
    },
  });
}

/**
 * If token is still in `unrevealedTokensSet`, we wait 15s, fetch metadata,
 * and if the image is NOT the unrevealed URL, we tweet + set DB isRevealed=true.
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

      const level = (metadata?.attributes.find(
        (attr) => attr.trait_type === "Season 1 Level"
      )).value;

      // Otherwise, it's revealed => tweet and update DB

      if (level > 1) {
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
