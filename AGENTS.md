# AGENTS.md - Developer Guidelines for BoundlessDB

BoundlessDB is a DCB-inspired event store library for TypeScript supporting SQLite, PostgreSQL, and in-memory storage.

## Build, Lint, and Test Commands

```bash
# Build the project
npm run build                    # Compile TypeScript to dist/
npm run build:browser            # Build browser bundle using esbuild

# Run tests
npm test                         # Run all tests (vitest run)
npm run test:watch               # Watch mode for development
npm run test:postgres            # Run PostgreSQL-specific tests

# Run a single test file
npx vitest run test/event-store.test.ts

# Run a single test (by name pattern)
npx vitest run -t "returns empty result"

# Run linting
npm run lint                     # Check for lint errors
npm run lint:fix                 # Auto-fix formatting issues

# Benchmarks
npm run benchmark                # Run SQLite benchmark
npm run benchmark:postgres        # Run PostgreSQL benchmark
```

## Code Style Guidelines

### TypeScript Configuration
- Target: ES2022
- Module: NodeNext
- Strict mode: enabled
- Use `.js` extensions for all local imports

### Prettier Formatting (enforced via ESLint)
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

### Naming Conventions
- **Classes**: PascalCase (e.g., `EventStore`, `KeyExtractor`)
- **Interfaces**: PascalCase (e.g., `EventStorage`, `ConsistencyConfig`)
- **Types**: PascalCase (e.g., `StoredEvent`, `QueryCondition`)
- **Functions**: camelCase (e.g., `createEventStore`, `normalizeCondition`)
- **Variables**: camelCase (e.g., `eventConfig`, `matchingEvents`)
- **Constants**: PascalCase (e.g., `VALID_TRANSFORMS`, `SCHEMA`)
- **File names**: kebab-case (e.g., `event-store.ts`, `query-builder.ts`)

### Import Organization
Order imports as follows:
1. External libraries (e.g., `import Database from 'better-sqlite3'`)
2. Internal modules - named imports grouped by file
3. Type-only imports use `import type`

Example:
```typescript
import Database from 'better-sqlite3';

import {
  QueryResult,
  normalizeCondition,
  type AppendCondition,
  type StoredEvent,
} from './types.js';

import { KeyExtractor } from './config/extractor.js';
import type { EventStorage } from './storage/interface.js';
```

### Type Usage
- Use explicit types for function parameters and return types
- Prefer `type` over `interface` for type aliases
- Use generics extensively (e.g., `ConsistencyConfig<Events>`)
- Avoid `any` - use `unknown` when type is truly unknown
- Prefix unused function parameters with `_` (e.g., `function foo(_: string)`)

### Error Handling
- Use custom error classes extending `Error` (e.g., `KeyExtractionError`, `ConfigValidationError`)
- Include descriptive error messages with context
- Throw errors rather than returning error codes

Example:
```typescript
export class KeyExtractionError extends Error {
  constructor(
    public readonly eventType: string,
    public readonly keyName: string,
    public readonly path: string,
    message: string
  ) {
    super(`Key extraction failed for ${eventType}.${keyName} (path: ${path}): ${message}`);
    this.name = 'KeyExtractionError';
  }
}
```

### Class Structure
- Use `readonly` for properties that shouldn't change
- Use `private` for internal implementation details
- Use dependency injection for storage and configuration

Example:
```typescript
export class EventStore {
  constructor(private readonly config: EventStoreConfig) {}

  public async append(...): Promise<AppendResult> { ... }
}
```

### Test Conventions
- Use Vitest with `describe`, `it`, `expect`, `beforeEach`
- Test file location: `test/**/*.test.ts`
- Use `describe.each()` for parameterized tests across storage backends
- Test patterns: `describe('methodName', () => { it('behavior', () => { ... }) })`

### Global Test Configuration
- Vitest globals enabled (no imports needed for `describe`, `it`, `expect`, etc.)
- Test files include: `test/**/*.test.ts`

### Documentation
- Use JSDoc comments for public APIs
- Include `@example` tags for complex functions
- Document public exports in index.ts

### File Structure
```
src/
  index.ts           # Public API exports
  browser.ts        # Browser-specific entry
  event-store.ts     # Main EventStore class
  query-builder.ts  # QueryBuilder for reading events
  types.ts          # All type definitions
  config/
    extractor.ts    # Key extraction logic
    validator.ts    # Config validation
  storage/
    interface.ts    # Storage interface
    memory.ts       # In-memory implementation
    sqlite.ts       # better-sqlite3 implementation
    sqljs.ts        # sql.js (WASM) implementation
    postgres.ts     # PostgreSQL implementation
test/
  *.test.ts         # Test files
```

### Common Patterns

#### Consistency Keys
Extract keys from events using dot-notation paths:
```typescript
const config = {
  eventTypes: {
    CourseCreated: {
      keys: [{ name: 'course', path: 'data.courseId' }],
    },
  },
};
```

#### Reading Events
```typescript
const result = await store.read({
  conditions: [{ type: 'CourseCreated', key: 'course', value: 'cs101' }],
});
```

#### Appending Events
```typescript
await store.append(
  [{ type: 'CourseCreated', data: { courseId: 'cs101', name: 'Intro' } }],
  null  // append condition
);
```

### Running PostgreSQL Tests
PostgreSQL tests are skipped by default. To run them:
```bash
# Requires PostgreSQL running locally
npm run test:postgres
```

### Node.js Requirement
- Minimum Node.js version: 20.0.0
