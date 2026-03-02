# Changelog

All notable changes to BoundlessDB will be documented in this file.

## [0.11.0] - 2026-03-02

### Added

#### `backwards()` query

Read events in reverse order (newest first). Useful with `.limit()` to get the last N events efficiently:

```typescript
const result = await store.all().backwards().limit(100).read();
```

All 4 storage engines supported: SQLite, PostgreSQL, SqlJs, InMemory.

#### Demo UI improvements

- **Config editor:** Edit consistency config and reindex live
- **Live Query builder:** Mirrors the fluent API with `matchType` and `matchKey` blocks, plus AND-key chaining
- **Key-only queries** in Live Query (leave Type empty)
- Debug panel hidden by default (accessible via `showDebug()` in console)

## [0.10.0] - 2026-03-01

### Added

#### `mergeConditions()` and `appendCondition.mergeWith()`

Combine multiple `AppendCondition`s for multi-boundary operations:

```typescript
const cartResult = await store.query().matchKey('cart', cartId).read();
const inventoryResult = await store.query().matchKey('product', productId).read();

// Fluent
const merged = cartResult.appendCondition
  .mergeWith(inventoryResult.appendCondition);

// Or standalone
const merged = mergeConditions(
  cartResult.appendCondition,
  inventoryResult.appendCondition,
);

await store.append(allEvents, merged);
```

#### Duplicate key names per event type

The same key name can now appear multiple times with different paths. This enables the DCB spec pattern where one event carries multiple values for the same tag:

```typescript
UsernameChanged: {
  keys: [
    { name: 'username', path: 'data.oldUsername' },
    { name: 'username', path: 'data.newUsername' },
  ]
}
```

#### DCB spec examples as tests

All 6 examples from [dcb.events/examples](https://dcb.events/examples/) implemented as integration tests: Course Subscriptions, Unique Username, Invoice Number, Opt-In Token, Dynamic Product Price, Prevent Record Duplication.

## [0.9.0] - 2026-03-01

### Breaking Changes

#### Renamed: `withKey()` → `andKey()`

The chaining method for AND key constraints has been renamed to make the semantics immediately clear:

```typescript
// Before (v0.8.0)
store.query()
  .matchType('StudentSubscribed')
  .withKey('course', 'cs101')
  .withKey('student', 'alice')
  .read();

// After (v0.9.0)
store.query()
  .matchType('StudentSubscribed')
  .andKey('course', 'cs101')
  .andKey('student', 'alice')
  .read();
```

**Migration:** Find and replace `.withKey(` → `.andKey(` in your codebase.

### Added

#### Key-Only Queries: `matchKey(key, value)`

Query events by key without specifying event types. This is the DCB-native way to query — by tags, not by event type.

```typescript
// "Everything about course cs101" — no need to list event types!
const result = await store.query()
  .matchKey('course', 'cs101')
  .read();

// AND: "Alice's enrollment in cs101"
const result = await store.query()
  .matchKey('course', 'cs101')
  .andKey('student', 'alice')
  .read();
```

**Why this matters:** Previously, querying by key required listing every event type manually:

```typescript
// Before: 8 event types just to query a cart 😱
const cartEventTypes = [
  'CartCreated', 'ItemAdded', 'ItemRemoved', 'ItemArchived',
  'CartSubmitted', 'CartCleared', 'CartPublished', 'CartPublicationFailed',
];
const result = await store.read({
  conditions: cartEventTypes.map(type => ({ type, key: 'cart', value: cartId })),
});

// After: one line ✨
const result = await store.query()
  .matchKey('cart', cartId)
  .read();
```

Key-only queries work with `andKey()` for AND logic, `fromPosition()`, `limit()`, and `appendCondition`.

#### Multi-Type Queries: `matchType(...types)`

`matchType()` now accepts multiple types (variadic). Types within one call are OR:

```typescript
// "All course lifecycle events for cs101"
const result = await store.query()
  .matchType('CourseCreated', 'CourseCancelled')
  .andKey('course', 'cs101')
  .read();
```

This maps directly to the DCB spec's QueryItem, where a single item can have multiple types.

### Query API Summary

| Method | Role |
|---|---|
| `matchKey(key, value)` | Start condition by key (any event type). |
| `matchType(...types)` | Start condition by type(s). |
| `andKey(key, value)` | Add AND key constraint to last condition. |
| `matchTypeAndKey(type, key, value)` | Shorthand for `matchType(type).andKey(key, value)`. |

**Rules:**
- `matchType()` / `matchKey()` → starts a new condition (OR between conditions)
- `andKey()` → extends the last condition (AND within condition)

### DCB Spec Mapping

| DCB Spec | BoundlessDB |
|---|---|
| QueryItem.types (OR within) | `matchType('A', 'B')` |
| QueryItem.tags (AND within) | `.andKey('key', 'value')` chain |
| Tag-only QueryItem | `matchKey('key', 'value')` |
| Multiple QueryItems (OR) | Multiple `matchType()` / `matchKey()` calls |

### Tests

- **214 tests** (up from 174): +40 new tests covering key-only queries, multi-type queries, AND/OR combinations, appendCondition propagation, and error cases.

### Documentation

- README updated with new API examples throughout
- `docs/sqlite-queries.md`: New sections for key-only, key-only AND, multi-type queries. Decision logic expanded to all 8 condition variants.
- Landing page: Updated highlight section and code examples
- Issue #83: Full API documentation with all query patterns

---

## [0.8.0] - 2026-02-28

### Added

- **Exponential backoff with jitter** for PostgreSQL serialization retries. Default: 10 retries, 50ms base delay, full jitter. Configurable via `PostgresRetryOptions`.
  ```typescript
  new PostgresStorage(url, { maxRetries: 10, retryBaseMs: 50, retryJitter: true });
  ```
- **`--conflicts` flag** for benchmark scripts. Tests conflict detection overhead and concurrent writers (10 parallel writers, same/different keys).
- **Aggressive conflict benchmarks**: 50 iterations × 10 writers × 5 events per writer (~5,500 events per run).

### Fixed

- **PostgreSQL concurrent writers no longer crash** under high contention. Previously 3 retries without backoff caused failures with 10+ parallel writers.

## [0.7.0] - 2026-02-28

### Added

- **`store.all()`**: Read all events without specifying event types. Supports `.fromPosition()` and `.limit()` for pagination.
  ```typescript
  // All events, paginated
  const result = await store.all().fromPosition(lastSeen).limit(1000).read();
  
  // All events
  const result = await store.all().read();
  ```
- **`store.query()` on browser EventStore**: Was missing, now available for sql.js/in-memory usage.
- **174 tests** (up from 153).

## [0.6.0] - 2026-02-27

### Breaking Changes

- **Auto-reindex removed.** Config hash mismatch on startup now throws an error instead of silently reindexing. Run the reindex script before starting the application.

### Added

- **Reindex script** (`scripts/reindex.ts`): Production-safe batch-based reindex with live progress, crash recovery, and configurable batch size.
  ```bash
  npx tsx scripts/reindex.ts --config ./consistency.config.ts --db ./events.sqlite
  ```
- **`reindexBatch()` method** on all storage engines: cursor-based batching with `onProgress` callback and resume-from-crash support.
- **`--events` flag** for benchmark scripts: explicit named parameter for target event count.
- **`--config` flag** for benchmark and reindex scripts: load consistency config from external file.
- **`--db` / `--connection` flags** for benchmark scripts: custom database path.
- **Combined benchmark + reindex script** (`benchmark/bench-and-reindex.ts`): Runs the full workflow in one command.
- **Shared consistency config** (`benchmark/consistency.config.ts`): Single config file for benchmarks and reindex.
- **Minimal consistency config** (`benchmark/consistency.config.minimal.ts`): For testing reindex with different key configurations.
- **Benchmark + reindex workflow documentation** (`docs/benchmark-reindex-workflow.md`).
- **Multi-key AND queries in SQL docs** (`docs/sqlite-queries.md`): INTERSECT approach, MATERIALIZED variant, decision logic.

### Changed

- **Demo app overhauled**: Updated to current API (v0.5.0). Removed token-based endpoints, uses `appendCondition`. Fixed broken dependency (`@sbortz/event-store` -> `boundlessdb`).
- **Landing page**: "Auto-Reindex" renamed to "One-Command Reindex" with CLI output example.

### Reindex at Scale

| Events | Duration |
|---|---|
| 10k | < 1s |
| 100k | ~3s |
| 1M | ~13s |

## [0.5.0] - 2026-02-27

### Added

- **Multi-Key AND Queries**: Filter events that match ALL specified keys on the same event. Implements the DCB spec requirement for multi-tag QueryItems.
  ```typescript
  // Fluent API
  store.query()
    .matchType('StudentSubscribed')
    .withKey('course', 'cs101')
    .withKey('student', 'alice')  // AND: same event must have both keys
    .read();

  // Object API
  store.read({
    conditions: [{
      type: 'StudentSubscribed',
      keys: [
        { name: 'course', value: 'cs101' },
        { name: 'student', value: 'alice' }
      ]
    }]
  });
  ```
- **`.withKey(key, value)`** on QueryBuilder: adds an AND key to the last condition. Throws if called without a preceding `.matchType()` or `.matchTypeAndKey()`.
- **`MultiKeyConstrainedCondition` type**: `{ type, keys: [{ name, value }] }` for multi-key conditions.
- **`normalizeCondition()`**, **`hasKeys()`**, **`isMultiKeyCondition()`** exported as helpers.
- **AND vs OR** documentation in README.

### Changed

- **sql.js storage rewritten** to CTE-based query approach (was naive JOIN + OR). Now mirrors the SQLite/better-sqlite3 strategy.
- **Backward compatible**: `{ type, key, value }` is still accepted and normalized internally to `{ type, keys: [{ name: key, value }] }`.

### SQL Strategy

Multi-key conditions use **INTERSECT** within a CTE. Each key gets its own sub-select on `idx_key_position`; INTERSECT returns only positions with ALL keys:

```sql
SELECT position FROM event_keys WHERE key_name = 'course' AND key_value = 'cs101'
INTERSECT
SELECT position FROM event_keys WHERE key_name = 'student' AND key_value = 'alice'
```

Single-key conditions (1 key) skip INTERSECT and use the existing efficient path.

### Tests

- 140 tests (was 118), +22 new tests covering multi-key AND, mixed AND+OR, 3+ keys, backward compat, AppendCondition conflict detection, error cases.

## [0.4.0] - 2026-02-24

### Added

- **Atomic conflict detection**: `appendWithCondition()` performs conflict check and write in a single transaction. Enables safe multi-node deployments (e.g. Supabase Edge Functions).
- **PostgreSQL SERIALIZABLE isolation**: Concurrent appends with overlapping consistency keys are detected automatically. Auto-retry on serialization failure (max 3 attempts).
- **PostgreSQL 50M benchmark results** on landing page.

### Changed

- **Storage interface**: `append()` + `getEventsSince()` replaced by `appendWithCondition()`. Public API (`store.read()`, `store.append()`, `store.query()`) is unchanged.
- Conflict check logic moved from EventStore into Storage layer for atomicity.

### Performance

- **50M events (PostgreSQL 16, shuffled):**
  - Constrained (167 results): 3.73ms
  - Highly selective (10 results): 1.14ms
  - Mixed 2 types (334 results): 3.83ms
  - Full aggregate (2,004 results): 7.96ms
  - Write throughput: 3,797 evt/s (LUKS encrypted)

## [0.3.1] - 2026-02-24

### Performance

- **SQLite:** `INDEXED BY idx_key_position` forces keys-first query plan. Constrained queries up to 3,386x faster.
- **PostgreSQL:** Reversed join order (event_keys → events) with separate CTEs per key group for optimal index usage.
- **PostgreSQL:** Batch inserts — single INSERT for all events + single INSERT for all keys. Always 3 roundtrips per append() regardless of batch size.

### Benchmark results at 5M events

| Query | SQLite (disk) | PostgreSQL |
|---|---|---|
| Constrained (167 results) | 0.63ms | 2.97ms |
| Highly selective (10 results) | 0.07ms | 0.46ms |
| Full aggregate (2,004 results) | 7.22ms | 7.46ms |

Write throughput: SQLite 26,827 evt/s · PostgreSQL 6,950 evt/s

### Other

- Benchmark CLI with live progress, throughput, ETA, and p50/p99 percentiles
- Landing page: performance section with 5M benchmark results

## [0.3.0] - 2026-02-23

### Breaking Changes

#### Removed: Key-Only Queries

Key-only queries (`{ key, value }` without `type`) have been removed.

**Why?** The feature assumed that the same key name has consistent semantics and transforms across all event types. In practice, this isn't guaranteed:

```typescript
// Problem: Different transforms for the same key name
consistency: {
  CourseCreated: [{ key: 'course', path: '$.id' }],
  StudentSubscribed: [{ key: 'course', path: '$.courseId', transform: 'toLowerCase' }]
}

// Query { key: 'course', value: 'CS101' } would only match CourseCreated,
// because StudentSubscribed stores 'cs101' (lowercase).
// This is confusing and error-prone.
```

**Migration:** Replace key-only conditions with explicit type-based conditions:

```typescript
// Before
const result = await store.read({
  conditions: [{ key: 'course', value: 'cs101' }]
});

// After
const result = await store.read({
  conditions: [
    { type: 'CourseCreated', key: 'course', value: 'cs101' },
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
    { type: 'StudentUnsubscribed', key: 'course', value: 'cs101' }
  ]
});
```

**Removed:**
- `KeyOnlyCondition` type
- `isKeyOnlyCondition()` type guard  
- `matchKey()` from QueryBuilder

## [0.2.0] - 2026-02-23

### Performance

#### Query Optimization with CTEs
- SQLite and PostgreSQL now use Common Table Expressions (CTEs) with UNION instead of OR clauses
- **~90% faster** for mixed queries (unconstrained + constrained + key-only)
- Each condition type uses optimal index independently
- Benchmarks available: `npm run benchmark` (SQLite) and `npm run benchmark:postgres` (PostgreSQL)

### Breaking Changes

#### Changed: AppendCondition now DCB Spec Compliant
- Renamed `conditions` → `failIfEventsMatch`
- Renamed `position` → `after` (now optional!)
- **Migration:**
  ```typescript
  // Before
  const condition = {
    position: 42n,
    conditions: [{ type: 'X', key: 'k', value: 'v' }]
  };
  
  // After (DCB spec compliant)
  const condition = {
    failIfEventsMatch: [{ type: 'X', key: 'k', value: 'v' }],
    after: 42n  // optional! if omitted, checks ALL events
  };
  ```
- See: https://dcb.events/specification/#append-condition

#### Removed: Token/Cryptographic Signing
- Removed `token.ts` and `token.browser.ts`
- Removed `secret` option from `EventStoreOptions`
- **Migration:** Use `appendCondition` directly (see below)

#### Removed: Decider Pattern Helpers
- Removed `src/decider.ts` with `Decider` type, `evolve()` and `decide()` helpers
- **Migration:** Use plain functions with standard `reduce`:
  ```typescript
  // Before
  const state = evolve(events, decider);
  const newEvents = decide(command, state, decider);
  
  // After
  const state = events.reduce(evolve, initialState);
  const newEvents = decide(command, state);
  ```

#### Changed: Token → AppendCondition
- `read()` now returns `appendCondition` as a plain object (not encoded token)
- `append()` accepts `AppendCondition` directly
- **Migration:**
  ```typescript
  // Before
  const { events, token } = await store.read({ conditions });
  await store.append(newEvents, token);
  
  // After  
  const { events, appendCondition } = await store.read({ conditions });
  await store.append(newEvents, appendCondition);
  ```

### Added

#### QueryResult Class
- `read()` returns a `QueryResult` with helper methods:
  - `isEmpty()`, `count`, `first()`, `last()`
  - `position`, `conditions`, `appendCondition`

#### Typed Events
- `Event<Type, Payload>` marker type for type-safe events
- `read<E>()` and `append<E>()` support generics

#### Union Types for QueryCondition
- `UnconstrainedCondition`: `{ type: 'X' }` — match all events of type
- `ConstrainedCondition`: `{ type: 'X', key: 'a', value: 'b' }` — match specific key
- Partial conditions like `{ type: 'X', key: 'a' }` are now TypeScript errors

#### Type Guard
- `isConstrainedCondition()` exported for storage implementations

#### Fluent Query API
- Chainable query builder: `store.query<E>()`
- Methods:
  - `matchType('X')` — all events of type X (unconstrained)
  - `matchTypeAndKey('X', 'k', 'v')` — events of type X where k=v (constrained)
  - `matchKey('k', 'v')` — ALL events where k=v, any type (key-only)
  - `fromPosition(n)`, `limit(n)`, `read()`
  ```typescript
  const result = await store.query<CourseEvent>()
    .matchType('CourseCreated')
    .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
    .matchKey('student', 'alice')  // all events for alice!
    .read();
  ```

#### Key-only Queries
- New `QueryCondition` type: `{ key, value }` (no type!)
- Query ALL events with a specific key, regardless of event type
- Use case: Aggregate queries ("all events for student alice")
  ```typescript
  // Get everything for a specific student
  const result = await store.query()
    .matchKey('student', 'alice')
    .read();
  // Returns: StudentEnrolled, LessonCompleted, CertificateIssued, etc.
  ```

#### AppendCondition Cases
Four patterns for consistency checks:
1. **Read → Append**: Use `result.appendCondition` from read
2. **Manual Position**: `{ failIfEventsMatch: [...], after: 42n }`
3. **Uniqueness Check**: `{ failIfEventsMatch: [...] }` (no `after` = check ALL)
4. **Blind Append**: Pass `null` (no consistency check)

### Changed

- Empty `conditions: []` now returns all events (was: error)
- `appendCondition` is a plain object: `{ position: bigint, conditions: QueryCondition[] }`

### Documentation

- Landing page redesigned with tabbed code examples
- README updated to use `decide` pattern
- Removed npm install section (package not yet published)

## [0.1.0] - 2026-02-20

### Added

- Initial release
- DCB-inspired Event Store with config-based consistency keys
- Storage backends: SQLite, PostgreSQL, sql.js (browser), In-Memory
- Auto-reindex on config change
- Conflict detection with delta
