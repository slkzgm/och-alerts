// path: src/scripts/initMetadata.ts
// Dev note: This script only processes the tokens that are missing in the DB or are still flagged as "unrevealed".
// It uses concurrency (p-limit), retry logic per token, and multiple global loops to ensure robust fetching.

import axios from 'axios';
import { connectMongoDB } from '../db';
import { Hero } from '../db/hero.model';
import { MONGO_URI } from '../config';
import pLimit from 'p-limit';

const NFT_COLLECTION_BASE_URI = "https://api.onchainheroes.xyz/hero/";
const CONCURRENCY_LIMIT = 50;
const MAX_RETRIES_PER_TOKEN = 5;

// We can do a maximum of 5 full global loops, each trying to fetch what's left
const MAX_FULL_LOOP = 5;

// Define the total NFT range if needed (1..10k)
const START_TOKEN_ID = 1;
const END_TOKEN_ID = 10000;

/**
 * Build the list of token IDs we actually want to process:
 *  1) Any token ID not present in the DB at all.
 *  2) Any token in the DB marked as isRevealed = false.
 */
async function getTokensToUpdate(): Promise<number[]> {
    // Create a simple array of all token IDs
    const allTokens = Array.from(
        { length: END_TOKEN_ID - START_TOKEN_ID + 1 },
        (_, i) => START_TOKEN_ID + i
    );

    // Get all tokens in DB that are unrevealed
    const dbUnrevealed = await Hero.find({ isRevealed: false }, { tokenId: 1 }).lean();
    const dbUnrevealedIds = dbUnrevealed.map(h => h.tokenId);

    // Get the set of tokenIds that exist in the DB (any state)
    const dbAllIds = await Hero.distinct("tokenId");

    // Find tokenIds that are not in the DB at all
    const missingIds = allTokens.filter(id => !dbAllIds.includes(id));

    // Combine unrevealed + missing
    const combinedSet = new Set([...dbUnrevealedIds, ...missingIds]);
    const tokensToUpdate = Array.from(combinedSet).sort((a, b) => a - b);

    console.log(`[initMetadata] Found ${tokensToUpdate.length} tokens to process (missing or unrevealed).`);
    return tokensToUpdate;
}

/**
 * Fetch & store metadata with up to MAX_RETRIES_PER_TOKEN attempts (per token).
 */
async function fetchAndStoreMetadata(tokenId: number, attempt = 1): Promise<void> {
    const metadataUrl = `${NFT_COLLECTION_BASE_URI}${tokenId}`;

    try {
        // Optional: if you wanted to check the DB again (e.g., if we skip if it's revealed),
        // you could do it here. But we already built the "tokensToUpdate" list, so not strictly needed.

        const res = await axios.get(metadataUrl, { timeout: 10000 });
        const metadata = res.data;

        const isRevealed = !metadata.image.includes("unrevealed");

        await Hero.findOneAndUpdate(
            { tokenId },
            {
                tokenId,
                name: metadata.name,
                description: metadata.description,
                image: metadata.image,
                attributes: metadata.attributes || [],
                isRevealed,
            },
            { upsert: true }
        );

        console.log(`[initMetadata] Token #${tokenId} upserted (revealed=${isRevealed}, attempt=${attempt}).`);
    } catch (err: any) {
        console.error(`[initMetadata] Error fetching #${tokenId} on attempt ${attempt}:`, err.message);

        // Retry logic
        if (attempt < MAX_RETRIES_PER_TOKEN) {
            console.log(`[initMetadata] Retrying #${tokenId} (attempt ${attempt + 1})...`);
            await fetchAndStoreMetadata(tokenId, attempt + 1);
        } else {
            throw new Error(`[initMetadata] Max retries reached for token #${tokenId}. Last error: ${err.message}`);
        }
    }
}

/**
 * Process a batch of token IDs with concurrency limiting.
 * Returns an array of token IDs that still failed after all attempts.
 */
async function processTokenRange(tokenIds: number[]): Promise<number[]> {
    const limit = pLimit(CONCURRENCY_LIMIT);
    const failedTokens: number[] = [];

    const tasks = tokenIds.map(tokenId => limit(async () => {
        try {
            await fetchAndStoreMetadata(tokenId);
        } catch (err) {
            // If it throws, it means it failed after all retries for this token
            failedTokens.push(tokenId);
        }
    }));

    await Promise.all(tasks);
    return failedTokens;
}

/**
 * Main function that repeats attempts in global loops until either success or hitting MAX_FULL_LOOP.
 */
async function initAllMetadata() {
    // Build the initial list of tokens that are missing or unrevealed
    let pendingTokens = await getTokensToUpdate();

    if (pendingTokens.length === 0) {
        console.log("[initMetadata] Nothing to update. All tokens are already in DB and revealed.");
        return;
    }

    let fullLoopCount = 0;

    while (pendingTokens.length > 0 && fullLoopCount < MAX_FULL_LOOP) {
        fullLoopCount++;
        console.log(`[initMetadata] Full loop #${fullLoopCount} - processing ${pendingTokens.length} tokens...`);

        const failed = await processTokenRange(pendingTokens);

        if (failed.length === 0) {
            console.log(`[initMetadata] All tokens processed successfully in loop #${fullLoopCount}.`);
            return;
        } else {
            console.warn(`[initMetadata] ${failed.length} tokens failed in loop #${fullLoopCount}. Will retry them...`);
            pendingTokens = failed;
        }
    }

    // If we exit the loop, check if there's anything left
    if (pendingTokens.length === 0) {
        console.log("[initMetadata] Successfully processed all tokens!");
    } else {
        console.error("[initMetadata] Some tokens could not be processed after all loops:", pendingTokens);
    }
}

/**
 * Entry point for the script: connect to MongoDB, then run initAllMetadata.
 */
(async () => {
    try {
        await connectMongoDB(MONGO_URI);
        console.log("[initMetadata] Starting metadata initialization...");
        await initAllMetadata();
        console.log("[initMetadata] Completed!");
        process.exit(0);
    } catch (error) {
        console.error("[initMetadata] Fatal error:", error);
        process.exit(1);
    }
})();
