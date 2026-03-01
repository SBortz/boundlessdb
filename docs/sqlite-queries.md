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

Boundless has these `QueryCondition` types:

- **Unconstrained**: `{ type: 'CourseCreated' }` — match by event type only
- **Constrained (single key)**: `{ type: 'StudentEnrolled', key: 'course', value: 'course-50' }` — match by type + key
- **Constrained (multi-key AND)**: `{ type: 'StudentEnrolled', keys: [...] }` — match by type + ALL keys (INTERSECT)
- **Key-only**: `{ keys: [{ name: 'course', value: 'course-50' }] }` — match by key, any event type
- **Key-only AND**: `{ keys: [{ name: 'course', value: 'course-50' }, { name: 'student', value: 'student-50' }] }` — match events having ALL keys (INTERSECT)
- **Multi-type**: `{ types: ['CourseCreated', 'CourseCancelled'] }` — match by multiple types (OR within)
- **Multi-type constrained**: `{ types: [...], keys: [...] }` — match by multiple types + keys

Queries can combine multiple conditions. Each condition becomes its own CTE, and results are merged via `UNION ALL`. Within a multi-key condition, keys are combined via `INTERSECT`.

## The Two Strategies

Boundless uses a **conditional strategy** depending on whether a position filter is active:

| Scenario | Strategy | Why |
|----------|----------|-----|
| Normal queries (no position filter) | Flat CTE with `INDEXED BY` | SQLite picks keys-first naturally; avoids materializing unnecessary positions |
| Position-filtered queries (AppendCondition) | `MATERIALIZED` CTE | Prevents SQLite from scanning millions of index entries via `idx_event_type` |

This distinction is critical. Using MATERIALIZED everywhere causes a regression at scale (see [Lessons Learned](#lessons-learned) below).

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
  .matchType('StudentEnrolled').andKey('course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'StudentEnrolled'
)
SELECT * FROM (SELECT * FROM constrained_0) AS combined
ORDER BY position;
```

**Query plan** (correct — keys first):
```
SEARCH k USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
SEARCH e USING INTEGER PRIMARY KEY (rowid=?)
```

The `INDEXED BY` hint guides SQLite to use `idx_key_position` as the driving index. It scans the covering index for all positions matching the key, then looks up each event by primary key. Only matching rows (where `event_type` matches) are returned.

At 50M events, this returns 167 results in **0.49ms** (shuffled benchmark, LUKS-encrypted disk).

---

## 3. Constrained Query with Position Filter (MATERIALIZED)

**Use case**: Condition check during append — "Are there any `StudentEnrolled` events for `course-0` after position 2005?"

This query runs internally when appending with an `AppendCondition`. The position filter comes from the `after` field:

```typescript
const result = await store.query()
  .matchType('StudentEnrolled').andKey('course', 'course-0')
  .read();
// result.appendCondition.after = 2005n (position of last matching event)

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
),
constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_0 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'StudentEnrolled'
)
SELECT * FROM (SELECT * FROM constrained_0) AS combined
ORDER BY position;
```

**Query plan**:
```
MATERIALIZE keys_0
  SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=? AND position>?)
SCAN k
SEARCH e USING INTEGER PRIMARY KEY (rowid=?)
```

**Why MATERIALIZED here?** Without it, SQLite flattens the CTE and uses `idx_event_type` as the driving index, scanning ALL events of a type after the position. At 50M events, that's ~25M index entries (2,019ms). With MATERIALIZED, the key index range scan often returns zero rows (if no new events match), completing instantly.

**Why NOT MATERIALIZED for normal queries (section 2)?** The MATERIALIZED CTE fetches ALL positions for a key, across ALL event types. For key `(course, course-50)`, that's ~2,005 positions (enrollments + lessons + certificates + created). All 2,005 event rows get read from disk, but only 167 match `StudentEnrolled`. On a large DB that doesn't fit in RAM, those 1,838 unnecessary random disk reads cost ~200ms.

---

## 4. Mixed Query (multiple conditions)

**Use case**: "Give me enrollments and certificates for `course-50`."

```typescript
const result = await store.query()
  .matchType('StudentEnrolled').andKey('course', 'course-50')
  .matchType('CertificateIssued').andKey('course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'StudentEnrolled'
),
constrained_1 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'CertificateIssued'
)
SELECT * FROM (
  SELECT * FROM constrained_0
  UNION
  SELECT * FROM constrained_1
) AS combined
ORDER BY position;
```

Each condition gets its own flat CTE with `INDEXED BY`. Results are merged with `UNION` (deduplicates) and sorted by position.

Why separate CTEs per condition instead of one CTE with `OR`?
- SQLite can't use an index efficiently for `(type = 'A' AND key = 'x') OR (type = 'B' AND key = 'y')`
- Separate CTEs let each one use the optimal index path independently
- `UNION` handles deduplication when events match multiple conditions

---

## 5. Full Aggregate Query (3 types, same key)

**Use case**: "Give me the full course state — enrollments, lessons, and certificates for `course-50`."

```typescript
const result = await store.query()
  .matchType('StudentEnrolled').andKey('course', 'course-50')
  .matchType('LessonCompleted').andKey('course', 'course-50')
  .matchType('CertificateIssued').andKey('course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'StudentEnrolled'
),
constrained_1 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'LessonCompleted'
),
constrained_2 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'CertificateIssued'
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

Same pattern as #4. At 50M events, this returns ~2,004 results in **4.59ms**.

---

## 6. Mixed Constrained + Unconstrained

**Use case**: "Give me all `CourseCreated` events (any course) plus all enrollments for `course-50`."

```typescript
const result = await store.query()
  .matchType('CourseCreated')
  .matchType('StudentEnrolled').andKey('course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH unconstrained_matches AS (
  SELECT position, event_id, event_type, data, metadata, timestamp
  FROM events
  WHERE event_type IN ('CourseCreated')
),
constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'StudentEnrolled'
)
SELECT * FROM (
  SELECT * FROM unconstrained_matches
  UNION
  SELECT * FROM constrained_0
) AS combined
ORDER BY position;
```

Unconstrained conditions use `idx_event_type` directly (no key join needed). Constrained conditions use the flat CTE with `INDEXED BY`. Both are merged via `UNION`.

---

## 7. Multi-Key AND Query (INTERSECT)

**Use case**: "Has student-50 already enrolled in course-50?" — the event must have BOTH keys.

```typescript
const result = await store.query()
  .matchType('StudentEnrolled')
  .andKey('course', 'course-50')
  .andKey('student', 'student-50')
  .read();
```

**Generated SQL** (no position filter — flat CTE):

```sql
WITH constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM (
    SELECT position FROM event_keys INDEXED BY idx_key_position
    WHERE key_name = 'course' AND key_value = 'course-50'
    INTERSECT
    SELECT position FROM event_keys INDEXED BY idx_key_position
    WHERE key_name = 'student' AND key_value = 'student-50'
  ) keys
  INNER JOIN events e ON e.position = keys.position
  WHERE e.event_type = 'StudentEnrolled'
)
SELECT * FROM (SELECT * FROM constrained_0) AS combined
ORDER BY position;
```

**Query plan** (100k events):
```
CO-ROUTINE keys
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
    INTERSECT USING TEMP B-TREE
      SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
SEARCH e USING INDEX idx_event_type (event_type=?)
BLOOM FILTER ON keys (position=?)
SEARCH keys USING AUTOMATIC COVERING INDEX (position=?)
```

Each key gets its own sub-select on `idx_key_position` (covering index — no table access needed). `INTERSECT` returns only positions that appear in ALL sub-selects via a temp B-tree. The result is typically much smaller than either key alone, so the subsequent join to `events` touches fewer rows.

**Why this is fast**: If `course=course-50` has 2,000 positions and `student=student-50` has 200 positions, INTERSECT yields perhaps 20 positions. Only those 20 events get read from disk.

**Single-key optimization**: When a condition has only 1 key (the common case), INTERSECT is skipped entirely. The query falls back to the flat CTE from [section 2](#2-constrained-query-type--key), avoiding the overhead of a compound query and temp B-tree.

---

## 8. Multi-Key AND with Position Filter (MATERIALIZED + INTERSECT)

**Use case**: Conflict check during append — "Are there any new `StudentEnrolled` events for `course-50` AND `student-50` after position 2005?"

```sql
WITH keys_0 AS MATERIALIZED (
  SELECT position FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
    AND position > 2005
  INTERSECT
  SELECT position FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'student' AND key_value = 'student-50'
    AND position > 2005
),
constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_0 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'StudentEnrolled'
)
SELECT * FROM (SELECT * FROM constrained_0) AS combined
ORDER BY position;
```

**Query plan** (100k events):
```
MATERIALIZE keys_0
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=? AND position>?)
    INTERSECT USING TEMP B-TREE
      SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=? AND position>?)
SCAN k
SEARCH e USING INTEGER PRIMARY KEY (rowid=?)
```

This combines both optimizations:
- **MATERIALIZED** prevents SQLite from flattening the CTE and choosing `idx_event_type` as the driving index (same rationale as [section 3](#3-constrained-query-with-position-filter-materialized))
- **INTERSECT** narrows the materialized positions to only those matching ALL keys
- Each sub-select includes `AND position > ?` to range-scan from the threshold

The `position > ?` filter is applied per sub-select (not just on the outer CTE) so that `idx_key_position` can use all three columns `(key_name, key_value, position)` as a range scan. This is critical — without it, the covering index would scan all positions for the key and filter afterward.

---

## 9. Mixed: Multi-Key AND + Single-Key OR (UNION ALL)

**Use case**: "Has student-50 enrolled in course-50? Also, was course-50 cancelled?"

```typescript
const result = await store.query()
  .matchType('StudentEnrolled')
  .andKey('course', 'course-50')
  .andKey('student', 'student-50')
  .matchType('CourseCancelled').andKey('course', 'course-50')
  .read();
```

**Generated SQL**:

```sql
WITH constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM (
    SELECT position FROM event_keys INDEXED BY idx_key_position
    WHERE key_name = 'course' AND key_value = 'course-50'
    INTERSECT
    SELECT position FROM event_keys INDEXED BY idx_key_position
    WHERE key_name = 'student' AND key_value = 'student-50'
  ) keys
  INNER JOIN events e ON e.position = keys.position
  WHERE e.event_type = 'StudentEnrolled'
),
constrained_1 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'CourseCancelled'
)
SELECT * FROM (
  SELECT * FROM constrained_0
  UNION ALL
  SELECT * FROM constrained_1
) AS combined
ORDER BY position;
```

**Query plan** (100k events):
```
MERGE (UNION ALL)
  LEFT
    CO-ROUTINE keys
      COMPOUND QUERY
        LEFT-MOST SUBQUERY
          SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
        INTERSECT USING TEMP B-TREE
          SEARCH event_keys USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
    SEARCH e USING INDEX idx_event_type (event_type=?)
    BLOOM FILTER ON keys (position=?)
    SEARCH keys USING AUTOMATIC COVERING INDEX (position=?)
  RIGHT
    SEARCH k USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
    SEARCH e USING INTEGER PRIMARY KEY (rowid=?)
```

The principle remains the same as existing mixed queries:
- Each condition = one CTE
- Multi-key conditions use INTERSECT within their CTE
- Single-key conditions use the flat `INDEXED BY` approach
- CTEs are merged via `UNION ALL` (OR semantics)

---

## 10. Key-Only Query (no type filter)

**Use case**: "Give me everything about course-50, regardless of event type."

```typescript
const result = await store.query()
  .matchKey('course', 'course-50')
  .read();
```

**Generated SQL** (no position filter):

```sql
WITH keyonly_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
)
SELECT * FROM (SELECT * FROM keyonly_0) AS combined
ORDER BY position;
```

Same structure as a constrained query, but without the `e.event_type = ?` filter. Returns events of ALL types that have the matching key.

**With position filter** (AppendCondition check):

```sql
WITH keyonly_keys_0 AS MATERIALIZED (
  SELECT position FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-50'
    AND position > 2005
),
keyonly_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keyonly_keys_0 k
  INNER JOIN events e ON e.position = k.position
)
SELECT * FROM (SELECT * FROM keyonly_0) AS combined
ORDER BY position;
```

Same MATERIALIZED strategy as constrained queries with position filter. No type filter on the events join.

---

## 11. Key-Only AND Query (INTERSECT, no type)

**Use case**: "Has Alice interacted with course cs101 in any way?"

```typescript
const result = await store.query()
  .matchKey('course', 'course-50')
  .andKey('student', 'student-50')
  .read();
```

**Generated SQL** (no position filter):

```sql
WITH keyonly_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM (
    SELECT position FROM event_keys INDEXED BY idx_key_position
    WHERE key_name = 'course' AND key_value = 'course-50'
    INTERSECT
    SELECT position FROM event_keys INDEXED BY idx_key_position
    WHERE key_name = 'student' AND key_value = 'student-50'
  ) keys
  INNER JOIN events e ON e.position = keys.position
)
SELECT * FROM (SELECT * FROM keyonly_0) AS combined
ORDER BY position;
```

Same INTERSECT pattern as multi-key constrained (section 7), but without the `WHERE e.event_type = ?` filter.

---

## 12. Multi-Type Query

**Use case**: "Give me all course lifecycle events for course-50."

```typescript
const result = await store.query()
  .matchType('CourseCreated', 'CourseCancelled')
  .andKey('course', 'course-50')
  .read();
```

**Generated SQL** (multi-type unconstrained, no keys):

```sql
-- matchType('CourseCreated', 'CourseCancelled') without keys:
WITH multitype_0 AS (
  SELECT position, event_id, event_type, data, metadata, timestamp
  FROM events
  WHERE event_type IN ('CourseCreated', 'CourseCancelled')
)
SELECT * FROM (SELECT * FROM multitype_0) AS combined
ORDER BY position;
```

**Generated SQL** (multi-type + key):

```sql
-- matchType('CourseCreated', 'CourseCancelled').andKey('course', 'course-50'):
WITH mtc_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type IN ('CourseCreated', 'CourseCancelled')
)
SELECT * FROM (SELECT * FROM mtc_0) AS combined
ORDER BY position;
```

Same structure as single-type constrained, but `event_type = ?` becomes `event_type IN (...)`. With position filter, the MATERIALIZED strategy is used (same as section 3).

---

## 13. Decision Logic Summary

```
Condition has...
├── 0 keys, 1 type (matchType)
│   → Simple WHERE event_type IN (...) — no key join
│
├── 0 keys, N types (matchType('A', 'B'))
│   → Simple WHERE event_type IN (...) — no key join
│
├── 1 key, 0 types (matchKey)
│   ├── No position filter → Flat CTE with INDEXED BY (no type filter)
│   └── With position filter → MATERIALIZED CTE (no type filter)
│
├── 1 key, 1 type (matchType().andKey())
│   ├── No position filter → Flat CTE with INDEXED BY
│   └── With position filter → MATERIALIZED CTE
│
├── 1 key, N types (matchType('A', 'B').andKey())
│   ├── No position filter → Flat CTE with INDEXED BY + IN (...)
│   └── With position filter → MATERIALIZED CTE + IN (...)
│
├── N keys, 0 types (matchKey().andKey())
│   ├── No position filter → Flat CTE with INTERSECT (no type filter)
│   └── With position filter → MATERIALIZED CTE with INTERSECT
│
├── N keys, 1 type (matchType().andKey().andKey())
│   ├── No position filter → Flat CTE with INTERSECT
│   └── With position filter → MATERIALIZED CTE with INTERSECT
│
└── N keys, N types (matchType('A', 'B').andKey().andKey())
    ├── No position filter → Flat CTE with INTERSECT + IN (...)
    └── With position filter → MATERIALIZED CTE with INTERSECT + IN (...)

Multiple conditions (OR) → Separate CTEs + UNION ALL
```

**Key insight**: INTERSECT operates *within* a single condition (AND semantics on keys). UNION ALL operates *between* conditions (OR semantics). This maps cleanly to the DCB query model: each condition specifies what events to match, and the store returns the union of all matches.

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

## Lessons Learned

### Why Not MATERIALIZED Everywhere?

Our first optimization attempt used `AS MATERIALIZED` for all constrained queries. At 100k events, it showed a 230x speedup. But at 50M events on a LUKS-encrypted laptop with 16GB RAM, it caused a **regression**:

| Query | Before MATERIALIZED | Always MATERIALIZED | Conditional (final) |
|-------|-------------------:|--------------------:|--------------------:|
| Constrained (167 results) | 0.42ms | 223ms | **0.49ms** |
| Highly selective (10 results) | 0.08ms | 2,110ms | **0.14ms** |
| Cold read append | 2,019ms | 228ms | **1.12ms** |

**Root cause**: MATERIALIZED fetches ALL key positions regardless of event type. For key `(course, course-50)`, that's ~2,005 positions across all types. Each position requires a random disk read on the events table. On a DB that doesn't fit in RAM, 2,005 random reads = ~200ms.

The flat CTE approach reads fewer data pages because SQLite's chosen plan only reads events that match both the key AND the type filter.

**The rule**: Use MATERIALIZED only when the position filter makes it worthwhile (AppendCondition checks where the alternative is scanning millions of index entries).

### INDEXED BY Does Not Control Join Order

`INDEXED BY` tells SQLite which index to use on a specific table, but it doesn't control which table drives the join. SQLite may still choose `idx_event_type` on the `events` table as the driving index, using the key index only for lookups.

In a flat CTE without position filter, SQLite actually picks the correct keys-first plan with just `INDEXED BY`:
```
SEARCH k USING COVERING INDEX idx_key_position (key_name=? AND key_value=?)
SEARCH e USING INTEGER PRIMARY KEY (rowid=?)
```

### Benchmark Methodology: Shuffle Mode

Sequential benchmarks suffer from page-cache bias: query A warms the cache for query B if they access the same data. At 50M events, this made some queries appear 500x faster than they actually are.

The `--shuffle` flag randomizes query execution order (Fisher-Yates), giving honest numbers without cache bias:
```bash
npx tsx benchmark/sqlite-query.ts --disk --shuffle 50m
```

### Benchmark Results (50M events, SQLite on disk, shuffled)

Measured on a laptop with LUKS-encrypted SSD, 16GB RAM.

| Query | Results | Time |
|-------|--------:|-----:|
| Single type | 24,941 | 117.58ms |
| Constrained (type + key) | 167 | **0.49ms** |
| Highly selective | 10 | **0.14ms** |
| Mixed (2 types, 1 key) | 334 | **1.41ms** |
| Full aggregate (3 types) | 2,004 | **4.59ms** |
| Append (single event) | — | 1.39ms |
| Read + Append (recent) | — | 1.93ms |
| Read + Append (cold) | — | **1.12ms** |

Sub-millisecond for selective key-based queries, regardless of total store size.

---

## Testing Against a Real DB

```bash
# Generate a test DB (cached between runs)
cd boundless
npx tsx benchmark/sqlite-query.ts --disk 100k

# Open with SQLite CLI
sqlite3 boundless-bench.sqlite

# Check size
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM event_keys;

# Normal query (flat CTE, keys-first):
EXPLAIN QUERY PLAN
WITH constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM event_keys k INDEXED BY idx_key_position
  INNER JOIN events e ON e.position = k.position
  WHERE k.key_name = 'course' AND k.key_value = 'course-50'
    AND e.event_type = 'StudentEnrolled'
)
SELECT * FROM (SELECT * FROM constrained_0) AS combined
ORDER BY position;
-- Expected: SEARCH k USING COVERING INDEX → SEARCH e USING INTEGER PRIMARY KEY

-- Position-filtered query (MATERIALIZED, for condition checks):
EXPLAIN QUERY PLAN
WITH keys_0 AS MATERIALIZED (
  SELECT position FROM event_keys INDEXED BY idx_key_position
  WHERE key_name = 'course' AND key_value = 'course-0' AND position > 2005
),
constrained_0 AS (
  SELECT e.position, e.event_id, e.event_type, e.data, e.metadata, e.timestamp
  FROM keys_0 k
  INNER JOIN events e ON e.position = k.position
  WHERE e.event_type = 'StudentEnrolled'
)
SELECT * FROM (SELECT * FROM constrained_0) AS combined
ORDER BY position;
-- Expected: MATERIALIZE keys_0 → SEARCH event_keys USING COVERING INDEX → SEARCH e USING INTEGER PRIMARY KEY
```

Look for `COVERING INDEX` and `INTEGER PRIMARY KEY` in the output to confirm the correct plan.
