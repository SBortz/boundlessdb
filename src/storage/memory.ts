/**
 * In-Memory Storage implementation (for testing)
 */

import type { ExtractedKey, QueryCondition, StoredEvent } from '../types.js';
import type { EventStorage, EventToStore } from './interface.js';

interface StoredEventInternal extends StoredEvent {
  keys: ExtractedKey[];
}

/**
 * In-memory event storage for testing purposes
 * NOT suitable for production use
 */
export class InMemoryStorage implements EventStorage {
  private events: StoredEventInternal[] = [];
  private nextPosition: bigint = 1n;

  async append(eventsToStore: EventToStore[], keys: ExtractedKey[][]): Promise<bigint> {
    if (eventsToStore.length !== keys.length) {
      throw new Error('Events and keys arrays must have the same length');
    }

    let lastPosition: bigint = 0n;

    for (let i = 0; i < eventsToStore.length; i++) {
      const event = eventsToStore[i];
      const eventKeys = keys[i];
      const position = this.nextPosition++;

      this.events.push({
        id: event.id,
        type: event.type,
        data: event.data,
        metadata: event.metadata,
        timestamp: event.timestamp,
        position,
        keys: eventKeys,
      });

      lastPosition = position;
    }

    return lastPosition;
  }

  async query(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): Promise<StoredEvent[]> {
    const startPos = fromPosition ?? 0n;

    const matching = this.events.filter(event => {
      // Must be after fromPosition
      if (event.position <= startPos) {
        return false;
      }

      // Must match at least one condition
      return conditions.some(cond => {
        // Type must match
        if (event.type !== cond.type) {
          return false;
        }

        // Key must match
        return event.keys.some(
          key => key.name === cond.key && key.value === cond.value
        );
      });
    });

    // Sort by position
    matching.sort((a, b) => (a.position < b.position ? -1 : 1));

    // Apply limit
    const limited = limit !== undefined ? matching.slice(0, limit) : matching;

    // Strip internal keys
    return limited.map(({ keys: _keys, ...event }) => event);
  }

  async getEventsSince(
    conditions: QueryCondition[],
    sincePosition: bigint
  ): Promise<StoredEvent[]> {
    return this.query(conditions, sincePosition);
  }

  async getLatestPosition(): Promise<bigint> {
    if (this.events.length === 0) {
      return 0n;
    }
    return this.events[this.events.length - 1].position;
  }

  async close(): Promise<void> {
    // Nothing to do
  }

  /**
   * Get all events (for testing)
   */
  getAllEvents(): StoredEvent[] {
    return this.events.map(({ keys: _keys, ...event }) => event);
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events = [];
    this.nextPosition = 1n;
  }
}
