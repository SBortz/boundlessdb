import { describe, it, expect, beforeEach } from 'vitest';
import { createEventStore, InMemoryStorage, type Event, type MultiKeyConstrainedCondition, type KeyOnlyCondition } from '../src/index.js';

type TestEvent = 
  | Event<'CourseCreated', { courseId: string; capacity: number }>
  | Event<'StudentSubscribed', { courseId: string; studentId: string }>;

type MultiKeyTestEvent =
  | Event<'StudentEnrolled', { courseId: string; studentId: string; semester: string }>
  | Event<'CourseCancelled', { courseId: string }>;

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
      keys: [{ name: 'course', value: 'cs101' }]
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

describe('QueryBuilder — Multi-Key AND (.withKey())', () => {
  const config = {
    eventTypes: {
      StudentEnrolled: {
        keys: [
          { name: 'course', path: 'data.courseId' },
          { name: 'student', path: 'data.studentId' },
          { name: 'semester', path: 'data.semester' },
        ]
      },
      CourseCancelled: {
        keys: [{ name: 'course', path: 'data.courseId' }]
      }
    }
  };

  let store: ReturnType<typeof createEventStore>;

  beforeEach(async () => {
    store = createEventStore({
      storage: new InMemoryStorage(),
      consistency: config
    });

    // Seed test events
    await store.append<MultiKeyTestEvent>([
      { type: 'StudentEnrolled', data: { courseId: 'cs101', studentId: 'alice', semester: '2026-1' } },
      { type: 'StudentEnrolled', data: { courseId: 'cs101', studentId: 'bob', semester: '2026-1' } },
      { type: 'StudentEnrolled', data: { courseId: 'math201', studentId: 'alice', semester: '2026-1' } },
      { type: 'StudentEnrolled', data: { courseId: 'cs101', studentId: 'alice', semester: '2026-2' } },
      { type: 'CourseCancelled', data: { courseId: 'cs101' } },
    ], null);
  });

  it('.withKey() adds key to last condition', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchType('StudentEnrolled')
      .withKey('course', 'cs101')
      .read();

    // Should find all StudentEnrolled for cs101 (alice 2026-1, bob, alice 2026-2)
    expect(result.count).toBe(3);
  });

  it('.withKey() without .matchType() throws error', () => {
    expect(() => {
      store.query<MultiKeyTestEvent>().withKey('course', 'cs101');
    }).toThrow('.withKey() requires a preceding .matchType(), .matchTypeAndKey(), or .matchKey()');
  });

  it('multi-key AND returns only events with ALL keys', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchType('StudentEnrolled')
      .withKey('course', 'cs101')
      .withKey('student', 'alice')
      .read();

    // Should find only alice in cs101 (2 events: 2026-1 and 2026-2)
    expect(result.count).toBe(2);
    for (const event of result.events) {
      expect(event.data.courseId).toBe('cs101');
      expect(event.data.studentId).toBe('alice');
    }
  });

  it('three or more keys AND', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchType('StudentEnrolled')
      .withKey('course', 'cs101')
      .withKey('student', 'alice')
      .withKey('semester', '2026-1')
      .read();

    // Only 1 event matches all three keys
    expect(result.count).toBe(1);
    expect(result.events[0].data).toEqual({
      courseId: 'cs101',
      studentId: 'alice',
      semester: '2026-1',
    });
  });

  it('mixed conditions: multi-key AND + single-key OR', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchType('StudentEnrolled')
      .withKey('course', 'cs101')
      .withKey('student', 'alice')
      .matchTypeAndKey('CourseCancelled', 'course', 'cs101')
      .read();

    // alice cs101 (2 events) + CourseCancelled cs101 (1 event) = 3
    expect(result.count).toBe(3);
    const types = result.events.map(e => e.type);
    expect(types.filter(t => t === 'StudentEnrolled')).toHaveLength(2);
    expect(types.filter(t => t === 'CourseCancelled')).toHaveLength(1);
  });

  it('matchTypeAndKey + withKey (shorthand multi-key)', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchTypeAndKey('StudentEnrolled', 'course', 'cs101')
      .withKey('student', 'bob')
      .read();

    // Only bob in cs101
    expect(result.count).toBe(1);
    expect(result.events[0].data.studentId).toBe('bob');
  });

  it('single-key query still works unchanged (backward compat)', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchTypeAndKey('StudentEnrolled', 'student', 'alice')
      .read();

    // Alice is enrolled in cs101 (2x) and math201 (1x) = 3
    expect(result.count).toBe(3);
  });

  it('{ type, key, value } input format still accepted via read()', async () => {
    const result = await store.read<MultiKeyTestEvent>({
      conditions: [
        { type: 'StudentEnrolled', key: 'course', value: 'cs101' },
      ],
    });

    expect(result.count).toBe(3);
  });

  it('multi-key appendCondition propagates correctly', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchType('StudentEnrolled')
      .withKey('course', 'cs101')
      .withKey('student', 'alice')
      .read();

    expect(result.appendCondition).toBeDefined();
    const cond = result.appendCondition.failIfEventsMatch[0] as MultiKeyConstrainedCondition;
    expect(cond.type).toBe('StudentEnrolled');
    expect(cond.keys).toEqual([
      { name: 'course', value: 'cs101' },
      { name: 'student', value: 'alice' },
    ]);
  });

  it('multi-key with fromPosition', async () => {
    // Get all alice in cs101
    const all = await store.query<MultiKeyTestEvent>()
      .matchType('StudentEnrolled')
      .withKey('course', 'cs101')
      .withKey('student', 'alice')
      .read();

    expect(all.count).toBe(2);

    // Read from after the first event's position
    const fromPos = await store.query<MultiKeyTestEvent>()
      .matchType('StudentEnrolled')
      .withKey('course', 'cs101')
      .withKey('student', 'alice')
      .fromPosition(all.events[0].position)
      .read();

    expect(fromPos.count).toBe(1);
    expect(fromPos.events[0].data.semester).toBe('2026-2');
  });
});

describe('store.all() — Read All Events', () => {
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

  type AllEvent =
    | Event<'CourseCreated', { courseId: string; capacity: number }>
    | Event<'StudentSubscribed', { courseId: string; studentId: string }>;

  let store: ReturnType<typeof createEventStore>;

  beforeEach(async () => {
    store = createEventStore({
      storage: new InMemoryStorage(),
      consistency: config
    });

    await store.append<AllEvent>([
      { type: 'CourseCreated', data: { courseId: 'cs101', capacity: 30 } },
      { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
      { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
      { type: 'CourseCreated', data: { courseId: 'math201', capacity: 25 } },
      { type: 'StudentSubscribed', data: { courseId: 'math201', studentId: 'alice' } },
    ], null);
  });

  it('returns all events without any filter', async () => {
    const result = await store.all<AllEvent>().read();

    expect(result.count).toBe(5);
    expect(result.events.map(e => e.type)).toEqual([
      'CourseCreated',
      'StudentSubscribed',
      'StudentSubscribed',
      'CourseCreated',
      'StudentSubscribed',
    ]);
  });

  it('supports limit', async () => {
    const result = await store.all<AllEvent>().limit(3).read();

    expect(result.count).toBe(3);
    expect(result.events[0].type).toBe('CourseCreated');
    expect(result.events[2].type).toBe('StudentSubscribed');
  });

  it('supports fromPosition', async () => {
    const allResult = await store.all<AllEvent>().read();
    const thirdPosition = allResult.events[2].position;

    const result = await store.all<AllEvent>().fromPosition(thirdPosition).read();

    expect(result.count).toBe(2); // events 4 and 5
    expect(result.events[0].type).toBe('CourseCreated');
    expect(result.events[0].data).toEqual({ courseId: 'math201', capacity: 25 });
  });

  it('supports fromPosition + limit together', async () => {
    const result = await store.all<AllEvent>().fromPosition(0n).limit(2).read();

    expect(result.count).toBe(2);
    expect(result.events[0].position).toBe(1n);
    expect(result.events[1].position).toBe(2n);
  });

  it('returns empty result from empty store', async () => {
    const emptyStore = createEventStore({
      storage: new InMemoryStorage(),
      consistency: config,
    });

    const result = await emptyStore.all().read();

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
    expect(result.events).toEqual([]);
  });

  it('appendCondition has empty failIfEventsMatch', async () => {
    const result = await store.all<AllEvent>().read();

    expect(result.appendCondition).toBeDefined();
    expect(result.appendCondition.failIfEventsMatch).toEqual([]);
    expect(result.appendCondition.after).toBe(5n);
  });

  it('can still chain matchType after all() (same builder)', async () => {
    // all() returns the same QueryBuilder, so matchType still works
    const result = await store.all<AllEvent>()
      .matchType('CourseCreated')
      .read();

    expect(result.count).toBe(2);
  });
});

describe('QueryBuilder — .matchKey() Method', () => {
  const config = {
    eventTypes: {
      CourseCreated: {
        keys: [{ name: 'course', path: 'data.courseId' }]
      },
      StudentEnrolled: {
        keys: [
          { name: 'course', path: 'data.courseId' },
          { name: 'student', path: 'data.studentId' },
        ]
      },
      CourseCancelled: {
        keys: [{ name: 'course', path: 'data.courseId' }]
      }
    }
  };

  type MatchTestEvent =
    | Event<'CourseCreated', { courseId: string; capacity: number }>
    | Event<'StudentEnrolled', { courseId: string; studentId: string }>
    | Event<'CourseCancelled', { courseId: string }>;

  let store: ReturnType<typeof createEventStore>;

  beforeEach(async () => {
    store = createEventStore({
      storage: new InMemoryStorage(),
      consistency: config
    });

    // Seed test events
    await store.append<MatchTestEvent>([
      { type: 'CourseCreated', data: { courseId: 'cs101', capacity: 30 } },
      { type: 'StudentEnrolled', data: { courseId: 'cs101', studentId: 'alice' } },
      { type: 'StudentEnrolled', data: { courseId: 'cs101', studentId: 'bob' } },
      { type: 'CourseCreated', data: { courseId: 'math201', capacity: 25 } },
      { type: 'StudentEnrolled', data: { courseId: 'math201', studentId: 'alice' } },
      { type: 'CourseCancelled', data: { courseId: 'cs101' } },
    ], null);
  });

  // --- Type-only ---
  it('matchType still works (type-only)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('CourseCreated')
      .read();

    expect(result.count).toBe(2);
    expect(result.events.map(e => e.data.courseId)).toEqual(['cs101', 'math201']);
  });

  // --- Type + single key ---
  it('matchType().withKey() with single key (existing)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('StudentEnrolled').withKey('course', 'cs101')
      .read();

    expect(result.count).toBe(2);
    expect(result.events.every(e => e.type === 'StudentEnrolled')).toBe(true);
  });

  // --- Type + multiple keys (AND) ---
  it('matchType().withKey() with multiple keys AND (existing)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('StudentEnrolled').withKey('course', 'cs101').withKey('student', 'alice')
      .read();

    expect(result.count).toBe(1);
    expect(result.events[0].data).toEqual({ courseId: 'cs101', studentId: 'alice' });
  });

  // --- Key-only (single key) ---
  it('matchKey() with single key', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKey('course', 'cs101')
      .read();

    // Should find: CourseCreated cs101, StudentEnrolled cs101 (alice), StudentEnrolled cs101 (bob), CourseCancelled cs101
    expect(result.count).toBe(4);
    const types = result.events.map(e => e.type);
    expect(types).toContain('CourseCreated');
    expect(types).toContain('StudentEnrolled');
    expect(types).toContain('CourseCancelled');
  });

  // --- Key-only (multiple keys = AND) ---
  it('matchKey() with AND via withKey()', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKey('course', 'cs101').withKey('student', 'alice')
      .read();

    // Only StudentEnrolled has both keys: just alice in cs101
    expect(result.count).toBe(1);
    expect(result.events[0].type).toBe('StudentEnrolled');
    expect(result.events[0].data).toEqual({ courseId: 'cs101', studentId: 'alice' });
  });

  // --- Key-only across types ---
  it('matchKey() returns events across all types', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKey('student', 'alice')
      .read();

    // alice enrolled in cs101 and math201 — 2 events
    expect(result.count).toBe(2);
    expect(result.events.every(e => e.type === 'StudentEnrolled')).toBe(true);
  });

  // --- .match() with .fromPosition() ---
  it('matchKey() with fromPosition', async () => {
    const all = await store.query<MatchTestEvent>()
      .matchKey('course', 'cs101')
      .read();

    expect(all.count).toBe(4);

    // Read from after position of second event
    const fromPos = await store.query<MatchTestEvent>()
      .matchKey('course', 'cs101')
      .fromPosition(all.events[1].position)
      .read();

    expect(fromPos.count).toBe(2); // events after alice's enrollment
  });

  // --- .match() with .limit() ---
  it('matchKey() with limit', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKey('course', 'cs101')
      .limit(2)
      .read();

    expect(result.count).toBe(2);
  });

  // --- .match() with .fromPosition() + .limit() ---
  it('matchKey() with fromPosition + limit', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKey('course', 'cs101')
      .fromPosition(0n)
      .limit(2)
      .read();

    expect(result.count).toBe(2);
    expect(result.events[0].position).toBe(1n);
  });

  // --- appendCondition with key-only match ---
  it('matchKey() appendCondition propagates correctly', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKey('course', 'cs101')
      .read();

    expect(result.appendCondition).toBeDefined();
    const cond = result.appendCondition.failIfEventsMatch[0] as KeyOnlyCondition;
    expect(cond.keys).toEqual([{ name: 'course', value: 'cs101' }]);
    expect('type' in cond).toBe(false);
  });

  // --- appendCondition with type + keys match ---
  it('matchType() + withKey() appendCondition propagates correctly', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('StudentEnrolled').withKey('course', 'cs101').withKey('student', 'alice')
      .read();

    expect(result.appendCondition).toBeDefined();
    const cond = result.appendCondition.failIfEventsMatch[0] as MultiKeyConstrainedCondition;
    expect(cond.type).toBe('StudentEnrolled');
    expect(cond.keys).toEqual([
      { name: 'course', value: 'cs101' },
      { name: 'student', value: 'alice' },
    ]);
  });

  // --- Multiple .match() calls (OR across conditions) ---
  it('multiple conditions combine as OR', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('CourseCancelled')
      .matchKey('student', 'alice')
      .read();

    // CourseCancelled (1) + alice enrollments (2) = 3
    expect(result.count).toBe(3);
    const types = result.events.map(e => e.type);
    expect(types.filter(t => t === 'CourseCancelled')).toHaveLength(1);
    expect(types.filter(t => t === 'StudentEnrolled')).toHaveLength(2);
  });

  // --- .match() mixed with legacy methods ---
  it('matchKey() can be mixed with matchType and matchTypeAndKey', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('CourseCancelled')
      .matchKey('student', 'bob')
      .read();

    // CourseCancelled cs101 (1) + bob enrolled cs101 (1) = 2
    expect(result.count).toBe(2);
  });

  // --- Empty key-only result ---
  it('match(keys) returns empty for non-existent key', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKey('course', 'nonexistent')
      .read();

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
  });

  // --- match(type) for non-existent type ---
  it('match(type) returns empty for non-existent type', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('NonExistent')
      .read();

    expect(result.isEmpty()).toBe(true);
  });
});
