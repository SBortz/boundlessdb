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
 * Unconstrained condition: matches ALL events of the given type.
 */
export interface UnconstrainedCondition {
  type: string;
}

/**
 * Constrained condition: matches events of type with specific key-value.
 */
export interface ConstrainedCondition {
  type: string;
  key: string;
  value: string;
}

/**
 * Key-only condition: matches ALL events with specific key-value, regardless of type.
 * Useful for aggregate queries (e.g., "all events for course cs101").
 */
export interface KeyOnlyCondition {
  key: string;
  value: string;
}

/**
 * A single query condition:
 * - Unconstrained: `{ type }` - all events of type
 * - Constrained: `{ type, key, value }` - events of type with specific key
 * - Key-only: `{ key, value }` - all events with specific key, any type
 * 
 * @example
 * ```typescript
 * // Constrained: Match specific type + key-value
 * { type: 'ProductItemAdded', key: 'cart', value: 'cart-123' }
 * 
 * // Unconstrained: Match all events of type
 * { type: 'ProductItemAdded' }
 * 
 * // Key-only: Match all events with key, regardless of type
 * { key: 'cart', value: 'cart-123' }
 * ```
 */
export type QueryCondition = UnconstrainedCondition | ConstrainedCondition | KeyOnlyCondition;

/**
 * Type guard: check if condition is constrained (has type + key + value)
 */
export function isConstrainedCondition(c: QueryCondition): c is ConstrainedCondition {
  return 'type' in c && 'key' in c && 'value' in c;
}

/**
 * Type guard: check if condition is key-only (has key + value, no type)
 */
export function isKeyOnlyCondition(c: QueryCondition): c is KeyOnlyCondition {
  return !('type' in c) && 'key' in c && 'value' in c;
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
  readonly position: bigint;
  readonly conditions: QueryCondition[];

  constructor(
    events: StoredEvent<E>[],
    position: bigint,
    conditions: QueryCondition[]
  ) {
    this.events = events;
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

  /** Get the append condition for use with store.append() */
  get appendCondition(): AppendCondition {
    return { failIfEventsMatch: this.conditions, after: this.position };
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
 * Result of a successful append operation
 */
export interface AppendResult {
  conflict: false;
  position: bigint;
  appendCondition: AppendCondition;
}

/**
 * Result when a conflict is detected
 */
export interface ConflictResult<E extends Event = Event> {
  conflict: true;
  conflictingEvents: StoredEvent<E>[];
  appendCondition: AppendCondition;
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
// Append Condition (DCB Spec compliant)
// ============================================================

/**
 * Condition for optimistic concurrency check on append.
 * Pass to store.append() to ensure no conflicting events were written
 * since your read.
 * 
 * @see https://dcb.events/specification/#append-condition
 */
export interface AppendCondition {
  /** 
   * Query that defines what constitutes a conflict.
   * If any events match this query (after the specified position), append fails.
   */
  failIfEventsMatch: QueryCondition[];
  
  /** 
   * Position from which to check for conflicts (optional).
   * If omitted, ALL events are checked against failIfEventsMatch.
   */
  after?: bigint;
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
