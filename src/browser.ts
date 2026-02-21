/**
 * DCB Event Store - Browser Bundle Entry Point
 * 
 * This file exports everything needed for browser usage with sql.js storage.
 * No cryptographic signing - tokens are Base64 encoded for convenience.
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
  AppendCondition,
  TokenPayload,
  EventStoreOptions,
} from './types.js';

export { isConflict } from './types.js';

// Event Store (browser version)
export { EventStore, createEventStore, type EventStoreConfig } from './event-store.browser.js';

// Storage - Only sql.js and InMemory for browser (not better-sqlite3)
export type { EventStorage, EventToStore } from './storage/interface.js';
export { InMemoryStorage } from './storage/memory.js';
export { SqlJsStorage, type SqlJsStorageOptions } from './storage/sqljs.js';

// Config
export { KeyExtractor, KeyExtractionError } from './config/extractor.js';
export { validateConfig, ConfigValidationError } from './config/validator.js';

// Token utilities
export { 
  createToken, 
  decodeToken,
  encodeAppendCondition,
  decodeAppendCondition,
  TokenDecodeError,
  // Backwards compatibility aliases
  validateToken, 
  TokenValidationError,
} from './token.browser.js';
