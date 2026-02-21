/**
 * CORS Headers Helper
 * 
 * Shared CORS configuration for all BoundlessDB endpoints.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Handle CORS preflight request
 */
export function handleCors(): Response {
  return new Response(null, { headers: corsHeaders });
}

/**
 * Create a JSON response with CORS headers
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Create an error response with CORS headers
 */
export function errorResponse(
  message: string,
  code: string,
  status: number
): Response {
  return jsonResponse({ error: { message, code } }, status);
}
