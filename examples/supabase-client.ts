/**
 * BoundlessDB Supabase Client Example
 * 
 * Shows how to use the Edge Function API from TypeScript.
 * Works in both Browser and Node.js environments.
 * 
 * @example
 * ```bash
 * # Set environment variables
 * export SUPABASE_URL="https://your-project.supabase.co"
 * export SUPABASE_ANON_KEY="your-anon-key"
 * 
 * # Run with ts-node or Deno
 * npx ts-node examples/supabase-client.ts
 * ```
 */

// Configuration - use environment variables in production!
const SUPABASE_URL = process.env.SUPABASE_URL || "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "your-anon-key";
const BOUNDLESS_API_KEY = process.env.BOUNDLESS_API_KEY; // Optional, for admin access

// ============================================================
// TYPES
// ============================================================

interface QueryCondition {
  type: string;
  key: string;
  value: string;
}

interface StoredEvent {
  id: string;
  type: string;
  data: unknown;
  metadata?: Record<string, unknown>;
  timestamp: string;
  position: number;
}

interface NewEvent {
  type: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

interface ReadResult {
  events: StoredEvent[];
  token: string;
}

interface AppendResult {
  success: boolean;
  position?: number;
  token?: string;
  conflict?: boolean;
  conflictingEvents?: StoredEvent[];
  newToken?: string;
}

// ============================================================
// CLIENT
// ============================================================

/**
 * BoundlessDB Client for Supabase Edge Functions
 */
class BoundlessClient {
  private baseUrl: string;
  private anonKey: string;
  private accessToken?: string;
  private apiKey?: string;

  constructor(options: {
    supabaseUrl: string;
    anonKey: string;
    apiKey?: string;
  }) {
    this.baseUrl = `${options.supabaseUrl}/functions/v1`;
    this.anonKey = options.anonKey;
    this.apiKey = options.apiKey;
  }

  /**
   * Set the user's access token (from Supabase Auth)
   */
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async request<T>(
    endpoint: string, 
    body?: unknown, 
    method = "POST",
    useApiKey = false
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (useApiKey && this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    } else {
      headers["Authorization"] = `Bearer ${this.accessToken || this.anonKey}`;
    }

    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed: ${response.status}`);
    }

    return data as T;
  }

  /**
   * Read events matching conditions
   */
  async read(
    conditions: QueryCondition[],
    options?: { fromPosition?: number; limit?: number }
  ): Promise<ReadResult> {
    return this.request<ReadResult>("boundless-read", {
      conditions,
      ...options,
    });
  }

  /**
   * Append events with consistency check
   */
  async append(events: NewEvent[], token: string | null = null): Promise<AppendResult> {
    return this.request<AppendResult>("boundless-append", {
      events,
      token,
    });
  }

  /**
   * Get current position
   */
  async head(): Promise<{ position: number }> {
    return this.request<{ position: number }>("boundless-head", undefined, "GET");
  }

  /**
   * List all events (admin only)
   */
  async listEvents(options?: { limit?: number; offset?: number }): Promise<{
    events: StoredEvent[];
    total: number;
  }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    
    const queryString = params.toString();
    const url = queryString ? `boundless-events?${queryString}` : "boundless-events";
    
    return this.request(url, undefined, "GET", true);
  }

  /**
   * Health check (no auth required)
   */
  async health(): Promise<{ status: string; version: string; database: string }> {
    const response = await fetch(`${this.baseUrl}/boundless-health`);
    return response.json();
  }
}

// ============================================================
// DCB PATTERN HELPER
// ============================================================

/**
 * Execute a DCB command with automatic retry on conflict
 */
async function executeWithRetry<T>(
  client: BoundlessClient,
  conditions: QueryCondition[],
  decide: (events: StoredEvent[], token: string) => Promise<{ events: NewEvent[]; result: T } | null>,
  maxRetries = 3
): Promise<T | null> {
  let retries = 0;

  while (retries < maxRetries) {
    // READ
    const { events, token } = await client.read(conditions);

    // DECIDE
    const decision = await decide(events, token);
    if (!decision) {
      return null; // Decision returned nothing to do
    }

    // WRITE
    const result = await client.append(decision.events, token);

    if (result.success) {
      return decision.result;
    }

    if (result.conflict) {
      console.log(`Conflict detected, retrying (${retries + 1}/${maxRetries})`);
      retries++;
      continue;
    }

    throw new Error("Unexpected append failure");
  }

  throw new Error(`Max retries (${maxRetries}) exceeded`);
}

// ============================================================
// USAGE EXAMPLE: Course Enrollment System
// ============================================================

async function enrollStudent(courseId: string, studentId: string) {
  const client = new BoundlessClient({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  });

  return executeWithRetry(
    client,
    [
      { type: "CourseCreated", key: "course", value: courseId },
      { type: "StudentSubscribed", key: "course", value: courseId },
      { type: "StudentSubscribed", key: "student", value: studentId },
    ],
    async (events) => {
      // Check business rules
      const course = events.find(e => e.type === "CourseCreated");
      if (!course) {
        throw new Error("Course not found");
      }

      const alreadyEnrolled = events.some(
        e => e.type === "StudentSubscribed" && 
             (e.data as { studentId: string }).studentId === studentId
      );
      
      if (alreadyEnrolled) {
        console.log("Student already enrolled");
        return null;
      }

      const enrolled = events.filter(e => e.type === "StudentSubscribed").length;
      const capacity = (course.data as { capacity: number }).capacity || 30;
      
      if (enrolled >= capacity) {
        throw new Error("Course is full");
      }

      // Create enrollment event
      return {
        events: [
          {
            type: "StudentSubscribed",
            data: { 
              courseId, 
              studentId, 
              enrolledAt: new Date().toISOString() 
            },
          },
        ],
        result: { courseId, studentId, enrolled: true },
      };
    }
  );
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const client = new BoundlessClient({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    apiKey: BOUNDLESS_API_KEY,
  });

  console.log("=== BoundlessDB Supabase Client Example ===\n");

  // Health check
  console.log("1. Health check...");
  const health = await client.health();
  console.log("   Status:", health.status);
  console.log("   Database:", health.database);
  console.log();

  // Get current position
  console.log("2. Getting current position...");
  const { position } = await client.head();
  console.log("   Position:", position);
  console.log();

  // Create a course (without consistency check)
  console.log("3. Creating course CS101...");
  const createResult = await client.append([
    {
      type: "CourseCreated",
      data: {
        courseId: "cs101",
        title: "Introduction to Computer Science",
        capacity: 30,
      },
    },
  ]);
  console.log("   Success:", createResult.success);
  console.log("   Position:", createResult.position);
  console.log();

  // Read events
  console.log("4. Reading course events...");
  const { events, token } = await client.read([
    { type: "CourseCreated", key: "course", value: "cs101" },
  ]);
  console.log("   Found:", events.length, "events");
  console.log("   Token:", token.substring(0, 50) + "...");
  console.log();

  // Enroll a student (with DCB pattern)
  console.log("5. Enrolling student alice...");
  try {
    const enrollment = await enrollStudent("cs101", "alice");
    console.log("   Result:", enrollment);
  } catch (error) {
    console.log("   Error:", (error as Error).message);
  }
  console.log();

  // List all events (admin)
  if (BOUNDLESS_API_KEY) {
    console.log("6. Listing all events (admin)...");
    const all = await client.listEvents({ limit: 10 });
    console.log("   Total events:", all.total);
    console.log("   Recent events:", all.events.map(e => e.type).join(", "));
  } else {
    console.log("6. Skipping admin endpoint (no API key)");
  }

  console.log("\nDone!");
}

// Run if this is the main module
main().catch(console.error);

// Export for use as a library
export { BoundlessClient, executeWithRetry, enrollStudent };
