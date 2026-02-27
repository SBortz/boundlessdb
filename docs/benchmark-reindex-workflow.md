# Benchmark + Reindex Workflow

How changing the consistency config affects the key index, and why reindexing is required.

## Overview

BoundlessDB extracts consistency keys from events based on your config. When you change the config (add, remove, or modify keys), the existing key index becomes invalid. The reindex script rebuilds it.

This workflow demonstrates the full cycle:
1. Benchmark with the original config (baseline)
2. Reindex to a different config
3. Benchmark again to see what changed
4. Reindex back to the original config
5. Benchmark again to confirm everything is restored

The key insight: **consistency boundaries are defined by your config, not by your events**. The same events produce different query results depending on which keys are extracted.

## The Two Configs

The benchmark ships with two configs that use the same four event types but extract different keys.

### Full Config (`benchmark/consistency.config.ts`)

```typescript
eventTypes: {
  CourseCreated:    { keys: [{ name: 'course', path: 'data.courseId' }] },
  StudentEnrolled:  { keys: [
    { name: 'course', path: 'data.courseId' },
    { name: 'student', path: 'data.studentId' },
  ]},
  LessonCompleted:  { keys: [
    { name: 'course', path: 'data.courseId' },
    { name: 'student', path: 'data.studentId' },
    { name: 'lesson', path: 'data.lessonId' },
  ]},
  CertificateIssued: { keys: [
    { name: 'course', path: 'data.courseId' },
    { name: 'student', path: 'data.studentId' },
  ]},
}
```

Three key dimensions: `course`, `student`, and `lesson`. Each event gets multiple keys. At 1M events this produces ~4M key entries in `event_keys`.

### Minimal Config (`benchmark/consistency.config.minimal.ts`)

```typescript
eventTypes: {
  CourseCreated:     { keys: [{ name: 'course', path: 'data.courseId' }] },
  StudentEnrolled:   { keys: [{ name: 'course', path: 'data.courseId' }] },
  LessonCompleted:   { keys: [{ name: 'course', path: 'data.courseId' }] },
  CertificateIssued: { keys: [{ name: 'course', path: 'data.courseId' }] },
}
```

Only the `course` key. No `student`, no `lesson`. At 1M events this produces ~1M key entries (one per event).

### What changes

The event data is identical. The `events` table doesn't change at all. Only `event_keys` is rebuilt:

| | Full Config | Minimal Config |
|---|---|---|
| Event types | 4 | 4 |
| Key dimensions | course, student, lesson | course |
| Keys per event | 1-3 (varies by type) | 1 |
| Total keys at 1M events | ~4M | ~1M |
| Query by `student` | Works (returns results) | Returns 0 results |

## Running the Workflow

```bash
npx tsx benchmark/bench-and-reindex.ts --events 1m --disk --shuffle
```

Options:
- `--events <size>` - Target event count (e.g. `10k`, `1m`, `50m`). Required.
- `--disk` - Use on-disk SQLite (default: in-memory)
- `--shuffle` - Randomize query order to avoid cache bias
- `--db <path>` - Custom SQLite database path

The script runs five steps automatically:
1. Benchmark with full config
2. Reindex to minimal config
3. Benchmark with minimal config
4. Reindex back to full config
5. Benchmark with full config again

## Results Walkthrough

Real results from `--events 1m --disk --shuffle`:

### Step 1: Benchmark with Full Config (baseline)

```
Single type (CourseCreated)            1.28ms    500
Constrained (Enrollments/course)       0.51ms    167
Constrained (Lessons/student)          0.11ms     10
Mixed (2 types/course)                 1.01ms    334
Full course aggregate (3 types)        4.14ms   2004
```

All queries work as expected. The `Lessons/student` query finds 10 events because the `student` key exists in the index.

### Step 2: Reindex to Minimal Config

```
Reindex complete: 1,000,561 events, 1,000,561 keys (12.6s)
```

The key count drops from ~4M to ~1M. Every event now has exactly one key (`course`). The `student` and `lesson` keys are gone.

### Step 3: Benchmark with Minimal Config

```
Single type (CourseCreated)            1.23ms    500
Constrained (Enrollments/course)       0.46ms    167
Constrained (Lessons/student)          0.09ms      0  ← student key gone!
Mixed (2 types/course)                 0.93ms    334
Full course aggregate (3 types)        3.75ms   2004
```

The `Lessons/student` query now returns **0 results**. The query still executes fast (0.09ms) because there's simply nothing to find. The `student` key doesn't exist in the index anymore, so no events match.

Queries that only use the `course` key still work fine. The `Enrollments/course` query returns the same 167 results.

### Step 4: Reindex back to Full Config

The script reindexes back to the full config, restoring all three key dimensions.

### Step 5: Benchmark with Full Config (restored)

Results match Step 1. The `Lessons/student` query returns 10 events again. Reindexing is fully reversible.

## Key Takeaways

**Config changes alter consistency boundaries.** The same events produce different query results depending on which keys are extracted. Removing the `student` key means you can no longer query by student. This is by design.

**Without reindex, the app throws an error.** BoundlessDB hashes your config and compares it on startup. If the hash doesn't match, it refuses to start. This prevents silent data inconsistencies in production.

**Reindex speed: ~13 seconds for 1M events.** Fast enough to run in CI/CD pipelines. The script processes events in configurable batches and shows live progress with ETA.

**The `student` key disappearing proves the index actually changed.** This isn't a theoretical exercise. The query result count dropping from 10 to 0 is concrete proof that the key index was rebuilt from scratch.

**Reindex is idempotent.** Running it twice with the same config is a no-op (the hash matches, so it skips). Switching back restores the original behavior exactly.

## CI/CD Integration

Run the reindex script as a deployment step, similar to database migrations:

```yaml
# GitHub Actions example
- name: Reindex (if config changed)
  run: npx tsx scripts/reindex.ts --config ./consistency.config.ts --db ./events.sqlite
```

The script exits with code 0 whether a reindex was needed or not, so it's safe to run on every deploy. If the config hash matches, it prints "No reindex needed" and exits immediately.

For more details, see the [Reindex on Config Change](../README.md#reindex-on-config-change) section in the README.

## Individual Commands

If you want more control, run each step separately:

```bash
# Generate the benchmark database with full config
npx tsx benchmark/sqlite-query.ts --events 1m --disk --shuffle \
  --config ./benchmark/consistency.config.ts

# Reindex to minimal config
npx tsx scripts/reindex.ts --config ./benchmark/consistency.config.minimal.ts \
  --db ./benchmark/boundless-bench.sqlite

# Benchmark with minimal config
npx tsx benchmark/sqlite-query.ts --events 1m --disk --shuffle \
  --config ./benchmark/consistency.config.minimal.ts

# Reindex back to full config
npx tsx scripts/reindex.ts --config ./benchmark/consistency.config.ts \
  --db ./benchmark/boundless-bench.sqlite

# Benchmark with full config again
npx tsx benchmark/sqlite-query.ts --events 1m --disk --shuffle \
  --config ./benchmark/consistency.config.ts
```

This is exactly what `bench-and-reindex.ts` does under the hood.
