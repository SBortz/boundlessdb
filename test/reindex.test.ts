/**
 * Tests for batch reindex and config mismatch behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventStore, SqliteStorage, InMemoryStorage } from '../src/index.js';
import { KeyExtractor } from '../src/config/extractor.js';
import type { ConsistencyConfig, ExtractedKey, StoredEvent } from '../src/types.js';

const CONFIG_A: ConsistencyConfig = {
  eventTypes: {
    TestEvent: {
      keys: [{ name: 'key', path: 'data.value' }],
    },
  },
};

const CONFIG_B: ConsistencyConfig = {
  eventTypes: {
    TestEvent: {
      keys: [
        { name: 'key', path: 'data.value' },
        { name: 'extra', path: 'data.extra' },
      ],
    },
  },
};

function makeExtractor(config: ConsistencyConfig) {
  const extractor = new KeyExtractor(config);
  return (event: StoredEvent): ExtractedKey[] =>
    extractor.extract({ type: event.type, data: event.data, metadata: event.metadata });
}

describe('reindexBatch', () => {
  describe('SqliteStorage', () => {
    let storage: SqliteStorage;

    beforeEach(() => {
      storage = new SqliteStorage(':memory:');
    });

    it('reindexes all events in batches', async () => {
      // Insert events using store with CONFIG_A
      const store = new EventStore({ storage, consistency: CONFIG_A });
      for (let i = 0; i < 25; i++) {
        await store.append(
          [{ type: 'TestEvent', data: { value: `v${i}`, extra: `e${i}` } }],
          null
        );
      }

      // Reindex with CONFIG_B's key extraction (adds 'extra' key)
      const result = storage.reindexBatch(makeExtractor(CONFIG_B), {
        batchSize: 10,
      });

      expect(result.events).toBe(25);
      // CONFIG_B extracts 2 keys per event
      expect(result.keys).toBe(50);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('calls onProgress after each batch', async () => {
      const store = new EventStore({ storage, consistency: CONFIG_A });
      for (let i = 0; i < 30; i++) {
        await store.append(
          [{ type: 'TestEvent', data: { value: `v${i}`, extra: `e${i}` } }],
          null
        );
      }

      const progressCalls: Array<[number, number]> = [];
      storage.reindexBatch(makeExtractor(CONFIG_B), {
        batchSize: 10,
        onProgress: (done, total) => {
          progressCalls.push([done, total]);
        },
      });

      // 30 events with batch size 10 = 3 batches
      expect(progressCalls).toHaveLength(3);
      expect(progressCalls[0]).toEqual([10, 30]);
      expect(progressCalls[1]).toEqual([20, 30]);
      expect(progressCalls[2]).toEqual([30, 30]);
    });

    it('handles empty store', () => {
      const result = storage.reindexBatch(makeExtractor(CONFIG_A));
      expect(result.events).toBe(0);
      expect(result.keys).toBe(0);
    });

    it('updates keys correctly (verifiable via query)', async () => {
      // Store events with CONFIG_A (only 'key' extracted)
      const store = new EventStore({ storage, consistency: CONFIG_A });
      await store.append(
        [{ type: 'TestEvent', data: { value: 'hello', extra: 'world' } }],
        null
      );

      // Query by 'extra' key should find nothing (not indexed with CONFIG_A)
      const beforeReindex = await storage.query([
        { type: 'TestEvent', key: 'extra', value: 'world' },
      ]);
      expect(beforeReindex).toHaveLength(0);

      // Reindex with CONFIG_B (adds 'extra' key)
      storage.reindexBatch(makeExtractor(CONFIG_B), { batchSize: 5 });

      // Now query by 'extra' key should find the event
      const afterReindex = await storage.query([
        { type: 'TestEvent', key: 'extra', value: 'world' },
      ]);
      expect(afterReindex).toHaveLength(1);
      expect(afterReindex[0].data).toEqual({ value: 'hello', extra: 'world' });
    });

    it('resumes from crash (reindex_position)', async () => {
      const store = new EventStore({ storage, consistency: CONFIG_A });
      for (let i = 0; i < 20; i++) {
        await store.append(
          [{ type: 'TestEvent', data: { value: `v${i}`, extra: `e${i}` } }],
          null
        );
      }

      // Simulate a crash after processing position 10:
      // Set reindex_position to 10 (meaning first 10 events were processed)
      storage.setReindexPosition(10);

      // Delete keys for positions > 10 to simulate incomplete reindex
      // (events 1-10 have new keys, 11-20 have old keys)

      const progressCalls: Array<[number, number]> = [];
      const result = storage.reindexBatch(makeExtractor(CONFIG_B), {
        batchSize: 5,
        onProgress: (done, total) => {
          progressCalls.push([done, total]);
        },
      });

      // Should resume from position 10, processing only events 11-20
      // First progress call should show we already have 10 done
      expect(progressCalls[0][0]).toBe(15); // 10 already done + 5 new batch
      expect(result.events).toBe(20); // Total processed including resumed
      expect(result.keys).toBe(20); // Only the resumed events' keys (10 events * 2 keys)

      // reindex_position should be cleaned up
      expect(storage.getReindexPosition()).toBeNull();
    });

    it('cleans up reindex_position on completion', async () => {
      const store = new EventStore({ storage, consistency: CONFIG_A });
      await store.append(
        [{ type: 'TestEvent', data: { value: 'v1', extra: 'e1' } }],
        null
      );

      storage.reindexBatch(makeExtractor(CONFIG_B), { batchSize: 5 });
      expect(storage.getReindexPosition()).toBeNull();
    });
  });

  describe('InMemoryStorage', () => {
    let storage: InMemoryStorage;

    beforeEach(() => {
      storage = new InMemoryStorage();
    });

    it('reindexes all events', async () => {
      // Insert events with simple append (via EventStore)
      const store = new EventStore({ storage, consistency: CONFIG_A });
      for (let i = 0; i < 10; i++) {
        await store.append(
          [{ type: 'TestEvent', data: { value: `v${i}`, extra: `e${i}` } }],
          null
        );
      }

      const result = storage.reindexBatch(makeExtractor(CONFIG_B));

      expect(result.events).toBe(10);
      expect(result.keys).toBe(20); // 2 keys per event with CONFIG_B
    });

    it('calls onProgress', async () => {
      const store = new EventStore({ storage, consistency: CONFIG_A });
      for (let i = 0; i < 5; i++) {
        await store.append(
          [{ type: 'TestEvent', data: { value: `v${i}`, extra: `e${i}` } }],
          null
        );
      }

      const progressCalls: Array<[number, number]> = [];
      storage.reindexBatch(makeExtractor(CONFIG_B), {
        onProgress: (done, total) => {
          progressCalls.push([done, total]);
        },
      });

      // Called once per event
      expect(progressCalls).toHaveLength(5);
      expect(progressCalls[4]).toEqual([5, 5]);
    });

    it('handles empty store', () => {
      const result = storage.reindexBatch(makeExtractor(CONFIG_A));
      expect(result.events).toBe(0);
      expect(result.keys).toBe(0);
    });
  });
});

describe('EventStore throws on config hash mismatch', () => {
  it('throws when SqliteStorage has different config hash', async () => {
    const storage = new SqliteStorage(':memory:');

    // Create store with CONFIG_A (stores hash)
    const store1 = new EventStore({ storage, consistency: CONFIG_A });
    await store1.append(
      [{ type: 'TestEvent', data: { value: 'test' } }],
      null
    );

    // Try to create store with CONFIG_B (different hash) — should throw
    expect(() => {
      new EventStore({ storage, consistency: CONFIG_B });
    }).toThrow('Config hash mismatch');
  });

  it('does not throw on first run (no stored hash)', () => {
    const storage = new SqliteStorage(':memory:');
    expect(() => {
      new EventStore({ storage, consistency: CONFIG_A });
    }).not.toThrow();
  });

  it('does not throw when config matches stored hash', () => {
    const storage = new SqliteStorage(':memory:');

    // Create store, store hash
    new EventStore({ storage, consistency: CONFIG_A });

    // Create again with same config — should not throw
    expect(() => {
      new EventStore({ storage, consistency: CONFIG_A });
    }).not.toThrow();
  });

  it('works after explicit reindexBatch + hash update', async () => {
    const storage = new SqliteStorage(':memory:');

    // Create store with CONFIG_A
    const store1 = new EventStore({ storage, consistency: CONFIG_A });
    await store1.append(
      [{ type: 'TestEvent', data: { value: 'test', extra: 'data' } }],
      null
    );

    // Manually reindex with CONFIG_B
    storage.reindexBatch(makeExtractor(CONFIG_B));

    // Compute and store new hash
    const { createHash } = await import('node:crypto');
    function sortObjectKeys(obj: unknown): unknown {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sortObjectKeys);
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    const newHash = createHash('sha256')
      .update(JSON.stringify(sortObjectKeys(CONFIG_B)))
      .digest('hex');
    storage.setConfigHash(newHash);

    // Now creating store with CONFIG_B should work
    expect(() => {
      new EventStore({ storage, consistency: CONFIG_B });
    }).not.toThrow();
  });
});
