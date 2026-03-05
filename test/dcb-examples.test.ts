/**
 * DCB Specification Examples — BoundlessDB Implementation
 *
 * All 6 examples from https://dcb.events/examples/ implemented as tests
 * using the BoundlessDB v0.9.0 API (matchKeys, matchTypeAndKeys, matchType).
 *
 * Each describe block mirrors one DCB example with Given/When/Then style.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventStore, InMemoryStorage, isConflict, mergeConditions } from '../src/index.js';
import { createAppendCondition } from '../src/types.js';
import type { AppendCondition, ConsistencyConfig, Event, StoredEvent } from '../src/types.js';

// ════════════════════════════════════════════════════════════════════
// 1. Course Subscriptions
// ════════════════════════════════════════════════════════════════════

describe('DCB Example 1: Course Subscriptions', () => {
  const config: ConsistencyConfig = {
    eventTypes: {
      CourseDefined: {
        keys: [{ name: 'course', path: 'data.courseId' }],
      },
      CourseCapacityChanged: {
        keys: [{ name: 'course', path: 'data.courseId' }],
      },
      StudentSubscribedToCourse: {
        keys: [
          { name: 'course', path: 'data.courseId' },
          { name: 'student', path: 'data.studentId' },
        ],
      },
    },
  };

  type CourseEvent =
    | Event<'CourseDefined', { courseId: string; capacity: number }>
    | Event<'CourseCapacityChanged', { courseId: string; newCapacity: number }>
    | Event<'StudentSubscribedToCourse', { studentId: string; courseId: string }>;

  // ── Projections (Decision Models) ─────────────────────────────

  interface CourseExistsState { exists: boolean }
  interface CourseCapacityState { capacity: number }

  function projectFromEvents(events: StoredEvent<CourseEvent>[], courseId: string) {
    let exists = false;
    let capacity = 0;
    let subscriptionCount = 0;
    const subscribedStudents = new Set<string>();

    for (const e of events) {
      switch (e.type) {
        case 'CourseDefined':
          if (e.data.courseId === courseId) {
            exists = true;
            capacity = e.data.capacity;
          }
          break;
        case 'CourseCapacityChanged':
          if (e.data.courseId === courseId) {
            capacity = e.data.newCapacity;
          }
          break;
        case 'StudentSubscribedToCourse':
          if (e.data.courseId === courseId) {
            subscriptionCount++;
            subscribedStudents.add(e.data.studentId);
          }
          break;
      }
    }
    return { exists, capacity, subscriptionCount, subscribedStudents };
  }

  function countStudentSubscriptions(events: StoredEvent<CourseEvent>[], studentId: string): number {
    return events.filter(
      e => e.type === 'StudentSubscribedToCourse' && e.data.studentId === studentId
    ).length;
  }

  // ── Command Handlers (use store directly) ─────────────────────

  async function defineCourse(
    store: EventStore,
    cmd: { courseId: string; capacity: number },
  ) {
    const result = await store.query<CourseEvent>()
      .matchKeys({ course: cmd.courseId })
      .read();

    const state = projectFromEvents(result.events, cmd.courseId);
    if (state.exists) {
      throw new Error(`Course with id "${cmd.courseId}" already exists`);
    }

    const appendResult = await store.append<CourseEvent>(
      [{ type: 'CourseDefined', data: { courseId: cmd.courseId, capacity: cmd.capacity } }],
      result.appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Conflict');
    return appendResult;
  }

  async function changeCourseCapacity(
    store: EventStore,
    cmd: { courseId: string; newCapacity: number },
  ) {
    const result = await store.query<CourseEvent>()
      .matchKeys({ course: cmd.courseId })
      .read();

    const state = projectFromEvents(result.events, cmd.courseId);
    if (!state.exists) {
      throw new Error(`Course "${cmd.courseId}" does not exist`);
    }
    if (state.capacity === cmd.newCapacity) {
      throw new Error(`New capacity ${cmd.newCapacity} is the same as the current capacity`);
    }

    const appendResult = await store.append<CourseEvent>(
      [{ type: 'CourseCapacityChanged', data: { courseId: cmd.courseId, newCapacity: cmd.newCapacity } }],
      result.appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Conflict');
    return appendResult;
  }

  async function subscribeStudentToCourse(
    store: EventStore,
    cmd: { studentId: string; courseId: string },
  ) {
    // Read course-level events (capacity, subscriptions for the course)
    const courseResult = await store.query<CourseEvent>()
      .matchKeys({ course: cmd.courseId })
      .read();

    // Read student-level events (how many courses this student is subscribed to)
    const studentResult = await store.query<CourseEvent>()
      .matchKeys({ student: cmd.studentId })
      .read();

    const courseState = projectFromEvents(courseResult.events, cmd.courseId);

    if (!courseState.exists) {
      throw new Error(`Course "${cmd.courseId}" does not exist`);
    }
    if (courseState.subscriptionCount >= courseState.capacity) {
      throw new Error(`Course "${cmd.courseId}" is already fully booked`);
    }

    // Check duplicate: student + course AND-key check
    const alreadySubscribed = courseState.subscribedStudents.has(cmd.studentId);
    if (alreadySubscribed) {
      throw new Error('Student already subscribed to this course');
    }

    const studentSubCount = countStudentSubscriptions(studentResult.events, cmd.studentId);
    if (studentSubCount >= 5) {
      throw new Error('Student already subscribed to 5 courses');
    }

    // Combine both appendConditions: use the wider set of conditions
    // (course-level AND student-level queries should both pass)
    const appendCondition = {
      failIfEventsMatch: [
        ...courseResult.appendCondition.failIfEventsMatch,
        ...studentResult.appendCondition.failIfEventsMatch,
      ],
      after: courseResult.appendCondition.after! > studentResult.appendCondition.after!
        ? courseResult.appendCondition.after
        : studentResult.appendCondition.after,
    };

    const appendResult = await store.append<CourseEvent>(
      [{ type: 'StudentSubscribedToCourse', data: { studentId: cmd.studentId, courseId: cmd.courseId } }],
      appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Conflict');
    return appendResult;
  }

  let store: EventStore;
  beforeEach(() => {
    store = new EventStore({ storage: new InMemoryStorage(), consistency: config });
  });

  // ── defineCourse ──────────────────────────────────────────────

  it('defines a course with a new id', async () => {
    await defineCourse(store, { courseId: 'c1', capacity: 15 });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('CourseDefined');
    expect(events[0].data).toEqual({ courseId: 'c1', capacity: 15 });
  });

  it('rejects defining a course with existing id', async () => {
    await store.append([{ type: 'CourseDefined', data: { courseId: 'c1', capacity: 10 } }], null);
    await expect(defineCourse(store, { courseId: 'c1', capacity: 15 }))
      .rejects.toThrow('Course with id "c1" already exists');
  });

  // ── changeCourseCapacity ──────────────────────────────────────

  it('changes capacity of an existing course', async () => {
    await store.append([{ type: 'CourseDefined', data: { courseId: 'c1', capacity: 12 } }], null);
    await changeCourseCapacity(store, { courseId: 'c1', newCapacity: 15 });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(2);
    expect(events[1].data).toEqual({ courseId: 'c1', newCapacity: 15 });
  });

  it('rejects changing capacity of non-existing course', async () => {
    await expect(changeCourseCapacity(store, { courseId: 'c0', newCapacity: 15 }))
      .rejects.toThrow('Course "c0" does not exist');
  });

  it('rejects changing capacity to the same value', async () => {
    await store.append([{ type: 'CourseDefined', data: { courseId: 'c1', capacity: 12 } }], null);
    await expect(changeCourseCapacity(store, { courseId: 'c1', newCapacity: 12 }))
      .rejects.toThrow('New capacity 12 is the same as the current capacity');
  });

  // ── subscribeStudentToCourse ──────────────────────────────────

  it('subscribes student to course with capacity', async () => {
    await store.append([{ type: 'CourseDefined', data: { courseId: 'c1', capacity: 10 } }], null);
    await subscribeStudentToCourse(store, { studentId: 's1', courseId: 'c1' });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('StudentSubscribedToCourse');
    expect(events[1].data).toEqual({ studentId: 's1', courseId: 'c1' });
  });

  it('rejects subscribing to a non-existing course', async () => {
    await expect(subscribeStudentToCourse(store, { studentId: 's1', courseId: 'c0' }))
      .rejects.toThrow('Course "c0" does not exist');
  });

  it('rejects subscribing to a fully booked course', async () => {
    await store.append([
      { type: 'CourseDefined', data: { courseId: 'c1', capacity: 3 } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's1', courseId: 'c1' } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's2', courseId: 'c1' } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's3', courseId: 'c1' } },
    ], null);
    await expect(subscribeStudentToCourse(store, { studentId: 's4', courseId: 'c1' }))
      .rejects.toThrow('Course "c1" is already fully booked');
  });

  it('rejects subscribing the same student twice to the same course', async () => {
    await store.append([
      { type: 'CourseDefined', data: { courseId: 'c1', capacity: 10 } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's1', courseId: 'c1' } },
    ], null);
    await expect(subscribeStudentToCourse(store, { studentId: 's1', courseId: 'c1' }))
      .rejects.toThrow('Student already subscribed to this course');
  });

  it('rejects subscribing student to more than 5 courses', async () => {
    await store.append([
      { type: 'CourseDefined', data: { courseId: 'c6', capacity: 10 } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's1', courseId: 'c1' } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's1', courseId: 'c2' } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's1', courseId: 'c3' } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's1', courseId: 'c4' } },
      { type: 'StudentSubscribedToCourse', data: { studentId: 's1', courseId: 'c5' } },
    ], null);
    await expect(subscribeStudentToCourse(store, { studentId: 's1', courseId: 'c6' }))
      .rejects.toThrow('Student already subscribed to 5 courses');
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. Unique Username
// ════════════════════════════════════════════════════════════════════

describe('DCB Example 2: Unique Username', () => {
  // DCB spec: UsernameChanged has two 'username' tags (old + new value).
  // BoundlessDB supports this — same key name with multiple paths.
  const config: ConsistencyConfig = {
    eventTypes: {
      AccountRegistered: {
        keys: [{ name: 'username', path: 'data.username' }],
      },
      AccountClosed: {
        keys: [{ name: 'username', path: 'data.username' }],
      },
      UsernameChanged: {
        keys: [
          { name: 'username', path: 'data.oldUsername' },
          { name: 'username', path: 'data.newUsername' },
        ],
      },
    },
  };

  type UsernameEvent =
    | Event<'AccountRegistered', { username: string }>
    | Event<'AccountClosed', { username: string }>
    | Event<'UsernameChanged', { oldUsername: string; newUsername: string }>;

  function isUsernameClaimed(events: StoredEvent<UsernameEvent>[], username: string): boolean {
    let claimed = false;
    for (const e of events) {
      switch (e.type) {
        case 'AccountRegistered':
          claimed = true;
          break;
        case 'AccountClosed':
          // Username freed on close
          claimed = false;
          break;
        case 'UsernameChanged':
          if (e.data.newUsername === username) {
            claimed = true;
          } else if (e.data.oldUsername === username) {
            // Old username freed
            claimed = false;
          }
          break;
      }
    }
    return claimed;
  }

  async function registerAccount(
    store: EventStore,
    cmd: { username: string },
  ) {
    // Single key query — finds all events tagged with this username
    const result = await store.query<UsernameEvent>()
      .matchKeys({ username: cmd.username })
      .read();

    if (isUsernameClaimed(result.events, cmd.username)) {
      throw new Error(`Username "${cmd.username}" is claimed`);
    }

    const appendResult = await store.append<UsernameEvent>(
      [{ type: 'AccountRegistered', data: { username: cmd.username } }],
      result.appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Conflict');
    return appendResult;
  }

  let store: EventStore;
  beforeEach(() => {
    store = new EventStore({ storage: new InMemoryStorage(), consistency: config });
  });

  it('registers an account with unused username', async () => {
    await registerAccount(store, { username: 'u1' });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('AccountRegistered');
    expect(events[0].data).toEqual({ username: 'u1' });
  });

  it('rejects registering with claimed username', async () => {
    await store.append<UsernameEvent>(
      [{ type: 'AccountRegistered', data: { username: 'u1' } }],
      null,
    );
    await expect(registerAccount(store, { username: 'u1' }))
      .rejects.toThrow('Username "u1" is claimed');
  });

  it('allows registering with username of closed account', async () => {
    await store.append<UsernameEvent>([
      { type: 'AccountRegistered', data: { username: 'u1' } },
      { type: 'AccountClosed', data: { username: 'u1' } },
    ], null);
    await registerAccount(store, { username: 'u1' });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(3);
    expect(events[2].type).toBe('AccountRegistered');
  });

  it('allows registering with username that was previously changed away', async () => {
    await store.append<UsernameEvent>([
      { type: 'AccountRegistered', data: { username: 'u1' } },
      { type: 'UsernameChanged', data: { oldUsername: 'u1', newUsername: 'u1changed' } },
    ], null);
    // u1 is now free, u1changed is taken
    await registerAccount(store, { username: 'u1' });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(3);
  });

  it('rejects registering with username that was changed TO', async () => {
    await store.append<UsernameEvent>([
      { type: 'AccountRegistered', data: { username: 'u1' } },
      { type: 'UsernameChanged', data: { oldUsername: 'u1', newUsername: 'u1changed' } },
    ], null);
    await expect(registerAccount(store, { username: 'u1changed' }))
      .rejects.toThrow('Username "u1changed" is claimed');
  });

  it('detects concurrency conflict when two users claim same username', async () => {
    // Alice reads — username is free
    const aliceRead = await store.query<UsernameEvent>()
      .matchKeys({ username: 'john' })
      .read();

    // Bob reads — username is free too
    const bobRead = await store.query<UsernameEvent>()
      .matchKeys({ username: 'john' })
      .read();

    // Alice registers first
    const aliceResult = await store.append<UsernameEvent>(
      [{ type: 'AccountRegistered', data: { username: 'john' } }],
      aliceRead.appendCondition,
    );
    expect(isConflict(aliceResult)).toBe(false);

    // Bob tries with stale condition → conflict
    const bobResult = await store.append<UsernameEvent>(
      [{ type: 'AccountRegistered', data: { username: 'john' } }],
      bobRead.appendCondition,
    );
    expect(isConflict(bobResult)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. Invoice Number (Consecutive Sequence)
// ════════════════════════════════════════════════════════════════════

describe('DCB Example 3: Invoice Number (Consecutive Sequence)', () => {
  const config: ConsistencyConfig = {
    eventTypes: {
      InvoiceCreated: {
        keys: [{ name: 'invoice', path: 'data.invoiceNumber' }],
      },
    },
  };

  type InvoiceEvent = Event<'InvoiceCreated', { invoiceNumber: number; invoiceData: Record<string, unknown> }>;

  function nextInvoiceNumber(events: StoredEvent<InvoiceEvent>[]): number {
    let next = 1;
    for (const e of events) {
      if (e.type === 'InvoiceCreated') {
        next = (e.data.invoiceNumber as number) + 1;
      }
    }
    return next;
  }

  async function createInvoice(
    store: EventStore,
    cmd: { invoiceData: Record<string, unknown> },
  ) {
    const result = await store.query<InvoiceEvent>()
      .matchType('InvoiceCreated')
      .read();

    const number = nextInvoiceNumber(result.events);

    const appendResult = await store.append<InvoiceEvent>(
      [{ type: 'InvoiceCreated', data: { invoiceNumber: number, invoiceData: cmd.invoiceData } }],
      result.appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Conflict — retry to get next number');
    return { event: { type: 'InvoiceCreated', data: { invoiceNumber: number, invoiceData: cmd.invoiceData } }, result: appendResult };
  }

  let store: EventStore;
  beforeEach(() => {
    store = new EventStore({ storage: new InMemoryStorage(), consistency: config });
  });

  it('creates first invoice with number 1', async () => {
    const { event } = await createInvoice(store, { invoiceData: { foo: 'bar' } });
    expect(event.data.invoiceNumber).toBe(1);
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ invoiceNumber: 1, invoiceData: { foo: 'bar' } });
  });

  it('creates second invoice with number 2', async () => {
    await store.append<InvoiceEvent>(
      [{ type: 'InvoiceCreated', data: { invoiceNumber: 1, invoiceData: { foo: 'bar' } } }],
      null,
    );
    const { event } = await createInvoice(store, { invoiceData: { bar: 'baz' } });
    expect(event.data.invoiceNumber).toBe(2);
  });

  it('creates consecutive sequence 1-2-3', async () => {
    await createInvoice(store, { invoiceData: { a: 1 } });
    await createInvoice(store, { invoiceData: { b: 2 } });
    await createInvoice(store, { invoiceData: { c: 3 } });
    const events = (await store.all().read()).events;
    expect(events.map(e => (e.data as any).invoiceNumber)).toEqual([1, 2, 3]);
  });

  it('detects concurrency conflict preventing duplicate numbers', async () => {
    // Two concurrent readers both see next = 1
    const readA = await store.query<InvoiceEvent>()
      .matchType('InvoiceCreated')
      .read();
    const readB = await store.query<InvoiceEvent>()
      .matchType('InvoiceCreated')
      .read();

    // First succeeds
    const resultA = await store.append<InvoiceEvent>(
      [{ type: 'InvoiceCreated', data: { invoiceNumber: 1, invoiceData: { from: 'A' } } }],
      readA.appendCondition,
    );
    expect(isConflict(resultA)).toBe(false);

    // Second conflicts
    const resultB = await store.append<InvoiceEvent>(
      [{ type: 'InvoiceCreated', data: { invoiceNumber: 1, invoiceData: { from: 'B' } } }],
      readB.appendCondition,
    );
    expect(isConflict(resultB)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. Opt-In Token
// ════════════════════════════════════════════════════════════════════

describe('DCB Example 4: Opt-In Token', () => {
  const config: ConsistencyConfig = {
    eventTypes: {
      SignUpInitiated: {
        keys: [
          { name: 'email', path: 'data.emailAddress' },
          { name: 'otp', path: 'data.otp' },
        ],
      },
      SignUpConfirmed: {
        keys: [
          { name: 'email', path: 'data.emailAddress' },
          { name: 'otp', path: 'data.otp' },
        ],
      },
    },
  };

  type OptInEvent =
    | Event<'SignUpInitiated', { emailAddress: string; otp: string; name: string }>
    | Event<'SignUpConfirmed', { emailAddress: string; otp: string; name: string }>;

  interface PendingSignUp {
    name: string;
    otpUsed: boolean;
  }

  function projectPendingSignUp(
    events: StoredEvent<OptInEvent>[],
  ): PendingSignUp | null {
    let state: PendingSignUp | null = null;
    for (const e of events) {
      switch (e.type) {
        case 'SignUpInitiated':
          state = { name: e.data.name, otpUsed: false };
          break;
        case 'SignUpConfirmed':
          if (state) state.otpUsed = true;
          break;
      }
    }
    return state;
  }

  async function confirmSignUp(
    store: EventStore,
    cmd: { emailAddress: string; otp: string },
  ) {
    // AND-query: email AND otp must both match
    const result = await store.query<OptInEvent>()
      .matchKeys({ email: cmd.emailAddress, otp: cmd.otp })
      .read();

    const pending = projectPendingSignUp(result.events);

    if (!pending) {
      throw new Error('No pending sign-up for this OTP / email address');
    }
    if (pending.otpUsed) {
      throw new Error('OTP was already used');
    }

    const appendResult = await store.append<OptInEvent>(
      [{ type: 'SignUpConfirmed', data: { emailAddress: cmd.emailAddress, otp: cmd.otp, name: pending.name } }],
      result.appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Conflict');
    return appendResult;
  }

  let store: EventStore;
  beforeEach(() => {
    store = new EventStore({ storage: new InMemoryStorage(), consistency: config });
  });

  it('confirms sign-up for valid OTP', async () => {
    await store.append<OptInEvent>([
      { type: 'SignUpInitiated', data: { emailAddress: 'john@example.com', otp: '444444', name: 'John Doe' } },
    ], null);
    await confirmSignUp(store, { emailAddress: 'john@example.com', otp: '444444' });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('SignUpConfirmed');
    expect(events[1].data).toEqual({ emailAddress: 'john@example.com', otp: '444444', name: 'John Doe' });
  });

  it('rejects confirming with non-existing OTP', async () => {
    await expect(confirmSignUp(store, { emailAddress: 'john@example.com', otp: '000000' }))
      .rejects.toThrow('No pending sign-up for this OTP / email address');
  });

  it('rejects confirming OTP assigned to different email', async () => {
    await store.append<OptInEvent>([
      { type: 'SignUpInitiated', data: { emailAddress: 'john@example.com', otp: '111111', name: 'John' } },
    ], null);
    // Same OTP but different email → AND-query returns nothing
    await expect(confirmSignUp(store, { emailAddress: 'jane@example.com', otp: '111111' }))
      .rejects.toThrow('No pending sign-up for this OTP / email address');
  });

  it('rejects confirming already used OTP', async () => {
    await store.append<OptInEvent>([
      { type: 'SignUpInitiated', data: { emailAddress: 'john@example.com', otp: '222222', name: 'John' } },
      { type: 'SignUpConfirmed', data: { emailAddress: 'john@example.com', otp: '222222', name: 'John' } },
    ], null);
    await expect(confirmSignUp(store, { emailAddress: 'john@example.com', otp: '222222' }))
      .rejects.toThrow('OTP was already used');
  });

  it('concurrent OTP confirmation causes conflict', async () => {
    await store.append<OptInEvent>([
      { type: 'SignUpInitiated', data: { emailAddress: 'john@example.com', otp: '555555', name: 'John' } },
    ], null);

    // Two concurrent reads
    const readA = await store.query<OptInEvent>()
      .matchKeys({ email: 'john@example.com', otp: '555555' })
      .read();
    const readB = await store.query<OptInEvent>()
      .matchKeys({ email: 'john@example.com', otp: '555555' })
      .read();

    // First confirmation succeeds
    const resultA = await store.append<OptInEvent>(
      [{ type: 'SignUpConfirmed', data: { emailAddress: 'john@example.com', otp: '555555', name: 'John' } }],
      readA.appendCondition,
    );
    expect(isConflict(resultA)).toBe(false);

    // Second confirmation conflicts
    const resultB = await store.append<OptInEvent>(
      [{ type: 'SignUpConfirmed', data: { emailAddress: 'john@example.com', otp: '555555', name: 'John' } }],
      readB.appendCondition,
    );
    expect(isConflict(resultB)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. Dynamic Product Price
// ════════════════════════════════════════════════════════════════════

describe('DCB Example 5: Dynamic Product Price', () => {
  const config: ConsistencyConfig = {
    eventTypes: {
      ProductDefined: {
        keys: [{ name: 'product', path: 'data.productId' }],
      },
      ProductOrdered: {
        keys: [{ name: 'product', path: 'data.productId' }],
      },
    },
  };

  type ProductEvent =
    | Event<'ProductDefined', { productId: string; price: number }>
    | Event<'ProductOrdered', { productId: string; price: number }>;

  function projectProductPrice(events: StoredEvent<ProductEvent>[], productId: string): number {
    let price = 0;
    for (const e of events) {
      if (e.type === 'ProductDefined' && e.data.productId === productId) {
        price = e.data.price;
      }
    }
    return price;
  }

  async function orderProduct(
    store: EventStore,
    cmd: { productId: string; displayedPrice: number },
  ) {
    const result = await store.query<ProductEvent>()
      .matchKeys({ product: cmd.productId })
      .read();

    const currentPrice = projectProductPrice(result.events, cmd.productId);
    if (currentPrice !== cmd.displayedPrice) {
      throw new Error(`invalid price for product "${cmd.productId}"`);
    }

    const appendResult = await store.append<ProductEvent>(
      [{ type: 'ProductOrdered', data: { productId: cmd.productId, price: cmd.displayedPrice } }],
      result.appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Price changed during order — conflict');
    return appendResult;
  }

  let store: EventStore;
  beforeEach(() => {
    store = new EventStore({ storage: new InMemoryStorage(), consistency: config });
  });

  it('orders product with valid displayed price', async () => {
    await store.append<ProductEvent>(
      [{ type: 'ProductDefined', data: { productId: 'p1', price: 123 } }],
      null,
    );
    await orderProduct(store, { productId: 'p1', displayedPrice: 123 });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('ProductOrdered');
    expect(events[1].data).toEqual({ productId: 'p1', price: 123 });
  });

  it('rejects order with invalid displayed price', async () => {
    await store.append<ProductEvent>(
      [{ type: 'ProductDefined', data: { productId: 'p1', price: 123 } }],
      null,
    );
    await expect(orderProduct(store, { productId: 'p1', displayedPrice: 100 }))
      .rejects.toThrow('invalid price for product "p1"');
  });

  it('rejects order when product does not exist (price = 0)', async () => {
    await expect(orderProduct(store, { productId: 'p99', displayedPrice: 50 }))
      .rejects.toThrow('invalid price for product "p99"');
  });

  it('detects conflict when price changed between read and write', async () => {
    await store.append<ProductEvent>(
      [{ type: 'ProductDefined', data: { productId: 'p1', price: 100 } }],
      null,
    );

    // Customer reads: price = 100
    const customerRead = await store.query<ProductEvent>()
      .matchKeys({ product: 'p1' })
      .read();

    // Admin changes price to 150 (between customer's read and write)
    await store.append<ProductEvent>(
      [{ type: 'ProductDefined', data: { productId: 'p1', price: 150 } }],
      null,
    );

    // Customer tries to order at price 100 → conflict!
    const orderResult = await store.append<ProductEvent>(
      [{ type: 'ProductOrdered', data: { productId: 'p1', price: 100 } }],
      customerRead.appendCondition,
    );
    expect(isConflict(orderResult)).toBe(true);
  });

  it('no conflict when different products change', async () => {
    await store.append<ProductEvent>([
      { type: 'ProductDefined', data: { productId: 'p1', price: 100 } },
      { type: 'ProductDefined', data: { productId: 'p2', price: 200 } },
    ], null);

    // Customer reads p1
    const readP1 = await store.query<ProductEvent>()
      .matchKeys({ product: 'p1' })
      .read();

    // Admin changes p2's price
    await store.append<ProductEvent>(
      [{ type: 'ProductDefined', data: { productId: 'p2', price: 250 } }],
      null,
    );

    // Order p1 → no conflict (p2 change doesn't affect p1's boundary)
    const result = await store.append<ProductEvent>(
      [{ type: 'ProductOrdered', data: { productId: 'p1', price: 100 } }],
      readP1.appendCondition,
    );
    expect(isConflict(result)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. Prevent Record Duplication (Idempotency)
// ════════════════════════════════════════════════════════════════════

describe('DCB Example 6: Prevent Record Duplication (Idempotency)', () => {
  const config: ConsistencyConfig = {
    eventTypes: {
      OrderPlaced: {
        keys: [
          { name: 'order', path: 'data.orderId' },
          { name: 'idempotency', path: 'data.idempotencyToken' },
        ],
      },
    },
  };

  type OrderEvent = Event<'OrderPlaced', { orderId: string; idempotencyToken: string }>;

  function wasTokenUsed(events: StoredEvent<OrderEvent>[]): boolean {
    return events.some(e => e.type === 'OrderPlaced');
  }

  async function placeOrder(
    store: EventStore,
    cmd: { orderId: string; idempotencyToken: string },
  ) {
    // Query by idempotency token to check for re-submission
    const result = await store.query<OrderEvent>()
      .matchKeys({ idempotency: cmd.idempotencyToken })
      .read();

    if (wasTokenUsed(result.events)) {
      throw new Error('Re-submission');
    }

    const appendResult = await store.append<OrderEvent>(
      [{ type: 'OrderPlaced', data: { orderId: cmd.orderId, idempotencyToken: cmd.idempotencyToken } }],
      result.appendCondition,
    );
    if (isConflict(appendResult)) throw new Error('Conflict');
    return appendResult;
  }

  let store: EventStore;
  beforeEach(() => {
    store = new EventStore({ storage: new InMemoryStorage(), consistency: config });
  });

  it('places order with new idempotency token', async () => {
    await store.append<OrderEvent>(
      [{ type: 'OrderPlaced', data: { orderId: 'o12345', idempotencyToken: '11111' } }],
      null,
    );
    await placeOrder(store, { orderId: 'o54321', idempotencyToken: '22222' });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(2);
    expect(events[1].data).toEqual({ orderId: 'o54321', idempotencyToken: '22222' });
  });

  it('rejects order with previously used idempotency token', async () => {
    await store.append<OrderEvent>(
      [{ type: 'OrderPlaced', data: { orderId: 'o12345', idempotencyToken: '11111' } }],
      null,
    );
    await expect(placeOrder(store, { orderId: 'o54321', idempotencyToken: '11111' }))
      .rejects.toThrow('Re-submission');
  });

  it('first order without prior events succeeds', async () => {
    await placeOrder(store, { orderId: 'o1', idempotencyToken: 'token-a' });
    const events = (await store.all().read()).events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('OrderPlaced');
  });

  it('detects concurrency conflict on double submission', async () => {
    // Two concurrent submissions with same token
    const readA = await store.query<OrderEvent>()
      .matchKeys({ idempotency: 'same-token' })
      .read();
    const readB = await store.query<OrderEvent>()
      .matchKeys({ idempotency: 'same-token' })
      .read();

    // First succeeds
    const resultA = await store.append<OrderEvent>(
      [{ type: 'OrderPlaced', data: { orderId: 'o1', idempotencyToken: 'same-token' } }],
      readA.appendCondition,
    );
    expect(isConflict(resultA)).toBe(false);

    // Second conflicts
    const resultB = await store.append<OrderEvent>(
      [{ type: 'OrderPlaced', data: { orderId: 'o2', idempotencyToken: 'same-token' } }],
      readB.appendCondition,
    );
    expect(isConflict(resultB)).toBe(true);
  });

  it('different idempotency tokens do not conflict', async () => {
    const readA = await store.query<OrderEvent>()
      .matchKeys({ idempotency: 'token-1' })
      .read();
    const readB = await store.query<OrderEvent>()
      .matchKeys({ idempotency: 'token-2' })
      .read();

    // Both succeed (different tokens = different boundaries)
    const resultA = await store.append<OrderEvent>(
      [{ type: 'OrderPlaced', data: { orderId: 'o1', idempotencyToken: 'token-1' } }],
      readA.appendCondition,
    );
    expect(isConflict(resultA)).toBe(false);

    const resultB = await store.append<OrderEvent>(
      [{ type: 'OrderPlaced', data: { orderId: 'o2', idempotencyToken: 'token-2' } }],
      readB.appendCondition,
    );
    expect(isConflict(resultB)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// mergeConditions() utility
// ════════════════════════════════════════════════════════════════════

describe('mergeConditions', () => {

  it('merges two conditions', () => {
    const a: AppendCondition = {
      failIfEventsMatch: [{ type: 'A' }],
      after: 10n,
    };
    const b: AppendCondition = {
      failIfEventsMatch: [{ type: 'B', key: 'x', value: 'y' }],
      after: 20n,
    };

    const merged = mergeConditions(a, b);
    expect(merged.failIfEventsMatch).toHaveLength(2);
    expect(merged.failIfEventsMatch[0]).toEqual({ type: 'A' });
    expect(merged.failIfEventsMatch[1]).toEqual({ type: 'B', key: 'x', value: 'y' });
    expect(merged.after).toBe(20n);
  });

  it('takes max position', () => {
    const a: AppendCondition = { failIfEventsMatch: [], after: 100n };
    const b: AppendCondition = { failIfEventsMatch: [], after: 50n };
    const c: AppendCondition = { failIfEventsMatch: [], after: 200n };

    expect(mergeConditions(a, b, c).after).toBe(200n);
  });

  it('handles undefined after', () => {
    const a: AppendCondition = { failIfEventsMatch: [{ type: 'A' }] };
    const b: AppendCondition = { failIfEventsMatch: [{ type: 'B' }], after: 10n };

    const merged = mergeConditions(a, b);
    expect(merged.after).toBe(10n);
  });

  it('returns undefined after when all are undefined', () => {
    const a: AppendCondition = { failIfEventsMatch: [{ type: 'A' }] };
    const b: AppendCondition = { failIfEventsMatch: [] };

    const merged = mergeConditions(a, b);
    expect(merged.after).toBeUndefined();
  });

  it('returns empty for no arguments', () => {
    const merged = mergeConditions();
    expect(merged.failIfEventsMatch).toHaveLength(0);
    expect(merged.after).toBeUndefined();
  });

  it('.mergeWith() fluent API', () => {
    const a = createAppendCondition([{ type: 'A' }], 10n);
    const b = createAppendCondition([{ type: 'B' }], 20n);

    const merged = a.mergeWith(b);
    expect(merged.failIfEventsMatch).toHaveLength(2);
    expect(merged.after).toBe(20n);
    expect(typeof merged.mergeWith).toBe('function');
  });

  it('.mergeWith() chains', () => {
    const a = createAppendCondition([{ type: 'A' }], 5n);
    const b = createAppendCondition([{ type: 'B' }], 10n);
    const c = createAppendCondition([{ type: 'C' }], 15n);

    const merged = a.mergeWith(b).mergeWith(c);
    expect(merged.failIfEventsMatch).toHaveLength(3);
    expect(merged.after).toBe(15n);
  });

  it('variadic with three conditions', () => {
    const a: AppendCondition = { failIfEventsMatch: [{ type: 'A' }], after: 5n };
    const b: AppendCondition = { failIfEventsMatch: [{ type: 'B' }], after: 15n };
    const c: AppendCondition = { failIfEventsMatch: [{ type: 'C' }], after: 10n };

    const merged = mergeConditions(a, b, c);
    expect(merged.failIfEventsMatch).toHaveLength(3);
    expect(merged.after).toBe(15n);
  });
});

// ════════════════════════════════════════════════════════════════════
// Integration: mergeConditions with real EventStore
// ════════════════════════════════════════════════════════════════════

describe('mergeConditions — integration with EventStore', () => {
  const config: ConsistencyConfig = {
    eventTypes: {
      CartCreated: { keys: [{ name: 'cart', path: 'data.cartId' }] },
      ItemAdded: { keys: [{ name: 'cart', path: 'data.cartId' }, { name: 'product', path: 'data.productId' }] },
      CartSubmitted: { keys: [{ name: 'cart', path: 'data.cartId' }] },
      InventoryChanged: { keys: [{ name: 'product', path: 'data.productId' }] },
    },
  };

  it('protects both cart and inventory boundaries in one append', async () => {
    const store = new EventStore({ storage: new InMemoryStorage(), consistency: config });

    // Seed: cart with one item + inventory
    await store.append([
      { type: 'CartCreated', data: { cartId: 'c1' } },
      { type: 'ItemAdded', data: { cartId: 'c1', productId: 'p1' } },
      { type: 'InventoryChanged', data: { productId: 'p1', inventory: 5 } },
    ], null);

    // Read both boundaries
    const cartResult = await store.query().matchKeys({ cart: 'c1' }).read();
    const inventoryResult = await store.query().matchType('InventoryChanged').read();
    const merged = mergeConditions(cartResult.appendCondition, inventoryResult.appendCondition);

    // Someone else changes inventory while we decide
    await store.append([
      { type: 'InventoryChanged', data: { productId: 'p1', inventory: 0 } },
    ], null);

    // Our append should detect the inventory conflict
    const result = await store.append([
      { type: 'CartSubmitted', data: { cartId: 'c1' } },
      { type: 'InventoryChanged', data: { productId: 'p1', inventory: 4 } },
    ], merged);

    expect(isConflict(result)).toBe(true);
  });

  it('succeeds when no conflict on either boundary', async () => {
    const store = new EventStore({ storage: new InMemoryStorage(), consistency: config });

    await store.append([
      { type: 'CartCreated', data: { cartId: 'c1' } },
      { type: 'ItemAdded', data: { cartId: 'c1', productId: 'p1' } },
      { type: 'InventoryChanged', data: { productId: 'p1', inventory: 5 } },
    ], null);

    const cartResult = await store.query().matchKeys({ cart: 'c1' }).read();
    const inventoryResult = await store.query().matchType('InventoryChanged').read();
    const merged = mergeConditions(cartResult.appendCondition, inventoryResult.appendCondition);

    // No one else does anything — append should succeed
    const result = await store.append([
      { type: 'CartSubmitted', data: { cartId: 'c1' } },
      { type: 'InventoryChanged', data: { productId: 'p1', inventory: 4 } },
    ], merged);

    expect(isConflict(result)).toBe(false);
  });
});
