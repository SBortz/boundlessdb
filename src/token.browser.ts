/**
 * Consistency Token: Browser-compatible version
 * 
 * No cryptographic signing - the token is simply a convenience wrapper
 * around { position, conditions } for easier passing between read and append.
 */

import type {
  ConsistencyToken,
  Query,
  QueryCondition,
  TokenPayload,
  TokenPayloadJSON,
  AppendCondition,
} from './types.js';

/**
 * Base64URL encode (no padding)
 */
function base64urlEncode(data: string): string {
  const bytes = new TextEncoder().encode(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL decode
 */
function base64urlDecode(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array([...binary].map(c => c.charCodeAt(0)));
  return new TextDecoder().decode(bytes);
}

/**
 * Normalize query conditions for deterministic encoding
 * - Sort by type, then by key, then by value
 * - Remove any extra properties
 */
function normalizeQuery(conditions: QueryCondition[]): QueryCondition[] {
  return conditions
    .map(c => ({ type: c.type, key: c.key, value: c.value }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      // Handle optional key/value - sort undefined to the end
      const aKey = a.key ?? '';
      const bKey = b.key ?? '';
      if (aKey !== bKey) return aKey.localeCompare(bKey);
      const aValue = a.value ?? '';
      const bValue = b.value ?? '';
      return aValue.localeCompare(bValue);
    });
}

/**
 * Create a consistency token (Base64 encoded, no signature)
 */
export function createToken(
  query: Query,
  position: bigint
): ConsistencyToken {
  const payload: TokenPayloadJSON = {
    pos: position.toString(),
    q: normalizeQuery(query.conditions),
  };

  return base64urlEncode(JSON.stringify(payload));
}

/**
 * Token decode error
 */
export class TokenDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenDecodeError';
  }
}

// Keep old name as alias for backwards compatibility
export { TokenDecodeError as TokenValidationError };

/**
 * Decode a consistency token
 * @throws TokenDecodeError if token is malformed
 */
export function decodeToken(token: ConsistencyToken): TokenPayload {
  let payloadJson: string;
  try {
    payloadJson = base64urlDecode(token);
  } catch {
    throw new TokenDecodeError('Invalid token: not valid base64url');
  }

  // Parse payload
  let raw: TokenPayloadJSON;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    throw new TokenDecodeError('Invalid token: not valid JSON');
  }

  // Validate structure
  if (typeof raw.pos !== 'string') {
    throw new TokenDecodeError('Invalid token: pos must be a string');
  }
  if (!Array.isArray(raw.q)) {
    throw new TokenDecodeError('Invalid token: q must be an array');
  }

  // Convert position to bigint
  let pos: bigint;
  try {
    pos = BigInt(raw.pos);
  } catch {
    throw new TokenDecodeError('Invalid token: pos is not a valid bigint');
  }

  return {
    pos,
    q: raw.q,
  };
}

// Keep old name as alias for backwards compatibility
export { decodeToken as validateToken };

/**
 * Create a token from an AppendCondition (for manual token creation)
 */
export function encodeAppendCondition(condition: AppendCondition): ConsistencyToken {
  const payload: TokenPayloadJSON = {
    pos: condition.position.toString(),
    q: normalizeQuery(condition.conditions),
  };

  return base64urlEncode(JSON.stringify(payload));
}

/**
 * Decode a token to AppendCondition
 */
export function decodeAppendCondition(token: ConsistencyToken): AppendCondition {
  const payload = decodeToken(token);
  return {
    position: payload.pos,
    conditions: payload.q,
  };
}

// Legacy async wrappers for backwards compatibility with old API
export async function createTokenAsync(
  query: Query,
  position: bigint,
  _secret?: string  // Ignored, kept for API compatibility
): Promise<ConsistencyToken> {
  return createToken(query, position);
}

export async function validateTokenAsync(
  token: ConsistencyToken,
  _secret?: string  // Ignored, kept for API compatibility
): Promise<TokenPayload> {
  return decodeToken(token);
}
