/**
 * PostgreSQL Storage implementation using pg
 */

import { Pool, PoolClient, type PoolConfig } from 'pg';
import { isConstrainedCondition, isKeyOnlyCondition, type ExtractedKey, type QueryCondition, type StoredEvent } from '../types.js';
import type { EventStorage, EventToStore } from './interface.js';

const SCHEMA = `
-- Events (Append-Only Log)
CREATE TABLE IF NOT EXISTS events (
  position BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consistency Key Index (populated by store on write)
CREATE TABLE IF NOT EXISTS event_keys (
  position BIGINT NOT NULL REFERENCES events(position) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  PRIMARY KEY (position, key_name, key_value)
);

-- Metadata (for config hash, etc.)
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indices for fast queries
CREATE INDEX IF NOT EXISTS idx_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_key ON event_keys(key_name, key_value);
CREATE INDEX IF NOT EXISTS idx_key_position ON event_keys(key_name, key_value, position);
`;

interface EventRow {
  position: string; // PostgreSQL BIGINT comes as string
  event_id: string;
  event_type: string;
  data: unknown;
  metadata: unknown | null;
  timestamp: Date;
}

/**
 * PostgreSQL-backed event storage
 * 
 * Uses connection pooling for efficient database access.
 * Supports both connection strings and pool configuration objects.
 * 
 * @example
 * ```typescript
 * // Using connection string
 * const storage = new PostgresStorage('postgresql://user:pass@localhost/db');
 * await storage.init();
 * 
 * // Using pool config
 * const storage = new PostgresStorage({
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'mydb',
 *   user: 'myuser',
 *   password: 'mypass',
 *   max: 20, // max pool size
 * });
 * await storage.init();
 * ```
 */
export class PostgresStorage implements EventStorage {
  private pool: Pool;
  private initialized = false;

  constructor(connectionStringOrConfig: string | PoolConfig) {
    if (typeof connectionStringOrConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionStringOrConfig });
    } else {
      this.pool = new Pool(connectionStringOrConfig);
    }
  }

  /**
   * Initialize the database schema.
   * Must be called before any other operations.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    const client = await this.pool.connect();
    try {
      await client.query(SCHEMA);
      this.initialized = true;
    } finally {
      client.release();
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PostgresStorage not initialized. Call init() first.');
    }
  }

  async append(eventsToStore: EventToStore[], keys: ExtractedKey[][]): Promise<bigint> {
    this.ensureInitialized();

    if (eventsToStore.length !== keys.length) {
      throw new Error('Events and keys arrays must have the same length');
    }

    if (eventsToStore.length === 0) {
      return this.getLatestPosition();
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let lastPosition: bigint = 0n;

      for (let i = 0; i < eventsToStore.length; i++) {
        const event = eventsToStore[i];
        const eventKeys = keys[i];

        // Insert event
        const result = await client.query<{ position: string }>(
          `INSERT INTO events (event_id, event_type, data, metadata, timestamp)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING position`,
          [
            event.id,
            event.type,
            JSON.stringify(event.data),
            event.metadata ? JSON.stringify(event.metadata) : null,
            event.timestamp.toISOString(),
          ]
        );

        const position = BigInt(result.rows[0].position);
        lastPosition = position;

        // Insert keys
        for (const key of eventKeys) {
          await client.query(
            `INSERT INTO event_keys (position, key_name, key_value)
             VALUES ($1, $2, $3)`,
            [position.toString(), key.name, key.value]
          );
        }
      }

      await client.query('COMMIT');
      return lastPosition;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async query(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): Promise<StoredEvent[]> {
    this.ensureInitialized();

    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (conditions.length === 0) {
      // No conditions = return all events
      let sql = `
        SELECT position, event_id, event_type, data, metadata, timestamp
        FROM events
      `;

      if (fromPosition !== undefined) {
        sql += ` WHERE position > $${paramIndex}`;
        params.push(fromPosition.toString());
        paramIndex++;
      }

      sql += ' ORDER BY position';

      if (limit !== undefined) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(limit);
      }

      const result = await this.pool.query<EventRow>(sql, params);
      return result.rows.map(row => this.rowToEvent(row));
    }

    // Separate conditions by type
    const constrained = conditions.filter(isConstrainedCondition);
    const keyOnly = conditions.filter(isKeyOnlyCondition);
    const unconstrained = conditions.filter(c => !isConstrainedCondition(c) && !isKeyOnlyCondition(c)) as Array<{ type: string }>;

    // Build CTE-based query with UNION for better index utilization
    const ctes: string[] = [];
    const cteNames: string[] = [];

    const positionFilter = fromPosition !== undefined ? fromPosition.toString() : null;

    // CTE for unconstrained conditions (type-only, no join needed)
    if (unconstrained.length > 0) {
      const typePlaceholders = unconstrained.map(() => {
        const ph = `$${paramIndex}`;
        paramIndex++;
        return ph;
      });
      let cteSql = `
        SELECT position, event_id, event_type, data, metadata, timestamp
        FROM events
        WHERE event_type IN (${typePlaceholders.join(', ')})`;
      params.push(...unconstrained.map(c => c.type));
      
      if (positionFilter !== null) {
        cteSql += ` AND position > $${paramIndex}`;
        params.push(positionFilter);
        paramIndex++;
      }
      ctes.push(`unconstrained_matches AS (${cteSql})`);
      cteNames.push('unconstrained_matches');
    }

    // CTE for constrained conditions (type + key + value)
    if (constrained.length > 0) {
      const constrainedClauses = constrained.map(c => {
        const clause = `(e.event_type = $${paramIndex} AND k.key_name = $${paramIndex + 1} AND k.key_value = $${paramIndex + 2})`;
        params.push(c.type, c.key, c.value);
        paramIndex += 3;
        return clause;
      });
      let cteSql = `
        SELECT DISTINCT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
        FROM events e
        INNER JOIN event_keys k ON e.position = k.position
        WHERE (${constrainedClauses.join(' OR ')})`;
      
      if (positionFilter !== null) {
        cteSql += ` AND e.position > $${paramIndex}`;
        params.push(positionFilter);
        paramIndex++;
      }
      ctes.push(`constrained_matches AS (${cteSql})`);
      cteNames.push('constrained_matches');
    }

    // CTE for key-only conditions (key + value, any type)
    if (keyOnly.length > 0) {
      const keyOnlyClauses = keyOnly.map(c => {
        const clause = `(k.key_name = $${paramIndex} AND k.key_value = $${paramIndex + 1})`;
        params.push(c.key, c.value);
        paramIndex += 2;
        return clause;
      });
      let cteSql = `
        SELECT DISTINCT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
        FROM events e
        INNER JOIN event_keys k ON e.position = k.position
        WHERE (${keyOnlyClauses.join(' OR ')})`;
      
      if (positionFilter !== null) {
        cteSql += ` AND e.position > $${paramIndex}`;
        params.push(positionFilter);
        paramIndex++;
      }
      ctes.push(`key_only_matches AS (${cteSql})`);
      cteNames.push('key_only_matches');
    }

    // Build final query with UNION
    const unionParts = cteNames.map(name => `SELECT * FROM ${name}`);
    
    let sql = `WITH ${ctes.join(',\n')}
SELECT * FROM (${unionParts.join(' UNION ')}) AS combined
ORDER BY position`;

    if (limit !== undefined) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(limit);
    }

    const result = await this.pool.query<EventRow>(sql, params);
    return result.rows.map(row => this.rowToEvent(row));
  }

  async getEventsSince(
    conditions: QueryCondition[],
    sincePosition: bigint
  ): Promise<StoredEvent[]> {
    return this.query(conditions, sincePosition);
  }

  async getLatestPosition(): Promise<bigint> {
    this.ensureInitialized();

    const result = await this.pool.query<{ pos: string | null }>(
      'SELECT MAX(position) as pos FROM events'
    );
    return result.rows[0].pos ? BigInt(result.rows[0].pos) : 0n;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // --- UI Helper Methods (not part of core DCB API) ---

  /**
   * Get all events (for debugging/UI)
   */
  async getAllEvents(): Promise<StoredEvent[]> {
    this.ensureInitialized();

    const result = await this.pool.query<EventRow>(`
      SELECT position, event_id, event_type, data, metadata, timestamp
      FROM events
      ORDER BY position ASC
    `);

    return result.rows.map(row => this.rowToEvent(row));
  }

  /**
   * Get all keys (for debugging/UI)
   */
  async getAllKeys(): Promise<Array<{ position: bigint; key_name: string; key_value: string }>> {
    this.ensureInitialized();

    const result = await this.pool.query<{ position: string; key_name: string; key_value: string }>(`
      SELECT position, key_name, key_value
      FROM event_keys
      ORDER BY position ASC
    `);

    return result.rows.map(row => ({
      position: BigInt(row.position),
      key_name: row.key_name,
      key_value: row.key_value,
    }));
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM event_keys');
      await client.query('DELETE FROM events');
      // Reset the sequence
      await client.query('ALTER SEQUENCE events_position_seq RESTART WITH 1');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // --- Metadata Methods ---

  /**
   * Get stored config hash
   */
  async getConfigHash(): Promise<string | null> {
    this.ensureInitialized();

    const result = await this.pool.query<{ value: string }>(
      "SELECT value FROM metadata WHERE key = 'config_hash'"
    );
    return result.rows[0]?.value ?? null;
  }

  /**
   * Set config hash
   */
  async setConfigHash(hash: string): Promise<void> {
    this.ensureInitialized();

    await this.pool.query(
      `INSERT INTO metadata (key, value) VALUES ('config_hash', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [hash]
    );
  }

  /**
   * Reindex all events with new keys
   */
  async reindex(extractKeys: (event: StoredEvent) => ExtractedKey[]): Promise<void> {
    this.ensureInitialized();

    const events = await this.getAllEvents();
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Clear all keys
      await client.query('DELETE FROM event_keys');

      // Re-extract and insert keys for all events
      for (const event of events) {
        const keys = extractKeys(event);
        for (const key of keys) {
          await client.query(
            'INSERT INTO event_keys (position, key_name, key_value) VALUES ($1, $2, $3)',
            [event.position.toString(), key.name, key.value]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private rowToEvent(row: EventRow): StoredEvent {
    return {
      id: row.event_id,
      type: row.event_type,
      data: row.data as Record<string, unknown>,
      metadata: row.metadata as Record<string, unknown> | undefined,
      timestamp: new Date(row.timestamp),
      position: BigInt(row.position),
    };
  }
}
