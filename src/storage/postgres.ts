/**
 * PostgreSQL Storage implementation using pg
 */

import { Pool, PoolClient, type PoolConfig } from 'pg';
import { isConstrainedCondition, type ExtractedKey, type QueryCondition, type StoredEvent } from '../types.js';
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

      // Batch insert all events in one query
      const eventValues: string[] = [];
      const eventParams: unknown[] = [];
      for (let i = 0; i < eventsToStore.length; i++) {
        const event = eventsToStore[i];
        const offset = i * 5;
        eventValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
        eventParams.push(
          event.id,
          event.type,
          JSON.stringify(event.data),
          event.metadata ? JSON.stringify(event.metadata) : null,
          event.timestamp.toISOString(),
        );
      }

      const result = await client.query<{ position: string }>(
        `INSERT INTO events (event_id, event_type, data, metadata, timestamp)
         VALUES ${eventValues.join(', ')}
         RETURNING position`,
        eventParams
      );

      const positions = result.rows.map(row => BigInt(row.position));
      const lastPosition = positions[positions.length - 1];

      // Batch insert all keys in one query
      const keyValues: string[] = [];
      const keyParams: unknown[] = [];
      let keyParamIdx = 1;
      for (let i = 0; i < keys.length; i++) {
        const position = positions[i].toString();
        for (const key of keys[i]) {
          keyValues.push(`($${keyParamIdx}, $${keyParamIdx + 1}, $${keyParamIdx + 2})`);
          keyParams.push(position, key.name, key.value);
          keyParamIdx += 3;
        }
      }

      if (keyValues.length > 0) {
        await client.query(
          `INSERT INTO event_keys (position, key_name, key_value)
           VALUES ${keyValues.join(', ')}`,
          keyParams
        );
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
    const unconstrained = conditions.filter(c => !isConstrainedCondition(c)) as Array<{ type: string }>;

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

    // Constrained conditions: group by (key_name, key_value) for optimal index usage.
    // Each group uses a keys-first join with IN() for event types sharing the same key,
    // then groups are combined with UNION ALL (no duplicates since types differ).
    if (constrained.length > 0) {
      // Group constrained conditions by (key_name, key_value)
      const keyGroups = new Map<string, { key: string; value: string; types: string[] }>();
      for (const c of constrained) {
        const groupKey = `${c.key}\0${c.value}`;
        let group = keyGroups.get(groupKey);
        if (!group) {
          group = { key: c.key, value: c.value, types: [] };
          keyGroups.set(groupKey, group);
        }
        group.types.push(c.type);
      }

      // Build one sub-select per key group using keys-first join
      const constrainedParts: string[] = [];
      for (const group of keyGroups.values()) {
        // key_name and key_value params
        const keyNameParam = `$${paramIndex}`;
        params.push(group.key);
        paramIndex++;

        const keyValueParam = `$${paramIndex}`;
        params.push(group.value);
        paramIndex++;

        // event_type IN (...) params
        const typeParams = group.types.map(t => {
          const ph = `$${paramIndex}`;
          params.push(t);
          paramIndex++;
          return ph;
        });

        let partSql = `
          SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
          FROM event_keys k
          INNER JOIN events e ON e.position = k.position
          WHERE k.key_name = ${keyNameParam} AND k.key_value = ${keyValueParam}
            AND e.event_type IN (${typeParams.join(', ')})`;

        if (positionFilter !== null) {
          partSql += ` AND e.position > $${paramIndex}`;
          params.push(positionFilter);
          paramIndex++;
        }
        constrainedParts.push(partSql);
      }

      if (constrainedParts.length === 1) {
        ctes.push(`constrained_matches AS (${constrainedParts[0]})`);
      } else {
        const unionSql = constrainedParts.join('\n          UNION ALL\n        ');
        ctes.push(`constrained_matches AS (${unionSql})`);
      }
      cteNames.push('constrained_matches');
    }

    // Build final query with UNION ALL (no duplicates: unconstrained and constrained
    // conditions are disjoint by type, and within constrained groups types are explicit)
    const unionParts = cteNames.map(name => `SELECT * FROM ${name}`);
    
    let sql = `WITH ${ctes.join(',\n')}
SELECT * FROM (${unionParts.join(' UNION ALL ')}) AS combined
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
