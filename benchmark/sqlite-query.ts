/**
 * SQLite Throughput Benchmark
 * 
 * Tests whether query performance degrades as the event store grows.
 * Generates data ONCE per scale, then runs all queries on the same store.
 * 
 * Run: npx tsx benchmark/sqlite-query.ts
 */

import { EventStore } from '../src/event-store.js';
import { SqliteStorage } from '../src/storage/sqlite.js';
import type { Event } from '../src/types.js';

type CourseCreated = Event<'CourseCreated', { courseId: string; title: string }>;
type StudentEnrolled = Event<'StudentEnrolled', { courseId: string; studentId: string }>;
type LessonCompleted = Event<'LessonCompleted', { courseId: string; studentId: string; lessonId: string }>;
type CertificateIssued = Event<'CertificateIssued', { courseId: string; studentId: string }>;
type BenchmarkEvent = CourseCreated | StudentEnrolled | LessonCompleted | CertificateIssued;

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

async function generateEvents(store: EventStore, numCourses: number, studentsPerCourse: number, lessonsPerStudent: number): Promise<number> {
  let totalEvents = 0;
  
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
  }
  
  return totalEvents;
}

async function benchmark(name: string, fn: () => Promise<{ count: number }>): Promise<{ avgMs: number; results: number }> {
  // Warmup
  await fn();

  const times: number[] = [];
  let resultCount = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    const result = await fn();
    times.push(performance.now() - start);
    resultCount = result.count;
  }

  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  return { avgMs, results: resultCount };
}

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

// Dataset configs
const datasets = [
  { courses: 15, students: 55, lessons: 10, label: '~10k' },
  { courses: 150, students: 55, lessons: 10, label: '~100k' },
  { courses: 500, students: 167, lessons: 10, label: '~1M' },
];

async function main() {
  console.log('SQLite Throughput Benchmark');
  console.log(`${ITERATIONS} iterations per query, averaged\n`);

  // Collect all results: results[queryIndex][datasetIndex]
  const allResults: Array<Array<{ avgMs: number; results: number }>> = queries.map(() => []);

  for (let d = 0; d < datasets.length; d++) {
    const ds = datasets[d];
    const storage = new SqliteStorage(':memory:');
    const store = new EventStore({ storage, ...STORE_CONFIG });

    const genStart = performance.now();
    const totalEvents = await generateEvents(store, ds.courses, ds.students, ds.lessons);
    const genTime = ((performance.now() - genStart) / 1000).toFixed(1);
    console.log(`Generated ${ds.label} (${totalEvents.toLocaleString()} events) in ${genTime}s`);

    // Run all queries on this store
    for (let q = 0; q < queries.length; q++) {
      const result = await benchmark(queries[q].name, queries[q].fn(store));
      allResults[q].push(result);
    }

    await store.close();
  }

  // Print results table
  const col = 14;
  console.log('\n' + '='.repeat(80));
  console.log('Query'.padEnd(38) + datasets.map(d => d.label.padStart(col)).join('') + '  Results');
  console.log('-'.repeat(80));

  for (let q = 0; q < queries.length; q++) {
    let line = queries[q].name.padEnd(38);
    for (let d = 0; d < datasets.length; d++) {
      const r = allResults[q][d];
      line += (r.avgMs.toFixed(2) + 'ms').padStart(col);
    }
    line += allResults[q][allResults[q].length - 1].results.toString().padStart(8);
    console.log(line);
  }

  console.log('='.repeat(80));
  console.log('Times in ms (avg). Results = count at largest scale.');
}

main().catch(console.error);
