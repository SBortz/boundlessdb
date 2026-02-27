/**
 * BoundlessDB Reindex Script
 *
 * Production-safe batch-based reindex for SQLite and PostgreSQL.
 * Processes events in configurable batches with crash recovery.
 *
 * Usage:
 *   npx tsx scripts/reindex.ts --db ./events.sqlite
 *   npx tsx scripts/reindex.ts --connection postgresql://user:pass@localhost/db
 *
 * Options:
 *   --db <path>              SQLite database path
 *   --connection <url>       PostgreSQL connection string
 *   --batch-size <n>         Events per batch (default: 10000)
 */

import { createHash } from 'node:crypto';
import type { ConsistencyConfig, ExtractedKey, StoredEvent } from '../src/types.js';
import { KeyExtractor } from '../src/config/extractor.js';
import { SqliteStorage } from '../src/storage/sqlite.js';

// --- Consistency config (same as benchmark) ---

const CONSISTENCY_CONFIG: ConsistencyConfig = {
  eventTypes: {
    CourseCreated: {
      keys: [{ path: 'data.courseId', name: 'course' }],
    },
    StudentEnrolled: {
      keys: [
        { path: 'data.courseId', name: 'course' },
        { path: 'data.studentId', name: 'student' },
      ],
    },
    LessonCompleted: {
      keys: [
        { path: 'data.courseId', name: 'course' },
        { path: 'data.studentId', name: 'student' },
        { path: 'data.lessonId', name: 'lesson' },
      ],
    },
    CertificateIssued: {
      keys: [
        { path: 'data.courseId', name: 'course' },
        { path: 'data.studentId', name: 'student' },
      ],
    },
  },
};

// --- Helpers ---

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function hashConfig(config: ConsistencyConfig): string {
  const normalized = JSON.stringify(sortObjectKeys(config));
  return createHash('sha256').update(normalized).digest('hex');
}

function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function progressBar(pct: number, width = 30): string {
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return `[${'\u2588'.repeat(filled)}${'\u2591'.repeat(empty)}]`;
}

// --- CLI args ---

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const dbPath = getArg('--db');
const connectionString = getArg('--connection');
const batchSize = Number(getArg('--batch-size') || '10000');

if (!dbPath && !connectionString) {
  console.error('Usage:');
  console.error('  npx tsx scripts/reindex.ts --db ./events.sqlite');
  console.error('  npx tsx scripts/reindex.ts --connection postgresql://user:pass@localhost/db');
  process.exit(1);
}

if (dbPath && connectionString) {
  console.error('Error: Specify either --db or --connection, not both.');
  process.exit(1);
}

// --- Main ---

async function main() {
  const backendName = dbPath ? 'SQLite' : 'PostgreSQL';
  console.log(`\n  \uD83D\uDD04 Reindex (${backendName})`);

  const currentHash = hashConfig(CONSISTENCY_CONFIG);
  const keyExtractor = new KeyExtractor(CONSISTENCY_CONFIG);

  const extractKeys = (event: StoredEvent): ExtractedKey[] => {
    return keyExtractor.extract({
      type: event.type,
      data: event.data,
      metadata: event.metadata,
    });
  };

  if (dbPath) {
    // --- SQLite ---
    const storage = new SqliteStorage(dbPath);

    try {
      const storedHash = storage.getConfigHash();

      if (storedHash === currentHash) {
        console.log(`  Config hash: ${currentHash.substring(0, 16)}... (unchanged)`);
        console.log('  \u2705 No reindex needed.\n');
        await storage.close();
        process.exit(0);
      }

      console.log(`  Config hash: ${(storedHash || '(none)').substring(0, 16)}... \u2192 ${currentHash.substring(0, 16)}...`);

      let keysPerSec = 0;
      let lastKeysTotal = 0;
      let lastProgressTime = performance.now();

      const result = storage.reindexBatch(extractKeys, {
        batchSize,
        onProgress: (done, total) => {
          const now = performance.now();
          const elapsed = now - lastProgressTime;
          if (elapsed > 200 || done === total) {
            const pct = done / total;
            // Estimate keys/s from overall result so far
            process.stdout.write(
              `\r  ${progressBar(pct)} ${(pct * 100).toFixed(0)}%  ` +
              `${formatNum(done)} / ${formatNum(total)}  ` +
              `batch size: ${formatNum(batchSize)}   `
            );
            lastProgressTime = now;
          }
        },
      });

      process.stdout.write('\r' + ' '.repeat(100) + '\r');

      // Update config hash
      storage.setConfigHash(currentHash);

      console.log(`  \u2705 Reindex complete: ${formatNum(result.events)} events, ${formatNum(result.keys)} keys (${formatMs(result.durationMs)})`);
      console.log(`  New config hash stored: ${currentHash.substring(0, 16)}...\n`);

      await storage.close();
    } catch (error) {
      await storage.close();
      throw error;
    }
  } else if (connectionString) {
    // --- PostgreSQL ---
    const { PostgresStorage } = await import('../src/storage/postgres.js');
    const storage = new PostgresStorage(connectionString);
    await storage.init();

    try {
      const storedHash = await storage.getConfigHash();

      if (storedHash === currentHash) {
        console.log(`  Config hash: ${currentHash.substring(0, 16)}... (unchanged)`);
        console.log('  \u2705 No reindex needed.\n');
        await storage.close();
        process.exit(0);
      }

      console.log(`  Config hash: ${(storedHash || '(none)').substring(0, 16)}... \u2192 ${currentHash.substring(0, 16)}...`);

      const result = await storage.reindexBatch(extractKeys, {
        batchSize,
        onProgress: (done, total) => {
          const pct = done / total;
          process.stdout.write(
            `\r  ${progressBar(pct)} ${(pct * 100).toFixed(0)}%  ` +
            `${formatNum(done)} / ${formatNum(total)}  ` +
            `batch size: ${formatNum(batchSize)}   `
          );
        },
      });

      process.stdout.write('\r' + ' '.repeat(100) + '\r');

      // Update config hash
      await storage.setConfigHash(currentHash);

      console.log(`  \u2705 Reindex complete: ${formatNum(result.events)} events, ${formatNum(result.keys)} keys (${formatMs(result.durationMs)})`);
      console.log(`  New config hash stored: ${currentHash.substring(0, 16)}...\n`);

      await storage.close();
    } catch (error) {
      await storage.close();
      throw error;
    }
  }
}

main().catch((error) => {
  console.error('\n  \u274C Reindex failed:', error.message || error);
  process.exit(1);
});
