/**
 * Tests for Storage implementations
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {InMemoryStorage} from '../src/storage/memory.js';
import {SqliteStorage} from '../src/storage/sqlite.js';
import type {EventStorage, EventToStore} from '../src/storage/interface.js';

const createTestEvent = (
    id: string,
    type: string,
    data: unknown
): EventToStore => ({
    id,
    type,
    data,
    timestamp: new Date('2026-02-20T10:00:00Z'),
});

describe('Storage', () => {
    describe.each([
        ['InMemoryStorage', () => new InMemoryStorage()],
        ['SqliteStorage', () => new SqliteStorage(':memory:')],
    ])('%s', (_name, createStorage) => {
        let storage: EventStorage;

        beforeEach(() => {
            storage = createStorage();
        });

        afterEach(async () => {
            await storage.close();
        });

        describe('appendWithCondition', () => {
            it('appends single event', async () => {
                const result = await storage.appendWithCondition(
                    [createTestEvent('e1', 'TestEvent', {value: 1})],
                    [[{name: 'key', value: 'a'}]],
                    null
                );

                expect(result.position).toBe(1n);
                expect(result.conflicting).toBeUndefined();
            });

            it('appends multiple events atomically', async () => {
                const result = await storage.appendWithCondition(
                    [
                        createTestEvent('e1', 'TestEvent', {value: 1}),
                        createTestEvent('e2', 'TestEvent', {value: 2}),
                        createTestEvent('e3', 'TestEvent', {value: 3}),
                    ],
                    [
                        [{name: 'key', value: 'a'}],
                        [{name: 'key', value: 'b'}],
                        [{name: 'key', value: 'c'}],
                    ],
                    null
                );

                expect(result.position).toBe(3n);
                expect(result.conflicting).toBeUndefined();
            });

            it('increments position correctly', async () => {
                await storage.appendWithCondition(
                    [createTestEvent('e1', 'TestEvent', {value: 1})],
                    [[{name: 'key', value: 'a'}]],
                    null
                );

                const result = await storage.appendWithCondition(
                    [createTestEvent('e2', 'TestEvent', {value: 2})],
                    [[{name: 'key', value: 'b'}]],
                    null
                );

                expect(result.position).toBe(2n);
            });

            it('throws if events and keys arrays have different lengths', async () => {
                await expect(
                    storage.appendWithCondition(
                        [createTestEvent('e1', 'TestEvent', {value: 1})],
                        [], // Empty keys array
                        null
                    )
                ).rejects.toThrow();
            });

            it('detects conflicts', async () => {
                // First append
                await storage.appendWithCondition(
                    [createTestEvent('e1', 'TestEvent', {value: 1})],
                    [[{name: 'key', value: 'a'}]],
                    null
                );

                // Second append with condition that should conflict
                const result = await storage.appendWithCondition(
                    [createTestEvent('e2', 'TestEvent', {value: 2})],
                    [[{name: 'key', value: 'a'}]],
                    {
                        failIfEventsMatch: [{type: 'TestEvent', key: 'key', value: 'a'}],
                        after: 0n,
                    }
                );

                expect(result.position).toBeUndefined();
                expect(result.conflicting).toBeDefined();
                expect(result.conflicting).toHaveLength(1);
            });

            it('succeeds when no conflict', async () => {
                // First append
                await storage.appendWithCondition(
                    [createTestEvent('e1', 'TestEvent', {value: 1})],
                    [[{name: 'key', value: 'a'}]],
                    null
                );

                // Second append with condition after first event (no conflict)
                const result = await storage.appendWithCondition(
                    [createTestEvent('e2', 'TestEvent', {value: 2})],
                    [[{name: 'key', value: 'a'}]],
                    {
                        failIfEventsMatch: [{type: 'TestEvent', key: 'key', value: 'a'}],
                        after: 1n,
                    }
                );

                expect(result.position).toBe(2n);
                expect(result.conflicting).toBeUndefined();
            });
        });

        describe('query', () => {
            beforeEach(async () => {
                // Set up test data
                await storage.appendWithCondition(
                    [
                        createTestEvent('e1', 'TypeA', {value: 1}),
                        createTestEvent('e2', 'TypeB', {value: 2}),
                        createTestEvent('e3', 'TypeA', {value: 3}),
                        createTestEvent('e4', 'TypeA', {value: 4}),
                    ],
                    [
                        [{name: 'category', value: 'x'}],
                        [{name: 'category', value: 'y'}],
                        [{name: 'category', value: 'x'}],
                        [{name: 'category', value: 'z'}],
                    ],
                    null
                );
            });

            it('queries by type and key', async () => {
                const events = await storage.query([
                    {type: 'TypeA', key: 'category', value: 'x'},
                ]);

                expect(events).toHaveLength(2);
                expect(events[0].data).toEqual({value: 1});
                expect(events[1].data).toEqual({value: 3});
            });

            it('queries with OR conditions', async () => {
                const events = await storage.query([
                    {type: 'TypeA', key: 'category', value: 'x'},
                    {type: 'TypeB', key: 'category', value: 'y'},
                ]);

                expect(events).toHaveLength(3);
            });

            it('respects fromPosition', async () => {
                const events = await storage.query(
                    [{type: 'TypeA', key: 'category', value: 'x'}],
                    1n // Skip first event
                );

                expect(events).toHaveLength(1);
                expect(events[0].data).toEqual({value: 3});
            });

            it('respects limit', async () => {
                const events = await storage.query(
                    [{type: 'TypeA', key: 'category', value: 'x'}],
                    undefined,
                    1
                );

                expect(events).toHaveLength(1);
            });

            it('returns empty for no matches', async () => {
                const events = await storage.query([
                    {type: 'TypeC', key: 'category', value: 'x'},
                ]);

                expect(events).toEqual([]);
            });

            it('returns all events for empty conditions', async () => {
                const events = await storage.query([]);
                // Empty conditions = return all events (useful for admin/debug)
                expect(events.length).toBe(4);
                expect(events.map(e => e.type)).toEqual(['TypeA', 'TypeB', 'TypeA', 'TypeA']);
            });

            it('orders by position', async () => {
                const events = await storage.query([
                    {type: 'TypeA', key: 'category', value: 'x'},
                    {type: 'TypeA', key: 'category', value: 'z'},
                ]);

                expect(events[0].position).toBe(1n);
                expect(events[1].position).toBe(3n);
                expect(events[2].position).toBe(4n);
            });

            it('supports unconstrained query (type only, no key/value)', async () => {
                // Query all events of TypeA without specifying key/value
                const events = await storage.query([
                    {type: 'TypeA'},  // No key/value = match all TypeA
                ]);

                expect(events.length).toBe(3);
                expect(events.every(e => e.type === 'TypeA')).toBe(true);
            });

            it('supports mixed constrained and unconstrained conditions', async () => {
                // Query: all TypeA OR TypeB with category=y
                const events = await storage.query([
                    {type: 'TypeA'},  // Unconstrained: all TypeA
                    {type: 'TypeB', key: 'category', value: 'y'},  // Constrained
                ]);

                // Should get: 3x TypeA + 1x TypeB (category=y)
                expect(events.length).toBe(4);
                expect(events.filter(e => e.type === 'TypeA').length).toBe(3);
                expect(events.filter(e => e.type === 'TypeB').length).toBe(1);
            });
        });

        describe('query (position filter)', () => {
            beforeEach(async () => {
                await storage.appendWithCondition(
                    [
                        createTestEvent('e1', 'TestEvent', {value: 1}),
                        createTestEvent('e2', 'TestEvent', {value: 2}),
                        createTestEvent('e3', 'TestEvent', {value: 3}),
                    ],
                    [
                        [{name: 'key', value: 'a'}],
                        [{name: 'key', value: 'a'}],
                        [{name: 'key', value: 'a'}],
                    ],
                    null
                );
            });

            it('returns events after position', async () => {
                const events = await storage.query(
                    [{type: 'TestEvent', key: 'key', value: 'a'}],
                    1n
                );

                expect(events).toHaveLength(2);
                expect(events[0].position).toBe(2n);
                expect(events[1].position).toBe(3n);
            });

            it('returns empty when no events since position', async () => {
                const events = await storage.query(
                    [{type: 'TestEvent', key: 'key', value: 'a'}],
                    3n
                );

                expect(events).toEqual([]);
            });
        });

        describe('getLatestPosition', () => {
            it('returns 0 for empty store', async () => {
                const pos = await storage.getLatestPosition();
                expect(pos).toBe(0n);
            });

            it('returns latest position after appends', async () => {
                await storage.appendWithCondition(
                    [createTestEvent('e1', 'TestEvent', {})],
                    [[]],
                    null
                );
                await storage.appendWithCondition(
                    [createTestEvent('e2', 'TestEvent', {})],
                    [[]],
                    null
                );

                const pos = await storage.getLatestPosition();
                expect(pos).toBe(2n);
            });
        });

        describe('multiple keys per event', () => {
            it('indexes all keys for an event', async () => {
                await storage.appendWithCondition(
                    [createTestEvent('e1', 'MultiKey', {a: 1, b: 2})],
                    [[
                        {name: 'keyA', value: 'x'},
                        {name: 'keyB', value: 'y'},
                    ]],
                    null
                );

                // Should find by either key
                const byA = await storage.query([
                    {type: 'MultiKey', key: 'keyA', value: 'x'},
                ]);
                const byB = await storage.query([
                    {type: 'MultiKey', key: 'keyB', value: 'y'},
                ]);

                expect(byA).toHaveLength(1);
                expect(byB).toHaveLength(1);
                expect(byA[0].id).toBe(byB[0].id);
            });
        });
    });
});
