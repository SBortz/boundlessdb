/**
 * Core types for the DCB Event Store
 */

// ============================================================
// Events
// ============================================================

/**
 * Event as submitted by the client (before storage)
 */
export interface NewEvent<T = unknown> {
  type: string;
  data: T;
  metadata?: Record<string, unknown>;
}

/**
 * Event as returned by the store (after storage)
 */
export interface StoredEvent<T = unknown> {
  id: string;
  type: string;
  data: T;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  position: bigint;
}

// ============================================================
// Query
// ============================================================

/**
 * A single query condition: event type + key-value match
 */
export interface QueryCondition {
  type: string;
  key: string;
  value: string;
}

/**
 * Query to read events from the store
 */
export interface Query {
  conditions: QueryCondition[];
  fromPosition?: bigint;
  limit?: number;
}

// ============================================================
// Consistency Config
// ============================================================

/**
 * Definition of a consistency key extraction rule
 */
export interface ConsistencyKeyDef {
  /** Key name (e.g., "course") */
  name: string;
  /** Path in event payload (e.g., "data.courseId") */
  path: string;
  /** Optional transformation */
  transform?: 'LOWER' | 'UPPER' | 'MONTH' | 'YEAR' | 'DATE';
  /** Behavior when path resolves to null/undefined */
  nullHandling?: 'error' | 'skip' | 'default';
  /** Default value when nullHandling = 'default' */
  defaultValue?: string;
}

/**
 * Configuration for a single event type
 */
export interface EventTypeConfig {
  keys: ConsistencyKeyDef[];
}

/**
 * Full consistency configuration
 */
export interface ConsistencyConfig {
  eventTypes: Record<string, EventTypeConfig>;
}

// ============================================================
// Extracted Keys
// ============================================================

/**
 * A key extracted from an event via ConsistencyConfig
 */
export interface ExtractedKey {
  name: string;
  value: string;
}

// ============================================================
// Results
// ============================================================

/**
 * Result of a successful read operation
 */
export interface ReadResult {
  events: StoredEvent[];
  token: ConsistencyToken;
}

/**
 * Result of a successful append operation
 */
export interface AppendResult {
  conflict: false;
  position: bigint;
  token: ConsistencyToken;
}

/**
 * Result when a conflict is detected
 */
export interface ConflictResult {
  conflict: true;
  conflictingEvents: StoredEvent[];
  newToken: ConsistencyToken;
}

/**
 * Type guard for conflict detection
 */
export function isConflict(result: AppendResult | ConflictResult): result is ConflictResult {
  return result.conflict;
}

// ============================================================
// Token
// ============================================================

/**
 * Opaque consistency token (Base64URL encoded)
 */
export type ConsistencyToken = string;

/**
 * Internal token payload structure
 */
export interface TokenPayload {
  v: 1;
  pos: bigint;
  ts: number;
  q: QueryCondition[];
}

/**
 * JSON-serializable token payload (bigint as string)
 */
export interface TokenPayloadJSON {
  v: 1;
  pos: string;
  ts: number;
  q: QueryCondition[];
}

// ============================================================
// Event Store Options
// ============================================================

export interface EventStoreOptions {
  /** Token signing secret (required) */
  secret: string;
  /** Consistency configuration */
  consistency: ConsistencyConfig;
}
