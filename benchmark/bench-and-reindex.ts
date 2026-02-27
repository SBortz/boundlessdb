/**
 * Combined Benchmark + Reindex Script
 *
 * Runs the full workflow: benchmark → reindex → benchmark with different config.
 * Demonstrates how config changes affect the key index.
 *
 * Usage:
 *   npx tsx benchmark/bench-and-reindex.ts --events 1m [options]
 *
 * Options:
 *   --events <size>    Target event count (e.g. 10k, 1m, 50m). Required.
 *   --disk             Use on-disk SQLite (default: in-memory)
 *   --shuffle          Randomize query order
 *   --db <path>        SQLite database path (default: ./boundless-bench.sqlite)
 *
 * What it does:
 *   1. Benchmark with full config (course + student + lesson keys)
 *   2. Reindex to minimal config (course key only)
 *   3. Benchmark with minimal config
 *   4. Reindex back to full config
 *   5. Benchmark with full config again
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
const useDisk = args.includes('--disk');
const useShuffle = args.includes('--shuffle');
const dbPath = getArg('--db') || './boundless-bench.sqlite';

if (!eventsArg) {
  console.error('Usage: npx tsx benchmark/bench-and-reindex.ts --events <size> [options]');
  console.error('Options: --disk --shuffle --db <path>');
  console.error('Example: npx tsx benchmark/bench-and-reindex.ts --events 1m --disk --shuffle');
  process.exit(1);
}

const FULL_CONFIG = resolve('benchmark/consistency.config.ts');
const MINIMAL_CONFIG = resolve('benchmark/consistency.config.minimal.ts');
const BENCHMARK_SCRIPT = resolve('benchmark/sqlite-query.ts');
const REINDEX_SCRIPT = resolve('scripts/reindex.ts');

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
  const a = ['--events', eventsArg!, '--config', config, '--db', dbPath];
  if (useDisk) a.push('--disk');
  if (useShuffle) a.push('--shuffle');
  return a;
}

// --- Run the workflow ---

console.log('\n  🔬 Benchmark + Reindex Workflow');
console.log(`  Events: ${eventsArg} | Disk: ${useDisk} | Shuffle: ${useShuffle}`);
console.log(`  DB: ${dbPath}`);
console.log(`  Full config: ${FULL_CONFIG}`);
console.log(`  Minimal config: ${MINIMAL_CONFIG}`);

// Step 1: Benchmark with full config
run(
  '1️⃣  Benchmark — Full Config (course + student + lesson keys)',
  BENCHMARK_SCRIPT,
  benchArgs(FULL_CONFIG)
);

// Step 2: Reindex to minimal config
run(
  '2️⃣  Reindex → Minimal Config (course key only)',
  REINDEX_SCRIPT,
  ['--config', MINIMAL_CONFIG, '--db', dbPath]
);

// Step 3: Benchmark with minimal config
run(
  '3️⃣  Benchmark — Minimal Config (course key only)',
  BENCHMARK_SCRIPT,
  benchArgs(MINIMAL_CONFIG)
);

// Step 4: Reindex back to full config
run(
  '4️⃣  Reindex → Full Config (restore)',
  REINDEX_SCRIPT,
  ['--config', FULL_CONFIG, '--db', dbPath]
);

// Step 5: Benchmark with full config again
run(
  '5️⃣  Benchmark — Full Config (after reindex)',
  BENCHMARK_SCRIPT,
  benchArgs(FULL_CONFIG)
);

console.log(`\n${'═'.repeat(70)}`);
console.log('  ✅ Workflow complete!');
console.log(`${'═'.repeat(70)}\n`);
