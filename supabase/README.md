# BoundlessDB Supabase Edge Functions

Deploy BoundlessDB as a serverless REST API on [Supabase Edge Functions](https://supabase.com/docs/guides/functions).

## 🚀 Quickstart

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- A Supabase project (or run locally with `supabase start`)

### 1. Link your Supabase project

```bash
cd supabase
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Create the database schema

```bash
# Apply the migration
supabase db push

# Or manually via SQL Editor:
psql $SUPABASE_DB_URL -f migrations/001_boundless_schema.sql
```

### 3. Set secrets

```bash
# Generate a secure secret
openssl rand -hex 32

# Set it in Supabase
supabase secrets set BOUNDLESS_SECRET=your-generated-secret

# Optional: Set an API key for admin access
supabase secrets set BOUNDLESS_API_KEY=your-api-key
```

### 4. Configure your consistency keys

Edit `functions/_shared/config.ts` to define your event types:

```typescript
export const consistencyConfig = {
  eventTypes: {
    OrderPlaced: {
      keys: [
        { name: "order", path: "data.orderId" },
        { name: "customer", path: "data.customerId" }
      ]
    },
    OrderShipped: {
      keys: [
        { name: "order", path: "data.orderId" }
      ]
    }
  }
};
```

### 5. Deploy

```bash
# Deploy all endpoints
supabase functions deploy boundless-read
supabase functions deploy boundless-append
supabase functions deploy boundless-head
supabase functions deploy boundless-events
supabase functions deploy boundless-health
```

### 6. Test it!

```bash
# Health check (no auth required)
curl https://<project>.supabase.co/functions/v1/boundless-health

# Get current position
curl -X GET https://<project>.supabase.co/functions/v1/boundless-head \
  -H "Authorization: Bearer <anon-key>"

# Read events
curl -X POST https://<project>.supabase.co/functions/v1/boundless-read \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"conditions": [{"type": "OrderPlaced", "key": "customer", "value": "cust-123"}]}'

# Append events
curl -X POST https://<project>.supabase.co/functions/v1/boundless-append \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"events": [{"type": "OrderPlaced", "data": {"orderId": "ord-1", "customerId": "cust-123"}}], "token": null}'
```

---

## 📖 API Reference

### Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/boundless-health` | GET | ❌ | Health check |
| `/boundless-head` | GET | ✅ | Get current position |
| `/boundless-read` | POST | ✅ | Read events with conditions |
| `/boundless-append` | POST | ✅ | Append events |
| `/boundless-events` | GET | 🔐 Admin | List all events |

---

### `GET /boundless-health`

No authentication required.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-02-21T11:00:00Z",
  "database": "connected"
}
```

---

### `GET /boundless-head`

**Response:**
```json
{ "position": 1523 }
```

---

### `POST /boundless-read`

**Request:**
```json
{
  "conditions": [
    { "type": "EventType", "key": "keyName", "value": "keyValue" }
  ],
  "fromPosition": 0,
  "limit": 100
}
```

**Response:**
```json
{
  "events": [...],
  "token": "eyJ..."
}
```

---

### `POST /boundless-append`

**Request:**
```json
{
  "events": [
    { "type": "EventType", "data": { ... } }
  ],
  "token": "eyJ..."
}
```

**Success Response:**
```json
{
  "success": true,
  "position": 42,
  "token": "eyJ..."
}
```

**Conflict Response:**
```json
{
  "success": false,
  "conflict": true,
  "conflictingEvents": [...],
  "newToken": "eyJ..."
}
```

---

### `GET /boundless-events` (Admin)

Requires API Key authentication via `X-API-Key` header.

**Query Parameters:**
- `limit` (default: 100)
- `offset` (default: 0)

**Response:**
```json
{
  "events": [...],
  "total": 1523
}
```

---

## 🔐 Authentication

### Using Supabase Auth

Pass the user's JWT token:

```typescript
const { data, error } = await supabase.functions.invoke('boundless-read', {
  body: { conditions: [...] }
});
```

### Using API Key (Service-to-Service)

```bash
supabase secrets set BOUNDLESS_API_KEY=your-api-key
```

```bash
curl -X GET .../boundless-events \
  -H "X-API-Key: your-api-key"
```

---

## 🧪 Local Development

```bash
# Start local Supabase
supabase start

# Create .env file
echo "BOUNDLESS_SECRET=dev-secret" > functions/.env

# Serve all functions
supabase functions serve --env-file functions/.env

# Test locally
curl http://localhost:54321/functions/v1/boundless-health
```

---

## 📁 Project Structure

```
supabase/
├── config.toml              # Supabase project config
├── migrations/
│   └── 001_boundless_schema.sql
└── functions/
    ├── _shared/             # Shared modules (not deployed)
    │   ├── auth.ts          # Authentication helpers
    │   ├── config.ts        # Consistency configuration
    │   ├── cors.ts          # CORS helpers
    │   ├── storage.ts       # PostgreSQL storage
    │   ├── token.ts         # HMAC token handling
    │   └── types.ts         # TypeScript types
    ├── boundless-append/    # POST - Append events
    │   └── index.ts
    ├── boundless-events/    # GET - List all events (admin)
    │   └── index.ts
    ├── boundless-head/      # GET - Current position
    │   └── index.ts
    ├── boundless-health/    # GET - Health check
    │   └── index.ts
    └── boundless-read/      # POST - Read events
        └── index.ts
```

---

## ⚠️ Limitations

| Feature | Supported | Notes |
|---------|-----------|-------|
| Read/Append | ✅ | Full DCB pattern |
| Conflict Detection | ✅ | With delta events |
| HMAC Tokens | ✅ | Tamper-proof |
| Subscriptions | ❌ | Edge Functions are stateless |
| LISTEN/NOTIFY | ❌ | Use polling or external service |
| Large Event Batches | ⚠️ | Memory limit: 150MB |

---

## 📚 Further Reading

- [BoundlessDB Documentation](../README.md)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [DCB Specification](https://dcb.events/specification/)
