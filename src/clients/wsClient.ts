// path: src/clients/wsClient.ts
/**
 * Provides a shared WebSocket-based public client for interacting with the chain.
 * This enhanced version ensures robust reconnection handling with proper error management
 * to prevent application termination on socket errors.
 */

import { createPublicClient, webSocket, type PublicClient } from "viem";
import { abstract } from "viem/chains";
import { WS_RPC_URL } from "../config";

/**
 * Computes an exponential backoff delay, capped at a certain maximum.
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

// Keep track of active subscriptions to restore them on reconnection
const activeSubscriptions: Array<() => void> = [];

// Track the WebSocket connection status
let isConnected = false;
let lastConnectedTime: string | null = null;
let reconnectAttempts = 0;

/**
 * Register a subscription function to be called on reconnection
 */
export function registerSubscription(subscriptionFn: () => void): void {
  activeSubscriptions.push(subscriptionFn);
}

/**
 * Returns current WebSocket connection status
 */
export function getWebSocketStatus(): {
  isConnected: boolean;
  lastConnectedTime: string | null;
  reconnectAttempts: number;
  activeSubscriptions: number;
} {
  return {
    isConnected,
    lastConnectedTime,
    reconnectAttempts,
    activeSubscriptions: activeSubscriptions.length,
  };
}

/**
 * WebSocket heartbeat mechanism - periodically logs connection status
 */
setInterval(
  () => {
    const timestamp = new Date().toISOString();
    const status = getWebSocketStatus();
    console.log(
      `[sharedWsClient] ${timestamp} - HEARTBEAT - WebSocket status: ` +
        `connected=${status.isConnected}, ` +
        `lastConnected=${status.lastConnectedTime || "never"}, ` +
        `reconnectAttempts=${status.reconnectAttempts}, ` +
        `activeSubscriptions=${status.activeSubscriptions}`
    );
  },
  5 * 60 * 1000
); // Log WebSocket status every 5 minutes

/**
 * Create a resilient WebSocket client with comprehensive error handling
 */
export const sharedWsClient: PublicClient = createPublicClient({
  chain: abstract,
  transport: webSocket(WS_RPC_URL, {
    // Retry forever with exponential backoff
    maxRetries: Infinity,
    retryDelay: exponentialBackoffDelay,

    // Aggressive keep-alive to detect disconnections early
    keepAlive: { interval: 15_000 },

    reconnect: true,

    // Comprehensive connection lifecycle management
    onOpen: () => {
      const timestamp = new Date().toISOString();
      isConnected = true;
      lastConnectedTime = timestamp;
      console.log(
        `[sharedWsClient] ${timestamp} - WebSocket connection opened successfully.`
      );

      // Restore all active subscriptions when connection is re-established
      if (activeSubscriptions.length > 0) {
        console.log(
          `[sharedWsClient] ${timestamp} - Restoring ${activeSubscriptions.length} active subscriptions...`
        );
        activeSubscriptions.forEach((subscription) => {
          try {
            subscription();
          } catch (err) {
            console.error(
              `[sharedWsClient] ${timestamp} - Error restoring subscription:`,
              err
            );
          }
        });
      }
    },

    onClose: () => {
      const timestamp = new Date().toISOString();
      isConnected = false;
      console.warn(
        `[sharedWsClient] ${timestamp} - WebSocket connection closed. Will attempt to reconnect...`
      );
    },

    onError: (error) => {
      const timestamp = new Date().toISOString();
      console.error(
        `[sharedWsClient] ${timestamp} - WebSocket connection error:`,
        error
      );
      // We don't throw here, just log it and let the built-in reconnection handle it
    },

    onReconnect: (attemptCount) => {
      const timestamp = new Date().toISOString();
      reconnectAttempts = attemptCount;
      console.log(
        `[sharedWsClient] ${timestamp} - Attempting to reconnect, attempt #${attemptCount}...`
      );
    },
  }),
});

/**
 * Create a specialized wrapper around watchEvent to provide additional error resilience
 * This ensures errors in event handling don't crash the application
 */
export function watchEventWithErrorHandling(options: any): () => void {
  const { onLogs, onError, ...restOptions } = options;

  // Create a more robust onLogs handler that catches and logs errors
  const safeOnLogs = async (logs: any) => {
    try {
      await onLogs(logs);
    } catch (error) {
      console.error(
        "[watchEventWithErrorHandling] Error in onLogs handler:",
        error
      );
      if (onError) {
        try {
          onError(error);
        } catch (innerError) {
          console.error(
            "[watchEventWithErrorHandling] Error in onError handler:",
            innerError
          );
        }
      }
    }
  };

  // Create a more robust onError handler
  const safeOnError = (error: any) => {
    console.error(
      "[watchEventWithErrorHandling] WebSocket event error:",
      error
    );
    if (onError) {
      try {
        onError(error);
      } catch (innerError) {
        console.error(
          "[watchEventWithErrorHandling] Error in onError handler:",
          innerError
        );
      }
    }
    // Explicitly do not rethrow - we want to contain errors here
  };

  // Create the actual subscription with our safe handlers
  const unsubscribe = sharedWsClient.watchEvent({
    ...restOptions,
    onLogs: safeOnLogs,
    onError: safeOnError,
  });

  // Return the unsubscribe function
  return unsubscribe;
}
