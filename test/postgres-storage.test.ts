/**
 * Tests for PostgreSQL Storage implementation
 * 
 * These tests require a running PostgreSQL instance.
 * Set POSTGRES_URL environment variable to run them.
 * 
 * Example:
 *   POSTGRES_URL=postgresql://localhost/boundless_test npm test -- postgres-storage
 * 
 * Or use Docker:
 *   docker run --name boundless-pg -e POSTGRES_PASSWORD=test -p 5432:5432 -d postgres
 *   POSTGRES_URL=postgresql://postgres:test@localhost/postgres npm test -- postgres-storage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PostgresStorage } from '../src/storage/postgres.js';
import type { EventToStore } from '../src/storage/interface.js';

const POSTGRES_URL = process.env.POSTGRES_URL;

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

describe.skipIf(!POSTGRES_URL)('PostgresStorage', () => {
  let storage: PostgresStorage;

  beforeAll(async () => {
    storage = new PostgresStorage(POSTGRES_URL!);
    await storage.init();
  });

  beforeEach(async () => {
    await storage.clear();
  });

  afterAll(async () => {
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

    it('stores metadata correctly', async () => {
      await storage.append(
        [{ ...createTestEvent('e1', 'TestEvent', { value: 1 }), metadata: { userId: 'alice' } }],
        [[{ name: 'key', value: 'a' }]]
      );

      const events = await storage.getAllEvents();
      expect(events[0].metadata).toEqual({ userId: 'alice' });
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

  describe('metadata methods', () => {
    it('stores and retrieves config hash', async () => {
      await storage.setConfigHash('abc123');
      const hash = await storage.getConfigHash();
      expect(hash).toBe('abc123');
    });

    it('returns null for missing config hash', async () => {
      const hash = await storage.getConfigHash();
      expect(hash).toBeNull();
    });

    it('updates existing config hash', async () => {
      await storage.setConfigHash('abc123');
      await storage.setConfigHash('xyz789');
      const hash = await storage.getConfigHash();
      expect(hash).toBe('xyz789');
    });
  });

  describe('reindex', () => {
    it('reindexes all events with new keys', async () => {
      // Add events with original keys
      await storage.append(
        [
          createTestEvent('e1', 'TestEvent', { newKey: 'value1' }),
          createTestEvent('e2', 'TestEvent', { newKey: 'value2' }),
        ],
        [
          [{ name: 'oldKey', value: 'old1' }],
          [{ name: 'oldKey', value: 'old2' }],
        ]
      );

      // Reindex with new key extractor
      await storage.reindex((event) => [
        { name: 'newKey', value: (event.data as { newKey: string }).newKey },
      ]);

      // Old keys should not work
      const oldResults = await storage.query([
        { type: 'TestEvent', key: 'oldKey', value: 'old1' },
      ]);
      expect(oldResults).toHaveLength(0);

      // New keys should work
      const newResults = await storage.query([
        { type: 'TestEvent', key: 'newKey', value: 'value1' },
      ]);
      expect(newResults).toHaveLength(1);
      expect(newResults[0].id).toBe('e1');
    });
  });

  describe('getAllEvents', () => {
    it('returns all events in order', async () => {
      await storage.append(
        [
          createTestEvent('e1', 'TypeA', { value: 1 }),
          createTestEvent('e2', 'TypeB', { value: 2 }),
        ],
        [
          [{ name: 'key', value: 'a' }],
          [{ name: 'key', value: 'b' }],
        ]
      );

      const events = await storage.getAllEvents();
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('e1');
      expect(events[1].id).toBe('e2');
    });
  });

  describe('getAllKeys', () => {
    it('returns all keys in order', async () => {
      await storage.append(
        [createTestEvent('e1', 'TestEvent', {})],
        [[
          { name: 'keyA', value: 'x' },
          { name: 'keyB', value: 'y' },
        ]]
      );

      const keys = await storage.getAllKeys();
      expect(keys).toHaveLength(2);
      expect(keys.map(k => k.key_name).sort()).toEqual(['keyA', 'keyB']);
    });
  });

  describe('clear', () => {
    it('removes all data', async () => {
      await storage.append(
        [createTestEvent('e1', 'TestEvent', {})],
        [[{ name: 'key', value: 'a' }]]
      );

      await storage.clear();

      const events = await storage.getAllEvents();
      const keys = await storage.getAllKeys();
      const pos = await storage.getLatestPosition();

      expect(events).toEqual([]);
      expect(keys).toEqual([]);
      expect(pos).toBe(0n);
    });

    it('resets position sequence', async () => {
      await storage.append(
        [createTestEvent('e1', 'TestEvent', {})],
        [[]]
      );
      await storage.clear();

      const pos = await storage.append(
        [createTestEvent('e2', 'TestEvent', {})],
        [[]]
      );

      expect(pos).toBe(1n);
    });
  });

  describe('initialization', () => {
    it('throws if not initialized', async () => {
      const uninitStorage = new PostgresStorage(POSTGRES_URL!);
      
      await expect(
        uninitStorage.append([createTestEvent('e1', 'Test', {})], [[]])
      ).rejects.toThrow('not initialized');

      await uninitStorage.close();
    });

    it('can be initialized multiple times safely', async () => {
      const newStorage = new PostgresStorage(POSTGRES_URL!);
      await newStorage.init();
      await newStorage.init(); // Should not throw
      await newStorage.close();
    });
  });
});
