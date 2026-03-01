/**
 * PostgreSQL Throughput Benchmark
 *
 * Usage:
 *   npx tsx benchmark/postgres-query.ts --events <size> [options]
 *
 * Options:
 *   --events <size>          Target event count (e.g. 10k, 1m, 50m). Required.
 *   --sequential             Disable shuffle (default: shuffled)
 *   --connection <url>       PostgreSQL connection string (default: env DATABASE_URL or localhost:5433)
 *   --config <path>          Consistency config file (default: ./benchmark/consistency.config.ts)
 *   --writers <n>            Number of concurrent writers (default: 10)
 *   --writer-events <n>      Events per concurrent writer (default: 5)
 *   --rounds <n>             Number of conflict benchmark rounds (default: 50)
 *
 * Examples:
 *   npx tsx benchmark/postgres-query.ts --events 1m
 *   npx tsx benchmark/postgres-query.ts --events 50m --config ./my-config.ts
 */

import { EventStore } from '../src/event-store.js';
import { PostgresStorage } from '../src/storage/postgres.js';
import { Pool } from 'pg';
import type { Event, ConsistencyConfig } from '../src/types.js';
import defaultConsistency from './consistency.config.js';

type CourseCreated = Event<'CourseCreated', { courseId: string; title: string }>;
type StudentEnrolled = Event<'StudentEnrolled', { courseId: string; studentId: string }>;
type LessonCompleted = Event<'LessonCompleted', { courseId: string; studentId: string; lessonId: string }>;
type CertificateIssued = Event<'CertificateIssued', { courseId: string; studentId: string }>;
type BenchmarkEvent = CourseCreated | StudentEnrolled | LessonCompleted | CertificateIssued;

const ITERATIONS = 20;
const STUDENTS = 167;
const LESSONS = 10;
const EVENTS_PER_COURSE = 1 + STUDENTS * (1 + LESSONS + 1); // 2005

// --- CLI args ---

const args = process.argv.slice(2);
const useShuffle = !args.includes('--sequential');

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const customConnection = getArg('--connection');
const configPath = getArg('--config');
const eventsArg = getArg('--events');
const DB_URL = customConnection || process.env.DATABASE_URL || 'postgresql://postgres:bench@localhost:5433/bench';

// Backward compat: also accept positional args
const positionalArgs = args.filter((a, i) => {
  if (a.startsWith('--')) return false;
  const prev = args[i - 1];
  if (prev === '--connection' || prev === '--config' || prev === '--events') return false;
  return true;
});
const sizeArgs = eventsArg ? [eventsArg] : positionalArgs;

function parseSize(s: string): number {
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/i);
  if (!m) { console.error(`Invalid size: ${s}`); process.exit(1); }
  const num = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k') return Math.round(num * 1_000);
  if (unit === 'm') return Math.round(num * 1_000_000);
  return Math.round(num);
}

function formatLabel(target: number): string {
  if (target >= 1_000_000) return `~${(target / 1_000_000).toFixed(0)}M`;
  if (target >= 1_000) return `~${(target / 1_000).toFixed(0)}k`;
  return `~${target}`;
}

function buildDataset(target: number) {
  const courses = Math.max(1, Math.round(target / EVENTS_PER_COURSE));
  return { courses, students: STUDENTS, lessons: LESSONS, label: formatLabel(target) };
}

if (sizeArgs.length === 0) {
  console.error('Usage: npx tsx benchmark/postgres-query.ts --events <size> [options]');
  console.error('Options: --sequential --connection <url> --config <path> --writers <n> --writer-events <n>');
  console.error('Example: npx tsx benchmark/postgres-query.ts --events 1m --writers 20 --writer-events 10');
  process.exit(1);
}
const sizes = sizeArgs.map(parseSize);

const datasets = sizes.map(buildDataset);

// Load consistency config (dynamic import if custom path, otherwise default)
let consistency: ConsistencyConfig = defaultConsistency;
if (configPath) {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const mod = await import(pathToFileURL(resolve(configPath)).href);
  consistency = mod.default || mod.consistency || mod.config;
  console.log(`  Config: ${configPath}`);
}

const STORE_CONFIG = { consistency };

// --- Progress helpers ---

function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function progressBar(pct: number, width = 30): string {
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

// --- Generation with live progress ---

async function generateEvents(
  store: EventStore,
  numCourses: number,
  studentsPerCourse: number,
  lessonsPerStudent: number,
  label: string,
  startCourse: number = 0,
): Promise<number> {
  const eventsPerCourse = 1 + studentsPerCourse * (1 + lessonsPerStudent + 1);
  const coursesToGenerate = numCourses - startCourse;
  const totalExpected = coursesToGenerate * eventsPerCourse;
  let totalEvents = 0;
  const genStart = performance.now();
  let lastUpdate = genStart;

  for (let c = startCourse; c < numCourses; c++) {
    const courseId = `course-${c}`;

    await store.append([
      { type: 'CourseCreated', data: { courseId, title: `Course ${c}` } },
    ], null);
    totalEvents++;

    for (let s = 0; s < studentsPerCourse; s++) {
      const studentId = `student-${c}-${s}`;
      const events: BenchmarkEvent[] = [
        { type: 'StudentEnrolled', data: { courseId, studentId } },
      ];
      for (let l = 0; l < lessonsPerStudent; l++) {
        events.push({
          type: 'LessonCompleted',
          data: { courseId, studentId, lessonId: `lesson-${l}` },
        });
      }
      events.push({ type: 'CertificateIssued', data: { courseId, studentId } });
      await store.append(events, null);
      totalEvents += events.length;
    }

    const now = performance.now();
    if (now - lastUpdate > 100) {
      lastUpdate = now;
      const elapsed = now - genStart;
      const pct = totalEvents / totalExpected;
      const evtPerSec = totalEvents / (elapsed / 1000);
      const eta = (totalExpected - totalEvents) / evtPerSec;
      process.stdout.write(
        `\r  ${label} ${progressBar(pct)} ${(pct * 100).toFixed(0)}%  ` +
        `${formatNum(totalEvents)} / ${formatNum(totalExpected)} events  ` +
        `${formatNum(Math.round(evtPerSec))} evt/s  ` +
        `ETA ${formatMs(eta * 1000)}   `
      );
    }
  }

  // Add a "latest" course at the very end for the recent-read benchmark
  await store.append([
    { type: 'CourseCreated', data: { courseId: 'course-latest', title: 'Latest Course' } },
  ], null);
  totalEvents++;
  for (let s = 0; s < 5; s++) {
    await store.append([
      { type: 'StudentEnrolled', data: { courseId: 'course-latest', studentId: `student-latest-${s}` } },
    ], null);
    totalEvents++;
  }

  const elapsed = performance.now() - genStart;
  const evtPerSec = totalEvents / (elapsed / 1000);
  process.stdout.write(
    `\r  ${label} ${progressBar(1)} 100%  ` +
    `${formatNum(totalEvents)} events in ${formatMs(elapsed)}  ` +
    `(${formatNum(Math.round(evtPerSec))} evt/s)       \n`
  );

  return totalEvents;
}

// --- Benchmark runners ---

function computeStats(times: number[]): { avgMs: number; p50Ms: number; p99Ms: number } {
  times.sort((a, b) => a - b);
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const p50Ms = times[Math.floor(times.length * 0.5)];
  const p99Ms = times[Math.floor(times.length * 0.99)];
  return { avgMs, p50Ms, p99Ms };
}

/** Sequential: run all iterations of one query, then next query */
async function benchmarkSequential(
  queryDefs: QueryDef[],
  store: EventStore,
): Promise<Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }>> {
  const results: Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }> = [];

  for (let q = 0; q < queryDefs.length; q++) {
    process.stdout.write(`\r  Running: ${queryDefs[q].name}...                         `);
    const fn = queryDefs[q].fn(store);
    await fn(); // warmup

    const times: number[] = [];
    let resultCount = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const result = await fn();
      times.push(performance.now() - start);
      resultCount = result.count;
    }

    const stats = computeStats(times);
    results.push({ ...stats, results: resultCount });
  }
  return results;
}

/** Shuffle: interleave all queries in random order to avoid cache bias */
async function benchmarkShuffled(
  queryDefs: QueryDef[],
  store: EventStore,
): Promise<Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }>> {
  const fns = queryDefs.map(q => q.fn(store));
  const times: number[][] = queryDefs.map(() => []);
  const resultCounts: number[] = queryDefs.map(() => 0);

  // Build shuffled schedule: each query appears ITERATIONS times
  const schedule: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    for (let q = 0; q < queryDefs.length; q++) {
      schedule.push(q);
    }
  }
  // Fisher-Yates shuffle
  for (let i = schedule.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
  }

  const total = schedule.length;
  for (let i = 0; i < total; i++) {
    if (i % 10 === 0) {
      process.stdout.write(`\r  Shuffled: ${i}/${total} runs...                         `);
    }
    const q = schedule[i];
    const start = performance.now();
    const result = await fns[q]();
    times[q].push(performance.now() - start);
    resultCounts[q] = result.count;
  }

  return queryDefs.map((_, q) => ({
    ...computeStats(times[q]),
    results: resultCounts[q],
  }));
}

// --- Query definitions ---

interface QueryDef {
  name: string;
  fn: (store: EventStore) => () => Promise<{ count: number }>;
}

const queries: QueryDef[] = [
  {
    name: 'Single type (CourseCreated)',
    fn: (store) => () => store.query().matchType('CourseCreated').read(),
  },
  {
    name: 'Constrained (Enrollments/course)',
    fn: (store) => () => store.query().matchTypeAndKey('StudentEnrolled', 'course', 'course-50').read(),
  },
  {
    name: 'Constrained (Lessons/student)',
    fn: (store) => () => store.query().matchTypeAndKey('LessonCompleted', 'student', 'student-50-5').read(),
  },
  {
    name: 'Mixed (2 types/course)',
    fn: (store) => () => store.query()
      .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
      .matchTypeAndKey('CertificateIssued', 'course', 'course-50')
      .read(),
  },
  {
    name: 'Full course aggregate (3 types)',
    fn: (store) => () => store.query()
      .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
      .matchTypeAndKey('LessonCompleted', 'course', 'course-50')
      .matchTypeAndKey('CertificateIssued', 'course', 'course-50')
      .read(),
  },
  {
    name: 'Append (no condition)',
    fn: (store) => {
      let counter = 0;
      return async () => {
        await store.append([
          { type: 'LessonCompleted', data: { courseId: 'course-bench', studentId: 'student-bench', lessonId: `lesson-${counter++}` } },
        ], null);
        return { count: 1 };
      };
    },
  },
  {
    name: 'Append (recent read)',
    fn: (store) => {
      let counter = 0;
      return async () => {
        const read = await store.query()
          .matchTypeAndKey('StudentEnrolled', 'course', 'course-latest')
          .read();
        await store.append([
          { type: 'LessonCompleted', data: { courseId: 'course-latest', studentId: 'student-bench', lessonId: `lesson-${counter++}` } },
        ], read.appendCondition);
        return { count: 1 };
      };
    },
  },
  {
    name: 'Append (cold read)',
    fn: (store) => {
      let counter = 0;
      return async () => {
        const read = await store.query()
          .matchTypeAndKey('StudentEnrolled', 'course', 'course-0')
          .read();
        await store.append([
          { type: 'LessonCompleted', data: { courseId: 'course-cold', studentId: 'student-bench', lessonId: `lesson-${counter++}` } },
        ], read.appendCondition);
        return { count: 1 };
      };
    },
  },
];

// --- DB helpers ---

async function getEventCount(): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM events');
    return parseInt(result.rows[0].count, 10);
  } catch {
    return 0; // table doesn't exist
  } finally {
    await pool.end();
  }
}

async function cleanDb() {
  const pool = new Pool({ connectionString: DB_URL });
  await pool.query('DROP TABLE IF EXISTS event_keys CASCADE');
  await pool.query('DROP TABLE IF EXISTS events CASCADE');
  await pool.query('DROP TABLE IF EXISTS metadata CASCADE');
  await pool.end();
}

// --- Conflict benchmarks ---

const CONFLICT_ITERATIONS = Number(getArg('--rounds')) || 50;
const CONCURRENT_WRITERS = Number(getArg('--writers')) || 10;
const EVENTS_PER_WRITER = Number(getArg('--writer-events')) || 5;

async function runConflictBenchmarks(store: EventStore) {
  console.log(`\n  === Conflict Benchmarks ===\n`);

  const nameCol = 40;

  // Scenario 1: Successful append with condition (baseline)
  {
    const times: number[] = [];
    for (let i = 0; i < CONFLICT_ITERATIONS; i++) {
      const read = await store.query()
        .matchTypeAndKey('StudentEnrolled', 'course', 'course-0')
        .read();

      const start = performance.now();
      await store.append([
        { type: 'LessonCompleted', data: { courseId: 'course-0', studentId: 'student-conflict-baseline', lessonId: `lesson-baseline-${i}` } },
      ], read.appendCondition);
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  ${'Successful append with condition'.padEnd(nameCol)} ${avg.toFixed(2)} ms`);
  }

  // Scenario 2: Conflict detection (stale condition)
  {
    const times: number[] = [];
    for (let i = 0; i < CONFLICT_ITERATIONS; i++) {
      const read = await store.query()
        .matchTypeAndKey('StudentEnrolled', 'course', 'course-0')
        .read();

      // Make the condition stale
      await store.append([
        { type: 'StudentEnrolled', data: { courseId: 'course-0', studentId: `student-stale-pg-${i}` } },
      ], null);

      const start = performance.now();
      const result = await store.append([
        { type: 'StudentEnrolled', data: { courseId: 'course-0', studentId: `student-conflict-pg-${i}` } },
      ], read.appendCondition);
      times.push(performance.now() - start);

      if (!result.conflict) {
        console.log(`    ⚠ Expected conflict but got success (iteration ${i})`);
      }
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  ${'Conflict detection (stale)'.padEnd(nameCol)} ${avg.toFixed(2)} ms`);
  }

  // Scenario 3: Conflict + retry round-trip
  {
    const times: number[] = [];
    for (let i = 0; i < CONFLICT_ITERATIONS; i++) {
      const read = await store.query()
        .matchTypeAndKey('StudentEnrolled', 'course', 'course-0')
        .read();

      // Make the condition stale
      await store.append([
        { type: 'StudentEnrolled', data: { courseId: 'course-0', studentId: `student-retry-stale-pg-${i}` } },
      ], null);

      const start = performance.now();
      const staleResult = await store.append([
        { type: 'StudentEnrolled', data: { courseId: 'course-0', studentId: `student-retry-pg-${i}` } },
      ], read.appendCondition);

      if (staleResult.conflict) {
        const reRead = await store.query()
          .matchTypeAndKey('StudentEnrolled', 'course', 'course-0')
          .read();
        await store.append([
          { type: 'StudentEnrolled', data: { courseId: 'course-0', studentId: `student-retry-pg-${i}` } },
        ], reRead.appendCondition);
      }
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  ${'Conflict + retry round-trip'.padEnd(nameCol)} ${avg.toFixed(2)} ms`);
  }

  console.log('');
}

async function runConcurrentWriterBenchmarks() {
  console.log(`  === Concurrent Writer Benchmarks (${CONCURRENT_WRITERS} writers × ${EVENTS_PER_WRITER} events, ${CONFLICT_ITERATIONS} rounds) ===\n`);

  const nameCol = 40;

  async function runWriterScenario(label: string, getKey: (w: number) => string) {
    const times: number[] = [];
    let totalConflicts = 0;
    let totalSuccessful = 0;
    let maxRetryDepth = 0;

    for (let iter = 0; iter < CONFLICT_ITERATIONS; iter++) {
      const writerStores: EventStore[] = [];
      for (let w = 0; w < CONCURRENT_WRITERS; w++) {
        const writerStorage = new PostgresStorage({ connectionString: DB_URL, max: 1 });
        await writerStorage.init();
        writerStores.push(new EventStore({ storage: writerStorage, ...STORE_CONFIG }));
      }

      let conflicts = 0;
      let successes = 0;

      // Live ticker during round
      const roundStart = performance.now();
      const ticker = setInterval(() => {
        const elapsed = ((performance.now() - roundStart) / 1000).toFixed(0);
        const tickLine = `  ${label.padEnd(25)} ${(iter + 1).toString().padStart(3)}/${CONFLICT_ITERATIONS} | ${elapsed}s | ${conflicts} conflicts | ${successes}/${CONCURRENT_WRITERS} done`;
        process.stdout.write(`\r${tickLine.padEnd(120)}`);
      }, 500);

      await Promise.all(writerStores.map(async (writerStore, w) => {
        const courseKey = getKey(w);
        let done = false;
        let attempts = 0;
        while (!done && attempts < 5) {
          attempts++;
          const read = await writerStore.query()
            .matchTypeAndKey('StudentEnrolled', 'course', courseKey)
            .read();

          const events = Array.from({ length: EVENTS_PER_WRITER }, (_, e) => ({
            type: 'StudentEnrolled',
            data: { courseId: courseKey, studentId: `student-concurrent-${label}-${iter}-${w}-${attempts}-${e}` },
          }));
          const result = await writerStore.append(events, read.appendCondition);

          if (result.conflict) {
            conflicts++;
          } else {
            successes++;
            done = true;
          }
        }
        if (!done) maxRetryDepth = Math.max(maxRetryDepth, 5);
        else maxRetryDepth = Math.max(maxRetryDepth, successes > 0 ? 0 : 0);
      }));
      clearInterval(ticker);
      times.push(performance.now() - roundStart);
      totalConflicts += conflicts;
      totalSuccessful += successes;

      // Live progress (round summary)
      const avgSoFar = times.reduce((a, b) => a + b, 0) / times.length;
      const avgSuccSoFar = Math.round(totalSuccessful / (iter + 1));
      const evtsSoFar = formatNum(Math.round(avgSuccSoFar * EVENTS_PER_WRITER / (avgSoFar / 1000)));
      const line = `  ${label.padEnd(25)} ${(iter + 1).toString().padStart(3)}/${CONFLICT_ITERATIONS} | ${avgSoFar.toFixed(0)}ms avg | ${totalConflicts} conflicts | ${totalSuccessful}/${(iter + 1) * CONCURRENT_WRITERS} ok | ${evtsSoFar} evt/s`;
      process.stdout.write(`\r${line.padEnd(120)}`);

      for (const ws of writerStores) {
        await ws.close();
      }
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const avgConflicts = Math.round(totalConflicts / CONFLICT_ITERATIONS);
    const avgSuccessful = Math.round(totalSuccessful / CONFLICT_ITERATIONS);
    const avgEvents = avgSuccessful * EVENTS_PER_WRITER;
    const throughput = Math.round(avgEvents / (avgTime / 1000));
    // Clear live line and print final
    const finalLine = `  ${label.padEnd(nameCol)} ${avgTime.toFixed(1)} ms avg | ${avgConflicts} conflicts/round | ${avgSuccessful}/${CONCURRENT_WRITERS} successful | ${formatNum(throughput)} evt/s`;
    process.stdout.write(`\r${finalLine.padEnd(120)}\n`);
  }

  await runWriterScenario('same key', () => 'course-0');
  await runWriterScenario('different keys', (w) => `course-concurrent-${w}`);

  console.log('');
}

// --- Main ---

async function main() {
  const runMode = useShuffle ? 'shuffle' : 'sequential';
  console.log(`\n  ⚡ PostgreSQL Benchmark (${runMode})`);
  console.log(`  ${ITERATIONS} iterations per query`);
  console.log(`  ${DB_URL}`);
  console.log(`  Scales: ${datasets.map(d => d.label).join(', ')}\n`);

  // Sort datasets ascending so we can extend incrementally
  const sortedDatasets = [...datasets].sort((a, b) => a.courses - b.courses);
  const originalOrder = datasets.map(ds => sortedDatasets.indexOf(ds));

  const allResults: Array<Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }>> = queries.map(() => []);
  const sortedResults: Array<Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }>> = queries.map(() => []);

  // Check existing data in PostgreSQL
  let existingEvents = await getEventCount();
  let existingCourses = Math.floor(Math.max(0, existingEvents - 10) / EVENTS_PER_COURSE);

  if (existingEvents > 0) {
    console.log(`  Cached DB: ${formatNum(existingEvents)} events (~${formatNum(existingCourses)} courses)\n`);
  }

  let storage: PostgresStorage | null = null;
  let store: EventStore | null = null;

  for (let d = 0; d < sortedDatasets.length; d++) {
    const ds = sortedDatasets[d];

    if (!storage || !store) {
      storage = new PostgresStorage({ connectionString: DB_URL, max: 1 });
      await storage.init();
      store = new EventStore({ storage, ...STORE_CONFIG });
    }

    if (existingCourses >= ds.courses) {
      console.log(`  ${ds.label} cached (${formatNum(existingEvents)} events, ${formatNum(existingCourses)} courses >= ${formatNum(ds.courses)} needed)`);
    } else {
      if (existingCourses === 0 && d === 0) {
        // Fresh start - clean DB to ensure schema is correct
        await store.close();
        await cleanDb();
        storage = new PostgresStorage({ connectionString: DB_URL, max: 1 });
        await storage.init();
        store = new EventStore({ storage, ...STORE_CONFIG });
      }
      const needed = ds.courses - existingCourses;
      console.log(`  ${ds.label} extending: ${formatNum(existingCourses)} → ${formatNum(ds.courses)} courses (+${formatNum(needed)})`);
      await generateEvents(store, ds.courses, ds.students, ds.lessons, ds.label, existingCourses);
      existingCourses = ds.courses;
      existingEvents = ds.courses * EVENTS_PER_COURSE + 6;
    }

    // Warmup pass (sequential mode only)
    if (!useShuffle) {
      process.stdout.write(`\r  Warming up...                                          `);
      for (let q = 0; q < queries.length; q++) {
        try { await queries[q].fn(store!)(); } catch {}
      }
    }

    // Run queries
    const scaleResults = useShuffle
      ? await benchmarkShuffled(queries, store!)
      : await benchmarkSequential(queries, store!);

    for (let q = 0; q < queries.length; q++) {
      sortedResults[q].push(scaleResults[q]);
    }
    process.stdout.write(`\r  ✓ ${ds.label} queries done                                    \n`);
  }

  // Run conflict benchmarks if requested (on the last/largest dataset)
  if (store) {
    await runConflictBenchmarks(store);
    await runConcurrentWriterBenchmarks();
  }

  if (store) {
    await store.close();
  }

  // Reorder results back to original dataset order
  for (let q = 0; q < queries.length; q++) {
    allResults[q] = originalOrder.map(i => sortedResults[q][i]);
  }

  // --- Results table ---
  console.log('');
  const col = 14;
  const nameCol = 36;
  const divider = '─'.repeat(nameCol + col * datasets.length + 10);

  console.log(`  ${divider}`);
  process.stdout.write(`  ${'Query'.padEnd(nameCol)}`);
  for (const ds of datasets) {
    process.stdout.write(`${ds.label.padStart(col)}`);
  }
  process.stdout.write('  Results\n');
  console.log(`  ${divider}`);

  for (let q = 0; q < queries.length; q++) {
    process.stdout.write(`  ${queries[q].name.padEnd(nameCol)}`);
    for (let d = 0; d < datasets.length; d++) {
      const r = allResults[q][d];
      process.stdout.write(`${(r.avgMs.toFixed(2) + 'ms').padStart(col)}`);
    }
    const lastResult = allResults[q][allResults[q].length - 1];
    process.stdout.write(`${lastResult.results.toString().padStart(8)}\n`);
  }

  console.log(`  ${divider}`);

  // p50/p99 for largest dataset
  const lastIdx = datasets.length - 1;
  console.log(`\n  Latency percentiles at ${datasets[lastIdx].label}:`);
  console.log(`  ${'Query'.padEnd(nameCol)}${'avg'.padStart(10)}${'p50'.padStart(10)}${'p99'.padStart(10)}`);
  console.log(`  ${'─'.repeat(nameCol + 30)}`);
  for (let q = 0; q < queries.length; q++) {
    const r = allResults[q][lastIdx];
    console.log(
      `  ${queries[q].name.padEnd(nameCol)}` +
      `${(r.avgMs.toFixed(2) + 'ms').padStart(10)}` +
      `${(r.p50Ms.toFixed(2) + 'ms').padStart(10)}` +
      `${(r.p99Ms.toFixed(2) + 'ms').padStart(10)}`
    );
  }

  const totalEvents = existingEvents;
  console.log(`\n  Order: ${runMode} | Iterations: ${ITERATIONS} | Events: ${formatNum(totalEvents)} | Storage: PostgreSQL\n`);
}

main().catch(console.error);
