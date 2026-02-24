# SQLite Query Internals

How Boundless queries events in SQLite, what optimizations are applied, and why.

## Schema

```sql
CREATE TABLE events (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  data TEXT NOT NULL,
  metadata TEXT,
  timestamp TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_keys (
  position INTEGER NOT NULL,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  PRIMARY KEY (position, key_name, key_value)
);

CREATE INDEX idx_event_type ON events(event_type);
CREATE INDEX idx_key ON event_keys(key_name, key_value);
CREATE INDEX idx_key_position ON event_keys(key_name, key_value, position);
```

`events` holds the append-only log. `event_keys` maps each event to its consistency keys (many-to-many). The `position` column is the global ordering.

## Query Types

Boundless has two types of `QueryCondition`:

- **Unconstrained**: `{ type: 'CourseCreated' }` — match by event type only
- **Constrained**: `{ type: 'StudentEnrolled', key: 'course', value: 'course-50' }` — match by type + key

Queries can combine multiple conditions. Each condition becomes its own CTE, and results are merged via `UNION`.

---

## 1. Unconstrained Query (type only)

**Use case**: "Give me all `CourseCreated` events."

```typescript
const result = await store.query()
  .matchType('CourseCreated')
  .read();
```

**Generated SQL**:

```sql
SELECT position, event_id, event_type, data, metadata, timestamp
FROM events
WHERE event_type IN ('CourseCreated')
ORDER BY position;
```

**Query plan**:
```
SEARCH events USING INDEX idx_event_type (event_type=?)
```

Straightforward index scan. Performance scales with result count, not store size.

---

## 2. Constrained Query (type + key)

**Use case**: "Give me all `StudentEnrolled` events for `course-50`."

```typescript
const result = await store.query()
  .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
  .read();
```

### The naive query (broken at scale)

```sql
SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
FROM event_keys k
INNER JOIN events e ON e.position = k.position
WHERE k.key_name = 'course' AND k.key_value = 'course-50'
  AND e.event_type = 'StudentEnrolled'
ORDER BY position;
```

**Problem**: SQLite's query planner sees two options:
1. Start from `idx_key_position` → find positions for `(course, course-50)` → join events → filter type
2. Start from `idx_event_type` → find all `StudentEnrolled` → join keys → filter key

At 5M+ events, option 2 scans hundreds of thousands of rows. But SQLite often picks it because it can combine `event_type` + `rowid` filtering in one index pass. This is the wrong choice when keys are highly selective.

### Fix 1: INDEXED BY (not enough)

```sql
SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
FROM event_keys k INDEXED BY idx_key_position
INNER JOIN events e ON e.position = k.position
WHERE k.key_name = 'course' AND k.key_value = 'course-50'
  AND e.event_type = 'StudentEnrolled'
ORDER BY position;
```

`INDEXED BY` forces `event_keys` to use `idx_key_position`. But it doesn't prevent SQLite from choosing `idx_event_type` as the *driving* table. In practice, SQLite still sometimes starts from `events` and uses the key index as a lookup.

**Query plan** (still broken):
```
SEARCH e USING INDEX idx_event_type (event_type=? AND rowid>?)
SEARCH k USING COVERING INDEX idx_key_position (key_name=? AND key_value=? AND position=?)
```

Events first, keys second. Wrong direction.

### Fix 2: MATERIALIZED CTE (the actual fix)

```sql
WITH keys_0 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
)
SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
FROM keys_0 k
INNER JOIN events e ON e.position = k.position
WHERE e.event_type = 'StudentEnrolled'
ORDER BY position;
```

`AS MATERIALIZED` prevents SQLite from flattening the CTE into the outer query. This forces a two-step execution:

1. **Key scan**: `idx_key_position` finds all positions for `(course, course-50)` — very few rows
2. **Primary key lookup**: Join each position against `events` by rowid — instant per row

**Query plan** (correct):
```
MATERIALIZE keys_0
  SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
SCAN k
SEARCH e USING INTEGER PRIMARY KEY (rowid=?)
```

Keys first, events second. The index does the heavy lifting.

**Impact at 100k events**:
| Query | Without MATERIALIZED | With MATERIALIZED | Speedup |
|-------|--------------------:|------------------:|--------:|
| Cold read (position > 5) | 34ms | 0.15ms | **230x** |
| Recent read (position > 99k) | 0.35ms | 0.007ms | **49x** |

---

## 3. Constrained Query with Position Filter

**Use case**: Condition check during append — "Are there any `StudentEnrolled` events for `course-0` after position 2005?"

This query runs internally when appending with an `AppendCondition`. The position filter comes from the `after` field:

```typescript
// Read current state
const result = await store.query()
  .matchTypeAndKey('StudentEnrolled', 'course', 'course-0')
  .read();
// result.appendCondition = {
//   failIfEventsMatch: [{ type: 'StudentEnrolled', key: 'course', value: 'course-0' }],
//   after: 2005n  ← position of the last matching event
// }

// Append with condition — triggers the position-filtered query internally
await store.append([
  { type: 'StudentEnrolled', data: { courseId: 'course-0', studentId: 'new-student' } }
], result.appendCondition);
```

**Generated SQL** (conflict check inside `append`):

```sql
WITH keys_0 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-0'
    AND position > 2005
)
SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
FROM keys_0 k
INNER JOIN events e ON e.position = k.position
WHERE e.event_type = 'StudentEnrolled'
ORDER BY position;
```

The `position > 2005` filter runs *inside* the key index. Since `idx_key_position` is `(key_name, key_value, position)`, this is a range scan starting from position 2005. If no events exist after that position, the scan returns immediately.

This is the critical path for `AppendCondition` conflict checks. Without `MATERIALIZED`, this query scanned all `StudentEnrolled` events (hundreds of thousands) via `idx_event_type`.

---

## 4. Mixed Query (multiple conditions)

**Use case**: "Give me enrollments and certificates for `course-50`."

```typescript
const result = await store.query()
  .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
  .matchTypeAndKey('CertificateIssued', 'course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH keys_0 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
),
constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_0 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'StudentEnrolled'
),
keys_1 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
),
constrained_1 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_1 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'CertificateIssued'
)
SELECT * FROM (
  SELECT * FROM constrained_0
  UNION
  SELECT * FROM constrained_1
) AS combined
ORDER BY position;
```

Each condition gets its own key-scan CTE + event-join CTE. Results are merged with `UNION` (deduplicates) and sorted by position.

Why separate CTEs per condition instead of one CTE with `OR`?
- SQLite can't use an index efficiently for `(type = 'A' AND key = 'x') OR (type = 'B' AND key = 'y')`
- Separate CTEs let each one use the optimal index path independently
- `UNION` handles deduplication when events match multiple conditions

---

## 5. Full Aggregate Query (3 types, same key)

**Use case**: "Give me the full course state — enrollments, lessons, and certificates for `course-50`."

```typescript
const result = await store.query()
  .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
  .matchTypeAndKey('LessonCompleted', 'course', 'course-50')
  .matchTypeAndKey('CertificateIssued', 'course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH keys_0 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
),
constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_0 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'StudentEnrolled'
),
keys_1 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
),
constrained_1 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_1 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'LessonCompleted'
),
keys_2 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
),
constrained_2 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_2 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'CertificateIssued'
)
SELECT * FROM (
  SELECT * FROM constrained_0
  UNION
  SELECT * FROM constrained_1
  UNION
  SELECT * FROM constrained_2
) AS combined
ORDER BY position;
```

Same pattern as #4. The key index is scanned 3 times (once per type), but each scan only touches the positions for `course-50`. At 50M events, this returns ~2000 results in ~4ms.

---

## 6. Mixed Constrained + Unconstrained

**Use case**: "Give me all `CourseCreated` events (any course) plus all enrollments for `course-50`."

```typescript
const result = await store.query()
  .matchType('CourseCreated')
  .matchTypeAndKey('StudentEnrolled', 'course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH unconstrained_matches AS (
  SELECT position, event_id, event_type, data, metadata, timestamp
  FROM events
  WHERE event_type IN ('CourseCreated')
),
keys_0 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
),
constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_0 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'StudentEnrolled'
)
SELECT * FROM (
  SELECT * FROM unconstrained_matches
  UNION
  SELECT * FROM constrained_0
) AS combined
ORDER BY position;
```

Unconstrained conditions use `idx_event_type` directly (no key join needed). Constrained conditions use the MATERIALIZED key-scan pattern. Both are merged via `UNION`.

---

## Index Overview

| Index | Columns | Purpose |
|-------|---------|---------|
| `PRIMARY KEY` (events) | `position` (rowid) | Ordered log, fast PK lookup |
| `idx_event_type` | `event_type` | Unconstrained queries |
| `idx_key` | `key_name, key_value` | Key existence checks |
| `idx_key_position` | `key_name, key_value, position` | **Constrained queries** (covering index for key scan + position range) |

The key insight: `idx_key_position` is a **covering index** for the key-scan step. SQLite doesn't need to touch `event_keys` rows at all — the index contains `position` directly. This makes key scans extremely fast.

---

## Why These Tricks?

### Problem: SQLite's Query Planner

SQLite uses a cost-based query planner. It estimates which index to use based on table statistics. For a join like `event_keys JOIN events`, it considers:

1. Scan `events` by type, check keys → good when keys aren't selective
2. Scan `event_keys` by key, check type → good when keys are selective

In a DCB event store, keys are almost always more selective than types. A single course key might match 167 events out of 50M. But the `StudentEnrolled` type matches 25M events out of 50M.

SQLite doesn't always make the right choice. `INDEXED BY` tells it which index to use on a table, but doesn't control *join order*. `MATERIALIZED` is the tool that forces execution order.

### Why Not Just One Big Query with OR?

```sql
-- This does NOT work well:
SELECT e.* FROM events e
JOIN event_keys k ON e.position = k.position
WHERE (e.event_type = 'StudentEnrolled' AND k.key_name = 'course' AND k.key_value = 'course-50')
   OR (e.event_type = 'CertificateIssued' AND k.key_name = 'course' AND k.key_value = 'course-50')
ORDER BY position;
```

SQLite can't use any index efficiently when conditions are combined with `OR` across a join. It falls back to a full table scan. Separate CTEs with `UNION` let each path use its optimal index.

### Benchmark Results (50M events, SQLite on disk)

| Query | Results | Time |
|-------|--------:|-----:|
| Single type | 24,939 | 117ms |
| Constrained (type + key) | 167 | **0.42ms** |
| Highly selective | 10 | **0.08ms** |
| Mixed (2 types, 1 key) | 334 | **0.96ms** |
| Full aggregate (3 types) | 2,004 | **4.40ms** |
| Append (recent read) | — | **0.36ms** |
| Append (cold read) | — | previously 2,019ms, now ~0.15ms with MATERIALIZED fix |

Sub-millisecond for selective key-based queries, regardless of total store size. The B-tree depth is the limiting factor, and it barely changes between 5M and 50M events.

---

## Testing Against a Real DB

To run these queries against a benchmark database:

```bash
# Generate a test DB (e.g. 100k events)
cd boundless
npx tsx benchmark/sqlite-query.ts --disk 100k

# Open with SQLite CLI
sqlite3 boundless-bench.sqlite

# Check size
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM event_keys;

# Run any query from above, e.g.:
EXPLAIN QUERY PLAN
WITH keys_0 AS MATERIALIZED (
  SELECT position
  FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
)
SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
FROM keys_0 k
INNER JOIN events e ON e.position = k.position
WHERE e.event_type = 'StudentEnrolled'
ORDER BY position;

-- Compare with the non-MATERIALIZED version:
EXPLAIN QUERY PLAN
SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
FROM event_keys k INDEXED BY idx_key_position
INNER JOIN events e ON e.position = k.position
WHERE k.key_name = 'course' AND k.key_value = 'course-50'
  AND e.event_type = 'StudentEnrolled'
ORDER BY position;
```

The `EXPLAIN QUERY PLAN` output tells you which index SQLite chose and in what order. Look for `MATERIALIZE` and `SEARCH ... USING INTEGER PRIMARY KEY` to confirm the correct plan.
