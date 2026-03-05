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
      .matchTypeAndKeys('StudentSubscribed', { course: 'cs101' })
      .read();

    expect(result.count).toBe(2);
    expect(result.events.map(e => e.data.studentId)).toEqual(['alice', 'bob']);
  });

  it('should combine matchType and match', async () => {
    const result = await store.query<TestEvent>()
      .matchType('CourseCreated')
      .matchTypeAndKeys('StudentSubscribed', { course: 'cs101' })
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
      .matchTypeAndKeys('StudentSubscribed', { student: 'alice' })
      .read();

    // Alice is subscribed to both courses
    expect(result.count).toBe(2);
  });

  it('should return appendCondition for consistency', async () => {
    const result = await store.query<TestEvent>()
      .matchTypeAndKeys('StudentSubscribed', { course: 'cs101' })
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
      .matchTypeAndKeys('StudentSubscribed', { course: 'nonexistent' })
      .read();

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
  });
});

describe('QueryBuilder — Multi-Key AND (matchTypeAndKeys)', () => {
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

  it('matchTypeAndKeys() with single key filters correctly', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101' })
      .read();

    // Should find all StudentEnrolled for cs101 (alice 2026-1, bob, alice 2026-2)
    expect(result.count).toBe(3);
  });

  it('matchKeys() without keys throws error', () => {
    expect(() => {
      store.query<MultiKeyTestEvent>().matchKeys({});
    }).toThrow('.matchKeys() requires at least one key');
  });

  it('multi-key AND returns only events with ALL keys', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
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
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice', semester: '2026-1' })
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
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
      .matchTypeAndKeys('CourseCancelled', { course: 'cs101' })
      .read();

    // alice cs101 (2 events) + CourseCancelled cs101 (1 event) = 3
    expect(result.count).toBe(3);
    const types = result.events.map(e => e.type);
    expect(types.filter(t => t === 'StudentEnrolled')).toHaveLength(2);
    expect(types.filter(t => t === 'CourseCancelled')).toHaveLength(1);
  });

  it('matchTypeAndKeys with multiple keys (shorthand multi-key)', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'bob' })
      .read();

    // Only bob in cs101
    expect(result.count).toBe(1);
    expect(result.events[0].data.studentId).toBe('bob');
  });

  it('single-key query still works unchanged (backward compat)', async () => {
    const result = await store.query<MultiKeyTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { student: 'alice' })
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
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
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
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
      .read();

    expect(all.count).toBe(2);

    // Read from after the first event's position
    const fromPos = await store.query<MultiKeyTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
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

describe('QueryBuilder — .matchType() multi-type', () => {
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

  type MultiTypeEvent =
    | Event<'CourseCreated', { courseId: string; capacity: number }>
    | Event<'StudentEnrolled', { courseId: string; studentId: string }>
    | Event<'CourseCancelled', { courseId: string }>;

  let store: ReturnType<typeof createEventStore>;

  beforeEach(async () => {
    store = createEventStore({
      storage: new InMemoryStorage(),
      consistency: config
    });

    await store.append<MultiTypeEvent>([
      { type: 'CourseCreated', data: { courseId: 'cs101', capacity: 30 } },
      { type: 'StudentEnrolled', data: { courseId: 'cs101', studentId: 'alice' } },
      { type: 'StudentEnrolled', data: { courseId: 'cs101', studentId: 'bob' } },
      { type: 'CourseCreated', data: { courseId: 'math201', capacity: 25 } },
      { type: 'StudentEnrolled', data: { courseId: 'math201', studentId: 'alice' } },
      { type: 'CourseCancelled', data: { courseId: 'cs101' } },
    ], null);
  });

  it('matchType with multiple types returns events of all specified types', async () => {
    const result = await store.query<MultiTypeEvent>()
      .matchType('CourseCreated', 'CourseCancelled')
      .read();

    expect(result.count).toBe(3); // 2 CourseCreated + 1 CourseCancelled
    expect(result.events.every(e => e.type === 'CourseCreated' || e.type === 'CourseCancelled')).toBe(true);
  });

  it('matchTypeAndKeys for each type filters by key', async () => {
    const result = await store.query<MultiTypeEvent>()
      .matchTypeAndKeys('CourseCreated', { course: 'cs101' })
      .matchTypeAndKeys('CourseCancelled', { course: 'cs101' })
      .read();

    expect(result.count).toBe(2); // CourseCreated cs101 + CourseCancelled cs101
    const types = result.events.map(e => e.type);
    expect(types).toContain('CourseCreated');
    expect(types).toContain('CourseCancelled');
  });

  it('matchTypeAndKeys with multiple types + multiple keys (AND)', async () => {
    const result = await store.query<MultiTypeEvent>()
      .matchTypeAndKeys('CourseCreated', { course: 'cs101', student: 'alice' })
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
      .read();

    // Only StudentEnrolled has both keys
    expect(result.count).toBe(1);
    expect(result.events[0].type).toBe('StudentEnrolled');
  });

  it('matchType with multiple types combined with matchKeys (OR)', async () => {
    const result = await store.query<MultiTypeEvent>()
      .matchType('CourseCreated', 'CourseCancelled')  // Condition 1: types OR
      .matchKeys({ student: 'alice' })                 // Condition 2: key-only (OR)
      .read();

    // 3 (CourseCreated + CourseCancelled) + 2 (alice enrollments) = 5
    expect(result.count).toBe(5);
  });

  it('matchType with single type still works', async () => {
    const result = await store.query<MultiTypeEvent>()
      .matchType('CourseCreated')
      .read();

    expect(result.count).toBe(2);
  });

  it('matchType with zero types throws', async () => {
    expect(() => {
      store.query<MultiTypeEvent>().matchType();
    }).toThrow('.matchType() requires at least one type');
  });

  it('appendCondition with matchTypeAndKeys per type has correct structure', async () => {
    const result = await store.query<MultiTypeEvent>()
      .matchTypeAndKeys('CourseCreated', { course: 'cs101' })
      .matchTypeAndKeys('CourseCancelled', { course: 'cs101' })
      .read();

    expect(result.appendCondition).toBeDefined();
    expect(result.appendCondition.failIfEventsMatch).toHaveLength(2);
    const cond0 = result.appendCondition.failIfEventsMatch[0];
    const cond1 = result.appendCondition.failIfEventsMatch[1];
    expect((cond0 as any).type).toBe('CourseCreated');
    expect((cond0 as any).keys).toEqual([{ name: 'course', value: 'cs101' }]);
    expect((cond1 as any).type).toBe('CourseCancelled');
    expect((cond1 as any).keys).toEqual([{ name: 'course', value: 'cs101' }]);
  });
});

describe('QueryBuilder — .matchKeys() Method', () => {
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
  it('matchTypeAndKeys() with single key (existing)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101' })
      .read();

    expect(result.count).toBe(2);
    expect(result.events.every(e => e.type === 'StudentEnrolled')).toBe(true);
  });

  // --- Type + multiple keys (AND) ---
  it('matchTypeAndKeys() with multiple keys AND (existing)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
      .read();

    expect(result.count).toBe(1);
    expect(result.events[0].data).toEqual({ courseId: 'cs101', studentId: 'alice' });
  });

  // --- Key-only (single key) ---
  it('matchKeys() with single key', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101' })
      .read();

    // Should find: CourseCreated cs101, StudentEnrolled cs101 (alice), StudentEnrolled cs101 (bob), CourseCancelled cs101
    expect(result.count).toBe(4);
    const types = result.events.map(e => e.type);
    expect(types).toContain('CourseCreated');
    expect(types).toContain('StudentEnrolled');
    expect(types).toContain('CourseCancelled');
  });

  // --- Key-only (multiple keys = AND) ---
  it('matchKeys() with AND (multiple keys)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101', student: 'alice' })
      .read();

    // Only StudentEnrolled has both keys: just alice in cs101
    expect(result.count).toBe(1);
    expect(result.events[0].type).toBe('StudentEnrolled');
    expect(result.events[0].data).toEqual({ courseId: 'cs101', studentId: 'alice' });
  });

  // --- Key-only across types ---
  it('matchKeys() returns events across all types', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ student: 'alice' })
      .read();

    // alice enrolled in cs101 and math201 — 2 events
    expect(result.count).toBe(2);
    expect(result.events.every(e => e.type === 'StudentEnrolled')).toBe(true);
  });

  // --- .matchKeys() with .fromPosition() ---
  it('matchKeys() with fromPosition', async () => {
    const all = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101' })
      .read();

    expect(all.count).toBe(4);

    // Read from after position of second event
    const fromPos = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101' })
      .fromPosition(all.events[1].position)
      .read();

    expect(fromPos.count).toBe(2); // events after alice's enrollment
  });

  // --- .matchKeys() with .limit() ---
  it('matchKeys() with limit', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101' })
      .limit(2)
      .read();

    expect(result.count).toBe(2);
  });

  // --- .matchKeys() with .fromPosition() + .limit() ---
  it('matchKeys() with fromPosition + limit', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101' })
      .fromPosition(0n)
      .limit(2)
      .read();

    expect(result.count).toBe(2);
    expect(result.events[0].position).toBe(1n);
  });

  // --- appendCondition with key-only match ---
  it('matchKeys() appendCondition propagates correctly', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101' })
      .read();

    expect(result.appendCondition).toBeDefined();
    const cond = result.appendCondition.failIfEventsMatch[0] as KeyOnlyCondition;
    expect(cond.keys).toEqual([{ name: 'course', value: 'cs101' }]);
    expect('type' in cond).toBe(false);
  });

  // --- appendCondition with type + keys match ---
  it('matchTypeAndKeys() appendCondition propagates correctly', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })
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
      .matchKeys({ student: 'alice' })
      .read();

    // CourseCancelled (1) + alice enrollments (2) = 3
    expect(result.count).toBe(3);
    const types = result.events.map(e => e.type);
    expect(types.filter(t => t === 'CourseCancelled')).toHaveLength(1);
    expect(types.filter(t => t === 'StudentEnrolled')).toHaveLength(2);
  });

  // --- .matchKeys() mixed with legacy methods ---
  it('matchKeys() can be mixed with matchType and matchTypeAndKeys', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('CourseCancelled')
      .matchKeys({ student: 'bob' })
      .read();

    // CourseCancelled cs101 (1) + bob enrolled cs101 (1) = 2
    expect(result.count).toBe(2);
  });

  // --- Empty key-only result ---
  it('matchKeys() returns empty for non-existent key', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'nonexistent' })
      .read();

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
  });

  // --- matchType for non-existent type ---
  it('matchType returns empty for non-existent type', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('NonExistent')
      .read();

    expect(result.isEmpty()).toBe(true);
  });

  // --- Deep chain: matchTypeAndKeys + matchKeys + matchTypeAndKeys ---
  it('deep chain: matchTypeAndKeys + matchKeys + matchTypeAndKeys (3 OR conditions)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'alice' })  // Condition 1: type + 2 keys
      .matchKeys({ course: 'math201' })                                             // Condition 2: key-only
      .matchTypeAndKeys('CourseCancelled', { course: 'cs101' })                    // Condition 3: type + key
      .read();

    // Condition 1: StudentEnrolled where course=cs101 AND student=alice → 1 event
    // Condition 2: Any event with course=math201 → CourseCreated math201 + StudentEnrolled math201 alice = 2 events
    // Condition 3: CourseCancelled where course=cs101 → 1 event
    // Total (UNION ALL, no overlap): 4 events
    expect(result.count).toBe(4);

    const types = result.events.map(e => e.type);
    expect(types.filter(t => t === 'StudentEnrolled')).toHaveLength(2); // alice cs101 + alice math201
    expect(types.filter(t => t === 'CourseCreated')).toHaveLength(1);   // math201
    expect(types.filter(t => t === 'CourseCancelled')).toHaveLength(1); // cs101
  });

  it('deep chain: matchKeys + matchType (2 OR conditions)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchKeys({ course: 'cs101', student: 'bob' })  // Condition 1: key-only AND → bob in cs101
      .matchType('CourseCreated')                        // Condition 2: all CourseCreated
      .read();

    // Condition 1: Events with course=cs101 AND student=bob → StudentEnrolled bob cs101 = 1
    // Condition 2: All CourseCreated → cs101 + math201 = 2
    // Total: 3
    expect(result.count).toBe(3);
  });

  it('deep chain: matchType + matchKeys + matchTypeAndKeys (3 diverse conditions)', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchType('CourseCancelled')                                                           // Condition 1: type-only
      .matchKeys({ student: 'alice' })                                                        // Condition 2: key-only
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101', student: 'bob' })              // Condition 3: type + 2 keys
      .read();

    // Condition 1: CourseCancelled → cs101 = 1
    // Condition 2: student=alice → enrolled cs101 + enrolled math201 = 2
    // Condition 3: StudentEnrolled where course=cs101 AND student=bob → 1
    // Total: 4
    expect(result.count).toBe(4);
  });

  it('deep chain preserves all conditions in appendCondition', async () => {
    const result = await store.query<MatchTestEvent>()
      .matchTypeAndKeys('StudentEnrolled', { course: 'cs101' })
      .matchKeys({ student: 'alice' })
      .matchType('CourseCancelled')
      .read();

    expect(result.appendCondition.failIfEventsMatch).toHaveLength(3);
  });
});
