/**
 * BoundlessDB Types for Edge Functions
 * 
 * Shared type definitions matching the core BoundlessDB library.
 */

// Query Condition for reading events
export interface QueryCondition {
  type: string;
  key: string;
  value: string;
}

// Key extraction configuration
export interface KeyConfig {
  name: string;
  path: string;
  transform?: 'LOWER' | 'UPPER' | 'MONTH' | 'YEAR' | 'DATE';
  nullHandling?: 'error' | 'skip' | 'default';
  defaultValue?: string;
}

export interface EventTypeConfig {
  keys: KeyConfig[];
}

export interface ConsistencyConfig {
  eventTypes: Record<string, EventTypeConfig>;
}

// Stored Event (from database)
export interface StoredEvent {
  id: string;
  type: string;
  data: unknown;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  position: bigint;
}

// Event to be appended
export interface NewEvent {
  type: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

// Extracted key for indexing
export interface ExtractedKey {
  name: string;
  value: string;
}

// Token payload (signed with HMAC)
export interface TokenPayload {
  pos: number;
  query: QueryCondition[];
}

// Serialized event (JSON-safe, bigint -> number)
export interface SerializedEvent {
  id: string;
  type: string;
  data: unknown;
  metadata?: Record<string, unknown>;
  timestamp: string;
  position: number;
}

// API Request types
export interface ReadRequest {
  conditions: QueryCondition[];
  fromPosition?: number;
  limit?: number;
}

export interface AppendRequest {
  events: NewEvent[];
  token: string | null;
}

export interface EventsRequest {
  limit?: number;
  offset?: number;
}

// API Response types
export interface ReadResponse {
  events: SerializedEvent[];
  token: string;
}

export interface AppendSuccessResponse {
  success: true;
  position: number;
  token: string;
}

export interface AppendConflictResponse {
  success: false;
  conflict: true;
  conflictingEvents: SerializedEvent[];
  newToken: string;
}

export type AppendResponse = AppendSuccessResponse | AppendConflictResponse;

export interface HeadResponse {
  position: number;
}

export interface EventsResponse {
  events: SerializedEvent[];
  total: number;
}

export interface HealthResponse {
  status: "ok" | "error";
  version: string;
  timestamp: string;
  database?: "connected" | "error";
}

export interface ErrorResponse {
  error: {
    message: string;
    code: string;
  };
}
