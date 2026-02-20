# Boundless

A DCB-native Event Store with **Dynamic Consistency Boundaries**.

> *Boundless* — because consistency boundaries should be dynamic, not fixed.

## 🎉 Try it Live!

**[Interactive Browser Demo](https://boundless-seven.vercel.app/demo.html)** — No installation required!

The entire event store runs client-side in your browser using WebAssembly SQLite.

## Features

- 🚀 **Works in Browser** — Full client-side event sourcing via sql.js (WASM)
- 🔑 **No Streams** — Events are organized via configurable consistency keys
- ⚙️ **Config-based Key Extraction** — Events remain pure business data
- 🔐 **HMAC-signed Consistency Tokens** — Tamper-proof optimistic concurrency
- ⚡ **Conflict Detection with Delta** — Get exactly what changed since your read
- 💾 **SQLite & In-Memory Storage** — Production-ready and test-friendly

## Installation

```bash
npm install @sbortz/boundless
```

## Quick Start

```typescript
import { createEventStore, SqliteStorage, isConflict } from '@sbortz/boundless';

const store = createEventStore({
  storage: new SqliteStorage('./events.db'),
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

// 2. DECIDE — Check invariants
const enrolled = events.filter(e => e.type === 'StudentSubscribed').length;
if (enrolled >= 30) throw new Error('Course is full');

// 3. APPEND — Write with consistency check
const result = await store.append(
  [{ type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }],
  token
);

if (isConflict(result)) {
  console.log('Conflict! Events since your read:', result.conflictingEvents);
  // Retry with result.newToken...
} else {
  console.log('Enrolled at position', result.position);
}
```

## Browser Usage

Boundless works **entirely in the browser** with no server required!

```html
<script type="module">
  import { createEventStore, SqlJsStorage, isConflict } from './boundless.browser.js';

  const store = createEventStore({
    storage: new SqlJsStorage(),
    secret: 'demo-secret',
    consistency: {
      eventTypes: {
        TodoAdded: { keys: [{ name: 'list', path: 'data.listId' }] }
      }
    }
  });

  // Everything runs client-side!
  const { events, token } = await store.read({
    conditions: [{ type: 'TodoAdded', key: 'list', value: 'my-list' }]
  });
</script>
```

### Build Browser Bundle

```bash
npm run build:browser
# → ui/public/boundless.browser.js (~100KB)
```

## Why "Boundless"?

Traditional event stores use **streams** as consistency boundaries — but streams are static. What if you need to check consistency across multiple dimensions?

**Dynamic Consistency Boundaries (DCB)** let you query events by any combination of keys:

```typescript
// Check consistency across course AND student
const { token } = await store.read({
  conditions: [
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
    { type: 'StudentSubscribed', key: 'student', value: 'alice' },
  ],
});
```

The consistency token captures *exactly* what you read, enabling precise conflict detection.

## API

### `createEventStore(options)`

```typescript
const store = createEventStore({
  storage: SqliteStorage | SqlJsStorage | InMemoryStorage,
  secret: string,                  // HMAC signing secret
  consistency: ConsistencyConfig,  // Key extraction rules
});
```

### `store.read(query)`

```typescript
const { events, token } = await store.read({
  conditions: [{ type, key, value }],
  fromPosition?: bigint,
  limit?: number,
});
```

### `store.append(events, token)`

```typescript
const result = await store.append(
  [{ type: 'MyEvent', data: {...} }],
  token  // or null to skip check
);

if (isConflict(result)) {
  result.conflictingEvents;  // What changed
  result.newToken;           // For retry
}
```

## Consistency Configuration

Keys are extracted from event payloads — events stay pure:

```typescript
const config = {
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

### Key Options

| Option | Description |
|--------|-------------|
| `name` | Key name for queries |
| `path` | Dot-notation path in event |
| `transform` | `LOWER`, `UPPER`, `MONTH`, `YEAR`, `DATE` |
| `nullHandling` | `error` (default), `skip`, `default` |
| `defaultValue` | Value when `nullHandling: 'default'` |

## Storage Backends

| Backend | Environment | Persistence |
|---------|-------------|-------------|
| `SqliteStorage` | Node.js | File or `:memory:` |
| `SqlJsStorage` | Browser | In-memory (WASM) |
| `InMemoryStorage` | Any | None (testing) |

## Development

```bash
npm install
npm test
npm run build
npm run build:browser
```

## License

MIT

---

Built with ❤️ for [Event Sourcing](https://www.eventstore.com/event-sourcing)
