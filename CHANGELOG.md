# Changelog

All notable changes to BoundlessDB will be documented in this file.

## [Unreleased]

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
- Methods: `matchType()`, `matchKey()`, `fromPosition()`, `limit()`, `read()`
  ```typescript
  const { events, appendCondition } = await store.query<CourseEvent>()
    .matchType('CourseCreated')
    .matchKey('StudentSubscribed', 'course', 'cs101')
    .read();
  ```

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
