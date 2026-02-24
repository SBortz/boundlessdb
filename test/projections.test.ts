/**
 * Tests for Projection System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EventStore,
  InMemoryStorage,
  InProcessNotifier,
  ProjectionRunner,
  type ConsistencyConfig,
  type ProjectionHandler,
} from '../src/index.js';

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

type CourseState = {
  courses: Record<string, { name: string; studentCount: number }>;
};

type StudentState = {
  subscriptions: string[];
};

describe('Projection System', () => {
  let store: EventStore;
  let notifier: InProcessNotifier;
  let runner: ProjectionRunner;

  beforeEach(() => {
    const storage = new InMemoryStorage();
    notifier = new InProcessNotifier();
    store = new EventStore({
      storage,
      consistency: TEST_CONFIG,
    });
  });

  afterEach(() => {
    if (runner?.isRunning()) {
      runner.stop();
    }
  });

  describe('InProcessNotifier', () => {
    it('notifies callbacks when notify() is called', async () => {
      const positions: bigint[] = [];
      
      notifier.onNewEvents((pos) => {
        positions.push(pos);
      });

      notifier.notify(1n);
      notifier.notify(2n);
      notifier.notify(3n);

      expect(positions).toEqual([1n, 2n, 3n]);
    });

    it('supports multiple callbacks', async () => {
      const positions1: bigint[] = [];
      const positions2: bigint[] = [];
      
      notifier.onNewEvents((pos) => positions1.push(pos));
      notifier.onNewEvents((pos) => positions2.push(pos));

      notifier.notify(42n);

      expect(positions1).toEqual([42n]);
      expect(positions2).toEqual([42n]);
    });

    it('clears callbacks on close', async () => {
      const positions: bigint[] = [];
      
      notifier.onNewEvents((pos) => positions.push(pos));
      notifier.notify(1n);
      
      notifier.close();
      notifier.notify(2n);

      expect(positions).toEqual([1n]);
    });

    it('handles callback errors gracefully', async () => {
      const positions: bigint[] = [];
      
      notifier.onNewEvents(() => {
        throw new Error('Test error');
      });
      notifier.onNewEvents((pos) => positions.push(pos));

      notifier.notify(1n);

      // Second callback should still be called
      expect(positions).toEqual([1n]);
    });
  });

  describe('ProjectionRunner - Catchup', () => {
    it('builds state from existing events', async () => {
      // Append events before starting projection
      await store.append(
        [
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro to CS' } },
          { type: 'CourseCreated', data: { courseId: 'cs102', name: 'Advanced CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
        ],
        null
      );

      // Define projection
      const courseProjection: ProjectionHandler<CourseState> = {
        init: { courses: {} },
        when: {
          CourseCreated: (state, event) => {
            const { courseId, name } = event.data as { courseId: string; name: string };
            return {
              courses: {
                ...state.courses,
                [courseId]: { name, studentCount: 0 },
              },
            };
          },
          StudentSubscribed: (state, event) => {
            const { courseId } = event.data as { courseId: string; studentId: string };
            const course = state.courses[courseId];
            if (!course) return state;
            return {
              courses: {
                ...state.courses,
                [courseId]: { ...course, studentCount: course.studentCount + 1 },
              },
            };
          },
        },
      };

      // Start projection
      runner = new ProjectionRunner(store, notifier, {
        courseStats: courseProjection,
      });
      await runner.start();

      // Check state
      const state = runner.getState<CourseState>('courseStats');
      expect(state.state.courses).toEqual({
        cs101: { name: 'Intro to CS', studentCount: 2 },
        cs102: { name: 'Advanced CS', studentCount: 0 },
      });
      expect(state.lastPosition).toBe(4n);
    });

    it('processes only events matching query conditions', async () => {
      await store.append(
        [
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro to CS' } },
          { type: 'CourseCreated', data: { courseId: 'cs102', name: 'Advanced CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ],
        null
      );

      // Projection that only cares about CourseCreated
      const projection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
        query: [{ type: 'CourseCreated' }],
      };

      runner = new ProjectionRunner(store, notifier, { courseCount: projection });
      await runner.start();

      const state = runner.getState<{ count: number }>('courseCount');
      expect(state.state.count).toBe(2);
      expect(state.lastPosition).toBe(2n);
    });
  });

  describe('ProjectionRunner - Live Updates', () => {
    it('updates state when new events are appended', async () => {
      const projection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, { courseCount: projection });
      await runner.start();

      // Initial state
      let state = runner.getState<{ count: number }>('courseCount');
      expect(state.state.count).toBe(0);

      // Append events and notify
      const result = await store.append(
        [
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro to CS' } },
          { type: 'CourseCreated', data: { courseId: 'cs102', name: 'Advanced CS' } },
        ],
        null
      );
      notifier.notify(result.position);

      // Wait for projection to update
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check updated state
      state = runner.getState<{ count: number }>('courseCount');
      expect(state.state.count).toBe(2);
      expect(state.lastPosition).toBe(2n);
    });

    it('handles multiple live updates', async () => {
      const projection: ProjectionHandler<{ total: number }> = {
        init: { total: 0 },
        when: {
          StudentSubscribed: (state) => ({ total: state.total + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, { subscriptionCount: projection });
      await runner.start();

      // First batch
      let result = await store.append(
        [
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ],
        null
      );
      notifier.notify(result.position);
      await new Promise(resolve => setTimeout(resolve, 50));

      let state = runner.getState<{ total: number }>('subscriptionCount');
      expect(state.state.total).toBe(1);

      // Second batch
      result = await store.append(
        [
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs102', studentId: 'charlie' } },
        ],
        result.appendCondition
      );
      notifier.notify(result.position);
      await new Promise(resolve => setTimeout(resolve, 50));

      state = runner.getState<{ total: number }>('subscriptionCount');
      expect(state.state.total).toBe(3);
    });
  });

  describe('ProjectionRunner - Multiple Projections', () => {
    it('runs multiple projections simultaneously', async () => {
      await store.append(
        [
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro to CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'bob' } },
        ],
        null
      );

      const courseProjection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
      };

      const studentProjection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          StudentSubscribed: (state) => ({ count: state.count + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, {
        courses: courseProjection,
        students: studentProjection,
      });
      await runner.start();

      expect(runner.getState<{ count: number }>('courses').state.count).toBe(1);
      expect(runner.getState<{ count: number }>('students').state.count).toBe(2);
    });

    it('updates multiple projections on new events', async () => {
      const courseProjection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
      };

      const studentProjection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          StudentSubscribed: (state) => ({ count: state.count + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, {
        courses: courseProjection,
        students: studentProjection,
      });
      await runner.start();

      const result = await store.append(
        [
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro to CS' } },
          { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } },
        ],
        null
      );
      notifier.notify(result.position);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(runner.getState<{ count: number }>('courses').state.count).toBe(1);
      expect(runner.getState<{ count: number }>('students').state.count).toBe(1);
    });
  });

  describe('ProjectionRunner - Stop/Start', () => {
    it('can be stopped and restarted', async () => {
      const projection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, { courseCount: projection });
      await runner.start();
      expect(runner.isRunning()).toBe(true);

      runner.stop();
      expect(runner.isRunning()).toBe(false);

      // Events appended while stopped should not be processed
      const result = await store.append(
        [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro' } }],
        null
      );
      notifier.notify(result.position);
      await new Promise(resolve => setTimeout(resolve, 50));

      const state = runner.getState<{ count: number }>('courseCount');
      expect(state.state.count).toBe(0);
    });

    it('catches up on restart', async () => {
      const projection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, { courseCount: projection });
      await runner.start();
      runner.stop();

      // Append events while stopped
      await store.append(
        [
          { type: 'CourseCreated', data: { courseId: 'cs101', name: 'Course 1' } },
          { type: 'CourseCreated', data: { courseId: 'cs102', name: 'Course 2' } },
        ],
        null
      );

      // Restart
      await runner.start();

      const state = runner.getState<{ count: number }>('courseCount');
      expect(state.state.count).toBe(2);
    });

    it('throws error if started twice', async () => {
      const projection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, { test: projection });
      await runner.start();

      await expect(runner.start()).rejects.toThrow('already running');
    });

    it('does not throw error if stopped twice', () => {
      const projection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {
          CourseCreated: (state) => ({ count: state.count + 1 }),
        },
      };

      runner = new ProjectionRunner(store, notifier, { test: projection });
      runner.stop();
      runner.stop(); // Should not throw
    });
  });

  describe('ProjectionRunner - Error Cases', () => {
    it('throws error when getting unknown projection', async () => {
      const projection: ProjectionHandler<{ count: number }> = {
        init: { count: 0 },
        when: {},
      };

      runner = new ProjectionRunner(store, notifier, { test: projection });
      await runner.start();

      expect(() => runner.getState('unknown')).toThrow("Projection 'unknown' not found");
    });
  });
});
