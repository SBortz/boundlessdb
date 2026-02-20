/**
 * DCB Event Store - Public API
 */

// Core types
export type {
  NewEvent,
  StoredEvent,
  Query,
  QueryCondition,
  ConsistencyConfig,
  ConsistencyKeyDef,
  EventTypeConfig,
  ExtractedKey,
  ReadResult,
  AppendResult,
  ConflictResult,
  ConsistencyToken,
  TokenPayload,
  EventStoreOptions,
} from './types.js';

export { isConflict } from './types.js';

// Event Store
export { EventStore, createEventStore, type EventStoreConfig } from './event-store.js';

// Storage
export type { EventStorage, EventToStore } from './storage/interface.js';
export { InMemoryStorage } from './storage/memory.js';
export { SqliteStorage } from './storage/sqlite.js';

// Config
export { KeyExtractor, KeyExtractionError } from './config/extractor.js';
export { validateConfig, ConfigValidationError } from './config/validator.js';

// Token
export { createToken, validateToken, TokenValidationError } from './token.js';
