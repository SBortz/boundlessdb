/**
 * SQLite Throughput Benchmark
 * 
 * Usage:
 *   npx tsx benchmark/sqlite-query.ts [options] <size> [size...]
 * 
 * Options:
 *   --disk                   Use on-disk database (default: in-memory)
 *   --shuffle                Interleave queries in random order (avoids cache bias)
 *   --db <path>              SQLite database path (default: ./boundless-bench.sqlite)
 *   --config <path>          Consistency config file (default: ./benchmark/consistency.config.ts)
 * 
 * Examples:
 *   npx tsx benchmark/sqlite-query.ts --disk 50m
 *   npx tsx benchmark/sqlite-query.ts --disk --shuffle 50m
 *   npx tsx benchmark/sqlite-query.ts --disk --db ./my.sqlite --config ./my-config.ts 1m
 */

import { EventStore } from '../src/event-store.js';
import { SqliteStorage } from '../src/storage/sqlite.js';
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
const useDisk = args.includes('--disk');
const useShuffle = args.includes('--shuffle');

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const customDbPath = getArg('--db');
const configPath = getArg('--config');
const sizeArgs = args.filter((a, i) => {
  if (a.startsWith('--')) return false;
  // Skip values that follow --db or --config
  const prev = args[i - 1];
  if (prev === '--db' || prev === '--config') return false;
  return true;
});

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
  console.error('Usage: npx tsx benchmark/sqlite-query.ts [options] <size> [size...]');
  console.error('Options: --disk --shuffle --db <path> --config <path>');
  console.error('Example: npx tsx benchmark/sqlite-query.ts --disk 100k 1M 5M');
  process.exit(1);
}
const sizes = sizeArgs.map(parseSize);

const datasets = sizes.map(buildDataset);

const DB_PATH = customDbPath || './boundless-bench.sqlite';

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
        // Read the latest course (near end of store) - realistic use case
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
        // Read an early course (position near 0) - worst case
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

// --- Main ---

async function main() {
  const mode = useDisk ? 'on-disk' : 'in-memory';
  const runMode = useShuffle ? 'shuffle' : 'sequential';
  console.log(`\n  ⚡ SQLite Benchmark (${mode}, ${runMode})`);
  console.log(`  ${ITERATIONS} iterations per query`);
  console.log(`  Scales: ${datasets.map(d => d.label).join(', ')}\n`);

  // Sort datasets ascending so we can extend incrementally
  const sortedDatasets = [...datasets].sort((a, b) => a.courses - b.courses);
  // Map back to original order for results
  const originalOrder = datasets.map(ds => sortedDatasets.indexOf(ds));
  
  const allResults: Array<Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }>> = queries.map(() => []);
  const sortedResults: Array<Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }>> = queries.map(() => []);

  // For on-disk: single file, extended incrementally
  // For in-memory: fresh store per scale
  const dbPath = useDisk ? DB_PATH : ':memory:';
  let storage: SqliteStorage | null = null;
  let store: EventStore | null = null;
  let existingCourses = 0;

  if (useDisk) {
    const fs = await import('fs');
    if (fs.existsSync(dbPath)) {
      try {
        storage = new SqliteStorage(dbPath);
        store = new EventStore({ storage, ...STORE_CONFIG });
        const pos = Number(await storage.getLatestPosition());
        // Estimate existing courses (subtract course-latest extras, divide by events per course)
        existingCourses = Math.floor(Math.max(0, pos - 10) / EVENTS_PER_COURSE);
        console.log(`  Cached DB: ${formatNum(pos)} events (~${formatNum(existingCourses)} courses) in ${dbPath}\n`);
      } catch {
        console.log(`  Cached file corrupt, starting fresh...\n`);
        try { fs.unlinkSync(dbPath); } catch {}
        storage = null;
        store = null;
        existingCourses = 0;
      }
    }
  }

  for (let d = 0; d < sortedDatasets.length; d++) {
    const ds = sortedDatasets[d];

    if (!useDisk) {
      // In-memory: fresh store per scale
      storage = new SqliteStorage(':memory:');
      store = new EventStore({ storage, ...STORE_CONFIG });
      await generateEvents(store, ds.courses, ds.students, ds.lessons, ds.label);
    } else {
      // On-disk: extend if needed
      if (!storage || !store) {
        storage = new SqliteStorage(dbPath);
        store = new EventStore({ storage, ...STORE_CONFIG });
      }

      if (existingCourses >= ds.courses) {
        const pos = Number(await storage.getLatestPosition());
        console.log(`  ${ds.label} cached (${formatNum(pos)} events, ${formatNum(existingCourses)} courses >= ${formatNum(ds.courses)} needed)`);
      } else {
        const needed = ds.courses - existingCourses;
        console.log(`  ${ds.label} extending: ${formatNum(existingCourses)} → ${formatNum(ds.courses)} courses (+${formatNum(needed)})`);
        await generateEvents(store, ds.courses, ds.students, ds.lessons, ds.label, existingCourses);
        existingCourses = ds.courses;
      }
    }

    // Warmup pass (sequential mode only): populate OS page cache
    if (!useShuffle) {
      process.stdout.write(`\r  Warming up page cache...                               `);
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

    if (!useDisk) {
      await store!.close();
    }
  }

  if (useDisk && store) {
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

  console.log(`\n  Mode: ${mode} | Order: ${runMode} | Iterations: ${ITERATIONS} | Storage: SQLite (better-sqlite3)\n`);
}

main().catch(console.error);
