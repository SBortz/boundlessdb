/**
 * DCB Event Store - Browser Bundle Entry Point
 * 
 * This file exports everything needed for browser usage with sql.js storage.
 */

// Core types
export type {
  // Event types
  Event,
  EventWithMetadata,
  StoredEvent,
  // Query types
  Query,
  QueryCondition,
  UnconstrainedCondition,
  ConstrainedCondition,
  MultiKeyConstrainedCondition,
  // Config types
  ConsistencyConfig,
  ConsistencyKeyDef,
  EventTypeConfig,
  ExtractedKey,
  // Result types
  AppendResult,
  ConflictResult,
  AppendCondition,
  EventStoreOptions,
} from './types.js';

export { QueryResult, isConflict, isConstrainedCondition, isMultiKeyCondition, normalizeCondition, hasKeys } from './types.js';

// Event Store (browser version)
export { EventStore, createEventStore, type EventStoreConfig } from './event-store.browser.js';

// Storage - Only sql.js and InMemory for browser (not better-sqlite3)
export type { EventStorage, EventToStore } from './storage/interface.js';
export { InMemoryStorage } from './storage/memory.js';
export { SqlJsStorage, type SqlJsStorageOptions } from './storage/sqljs.js';

// Config
export { KeyExtractor, KeyExtractionError } from './config/extractor.js';
export { validateConfig, ConfigValidationError } from './config/validator.js';
