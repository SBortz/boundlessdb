/**
 * Fluent Query Builder for BoundlessDB
 */

import type {Event, KeyOnlyCondition, MultiKeyConstrainedCondition, MultiTypeCondition, QueryCondition, QueryResult,} from './types.js';

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
 *   .andKey('course', 'cs101')
 *   .andKey('student', 'alice')
 *   .read();
 *
 * // Mixed (AND + OR):
 * const result = await store.query<CourseEvent>()
 *   .matchType('StudentSubscribed')
 *   .andKey('course', 'cs101')
 *   .andKey('student', 'alice')              // AND on condition 0
 *   .matchTypeAndKey('CourseCancelled', 'course', 'cs101')  // OR (condition 1)
 *   .read();
 * ```
 */
export class QueryBuilder<E extends Event> {
    private conditions: QueryCondition[] = [];
    private _fromPosition?: bigint;
    private _limit?: number;
    private _backwards = false;

    constructor(private readonly executor: QueryExecutor<E>) {
    }

    /**
     * Add an unconstrained condition (match events of one or more types).
     * Use `.andKey()` after to add key constraints (AND).
     *
     * @example
     * ```typescript
     * .matchType('CourseCreated')  // single type
     * .matchType('CourseCreated', 'CourseCancelled')  // multiple types (OR within)
     * .matchType('StudentSubscribed').andKey('course', 'cs101')  // type + key
     * ```
     */
    matchType(...types: string[]): this {
        if (types.length === 0) {
            throw new Error('.matchType() requires at least one type');
        }
        if (types.length === 1) {
            this.conditions.push({type: types[0]});
        } else {
            this.conditions.push({types} as MultiTypeCondition);
        }
        return this;
    }

    /**
     * Add a constrained condition (match events of type where key equals value).
     * Shorthand for `.matchType(type).andKey(key, value)`.
     * Use `.andKey()` after to add more key constraints (AND).
     *
     * @example
     * ```typescript
     * .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
     * .matchTypeAndKey('StudentSubscribed', 'course', 'cs101').andKey('student', 'alice')
     * ```
     */
    matchTypeAndKey(type: string, key: string, value: string): this {
        this.conditions.push({type, keys: [{name: key, value}]} as MultiKeyConstrainedCondition);
        return this;
    }

    /**
     * Key-only query: match events by key, regardless of event type.
     * Starts a new condition (OR with previous conditions).
     * Use `.andKey()` after to add more key constraints (AND).
     *
     * @example
     * ```typescript
     * .matchKey('cart', 'abc-123')  // all events with cart=abc-123
     * .matchKey('course', 'cs101').andKey('student', 'alice')  // AND
     * ```
     */
    matchKey(key: string, value: string): this {
        this.conditions.push({keys: [{name: key, value}]} as KeyOnlyCondition);
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
     *   .andKey('course', 'cs101')
     *   .andKey('student', 'alice')  // AND: both keys must match
     * ```
     */
    andKey(key: string, value: string): this {
        if (this.conditions.length === 0) {
            throw new Error(
                '.andKey() requires a preceding .matchType(), .matchTypeAndKey(), or .matchKey()'
            );
        }

        const lastIdx = this.conditions.length - 1;
        const last = this.conditions[lastIdx];

        // Convert the last condition to multi-key format if needed
        if ('keys' in last && Array.isArray((last as MultiKeyConstrainedCondition).keys)) {
            // Already multi-key format — add to it
            (last as MultiKeyConstrainedCondition).keys.push({name: key, value});
        } else if ('key' in last && 'value' in last) {
            // Legacy single-key format — convert to multi-key
            const legacy = last as { type: string; key: string; value: string };
            this.conditions[lastIdx] = {
                type: legacy.type,
                keys: [
                    {name: legacy.key, value: legacy.value},
                    {name: key, value},
                ],
            } as MultiKeyConstrainedCondition;
        } else if ('types' in last) {
            // Multi-type unconstrained — convert to multi-type constrained
            this.conditions[lastIdx] = {
                types: (last as MultiTypeCondition).types,
                keys: [{name: key, value}],
            };
        } else {
            // Unconstrained (type only) — convert to multi-key
            this.conditions[lastIdx] = {
                type: (last as { type: string }).type,
                keys: [{name: key, value}],
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
     * Read events in reverse order (newest first).
     * Useful with `.limit()` to get the last N events.
     *
     * @example
     * ```typescript
     * // Last 100 events
     * const result = await store.all().backwards().limit(100).read();
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
