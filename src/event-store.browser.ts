/**
 * Browser-compatible EventStore
 */

import { KeyExtractor } from './config/extractor.js';
import { validateConfig } from './config/validator.js';
import type { EventStorage } from './storage/interface.js';
import { SqlJsStorage } from './storage/sqljs.js';
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

/**
 * Generate UUID with fallback for environments without crypto.randomUUID
 */
function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    // crypto.randomUUID might throw in insecure contexts
  }
  // Fallback using crypto.getRandomValues if available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    arr[6] = (arr[6] & 0x0f) | 0x40; // Version 4
    arr[8] = (arr[8] & 0x3f) | 0x80; // Variant
    const hex = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  // Last resort fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
 * Compute SHA256 hash of ConsistencyConfig (async for browser)
 */
async function hashConfig(config: ConsistencyConfig): Promise<string> {
  const normalized = JSON.stringify(sortObjectKeys(config));
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface EventStoreConfig extends EventStoreOptions {
  storage: EventStorage;
}

/**
 * Browser-compatible DCB-native Event Store
 */
export class EventStore {
  private readonly storage: EventStorage;
  private readonly keyExtractor: KeyExtractor;
  private readonly config: ConsistencyConfig;
  private initPromise: Promise<void> | null = null;

  constructor(options: EventStoreConfig) {
    // Validate configuration
    validateConfig(options.consistency);

    this.storage = options.storage;
    this.config = options.consistency;
    this.keyExtractor = new KeyExtractor(this.config);
    
    console.log('🚀 INIT: Creating EventStore...');
    console.log('⚙️ CONFIG: Consistency configuration loaded');
    const eventTypes = Object.keys(this.config.eventTypes);
    console.log(`   Event types: ${eventTypes.join(', ')}`);
    eventTypes.forEach(type => {
      const keys = this.config.eventTypes[type].keys;
      console.log(`   ${type}: ${keys.map(k => k.name + ' ← ' + k.path).join(', ')}`);
    });

    // Start async initialization
    this.initPromise = this.checkAndReindexIfNeeded();
  }

  /**
   * Ensure the store is initialized (for async operations)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Check if config has changed since last run, reindex if needed
   */
  private async checkAndReindexIfNeeded(): Promise<void> {
    // Only works with SqlJsStorage (has metadata methods)
    if (!(this.storage instanceof SqlJsStorage)) {
      return;
    }

    try {
      // Ensure storage is fully initialized before accessing metadata
      await this.storage.getLatestPosition(); // This awaits the init promise

      console.log('🔐 HASH: Computing config hash...');
      const currentHash = await hashConfig(this.config);
      if (!currentHash) {
        console.warn('[EventStore] Failed to compute config hash');
        return;
      }
      console.log(`   Current config hash: ${currentHash.substring(0, 16)}...`);
      
      const storedHash = await this.storage.getConfigHash();
      console.log(`   Stored config hash: ${storedHash ? storedHash.substring(0, 16) + '...' : '(none - first run)'}`);

    if (storedHash === null) {
      // First run — just store the hash
      await this.storage.setConfigHash(currentHash);
    } else if (storedHash !== currentHash) {
      // Config changed — throw error, require explicit reindex via script
      throw new Error(
        `Config hash mismatch (stored: ${storedHash}, current: ${currentHash}). ` +
        `Run the reindex script before starting the application.`
      );
    }
    } catch (error) {
      // Re-throw config hash mismatch errors — these are intentional
      if (error instanceof Error && error.message.includes('Config hash mismatch')) {
        throw error;
      }
      console.warn('⚠️ INIT: Config hash check failed (non-fatal):', error);
      // Don't throw for other errors - config hash is nice-to-have, not required
    }
  }

  /**
   * Read events matching a query
   * 
   * @typeParam E - Event union type for typed results
   * @returns QueryResult with typed events and appendCondition
   */
  async read<E extends Event = Event>(query: Query): Promise<QueryResult<E>> {
    await this.ensureInitialized();
    
    console.log('📖 READ: Querying events...');
    console.log('   Conditions:', query.conditions.map(c => 
      isConstrainedCondition(c) ? `${c.type}[${c.key}=${c.value}]` : `${c.type}[*]`
    ).join(', ') || '(none)');
    
    const events = await this.storage.query(
      query.conditions,
      query.fromPosition,
      query.limit
    );
    
    console.log(`   Found: ${events.length} events`);

    // Get the position for the append condition
    const position = events.length > 0
      ? events[events.length - 1].position
      : await this.storage.getLatestPosition();

    console.log(`📍 POSITION: #${position}`);
    console.log(`   Scope: ${query.conditions.length} condition(s)`);

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
   */
  async append<E extends Event = Event>(
    events: EventWithMetadata<E>[],
    condition: AppendCondition | null
  ): Promise<AppendResult | ConflictResult<E>> {
    await this.ensureInitialized();
    
    console.log(`✏️ APPEND: ${events.length} event(s)`);
    events.forEach(e => console.log(`   → ${e.type}: ${JSON.stringify(e.data).substring(0, 60)}...`));
    console.log(`   Condition: ${condition ? 'AppendCondition' : 'null (no conflict check)'}`);
    
    if (events.length === 0) {
      const position = await this.storage.getLatestPosition();
      return {
        conflict: false,
        position,
        appendCondition: { failIfEventsMatch: condition?.failIfEventsMatch ?? [], after: position },
      };
    }

    // Extract keys from all events
    const keysPerEvent = events.map(event => this.keyExtractor.extract(event));
    console.log(`🔑 KEYS: Extracted from payload via config`);
    keysPerEvent.forEach((keys, i) => {
      console.log(`   Event ${i}: ${keys.map(k => `${k.name}="${k.value}"`).join(', ')}`);
    });

    // Prepare events for storage
    const now = new Date();
    const eventsToStore = events.map((event) => {
      const id = generateUUID();
      if (!id) {
        throw new Error('Failed to generate event ID');
      }
      return {
        id,
        type: event.type,
        data: event.data,
        metadata: event.metadata,
        timestamp: now,
      };
    });

    // Build storage condition (if provided)
    const storageCondition = condition !== null 
      ? { failIfEventsMatch: condition.failIfEventsMatch, after: condition.after ?? 0n }
      : null;

    if (condition !== null) {
      const conditionsStr = condition.failIfEventsMatch.map((c: QueryCondition) => 
        isConstrainedCondition(c) ? `${c.type}[${c.key}=${c.value}]` : `${c.type}[*]`
      ).join(', ');
      const checkFromPosition = condition.after ?? 0n;
      console.log(`🔍 CONFLICT CHECK: Looking for events since position #${checkFromPosition}`);
      console.log(`   Checking conditions: ${conditionsStr || '(none)'}`);
    }

    // Append with atomic conflict check
    const result = await this.storage.appendWithCondition(
      eventsToStore,
      keysPerEvent,
      storageCondition
    );

    // Check if conflict detected
    if (result.conflicting) {
      console.log(`   Result: ${result.conflicting.length} matching event(s) found - CONFLICT!`);
      console.log('');
      console.log('❌ ═══════════════════════════════════════');
      console.log('   CONFLICT DETECTED');
      console.log('═══════════════════════════════════════════');
      console.log('');
      console.log('📍 Your position: #' + (condition?.after ?? '0 (all events)'));
      console.log('');
      console.log('🔍 Query conditions you checked:');
      condition?.failIfEventsMatch.forEach((c: QueryCondition) => {
        if (isConstrainedCondition(c)) {
          console.log(`   • ${c.type} where ${c.key}="${c.value}"`);
        } else {
          console.log(`   • ${c.type} (all)`);
        }
      });
      console.log('');
      console.log('⚡ Events written SINCE your read (that match your query):');
      result.conflicting.forEach(e => {
        console.log(`   • Event #${e.position}: ${e.type}`);
        console.log(`     Data: ${JSON.stringify(e.data)}`);
      });
      console.log('');
      console.log('💡 Why conflict?');
      console.log('   These events match your query conditions!');
      console.log('   Your decision was based on stale data.');
      console.log('');
      console.log('🔄 Solution: Use result.appendCondition to retry.');
      console.log('═══════════════════════════════════════════');
      console.log('');

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

    console.log(`💾 STORED: Event(s) at position #${result.position}`);

    // Build new appendCondition
    const newConditions = this.buildConditionsFromEvents(events, condition);
    
    console.log(`✅ SUCCESS: Append complete at position #${result.position}`);

    return {
      conflict: false,
      position: result.position!,
      appendCondition: { failIfEventsMatch: newConditions, after: result.position! },
    };
  }

  /**
   * Build conditions that cover the appended events
   */
  private buildConditionsFromEvents<E extends Event>(
    events: EventWithMetadata<E>[],
    originalCondition: AppendCondition | null
  ): QueryCondition[] {
    const conditions = new Map<string, QueryCondition>();

    if (originalCondition !== null) {
      for (const cond of originalCondition.failIfEventsMatch) {
        const normalized = normalizeCondition(cond);
        if (hasKeys(normalized)) {
          const keysStr = normalized.keys.map(k => `${k.name}:${k.value}`).sort().join('|');
          const dedupKey = `${normalized.type}:${keysStr}`;
          conditions.set(dedupKey, normalized);
        }
      }
    }

    // Add conditions from the newly appended events
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
