/**
 * Consistency Token: Create and validate HMAC-signed tokens
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  ConsistencyToken,
  Query,
  QueryCondition,
  TokenPayload,
  TokenPayloadJSON,
} from './types.js';

/**
 * Base64URL encode (no padding)
 */
function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return buf.toString('base64url');
}

/**
 * Base64URL decode
 */
function base64urlDecode(data: string): Buffer {
  return Buffer.from(data, 'base64url');
}

/**
 * Compute HMAC-SHA256
 */
function hmacSha256(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data, 'utf-8').digest();
}

/**
 * Normalize query conditions for deterministic signature
 * - Sort by type, then by key, then by value
 * - Remove any extra properties
 */
function normalizeQuery(conditions: QueryCondition[]): QueryCondition[] {
  return conditions
    .map(c => ({ type: c.type, key: c.key, value: c.value }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.key !== b.key) return a.key.localeCompare(b.key);
      return a.value.localeCompare(b.value);
    });
}

/**
 * Create a consistency token
 */
export function createToken(
  query: Query,
  position: bigint,
  secret: string
): ConsistencyToken {
  const payload: TokenPayloadJSON = {
    v: 1,
    pos: position.toString(),
    ts: Math.floor(Date.now() / 1000),
    q: normalizeQuery(query.conditions),
  };

  const payloadJson = JSON.stringify(payload);
  const sig = hmacSha256(secret, payloadJson);

  return base64urlEncode(payloadJson) + '.' + base64urlEncode(sig);
}

/**
 * Token validation error
 */
export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

/**
 * Validate and decode a consistency token
 * @throws TokenValidationError if token is invalid
 */
export function validateToken(
  token: ConsistencyToken,
  secret: string
): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new TokenValidationError('Invalid token format: expected two parts separated by dot');
  }

  const [payloadB64, sigB64] = parts;

  let payloadJson: string;
  try {
    payloadJson = base64urlDecode(payloadB64).toString('utf-8');
  } catch {
    throw new TokenValidationError('Invalid token: payload is not valid base64url');
  }

  let providedSig: Buffer;
  try {
    providedSig = base64urlDecode(sigB64);
  } catch {
    throw new TokenValidationError('Invalid token: signature is not valid base64url');
  }

  // Verify signature
  const expectedSig = hmacSha256(secret, payloadJson);
  if (providedSig.length !== expectedSig.length) {
    throw new TokenValidationError('Invalid token: signature verification failed');
  }
  if (!timingSafeEqual(providedSig, expectedSig)) {
    throw new TokenValidationError('Invalid token: signature verification failed');
  }

  // Parse payload
  let raw: TokenPayloadJSON;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    throw new TokenValidationError('Invalid token: payload is not valid JSON');
  }

  // Validate structure
  if (raw.v !== 1) {
    throw new TokenValidationError(`Invalid token: unsupported version ${raw.v}`);
  }
  if (typeof raw.pos !== 'string') {
    throw new TokenValidationError('Invalid token: pos must be a string');
  }
  if (typeof raw.ts !== 'number') {
    throw new TokenValidationError('Invalid token: ts must be a number');
  }
  if (!Array.isArray(raw.q)) {
    throw new TokenValidationError('Invalid token: q must be an array');
  }

  // Convert position to bigint
  let pos: bigint;
  try {
    pos = BigInt(raw.pos);
  } catch {
    throw new TokenValidationError('Invalid token: pos is not a valid bigint');
  }

  return {
    v: 1,
    pos,
    ts: raw.ts,
    q: raw.q,
  };
}

/**
 * Create a token from a TokenPayload (for generating new tokens after reads)
 */
export function createTokenFromPayload(
  payload: TokenPayload,
  secret: string
): ConsistencyToken {
  const jsonPayload: TokenPayloadJSON = {
    v: payload.v,
    pos: payload.pos.toString(),
    ts: payload.ts,
    q: normalizeQuery(payload.q),
  };

  const payloadJson = JSON.stringify(jsonPayload);
  const sig = hmacSha256(secret, payloadJson);

  return base64urlEncode(payloadJson) + '.' + base64urlEncode(sig);
}
