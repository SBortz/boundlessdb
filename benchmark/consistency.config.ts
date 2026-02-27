/**
 * Shared consistency config for benchmarks and reindex.
 *
 * Usage:
 *   import consistency from './consistency.config.ts';
 *
 *   // Reindex:
 *   npx tsx scripts/reindex.ts --config ./benchmark/consistency.config.ts --db ./benchmark/boundless-bench.sqlite
 */

import type { ConsistencyConfig } from '../src/types.js';

const consistency: ConsistencyConfig = {
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

export default consistency;
