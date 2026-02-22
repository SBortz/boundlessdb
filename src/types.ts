/**
 * Core types for the DCB Event Store
 */

// ============================================================
// Events
// ============================================================

/**
 * Base Event type - marker interface for domain events.
 * 
 * @example
 * ```typescript
 * type ProductItemAdded = Event<'ProductItemAdded', {
 *   cartId: string;
 *   productId: string;
 *   quantity: number;
 * }>;
 * 
 * type CartEvents = ProductItemAdded | ProductItemRemoved;
 * ```
 */
export type Event<
  EventType extends string = string,
  EventPayload extends Record<string, unknown> = Record<string, unknown>
> = Readonly<{
  type: EventType;
  data: EventPayload;
}>;

/**
 * Event with optional metadata (for append operations)
 */
export type EventWithMetadata<E extends Event = Event> = E & {
  metadata?: Record<string, unknown>;
};

/**
 * Event as returned by the store (after storage)
 */
export type StoredEvent<E extends Event = Event> = E & Readonly<{
  id: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  position: bigint;
}>;

// ============================================================
// Query
// ============================================================

/**
 * A single query condition: event type + optional key-value match.
 * 
 * If key/value are omitted, matches all events of the given type.
 * 
 * @example
 * ```typescript
 * // Match specific key-value
 * { type: 'ProductItemAdded', key: 'cart', value: 'cart-123' }
 * 
 * // Match all events of type (unconstrained)
 * { type: 'ProductItemAdded' }
 * ```
 */
export interface QueryCondition {
  type: string;
  key?: string;
  value?: string;
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
// Query Result
// ============================================================

/**
 * Result of a read operation - provides typed access to events and metadata.
 */
export class QueryResult<E extends Event = Event> {
  readonly events: StoredEvent<E>[];
  readonly token: ConsistencyToken;
  readonly position: bigint;
  readonly conditions: QueryCondition[];

  constructor(
    events: StoredEvent<E>[],
    token: ConsistencyToken,
    position: bigint,
    conditions: QueryCondition[]
  ) {
    this.events = events;
    this.token = token;
    this.position = position;
    this.conditions = conditions;
  }

  /** Number of events in the result */
  get count(): number {
    return this.events.length;
  }

  /** Whether the result contains no events */
  isEmpty(): boolean {
    return this.events.length === 0;
  }

  /** Get the first event, or undefined if empty */
  first(): StoredEvent<E> | undefined {
    return this.events[0];
  }

  /** Get the last event, or undefined if empty */
  last(): StoredEvent<E> | undefined {
    return this.events[this.events.length - 1];
  }
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
 * Result of a successful read operation (legacy - use QueryResult instead)
 * @deprecated Use QueryResult<E> for typed results
 */
export interface ReadResult<E extends Event = Event> {
  events: StoredEvent<E>[];
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
export interface ConflictResult<E extends Event = Event> {
  conflict: true;
  conflictingEvents: StoredEvent<E>[];
  newToken: ConsistencyToken;
}

/**
 * Type guard for conflict detection
 */
export function isConflict<E extends Event = Event>(
  result: AppendResult | ConflictResult<E>
): result is ConflictResult<E> {
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
 * Append condition - can be passed directly to append() instead of token
 */
export interface AppendCondition {
  /** Position from which to check for conflicts */
  position: bigint;
  /** Conditions that define what constitutes a conflict */
  conditions: QueryCondition[];
}

/**
 * Internal token payload structure
 */
export interface TokenPayload {
  pos: bigint;
  q: QueryCondition[];
}

/**
 * JSON-serializable token payload (bigint as string)
 */
export interface TokenPayloadJSON {
  pos: string;
  q: QueryCondition[];
}

// ============================================================
// Event Store Options
// ============================================================

export interface EventStoreOptions {
  /** Consistency configuration */
  consistency: ConsistencyConfig;
}

// ============================================================
// Legacy Aliases (for backwards compatibility)
// ============================================================

/**
 * @deprecated Use Event<EventType, EventPayload> instead
 */
export type NewEvent<T = unknown> = {
  type: string;
  data: T;
  metadata?: Record<string, unknown>;
};
