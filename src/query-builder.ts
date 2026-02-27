/**
 * Fluent Query Builder for BoundlessDB
 */

import type { Event, QueryCondition, QueryResult, MultiKeyConstrainedCondition } from './types.js';

export interface QueryExecutor<E extends Event> {
  read(query: { 
    conditions: QueryCondition[]; 
    fromPosition?: bigint; 
    limit?: number; 
  }): Promise<QueryResult<E>>;
}

/**
 * Fluent API for building queries.
 * 
 * @example
 * ```typescript
 * // Single-key query (backward compatible):
 * const result = await store.query<CourseEvent>()
 *   .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
 *   .read();
 * 
 * // Multi-key AND query:
 * const result = await store.query<CourseEvent>()
 *   .matchType('StudentSubscribed')
 *   .withKey('course', 'cs101')
 *   .withKey('student', 'alice')
 *   .read();
 * 
 * // Mixed (AND + OR):
 * const result = await store.query<CourseEvent>()
 *   .matchType('StudentSubscribed')
 *   .withKey('course', 'cs101')
 *   .withKey('student', 'alice')              // AND on condition 0
 *   .matchTypeAndKey('CourseCancelled', 'course', 'cs101')  // OR (condition 1)
 *   .read();
 * ```
 */
export class QueryBuilder<E extends Event> {
  private conditions: QueryCondition[] = [];
  private _fromPosition?: bigint;
  private _limit?: number;

  constructor(private readonly executor: QueryExecutor<E>) {}

  /**
   * Add an unconstrained condition (match all events of type).
   * Use `.withKey()` after to add key constraints (AND).
   * 
   * @example
   * ```typescript
   * .matchType('CourseCreated')  // matches ALL CourseCreated events
   * .matchType('StudentSubscribed').withKey('course', 'cs101')  // type + key
   * ```
   */
  matchType(type: string): this {
    this.conditions.push({ type });
    return this;
  }

  /**
   * Add a constrained condition (match events of type where key equals value).
   * Shorthand for `.matchType(type).withKey(key, value)`.
   * Use `.withKey()` after to add more key constraints (AND).
   * 
   * @example
   * ```typescript
   * .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
   * .matchTypeAndKey('StudentSubscribed', 'course', 'cs101').withKey('student', 'alice')
   * ```
   */
  matchTypeAndKey(type: string, key: string, value: string): this {
    this.conditions.push({ type, keys: [{ name: key, value }] } as MultiKeyConstrainedCondition);
    return this;
  }

  /**
   * Add a key constraint to the last condition (AND).
   * Must be called after `.matchType()` or `.matchTypeAndKey()`.
   * 
   * @throws Error if no preceding condition exists
   * 
   * @example
   * ```typescript
   * .matchType('StudentSubscribed')
   *   .withKey('course', 'cs101')
   *   .withKey('student', 'alice')  // AND: both keys must match
   * ```
   */
  withKey(key: string, value: string): this {
    if (this.conditions.length === 0) {
      throw new Error('.withKey() requires a preceding .matchType() or .matchTypeAndKey()');
    }

    const lastIdx = this.conditions.length - 1;
    const last = this.conditions[lastIdx];

    // Convert the last condition to multi-key format if needed
    if ('keys' in last && Array.isArray((last as MultiKeyConstrainedCondition).keys)) {
      // Already multi-key format — add to it
      (last as MultiKeyConstrainedCondition).keys.push({ name: key, value });
    } else if ('key' in last && 'value' in last) {
      // Legacy single-key format — convert to multi-key
      const legacy = last as { type: string; key: string; value: string };
      this.conditions[lastIdx] = {
        type: legacy.type,
        keys: [{ name: legacy.key, value: legacy.value }, { name: key, value }],
      } as MultiKeyConstrainedCondition;
    } else {
      // Unconstrained (type only) — convert to multi-key
      this.conditions[lastIdx] = {
        type: last.type,
        keys: [{ name: key, value }],
      } as MultiKeyConstrainedCondition;
    }

    return this;
  }

  /**
   * Start reading from a specific position.
   * 
   * @example
   * ```typescript
   * .fromPosition(100n)  // skip events before position 100
   * ```
   */
  fromPosition(position: bigint): this {
    this._fromPosition = position;
    return this;
  }

  /**
   * Limit the number of events returned.
   * 
   * @example
   * ```typescript
   * .limit(50)  // return at most 50 events
   * ```
   */
  limit(count: number): this {
    this._limit = count;
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
    });
  }
}
