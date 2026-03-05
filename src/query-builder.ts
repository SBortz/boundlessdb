/**
 * Fluent Query Builder for BoundlessDB
 */

import type { Event, QueryCondition, QueryResult, MultiKeyConstrainedCondition, MultiTypeCondition, KeyOnlyCondition } from './types.js';

export interface QueryExecutor<E extends Event> {
  read(query: { 
    conditions: QueryCondition[]; 
    fromPosition?: bigint; 
    limit?: number;
    backwards?: boolean;
  }): Promise<QueryResult<E>>;
}

/**
 * Fluent API for building queries.
 *
 * Each top-level call adds one QueryItem (OR between items).
 * Keys within a single call are AND-combined.
 *
 * @example
 * ```typescript
 * // Key-only query
 * .matchKeys({ course: 'cs101' })
 *
 * // Key-only AND query
 * .matchKeys({ course: 'cs101', student: 'alice' })
 *
 * // Type-only query
 * .matchType('CourseCreated')
 *
 * // Multiple types (OR within item)
 * .matchType('CourseCreated', 'CourseCancelled')
 *
 * // Type + keys (AND within item)
 * .matchTypeAndKeys('StudentSubscribed', { course: 'cs101' })
 *
 * // OR between items
 * .matchTypeAndKeys('StudentSubscribed', { course: 'cs101' })
 * .matchKeys({ student: 'alice' })
 * ```
 */
export class QueryBuilder<E extends Event> {
  private conditions: QueryCondition[] = [];
  private _fromPosition?: bigint;
  private _limit?: number;
  private _backwards = false;

  constructor(private readonly executor: QueryExecutor<E>) {}

  /**
   * Match events by key(s). All keys must match (AND).
   * Starts a new query item (OR with previous items).
   *
   * @example
   * ```typescript
   * .matchKeys({ course: 'cs101' })
   * .matchKeys({ course: 'cs101', student: 'alice' })  // AND
   * ```
   */
  matchKeys(keys: Record<string, string>): this {
    const entries = Object.entries(keys);
    if (entries.length === 0) {
      throw new Error('.matchKeys() requires at least one key');
    }
    this.conditions.push({
      keys: entries.map(([name, value]) => ({ name, value })),
    } as KeyOnlyCondition);
    return this;
  }

  /**
   * Match events of one or more types (OR within item).
   * Starts a new query item (OR with previous items).
   *
   * @example
   * ```typescript
   * .matchType('CourseCreated')
   * .matchType('CourseCreated', 'CourseCancelled')
   * ```
   */
  matchType(...types: string[]): this {
    if (types.length === 0) {
      throw new Error('.matchType() requires at least one type');
    }
    if (types.length === 1) {
      this.conditions.push({ type: types[0] });
    } else {
      this.conditions.push({ types } as MultiTypeCondition);
    }
    return this;
  }

  /**
   * Match events of a given type where all keys match (AND).
   * Starts a new query item (OR with previous items).
   *
   * @example
   * ```typescript
   * .matchTypeAndKeys('StudentSubscribed', { course: 'cs101' })
   * .matchTypeAndKeys('StudentSubscribed', { course: 'cs101', student: 'alice' })
   * .matchTypeAndKeys(['CourseCreated', 'CourseCancelled'], { course: 'cs101' })
   * ```
   */
  matchTypeAndKeys(type: string | string[], keys: Record<string, string>): this {
    const entries = Object.entries(keys);
    if (entries.length === 0) {
      throw new Error('.matchTypeAndKeys() requires at least one key');
    }
    const keyList = entries.map(([name, value]) => ({ name, value }));
    const types = Array.isArray(type) ? type : [type];
    if (types.length === 0) {
      throw new Error('.matchTypeAndKeys() requires at least one type');
    }
    if (types.length === 1) {
      this.conditions.push({ type: types[0], keys: keyList } as MultiKeyConstrainedCondition);
    } else {
      this.conditions.push({ types, keys: keyList } as unknown as MultiKeyConstrainedCondition);
    }
    return this;
  }

  /**
   * Shorthand for `.matchTypeAndKeys(type, { key: value })`.
   * @deprecated Use `.matchTypeAndKeys(type, { key: value })` instead.
   */
  matchTypeAndKey(type: string, key: string, value: string): this {
    return this.matchTypeAndKeys(type, { [key]: value });
  }

  /**
   * Start reading from a specific position.
   */
  fromPosition(position: bigint): this {
    this._fromPosition = position;
    return this;
  }

  /**
   * Limit the number of events returned.
   */
  limit(count: number): this {
    this._limit = count;
    return this;
  }

  /**
   * Read events in reverse order (newest first).
   *
   * @example
   * ```typescript
   * await store.all().backwards().limit(100).read();
   * ```
   */
  backwards(): this {
    this._backwards = true;
    return this;
  }

  /**
   * Execute the query and return results.
   */
  async read(): Promise<QueryResult<E>> {
    return this.executor.read({
      conditions: this.conditions,
      fromPosition: this._fromPosition,
      limit: this._limit,
      backwards: this._backwards || undefined,
    });
  }
}
