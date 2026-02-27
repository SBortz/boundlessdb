/**
 * In-Memory Storage implementation (for testing)
 */

import { isConstrainedCondition, normalizeCondition, hasKeys, type ExtractedKey, type QueryCondition, type StoredEvent, type MultiKeyConstrainedCondition } from '../types.js';
import type { EventStorage, EventToStore, StorageAppendCondition, AppendWithConditionResult } from './interface.js';

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

  async appendWithCondition(
    eventsToStore: EventToStore[],
    keys: ExtractedKey[][],
    condition: StorageAppendCondition | null
  ): Promise<AppendWithConditionResult> {
    if (eventsToStore.length !== keys.length) {
      throw new Error('Events and keys arrays must have the same length');
    }

    if (eventsToStore.length === 0) {
      const position = await this.getLatestPosition();
      return { position };
    }

    // 1. Conflict check (if condition provided)
    if (condition !== null) {
      const conflictingEvents = await this.query(
        condition.failIfEventsMatch,
        condition.after
      );

      if (conflictingEvents.length > 0) {
        return { conflicting: conflictingEvents };
      }
    }

    // 2. Insert events
    let lastPosition: bigint = 0n;

    for (let i = 0; i < eventsToStore.length; i++) {
      const event = eventsToStore[i];
      const eventKeys = keys[i];
      const position = this.nextPosition++;

      this.events.push({
        id: event.id,
        type: event.type,
        data: event.data as Record<string, unknown>,
        metadata: event.metadata,
        timestamp: event.timestamp,
        position,
        keys: eventKeys,
      });

      lastPosition = position;
    }

    return { position: lastPosition };
  }

  async query(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): Promise<StoredEvent[]> {
    const startPos = fromPosition ?? 0n;

    // Filter by position first
    let matching = this.events.filter(event => event.position > startPos);

    // If no conditions, return all events
    if (conditions.length === 0) {
      // Sort by position
      matching.sort((a, b) => (a.position < b.position ? -1 : 1));
      const limited = limit !== undefined ? matching.slice(0, limit) : matching;
      return limited.map(({ keys: _keys, ...event }) => event);
    }

    // Normalize conditions to internal format
    const normalized = conditions.map(normalizeCondition);

    // Filter by conditions
    matching = matching.filter(event => {
      // Must match at least one condition (OR across conditions)
      return normalized.some(cond => {
        // Type must match
        if (event.type !== cond.type) {
          return false;
        }

        // If unconstrained, type match is enough
        if (!hasKeys(cond)) {
          return true;
        }

        // Constrained: ALL keys must match (AND within a condition)
        return cond.keys.every(
          requiredKey => event.keys.some(
            eventKey => eventKey.name === requiredKey.name && eventKey.value === requiredKey.value
          )
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
