/**
 * Tests for Storage implementations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryStorage } from '../src/storage/memory.js';
import { SqliteStorage } from '../src/storage/sqlite.js';
import type { EventStorage, EventToStore } from '../src/storage/interface.js';

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

    describe('append', () => {
      it('appends single event', async () => {
        const pos = await storage.append(
          [createTestEvent('e1', 'TestEvent', { value: 1 })],
          [[{ name: 'key', value: 'a' }]]
        );

        expect(pos).toBe(1n);
      });

      it('appends multiple events atomically', async () => {
        const pos = await storage.append(
          [
            createTestEvent('e1', 'TestEvent', { value: 1 }),
            createTestEvent('e2', 'TestEvent', { value: 2 }),
            createTestEvent('e3', 'TestEvent', { value: 3 }),
          ],
          [
            [{ name: 'key', value: 'a' }],
            [{ name: 'key', value: 'b' }],
            [{ name: 'key', value: 'c' }],
          ]
        );

        expect(pos).toBe(3n);
      });

      it('increments position correctly', async () => {
        await storage.append(
          [createTestEvent('e1', 'TestEvent', { value: 1 })],
          [[{ name: 'key', value: 'a' }]]
        );

        const pos = await storage.append(
          [createTestEvent('e2', 'TestEvent', { value: 2 })],
          [[{ name: 'key', value: 'b' }]]
        );

        expect(pos).toBe(2n);
      });

      it('throws if events and keys arrays have different lengths', async () => {
        await expect(
          storage.append(
            [createTestEvent('e1', 'TestEvent', { value: 1 })],
            [] // Empty keys array
          )
        ).rejects.toThrow();
      });
    });

    describe('query', () => {
      beforeEach(async () => {
        // Set up test data
        await storage.append(
          [
            createTestEvent('e1', 'TypeA', { value: 1 }),
            createTestEvent('e2', 'TypeB', { value: 2 }),
            createTestEvent('e3', 'TypeA', { value: 3 }),
            createTestEvent('e4', 'TypeA', { value: 4 }),
          ],
          [
            [{ name: 'category', value: 'x' }],
            [{ name: 'category', value: 'y' }],
            [{ name: 'category', value: 'x' }],
            [{ name: 'category', value: 'z' }],
          ]
        );
      });

      it('queries by type and key', async () => {
        const events = await storage.query([
          { type: 'TypeA', key: 'category', value: 'x' },
        ]);

        expect(events).toHaveLength(2);
        expect(events[0].data).toEqual({ value: 1 });
        expect(events[1].data).toEqual({ value: 3 });
      });

      it('queries with OR conditions', async () => {
        const events = await storage.query([
          { type: 'TypeA', key: 'category', value: 'x' },
          { type: 'TypeB', key: 'category', value: 'y' },
        ]);

        expect(events).toHaveLength(3);
      });

      it('respects fromPosition', async () => {
        const events = await storage.query(
          [{ type: 'TypeA', key: 'category', value: 'x' }],
          1n // Skip first event
        );

        expect(events).toHaveLength(1);
        expect(events[0].data).toEqual({ value: 3 });
      });

      it('respects limit', async () => {
        const events = await storage.query(
          [{ type: 'TypeA', key: 'category', value: 'x' }],
          undefined,
          1
        );

        expect(events).toHaveLength(1);
      });

      it('returns empty for no matches', async () => {
        const events = await storage.query([
          { type: 'TypeC', key: 'category', value: 'x' },
        ]);

        expect(events).toEqual([]);
      });

      it('returns empty for empty conditions', async () => {
        const events = await storage.query([]);
        expect(events).toEqual([]);
      });

      it('orders by position', async () => {
        const events = await storage.query([
          { type: 'TypeA', key: 'category', value: 'x' },
          { type: 'TypeA', key: 'category', value: 'z' },
        ]);

        expect(events[0].position).toBe(1n);
        expect(events[1].position).toBe(3n);
        expect(events[2].position).toBe(4n);
      });
    });

    describe('getEventsSince', () => {
      beforeEach(async () => {
        await storage.append(
          [
            createTestEvent('e1', 'TestEvent', { value: 1 }),
            createTestEvent('e2', 'TestEvent', { value: 2 }),
            createTestEvent('e3', 'TestEvent', { value: 3 }),
          ],
          [
            [{ name: 'key', value: 'a' }],
            [{ name: 'key', value: 'a' }],
            [{ name: 'key', value: 'a' }],
          ]
        );
      });

      it('returns events after position', async () => {
        const events = await storage.getEventsSince(
          [{ type: 'TestEvent', key: 'key', value: 'a' }],
          1n
        );

        expect(events).toHaveLength(2);
        expect(events[0].position).toBe(2n);
        expect(events[1].position).toBe(3n);
      });

      it('returns empty when no events since position', async () => {
        const events = await storage.getEventsSince(
          [{ type: 'TestEvent', key: 'key', value: 'a' }],
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
        await storage.append(
          [createTestEvent('e1', 'TestEvent', {})],
          [[]]
        );
        await storage.append(
          [createTestEvent('e2', 'TestEvent', {})],
          [[]]
        );

        const pos = await storage.getLatestPosition();
        expect(pos).toBe(2n);
      });
    });

    describe('multiple keys per event', () => {
      it('indexes all keys for an event', async () => {
        await storage.append(
          [createTestEvent('e1', 'MultiKey', { a: 1, b: 2 })],
          [[
            { name: 'keyA', value: 'x' },
            { name: 'keyB', value: 'y' },
          ]]
        );

        // Should find by either key
        const byA = await storage.query([
          { type: 'MultiKey', key: 'keyA', value: 'x' },
        ]);
        const byB = await storage.query([
          { type: 'MultiKey', key: 'keyB', value: 'y' },
        ]);

        expect(byA).toHaveLength(1);
        expect(byB).toHaveLength(1);
        expect(byA[0].id).toBe(byB[0].id);
      });
    });
  });
});
