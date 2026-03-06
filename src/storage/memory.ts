/**
 * In-Memory Storage implementation (for testing)
 */

import {
    type ExtractedKey,
    hasKeys,
    isKeyOnlyCondition,
    isMultiTypeCondition,
    isMultiTypeConstrainedCondition,
    type MultiKeyConstrainedCondition,
    normalizeCondition,
    type QueryCondition,
    type StoredEvent,
} from '../types.js';
import type {AppendWithConditionResult, EventStorage, EventToStore, StorageAppendCondition,} from './interface.js';

interface StoredEventInternal extends StoredEvent {
    keys: ExtractedKey[];
}

/**
 * In-memory event storage for testing purposes
 * NOT suitable for production use
 */
export class InMemoryStorage implements EventStorage {
    private events: StoredEventInternal[] = [];
    private nextPosition: bigint = 1n;

    async appendWithCondition(
        eventsToStore: EventToStore[],
        keys: ExtractedKey[][],
        condition: StorageAppendCondition | null
    ): Promise<AppendWithConditionResult> {
        if (eventsToStore.length !== keys.length) {
            throw new Error('Events and keys arrays must have the same length');
        }

        if (eventsToStore.length === 0) {
            const position = await this.getLatestPosition();
            return {position};
        }

        // 1. Conflict check (if condition provided)
        if (condition !== null) {
            const conflictingEvents = await this.query(condition.failIfEventsMatch, condition.after);

            if (conflictingEvents.length > 0) {
                return {conflicting: conflictingEvents};
            }
        }

        // 2. Insert events
        let lastPosition: bigint = 0n;

        for (let i = 0; i < eventsToStore.length; i++) {
            const event = eventsToStore[i];
            const eventKeys = keys[i];
            const position = this.nextPosition++;

            this.events.push({
                id: event.id,
                type: event.type,
                data: event.data as Record<string, unknown>,
                metadata: event.metadata,
                timestamp: event.timestamp,
                position,
                keys: eventKeys,
            });

            lastPosition = position;
        }

        return {position: lastPosition};
    }

    async query(
        conditions: QueryCondition[],
        fromPosition?: bigint,
        limit?: number,
        backwards?: boolean
    ): Promise<StoredEvent[]> {
        const startPos = fromPosition ?? (backwards ? BigInt(Number.MAX_SAFE_INTEGER) : 0n);

        // Filter by position first
        let matching = backwards
            ? this.events.filter(event => event.position < startPos)
            : this.events.filter(event => event.position > startPos);

        // If no conditions, return all events
        if (conditions.length === 0) {
            matching.sort((a, b) => {
                if (backwards) return a.position > b.position ? -1 : 1;
                return a.position < b.position ? -1 : 1;
            });
            const limited = limit !== undefined ? matching.slice(0, limit) : matching;
            return limited.map(({keys: _keys, ...event}) => event);
        }

        // Normalize conditions to internal format
        const normalized = conditions.map(normalizeCondition);

        // Filter by conditions
        matching = matching.filter(event => {
            // Must match at least one condition (OR across conditions)
            return normalized.some(cond => {
                // Key-only condition: no type filter, just match keys
                if (isKeyOnlyCondition(cond)) {
                    return cond.keys.every(requiredKey =>
                        event.keys.some(
                            eventKey => eventKey.name === requiredKey.name && eventKey.value === requiredKey.value
                        )
                    );
                }

                // Multi-type conditions: type must be in types[]
                if (isMultiTypeConstrainedCondition(cond)) {
                    if (!cond.types.includes(event.type)) return false;
                    return cond.keys.every(requiredKey =>
                        event.keys.some(
                            eventKey => eventKey.name === requiredKey.name && eventKey.value === requiredKey.value
                        )
                    );
                }
                if (isMultiTypeCondition(cond)) {
                    return cond.types.includes(event.type);
                }

                // Type must match
                if (event.type !== (cond as { type: string }).type) {
                    return false;
                }

                // If unconstrained, type match is enough
                if (!hasKeys(cond)) {
                    return true;
                }

                // Constrained: ALL keys must match (AND within a condition)
                return (cond as MultiKeyConstrainedCondition).keys.every(requiredKey =>
                    event.keys.some(
                        eventKey => eventKey.name === requiredKey.name && eventKey.value === requiredKey.value
                    )
                );
            });
        });

        // Sort by position
        matching.sort((a, b) => {
            if (backwards) return a.position > b.position ? -1 : 1;
            return a.position < b.position ? -1 : 1;
        });

        // Apply limit
        const limited = limit !== undefined ? matching.slice(0, limit) : matching;

        // Strip internal keys
        return limited.map(({keys: _keys, ...event}) => event);
    }

    async getLatestPosition(): Promise<bigint> {
        if (this.events.length === 0) {
            return 0n;
        }
        return this.events[this.events.length - 1].position;
    }

    async close(): Promise<void> {
        // Nothing to do
    }

    /**
     * Get all events (internal/test use only)
     * Note: Kept as public for test convenience, but not part of public API contract
     */
    getAllEvents(): StoredEvent[] {
        return this.events.map(({keys: _keys, ...event}) => event);
    }

    /**
     * Clear all events (for testing)
     */
    clear(): void {
        this.events = [];
        this.nextPosition = 1n;
    }

    /**
     * Reindex all events with new keys (in-memory: just re-extract all keys in one go)
     * @deprecated Use reindexBatch() instead
     */
    reindex(extractKeys: (event: StoredEvent) => ExtractedKey[]): void {
        for (const internal of this.events) {
            const event: StoredEvent = {
                id: internal.id,
                type: internal.type,
                data: internal.data,
                metadata: internal.metadata,
                timestamp: internal.timestamp,
                position: internal.position,
            };
            internal.keys = extractKeys(event);
        }
    }

    /**
     * Batch-based reindex for in-memory storage.
     * Since everything is in memory, no batching needed — just re-extracts all keys.
     */
    reindexBatch(
        extractKeys: (event: StoredEvent) => ExtractedKey[],
        options?: {
            batchSize?: number;
            onProgress?: (done: number, total: number) => void;
        }
    ): { events: number; keys: number; durationMs: number } {
        const onProgress = options?.onProgress;
        const startTime = Date.now();
        let totalKeys = 0;

        for (let i = 0; i < this.events.length; i++) {
            const internal = this.events[i];
            const event: StoredEvent = {
                id: internal.id,
                type: internal.type,
                data: internal.data,
                metadata: internal.metadata,
                timestamp: internal.timestamp,
                position: internal.position,
            };
            const keys = extractKeys(event);
            internal.keys = keys;
            totalKeys += keys.length;

            if (onProgress) {
                onProgress(i + 1, this.events.length);
            }
        }

        return {events: this.events.length, keys: totalKeys, durationMs: Date.now() - startTime};
    }
}
