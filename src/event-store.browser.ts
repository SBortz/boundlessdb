/**
 * Browser-compatible EventStore
 * 
 * No cryptographic signing - tokens are Base64 encoded for convenience.
 */

import { KeyExtractor } from './config/extractor.js';
import { validateConfig } from './config/validator.js';
import type { EventStorage } from './storage/interface.js';
import { SqlJsStorage } from './storage/sqljs.js';
import { createToken, decodeToken, TokenDecodeError } from './token.browser.js';
import {
  QueryResult,
  type AppendCondition,
  type AppendResult,
  type ConflictResult,
  type ConsistencyConfig,
  type ConsistencyToken,
  type Event,
  type EventStoreOptions,
  type EventWithMetadata,
  type Query,
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
 * 
 * No cryptographic signing - tokens are Base64 encoded for convenience.
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
      await this.storage.getAllEvents(); // This awaits the init promise

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
      console.log('📝 HASH: First run, storing config hash in database');
      await this.storage.setConfigHash(currentHash);
    } else if (storedHash !== currentHash) {
      // Config changed — reindex!
      console.log('⚠️ HASH MISMATCH: Config changed since last run!');
      console.log('🔄 REINDEX: Rebuilding key index from all events...');
      const startTime = Date.now();
      
      let eventCount = 0;
      let keyCount = 0;
      
      await this.storage.reindex((event) => {
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
      await this.storage.setConfigHash(currentHash);
      
      const duration = Date.now() - startTime;
      console.log(`✅ REINDEX: Complete! ${eventCount} events, ${keyCount} keys extracted (${duration}ms)`);
    } else {
      console.log('✅ HASH: Config unchanged, index is up to date');
    }
    
    console.log('🟢 READY: EventStore initialized');
    } catch (error) {
      console.warn('⚠️ INIT: Config hash check failed (non-fatal):', error);
      console.log('🟢 READY: EventStore initialized (without hash check)');
      // Don't throw - config hash is nice-to-have, not required
    }
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
    await this.ensureInitialized();
    
    console.log('📖 READ: Querying events...');
    console.log('   Conditions:', query.conditions.map(c => 
      c.key && c.value ? `${c.type}[${c.key}=${c.value}]` : `${c.type}[*]`
    ).join(', ') || '(none)');
    
    const events = await this.storage.query(
      query.conditions,
      query.fromPosition,
      query.limit
    );
    
    console.log(`   Found: ${events.length} events`);

    // Get the latest position for the token
    const position = events.length > 0
      ? events[events.length - 1].position
      : await this.storage.getLatestPosition();

    const token = createToken(query, position);
    
    console.log(`🎟️ TOKEN: Generated at position #${position}`);
    console.log(`   Scope: ${query.conditions.length} condition(s)`);

    return new QueryResult<E>(
      events as StoredEvent<E>[],
      token,
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
   *   - ConsistencyToken: Token from previous read() call
   *   - AppendCondition: Direct { position, conditions } object
   * @returns AppendResult on success, ConflictResult on conflict
   * 
   * @example
   * ```typescript
   * // With token from read
   * const result = await store.append<CartEvents>([newEvent], queryResult.token);
   * 
   * // With direct condition
   * const result = await store.append<CartEvents>([newEvent], {
   *   position: queryResult.position,
   *   conditions: queryResult.conditions
   * });
   * ```
   */
  async append<E extends Event = Event>(
    events: EventWithMetadata<E>[],
    condition: ConsistencyToken | AppendCondition | null
  ): Promise<AppendResult | ConflictResult<E>> {
    await this.ensureInitialized();
    
    console.log(`✏️ APPEND: ${events.length} event(s)`);
    events.forEach(e => console.log(`   → ${e.type}: ${JSON.stringify(e.data).substring(0, 60)}...`));
    console.log(`   Condition: ${condition ? (typeof condition === 'string' ? 'token' : 'direct') : 'null (no conflict check)'}`);
    
    if (events.length === 0) {
      const position = await this.storage.getLatestPosition();
      return {
        conflict: false,
        position,
        token: condition 
          ? (typeof condition === 'string' ? condition : createToken({ conditions: condition.conditions }, position))
          : createToken({ conditions: [] }, position),
      };
    }

    // Extract keys from all events
    const keysPerEvent = events.map(event => this.keyExtractor.extract(event));
    console.log(`🔑 KEYS: Extracted from payload via config`);
    keysPerEvent.forEach((keys, i) => {
      console.log(`   Event ${i}: ${keys.map(k => `${k.name}="${k.value}"`).join(', ')}`);
    });

    // Parse condition (token string or direct object)
    let appendCondition: AppendCondition | null = null;
    
    if (condition !== null) {
      if (typeof condition === 'string') {
        // It's a token - decode it
        try {
          const payload = decodeToken(condition);
          appendCondition = {
            position: payload.pos,
            conditions: payload.q,
          };
        } catch (e) {
          if (e instanceof TokenDecodeError) {
            throw e;
          }
          throw e;
        }
      } else {
        // It's a direct AppendCondition object
        appendCondition = condition;
      }

      // Check for conflicts
      const conditionsStr = appendCondition.conditions.map(c => 
        c.key && c.value ? `${c.type}[${c.key}=${c.value}]` : `${c.type}[*]`
      ).join(', ');
      console.log(`🔍 CONFLICT CHECK: Looking for events since position #${appendCondition.position}`);
      console.log(`   Checking conditions: ${conditionsStr || '(none)'}`);
      
      const conflictingEvents = await this.storage.getEventsSince(
        appendCondition.conditions,
        appendCondition.position
      );
      
      console.log(`   Result: ${conflictingEvents.length} matching event(s) found since #${appendCondition.position}`);

      if (conflictingEvents.length > 0) {
        // Conflict detected
        console.log('');
        console.log('❌ ═══════════════════════════════════════');
        console.log('   CONFLICT DETECTED');
        console.log('═══════════════════════════════════════════');
        console.log('');
        console.log('📍 Your position: #' + appendCondition.position);
        console.log('');
        console.log('🔍 Query conditions you checked:');
        appendCondition.conditions.forEach(c => {
          if (c.key && c.value) {
            console.log(`   • ${c.type} where ${c.key}="${c.value}"`);
          } else {
            console.log(`   • ${c.type} (all)`);
          }
        });
        console.log('');
        console.log('⚡ Events written SINCE your read (that match your query):');
        conflictingEvents.forEach(e => {
          console.log(`   • Event #${e.position}: ${e.type}`);
          console.log(`     Data: ${JSON.stringify(e.data)}`);
        });
        console.log('');
        console.log('💡 Why conflict?');
        console.log('   These events match your query conditions!');
        console.log('   Your decision was based on stale data.');
        console.log('');
        console.log('🔄 Solution: Use result.newToken to retry.');
        console.log('═══════════════════════════════════════════');
        console.log('');
        
        const latestPosition = conflictingEvents[conflictingEvents.length - 1].position;
        const newToken = createToken(
          { conditions: appendCondition.conditions },
          latestPosition
        );

        return {
          conflict: true,
          conflictingEvents: conflictingEvents as StoredEvent<E>[],
          newToken,
        };
      }
    }

    // No conflict — prepare events for storage
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

    // Append atomically
    const position = await this.storage.append(eventsToStore, keysPerEvent);
    
    console.log(`💾 STORED: Event(s) at position #${position}`);

    // Build new token
    const newTokenQuery = this.buildQueryFromEvents(events, appendCondition);
    const newToken = createToken(newTokenQuery, position);
    
    console.log(`✅ SUCCESS: Append complete, new token at #${position}`);

    return {
      conflict: false,
      position,
      token: newToken,
    };
  }

  /**
   * Build a query that covers the appended events
   */
  private buildQueryFromEvents<E extends Event>(
    events: EventWithMetadata<E>[],
    originalCondition: AppendCondition | null
  ): Query {
    const conditions = new Map<string, { type: string; key: string; value: string }>();

    if (originalCondition !== null) {
      for (const cond of originalCondition.conditions) {
        if (cond.key && cond.value) {
          const key = `${cond.type}:${cond.key}:${cond.value}`;
          conditions.set(key, { type: cond.type, key: cond.key, value: cond.value });
        }
      }
    }

    // Add conditions from the newly appended events
    for (const event of events) {
      const extractedKeys = this.keyExtractor.extract(event);
      for (const extracted of extractedKeys) {
        const cond = { type: event.type, key: extracted.name, value: extracted.value };
        const key = `${cond.type}:${cond.key}:${cond.value}`;
        conditions.set(key, cond);
      }
    }

    return { conditions: Array.from(conditions.values()) };
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
