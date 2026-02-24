/**
 * SQLite Storage implementation using better-sqlite3
 */

import Database from 'better-sqlite3';
import { isConstrainedCondition, type ExtractedKey, type QueryCondition, type StoredEvent } from '../types.js';
import type { EventStorage, EventToStore, StorageAppendCondition, AppendWithConditionResult } from './interface.js';

const SCHEMA = `
-- Events (Append-Only Log)
CREATE TABLE IF NOT EXISTS events (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  data TEXT NOT NULL,
  metadata TEXT,
  timestamp TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Consistency Key Index (populated by store on write)
CREATE TABLE IF NOT EXISTS event_keys (
  position INTEGER NOT NULL REFERENCES events(position),
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
  position: number;
  event_id: string;
  event_type: string;
  data: string;
  metadata: string | null;
  timestamp: string;
}

/**
 * SQLite-backed event storage
 */
export class SqliteStorage implements EventStorage {
  private db: Database.Database;

  constructor(path: string = ':memory:') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

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

    let lastPosition: bigint = 0n;
    let conflicting: StoredEvent[] | undefined;

    const insertEvent = this.db.prepare(`
      INSERT INTO events (event_id, event_type, data, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertKey = this.db.prepare(`
      INSERT INTO event_keys (position, key_name, key_value)
      VALUES (?, ?, ?)
    `);

    // Everything in one transaction for atomicity
    const transaction = this.db.transaction(() => {
      // 1. Conflict check (if condition provided)
      if (condition !== null) {
        const rows = this.querySync(condition.failIfEventsMatch, condition.after);
        
        if (rows.length > 0) {
          conflicting = rows;
          return; // Exit transaction without inserting
        }
      }

      // 2. Insert events
      for (let i = 0; i < eventsToStore.length; i++) {
        const event = eventsToStore[i];
        const eventKeys = keys[i];

        // Insert event
        const result = insertEvent.run(
          event.id,
          event.type,
          JSON.stringify(event.data),
          event.metadata ? JSON.stringify(event.metadata) : null,
          event.timestamp.toISOString()
        );

        const position = BigInt(result.lastInsertRowid);
        lastPosition = position;

        // Insert keys
        for (const key of eventKeys) {
          insertKey.run(Number(position), key.name, key.value);
        }
      }
    });

    transaction();

    // Return result
    if (conflicting) {
      return { conflicting };
    }
    return { position: lastPosition };
  }

  /**
   * Synchronous query for use within transactions
   */
  private querySync(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): StoredEvent[] {
    if (conditions.length === 0) {
      // No conditions = return all events
      let sql = `
        SELECT position, event_id, event_type, data, metadata, timestamp
        FROM events
      `;
      const params: (string | number)[] = [];

      if (fromPosition !== undefined) {
        sql += ' WHERE position > ?';
        params.push(Number(fromPosition));
      }

      sql += ' ORDER BY position';

      if (limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const rows = this.db.prepare(sql).all(...params) as EventRow[];
      return rows.map(row => this.rowToEvent(row));
    }

    // Separate conditions by type
    const constrained = conditions.filter(isConstrainedCondition);
    const unconstrained = conditions.filter(c => !isConstrainedCondition(c)) as Array<{ type: string }>;

    // Build CTE-based query with UNION for better index utilization
    const ctes: string[] = [];
    const cteNames: string[] = [];
    const params: (string | number)[] = [];

    const positionFilter = fromPosition !== undefined ? Number(fromPosition) : null;

    // CTE for unconstrained conditions (type-only, no join needed)
    if (unconstrained.length > 0) {
      const typePlaceholders = unconstrained.map(() => '?').join(', ');
      let cteSql = `
        SELECT position, event_id, event_type, data, metadata, timestamp
        FROM events
        WHERE event_type IN (${typePlaceholders})`;
      if (positionFilter !== null) {
        cteSql += ' AND position > ?';
      }
      ctes.push(`unconstrained_matches AS (${cteSql})`);
      cteNames.push('unconstrained_matches');
      params.push(...unconstrained.map(c => c.type));
      if (positionFilter !== null) params.push(positionFilter);
    }

    // CTEs for constrained conditions
    if (constrained.length > 0) {
      constrained.forEach((c, i) => {
        if (positionFilter !== null) {
          // MATERIALIZED: key positions first, then join events by PK
          const keyCteName = `keys_${i}`;
          const keyCte = `
            SELECT position FROM event_keys INDEXED BY idx_key_position
            WHERE key_name = ? AND key_value = ? AND position > ?`;
          ctes.push(`${keyCteName} AS MATERIALIZED (${keyCte})`);

          const cteName = `constrained_${i}`;
          const cteSql = `
            SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
            FROM ${keyCteName} k
            INNER JOIN events e ON e.position = k.position
            WHERE e.event_type = ?`;
          ctes.push(`${cteName} AS (${cteSql})`);
          cteNames.push(cteName);
          params.push(c.key, c.value, positionFilter, c.type);
        } else {
          // Flat CTE: let SQLite choose join order, INDEXED BY guides key lookups
          const cteName = `constrained_${i}`;
          const cteSql = `
            SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
            FROM event_keys k INDEXED BY idx_key_position
            INNER JOIN events e ON e.position = k.position
            WHERE k.key_name = ? AND k.key_value = ? AND e.event_type = ?`;
          ctes.push(`${cteName} AS (${cteSql})`);
          cteNames.push(cteName);
          params.push(c.key, c.value, c.type);
        }
      });
    }

    // Build final query with UNION
    const unionParts = cteNames.map(name => `SELECT * FROM ${name}`);
    
    let sql = `WITH ${ctes.join(',\n')}
SELECT * FROM (${unionParts.join(' UNION ')}) AS combined
ORDER BY position`;

    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  async query(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): Promise<StoredEvent[]> {
    return this.querySync(conditions, fromPosition, limit);
  }

  async getLatestPosition(): Promise<bigint> {
    const row = this.db.prepare('SELECT MAX(position) as pos FROM events').get() as { pos: number | null };
    return row.pos ? BigInt(row.pos) : 0n;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // --- UI Helper Methods (not part of core DCB API) ---

  /**
   * Get all events (for debugging/UI)
   */
  getAllEvents(): StoredEvent[] {
    const rows = this.db.prepare(`
      SELECT position, event_id, event_type, data, metadata, timestamp
      FROM events
      ORDER BY position ASC
    `).all() as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Get all keys (for debugging/UI)
   */
  getAllKeys(): Array<{ position: number; key_name: string; key_value: string }> {
    return this.db.prepare(`
      SELECT position, key_name, key_value
      FROM event_keys
      ORDER BY position ASC
    `).all() as Array<{ position: number; key_name: string; key_value: string }>;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.db.exec('DELETE FROM event_keys');
    this.db.exec('DELETE FROM events');
    this.db.exec("DELETE FROM sqlite_sequence WHERE name IN ('events', 'event_keys')");
  }

  // --- Metadata Methods ---

  /**
   * Get stored config hash
   */
  getConfigHash(): string | null {
    const row = this.db.prepare(
      "SELECT value FROM metadata WHERE key = 'config_hash'"
    ).get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  /**
   * Set config hash
   */
  setConfigHash(hash: string): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('config_hash', ?)"
    ).run(hash);
  }

  /**
   * Reindex all events with new keys
   */
  reindex(extractKeys: (event: StoredEvent) => ExtractedKey[]): void {
    const events = this.getAllEvents();
    
    const deleteKeys = this.db.prepare('DELETE FROM event_keys');
    const insertKey = this.db.prepare(
      'INSERT INTO event_keys (position, key_name, key_value) VALUES (?, ?, ?)'
    );

    const transaction = this.db.transaction(() => {
      // Clear all keys
      deleteKeys.run();

      // Re-extract and insert keys for all events
      for (const event of events) {
        const keys = extractKeys(event);
        for (const key of keys) {
          insertKey.run(Number(event.position), key.name, key.value);
        }
      }
    });

    transaction();
  }

  private rowToEvent(row: EventRow): StoredEvent {
    return {
      id: row.event_id,
      type: row.event_type,
      data: JSON.parse(row.data),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: new Date(row.timestamp),
      position: BigInt(row.position),
    };
  }
}
