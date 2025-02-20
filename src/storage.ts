// src/storage.ts

/**
 * This file provides storage helper functions for:
 * - last processed block
 * - set of revealed heroes
 * using Redis (ioredis).
 */

import { redisClient } from "./redisClient";

const REDIS_KEY_LAST_BLOCK = "lastBlockHandled";
const REDIS_SET_REVEALED_HEROES = "revealedHeroes";

/**
 * Get the last processed block from Redis.
 * If not found, returns null.
 */
export async function getLastProcessedBlock(): Promise<number | null> {
    const val = await redisClient.get(REDIS_KEY_LAST_BLOCK);
    if (!val) return null;
    return parseInt(val, 10);
}

/**
 * Set/update the last processed block in Redis.
 */
export async function setLastProcessedBlock(blockNumber: number): Promise<void> {
    await redisClient.set(REDIS_KEY_LAST_BLOCK, blockNumber.toString());
}

/**
 * Check if a hero is already revealed using a Redis set.
 */
export async function isHeroRevealed(tokenId: string): Promise<boolean> {
    const result = await redisClient.sismember(REDIS_SET_REVEALED_HEROES, tokenId);
    return result === 1;
}

/**
 * Mark a hero as revealed (add tokenId to the Redis set).
 */
export async function setHeroRevealed(tokenId: string): Promise<void> {
    await redisClient.sadd(REDIS_SET_REVEALED_HEROES, tokenId);
}
