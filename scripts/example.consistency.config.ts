/**
 * Example consistency config for the reindex script.
 *
 * Usage:
 *   npx tsx scripts/reindex.ts --config ./scripts/example.consistency.config.ts --db ./events.sqlite
 *
 * Your config file must default-export a ConsistencyConfig object.
 * Alternatively, export it as `consistency` or `config`.
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
