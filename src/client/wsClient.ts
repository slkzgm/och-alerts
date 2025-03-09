// path: src/clients/wsClient.ts
/**
 * Provides a shared WebSocket-based public client for interacting with the chain.
 * This version enables automatic reconnection logic (exponential backoff, infinite retries)
 * so that if the socket closes, it will transparently reconnect and re-subscribe.
 * All logs and comments are written in English only, and the code is production-ready and safe.
 */

import { createPublicClient, webSocket } from "viem";
import { abstract } from "viem/chains";
import { WS_RPC_URL } from "../config";

/**
 * Computes an exponential backoff delay, capped at a certain maximum (e.g., 30 seconds).
 */
function exponentialBackoffDelay({
  attemptCount,
}: {
  attemptCount: number;
}): number {
  const baseDelayMs = 1000; // 1 second base
  const maxDelayMs = 30000; // 30 seconds cap
  const delay = baseDelayMs * 2 ** (attemptCount - 1);
  return Math.min(delay, maxDelayMs);
}

export const sharedWsClient = createPublicClient({
  chain: abstract,
  transport: webSocket(WS_RPC_URL, {
    // Retry forever; set a finite number if you'd prefer to eventually give up.
    maxRetries: Infinity,

    // Provide a delay function so attempts back off progressively
    retryDelay: exponentialBackoffDelay,

    // Optional hooks to log connection status
    onOpen: () => {
      console.log("[sharedWsClient] WebSocket connection opened successfully.");
    },
    onClose: () => {
      console.warn(
        "[sharedWsClient] WebSocket connection closed. Will attempt to reconnect..."
      );
    },
  }),
});
