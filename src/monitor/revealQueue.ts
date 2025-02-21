// path: src/monitor/revealQueue.ts
// Dev note: This file manages an in-memory queue of reveal jobs. It retries metadata fetching with concurrency limit.

import pLimit from 'p-limit';
import { fetchMetadataAndAlert } from '../utils/metadata';
import { setHeroRevealed, isHeroRevealed } from '../utils/heroRevealCheck';

const CONCURRENCY_LIMIT = 5;        // How many metadata fetches in parallel
const MAX_RETRIES_PER_JOB = 5;      // How many times we retry a single job
const PROCESS_INTERVAL_MS = 30_000; // 30s between each processing loop

interface RevealJob {
    tokenId: string;
    owner: string;
    retryCount: number;
}

let pendingReveals: RevealJob[] = [];

// p-limit concurrency controller
const limit = pLimit(CONCURRENCY_LIMIT);

/**
 * Enqueue a new reveal job. This is typically called from handleStakingLog
 * whenever a new hero is staked and not revealed yet.
 */
export function enqueueReveal(tokenId: string, owner: string): void {
    // We could do a check to avoid duplicates if needed
    // For example:
    const alreadyInQueue = pendingReveals.some(
        job => job.tokenId === tokenId && job.owner === owner
    );
    if (alreadyInQueue) {
        console.log(`[revealQueue] Job for token #${tokenId} is already in queue. Skipping re-enqueue.`);
        return;
    }

    pendingReveals.push({
        tokenId,
        owner,
        retryCount: 0,
    });
    console.log(`[revealQueue] Enqueued job for token #${tokenId} (owner=${owner}).`);
}

/**
 * Process the queue in parallel (with concurrency limit).
 * Each job tries to fetch metadata and tweet. If it fails, it increments retryCount
 * and remains in the queue to be re-attempted next time, unless it hits MAX_RETRIES.
 */
async function processQueueOnce() {
    if (pendingReveals.length === 0) {
        // Nothing to do
        return;
    }

    console.log(`[revealQueue] Processing ${pendingReveals.length} pending jobs...`);

    // We'll build a new array of reveals that still need to be retried after this pass
    const nextPending: RevealJob[] = [];

    // Build an array of limit-wrapped tasks
    const tasks = pendingReveals.map(job => limit(async () => {
        const { tokenId, owner, retryCount } = job;

        try {
            // Before we do anything, check if it's already revealed in DB (edge case)
            const alreadyRevealed = await isHeroRevealed(tokenId);
            if (alreadyRevealed) {
                console.log(`[revealQueue] Token #${tokenId} is already revealed. Skipping.`);
                return; // job done, we won't re-push it
            }

            // Attempt metadata fetch + tweet
            await fetchMetadataAndAlert(tokenId, owner);

            // Mark hero as revealed in DB
            await setHeroRevealed(tokenId);

            console.log(`[revealQueue] Successfully processed token #${tokenId} (owner=${owner}).`);

        } catch (err) {
            // Something failed (API, network, etc.)
            console.error(`[revealQueue] Failed to process token #${tokenId} (attempt ${retryCount + 1}):`, (err as Error).message);

            // We decide if we retry or abandon
            const newRetryCount = retryCount + 1;
            if (newRetryCount < MAX_RETRIES_PER_JOB) {
                nextPending.push({ tokenId, owner, retryCount: newRetryCount });
                console.log(`[revealQueue] Will retry token #${tokenId} next cycle (attempt ${newRetryCount}).`);
            } else {
                console.error(`[revealQueue] Max retries reached for token #${tokenId}. Abandoning job.`);
            }
        }
    }));

    // Wait for all tasks in this iteration
    await Promise.all(tasks);

    // Replace the queue with the ones that remain to be retried
    pendingReveals = nextPending;
    console.log(`[revealQueue] End of cycle. ${pendingReveals.length} jobs left pending.`);
}

/**
 * Start a setInterval loop to process the queue every PROCESS_INTERVAL_MS.
 * This function should be called once at application startup.
 */
export function startQueueProcessing() {
    console.log("[revealQueue] Starting queue processing loop...");

    // Immediately run one pass (optional)
    processQueueOnce().catch(err => console.error("[revealQueue] Initial process error:", err));

    setInterval(() => {
        processQueueOnce().catch(err => console.error("[revealQueue] Error in setInterval cycle:", err));
    }, PROCESS_INTERVAL_MS);
}
