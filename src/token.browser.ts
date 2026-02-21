/**
 * Consistency Token: Browser-compatible version using Web Crypto API
 */

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
function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' 
    ? new TextEncoder().encode(data) 
    : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL decode
 */
function base64urlDecode(data: string): Uint8Array {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

/**
 * Check if Web Crypto API is available (requires HTTPS or localhost)
 */
const hasWebCrypto = typeof crypto !== 'undefined' && 
                     typeof crypto.subtle !== 'undefined' &&
                     typeof crypto.subtle.importKey === 'function';

/**
 * Simple hash fallback for non-HTTPS environments (NOT cryptographically secure!)
 * Uses a combination of FNV-1a and string mixing
 */
function simpleHashFallback(secret: string, data: string): Uint8Array {
  const combined = secret + ':' + data;
  
  // FNV-1a 32-bit hash, run multiple times with different seeds for more bytes
  const fnv1a = (str: string, seed: number): number => {
    let hash = 2166136261 ^ seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  
  // Generate 32 bytes (256 bits) by running hash with different seeds
  const result = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const h = fnv1a(combined, i * 12345);
    result[i * 4] = (h >>> 24) & 0xff;
    result[i * 4 + 1] = (h >>> 16) & 0xff;
    result[i * 4 + 2] = (h >>> 8) & 0xff;
    result[i * 4 + 3] = h & 0xff;
  }
  
  return result;
}

/**
 * Compute HMAC-SHA256 (async) - with fallback for non-HTTPS
 */
async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  if (!hasWebCrypto) {
    // Fallback for HTTP environments
    console.warn('⚠️ Web Crypto API not available (requires HTTPS). Using insecure fallback hash.');
    return simpleHashFallback(secret, data);
  }
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

/**
 * Timing-safe comparison
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
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
 * Create a consistency token (async for browser)
 */
export async function createToken(
  query: Query,
  position: bigint,
  secret: string
): Promise<ConsistencyToken> {
  const payload: TokenPayloadJSON = {
    v: 1,
    pos: position.toString(),
    ts: Math.floor(Date.now() / 1000),
    q: normalizeQuery(query.conditions),
  };

  const payloadJson = JSON.stringify(payload);
  const sig = await hmacSha256(secret, payloadJson);

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
 * Validate and decode a consistency token (async for browser)
 * @throws TokenValidationError if token is invalid
 */
export async function validateToken(
  token: ConsistencyToken,
  secret: string
): Promise<TokenPayload> {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new TokenValidationError('Invalid token format: expected two parts separated by dot');
  }

  const [payloadB64, sigB64] = parts;

  let payloadJson: string;
  try {
    const decoded = base64urlDecode(payloadB64);
    payloadJson = new TextDecoder().decode(decoded);
  } catch {
    throw new TokenValidationError('Invalid token: payload is not valid base64url');
  }

  let providedSig: Uint8Array;
  try {
    providedSig = base64urlDecode(sigB64);
  } catch {
    throw new TokenValidationError('Invalid token: signature is not valid base64url');
  }

  // Verify signature
  const expectedSig = await hmacSha256(secret, payloadJson);
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
export async function createTokenFromPayload(
  payload: TokenPayload,
  secret: string
): Promise<ConsistencyToken> {
  const jsonPayload: TokenPayloadJSON = {
    v: payload.v,
    pos: payload.pos.toString(),
    ts: payload.ts,
    q: normalizeQuery(payload.q),
  };

  const payloadJson = JSON.stringify(jsonPayload);
  const sig = await hmacSha256(secret, payloadJson);

  return base64urlEncode(payloadJson) + '.' + base64urlEncode(sig);
}
