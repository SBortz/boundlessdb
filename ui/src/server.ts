/**
 * Event Store Test UI - Backend Server
 * 
 * Uses the @sbortz/event-store library to demonstrate DCB in action.
 */

import express, { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import {
  createEventStore,
  SqliteStorage,
  isConflict,
  type EventStore,
  type QueryCondition,
  type StoredEvent,
  type ConsistencyConfig,
} from '@sbortz/event-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Static files
app.use(express.static(join(__dirname, '../public')));

// Paths
const DB_PATH = process.env.DB_PATH || join(__dirname, '../test-store.db');
const CONFIG_PATH = process.env.CONFIG_PATH || join(__dirname, '../consistency.config.json');
const SECRET = process.env.SECRET || 'test-secret-for-ui';

// Load Consistency Config from JSON
console.log(`Loading config from: ${CONFIG_PATH}`);
const consistencyConfig: ConsistencyConfig = JSON.parse(
  readFileSync(CONFIG_PATH, 'utf-8')
);
console.log(`Config loaded: ${Object.keys(consistencyConfig.eventTypes).length} event types`);

// Create Event Store
// If config changed since last run, it will auto-reindex
console.log(`Database: ${DB_PATH}`);
const storage = new SqliteStorage(DB_PATH);
const store: EventStore = createEventStore({
  storage,
  secret: SECRET,
  consistency: consistencyConfig
});

console.log('Event Store initialized');

// SSE connections for live updates
const sseClients: Set<Response> = new Set();

function notifyClients() {
  for (const client of sseClients) {
    client.write('data: update\n\n');
  }
}

// API Routes

// SSE endpoint for live updates
app.get('/api/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  console.log(`SSE client connected (${sseClients.size} total)`);

  req.on('close', () => {
    sseClients.delete(res);
    console.log(`SSE client disconnected (${sseClients.size} total)`);
  });
});

// Get all events (direct DB access for UI - not part of DCB API)
app.get('/api/events', async (_req: Request, res: Response) => {
  try {
    const allEvents = storage.getAllEvents().map(e => ({
      ...e,
      position: Number(e.position)
    }));
    res.json({ events: allEvents });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Get all keys (direct DB access for UI)
app.get('/api/keys', async (_req: Request, res: Response) => {
  try {
    const allKeys = storage.getAllKeys();
    res.json({ keys: allKeys });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Read events with query - uses Event Store API
app.post('/api/read', async (req: Request, res: Response) => {
  const { conditions } = req.body as { conditions: QueryCondition[] };

  if (!conditions || conditions.length === 0) {
    res.status(400).json({ error: 'No conditions provided' });
    return;
  }

  try {
    const result = await store.read({ conditions });
    
    // Convert StoredEvent to JSON-safe format
    const events = result.events.map(e => ({
      ...e,
      position: Number(e.position)
    }));

    res.json({ 
      events, 
      token: result.token 
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Append event - uses Event Store API
app.post('/api/append', async (req: Request, res: Response) => {
  const { type, data, keys, token } = req.body as {
    type: string;
    data: unknown;
    keys?: { name: string; value: string }[];
    token?: string | null;
  };

  if (!type || data === undefined) {
    res.status(400).json({ error: 'Missing type or data' });
    return;
  }

  try {
    const result = await store.append(
      [{ type, data }],
      token || null
    );

    // Notify SSE clients
    notifyClients();

    if (isConflict(result)) {
      res.json({
        conflict: true,
        conflictingEvents: result.conflictingEvents.map(e => ({
          ...e,
          position: Number(e.position)
        })),
        newToken: result.newToken
      });
    } else {
      res.json({
        conflict: false,
        position: Number(result.position),
        token: result.token
      });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Clear all events (for testing)
app.post('/api/clear', async (_req: Request, res: Response) => {
  try {
    storage.clear();
    notifyClients();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Create token with custom position (for testing conflicts)
app.post('/api/create-token', (req: Request, res: Response) => {
  const { position, conditions } = req.body as {
    position: number;
    conditions: QueryCondition[];
  };

  if (position === undefined || !conditions) {
    res.status(400).json({ error: 'Missing position or conditions' });
    return;
  }

  // Create token manually using the same format
  const payload = {
    v: 1,
    pos: String(position),
    ts: Date.now(),
    q: conditions
  };
  
  const payloadJson = JSON.stringify(payload);
  const sig = createHmac('sha256', SECRET).update(payloadJson).digest();
  
  const token = Buffer.from(payloadJson).toString('base64url') + '.' + 
                Buffer.from(sig).toString('base64url');
  
  res.json({ token });
});

// Decode token endpoint (for transparency)
app.post('/api/decode-token', (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  
  try {
    // Decode base64url token payload (before the signature)
    const [payloadB64] = token.split('.');
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    
    res.json({
      v: payload.v,
      pos: payload.pos,
      ts: payload.ts,
      q: payload.q,
      decoded: true
    });
  } catch {
    res.status(400).json({ error: 'Invalid token' });
  }
});

// Start server
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Event Store UI running at http://localhost:${PORT}`);
});
