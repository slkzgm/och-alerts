// path: src/monitor/stakingMonitor.ts
// Dev note: This file sets up a purely real-time monitor via WebSocket. It loads the set of unrevealed tokens from the DB,
// listens for the "Staked" event, and when it sees a token that's in our unrevealed set, it waits 15s, fetches metadata,
// and if revealed, tweets + updates the DB and removes it from our local set.

import {
    createPublicClient,
    webSocket,
    parseAbiItem,
    type Log
} from "viem";
import { abstract } from "viem/chains";

import { STAKING_CONTRACT_ADDRESS, WS_RPC_URL } from "../config";
import { Hero } from "../db/hero.model";
import { fetchMetadataAndAlert } from "../utils/metadata";
import { setHeroRevealed } from "../utils/heroRevealCheck";

// Define the ABI for the "Staked" event.
// This ensures viem will filter & decode logs correctly before calling onLogs.
const STAKING_EVENT_ABI = parseAbiItem(
    "event Staked(address owner, uint256 tokenId, uint256 timestamp)"
);

// Create a WebSocket client for real-time event watching
const wsClient = createPublicClient({
    chain: abstract,
    transport: webSocket(WS_RPC_URL),
});

/**
 * This in-memory Set holds all token IDs that the DB considers unrevealed.
 * Whenever a "Staked" event involves one of these token IDs, we'll attempt to fetch its metadata.
 */
const unrevealedTokensSet: Set<number> = new Set();

/**
 * Main function to start the real-time monitor:
 *  1. Load all unrevealed tokens from MongoDB into an in-memory Set.
 *  2. Listen for "Staked" events over WebSocket.
 *  3. If a token is in the unrevealed set, wait 15s, fetch metadata, tweet, and mark as revealed if applicable.
 */
export async function monitorStakingEvents() {
    console.log("[monitorStakingEvents] Starting real-time monitor...");
    await loadUnrevealedTokens();
    watchNewEvents();
    console.log("[monitorStakingEvents] Real-time monitoring is active.");
}

/**
 * Load from the DB all tokens that are marked `isRevealed=false`.
 * Add them to the `unrevealedTokensSet`.
 */
async function loadUnrevealedTokens() {
    console.log("[monitorStakingEvents] Loading unrevealed tokens from DB...");
    const unrevealedHeroes = await Hero.find({ isRevealed: false }, { tokenId: 1 }).lean();
    for (const hero of unrevealedHeroes) {
        unrevealedTokensSet.add(hero.tokenId);
    }
    console.log(`[monitorStakingEvents] Loaded ${unrevealedHeroes.length} unrevealed tokens into memory.`);
}

/**
 * Set up a WebSocket subscription to the "Staked" event.
 * By providing the parsed STAKING_EVENT_ABI, viem will only send logs that match that event signature
 * and will auto-decode them into `log.args`.
 */
function watchNewEvents() {
    wsClient.watchEvent({
        address: STAKING_CONTRACT_ADDRESS as `0x${string}`,
        event: STAKING_EVENT_ABI,
        onLogs: async (logs: Log[]) => {
            for (const log of logs) {
                const { owner, tokenId } = log.args as {
                    owner: string;
                    tokenId: bigint;
                    timestamp: bigint; // not used here, but present if needed
                };
                await handleStakingLog(owner, tokenId);
            }
        },
        onError: (err: any) => {
            console.error("[watchNewEvents] WebSocket error:", err);
        }
    });
}

/**
 * Handles one "Staked" log. We check if the token is still in `unrevealedTokensSet`.
 * If not, we skip. If yes, we wait 15s, then fetch metadata, tweet if revealed, and update the DB.
 */
async function handleStakingLog(owner: string, tokenIdBig: bigint) {
    const tokenIdNum = Number(tokenIdBig);

    // If not in the set, we consider it already revealed or not relevant.
    if (!unrevealedTokensSet.has(tokenIdNum)) {
        return;
    }

    console.log(`[handleStakingLog] Token #${tokenIdNum} is unrevealed; scheduling metadata fetch...`);

    // Delay 15 seconds to ensure the metadata is fully updated on the external API
    setTimeout(async () => {
        try {
            // fetchMetadataAndAlert will attempt to fetch the NFT metadata and tweet if revealed
            await fetchMetadataAndAlert(tokenIdNum.toString(), owner);

            // If it was actually revealed, we set it in DB
            await setHeroRevealed(tokenIdNum.toString());

            // Remove from the set so we don't retry on subsequent "Staked" events
            unrevealedTokensSet.delete(tokenIdNum);
            console.log(`[handleStakingLog] Token #${tokenIdNum} is now revealed. Removed from set.`);
        } catch (error) {
            console.error(`[handleStakingLog] Failed to fetch or reveal token #${tokenIdNum}:`, error);
            // If you want to retry automatically, consider leaving it in the set or introducing a queue system.
        }
    }, 15_000);
}
