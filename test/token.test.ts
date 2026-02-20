/**
 * Tests for Consistency Token
 */

import { describe, it, expect } from 'vitest';
import { createToken, validateToken, TokenValidationError } from '../src/token.js';
import type { Query } from '../src/types.js';

describe('Consistency Token', () => {
  const SECRET = 'test-secret-key-12345';

  describe('createToken', () => {
    it('creates a valid token', () => {
      const query: Query = {
        conditions: [
          { type: 'CourseCreated', key: 'course', value: 'cs101' },
        ],
      };

      const token = createToken(query, 100n, SECRET);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
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

      const token1 = createToken(query1, 100n, SECRET);
      const token2 = createToken(query2, 100n, SECRET);

      // Tokens should be identical when query is the same (after normalization)
      // but timestamp may differ, so we compare the payload part
      const payload1 = token1.split('.')[0];
      const payload2 = token2.split('.')[0];

      // Actually, timestamps differ, so we validate they both validate correctly
      const decoded1 = validateToken(token1, SECRET);
      const decoded2 = validateToken(token2, SECRET);

      expect(decoded1.q).toEqual(decoded2.q);
    });
  });

  describe('validateToken', () => {
    it('validates and decodes a valid token', () => {
      const query: Query = {
        conditions: [
          { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
          { type: 'CourseCreated', key: 'course', value: 'cs101' },
        ],
      };

      const token = createToken(query, 4827n, SECRET);
      const payload = validateToken(token, SECRET);

      expect(payload.v).toBe(1);
      expect(payload.pos).toBe(4827n);
      expect(payload.ts).toBeGreaterThan(0);
      // Query should be normalized (sorted)
      expect(payload.q[0].type).toBe('CourseCreated');
      expect(payload.q[1].type).toBe('StudentSubscribed');
    });

    it('rejects token with wrong secret', () => {
      const token = createToken({ conditions: [] }, 100n, SECRET);

      expect(() => validateToken(token, 'wrong-secret')).toThrow(TokenValidationError);
    });

    it('rejects tampered token (modified position)', () => {
      const token = createToken({ conditions: [] }, 100n, SECRET);

      // Decode, modify, re-encode (without proper signature)
      const [payloadB64, _sig] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      payload.pos = '999';
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${tamperedPayload}.${_sig}`;

      expect(() => validateToken(tamperedToken, SECRET)).toThrow(TokenValidationError);
    });

    it('rejects malformed token (no dot)', () => {
      expect(() => validateToken('nodothere', SECRET)).toThrow(TokenValidationError);
    });

    it('rejects token with invalid base64', () => {
      expect(() => validateToken('!!!.???', SECRET)).toThrow(TokenValidationError);
    });

    it('rejects token with invalid JSON', () => {
      const notJson = Buffer.from('not json').toString('base64url');
      const fakeSig = Buffer.from('fake').toString('base64url');
      expect(() => validateToken(`${notJson}.${fakeSig}`, SECRET)).toThrow(TokenValidationError);
    });
  });

  describe('bigint handling', () => {
    it('handles large positions (beyond Number.MAX_SAFE_INTEGER)', () => {
      const largePos = 9007199254740993n; // > MAX_SAFE_INTEGER

      const token = createToken({ conditions: [] }, largePos, SECRET);
      const payload = validateToken(token, SECRET);

      expect(payload.pos).toBe(largePos);
    });

    it('handles position 0', () => {
      const token = createToken({ conditions: [] }, 0n, SECRET);
      const payload = validateToken(token, SECRET);

      expect(payload.pos).toBe(0n);
    });
  });
});
