// src/config.ts

/**
 * This file handles global configurations and constants for our project.
 * Now reading from process.env to allow Docker environment overrides.
 */

import 'dotenv/config'

export const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || "0x06d7ee1d50828ca96e11890a1601f6fe61f1e584";
export const NFT_COLLECTION_BASE_URI = "https://api.onchainheroes.xyz/hero/";

export const RPC_URL = process.env.RPC_URL || "https://api.mainnet.abs.xyz";
export const WS_RPC_URL = process.env.WS_RPC_URL || "wss://api.mainnet.abs.xyz/ws";

// Default start block if there's nothing in Redis
export const FALLBACK_START_BLOCK = parseInt(process.env.FALLBACK_START_BLOCK || "2273309", 10);
export const REORG_SAFETY = parseInt(process.env.REORG_SAFETY || "6", 10);
export const BLOCK_BATCH_SIZE = parseInt(process.env.BLOCK_BATCH_SIZE || "5000", 10);
export const BLOCK_WRITE_FREQUENCY = parseInt(process.env.BLOCK_WRITE_FREQUENCY || "10", 10);

// Redis config
export const REDIS_HOST = process.env.REDIS_HOST || "localhost";
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

export const TWITTER_API_KEY = process.env.TWITTER_API_KEY || '';
export const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET || '';
export const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || '';
export const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || '';

export const TWITTER_USERNAME = process.env.TWITTER_USERNAME || "";
export const TWITTER_PASSWORD = process.env.TWITTER_PASSWORD || "";
export const TWITTER_EMAIL = process.env.TWITTER_EMAIL || "";