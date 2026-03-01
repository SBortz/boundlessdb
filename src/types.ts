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
 * Constrained condition (single key): matches events of type with specific key-value.
 * @deprecated Use MultiKeyConstrainedCondition with keys[] for new code.
 * Kept for backward compatibility — normalized internally to keys[].
 */
export interface ConstrainedCondition {
  type: string;
  key: string;
  value: string;
}

/**
 * Multi-key constrained condition: matches events of type with ALL specified keys (AND).
 * This is the internal representation used by storage engines.
 */
export interface MultiKeyConstrainedCondition {
  type: string;
  keys: { name: string; value: string }[];
}

/**
 * Multi-type unconstrained condition: matches ALL events of any of the given types.
 * Used by `.matchType('TypeA', 'TypeB')` with multiple types.
 */
export interface MultiTypeCondition {
  types: string[];
}

/**
 * Multi-type constrained condition: matches events of any of the given types with ALL specified keys (AND).
 */
export interface MultiTypeConstrainedCondition {
  types: string[];
  keys: { name: string; value: string }[];
}

/**
 * Key-only condition: matches events that have ALL specified keys, regardless of event type.
 * Used by `.matchKey(key, value)` when no type is specified.
 */
export interface KeyOnlyCondition {
  keys: { name: string; value: string }[];
}

/**
 * A single query condition:
 * - Unconstrained: `{ type }` - all events of type
 * - Constrained (legacy): `{ type, key, value }` - events of type with specific key
 * - Multi-key constrained: `{ type, keys: [...] }` - events of type with ALL specified keys (AND)
 * - Key-only: `{ keys: [...] }` - events with ALL specified keys, any type
 * 
 * @example
 * ```typescript
 * // Constrained: Match specific type + key-value (legacy)
 * { type: 'ProductItemAdded', key: 'cart', value: 'cart-123' }
 * 
 * // Multi-key AND: Match events with ALL keys
 * { type: 'StudentEnrolled', keys: [
 *   { name: 'course', value: 'cs101' },
 *   { name: 'student', value: 'alice' }
 * ]}
 * 
 * // Unconstrained: Match all events of type
 * { type: 'ProductItemAdded' }
 * 
 * // Key-only: Match events with keys, any type
 * { keys: [{ name: 'course', value: 'cs101' }] }
 * ```
 */
export type QueryCondition = UnconstrainedCondition | ConstrainedCondition | MultiKeyConstrainedCondition | MultiTypeCondition | MultiTypeConstrainedCondition | KeyOnlyCondition;

/**
 * Type guard: check if condition is constrained with single key (legacy format)
 */
export function isConstrainedCondition(c: QueryCondition): c is ConstrainedCondition {
  return 'type' in c && 'key' in c && 'value' in c;
}

/**
 * Type guard: check if condition is multi-key constrained
 */
export function isMultiKeyCondition(c: QueryCondition): c is MultiKeyConstrainedCondition {
  return 'type' in c && 'keys' in c && Array.isArray((c as MultiKeyConstrainedCondition).keys);
}

/**
 * Type guard: check if condition is multi-type (types[] without keys)
 */
export function isMultiTypeCondition(c: QueryCondition): c is MultiTypeCondition {
  return 'types' in c && !('keys' in c);
}

/**
 * Type guard: check if condition is multi-type constrained (types[] + keys[])
 */
export function isMultiTypeConstrainedCondition(c: QueryCondition): c is MultiTypeConstrainedCondition {
  return 'types' in c && 'keys' in c;
}

/**
 * Type guard: check if condition is key-only (no type/types field)
 */
export function isKeyOnlyCondition(c: QueryCondition): c is KeyOnlyCondition {
  return !('type' in c) && !('types' in c) && 'keys' in c && Array.isArray((c as KeyOnlyCondition).keys);
}

/**
 * Normalize a QueryCondition to the internal multi-key format.
 * - `{ type, key, value }` → `{ type, keys: [{ name: key, value }] }`
 * - `{ type, keys: [...] }` → pass through
 * - `{ type }` → pass through (unconstrained)
 * - `{ keys: [...] }` → pass through (key-only)
 */
export type NormalizedCondition = UnconstrainedCondition | MultiKeyConstrainedCondition | MultiTypeCondition | MultiTypeConstrainedCondition | KeyOnlyCondition;

export function normalizeCondition(c: QueryCondition): NormalizedCondition {
  if (isConstrainedCondition(c)) {
    return { type: c.type, keys: [{ name: c.key, value: c.value }] };
  }
  return c as NormalizedCondition;
}

/**
 * Check if a normalized condition has keys (is constrained)
 */
export function hasKeys(c: NormalizedCondition): c is MultiKeyConstrainedCondition | MultiTypeConstrainedCondition | KeyOnlyCondition {
  return 'keys' in c && Array.isArray((c as MultiKeyConstrainedCondition).keys) && (c as MultiKeyConstrainedCondition).keys.length > 0;
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

/**
 * Merge multiple AppendConditions into one.
 * 
 * Use when reading from multiple boundaries (e.g. cart + inventory)
 * and appending with a single condition that protects all of them.
 * 
 * - `failIfEventsMatch`: concatenated from all conditions
 * - `after`: maximum position across all conditions
 * 
 * @example
 * ```typescript
 * const cartResult = await store.query().matchKey('cart', cartId).read();
 * const inventoryResult = await store.query().matchType('InventoryChanged').read();
 * 
 * const merged = mergeConditions(
 *   cartResult.appendCondition,
 *   inventoryResult.appendCondition,
 * );
 * 
 * await store.append(allEvents, merged);
 * ```
 */
export function mergeConditions(...conditions: AppendCondition[]): AppendCondition {
  if (conditions.length === 0) {
    return { failIfEventsMatch: [] };
  }

  let maxPosition: bigint | undefined;
  for (const c of conditions) {
    if (c.after !== undefined) {
      if (maxPosition === undefined || c.after > maxPosition) {
        maxPosition = c.after;
      }
    }
  }

  return {
    failIfEventsMatch: conditions.flatMap(c => c.failIfEventsMatch),
    after: maxPosition,
  };
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
