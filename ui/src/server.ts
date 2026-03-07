/**
 * Event Store Test UI - Backend Server
 *
 * Uses the @sbortz/event-store library to demonstrate DCB in action.
 * Updated for BoundlessDB v0.5.0 API (appendCondition, no tokens).
 */

import express, {Request, Response} from 'express';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {
    type AppendCondition,
    type ConsistencyConfig,
    createEventStore,
    type EventStore,
    isConflict,
    type QueryCondition,
    SqliteStorage,
} from 'boundlessdb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Static files
app.use(express.static(join(__dirname, '../public')));

// Paths
const DB_PATH = process.env.DB_PATH || join(__dirname, '../test-store.db');
const CONFIG_PATH = process.env.CONFIG_PATH || join(__dirname, '../consistency.config.json');

// Load Consistency Config from JSON
console.log(`Loading config from: ${CONFIG_PATH}`);
const consistencyConfig: ConsistencyConfig = JSON.parse(
    readFileSync(CONFIG_PATH, 'utf-8')
);
console.log(`Config loaded: ${Object.keys(consistencyConfig.eventTypes).length} event types`);

// Create Event Store
// Config hash mismatch now throws — catch and provide helpful message
console.log(`Database: ${DB_PATH}`);
const storage = new SqliteStorage(DB_PATH);

let store: EventStore;
try {
    store = createEventStore({
        storage,
        consistency: consistencyConfig
    });
} catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Config hash mismatch')) {
        console.error('\n╔══════════════════════════════════════════════════════════╗');
        console.error('║  CONFIG HASH MISMATCH                                    ║');
        console.error('║                                                          ║');
        console.error('║  The consistency config has changed since last run.       ║');
        console.error('║  Run the reindex script before starting the application: ║');
        console.error('║                                                          ║');
        console.error('║    npx tsx scripts/reindex.ts                             ║');
        console.error('║                                                          ║');
        console.error('╚══════════════════════════════════════════════════════════╝\n');
    }
    console.error('Failed to create event store:', msg);
    process.exit(1);
}

console.log('Event Store initialized');

// Read-only DB connection for direct SQL queries (keys, etc.)
const readDb = new Database(DB_PATH, {readonly: true});

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

// Get all events — use store.read with empty conditions
app.get('/api/events', async (_req: Request, res: Response) => {
    try {
        const result = await store.read({conditions: []});
        const allEvents = result.events.map(e => ({
            ...e,
            position: Number(e.position)
        }));
        res.json({events: allEvents});
    } catch (err) {
        res.status(500).json({error: String(err)});
    }
});

// Get all keys — direct SQL on read-only connection
app.get('/api/keys', async (_req: Request, res: Response) => {
    try {
        const keys = readDb.prepare(
            'SELECT position, key_name, key_value FROM event_keys ORDER BY position'
        ).all();
        res.json({keys});
    } catch (err) {
        res.status(500).json({error: String(err)});
    }
});

// Read events with query — uses Event Store API
app.post('/api/read', async (req: Request, res: Response) => {
    const {conditions} = req.body as { conditions: QueryCondition[] };

    if (!conditions || conditions.length === 0) {
        res.status(400).json({error: 'No conditions provided'});
        return;
    }

    try {
        const result = await store.read({conditions});

        // Convert StoredEvent to JSON-safe format
        const events = result.events.map(e => ({
            ...e,
            position: Number(e.position)
        }));

        // Return appendCondition (replaces old token)
        const appendCondition = {
            failIfEventsMatch: result.appendCondition.failIfEventsMatch,
            after: Number(result.appendCondition.after),
        };

        res.json({
            events,
            appendCondition,
        });
    } catch (err) {
        res.status(500).json({error: String(err)});
    }
});

// Append event — uses Event Store API with AppendCondition
app.post('/api/append', async (req: Request, res: Response) => {
    const {type, data, appendCondition: rawCondition} = req.body as {
        type: string;
        data: unknown;
        appendCondition?: { failIfEventsMatch: QueryCondition[]; after: number } | null;
    };

    if (!type || data === undefined) {
        res.status(400).json({error: 'Missing type or data'});
        return;
    }

    try {
        // Convert incoming appendCondition to proper format (with bigint)
        let condition: AppendCondition | null = null;
        if (rawCondition) {
            condition = {
                failIfEventsMatch: rawCondition.failIfEventsMatch,
                after: BigInt(rawCondition.after),
            };
        }

        const result = await store.append(
            [{type, data: data as Record<string, unknown>}],
            condition
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
                appendCondition: {
                    failIfEventsMatch: result.appendCondition.failIfEventsMatch,
                    after: Number(result.appendCondition.after),
                },
            });
        } else {
            res.json({
                conflict: false,
                position: Number(result.position),
                appendCondition: {
                    failIfEventsMatch: result.appendCondition.failIfEventsMatch,
                    after: Number(result.appendCondition.after),
                },
            });
        }
    } catch (err) {
        res.status(500).json({error: String(err)});
    }
});

// Clear all events (for testing)
app.post('/api/clear', async (_req: Request, res: Response) => {
    try {
        storage.clear();
        notifyClients();
        res.json({success: true});
    } catch (err) {
        res.status(500).json({error: String(err)});
    }
});

// Start server
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
    console.log(`Event Store UI running at http://localhost:${PORT}`);
});
