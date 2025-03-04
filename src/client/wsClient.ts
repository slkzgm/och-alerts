// path: src/clients/wsClient.ts
/**
 * Provides a shared WebSocket-based public client for interacting with the chain.
 * This allows multiple monitors (e.g., stakingMonitor, endgameMonitor) to reuse the same client.
 * It's often more efficient and clearer than creating multiple identical clients.
 */

import { createPublicClient, webSocket } from "viem";
import { abstract } from "viem/chains";
import { WS_RPC_URL } from "../config";

export const sharedWsClient = createPublicClient({
  chain: abstract,
  transport: webSocket(WS_RPC_URL),
});
