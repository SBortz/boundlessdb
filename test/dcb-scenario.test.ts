/**
 * DCB End-to-End Scenario Test
 *
 * Classic course enrollment example with capacity constraint
 */

import {describe, expect, it} from 'vitest';
import {EventStore, InMemoryStorage, isConflict} from '../src/index.js';
import type {ConsistencyConfig, Query, StoredEvent} from '../src/types.js';


// Define your event registry
type MyEvents = {
    CourseCreated: CourseCreatedData;
    StudentSubscribed: StudentSubscribedData;
    StudentUnsubscribed: StudentUnsubscribedData
};
// Domain configuration
const ENROLLMENT_CONFIG: ConsistencyConfig<MyEvents> = {
    eventTypes: {
        CourseCreated: {
            keys: [{name: 'course', path: 'data.courseId'}],
        },
        StudentSubscribed: {
            keys: [
                {name: 'course', path: 'data.courseId'},
                {name: 'student', path: 'data.studentId'},
            ],
        },
        StudentUnsubscribed: {
            keys: [
                {name: 'course', path: 'data.courseId'},
                {name: 'student', path: 'data.studentId'},
            ],
        },
    },
};

// Domain types
interface CourseCreatedData {
    courseId: string;
    name: string;
    capacity: number;
}

interface StudentSubscribedData {
    courseId: string;
    studentId: string;
    studentName: string;
}

interface StudentUnsubscribedData {
    courseId: string;
    studentId: string;
}

// Projection: Course state
interface CourseState {
    courseId: string;
    name: string;
    capacity: number;
    enrolled: Set<string>;
}

function projectCourseState(
    events: StoredEvent[],
    courseId: string
): CourseState | null {
    let state: CourseState | null = null;

    for (const event of events) {
        switch (event.type) {
            case 'CourseCreated': {
                const data = event.data as CourseCreatedData;
                if (data.courseId === courseId) {
                    state = {
                        courseId: data.courseId,
                        name: data.name,
                        capacity: data.capacity,
                        enrolled: new Set(),
                    };
                }
                break;
            }
            case 'StudentSubscribed': {
                const data = event.data as StudentSubscribedData;
                if (data.courseId === courseId && state) {
                    state.enrolled.add(data.studentId);
                }
                break;
            }
            case 'StudentUnsubscribed': {
                const data = event.data as StudentUnsubscribedData;
                if (data.courseId === courseId && state) {
                    state.enrolled.delete(data.studentId);
                }
                break;
            }
        }
    }

    return state;
}

describe('DCB Course Enrollment Scenario', () => {
    function createStore() {
        return new EventStore({
            storage: new InMemoryStorage(),
            consistency: ENROLLMENT_CONFIG,
        });
    }

    function courseQuery(courseId: string): Query {
        return {
            conditions: [
                {type: 'CourseCreated', key: 'course', value: courseId},
                {type: 'StudentSubscribed', key: 'course', value: courseId},
                {type: 'StudentUnsubscribed', key: 'course', value: courseId},
            ],
        };
    }

    it('allows enrollment when course has capacity', async () => {
        const store = createStore();

        // Admin creates course with capacity 30
        await store.append(
            [{
                type: 'CourseCreated',
                data: {courseId: 'cs101', name: 'Intro to CS', capacity: 30},
            }],
            null
        );

        // Student reads course state
        const readResult = await store.read(courseQuery('cs101'));
        const state = projectCourseState(readResult.events, 'cs101');

        expect(state).not.toBeNull();
        expect(state!.enrolled.size).toBe(0);

        // Invariant check: capacity available
        expect(state!.enrolled.size < state!.capacity).toBe(true);

        // Student enrolls
        const result = await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice'},
            }],
            readResult.appendCondition
        );

        expect(isConflict(result)).toBe(false);
    });

    it('detects concurrent enrollment conflict', async () => {
        const store = createStore();

        // Course with capacity 2
        await store.append(
            [{
                type: 'CourseCreated',
                data: {courseId: 'cs101', name: 'Small Course', capacity: 2},
            }],
            null
        );

        // Alice reads (sees 0 enrolled)
        const aliceRead = await store.read(courseQuery('cs101'));
        const aliceState = projectCourseState(aliceRead.events, 'cs101');
        expect(aliceState!.enrolled.size).toBe(0);

        // Bob reads (sees 0 enrolled)
        const bobRead = await store.read(courseQuery('cs101'));
        const bobState = projectCourseState(bobRead.events, 'cs101');
        expect(bobState!.enrolled.size).toBe(0);

        // Alice enrolls successfully
        const aliceResult = await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice'},
            }],
            aliceRead.appendCondition
        );
        expect(isConflict(aliceResult)).toBe(false);

        // Bob tries to enroll with stale appendCondition
        const bobResult = await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'bob', studentName: 'Bob'},
            }],
            bobRead.appendCondition
        );

        // Bob gets conflict with Alice's enrollment as delta
        expect(isConflict(bobResult)).toBe(true);
        if (isConflict(bobResult)) {
            expect(bobResult.conflictingEvents).toHaveLength(1);
            expect((bobResult.conflictingEvents[0].data as StudentSubscribedData).studentId).toBe('alice');
        }
    });

    it('prevents over-enrollment after conflict resolution', async () => {
        const store = createStore();

        // Course with capacity 1 (only one seat!)
        await store.append(
            [{
                type: 'CourseCreated',
                data: {courseId: 'cs101', name: 'Exclusive Seminar', capacity: 1},
            }],
            null
        );

        // Alice and Bob both read (see 0 enrolled)
        const aliceRead = await store.read(courseQuery('cs101'));
        const bobRead = await store.read(courseQuery('cs101'));

        // Alice enrolls first
        await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice'},
            }],
            aliceRead.appendCondition
        );

        // Bob tries to enroll - gets conflict
        const bobResult = await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'bob', studentName: 'Bob'},
            }],
            bobRead.appendCondition
        );

        expect(isConflict(bobResult)).toBe(true);

        if (isConflict(bobResult)) {
            // Bob re-evaluates with conflict delta
            const updatedEvents = [...bobRead.events, ...bobResult.conflictingEvents];
            const updatedState = projectCourseState(updatedEvents, 'cs101');

            // Course is now full!
            expect(updatedState!.enrolled.size).toBe(1);
            expect(updatedState!.enrolled.size >= updatedState!.capacity).toBe(true);

            // Bob should NOT retry enrollment
            // In real code: throw new Error("Course is full")
        }
    });

    it('allows retry when still capacity after conflict', async () => {
        const store = createStore();

        // Course with capacity 3
        await store.append(
            [{
                type: 'CourseCreated',
                data: {courseId: 'cs101', name: 'Medium Course', capacity: 3},
            }],
            null
        );

        // Alice reads
        const aliceRead = await store.read(courseQuery('cs101'));

        // Bob sneaks in
        await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'bob', studentName: 'Bob'},
            }],
            null
        );

        // Alice tries to enroll
        const aliceResult = await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice'},
            }],
            aliceRead.appendCondition
        );

        expect(isConflict(aliceResult)).toBe(true);

        if (isConflict(aliceResult)) {
            // Alice re-evaluates
            const updatedEvents = [...aliceRead.events, ...aliceResult.conflictingEvents];
            const updatedState = projectCourseState(updatedEvents, 'cs101');

            // Still capacity (1 of 3)
            expect(updatedState!.enrolled.size).toBe(1);
            expect(updatedState!.enrolled.size < updatedState!.capacity).toBe(true);

            // Alice can retry with new appendCondition
            const retryResult = await store.append(
                [{
                    type: 'StudentSubscribed',
                    data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice'},
                }],
                aliceResult.appendCondition
            );

            expect(isConflict(retryResult)).toBe(false);
        }
    });

    it('tracks individual student consistency', async () => {
        const store = createStore();

        // Course
        await store.append(
            [{
                type: 'CourseCreated',
                data: {courseId: 'cs101', name: 'Course', capacity: 10},
            }],
            null
        );

        // Alice enrolls
        await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice'},
            }],
            null
        );

        // Query specifically for Alice's enrollment
        const aliceQuery: Query = {
            conditions: [
                {type: 'StudentSubscribed', key: 'student', value: 'alice'},
                {type: 'StudentUnsubscribed', key: 'student', value: 'alice'},
            ],
        };

        const aliceEnrollment = await store.read(aliceQuery);

        expect(aliceEnrollment.events).toHaveLength(1);
        expect((aliceEnrollment.events[0].data as StudentSubscribedData).studentId).toBe('alice');

        // Try to re-enroll Alice (should conflict)
        const reEnrollResult = await store.append(
            [{
                type: 'StudentSubscribed',
                data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice Again'},
            }],
            aliceEnrollment.appendCondition
        );

        // Wait... this shouldn't conflict because we're appending, not checking uniqueness.
        // The DCB check only prevents stale reads, not duplicate enrollments.
        // That's a domain rule that the projection would catch.
        expect(isConflict(reEnrollResult)).toBe(false);

        // But the projection would show Alice as already enrolled
        const finalRead = await store.read(courseQuery('cs101'));
        const state = projectCourseState(finalRead.events, 'cs101');

        // Alice is only counted once because Set handles duplicates
        expect(state!.enrolled.size).toBe(1);
        // But there are 2 enrollment events!
        expect(finalRead.events.filter(e => e.type === 'StudentSubscribed')).toHaveLength(2);
    });

    it('handles unsubscription correctly', async () => {
        const store = createStore();

        // Setup
        await store.append(
            [
                {type: 'CourseCreated', data: {courseId: 'cs101', name: 'Course', capacity: 10}},
                {type: 'StudentSubscribed', data: {courseId: 'cs101', studentId: 'alice', studentName: 'Alice'}},
                {type: 'StudentSubscribed', data: {courseId: 'cs101', studentId: 'bob', studentName: 'Bob'}},
            ],
            null
        );

        // Read current state
        const {events} = await store.read(courseQuery('cs101'));
        const state = projectCourseState(events, 'cs101');

        expect(state!.enrolled.size).toBe(2);

        // Alice unsubscribes
        await store.append(
            [{type: 'StudentUnsubscribed', data: {courseId: 'cs101', studentId: 'alice'}}],
            null
        );

        // New state
        const afterUnsub = await store.read(courseQuery('cs101'));
        const newState = projectCourseState(afterUnsub.events, 'cs101');

        expect(newState!.enrolled.size).toBe(1);
        expect(newState!.enrolled.has('bob')).toBe(true);
        expect(newState!.enrolled.has('alice')).toBe(false);
    });
});
