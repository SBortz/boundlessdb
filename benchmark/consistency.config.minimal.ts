/**
 * Minimal consistency config for testing reindex.
 *
 * Only extracts course keys — no student or lesson keys.
 * Use this to test reindex after switching from the full config:
 *
 *   npx tsx scripts/reindex.ts --config ./benchmark/consistency.config.minimal.ts --db ./benchmark/boundless-bench.sqlite
 */

import type {ConsistencyConfig} from '../src/types.js';

const consistency: ConsistencyConfig = {
    eventTypes: {
        CourseCreated: {
            keys: [{path: 'data.courseId', name: 'course'}],
        },
        StudentEnrolled: {
            keys: [{path: 'data.courseId', name: 'course'}],
        },
        LessonCompleted: {
            keys: [{path: 'data.courseId', name: 'course'}],
        },
        CertificateIssued: {
            keys: [{path: 'data.courseId', name: 'course'}],
        },
    },
};

export default consistency;
