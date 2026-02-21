/**
 * BoundlessDB Read Endpoint
 * 
 * POST /functions/v1/boundless-read
 * 
 * Read events matching conditions and receive a consistency token.
 */

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate, AuthError, BoundlessError } from "../_shared/auth.ts";
import { createConnection, queryEvents, getLatestPosition } from "../_shared/storage.ts";
import { createToken, getSecret } from "../_shared/token.ts";
import type { ReadRequest, ReadResponse, StoredEvent, SerializedEvent } from "../_shared/types.ts";

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

  // Only POST allowed
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  try {
    // Authenticate
    await authenticate(req);

    // Parse body
    const body = await req.json() as ReadRequest;

    // Validate request
    if (!body.conditions || !Array.isArray(body.conditions)) {
      throw new BoundlessError("Missing conditions array", 400, "INVALID_REQUEST");
    }

    // Execute read
    const sql = createConnection();
    try {
      const fromPosition = body.fromPosition !== undefined 
        ? BigInt(body.fromPosition) 
        : undefined;
      
      const events = await queryEvents(
        sql,
        body.conditions,
        fromPosition,
        body.limit ?? 1000
      );

      const latestPosition = events.length > 0 
        ? events[events.length - 1].position 
        : await getLatestPosition(sql);

      const token = await createToken(latestPosition, body.conditions, getSecret());

      const response: ReadResponse = {
        events: events.map(serializeEvent),
        token,
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
