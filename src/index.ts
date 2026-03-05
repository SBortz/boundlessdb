/**
 * DCB Event Store - Public API
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
  MultiTypeCondition,
  MultiTypeConstrainedCondition,
  KeyOnlyCondition,
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

export { QueryResult, isConflict, mergeConditions, isConstrainedCondition, isMultiKeyCondition, isMultiTypeCondition, isMultiTypeConstrainedCondition, isKeyOnlyCondition, normalizeCondition, hasKeys } from './types.js';

// Event Store
export { EventStore, createEventStore, type EventStoreConfig } from './event-store.js';

// Storage
export type { EventStorage, EventToStore } from './storage/interface.js';
export { InMemoryStorage } from './storage/memory.js';
export { SqliteStorage } from './storage/sqlite.js';
export { SqlJsStorage, type SqlJsStorageOptions } from './storage/sqljs.js';
export { PostgresStorage, type PostgresRetryOptions } from './storage/postgres.js';

// Config
export { KeyExtractor, KeyExtractionError } from './config/extractor.js';
export { validateConfig, ConfigValidationError } from './config/validator.js';

// Query Builder
export { QueryBuilder } from './query-builder.js';

// Projections
export type { EventNotifier } from './projections/notifier.js';
export type { ProjectionHandler, ProjectionState } from './projections/types.js';
export { InProcessNotifier } from './projections/in-process-notifier.js';
export { PollingNotifier, type PollingNotifierOptions } from './projections/polling-notifier.js';
export { ProjectionRunner } from './projections/runner.js';
