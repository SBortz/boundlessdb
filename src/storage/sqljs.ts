/**
 * sql.js Storage implementation for browser environments
 */

import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js';
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
  position INTEGER NOT NULL,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  PRIMARY KEY (position, key_name, key_value),
  FOREIGN KEY (position) REFERENCES events(position)
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

export interface SqlJsStorageOptions {
  /** URL to load sql.js WASM from (optional, uses CDN by default) */
  wasmUrl?: string;
  /** Existing database bytes to restore from */
  data?: ArrayLike<number>;
}

/**
 * sql.js-backed event storage for browser environments
 */
export class SqlJsStorage implements EventStorage {
  private db: SqlJsDatabase | null = null;
  private initPromise: Promise<void>;

  constructor(options: SqlJsStorageOptions = {}) {
    this.initPromise = this.initialize(options);
  }

  private async initialize(options: SqlJsStorageOptions): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        if (options.wasmUrl) return options.wasmUrl;
        // Use CDN by default
        return `https://sql.js.org/dist/${file}`;
      }
    });

    if (options.data) {
      this.db = new SQL.Database(new Uint8Array(options.data));
    } else {
      this.db = new SQL.Database();
    }

    this.db!.run(SCHEMA);
  }

  private async ensureInitialized(): Promise<SqlJsDatabase> {
    await this.initPromise;
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  async append(eventsToStore: EventToStore[], keys: ExtractedKey[][]): Promise<bigint> {
    const db = await this.ensureInitialized();

    if (eventsToStore.length !== keys.length) {
      throw new Error('Events and keys arrays must have the same length');
    }

    if (eventsToStore.length === 0) {
      return this.getLatestPosition();
    }

    let lastPosition: bigint = 0n;

    // sql.js doesn't have built-in transactions, but we can use BEGIN/COMMIT
    db.run('BEGIN TRANSACTION');

    try {
      // sql.js db.run() doesn't support params properly - use escaped SQL
      const escapeSql = (s: string | null): string => {
        if (s === null) return 'NULL';
        return "'" + s.replace(/'/g, "''") + "'";
      };
      
      for (let i = 0; i < eventsToStore.length; i++) {
        const event = eventsToStore[i];
        const eventKeys = keys[i];

        // Insert event
        const eventId = String(event.id);
        const eventType = String(event.type);
        const eventData = JSON.stringify(event.data);
        const eventMeta = event.metadata ? JSON.stringify(event.metadata) : null;
        const eventTime = event.timestamp.toISOString();
        
        if (!eventId || eventId === 'undefined' || eventId === 'null') {
          throw new Error(`[SqlJsStorage] Invalid event ID: "${eventId}"`);
        }
        
        const sql = `INSERT INTO events (event_id, event_type, data, metadata, timestamp)
           VALUES (${escapeSql(eventId)}, ${escapeSql(eventType)}, ${escapeSql(eventData)}, ${eventMeta === null ? 'NULL' : escapeSql(eventMeta)}, ${escapeSql(eventTime)})`;
        
        db.run(sql);

        // Get the last inserted position
        const result = db.exec('SELECT last_insert_rowid() as position');
        const position = BigInt(result[0].values[0][0] as number);
        lastPosition = position;

        // Insert keys
        for (const key of eventKeys) {
          const keySql = `INSERT INTO event_keys (position, key_name, key_value) VALUES (${Number(position)}, ${escapeSql(key.name)}, ${escapeSql(key.value)})`;
          db.run(keySql);
        }
      }

      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

    return lastPosition;
  }

  async query(
    conditions: QueryCondition[],
    fromPosition?: bigint,
    limit?: number
  ): Promise<StoredEvent[]> {
    const db = await this.ensureInitialized();

    // sql.js doesn't support params properly - use escaped SQL
    const escapeSql = (s: string): string => "'" + s.replace(/'/g, "''") + "'";

    if (conditions.length === 0) {
      // No conditions = return all events
      let sql = `
        SELECT position, event_id, event_type, data, metadata, timestamp
        FROM events
      `;

      if (fromPosition !== undefined) {
        sql += ` WHERE position > ${Number(fromPosition)}`;
      }

      sql += ' ORDER BY position';

      if (limit !== undefined) {
        sql += ` LIMIT ${Number(limit)}`;
      }

      const result = db.exec(sql);
      if (result.length === 0) return [];

      const columns = (result[0] as any).columns || (result[0] as any).lc;
      const rows = result[0].values;

      return rows.map((row: SqlValue[]) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return this.rowToEvent(obj as unknown as EventRow);
      });
    }

    // Separate conditions: constrained (with key/value) vs unconstrained (type only)
    const constrained = conditions.filter(isConstrainedCondition);
    const unconstrained = conditions.filter(c => !isConstrainedCondition(c));

    const whereClauses: string[] = [];

    // Unconstrained: match by type only
    if (unconstrained.length > 0) {
      const typeList = unconstrained.map(c => escapeSql(c.type)).join(', ');
      whereClauses.push(`e.event_type IN (${typeList})`);
    }

    // Constrained: match by type + key + value
    if (constrained.length > 0) {
      const constrainedClauses = constrained.map(
        c => `(e.event_type = ${escapeSql(c.type)} AND k.key_name = ${escapeSql(c.key)} AND k.key_value = ${escapeSql(c.value)})`
      );
      whereClauses.push(`(${constrainedClauses.join(' OR ')})`);
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

    if (fromPosition !== undefined) {
      sql += ` AND e.position > ${Number(fromPosition)}`;
    }

    sql += ' ORDER BY e.position';

    if (limit !== undefined) {
      sql += ` LIMIT ${Number(limit)}`;
    }

    const result = db.exec(sql);
    if (result.length === 0) return [];

    // sql.js uses 'columns' or 'lc' depending on version
    const columns = (result[0] as any).columns || (result[0] as any).lc;
    const rows = result[0].values;

    return rows.map((row: SqlValue[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return this.rowToEvent(obj as unknown as EventRow);
    });
  }

  async getEventsSince(
    conditions: QueryCondition[],
    sincePosition: bigint
  ): Promise<StoredEvent[]> {
    return this.query(conditions, sincePosition);
  }

  async getLatestPosition(): Promise<bigint> {
    const db = await this.ensureInitialized();
    const result = db.exec('SELECT MAX(position) as pos FROM events');
    if (result.length === 0 || result[0].values[0][0] === null) {
      return 0n;
    }
    return BigInt(result[0].values[0][0] as number);
  }

  async close(): Promise<void> {
    const db = await this.ensureInitialized();
    db.close();
    this.db = null;
  }

  // --- UI Helper Methods (not part of core DCB API) ---

  /**
   * Get all events (for debugging/UI)
   */
  async getAllEvents(): Promise<StoredEvent[]> {
    const db = await this.ensureInitialized();
    const result = db.exec(`
      SELECT position, event_id, event_type, data, metadata, timestamp
      FROM events
      ORDER BY position ASC
    `);

    if (result.length === 0) {
      return [];
    }

    // sql.js uses 'columns' or 'lc' depending on version
    const columns = (result[0] as any).columns || (result[0] as any).lc;
    const rows = result[0].values;

    return rows.map((row: SqlValue[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return this.rowToEvent(obj as unknown as EventRow);
    });
  }

  /**
   * Get all keys (for debugging/UI)
   */
  async getAllKeys(): Promise<Array<{ position: number; key_name: string; key_value: string }>> {
    const db = await this.ensureInitialized();
    const result = db.exec(`
      SELECT position, key_name, key_value
      FROM event_keys
      ORDER BY position ASC
    `);

    if (result.length === 0) return [];

    return result[0].values.map((row: SqlValue[]) => ({
      position: row[0] as number,
      key_name: row[1] as string,
      key_value: row[2] as string
    }));
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    const db = await this.ensureInitialized();
    db.run('DELETE FROM event_keys');
    db.run('DELETE FROM events');
    db.run("DELETE FROM sqlite_sequence WHERE name IN ('events', 'event_keys')");
  }

  /**
   * Export database as Uint8Array for persistence
   */
  async export(): Promise<Uint8Array> {
    const db = await this.ensureInitialized();
    return db.export();
  }

  // --- Metadata Methods ---

  /**
   * Get stored config hash
   */
  async getConfigHash(): Promise<string | null> {
    const db = await this.ensureInitialized();
    const result = db.exec("SELECT value FROM metadata WHERE key = 'config_hash'");
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return result[0].values[0][0] as string;
  }

  /**
   * Set config hash
   */
  async setConfigHash(hash: string): Promise<void> {
    if (!hash) {
      console.warn('[SqlJsStorage] setConfigHash called with empty hash, skipping');
      return;
    }
    const db = await this.ensureInitialized();
    // sql.js ignores params - use escaped SQL
    const escapedHash = hash.replace(/'/g, "''");
    db.run(
      `INSERT OR REPLACE INTO metadata (key, value) VALUES ('config_hash', '${escapedHash}')`
    );
  }

  /**
   * Reindex all events with new keys
   */
  async reindex(extractKeys: (event: StoredEvent) => ExtractedKey[]): Promise<void> {
    const db = await this.ensureInitialized();
    const events = await this.getAllEvents();

    db.run('BEGIN TRANSACTION');

    try {
      // Clear all keys
      db.run('DELETE FROM event_keys');

      // Re-extract and insert keys for all events
      const escapeSql = (s: string): string => "'" + s.replace(/'/g, "''") + "'";
      for (const event of events) {
        const keys = extractKeys(event);
        for (const key of keys) {
          db.run(
            `INSERT INTO event_keys (position, key_name, key_value) VALUES (${Number(event.position)}, ${escapeSql(key.name)}, ${escapeSql(key.value)})`
          );
        }
      }

      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
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
