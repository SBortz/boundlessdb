/**
 * Tests for Consistency Token (Base64 encoded, no signature)
 */

import { describe, it, expect } from 'vitest';
import { 
  createToken, 
  decodeToken, 
  encodeAppendCondition, 
  decodeAppendCondition,
  TokenDecodeError,
  // Backwards compatibility aliases
  validateToken,
  TokenValidationError,
} from '../src/token.js';
import type { Query, AppendCondition } from '../src/types.js';

describe('Consistency Token', () => {
  describe('createToken', () => {
    it('creates a valid Base64URL token', () => {
      const query: Query = {
        conditions: [
          { type: 'CourseCreated', key: 'course', value: 'cs101' },
        ],
      };

      const token = createToken(query, 100n);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // Should be valid Base64URL (no dots since no signature)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('normalizes query order', () => {
      const query1: Query = {
        conditions: [
          { type: 'B', key: 'k2', value: 'v2' },
          { type: 'A', key: 'k1', value: 'v1' },
        ],
      };

      const query2: Query = {
        conditions: [
          { type: 'A', key: 'k1', value: 'v1' },
          { type: 'B', key: 'k2', value: 'v2' },
        ],
      };

      const token1 = createToken(query1, 100n);
      const token2 = createToken(query2, 100n);

      // Tokens should be identical when normalized
      expect(token1).toBe(token2);
    });
  });

  describe('decodeToken', () => {
    it('decodes a valid token', () => {
      const query: Query = {
        conditions: [
          { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
          { type: 'CourseCreated', key: 'course', value: 'cs101' },
        ],
      };

      const token = createToken(query, 4827n);
      const payload = decodeToken(token);

      expect(payload.pos).toBe(4827n);
      // Query should be normalized (sorted)
      expect(payload.q[0].type).toBe('CourseCreated');
      expect(payload.q[1].type).toBe('StudentSubscribed');
    });

    it('rejects malformed token (invalid base64)', () => {
      expect(() => decodeToken('!!!invalid!!!')).toThrow(TokenDecodeError);
    });

    it('rejects token with invalid JSON', () => {
      const notJson = Buffer.from('not json').toString('base64url');
      expect(() => decodeToken(notJson)).toThrow(TokenDecodeError);
    });

    it('rejects token without required fields', () => {
      const incomplete = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
      expect(() => decodeToken(incomplete)).toThrow(TokenDecodeError);
    });
  });

  describe('backwards compatibility aliases', () => {
    it('validateToken is alias for decodeToken', () => {
      const token = createToken({ conditions: [] }, 100n);
      // validateToken now ignores the secret parameter
      const payload = validateToken(token, 'any-secret-ignored');
      expect(payload.pos).toBe(100n);
    });

    it('TokenValidationError is alias for TokenDecodeError', () => {
      expect(TokenValidationError).toBe(TokenDecodeError);
    });
  });

  describe('AppendCondition helpers', () => {
    it('encodeAppendCondition creates a token', () => {
      const condition: AppendCondition = {
        position: 42n,
        conditions: [
          { type: 'CourseCreated', key: 'course', value: 'cs101' },
        ],
      };

      const token = encodeAppendCondition(condition);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('decodeAppendCondition decodes a token', () => {
      const original: AppendCondition = {
        position: 42n,
        conditions: [
          { type: 'CourseCreated', key: 'course', value: 'cs101' },
        ],
      };

      const token = encodeAppendCondition(original);
      const decoded = decodeAppendCondition(token);

      expect(decoded.position).toBe(42n);
      expect(decoded.conditions).toEqual(original.conditions);
    });

    it('roundtrip: encode → decode', () => {
      const original: AppendCondition = {
        position: 9999n,
        conditions: [
          { type: 'A', key: 'k1', value: 'v1' },
          { type: 'B', key: 'k2', value: 'v2' },
        ],
      };

      const token = encodeAppendCondition(original);
      const decoded = decodeAppendCondition(token);

      expect(decoded.position).toBe(original.position);
      // Note: conditions get normalized (sorted)
      expect(decoded.conditions.length).toBe(original.conditions.length);
    });
  });

  describe('bigint handling', () => {
    it('handles large positions (beyond Number.MAX_SAFE_INTEGER)', () => {
      const largePos = 9007199254740993n; // > MAX_SAFE_INTEGER

      const token = createToken({ conditions: [] }, largePos);
      const payload = decodeToken(token);

      expect(payload.pos).toBe(largePos);
    });

    it('handles position 0', () => {
      const token = createToken({ conditions: [] }, 0n);
      const payload = decodeToken(token);

      expect(payload.pos).toBe(0n);
    });
  });
});
