# BoundlessDB

A **DCB-inspired** event store library for TypeScript.

> *BoundlessDB* — because consistency boundaries should be dynamic, not fixed.

## Installation

```bash
npm install boundlessdb
```

## 🎉 Try it Live!

**[Interactive Browser Demo](https://boundlessdb.dev/demo.html)** — No installation required!

The entire event store runs client-side in your browser using WebAssembly SQLite.

## Features

- 🚀 **Works in Browser** — Full client-side event sourcing via sql.js (WASM)
- 🔑 **No Streams** — Events organized via configurable consistency keys
- ⚙️ **Config-based Key Extraction** — Events remain pure business data
- 🎟️ **AppendCondition** — Simple, transparent optimistic concurrency control
- ⚡ **Conflict Detection with Delta** — Get exactly what changed since your read
- 🔄 **Auto-Reindex** — Change your config, keys are automatically rebuilt
- 💾 **SQLite, PostgreSQL & In-Memory** — Multiple storage backends
- 📦 **Embedded Library** — No separate server, runs in your process

## Quick Start

```typescript
import { createEventStore, SqliteStorage } from 'boundlessdb';

const store = createEventStore({
  storage: new SqliteStorage(':memory:'),
  consistency: {
    eventTypes: {
      CourseCreated: {
        keys: [{ name: 'course', path: 'data.courseId' }]
      },
      StudentSubscribed: {
        keys: [
          { name: 'course', path: 'data.courseId' },
          { name: 'student', path: 'data.studentId' }
        ]
      }
    }
  }
});
```

## How It Works

### 1️⃣ Event Appended
You append an event with business data:
```typescript
await store.append([{ 
  type: 'StudentSubscribed', 
  data: { courseId: 'cs101', studentId: 'alice' } 
}], result.appendCondition);
```

### 2️⃣ Keys Extracted
Your config tells BoundlessDB which fields are consistency keys:
```typescript
consistency: {
  eventTypes: {
    StudentSubscribed: {
      keys: [
        { name: 'course', path: 'data.courseId' },
        { name: 'student', path: 'data.studentId' }
      ]
    }
  }
}
// → Extracts: course='cs101', student='alice'
```

### 3️⃣ Index Updated
Keys are stored in a separate index table, linked to the event position:
```
event_keys: [pos:1, course, cs101], [pos:1, student, alice]
```

### 4️⃣ Query by Keys
Find all events matching any combination of key conditions:
```typescript
const result = await store.read({
  conditions: [
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' }
  ]
});
// result.appendCondition captures: "I read all matching events up to position X"
```

## The DCB Pattern: Read → Decide → Write

```typescript
// 1️⃣ READ — Query events and get an appendCondition
const { events, appendCondition } = await store.read({
  conditions: [
    { type: 'CourseCreated', key: 'course', value: 'cs101' },
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
  ]
});

// 2️⃣ DECIDE — Build state, run business logic
const state = events.reduce(evolve, initialState);
const newEvents = decide(command, state);

// 3️⃣ WRITE — Append with optimistic concurrency
const result = await store.append(newEvents, appendCondition);
```

### Define Your Functions

```typescript
const initialState = { enrolled: 0, capacity: 30 };

// evolve: (state, event) → new state
const evolve = (state, event) => {
  switch (event.type) {
    case 'StudentSubscribed':
      return { ...state, enrolled: state.enrolled + 1 };
    default:
      return state;
  }
};

// decide: (command, state) → events[]
const decide = (command, state) => {
  if (state.enrolled >= state.capacity) {
    throw new Error('Course is full!');
  }
  return [{ type: 'StudentSubscribed', data: command }];
};
```

### Handle Conflicts

```typescript
if (result.conflict) {
  // Someone else wrote while you were deciding
  console.log('Events since your read:', result.conflictingEvents);
  // Retry with result.appendCondition
} else {
  console.log('Success at position', result.position);
}
```

## Fluent Query API

Build queries with a chainable API:

```typescript
const { events, appendCondition } = await store.query<CourseEvent>()
  .matchType('CourseCreated')                              // all events of type
  .matchTypeAndKey('StudentSubscribed', 'course', 'cs101') // type + key = value
  .withKey('student', 'alice')                             // AND: also match student key
  .fromPosition(100n)                                      // start from position
  .limit(50)                                               // limit results
  .read();
```

### Methods

| Method | Description |
|--------|-------------|
| `matchType(type)` | Match all events of type (unconstrained) |
| `matchTypeAndKey(type, key, value)` | Match events of type where key=value |
| `withKey(key, value)` | Add AND key to last condition (multi-key) |
| `fromPosition(bigint)` | Start reading from position |
| `limit(number)` | Limit number of results |
| `read()` | Execute query, returns `QueryResult` |

The fluent API is equivalent to calling `store.read()` with conditions — use whichever style you prefer.

## AppendCondition

The `AppendCondition` controls optimistic concurrency. It follows the [DCB specification](https://dcb.events/specification/#append-condition):

```typescript
interface AppendCondition {
  failIfEventsMatch: QueryCondition[];  // What constitutes a conflict?
  after?: bigint;                        // From which position to check? (optional)
}
```

### Case 1: Read → Append (Standard Flow)

```typescript
const result = await store.query()
  .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
  .read();

// appendCondition = { failIfEventsMatch: [...], after: <last_position> }
await store.append(newEvents, result.appendCondition);
```

**Checks:** Were there NEW events (after my read) that match my query?
- ✅ No conflict if nothing new was written
- ❌ Conflict if someone else wrote matching events

### Case 2: Manual with Position

```typescript
await store.append(newEvents, {
  failIfEventsMatch: [{ type: 'StudentSubscribed', key: 'course', value: 'cs101' }],
  after: 42n
});
```

**Checks:** Events AFTER position 42 only.
**Use case:** Custom retry logic, or when you know the position.

### Case 3: Check ALL Events (Uniqueness)

```typescript
await store.append(newEvents, {
  failIfEventsMatch: [{ type: 'UserCreated', key: 'username', value: 'alice' }]
  // no 'after' → checks from position 0
});
```

**Checks:** ALL events from the beginning.
**Use case:** Uniqueness checks without reading first.
- ❌ Fails if ANY matching event exists
- "Username 'alice' must not exist yet"

### Case 4: No Check (Blind Append)

```typescript
await store.append(newEvents, null);
```

**Checks:** Nothing.
**Use case:** First write, or events where conflicts don't matter.

### Summary

| Case | `after` | Checks |
|------|---------|--------|
| Read → Append | From read position | Events AFTER read |
| Manual | Explicit position | Events AFTER position |
| Uniqueness | Omitted | ALL events |
| Blind | `null` condition | Nothing |

## Query Across Multiple Dimensions

Traditional streams give you ONE boundary. DCB lets you query ANY combination:

```typescript
// "Has Alice already enrolled in CS101?"
// Multi-key AND: must match BOTH keys on the SAME event
const result = await store.query()
  .matchType('StudentSubscribed')
  .withKey('course', 'cs101')
  .withKey('student', 'alice')
  .read();
```

### AND vs OR

- **`.withKey().withKey()`** = **AND** — the same event must have ALL specified keys
- **Two separate conditions** = **OR** — events matching EITHER condition

```typescript
// AND: Events where course='cs101' AND student='alice' (same event)
store.query()
  .matchType('StudentSubscribed')
  .withKey('course', 'cs101')
  .withKey('student', 'alice')
  .read();

// OR: Events where course='cs101' OR student='alice' (different events)
store.query()
  .matchTypeAndKey('StudentSubscribed', 'course', 'cs101')
  .matchTypeAndKey('StudentSubscribed', 'student', 'alice')
  .read();
```

Multi-key conditions also work in the object syntax:

```typescript
const result = await store.read({
  conditions: [
    {
      type: 'StudentSubscribed',
      keys: [
        { name: 'course', value: 'cs101' },
        { name: 'student', value: 'alice' }
      ]
    }
  ]
});
```

## Config-based Key Extraction

Keys are extracted from event payloads via configuration — events stay pure:

```typescript
const consistency = {
  eventTypes: {
    OrderPlaced: {
      keys: [
        { name: 'order', path: 'data.orderId' },
        { name: 'customer', path: 'data.customer.id' },
        { name: 'month', path: 'data.timestamp', transform: 'MONTH' }
      ]
    }
  }
};
```

### Key Options

| Option | Description |
|--------|-------------|
| `name` | Key name for queries |
| `path` | Dot-notation path in event (e.g., `data.customer.id`) |
| `transform` | Transform the extracted value (see below) |
| `nullHandling` | `error` (default), `skip`, `default` |
| `defaultValue` | Value when `nullHandling: 'default'` |

### Transforms

Transforms modify the extracted value before indexing:

| Transform | Input | Output | Use Case |
|-----------|-------|--------|----------|
| `LOWER` | `"Alice@Email.COM"` | `"alice@email.com"` | Case-insensitive matching |
| `UPPER` | `"alice"` | `"ALICE"` | Normalized codes |
| `MONTH` | `"2026-02-20T14:30:00Z"` | `"2026-02"` | Monthly partitioning |
| `YEAR` | `"2026-02-20T14:30:00Z"` | `"2026"` | Yearly aggregation |
| `DATE` | `"2026-02-20T14:30:00Z"` | `"2026-02-20"` | Daily partitioning |

**Example: Time-based partitioning**

```typescript
const consistency = {
  eventTypes: {
    OrderPlaced: {
      keys: [
        { name: 'order', path: 'data.orderId' },
        { name: 'month', path: 'data.placedAt', transform: 'MONTH' }
      ]
    }
  }
};

// Event: { type: 'OrderPlaced', data: { orderId: 'ORD-123', placedAt: '2026-02-20T14:30:00Z' } }
// Extracted keys: order="ORD-123", month="2026-02"

// Query all orders from February 2026:
const { events } = await store.read({
  conditions: [{ type: 'OrderPlaced', key: 'month', value: '2026-02' }]
});
```

This is great for **Close the Books** patterns — query all events in a time period efficiently!

## Auto-Reindex on Config Change

The config is hashed and stored in the database. On startup:

```
stored_hash:  "a1b2c3..."  (from last run)
current_hash: "x9y8z7..."  (from your config)

→ Hash mismatch detected!
→ Rebuilding key index...
→ ✅ Reindex complete: 1523 events, 4211 keys (847ms)
```

**Just change your config and restart.** No manual migration needed!

## Browser Usage

BoundlessDB works **entirely in the browser** with no server required:

```html
<script type="module">
  import { createEventStore, SqlJsStorage } from './boundless.browser.js';

  const store = createEventStore({
    storage: new SqlJsStorage(),
    consistency: {
      eventTypes: {
        TodoAdded: { keys: [{ name: 'list', path: 'data.listId' }] }
      }
    }
  });

  // Everything runs client-side!
</script>
```

### Build Browser Bundle

```bash
npm run build:browser
# → ui/public/boundless.browser.js (~100KB)
```

## Multi-Node Safety

BoundlessDB supports concurrent access from multiple processes (e.g. Supabase Edge Functions, multiple server instances) when using PostgreSQL.

The conflict check and write happen **atomically in a single SERIALIZABLE transaction**. PostgreSQL detects overlapping reads and aborts one transaction if two processes try to append with conflicting consistency keys. The library retries automatically.

```typescript
// Edge Function A and B run simultaneously:
// Both read, both decide, both try to append.
// PostgreSQL ensures only one succeeds — the other gets a conflict result.

const result = await store.append(newEvents, appendCondition);
if (result.conflict) {
  // Retry with fresh state
}
```

**Key behavior:**
- Appends with **different keys** proceed in parallel (no conflict)
- Appends with **overlapping keys** are serialized (one wins, one retries)
- This maps directly to DCB's Dynamic Consistency Boundaries

**No configuration needed** — atomic conflict detection is built into all storage engines.

## Storage Backends

| Backend | Environment | Persistence |
|---------|-------------|-------------|
| `SqliteStorage` | Node.js | File or `:memory:` |
| `SqlJsStorage` | Browser | In-memory (WASM) |
| `PostgresStorage` | Node.js | PostgreSQL database |
| `InMemoryStorage` | Any | None (testing) |

### PostgreSQL Storage

For production deployments with PostgreSQL:

```typescript
import { createEventStore, PostgresStorage } from 'boundlessdb';

const storage = new PostgresStorage('postgresql://user:pass@localhost/mydb');
await storage.init();  // Required: creates tables if they don't exist

const store = createEventStore({
  storage,
  consistency: { /* ... */ }
});
```

**Note:** PostgreSQL support requires the `pg` package:

```bash
npm install pg
```

## Typed Events

Define type-safe events using the `Event` marker type:

```typescript
import { Event, EventStore } from 'boundlessdb';

// Define your events
type ProductItemAdded = Event<'ProductItemAdded', {
  cartId: string;
  productId: string;
  quantity: number;
}>;

type ProductItemRemoved = Event<'ProductItemRemoved', {
  cartId: string;
  productId: string;
}>;

// Create a union type for all cart events
type CartEvents = ProductItemAdded | ProductItemRemoved;

// Read with type safety
const result = await store.read<CartEvents>({
  conditions: [{ type: 'ProductItemAdded', key: 'cart', value: 'cart-123' }]
});

// TypeScript knows the event types!
for (const event of result.events) {
  if (event.type === 'ProductItemAdded') {
    console.log(event.data.quantity);  // ✅ typed as number
  }
}
```

## Query Conditions

Query conditions support both **constrained** (with key/value) and **unconstrained** (type-only) queries.

### Constrained Query
Match events of a type where a specific key has a specific value:

```typescript
// Get ProductItemAdded events where cart='cart-123'
const result = await store.read({
  conditions: [
    { type: 'ProductItemAdded', key: 'cart', value: 'cart-123' }
  ]
});
```

### Unconstrained Query
Omit `key` and `value` to match **all events of a type**:

```typescript
// Get ALL ProductItemAdded events (regardless of cart)
const result = await store.read({
  conditions: [
    { type: 'ProductItemAdded' }  // no key/value = match all
  ]
});
```

### Mixed Conditions
Combine constrained and unconstrained in one query (OR logic):

```typescript
// "Give me the course definition + all enrollments for cs101"
const result = await store.read({
  conditions: [
    { type: 'CourseCreated', key: 'course', value: 'cs101' },
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
    { type: 'StudentUnsubscribed', key: 'course', value: 'cs101' },
  ]
});

// "All courses + only Alice's enrollments"
const result = await store.read({
  conditions: [
    { type: 'CourseCreated' },                                  // unconstrained: ALL courses
    { type: 'StudentSubscribed', key: 'student', value: 'alice' } // constrained: only Alice
  ]
});
```

### Same Type, Multiple Values
Query multiple values of the same key:

```typescript
// Get ProductItemAdded for cart-1 OR cart-2
const result = await store.read({
  conditions: [
    { type: 'ProductItemAdded', key: 'cart', value: 'cart-1' },
    { type: 'ProductItemAdded', key: 'cart', value: 'cart-2' }
  ]
});
```

### Type Safety
With TypeScript, conditions are type-safe — three forms:

```typescript
// ✅ Unconstrained (type only)
{ type: 'ProductItemAdded' }

// ✅ Single key
{ type: 'ProductItemAdded', key: 'cart', value: 'cart-123' }

// ✅ Multi-key AND
{ type: 'StudentSubscribed', keys: [
  { name: 'course', value: 'cs101' },
  { name: 'student', value: 'alice' }
]}
```

### Empty Conditions
Empty conditions returns **all events** in the store:

```typescript
// Get ALL events (useful for admin/debug/export)
const result = await store.read({ conditions: [] });
```

## API Reference

### `createEventStore(options)`

```typescript
const store = createEventStore({
  storage: SqliteStorage | SqlJsStorage | PostgresStorage | InMemoryStorage,
  consistency: ConsistencyConfig,  // Key extraction rules
});
```

### `store.read<E>(query)`

```typescript
const result = await store.read<CartEvents>({
  conditions: [
    { type: string }                                            // unconstrained
    | { type: string, key: string, value: string }              // single key
    | { type: string, keys: { name: string, value: string }[] } // multi-key AND
  ],
  fromPosition?: bigint,
  limit?: number,
});

result.events           // StoredEvent<E>[]
result.position         // bigint
result.conditions       // QueryCondition[]
result.appendCondition  // AppendCondition (for store.append)
result.count            // number
result.isEmpty()        // boolean
result.first()          // StoredEvent<E> | undefined
result.last()           // StoredEvent<E> | undefined
```

### `store.append<E>(events, condition)`

```typescript
// With appendCondition from read()
const readResult = await store.read<CartEvents>({ conditions });
const result = await store.append<CartEvents>([newEvent], readResult.appendCondition);

// With manual AppendCondition (DCB spec compliant)
const result = await store.append<CartEvents>([newEvent], {
  failIfEventsMatch: [{ type: 'UserCreated', key: 'username', value: 'alice' }],
  after: 42n  // optional
});

// Without consistency check
const result = await store.append<CartEvents>([newEvent], null);

// Result handling
if (result.conflict) {
  result.conflictingEvents;  // StoredEvent<E>[] - what changed since your read
  result.appendCondition;    // Fresh condition for retry
} else {
  result.position;           // Position of last appended event
  result.appendCondition;    // Condition for next operation
}
```

## Development

```bash
npm install
npm test
npm run build
npm run build:browser
```

## Related

- [dcb.events](https://dcb.events) — Dynamic Consistency Boundaries
- [Giraflow](https://giraflow.dev) — Event Modeling visualization

---

Built with ❤️ for [Event Sourcing](https://www.eventstore.com/event-sourcing)
