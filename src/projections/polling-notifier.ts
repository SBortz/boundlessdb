/**
 * PollingNotifier
 * 
 * Universal fallback notifier that polls the event store for new events.
 * Works with any storage engine.
 */

import type { EventStorage } from '../storage/interface.js';
import type { EventNotifier } from './notifier.js';

export interface PollingNotifierOptions {
  /** Polling interval in milliseconds (default: 1000) */
  intervalMs?: number;
}

export class PollingNotifier implements EventNotifier {
  private callbacks: ((pos: bigint) => void)[] = [];
  private intervalHandle?: ReturnType<typeof setInterval>;
  private lastKnownPosition: bigint = 0n;
  private readonly intervalMs: number;

  constructor(
    private readonly storage: EventStorage,
    options: PollingNotifierOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 1000;
  }

  /**
   * Register callback for new events
   */
  onNewEvents(callback: (pos: bigint) => void): void {
    const isFirstCallback = this.callbacks.length === 0;
    this.callbacks.push(callback);

    // Start polling when first callback is registered
    if (isFirstCallback) {
      this.startPolling();
    }
  }

  /**
   * Start polling for new events
   */
  private startPolling(): void {
    if (this.intervalHandle) {
      return; // Already polling
    }

    // Initialize last known position
    this.storage.getLatestPosition().then(pos => {
      this.lastKnownPosition = pos;
    }).catch(err => {
      console.error('[PollingNotifier] Error getting initial position:', err);
    });

    this.intervalHandle = setInterval(() => {
      this.poll();
    }, this.intervalMs);
  }

  /**
   * Poll for new events
   */
  private async poll(): Promise<void> {
    try {
      const currentPosition = await this.storage.getLatestPosition();
      
      if (currentPosition > this.lastKnownPosition) {
        this.lastKnownPosition = currentPosition;
        
        // Notify all callbacks
        for (const cb of this.callbacks) {
          try {
            cb(currentPosition);
          } catch (error) {
            console.error('[PollingNotifier] Error in callback:', error);
          }
        }
      }
    } catch (error) {
      console.error('[PollingNotifier] Error polling for events:', error);
    }
  }

  /**
   * Stop polling and clear all callbacks
   */
  close(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    this.callbacks = [];
    this.lastKnownPosition = 0n;
  }
}
