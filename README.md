# Boundless

A DCB-native Event Store for Node.js with **Dynamic Consistency Boundaries**.

> *Boundless* — because consistency boundaries should be dynamic, not fixed.

## Features

- **No Streams** — Events are organized via configurable consistency keys
- **Config-based Key Extraction** — Events remain pure business data
- **HMAC-signed Consistency Tokens** — Tamper-proof optimistic concurrency
- **Conflict Detection with Delta** — Get exactly what changed since your read
- **SQLite & In-Memory Storage** — Production-ready and test-friendly

## Installation

```bash
npm install @sbortz/event-store
```

## Quick Start

```typescript
import { createEventStore, InMemoryStorage, isConflict } from '@sbortz/event-store';

// Define consistency configuration
const store = createEventStore({
  storage: new InMemoryStorage(), // Or SqliteStorage for persistence
  secret: process.env.TOKEN_SECRET!,
  consistency: {
    eventTypes: {
      CourseCreated: {
        keys: [{ name: 'course', path: 'data.courseId' }],
      },
      StudentSubscribed: {
        keys: [
          { name: 'course', path: 'data.courseId' },
          { name: 'student', path: 'data.studentId' },
        ],
      },
    },
  },
});

// 1. READ — Get current state + consistency token
const { events, token } = await store.read({
  conditions: [
    { type: 'CourseCreated', key: 'course', value: 'cs101' },
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
  ],
});

// 2. DECIDE — Project events and check invariants
const enrolled = events.filter(e => e.type === 'StudentSubscribed').length;
if (enrolled >= 30) {
  throw new Error('Course is full');
}

// 3. APPEND — Write with consistency check
const result = await store.append(
  [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
  token
);

if (isConflict(result)) {
  console.log('Conflict! New events:', result.conflictingEvents);
  // Retry with result.newToken...
} else {
  console.log('Enrolled at position', result.position);
}
```

## API

### `createEventStore(options)`

Creates an event store instance.

```typescript
interface EventStoreConfig {
  storage: EventStorage;           // InMemoryStorage or SqliteStorage
  secret: string;                  // HMAC signing secret
  consistency: ConsistencyConfig;  // Key extraction rules
}
```

### `store.read(query)`

Read events matching a query.

```typescript
const { events, token } = await store.read({
  conditions: [
    { type: 'EventType', key: 'keyName', value: 'keyValue' },
  ],
  fromPosition?: bigint,  // Optional: start after this position
  limit?: number,         // Optional: max events to return
});
```

### `store.append(events, token)`

Append events with optional consistency check.

```typescript
const result = await store.append(
  [{ type: 'MyEvent', data: { ... }, metadata?: { ... } }],
  token  // null to skip consistency check
);

if (isConflict(result)) {
  // Handle conflict
  result.conflictingEvents;  // Events that caused conflict
  result.newToken;           // Token for retry
} else {
  result.position;  // Position of last appended event
  result.token;     // New token
}
```

## Consistency Configuration

Events don't carry tags — keys are extracted from the payload via configuration:

```typescript
const config: ConsistencyConfig = {
  eventTypes: {
    OrderPlaced: {
      keys: [
        { name: 'order', path: 'data.orderId' },
        { name: 'customer', path: 'data.customer.id' },
        { name: 'month', path: 'data.timestamp', transform: 'MONTH' },
      ],
    },
  },
};
```

### Key Definition Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | string | Key name for queries |
| `path` | string | Dot-notation path in event |
| `transform` | string? | `LOWER`, `UPPER`, `MONTH`, `YEAR`, `DATE` |
| `nullHandling` | string? | `error` (default), `skip`, `default` |
| `defaultValue` | string? | Value when `nullHandling: 'default'` |

## Storage Backends

### InMemoryStorage

```typescript
import { InMemoryStorage } from '@sbortz/event-store';
const storage = new InMemoryStorage();
```

Best for testing. Not persistent.

### SqliteStorage

```typescript
import { SqliteStorage } from '@sbortz/event-store';
const storage = new SqliteStorage('./events.db');
// Or in-memory: new SqliteStorage(':memory:')
```

Production-ready with WAL mode enabled.

## Development

```bash
npm install
npm test
npm run build
```
