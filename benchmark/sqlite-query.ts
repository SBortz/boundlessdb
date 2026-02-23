/**
 * SQLite Query Performance Benchmark
 * 
 * Tests query performance with different condition types:
 * - Unconstrained (type-only)
 * - Constrained (type + key)
 * - Key-only
 * - Mixed (all three)
 * 
 * Run: npx tsx benchmark/sqlite-query.ts
 */

import { EventStore } from '../src/event-store.js';
import { SqliteStorage } from '../src/storage/sqlite.js';
import type { Event } from '../src/types.js';

// Event types for benchmark
type CourseCreated = Event<'CourseCreated', { courseId: string; title: string }>;
type StudentEnrolled = Event<'StudentEnrolled', { courseId: string; studentId: string }>;
type LessonCompleted = Event<'LessonCompleted', { courseId: string; studentId: string; lessonId: string }>;
type CertificateIssued = Event<'CertificateIssued', { courseId: string; studentId: string }>;

type BenchmarkEvent = CourseCreated | StudentEnrolled | LessonCompleted | CertificateIssued;

interface BenchmarkResult {
  name: string;
  eventCount: number;
  queryTimeMs: number;
  resultCount: number;
}

async function runBenchmark() {
  console.log('🚀 SQLite Query Benchmark\n');
  console.log('='.repeat(60));

  // Config
  const NUM_COURSES = 100;
  const STUDENTS_PER_COURSE = 50;
  const LESSONS_PER_STUDENT = 10;
  const ITERATIONS = 10;

  // Calculate expected events
  const expectedEvents = 
    NUM_COURSES +                                    // CourseCreated
    NUM_COURSES * STUDENTS_PER_COURSE +             // StudentEnrolled
    NUM_COURSES * STUDENTS_PER_COURSE * LESSONS_PER_STUDENT + // LessonCompleted
    NUM_COURSES * STUDENTS_PER_COURSE;              // CertificateIssued

  console.log(`\n📊 Dataset: ${expectedEvents.toLocaleString()} events`);
  console.log(`   - ${NUM_COURSES} courses`);
  console.log(`   - ${STUDENTS_PER_COURSE} students per course`);
  console.log(`   - ${LESSONS_PER_STUDENT} lessons per student`);
  console.log(`   - ${ITERATIONS} iterations per query\n`);

  // Create store
  const storage = new SqliteStorage(':memory:');
  const store = new EventStore({
    storage,
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
  });

  // Generate data
  console.log('⏳ Generating events...');
  const startGen = performance.now();

  for (let c = 0; c < NUM_COURSES; c++) {
    const courseId = `course-${c}`;
    
    // Create course
    await store.append([
      { type: 'CourseCreated', data: { courseId, title: `Course ${c}` } },
    ], null);

    // Enroll students and complete lessons
    for (let s = 0; s < STUDENTS_PER_COURSE; s++) {
      const studentId = `student-${c}-${s}`;
      
      const events: Array<{ type: string; data: unknown }> = [
        { type: 'StudentEnrolled', data: { courseId, studentId } },
      ];

      for (let l = 0; l < LESSONS_PER_STUDENT; l++) {
        events.push({
          type: 'LessonCompleted',
          data: { courseId, studentId, lessonId: `lesson-${l}` },
        });
      }

      events.push({ type: 'CertificateIssued', data: { courseId, studentId } });

      await store.append(events as BenchmarkEvent[], null);
    }

    // Progress
    if ((c + 1) % 10 === 0) {
      process.stdout.write(`\r   Generated ${c + 1}/${NUM_COURSES} courses...`);
    }
  }

  const genTime = performance.now() - startGen;
  console.log(`\r✅ Generated ${expectedEvents.toLocaleString()} events in ${(genTime / 1000).toFixed(2)}s\n`);

  // Run benchmarks
  const results: BenchmarkResult[] = [];

  // 1. Unconstrained query (type only)
  console.log('🔍 Running benchmarks...\n');
  
  results.push(await benchmark(
    'Unconstrained (all CourseCreated)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchType('CourseCreated')
        .read();
    }
  ));

  results.push(await benchmark(
    'Unconstrained (2 types)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchType('CourseCreated')
        .matchType('CertificateIssued')
        .read();
    }
  ));

  // 2. Constrained query (type + key)
  results.push(await benchmark(
    'Constrained (StudentEnrolled for course-50)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
        .read();
    }
  ));

  results.push(await benchmark(
    'Constrained (LessonCompleted for student)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchTypeAndKey('LessonCompleted', 'student', 'student-50-25')
        .read();
    }
  ));

  // 3. Key-only query
  results.push(await benchmark(
    'Key-only (all events for course-50)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchKey('course', 'course-50')
        .read();
    }
  ));

  results.push(await benchmark(
    'Key-only (all events for student)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchKey('student', 'student-50-25')
        .read();
    }
  ));

  // 4. Mixed queries
  results.push(await benchmark(
    'Mixed (unconstrained + constrained)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchType('CourseCreated')
        .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
        .read();
    }
  ));

  results.push(await benchmark(
    'Mixed (all three types)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchType('CourseCreated')
        .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
        .matchKey('student', 'student-50-25')
        .read();
    }
  ));

  results.push(await benchmark(
    'Mixed (constrained + key-only)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchTypeAndKey('LessonCompleted', 'course', 'course-50')
        .matchKey('student', 'student-25-10')
        .read();
    }
  ));

  // 5. With position filter
  results.push(await benchmark(
    'With fromPosition (last 10%)',
    ITERATIONS,
    async () => {
      const pos = BigInt(Math.floor(expectedEvents * 0.9));
      return store.query()
        .matchType('LessonCompleted')
        .fromPosition(pos)
        .read();
    }
  ));

  // 6. With limit
  results.push(await benchmark(
    'With limit (first 100)',
    ITERATIONS,
    async () => {
      return store.query()
        .matchType('LessonCompleted')
        .limit(100)
        .read();
    }
  ));

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('📈 RESULTS\n');
  console.log('Query'.padEnd(45) + 'Time (ms)'.padStart(10) + 'Results'.padStart(10));
  console.log('-'.repeat(65));
  
  for (const r of results) {
    console.log(
      r.name.padEnd(45) +
      r.queryTimeMs.toFixed(2).padStart(10) +
      r.resultCount.toString().padStart(10)
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Total events: ${expectedEvents.toLocaleString()}`);
  console.log(`Iterations per query: ${ITERATIONS}`);
  console.log('Times shown are averages per query execution.\n');

  await store.close();
}

async function benchmark(
  name: string,
  iterations: number,
  fn: () => Promise<{ count: number }>
): Promise<BenchmarkResult> {
  // Warmup
  await fn();

  // Measure
  const times: number[] = [];
  let resultCount = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = await fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
    resultCount = result.count;
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

  process.stdout.write(`   ✓ ${name}: ${avgTime.toFixed(2)}ms avg (${resultCount} results)\n`);

  return {
    name,
    eventCount: resultCount,
    queryTimeMs: avgTime,
    resultCount,
  };
}

runBenchmark().catch(console.error);
