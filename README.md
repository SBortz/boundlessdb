# BoundlessDB

An **embedded, DCB-inspired** Event Store with config-based consistency keys.

> *BoundlessDB* — because consistency boundaries should be dynamic, not fixed.

## 🎉 Try it Live!

**[Interactive Browser Demo](https://boundlessdb.dev/demo.html)** — No installation required!

The entire event store runs client-side in your browser using WebAssembly SQLite.

## Features

- 🚀 **Works in Browser** — Full client-side event sourcing via sql.js (WASM)
- 🔑 **No Streams** — Events organized via configurable consistency keys
- ⚙️ **Config-based Key Extraction** — Events remain pure business data
- 🎟️ **Simple Base64 Tokens** — Lightweight optimistic concurrency control
- ⚡ **Conflict Detection with Delta** — Get exactly what changed since your read
- 🔄 **Auto-Reindex** — Change your config, keys are automatically rebuilt
- 💾 **SQLite, PostgreSQL & In-Memory** — Multiple storage backends
- 📦 **Embedded Library** — No separate server, runs in your process

## Installation

```bash
npm install @sbortz/boundless
```

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
}], token);
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
const { events, token } = await store.read({
  conditions: [
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' }
  ]
});
// token captures: "I read all matching events up to position X"
```

## The DCB Pattern: Read → Decide → Write

```typescript
// 1️⃣ READ — Query events and get a consistency token
const { events, token } = await store.read({
  conditions: [
    { type: 'CourseCreated', key: 'course', value: 'cs101' },
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
  ]
});

// 2️⃣ DECIDE — Project state and check business rules
const course = events.find(e => e.type === 'CourseCreated');
const enrolled = events.filter(e => e.type === 'StudentSubscribed').length;

if (enrolled >= course.data.capacity) {
  throw new Error('Course is full!');
}

// 3️⃣ WRITE — Append with the token from your read
const result = await store.append([
  { type: 'StudentSubscribed', data: { courseId: 'cs101', studentId: 'alice' } }
], token);  // ← Token ensures no one else wrote since your read!

// Handle result
if (result.conflict) {
  // Someone else enrolled while you were deciding!
  console.log('Events since your read:', result.conflictingEvents);
  // Retry with result.newToken...
} else {
  console.log('Enrolled at position', result.position);
}
```

## Consistency Tokens

When you call `read()`, the store returns a token containing:
- The **position** up to which events were read
- The **query conditions** you used

The token is a simple Base64-encoded JSON object — you can inspect it, create it manually, or pass an `AppendCondition` object directly:

```typescript
// Option 1: Use token from read()
const { events, token } = await store.read({ conditions });
await store.append(newEvents, token);

// Option 2: Pass conditions directly (no token needed!)
await store.append(newEvents, {
  position: 42n,
  conditions: [{ type: 'UserCreated', key: 'username', value: 'alice' }]
});

// Option 3: Skip consistency check entirely
await store.append(newEvents, null);
```

This flexibility lets you:
- **Create uniqueness checks without reading first** (e.g., "username must be unique")
- **Build custom retry logic** by constructing conditions manually
- **Optimize performance** by skipping unnecessary reads

## Query Across Multiple Dimensions

Traditional streams give you ONE boundary. DCB lets you query ANY combination:

```typescript
// "Has Alice already enrolled in CS101?"
const { events, token } = await store.read({
  conditions: [
    { type: 'StudentSubscribed', key: 'course', value: 'cs101' },
    { type: 'StudentSubscribed', key: 'student', value: 'alice' },
  ]
});
// Checks BOTH course AND student boundaries in one query!
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
Combine constrained and unconstrained in one query:

```typescript
// Get: ALL ProductItemAdded OR CartCheckedOut where cart='cart-123'
const result = await store.read({
  conditions: [
    { type: 'ProductItemAdded' },                            // unconstrained
    { type: 'CartCheckedOut', key: 'cart', value: 'cart-123' } // constrained
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

### Partial Conditions
If `key` is provided without `value` (or vice versa), it's treated as **unconstrained**:

```typescript
// These are ALL equivalent (unconstrained):
{ type: 'ProductItemAdded' }
{ type: 'ProductItemAdded', key: 'cart' }           // value missing
{ type: 'ProductItemAdded', value: 'cart-123' }     // key missing
```

### Empty Conditions
Empty conditions returns **all events** in the store:

```typescript
// Get ALL events (useful for admin/debug/export)
const result = await store.read({ conditions: [] });
```

## Decider Pattern

BoundlessDB includes helpers for the Decider pattern:

```typescript
import { Decider, evolve, decide } from 'boundlessdb';

// Define your decider
const cartDecider: Decider<CartState, CartCommand, CartEvent> = {
  initialState: () => ({ items: new Map(), checkedOut: false }),
  
  evolve: (state, event) => {
    switch (event.type) {
      case 'ItemAdded':
        state.items.set(event.data.productId, event.data.quantity);
        return state;
      case 'CartCheckedOut':
        return { ...state, checkedOut: true };
    }
  },
  
  decide: (command, state) => {
    switch (command.type) {
      case 'AddItem':
        if (state.checkedOut) throw new Error('Cart already checked out');
        return { type: 'ItemAdded', data: command };
      case 'Checkout':
        return { type: 'CartCheckedOut', data: { itemCount: state.items.size } };
    }
  }
};
```

### Using with BoundlessDB

```typescript
// 1. Read events
const result = await store.read<CartEvent>({
  conditions: [{ type: 'ItemAdded', key: 'cart', value: cartId }]
});

// 2. Build state from events
const state = evolve(result.events, cartDecider);

// 3. Decide: command + state → new events
const newEvents = decide(command, result.events, cartDecider);

// 4. Append with consistency check
await store.append(newEvents, result.token);
```

### Decider Helpers

| Function | Description |
|----------|-------------|
| `evolve(events, decider)` | Fold events into state |
| `decide(command, events, decider)` | Build state + decide → new events |

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
  conditions: [{ type, key?, value? }],
  fromPosition?: bigint,
  limit?: number,
});

result.events      // StoredEvent<E>[]
result.token       // ConsistencyToken
result.position    // bigint
result.conditions  // QueryCondition[]
result.count       // number
result.isEmpty()   // boolean
result.first()     // StoredEvent<E> | undefined
result.last()      // StoredEvent<E> | undefined
```

### `store.append<E>(events, condition)`

```typescript
// With token from read()
const result = await store.append<CartEvents>([newEvent], token);

// With direct AppendCondition
const result = await store.append<CartEvents>([newEvent], {
  position: bigint,
  conditions: [{ type, key, value }]
});

// Without consistency check
const result = await store.append<CartEvents>([newEvent], null);

// Result handling
if (result.conflict) {
  result.conflictingEvents;  // StoredEvent<E>[] - what changed since your read
  result.newToken;           // Fresh token for retry
} else {
  result.position;           // Position of last appended event
  result.token;              // Token for next operation
}
```

### Token Helpers

```typescript
import { encodeAppendCondition, decodeAppendCondition } from 'boundlessdb';

// Create a token manually
const token = encodeAppendCondition({
  position: 42n,
  conditions: [{ type: 'UserCreated', key: 'username', value: 'alice' }]
});

// Decode a token
const condition = decodeAppendCondition(token);
// → { position: 42n, conditions: [...] }
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
