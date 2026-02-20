/**
 * Tests for Config Validation
 */

import { describe, it, expect } from 'vitest';
import { validateConfig, ConfigValidationError } from '../src/config/validator.js';
import type { ConsistencyConfig } from '../src/types.js';

describe('Config Validation', () => {
  describe('valid configs', () => {
    it('accepts minimal valid config', () => {
      const config: ConsistencyConfig = {
        eventTypes: {},
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it('accepts config with event types', () => {
      const config: ConsistencyConfig = {
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
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it('accepts config with transforms', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [
              { name: 'email', path: 'data.email', transform: 'LOWER' },
              { name: 'name', path: 'data.name', transform: 'UPPER' },
              { name: 'month', path: 'data.date', transform: 'MONTH' },
              { name: 'year', path: 'data.date', transform: 'YEAR' },
              { name: 'day', path: 'data.timestamp', transform: 'DATE' },
            ],
          },
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it('accepts config with null handling', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [
              { name: 'a', path: 'data.a', nullHandling: 'error' },
              { name: 'b', path: 'data.b', nullHandling: 'skip' },
              { name: 'c', path: 'data.c', nullHandling: 'default', defaultValue: 'unknown' },
            ],
          },
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe('invalid configs', () => {
    it('rejects null config', () => {
      expect(() => validateConfig(null as unknown as ConsistencyConfig)).toThrow(
        ConfigValidationError
      );
    });

    it('rejects config without eventTypes', () => {
      expect(() => validateConfig({} as unknown as ConsistencyConfig)).toThrow(
        ConfigValidationError
      );
    });

    it('rejects key without name', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [{ name: '', path: 'data.value' }],
          },
        },
      };

      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('rejects key without path', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [{ name: 'test', path: '' }],
          },
        },
      };

      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('rejects invalid key name format', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [{ name: '123invalid', path: 'data.value' }],
          },
        },
      };

      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('rejects invalid path format', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [{ name: 'test', path: 'data..value' }],
          },
        },
      };

      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('rejects invalid transform', () => {
      const config = {
        eventTypes: {
          Test: {
            keys: [{ name: 'test', path: 'data.value', transform: 'INVALID' }],
          },
        },
      };

      expect(() => validateConfig(config as unknown as ConsistencyConfig)).toThrow(
        ConfigValidationError
      );
    });

    it('rejects invalid nullHandling', () => {
      const config = {
        eventTypes: {
          Test: {
            keys: [{ name: 'test', path: 'data.value', nullHandling: 'invalid' }],
          },
        },
      };

      expect(() => validateConfig(config as unknown as ConsistencyConfig)).toThrow(
        ConfigValidationError
      );
    });

    it('rejects default nullHandling without defaultValue', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [{ name: 'test', path: 'data.value', nullHandling: 'default' }],
          },
        },
      };

      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('rejects duplicate key names in same event type', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [
              { name: 'duplicate', path: 'data.a' },
              { name: 'duplicate', path: 'data.b' },
            ],
          },
        },
      };

      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
  });

  describe('error messages', () => {
    it('reports all errors at once', () => {
      const config: ConsistencyConfig = {
        eventTypes: {
          Test: {
            keys: [
              { name: '', path: '' },
              { name: '123', path: 'data..value' },
            ],
          },
        },
      };

      try {
        validateConfig(config);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigValidationError);
        const error = e as ConfigValidationError;
        expect(error.errors.length).toBeGreaterThan(2);
      }
    });
  });
});
