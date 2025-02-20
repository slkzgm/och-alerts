// src/stakingMonitor.ts

/**
 * This file sets up the event monitoring logic using Viem + Redis for persistence.
 */

import {
    createPublicClient,
    http,
    webSocket,
    parseAbiItem,
    Log,
    decodeEventLog
} from "viem";
import { abstract } from "viem/chains";
import {
    STAKING_CONTRACT_ADDRESS,
    RPC_URL,
    WS_RPC_URL,
    FALLBACK_START_BLOCK,
    REORG_SAFETY,
    BLOCK_BATCH_SIZE,
    BLOCK_WRITE_FREQUENCY
} from "./config";
import {
    getLastProcessedBlock,
    setLastProcessedBlock,
    isHeroRevealed,
    setHeroRevealed
} from "./storage";
import { fetchMetadataAndAlert } from "./utils";

// Define the event ABI.
const STAKING_EVENT_ABI = parseAbiItem(
    "event Staked(address owner, uint256 tokenId, uint256 timestamp)"
);

// Create an HTTP client for historical scanning.
const httpClient = createPublicClient({
    chain: abstract,
    transport: http(RPC_URL),
});

// Create a WebSocket client for real-time event watching.
const wsClient = createPublicClient({
    chain: abstract,
    transport: webSocket(WS_RPC_URL),
});

/**
 * Main entry point: sync historical events, then watch in real-time.
 */
export async function monitorStakingEvents() {
    console.log("[monitorStakingEvents] Starting event monitor...");

    // 1. Get last processed block from Redis
    let lastProcessedBlock = await getLastProcessedBlock();

    if (lastProcessedBlock === null) {
        lastProcessedBlock = FALLBACK_START_BLOCK;
    }

    // 2. Rewind a bit for safety (but not below 0)
    lastProcessedBlock = Math.max(0, lastProcessedBlock - REORG_SAFETY);

    // 3. Synchronize historical events using the HTTP client.
    await syncHistoricalEvents(lastProcessedBlock);

    // 4. Then set up real-time watch using the WebSocket client.
    watchNewEvents();
}

/**
 * Synchronize historical events from 'fromBlock' up to the current head, in batches.
 */
async function syncHistoricalEvents(fromBlock: number) {
    try {
        const latestBlockBigInt = await httpClient.getBlockNumber();
        const latestBlock = Number(latestBlockBigInt);
        console.log(`[syncHistoricalEvents] Syncing from block ${fromBlock} to ${latestBlock}...`);

        let start = fromBlock;
        while (start <= latestBlock) {
            const end = Math.min(start + BLOCK_BATCH_SIZE - 1, latestBlock);

            // Create a filter for the Staked event in this block range.
            const filter = await httpClient.createEventFilter({
                address: STAKING_CONTRACT_ADDRESS as `0x${string}`,
                event: STAKING_EVENT_ABI,
                fromBlock: BigInt(start),
                toBlock: BigInt(end)
            });

            // Fetch logs for this filter.
            const logs = await httpClient.getFilterLogs({ filter });
            for (const log of logs) {
                await handleStakingLog(log);
            }

            if (end % BLOCK_WRITE_FREQUENCY === 0 || end === latestBlock) {
                await setLastProcessedBlock(end);
            }

            console.log(`[syncHistoricalEvents] Processed blocks ${start} to ${end}`);
            start = end + 1;
        }

        console.log("[syncHistoricalEvents] Historical sync completed.");
    } catch (error) {
        console.error("[syncHistoricalEvents] Error:", error);
    }
}

/**
 * Watch for new "Staked" events in real-time using the WebSocket client.
 */
function watchNewEvents() {
    console.log("[watchNewEvents] Setting up real-time event watcher...");

    wsClient.watchEvent({
        address: STAKING_CONTRACT_ADDRESS as `0x${string}`,
        // Filtration by event is done via the ABI in decodeEventLog, so we don't pass de filtre ici.
        onLogs: async (logs: Log[]) => {
            for (const log of logs) {
                await handleStakingLog(log);
            }
            if (logs.length > 0 && logs[0].blockNumber) {
                const blockNumber = Number(logs[0].blockNumber);
                if (blockNumber % BLOCK_WRITE_FREQUENCY === 0) {
                    await setLastProcessedBlock(blockNumber);
                }
            }
        },
        onError: (err: any) => {
            console.error("[watchNewEvents] Error:", err);
        }
    });

    console.log("[watchNewEvents] Real-time watching is set up.");
}

/**
 * Type definition for the decoded Staked event arguments.
 */
type StakedEvent = {
    owner: string;
    tokenId: bigint;
    timestamp: bigint;
};

/**
 * Handle a single Staked log: check if hero is revealed, if not => reveal & alert.
 */
async function handleStakingLog(log: Log) {
    try {
        const parsedLog = decodeEventLog({
            abi: [STAKING_EVENT_ABI],
            data: log.data,
            topics: log.topics,
        }) as { args: StakedEvent };

        const { owner, tokenId } = parsedLog.args;
        const tokenIdStr = tokenId.toString();

        const alreadyRevealed = await isHeroRevealed(tokenIdStr);
        if (alreadyRevealed) return;

        await fetchMetadataAndAlert(tokenIdStr, owner);
        await setHeroRevealed(tokenIdStr);

        console.log(`[handleStakingLog] Hero #${tokenIdStr} revealed for the first time, owner = ${owner}.`);
    } catch (error) {
        console.error("[handleStakingLog] Error:", error);
    }
}
