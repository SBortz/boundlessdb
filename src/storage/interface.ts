/**
 * Storage Interface for the Event Store
 */

import type { ExtractedKey, QueryCondition, StoredEvent } from '../types.js';

/**
 * Event to be stored (before position assignment)
 */
export interface EventToStore {
  id: string;
  type: string;
  data: unknown;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Storage backend interface
 */
export interface EventStorage {
  /**
   * Append events to the store with their extracted keys
   * Must be atomic: either all events are stored, or none
   * @returns Position of the last appended event
   */
  append(events: EventToStore[], keys: ExtractedKey[][]): Promise<bigint>;

  /**
   * Query events by conditions
   * @param conditions Query conditions (type + key + value)
   * @param fromPosition Start position (exclusive)
   * @param limit Maximum number of events to return
   */
  query(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): Promise<StoredEvent[]>;

  /**
   * Get events since a given position that match the conditions
   * Used for consistency checks (conflict detection)
   * @returns Events that match AND have position > sincePosition
   */
  getEventsSince(
    conditions: QueryCondition[],
    sincePosition: bigint
  ): Promise<StoredEvent[]>;

  /**
   * Get the current highest position in the store
   * @returns 0n if store is empty
   */
  getLatestPosition(): Promise<bigint>;

  /**
   * Close the storage connection
   */
  close(): Promise<void>;
}
