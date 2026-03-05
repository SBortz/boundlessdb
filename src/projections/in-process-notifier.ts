/**
 * InProcessNotifier
 * 
 * Simple in-process event emitter for notifying about new events.
 * Used with SQLite, sql.js, and InMemory storage engines.
 */

import type { EventNotifier } from './notifier.js';

export class InProcessNotifier implements EventNotifier {
  private callbacks: ((pos: bigint) => void)[] = [];

  /**
   * Register callback for new events
   */
  onNewEvents(callback: (pos: bigint) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Notify all registered callbacks about new events
   * @param position Position of the latest appended event
   */
  notify(position: bigint): void {
    for (const cb of this.callbacks) {
      try {
        cb(position);
      } catch (error) {
        console.error('[InProcessNotifier] Error in callback:', error);
      }
    }
  }

  /**
   * Stop listening and clear all callbacks
   */
  close(): void {
    this.callbacks = [];
  }
}
