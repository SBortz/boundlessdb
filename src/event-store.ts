/**
 * Main EventStore class
 */

import { randomUUID, createHash } from 'node:crypto';
import { KeyExtractor } from './config/extractor.js';
import { validateConfig } from './config/validator.js';
import type { EventStorage } from './storage/interface.js';
import { SqliteStorage } from './storage/sqlite.js';
import {
  QueryResult,
  isConstrainedCondition,
  isMultiKeyCondition,
  normalizeCondition,
  hasKeys,
  type AppendCondition,
  type AppendResult,
  type ConflictResult,
  type ConsistencyConfig,
  type ConstrainedCondition,
  type MultiKeyConstrainedCondition,
  type Event,
  type EventStoreOptions,
  type EventWithMetadata,
  type Query,
  type QueryCondition,
  type StoredEvent,
} from './types.js';
import { QueryBuilder, type QueryExecutor } from './query-builder.js';

/**
 * Recursively sort object keys for deterministic JSON
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute SHA256 hash of ConsistencyConfig
 */
function hashConfig(config: ConsistencyConfig): string {
  const normalized = JSON.stringify(sortObjectKeys(config));
  return createHash('sha256').update(normalized).digest('hex');
}

export interface EventStoreConfig extends EventStoreOptions {
  storage: EventStorage;
}

/**
 * DCB-native Event Store
 * 
 * Implements Dynamic Consistency Boundaries for event sourcing.
 * No cryptographic signing - tokens are Base64 encoded for convenience.
 */
export class EventStore {
  private readonly storage: EventStorage;
  private readonly keyExtractor: KeyExtractor;
  private readonly config: ConsistencyConfig;

  constructor(options: EventStoreConfig) {
    // Validate configuration
    validateConfig(options.consistency);

    this.storage = options.storage;
    this.config = options.consistency;
    this.keyExtractor = new KeyExtractor(this.config);

    // Check config hash and reindex if needed (SqliteStorage only)
    this.checkAndReindexIfNeeded();
  }

  /**
   * Check if config has changed since last run, reindex if needed
   */
  private checkAndReindexIfNeeded(): void {
    // Only works with SqliteStorage (has metadata table)
    if (!(this.storage instanceof SqliteStorage)) {
      return;
    }

    const currentHash = hashConfig(this.config);
    const storedHash = this.storage.getConfigHash();

    if (storedHash === null) {
      // First run — just store the hash
      console.log('[EventStore] First run, storing config hash:', currentHash.substring(0, 16) + '...');
      this.storage.setConfigHash(currentHash);
    } else if (storedHash !== currentHash) {
      // Config changed — reindex!
      console.log('[EventStore] ⚠️  Config changed! Rebuilding key index...');
      console.log(`[EventStore]    Old hash: ${storedHash.substring(0, 16)}...`);
      console.log(`[EventStore]    New hash: ${currentHash.substring(0, 16)}...`);
      const startTime = Date.now();
      
      let eventCount = 0;
      let keyCount = 0;
      
      this.storage.reindex((event) => {
        eventCount++;
        // Convert StoredEvent to Event format for KeyExtractor
        const keys = this.keyExtractor.extract({
          type: event.type,
          data: event.data,
          metadata: event.metadata
        });
        keyCount += keys.length;
        return keys;
      });
      
      // Update stored hash
      this.storage.setConfigHash(currentHash);
      
      const duration = Date.now() - startTime;
      console.log(`[EventStore] ✅ Reindex complete: ${eventCount} events, ${keyCount} keys (${duration}ms)`);
    }
  }

  /**
   * Create a fluent query builder.
   * 
   * @typeParam E - Event union type for typed results
   * @returns QueryBuilder for chaining
   * 
   * @example
   * ```typescript
   * const result = await store.query<CourseEvent>()
   *   .matchType('CourseCreated')
   *   .matchKey('StudentSubscribed', 'course', 'cs101')
   *   .fromPosition(100n)
   *   .limit(50)
   *   .read();
   * ```
   */
  query<E extends Event = Event>(): QueryBuilder<E> {
    return new QueryBuilder<E>(this as unknown as QueryExecutor<E>);
  }

  /**
   * Read events matching a query
   * 
   * @typeParam E - Event union type for typed results
   * @returns QueryResult with typed events and consistency token
   * 
   * @example
   * ```typescript
   * // Typed read
   * const result = await store.read<CartEvents>({
   *   conditions: [{ type: 'ProductItemAdded', key: 'cart', value: 'cart-123' }]
   * });
   * 
   * // Untyped read (all events of type)
   * const result = await store.read({
   *   conditions: [{ type: 'ProductItemAdded' }]
   * });
   * ```
   */
  async read<E extends Event = Event>(query: Query): Promise<QueryResult<E>> {
    const events = await this.storage.query(
      query.conditions,
      query.fromPosition,
      query.limit
    );

    // Get the position for the append condition
    // If we have events, use the last event's position
    // Otherwise, use the current latest position
    const position = events.length > 0
      ? events[events.length - 1].position
      : await this.storage.getLatestPosition();

    return new QueryResult<E>(
      events as StoredEvent<E>[],
      position,
      query.conditions
    );
  }

  /**
   * Append events with optional consistency check
   * 
   * @typeParam E - Event type for type checking
   * @param events Events to append
   * @param condition Consistency check - can be:
   *   - null: Skip consistency check (optimistic first write)
   *   - AppendCondition: { position, conditions } from a previous read
   * @returns AppendResult on success, ConflictResult on conflict
   * 
   * @example
   * ```typescript
   * // With appendCondition from read
   * const result = await store.read<CartEvents>({ conditions: [...] });
   * await store.append<CartEvents>([newEvent], result.appendCondition);
   * 
   * // Without consistency check (first write)
   * await store.append<CartEvents>([newEvent], null);
   * ```
   */
  async append<E extends Event = Event>(
    events: EventWithMetadata<E>[],
    condition: AppendCondition | null
  ): Promise<AppendResult | ConflictResult<E>> {
    if (events.length === 0) {
      // Nothing to append
      const position = await this.storage.getLatestPosition();
      return {
        conflict: false,
        position,
        appendCondition: { failIfEventsMatch: condition?.failIfEventsMatch ?? [], after: position },
      };
    }

    // Extract keys from all events
    const keysPerEvent = events.map(event => this.keyExtractor.extract(event));

    // Prepare events for storage
    const now = new Date();
    const eventsToStore = events.map(event => ({
      id: randomUUID(),
      type: event.type,
      data: event.data,
      metadata: event.metadata,
      timestamp: now,
    }));

    // Build storage condition (if provided)
    const storageCondition = condition !== null 
      ? { failIfEventsMatch: condition.failIfEventsMatch, after: condition.after ?? 0n }
      : null;

    // Append with atomic conflict check
    const result = await this.storage.appendWithCondition(
      eventsToStore,
      keysPerEvent,
      storageCondition
    );

    // Check if conflict detected
    if (result.conflicting) {
      const latestPosition = result.conflicting[result.conflicting.length - 1].position;
      return {
        conflict: true,
        conflictingEvents: result.conflicting as StoredEvent<E>[],
        appendCondition: { 
          failIfEventsMatch: condition?.failIfEventsMatch ?? [], 
          after: latestPosition 
        },
      };
    }

    // Success - build new appendCondition
    const newConditions = this.buildConditionsFromEvents(events, condition);

    return {
      conflict: false,
      position: result.position!,
      appendCondition: { failIfEventsMatch: newConditions, after: result.position! },
    };
  }

  /**
   * Build conditions that cover the appended events
   * Used to create the appendCondition returned after append
   */
  private buildConditionsFromEvents<E extends Event>(
    events: EventWithMetadata<E>[],
    originalCondition: AppendCondition | null
  ): QueryCondition[] {
    // Start with original conditions if provided
    // Use a Map with a stable key to deduplicate
    const conditions = new Map<string, QueryCondition>();

    if (originalCondition !== null) {
      for (const cond of originalCondition.failIfEventsMatch) {
        const normalized = normalizeCondition(cond);
        if (hasKeys(normalized)) {
          // Build a dedup key from all keys
          const keysStr = normalized.keys.map(k => `${k.name}:${k.value}`).sort().join('|');
          const dedupKey = `${normalized.type}:${keysStr}`;
          conditions.set(dedupKey, normalized);
        }
      }
    }

    // Add conditions from the newly appended events
    // Each event generates one condition per extracted key (single-key conditions)
    for (const event of events) {
      const extractedKeys = this.keyExtractor.extract(event);
      for (const extracted of extractedKeys) {
        const cond: ConstrainedCondition = { type: event.type, key: extracted.name, value: extracted.value };
        const dedupKey = `${cond.type}:${extracted.name}:${extracted.value}`;
        conditions.set(dedupKey, cond);
      }
    }

    return Array.from(conditions.values());
  }

  /**
   * Get the underlying storage (for advanced use cases)
   */
  getStorage(): EventStorage {
    return this.storage;
  }

  /**
   * Close the event store
   */
  async close(): Promise<void> {
    await this.storage.close();
  }
}

/**
 * Factory function to create an event store
 */
export function createEventStore(options: EventStoreConfig): EventStore {
  return new EventStore(options);
}
