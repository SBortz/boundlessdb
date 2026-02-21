/**
 * HMAC Token Signing and Verification
 * 
 * Tokens contain:
 * - pos: The position up to which events were read
 * - query: The conditions used for the read
 * 
 * Format: base64(payload).base64(hmac-sha256-signature)
 * 
 * Uses Deno's built-in Web Crypto API.
 */

import type { QueryCondition, TokenPayload } from "./types.ts";

const encoder = new TextEncoder();

/**
 * Import secret as HMAC key
 */
async function getKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Base64 encode (URL-safe)
 */
function b64Encode(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Base64 decode (URL-safe)
 */
function b64Decode(str: string): Uint8Array {
  const padded = str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(str.length + (4 - (str.length % 4)) % 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Create a signed token from position and query conditions
 */
export async function createToken(
  position: bigint,
  conditions: QueryCondition[],
  secret: string
): Promise<string> {
  const payload: TokenPayload = {
    pos: Number(position),
    query: conditions,
  };

  const payloadJson = JSON.stringify(payload);
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadJson));

  return `${b64Encode(payloadJson)}.${b64Encode(new Uint8Array(signature))}`;
}

/**
 * Verify and decode a token
 * Returns null if invalid or tampered
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signatureB64] = parts;

  try {
    const payloadBytes = b64Decode(payloadB64);
    const signature = b64Decode(signatureB64);
    const key = await getKey(secret);

    const valid = await crypto.subtle.verify("HMAC", key, signature, payloadBytes);
    if (!valid) {
      return null;
    }

    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadJson) as TokenPayload;

    // Basic validation
    if (typeof payload.pos !== "number" || !Array.isArray(payload.query)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract position from a token without full verification
 * (for logging/debugging only)
 */
export function peekTokenPosition(token: string): number | null {
  try {
    const [payloadB64] = token.split(".");
    const payloadBytes = b64Decode(payloadB64);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    return typeof payload.pos === "number" ? payload.pos : null;
  } catch {
    return null;
  }
}

/**
 * Get HMAC secret from environment
 */
export function getSecret(): string {
  const secret = Deno.env.get("BOUNDLESS_SECRET");
  if (!secret) {
    throw new Error("BOUNDLESS_SECRET not configured");
  }
  return secret;
}
