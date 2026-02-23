import { describe, it, expect, beforeEach } from 'vitest';
import { createEventStore, InMemoryStorage, type Event } from '../src/index.js';

type TestEvent = 
  | Event<'CourseCreated', { courseId: string; capacity: number }>
  | Event<'StudentSubscribed', { courseId: string; studentId: string }>;

describe('QueryBuilder (Fluent API)', () => {
  const config = {
    eventTypes: {
      CourseCreated: {
        keys: [{ name: 'course', path: 'data.courseId' }]
      },
      StudentSubscribed: {
        keys: [
          { name: 'course', path: 'data.courseId' },
          { name: 'student', path: 'data.studentId' }
        ]
      }
    }
  };

  let store: ReturnType<typeof createEventStore>;

  beforeEach(async () => {
    store = createEventStore({
      storage: new InMemoryStorage(),
      consistency: config
    });

    // Seed some events
    await store.append<TestEvent>([
      { type: 'CourseCreated', data: { courseId: 'cs101', capacity: 30 } },
      { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
      { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
      { type: 'CourseCreated', data: { courseId: 'math201', capacity: 25 } },
      { type: 'StudentSubscribed', data: { courseId: 'math201', studentId: 'alice' } },
    ], null);
  });

  it('should query with matchType (unconstrained)', async () => {
    const result = await store.query<TestEvent>()
      .matchType('CourseCreated')
      .read();

    expect(result.count).toBe(2);
    expect(result.events.map(e => e.data.courseId)).toEqual(['cs101', 'math201']);
  });

  it('should query with match (constrained)', async () => {
    const result = await store.query<TestEvent>()
      .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
      .read();

    expect(result.count).toBe(2);
    expect(result.events.map(e => e.data.studentId)).toEqual(['alice', 'bob']);
  });

  it('should combine matchType and match', async () => {
    const result = await store.query<TestEvent>()
      .matchType('CourseCreated')
      .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
      .read();

    // Should get: CourseCreated (all) + StudentSubscribed for cs101
    expect(result.count).toBe(4); // 2 courses + 2 subscriptions for cs101
  });

  it('should support limit', async () => {
    const result = await store.query<TestEvent>()
      .matchType('StudentSubscribed')
      .limit(2)
      .read();

    expect(result.count).toBe(2);
  });

  it('should support fromPosition', async () => {
    // First, get all events to know positions
    const all = await store.query<TestEvent>()
      .matchType('StudentSubscribed')
      .read();

    expect(all.count).toBe(3);

    // Now read from position of first subscription
    const fromPos = await store.query<TestEvent>()
      .matchType('StudentSubscribed')
      .fromPosition(all.events[0].position)
      .read();

    // Should get events after the first one
    expect(fromPos.count).toBe(2);
  });

  it('should chain multiple conditions', async () => {
    const result = await store.query<TestEvent>()
      .matchTypeAndKey('StudentSubscribed', 'student', 'alice')
      .read();

    // Alice is subscribed to both courses
    expect(result.count).toBe(2);
  });

  it('should return appendCondition for consistency', async () => {
    const result = await store.query<TestEvent>()
      .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
      .read();

    expect(result.appendCondition).toBeDefined();
    expect(result.appendCondition.failIfEventsMatch).toHaveLength(1);
    expect(result.appendCondition.failIfEventsMatch[0]).toEqual({
      type: 'StudentSubscribed',
      key: 'course',
      value: 'cs101'
    });
  });

  it('should work with empty results', async () => {
    const result = await store.query<TestEvent>()
      .matchTypeAndKey('StudentSubscribed', 'course', 'nonexistent')
      .read();

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
  });
});
