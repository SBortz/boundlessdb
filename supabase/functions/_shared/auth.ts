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
 * Authenticate request using Supabase Auth or API Key
 * 
 * Auth is OPTIONAL by default (for public demos).
 * Set BOUNDLESS_API_KEY secret to require API key authentication.
 * Set BOUNDLESS_REQUIRE_AUTH=true to require Supabase Auth.
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  const configuredApiKey = Deno.env.get("BOUNDLESS_API_KEY");
  const requireAuth = Deno.env.get("BOUNDLESS_REQUIRE_AUTH") === "true";
  
  // Check API Key first (for service-to-service)
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey && configuredApiKey && apiKey === configuredApiKey) {
    return { isAdmin: true };
  }
  
  // If API key is configured but not provided/matched, reject
  if (configuredApiKey && apiKey) {
    throw new AuthError("Invalid API key", 401, "UNAUTHORIZED");
  }

  // Check Supabase Auth if Authorization header present
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      throw new AuthError("Invalid token", 401, "UNAUTHORIZED");
    }

    return { userId: user.id, isAdmin: false };
  }
  
  // No auth provided - allow if auth not required
  if (!configuredApiKey && !requireAuth) {
    return { isAdmin: false };  // Anonymous access
  }
  
  throw new AuthError("Missing authorization", 401, "UNAUTHORIZED");
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
