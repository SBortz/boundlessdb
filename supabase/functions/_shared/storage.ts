/**
 * Deno-compatible PostgreSQL Storage for BoundlessDB
 * 
 * Uses the postgres (porsager) library which works well in Deno/Edge Functions.
 * Implements the same schema as BoundlessDB's PostgresStorage.
 */

import postgres from "npm:postgres@3.4.5";
import type { 
  QueryCondition, 
  StoredEvent, 
  NewEvent, 
  ExtractedKey,
  KeyConfig 
} from "./types.ts";
import { consistencyConfig, getEventConfig, isKnownEventType } from "./config.ts";

export type Sql = ReturnType<typeof postgres>;

/**
 * Create a new database connection
 * Call sql.end() when done!
 */
export function createConnection(): Sql {
  const connectionString = Deno.env.get("SUPABASE_DB_URL");
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL not configured");
  }

  return postgres(connectionString, {
    prepare: false,  // Required for Supabase's transaction pool mode
    idle_timeout: 0, // Don't hold idle connections
  });
}

/**
 * Extract keys from an event based on config
 */
export function extractKeys(event: NewEvent): ExtractedKey[] {
  const config = getEventConfig(event.type);
  if (!config) {
    return [];
  }

  const keys: ExtractedKey[] = [];

  for (const keyConfig of config.keys) {
    const value = getValueByPath(event, keyConfig.path);
    
    if (value === null || value === undefined) {
      if (keyConfig.nullHandling === "error") {
        throw new Error(`Missing required key: ${keyConfig.name} at path ${keyConfig.path}`);
      }
      if (keyConfig.nullHandling === "skip") {
        continue;
      }
      if (keyConfig.nullHandling === "default" && keyConfig.defaultValue) {
        keys.push({ name: keyConfig.name, value: keyConfig.defaultValue });
        continue;
      }
      // Default: skip
      continue;
    }

    let transformedValue = String(value);
    
    if (keyConfig.transform) {
      transformedValue = applyTransform(transformedValue, keyConfig.transform);
    }

    keys.push({ name: keyConfig.name, value: transformedValue });
  }

  return keys;
}

/**
 * Get value from nested object by dot-notation path
 */
function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Apply transform to extracted value
 */
function applyTransform(value: string, transform: KeyConfig["transform"]): string {
  switch (transform) {
    case "LOWER":
      return value.toLowerCase();
    case "UPPER":
      return value.toUpperCase();
    case "MONTH":
      // Extract YYYY-MM from ISO date
      return value.substring(0, 7);
    case "YEAR":
      // Extract YYYY from ISO date
      return value.substring(0, 4);
    case "DATE":
      // Extract YYYY-MM-DD from ISO date
      return value.substring(0, 10);
    default:
      return value;
  }
}

/**
 * Query events by conditions
 */
export async function queryEvents(
  sql: Sql,
  conditions: QueryCondition[],
  fromPosition?: bigint,
  limit?: number
): Promise<StoredEvent[]> {
  if (conditions.length === 0) {
    return [];
  }

  // Build dynamic query with conditions
  // We need to use raw SQL because postgres.js doesn't support dynamic OR clauses well
  const whereParts: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  for (const condition of conditions) {
    whereParts.push(
      `(e.event_type = $${paramIdx} AND k.key_name = $${paramIdx + 1} AND k.key_value = $${paramIdx + 2})`
    );
    params.push(condition.type, condition.key, condition.value);
    paramIdx += 3;
  }

  let query = `
    SELECT DISTINCT ON (e.position)
      e.position,
      e.event_id,
      e.event_type,
      e.data,
      e.metadata,
      e.timestamp
    FROM events e
    JOIN event_keys k ON e.position = k.position
    WHERE (${whereParts.join(" OR ")})
  `;

  if (fromPosition !== undefined) {
    query += ` AND e.position > $${paramIdx}`;
    params.push(Number(fromPosition));
    paramIdx++;
  }

  query += " ORDER BY e.position";

  if (limit !== undefined) {
    query += ` LIMIT $${paramIdx}`;
    params.push(limit);
  }

  const result = await sql.unsafe(query, params);

  return result.map((row) => ({
    id: row.event_id as string,
    type: row.event_type as string,
    data: row.data,
    metadata: row.metadata as Record<string, unknown> | undefined,
    timestamp: new Date(row.timestamp as string),
    position: BigInt(row.position as string),
  }));
}

/**
 * Append events with their extracted keys
 */
export async function appendEvents(
  sql: Sql,
  events: NewEvent[]
): Promise<bigint> {
  if (events.length === 0) {
    return await getLatestPosition(sql);
  }

  // Validate all event types are known
  for (const event of events) {
    if (!isKnownEventType(event.type)) {
      throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  let lastPosition: bigint = 0n;

  // Use a transaction for atomicity
  await sql.begin(async (tx) => {
    for (const event of events) {
      const eventId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const keys = extractKeys(event);

      // Insert event
      const result = await tx`
        INSERT INTO events (event_id, event_type, data, metadata, timestamp)
        VALUES (
          ${eventId},
          ${event.type},
          ${sql.json(event.data)},
          ${event.metadata ? sql.json(event.metadata) : null},
          ${timestamp}
        )
        RETURNING position
      `;

      const position = BigInt(result[0].position);
      lastPosition = position;

      // Insert keys
      for (const key of keys) {
        await tx`
          INSERT INTO event_keys (position, key_name, key_value)
          VALUES (${Number(position)}, ${key.name}, ${key.value})
        `;
      }
    }
  });

  return lastPosition;
}

/**
 * Get events since a position (for conflict detection)
 */
export async function getEventsSince(
  sql: Sql,
  conditions: QueryCondition[],
  sincePosition: bigint
): Promise<StoredEvent[]> {
  return queryEvents(sql, conditions, sincePosition);
}

/**
 * Get the latest event position
 */
export async function getLatestPosition(sql: Sql): Promise<bigint> {
  const result = await sql`SELECT MAX(position) as pos FROM events`;
  return result[0].pos ? BigInt(result[0].pos) : 0n;
}

/**
 * Get all events (for admin/debug)
 */
export async function getAllEvents(
  sql: Sql,
  limit = 100,
  offset = 0
): Promise<{ events: StoredEvent[]; total: number }> {
  const [events, countResult] = await Promise.all([
    sql`
      SELECT position, event_id, event_type, data, metadata, timestamp
      FROM events
      ORDER BY position DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    sql`SELECT COUNT(*) as count FROM events`,
  ]);

  return {
    events: events.map((row) => ({
      id: row.event_id as string,
      type: row.event_type as string,
      data: row.data,
      metadata: row.metadata as Record<string, unknown> | undefined,
      timestamp: new Date(row.timestamp as string),
      position: BigInt(row.position as string),
    })),
    total: Number(countResult[0].count),
  };
}

/**
 * Check database connection
 */
export async function checkConnection(sql: Sql): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
