/**
 * BoundlessDB Events Endpoint (Admin)
 * 
 * GET /functions/v1/boundless-events
 * 
 * List all events with pagination. Admin-only endpoint.
 */

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate, AuthError, BoundlessError } from "../_shared/auth.ts";
import { createConnection, getAllEvents } from "../_shared/storage.ts";
import type { EventsResponse, StoredEvent, SerializedEvent } from "../_shared/types.ts";

/**
 * Serialize a StoredEvent for JSON response
 */
function serializeEvent(event: StoredEvent): SerializedEvent {
  return {
    id: event.id,
    type: event.type,
    data: event.data,
    metadata: event.metadata,
    timestamp: event.timestamp.toISOString(),
    position: Number(event.position),
  };
}

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
    // Authenticate - must be admin
    const auth = await authenticate(req);
    
    if (!auth.isAdmin) {
      throw new BoundlessError("Admin access required", 403, "FORBIDDEN");
    }

    // Parse parameters
    let limit = 100;
    let offset = 0;

    if (req.method === "GET") {
      const url = new URL(req.url);
      limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
      offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    } else {
      const body = await req.json();
      limit = body.limit ?? 100;
      offset = body.offset ?? 0;
    }

    // Execute query
    const sql = createConnection();
    try {
      const { events, total } = await getAllEvents(sql, limit, offset);

      const response: EventsResponse = {
        events: events.map(serializeEvent),
        total,
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
