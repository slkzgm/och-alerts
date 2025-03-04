// path: src/scripts/initMetadata.ts
// Dev note: This script fetches and updates metadata for:
//  1) Any token that is missing in the DB (not present at all).
//  2) Any token that is flagged as isRevealed=false in DB.
//  3) Any token that might be incorrectly flagged as isRevealed=true but actually still has the "unrevealed" image in DB.
//
// It uses concurrency (p-limit), retry logic per token, and multiple global loops to ensure robust fetching.

import axios from "axios";
import { connectMongoDB } from "../db/index";
import { Hero } from "../db/hero.model";
import { MONGO_URI } from "../config";
import pLimit from "p-limit";

const NFT_COLLECTION_BASE_URI = "https://api.onchainheroes.xyz/hero/";
const UNREVEALED_URL = "https://storage.onchainheroes.xyz/unrevealed/hero.gif";

const CONCURRENCY_LIMIT = 50;
const MAX_RETRIES_PER_TOKEN = 5;
const MAX_FULL_LOOP = 5; // maximum number of global loops

// The full NFT range we care about
const START_TOKEN_ID = 1;
const END_TOKEN_ID = 10000;

/**
 * Build the list of token IDs we actually want to process:
 *  1) Any token ID not present in the DB at all.
 *  2) Any token that has isRevealed=false in the DB.
 *  3) Any token that is "in DB" with isRevealed=true but the image is still the UNREVEALED_URL (i.e. incorrectly flagged).
 */
async function getTokensToUpdate(): Promise<number[]> {
  // Create a simple array of all token IDs in the range
  const allTokens = Array.from(
    { length: END_TOKEN_ID - START_TOKEN_ID + 1 },
    (_, i) => START_TOKEN_ID + i
  );

  // 1) Find tokens in DB that are either not revealed OR have an unrevealed image
  //    This covers both isRevealed=false, or isRevealed=true but "image === UNREVEALED_URL"
  const dbNeedFix = await Hero.find(
    {
      $or: [{ isRevealed: false }, { image: UNREVEALED_URL }],
    },
    { tokenId: 1 }
  ).lean();
  const dbNeedFixIds = dbNeedFix.map((h) => h.tokenId);

  // 2) Find which IDs exist in the DB (any state)
  const dbAllIds = await Hero.distinct("tokenId");

  // 3) Find tokenIds that are not in the DB at all (missing)
  const missingIds = allTokens.filter((id) => !dbAllIds.includes(id));

  // Combine: (missing IDs) + (tokens that are flagged unrevealed or incorrectly revealed)
  const combinedSet = new Set([...dbNeedFixIds, ...missingIds]);
  const tokensToUpdate = Array.from(combinedSet).sort((a, b) => a - b);

  console.log(
    `[initMetadata] Found ${tokensToUpdate.length} tokens to process (missing/unrevealed/unfixed).`
  );
  return tokensToUpdate;
}

/**
 * Fetch & store metadata with up to MAX_RETRIES_PER_TOKEN attempts (per token).
 * If the metadata's image is still UNREVEALED_URL, we set isRevealed = false.
 * Otherwise, we set isRevealed = true.
 */
async function fetchAndStoreMetadata(
  tokenId: number,
  attempt = 1
): Promise<void> {
  const metadataUrl = `${NFT_COLLECTION_BASE_URI}${tokenId}`;
  try {
    const res = await axios.get(metadataUrl, { timeout: 10000 });
    const metadata = res.data;

    // If the image is the unrevealed URL, we consider it unrevealed
    const isRevealed = metadata.image !== UNREVEALED_URL;

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

    console.log(
      `[initMetadata] Token #${tokenId} upserted (revealed=${isRevealed}, attempt=${attempt}).`
    );
  } catch (err: any) {
    console.error(
      `[initMetadata] Error fetching #${tokenId} on attempt ${attempt}:`,
      err.message
    );

    // Retry logic
    if (attempt < MAX_RETRIES_PER_TOKEN) {
      console.log(
        `[initMetadata] Retrying #${tokenId} (attempt ${attempt + 1})...`
      );
      await fetchAndStoreMetadata(tokenId, attempt + 1);
    } else {
      throw new Error(
        `[initMetadata] Max retries reached for token #${tokenId}. Last error: ${err.message}`
      );
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

  const tasks = tokenIds.map((tokenId) =>
    limit(async () => {
      try {
        await fetchAndStoreMetadata(tokenId);
      } catch (err) {
        // If it throws here, it means we failed after all retries for that token
        failedTokens.push(tokenId);
      }
    })
  );

  await Promise.all(tasks);
  return failedTokens;
}

/**
 * Main function that repeats attempts in global loops until either success or hitting MAX_FULL_LOOP.
 */
async function initAllMetadata() {
  let pendingTokens = await getTokensToUpdate();

  if (pendingTokens.length === 0) {
    console.log(
      "[initMetadata] Nothing to update. All tokens appear correct in the DB."
    );
    return;
  }

  let fullLoopCount = 0;

  while (pendingTokens.length > 0 && fullLoopCount < MAX_FULL_LOOP) {
    fullLoopCount++;
    console.log(
      `[initMetadata] Full loop #${fullLoopCount} - processing ${pendingTokens.length} tokens...`
    );

    const failed = await processTokenRange(pendingTokens);

    if (failed.length === 0) {
      console.log(
        `[initMetadata] All tokens processed successfully in loop #${fullLoopCount}.`
      );
      return;
    } else {
      console.warn(
        `[initMetadata] ${failed.length} tokens failed in loop #${fullLoopCount}. Will retry them...`
      );
      pendingTokens = failed;
    }
  }

  if (pendingTokens.length === 0) {
    console.log("[initMetadata] Successfully processed all tokens!");
  } else {
    console.error(
      "[initMetadata] Some tokens could not be processed after all loops:",
      pendingTokens
    );
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
