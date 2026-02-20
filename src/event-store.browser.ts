/**
 * Browser-compatible EventStore using async Web Crypto API
 */

import { KeyExtractor } from './config/extractor.js';
import { validateConfig } from './config/validator.js';
import type { EventStorage } from './storage/interface.js';
import { SqlJsStorage } from './storage/sqljs.js';
import { createToken, validateToken, TokenValidationError } from './token.browser.js';
import type {
  AppendResult,
  ConflictResult,
  ConsistencyConfig,
  ConsistencyToken,
  EventStoreOptions,
  NewEvent,
  Query,
  ReadResult,
} from './types.js';

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
  private readonly secret: string;
  private readonly keyExtractor: KeyExtractor;
  private readonly config: ConsistencyConfig;
  private initPromise: Promise<void> | null = null;

  constructor(options: EventStoreConfig) {
    // Validate configuration
    validateConfig(options.consistency);

    this.storage = options.storage;
    this.secret = options.secret;
    this.config = options.consistency;
    this.keyExtractor = new KeyExtractor(this.config);

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

    const currentHash = await hashConfig(this.config);
    const storedHash = await this.storage.getConfigHash();

    if (storedHash === null) {
      // First run — just store the hash
      console.log('[EventStore] First run, storing config hash:', currentHash.substring(0, 16) + '...');
      await this.storage.setConfigHash(currentHash);
    } else if (storedHash !== currentHash) {
      // Config changed — reindex!
      console.log('[EventStore] ⚠️  Config changed! Rebuilding key index...');
      console.log(`[EventStore]    Old hash: ${storedHash.substring(0, 16)}...`);
      console.log(`[EventStore]    New hash: ${currentHash.substring(0, 16)}...`);
      const startTime = Date.now();
      
      let eventCount = 0;
      let keyCount = 0;
      
      await this.storage.reindex((event) => {
        eventCount++;
        // Convert StoredEvent to NewEvent format for KeyExtractor
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
      console.log(`[EventStore] ✅ Reindex complete: ${eventCount} events, ${keyCount} keys (${duration}ms)`);
    }
  }

  /**
   * Read events matching a query
   * @returns Events and a consistency token for subsequent appends
   */
  async read(query: Query): Promise<ReadResult> {
    await this.ensureInitialized();
    
    const events = await this.storage.query(
      query.conditions,
      query.fromPosition,
      query.limit
    );

    // Get the latest position for the token
    // If we have events, use the last event's position
    // Otherwise, use the current latest position
    const position = events.length > 0
      ? events[events.length - 1].position
      : await this.storage.getLatestPosition();

    const token = await createToken(query, position, this.secret);

    return { events, token };
  }

  /**
   * Append events with consistency check
   * @param events Events to append
   * @param token Consistency token from previous read (null to skip check)
   * @returns AppendResult on success, ConflictResult on conflict
   */
  async append(
    events: NewEvent[],
    token: ConsistencyToken | null
  ): Promise<AppendResult | ConflictResult> {
    await this.ensureInitialized();
    
    if (events.length === 0) {
      // Nothing to append
      const position = await this.storage.getLatestPosition();
      return {
        conflict: false,
        position,
        token: token ?? await createToken({ conditions: [] }, position, this.secret),
      };
    }

    // Extract keys from all events
    const keysPerEvent = events.map(event => this.keyExtractor.extract(event));

    // If token provided, validate and check for conflicts
    if (token !== null) {
      let tokenPayload;
      try {
        tokenPayload = await validateToken(token, this.secret);
      } catch (e) {
        if (e instanceof TokenValidationError) {
          throw e;
        }
        throw e;
      }

      // Check for conflicts: any events since token position that match the query?
      const conflictingEvents = await this.storage.getEventsSince(
        tokenPayload.q,
        tokenPayload.pos
      );

      if (conflictingEvents.length > 0) {
        // Conflict detected — return delta
        const latestPosition = conflictingEvents[conflictingEvents.length - 1].position;
        const newToken = await createToken(
          { conditions: tokenPayload.q },
          latestPosition,
          this.secret
        );

        return {
          conflict: true,
          conflictingEvents,
          newToken,
        };
      }
    }

    // No conflict — prepare events for storage
    const now = new Date();
    const eventsToStore = events.map(event => ({
      id: crypto.randomUUID(),
      type: event.type,
      data: event.data,
      metadata: event.metadata,
      timestamp: now,
    }));

    // Append atomically
    const position = await this.storage.append(eventsToStore, keysPerEvent);

    // Build new token
    // The new token should include the query conditions that were checked
    // plus any new conditions from the appended events
    const newTokenQuery = await this.buildQueryFromEvents(events, token);
    const newToken = await createToken(newTokenQuery, position, this.secret);

    return {
      conflict: false,
      position,
      token: newToken,
    };
  }

  /**
   * Build a query that covers the appended events
   * Used to create the token returned after append
   */
  private async buildQueryFromEvents(events: NewEvent[], originalToken: ConsistencyToken | null): Promise<Query> {
    // Start with original query conditions if token was provided
    const conditions = new Map<string, { type: string; key: string; value: string }>();

    if (originalToken !== null) {
      try {
        const payload = await validateToken(originalToken, this.secret);
        for (const cond of payload.q) {
          const key = `${cond.type}:${cond.key}:${cond.value}`;
          conditions.set(key, cond);
        }
      } catch {
        // Ignore invalid token for query building
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
