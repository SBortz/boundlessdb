/**
 * Fluent Query Builder for BoundlessDB
 */

import type { Event, QueryCondition, QueryResult } from './types.js';

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
 * const result = await store.query<CourseEvent>()
 *   .matchType('CourseCreated')
 *   .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
 *   .fromPosition(100n)
 *   .limit(50)
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
   * 
   * @example
   * ```typescript
   * .matchType('CourseCreated')  // matches ALL CourseCreated events
   * ```
   */
  matchType(type: string): this {
    this.conditions.push({ type });
    return this;
  }

  /**
   * Add a constrained condition (match events of type where key equals value).
   * 
   * @example
   * ```typescript
   * .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
   * ```
   */
  matchTypeAndKey(type: string, key: string, value: string): this {
    this.conditions.push({ type, key, value });
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
