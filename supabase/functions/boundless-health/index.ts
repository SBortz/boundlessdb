/**
 * BoundlessDB Health Check Endpoint
 * 
 * GET /functions/v1/boundless-health
 * 
 * Check service health and database connectivity.
 * No authentication required.
 */

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { createConnection, checkConnection } from "../_shared/storage.ts";
import type { HealthResponse } from "../_shared/types.ts";

const VERSION = "1.0.0";

/**
 * Main request handler
 */
async function handleRequest(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCors();
  }

  // Only GET allowed
  if (req.method !== "GET") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  try {
    // Check database connection
    let dbStatus: "connected" | "error" = "error";
    
    try {
      const sql = createConnection();
      try {
        const connected = await checkConnection(sql);
        dbStatus = connected ? "connected" : "error";
      } finally {
        await sql.end();
      }
    } catch {
      dbStatus = "error";
    }

    const response: HealthResponse = {
      status: dbStatus === "connected" ? "ok" : "error",
      version: VERSION,
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };

    const statusCode = response.status === "ok" ? 200 : 503;
    return jsonResponse(response, statusCode);

  } catch (error) {
    console.error("Error:", error);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

// Start the server
Deno.serve(handleRequest);
