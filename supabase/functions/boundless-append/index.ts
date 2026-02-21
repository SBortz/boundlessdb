/**
 * BoundlessDB Append Endpoint
 * 
 * POST /functions/v1/boundless-append
 * 
 * Append events with optional consistency check via token.
 */

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate, AuthError, BoundlessError } from "../_shared/auth.ts";
import { createConnection, appendEvents, getEventsSince } from "../_shared/storage.ts";
import { createToken, verifyToken, getSecret } from "../_shared/token.ts";
import type { 
  AppendRequest, 
  AppendResponse, 
  StoredEvent, 
  SerializedEvent 
} from "../_shared/types.ts";

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
    const body = await req.json() as AppendRequest;

    // Validate request
    if (!body.events || !Array.isArray(body.events)) {
      throw new BoundlessError("Missing events array", 400, "INVALID_REQUEST");
    }

    if (body.events.length === 0) {
      throw new BoundlessError("Events array is empty", 400, "INVALID_REQUEST");
    }

    // Execute append
    const sql = createConnection();
    try {
      const secret = getSecret();

      // If token provided, verify and check for conflicts
      if (body.token) {
        const tokenData = await verifyToken(body.token, secret);
        
        if (!tokenData) {
          throw new BoundlessError("Invalid or tampered token", 400, "INVALID_TOKEN");
        }

        // Check for conflicting events since token position
        const conflictingEvents = await getEventsSince(
          sql,
          tokenData.query,
          BigInt(tokenData.pos)
        );

        if (conflictingEvents.length > 0) {
          const newPosition = conflictingEvents[conflictingEvents.length - 1].position;
          const newToken = await createToken(newPosition, tokenData.query, secret);

          const response: AppendResponse = {
            success: false,
            conflict: true,
            conflictingEvents: conflictingEvents.map(serializeEvent),
            newToken,
          };

          return jsonResponse(response);
        }
      }

      // No conflicts, append events
      const position = await appendEvents(sql, body.events);
      
      // Create new token with same conditions (if token was provided)
      let newToken: string;
      if (body.token) {
        const tokenData = await verifyToken(body.token, secret);
        newToken = await createToken(position, tokenData!.query, secret);
      } else {
        newToken = await createToken(position, [], secret);
      }

      const response: AppendResponse = {
        success: true,
        position: Number(position),
        token: newToken,
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

    // Check for unknown event type error
    if (error instanceof Error && error.message.startsWith("Unknown event type:")) {
      return errorResponse(error.message, "UNKNOWN_EVENT_TYPE", 422);
    }

    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

// Start the server
Deno.serve(handleRequest);
