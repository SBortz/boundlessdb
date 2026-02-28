/**
 * Tests for EventStore - Core functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventStore, InMemoryStorage, SqliteStorage, isConflict } from '../src/index.js';
import type { ConsistencyConfig, NewEvent, Query } from '../src/types.js';

const TEST_CONFIG: ConsistencyConfig = {
  eventTypes: {
    CourseCreated: {
      keys: [{ name: 'course', path: 'data.courseId' }],
    },
    StudentSubscribed: {
      keys: [
        { name: 'course', path: 'data.courseId' },
        { name: 'student', path: 'data.studentId' },
      ],
    },
    StudentUnsubscribed: {
      keys: [
        { name: 'course', path: 'data.courseId' },
        { name: 'student', path: 'data.studentId' },
      ],
    },
  },
};

describe('EventStore', () => {
  describe.each([
    ['InMemoryStorage', () => new InMemoryStorage()],
    ['SqliteStorage', () => new SqliteStorage(':memory:')],
  ])('with %s', (_name, createStorage) => {
    let store: EventStore;

    beforeEach(() => {
      store = new EventStore({
        storage: createStorage(),
        consistency: TEST_CONFIG,
      });
    });

    describe('read', () => {
      it('returns empty result for empty store', async () => {
        const result = await store.read({
          conditions: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
        });

        expect(result.events).toEqual([]);
        expect(result.appendCondition).toBeDefined();
      });

      it('returns matching events', async () => {
        // First, append some events
        await store.append(
          [
            { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro to CS' } },
            { type: 'CourseCreated', data: { courseId: 'cs102', name: 'Advanced CS' } },
          ],
          null
        );

        const result = await store.read({
          conditions: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
        });

        expect(result.events).toHaveLength(1);
        expect(result.events[0].data).toEqual({ courseId: 'cs101', name: 'Intro to CS' });
      });

      it('respects fromPosition', async () => {
        await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'V1' } }],
          null
        );
        const pos = (await store.getStorage().getLatestPosition());

        await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'V2' } }],
          null
        );

        const result = await store.read({
          conditions: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
          fromPosition: pos,
        });

        expect(result.events).toHaveLength(1);
        expect(result.events[0].data).toEqual({ courseId: 'cs101', name: 'V2' });
      });

      it('respects limit', async () => {
        await store.append(
          [
            { type: 'CourseCreated', data: { courseId: 'cs101', name: 'V1' } },
            { type: 'CourseCreated', data: { courseId: 'cs101', name: 'V2' } },
            { type: 'CourseCreated', data: { courseId: 'cs101', name: 'V3' } },
          ],
          null
        );

        const result = await store.read({
          conditions: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
          limit: 2,
        });

        expect(result.events).toHaveLength(2);
      });
    });

    describe('append', () => {
      it('appends events without token', async () => {
        const result = await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro to CS' } }],
          null
        );

        expect(isConflict(result)).toBe(false);
        if (!isConflict(result)) {
          expect(result.position).toBe(1n);
          expect(result.appendCondition).toBeDefined();
        }
      });

      it('assigns unique IDs to events', async () => {
        await store.append(
          [
            { type: 'CourseCreated', data: { courseId: 'cs101' } },
            { type: 'CourseCreated', data: { courseId: 'cs102' } },
          ],
          null
        );

        const result = await store.read({
          conditions: [
            { type: 'CourseCreated', key: 'course', value: 'cs101' },
            { type: 'CourseCreated', key: 'course', value: 'cs102' },
          ],
        });

        expect(result.events[0].id).not.toBe(result.events[1].id);
      });

      it('assigns timestamps', async () => {
        const before = new Date();

        await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101' } }],
          null
        );

        const after = new Date();

        const result = await store.read({
          conditions: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
        });

        expect(result.events[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.events[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });

      it('stores metadata', async () => {
        await store.append(
          [
            {
              type: 'CourseCreated',
              data: { courseId: 'cs101' },
              metadata: { userId: 'admin', correlationId: '123' },
            },
          ],
          null
        );

        const result = await store.read({
          conditions: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
        });

        expect(result.events[0].metadata).toEqual({ userId: 'admin', correlationId: '123' });
      });
    });

    describe('consistency checks', () => {
      it('succeeds when no conflict', async () => {
        // Initial read
        const readResult = await store.read({
          conditions: [{ type: 'StudentSubscribed', key: 'course', value: 'cs101' }],
        });

        // Append with appendCondition from read
        const appendResult = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          readResult.appendCondition
        );

        expect(isConflict(appendResult)).toBe(false);
      });

      it('detects conflict when events added since read', async () => {
        // Create course
        await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS', capacity: 2 } }],
          null
        );

        // Alice reads
        const aliceRead = await store.read({
          conditions: [
            { type: 'CourseCreated', key: 'course', value: 'cs101' },
            { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
          ],
        });

        // Bob subscribes (unknown to Alice)
        await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } }],
          null
        );

        // Alice tries to subscribe with her stale appendCondition
        const aliceAppend = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          aliceRead.appendCondition
        );

        // Should be a conflict
        expect(isConflict(aliceAppend)).toBe(true);
        if (isConflict(aliceAppend)) {
          expect(aliceAppend.conflictingEvents).toHaveLength(1);
          expect(aliceAppend.conflictingEvents[0].data).toEqual({
            courseId: 'cs101',
            studentId: 'bob',
          });
          expect(aliceAppend.appendCondition).toBeDefined();
        }
      });

      it('allows retry with new token', async () => {
        // Create course
        await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', capacity: 10 } }],
          null
        );

        // Alice reads
        const aliceRead = await store.read({
          conditions: [
            { type: 'CourseCreated', key: 'course', value: 'cs101' },
            { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
          ],
        });

        // Bob subscribes
        await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } }],
          null
        );

        // Alice gets conflict
        const firstAttempt = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          aliceRead.appendCondition
        );

        expect(isConflict(firstAttempt)).toBe(true);

        if (isConflict(firstAttempt)) {
          // Alice retries with new appendCondition
          const secondAttempt = await store.append(
            [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
            firstAttempt.appendCondition
          );

          // Should succeed now
          expect(isConflict(secondAttempt)).toBe(false);
        }
      });

      it('no conflict when different keys', async () => {
        // Alice reads cs101
        const aliceRead = await store.read({
          conditions: [{ type: 'StudentSubscribed', key: 'course', value: 'cs101' }],
        });

        // Bob subscribes to cs102 (different course)
        await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs102', studentId: 'bob' } }],
          null
        );

        // Alice subscribes to cs101 - should NOT conflict
        const aliceAppend = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          aliceRead.appendCondition
        );

        expect(isConflict(aliceAppend)).toBe(false);
      });
    });

    describe('multiple event types in query', () => {
      it('queries across event types', async () => {
        await store.append(
          [
            { type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } },
            { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
            { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
            { type: 'StudentUnsubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
          ],
          null
        );

        const result = await store.read({
          conditions: [
            { type: 'CourseCreated', key: 'course', value: 'cs101' },
            { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
            { type: 'StudentUnsubscribed', key: 'course', value: 'cs101' },
          ],
        });

        expect(result.events).toHaveLength(4);
        expect(result.events.map(e => e.type)).toEqual([
          'CourseCreated',
          'StudentSubscribed',
          'StudentSubscribed',
          'StudentUnsubscribed',
        ]);
      });
    });

    describe('direct AppendCondition (without token)', () => {
      it('accepts AppendCondition object instead of token', async () => {
        // Create course
        await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS', capacity: 2 } }],
          null
        );

        // Read to get current position
        const readResult = await store.read({
          conditions: [{ type: 'StudentSubscribed', key: 'course', value: 'cs101' }],
        });

        // Get the position from the read
        const latestPosition = readResult.events.length > 0 
          ? readResult.events[readResult.events.length - 1].position
          : 0n;

        // Append using direct AppendCondition instead of token
        const appendResult = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          {
            after: latestPosition,
            failIfEventsMatch: [{ type: 'StudentSubscribed', key: 'course', value: 'cs101' }],
          }
        );

        expect(isConflict(appendResult)).toBe(false);
      });

      it('detects conflict with AppendCondition object', async () => {
        // Create course and first subscription
        await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } }],
          null
        );

        // Alice reads at position 0 (before any subscriptions)
        const aliceCondition = {
          after: 1n, // After CourseCreated
          failIfEventsMatch: [{ type: 'StudentSubscribed', key: 'course', value: 'cs101' }],
        };

        // Bob subscribes
        await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } }],
          null
        );

        // Alice tries with her stale condition
        const aliceAppend = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          aliceCondition
        );

        // Should be a conflict
        expect(isConflict(aliceAppend)).toBe(true);
        if (isConflict(aliceAppend)) {
          expect(aliceAppend.conflictingEvents).toHaveLength(1);
        }
      });

      it('allows manual condition creation for uniqueness checks', async () => {
        // Scenario: Check if username is taken (without reading first)
        
        // Manually create a condition from position 0
        const condition = {
          after: 0n,
          failIfEventsMatch: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
        };

        // First create should succeed
        const firstCreate = await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } }],
          condition
        );
        expect(isConflict(firstCreate)).toBe(false);

        // Second create with same condition should detect conflict
        const secondCreate = await store.append(
          [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS Duplicate' } }],
          condition  // Still using position 0
        );
        expect(isConflict(secondCreate)).toBe(true);
      });
    });

    describe('multi-key AND queries', () => {
      it('returns only events matching ALL keys', async () => {
        // Append events with multiple keys
        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
          { type: 'StudentSubscribed', data: { courseId: 'math201', studentId: 'alice' } },
        ], null);

        // Query for alice in cs101 (multi-key AND)
        const result = await store.read({
          conditions: [
            { type: 'StudentSubscribed', keys: [
              { name: 'course', value: 'cs101' },
              { name: 'student', value: 'alice' },
            ] },
          ],
        });

        expect(result.events).toHaveLength(1);
        expect(result.events[0].data).toEqual({ courseId: 'cs101', studentId: 'alice' });
      });

      it('multi-key with single key behaves like legacy constrained', async () => {
        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
        ], null);

        // Single key in keys[] format
        const multiKeyResult = await store.read({
          conditions: [
            { type: 'StudentSubscribed', keys: [{ name: 'course', value: 'cs101' }] },
          ],
        });

        // Legacy format
        const legacyResult = await store.read({
          conditions: [
            { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
          ],
        });

        expect(multiKeyResult.events).toHaveLength(legacyResult.events.length);
        expect(multiKeyResult.events.map(e => e.id)).toEqual(legacyResult.events.map(e => e.id));
      });

      it('multi-key with AppendCondition detects conflict', async () => {
        // Initial enrollment
        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ], null);

        // Read with multi-key condition
        const readResult = await store.read({
          conditions: [
            { type: 'StudentSubscribed', keys: [
              { name: 'course', value: 'cs101' },
              { name: 'student', value: 'alice' },
            ] },
          ],
        });

        // Someone else adds alice to cs101 again
        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ], null);

        // Try to append with stale condition
        const appendResult = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          readResult.appendCondition
        );

        expect(isConflict(appendResult)).toBe(true);
      });

      it('multi-key no conflict with different key values', async () => {
        // Initial enrollment
        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ], null);

        // Read alice in cs101
        const readResult = await store.read({
          conditions: [
            { type: 'StudentSubscribed', keys: [
              { name: 'course', value: 'cs101' },
              { name: 'student', value: 'alice' },
            ] },
          ],
        });

        // Bob enrolls in cs101 (different student key)
        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
        ], null);

        // Alice appending should still trigger conflict because bob's event
        // has course=cs101 AND student=bob, which does NOT match the query
        // (course=cs101 AND student=alice)
        const appendResult = await store.append(
          [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
          readResult.appendCondition
        );

        // No conflict because bob's enrollment doesn't have student=alice
        expect(isConflict(appendResult)).toBe(false);
      });

      it('mixed multi-key AND + single-key conditions (OR)', async () => {
        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'math201', studentId: 'alice' } },
        ], null);

        // alice in cs101 (AND) OR all CourseCreated for cs101
        const result = await store.read({
          conditions: [
            { type: 'StudentSubscribed', keys: [
              { name: 'course', value: 'cs101' },
              { name: 'student', value: 'alice' },
            ] },
            { type: 'CourseCreated', key: 'course', value: 'cs101' },
          ],
        });

        // 1 StudentSubscribed (alice+cs101) + 1 CourseCreated = 2
        expect(result.events).toHaveLength(2);
        expect(result.events.map(e => e.type).sort()).toEqual(['CourseCreated', 'StudentSubscribed']);
      });

      it('fromPosition works with multi-key AND', async () => {
        const r1 = await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ], null);
        const pos = (await store.getStorage().getLatestPosition());

        await store.append([
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ], null);

        const result = await store.read({
          conditions: [
            { type: 'StudentSubscribed', keys: [
              { name: 'course', value: 'cs101' },
              { name: 'student', value: 'alice' },
            ] },
          ],
          fromPosition: pos,
        });

        expect(result.events).toHaveLength(1);
      });
    });

    describe('store.all()', () => {
      it('returns all events across all types', async () => {
        await store.append([
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentUnsubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ], null);

        const result = await store.all().read();

        expect(result.events).toHaveLength(3);
        expect(result.events.map(e => e.type)).toEqual([
          'CourseCreated',
          'StudentSubscribed',
          'StudentUnsubscribed',
        ]);
      });

      it('returns empty result for empty store', async () => {
        const result = await store.all().read();

        expect(result.events).toEqual([]);
        expect(result.count).toBe(0);
      });

      it('supports fromPosition', async () => {
        await store.append([
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
        ], null);

        const result = await store.all().fromPosition(1n).read();

        expect(result.events).toHaveLength(2);
        expect(result.events[0].type).toBe('StudentSubscribed');
      });

      it('supports limit', async () => {
        await store.append([
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
        ], null);

        const result = await store.all().limit(2).read();

        expect(result.events).toHaveLength(2);
      });

      it('supports fromPosition + limit together', async () => {
        await store.append([
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
          { type: 'CourseCreated', data: { courseId: 'math201', name: 'Math' } },
        ], null);

        const result = await store.all().fromPosition(1n).limit(2).read();

        expect(result.events).toHaveLength(2);
        expect(result.events[0].position).toBe(2n);
        expect(result.events[1].position).toBe(3n);
      });

      it('appendCondition has empty failIfEventsMatch', async () => {
        await store.append([
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } },
        ], null);

        const result = await store.all().read();

        expect(result.appendCondition).toBeDefined();
        expect(result.appendCondition.failIfEventsMatch).toEqual([]);
      });

      it('read() with empty conditions behaves like all()', async () => {
        await store.append([
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ], null);

        const allResult = await store.all().read();
        const readResult = await store.read({ conditions: [] });

        expect(allResult.events).toHaveLength(readResult.events.length);
        expect(allResult.events.map(e => e.id)).toEqual(readResult.events.map(e => e.id));
      });
    });

  });
});
