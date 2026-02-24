/**
 * PostgreSQL Throughput Benchmark
 * 
 * Tests query performance as the event store grows.
 * Run: DATABASE_URL=postgresql://... npx tsx benchmark/postgres-query.ts
 */

import { EventStore } from '../src/event-store.js';
import { PostgresStorage } from '../src/storage/postgres.js';
import { Pool } from 'pg';
import type { Event } from '../src/types.js';

type CourseCreated = Event<'CourseCreated', { courseId: string; title: string }>;
type StudentEnrolled = Event<'StudentEnrolled', { courseId: string; studentId: string }>;
type LessonCompleted = Event<'LessonCompleted', { courseId: string; studentId: string; lessonId: string }>;
type CertificateIssued = Event<'CertificateIssued', { courseId: string; studentId: string }>;
type BenchmarkEvent = CourseCreated | StudentEnrolled | LessonCompleted | CertificateIssued;

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:bench@localhost:5433/bench';
const ITERATIONS = 20;

const STORE_CONFIG = {
  consistency: {
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
  },
};

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
): Promise<number> {
  const eventsPerCourse = 1 + studentsPerCourse * (1 + lessonsPerStudent + 1);
  const totalExpected = numCourses * eventsPerCourse;
  let totalEvents = 0;
  const genStart = performance.now();
  let lastUpdate = genStart;

  for (let c = 0; c < numCourses; c++) {
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

  const elapsed = performance.now() - genStart;
  const evtPerSec = totalEvents / (elapsed / 1000);
  process.stdout.write(
    `\r  ${label} ${progressBar(1)} 100%  ` +
    `${formatNum(totalEvents)} events in ${formatMs(elapsed)}  ` +
    `(${formatNum(Math.round(evtPerSec))} evt/s)       \n`
  );

  return totalEvents;
}

// --- Benchmark runner ---

async function benchmark(name: string, fn: () => Promise<{ count: number }>): Promise<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }> {
  await fn(); // warmup

  const times: number[] = [];
  let resultCount = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    const result = await fn();
    times.push(performance.now() - start);
    resultCount = result.count;
  }

  times.sort((a, b) => a - b);
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const p50Ms = times[Math.floor(times.length * 0.5)];
  const p99Ms = times[Math.floor(times.length * 0.99)];

  return { avgMs, p50Ms, p99Ms, results: resultCount };
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
    name: 'Append (single event)',
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
    name: 'Append with condition',
    fn: (store) => {
      let counter = 0;
      return async () => {
        const read = await store.query()
          .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
          .read();
        await store.append([
          { type: 'LessonCompleted', data: { courseId: 'course-bench2', studentId: 'student-bench2', lessonId: `lesson-${counter++}` } },
        ], read.appendCondition);
        return { count: 1 };
      };
    },
  },
];

// --- Dataset configs ---

const datasets = [
  { courses: 15, students: 55, lessons: 10, label: '~10k' },
  { courses: 150, students: 55, lessons: 10, label: '~100k' },
  { courses: 500, students: 167, lessons: 10, label: '~1M' },
  { courses: 2500, students: 167, lessons: 10, label: '~5M' },
];

// --- DB cleanup ---

async function cleanDb() {
  const pool = new Pool({ connectionString: DB_URL });
  await pool.query('DROP TABLE IF EXISTS event_keys CASCADE');
  await pool.query('DROP TABLE IF EXISTS events CASCADE');
  await pool.query('DROP TABLE IF EXISTS metadata CASCADE');
  await pool.end();
}

// --- Main ---

async function main() {
  console.log(`\n  ⚡ PostgreSQL Benchmark`);
  console.log(`  ${ITERATIONS} iterations per query`);
  console.log(`  ${DB_URL}\n`);

  const allResults: Array<Array<{ avgMs: number; p50Ms: number; p99Ms: number; results: number }>> = queries.map(() => []);

  for (let d = 0; d < datasets.length; d++) {
    const ds = datasets[d];

    await cleanDb();

    const storage = new PostgresStorage({ connectionString: DB_URL, max: 1 });
    await storage.init();
    const store = new EventStore({ storage, ...STORE_CONFIG });

    await generateEvents(store, ds.courses, ds.students, ds.lessons, ds.label);

    for (let q = 0; q < queries.length; q++) {
      process.stdout.write(`\r  Running: ${queries[q].name}...                         `);
      const result = await benchmark(queries[q].name, queries[q].fn(store));
      allResults[q].push(result);
    }
    process.stdout.write(`\r  ✓ ${ds.label} queries done                                    \n`);

    await store.close();
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

  console.log(`\n  Iterations: ${ITERATIONS} | Storage: PostgreSQL\n`);
}

main().catch(console.error);
