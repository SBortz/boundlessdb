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
 * Result of appendWithCondition operation
 */
export interface AppendWithConditionResult {
  /** Position of last appended event (only present if successful) */
  position?: bigint;
  /** Conflicting events found (only present if conflict detected) */
  conflicting?: StoredEvent[];
}

/**
 * Condition for atomic append operation
 */
export interface StorageAppendCondition {
  /** Query conditions that define what constitutes a conflict */
  failIfEventsMatch: QueryCondition[];
  /** Check for conflicts only after this position */
  after: bigint;
}

/**
 * Storage backend interface
 */
export interface EventStorage {
  /**
   * Atomically append events with optional conflict check
   * 
   * Must be atomic: either all events are stored, or none
   * If condition is provided, must check for conflicts before appending
   * 
   * @param events Events to append
   * @param keys Extracted keys for each event (same length as events)
   * @param condition Optional conflict check condition
   * @returns Result with position (success) or conflicting events (conflict)
   */
  appendWithCondition(
    events: EventToStore[],
    keys: ExtractedKey[][],
    condition: StorageAppendCondition | null
  ): Promise<AppendWithConditionResult>;

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
   * Get the current highest position in the store
   * @returns 0n if store is empty
   */
  getLatestPosition(): Promise<bigint>;

  /**
   * Close the storage connection
   */
  close(): Promise<void>;
}
