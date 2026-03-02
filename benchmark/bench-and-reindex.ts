/**
 * Combined Benchmark + Reindex Script
 *
 * Runs the full workflow: benchmark → reindex → benchmark with different config.
 * Demonstrates how config changes affect the key index.
 *
 * Usage:
 *   npx tsx benchmark/bench-and-reindex.ts --events <size> --sqlite|--postgres
 *
 * Engine (pick one):
 *   --sqlite                 Use on-disk SQLite
 *   --postgres               Use PostgreSQL
 *
 * Options:
 *   --events <size>          Target event count (e.g. 10k, 1m, 50m). Required.
 *   --db <path>              SQLite database path (default: ./boundless-bench.sqlite)
 *   --connection <url>       PostgreSQL connection (default: localhost:5433)
 *
 * Examples:
 *   npx tsx benchmark/bench-and-reindex.ts --events 1m --sqlite
 *   npx tsx benchmark/bench-and-reindex.ts --events 1m --postgres
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const eventsArg = getArg('--events');
const useSqlite = args.includes('--sqlite');
const usePostgres = args.includes('--postgres');
const dbPath = getArg('--db') || getArg('-db') || './boundless-bench.sqlite';
const connectionUrl = getArg('--connection') || 'postgresql://postgres:bench@localhost:5433/bench';

if (!eventsArg || (!useSqlite && !usePostgres)) {
  console.error('Usage: npx tsx benchmark/bench-and-reindex.ts --events <size> --sqlite|--postgres [options]');
  console.error('');
  console.error('SQLite:     --sqlite --db <path>');
  console.error('PostgreSQL: --postgres --connection <url>');
  console.error('');
  console.error('Examples:');
  console.error('  npx tsx benchmark/bench-and-reindex.ts --events 1m --sqlite');
  console.error('  npx tsx benchmark/bench-and-reindex.ts --events 1m --postgres');
  process.exit(1);
}

const FULL_CONFIG = resolve('benchmark/consistency.config.ts');
const MINIMAL_CONFIG = resolve('benchmark/consistency.config.minimal.ts');
const BENCHMARK_SCRIPT = usePostgres
  ? resolve('benchmark/postgres-query.ts')
  : resolve('benchmark/sqlite-query.ts');
const REINDEX_SCRIPT = resolve('scripts/reindex.ts');

const engineLabel = usePostgres ? 'PostgreSQL' : 'SQLite';

function run(label: string, script: string, extraArgs: string[]) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    execFileSync('npx', ['tsx', script, ...extraArgs], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (error: any) {
    if (error.status) {
      console.error(`\n  ❌ Step failed with exit code ${error.status}`);
      process.exit(error.status);
    }
    throw error;
  }
}

function benchArgs(config: string): string[] {
  const a = ['--events', eventsArg!, '--config', config];
  if (usePostgres) {
    a.push('--connection', connectionUrl);
  } else {
    a.push('--db', dbPath, '--disk'); // always on-disk for reindex workflow
  }
  return a;
}

function reindexArgs(config: string): string[] {
  const a = ['--config', config];
  if (usePostgres) {
    a.push('--connection', connectionUrl);
  } else {
    a.push('--db', dbPath);
  }
  return a;
}

// --- Run the workflow ---

console.log(`\n  🔬 Benchmark + Reindex Workflow (${engineLabel})`);
console.log(`  Events: ${eventsArg}`);
if (usePostgres) {
  console.log(`  Connection: ${connectionUrl}`);
} else {
  console.log(`  DB: ${dbPath}`);
}
console.log(`  Full config: ${FULL_CONFIG}`);
console.log(`  Minimal config: ${MINIMAL_CONFIG}`);

// Step 1: Benchmark with full config
run(
  `1️⃣  Benchmark (${engineLabel}) — Full Config (course + student + lesson keys)`,
  BENCHMARK_SCRIPT,
  benchArgs(FULL_CONFIG)
);

// Step 2: Reindex to minimal config
run(
  '2️⃣  Reindex → Minimal Config (course key only)',
  REINDEX_SCRIPT,
  reindexArgs(MINIMAL_CONFIG)
);

// Step 3: Benchmark with minimal config
run(
  `3️⃣  Benchmark (${engineLabel}) — Minimal Config (course key only)`,
  BENCHMARK_SCRIPT,
  benchArgs(MINIMAL_CONFIG)
);

// Step 4: Reindex back to full config
run(
  '4️⃣  Reindex → Full Config (restore)',
  REINDEX_SCRIPT,
  reindexArgs(FULL_CONFIG)
);

// Step 5: Benchmark with full config again
run(
  `5️⃣  Benchmark (${engineLabel}) — Full Config (after reindex)`,
  BENCHMARK_SCRIPT,
  benchArgs(FULL_CONFIG)
);

console.log(`\n${'═'.repeat(70)}`);
console.log('  ✅ Workflow complete!');
console.log(`${'═'.repeat(70)}\n`);
