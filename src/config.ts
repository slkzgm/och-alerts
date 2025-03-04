// path: src/config.ts
// Dev note: Loads environment variables and sets default values for the entire app.

import "dotenv/config";

export const STAKING_CONTRACT_ADDRESS =
  process.env.STAKING_CONTRACT_ADDRESS ||
  "0x06d7ee1d50828ca96e11890a1601f6fe61f1e584";
export const NFT_COLLECTION_BASE_URI =
  process.env.NFT_COLLECTION_BASE_URI || "https://api.onchainheroes.xyz/hero/";

export const RPC_URL = process.env.RPC_URL || "https://api.mainnet.abs.xyz";
export const WS_RPC_URL =
  process.env.WS_RPC_URL || "wss://api.mainnet.abs.xyz/ws";

export const FALLBACK_START_BLOCK = parseInt(
  process.env.FALLBACK_START_BLOCK || "2273309",
  10
);
export const REORG_SAFETY = parseInt(process.env.REORG_SAFETY || "6", 10);
export const BLOCK_BATCH_SIZE = parseInt(
  process.env.BLOCK_BATCH_SIZE || "5000",
  10
);
export const BLOCK_WRITE_FREQUENCY = parseInt(
  process.env.BLOCK_WRITE_FREQUENCY || "10",
  10
);

// MongoDB config
export const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/mydb";

// Twitter config
export const TWITTER_USERNAME = process.env.TWITTER_USERNAME || "";
export const TWITTER_PASSWORD = process.env.TWITTER_PASSWORD || "";
export const TWITTER_EMAIL = process.env.TWITTER_EMAIL || "";

export const ENDGAME_CONTRACT_ADDRESS =
  process.env.ENDGAME_CONTRACT_ADDRESS ||
  "0xeea334b302bd8b1b96d4ef73b8f4467a347da6f0";
