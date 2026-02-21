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
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  // Check API Key first (for service-to-service)
  const apiKey = req.headers.get("X-API-Key");
  const configuredApiKey = Deno.env.get("BOUNDLESS_API_KEY");
  
  if (apiKey && configuredApiKey && apiKey === configuredApiKey) {
    return { isAdmin: true };
  }

  // Check Supabase Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing authorization", 401, "UNAUTHORIZED");
  }

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
