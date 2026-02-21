/**
 * BoundlessDB Head Endpoint
 * 
 * GET /functions/v1/boundless-head
 * 
 * Get the current position (latest event position).
 */

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate, AuthError, BoundlessError } from "../_shared/auth.ts";
import { createConnection, getLatestPosition } from "../_shared/storage.ts";
import type { HeadResponse } from "../_shared/types.ts";

/**
 * Main request handler
 */
async function handleRequest(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCors();
  }

  // Allow both GET and POST for convenience
  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  try {
    // Authenticate
    await authenticate(req);

    // Execute query
    const sql = createConnection();
    try {
      const position = await getLatestPosition(sql);

      const response: HeadResponse = {
        position: Number(position),
      };

      return jsonResponse(response);
    } finally {
      await sql.end();
    }

  } catch (error) {
    console.error("Error:", error);

    if (error instanceof AuthError || error instanceof BoundlessError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }

    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

// Start the server
Deno.serve(handleRequest);
