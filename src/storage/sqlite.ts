/**
 * SQLite Storage implementation using better-sqlite3
 */

import Database from 'better-sqlite3';
import { isConstrainedCondition, type ExtractedKey, type QueryCondition, type StoredEvent } from '../types.js';
import type { EventStorage, EventToStore } from './interface.js';

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

  async append(eventsToStore: EventToStore[], keys: ExtractedKey[][]): Promise<bigint> {
    if (eventsToStore.length !== keys.length) {
      throw new Error('Events and keys arrays must have the same length');
    }

    if (eventsToStore.length === 0) {
      return this.getLatestPosition();
    }

    const insertEvent = this.db.prepare(`
      INSERT INTO events (event_id, event_type, data, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertKey = this.db.prepare(`
      INSERT INTO event_keys (position, key_name, key_value)
      VALUES (?, ?, ?)
    `);

    let lastPosition: bigint = 0n;

    // Everything in one transaction for atomicity
    const transaction = this.db.transaction(() => {
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

    return lastPosition;
  }

  async query(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): Promise<StoredEvent[]> {
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

    // Separate conditions: constrained (with key/value) vs unconstrained (type only)
    const constrained = conditions.filter(isConstrainedCondition);
    const unconstrained = conditions.filter(c => !isConstrainedCondition(c));

    const whereClauses: string[] = [];
    const whereParams: (string | number)[] = [];

    // Unconstrained: match by type only (no join needed)
    if (unconstrained.length > 0) {
      const typePlaceholders = unconstrained.map(() => '?').join(', ');
      whereClauses.push(`e.event_type IN (${typePlaceholders})`);
      whereParams.push(...unconstrained.map(c => c.type));
    }

    // Constrained: match by type + key + value
    if (constrained.length > 0) {
      const constrainedClauses = constrained.map(
        () => '(e.event_type = ? AND k.key_name = ? AND k.key_value = ?)'
      );
      whereClauses.push(`(${constrainedClauses.join(' OR ')})`);
      whereParams.push(...constrained.flatMap(c => [c.type, c.key, c.value]));
    }

    // Build SQL
    let sql: string;
    if (constrained.length > 0) {
      // Need JOIN for constrained conditions
      sql = `
        SELECT DISTINCT
          e.position,
          e.event_id,
          e.event_type,
          e.data,
          e.metadata,
          e.timestamp
        FROM events e
        LEFT JOIN event_keys k ON e.position = k.position
        WHERE (${whereClauses.join(' OR ')})
      `;
    } else {
      // No constrained conditions, no JOIN needed
      sql = `
        SELECT
          position,
          event_id,
          event_type,
          data,
          metadata,
          timestamp
        FROM events e
        WHERE (${whereClauses.join(' OR ')})
      `;
    }

    const params: (string | number)[] = [...whereParams];

    if (fromPosition !== undefined) {
      sql += ' AND e.position > ?';
      params.push(Number(fromPosition));
    }

    sql += ' ORDER BY e.position';

    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  async getEventsSince(
    conditions: QueryCondition[],
    sincePosition: bigint
  ): Promise<StoredEvent[]> {
    return this.query(conditions, sincePosition);
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
