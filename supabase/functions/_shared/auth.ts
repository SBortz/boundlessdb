/**
 * Authentication Helper
 * 
 * Shared authentication logic for all BoundlessDB endpoints.
 * Supports both Supabase Auth (JWT) and API Key authentication.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

export interface AuthResult {
  userId?: string;
  isAdmin: boolean;
}

/**
 * Authenticate request using Supabase Anon Key, API Key, or Supabase Auth
 * 
 * Supports multiple auth methods:
 * 1. Supabase Anon Key (recommended for public clients)
 * 2. Custom API Key (for service-to-service)
 * 3. Supabase Auth JWT (for authenticated users)
 * 4. No auth (if BOUNDLESS_REQUIRE_AUTH is not set)
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const configuredApiKey = Deno.env.get("BOUNDLESS_API_KEY");
  const requireAuth = Deno.env.get("BOUNDLESS_REQUIRE_AUTH") === "true";
  
  // Get key from X-API-Key header or Authorization Bearer
  const apiKeyHeader = req.headers.get("X-API-Key");
  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") 
    ? authHeader.replace("Bearer ", "") 
    : null;
  
  const providedKey = apiKeyHeader || bearerToken;
  
  // Check against Supabase Anon Key (standard for public clients)
  if (providedKey && anonKey && providedKey === anonKey) {
    return { isAdmin: false };
  }
  
  // Check against custom API Key (for service-to-service)
  if (providedKey && configuredApiKey && providedKey === configuredApiKey) {
    return { isAdmin: true };
  }
  
  // If a key was provided but didn't match, try Supabase Auth (JWT)
  if (bearerToken && bearerToken !== anonKey) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        anonKey!,
        { global: { headers: { Authorization: authHeader! } } }
      );

      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (!error && user) {
        return { userId: user.id, isAdmin: false };
      }
    } catch {
      // JWT validation failed, continue to check if auth required
    }
  }
  
  // No valid auth provided - allow if auth not required
  if (!requireAuth) {
    return { isAdmin: false };  // Anonymous access
  }
  
  throw new AuthError("Missing or invalid authorization", 401, "UNAUTHORIZED");
}

/**
 * Custom error class for authentication failures
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
    public code: string = "UNAUTHORIZED"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Custom error class for BoundlessDB operations
 */
export class BoundlessError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "BoundlessError";
  }
}
