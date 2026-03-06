/**
 * Key Extractor: Extracts consistency keys from events based on configuration
 */

import type {ConsistencyConfig, ExtractedKey, NewEvent, StoredEvent} from '../types.js';

/**
 * Resolve a dot-notation path in an object
 * @example resolvePath({ data: { courseId: "cs101" } }, "data.courseId") => "cs101"
 */
function resolvePath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Apply a transformation to a value
 */
type ConsistencyKeyTransform = 'LOWER' | 'UPPER' | 'MONTH' | 'YEAR' | 'DATE' | undefined;

function applyTransform(value: string, transform: ConsistencyKeyTransform): string {
    if (!transform) {
        return value;
    }

    switch (transform) {
        case 'LOWER':
            return value.toLowerCase();

        case 'UPPER':
            return value.toUpperCase();

        case 'MONTH': {
            // "2026-02-14" or "2026-02-14T10:30:00Z" → "2026-02"
            const match = value.match(/^(\d{4}-\d{2})/);
            if (!match) {
                throw new Error(`Cannot extract MONTH from value: ${value}`);
            }
            return match[1];
        }

        case 'YEAR': {
            // "2026-02-14" → "2026"
            const match = value.match(/^(\d{4})/);
            if (!match) {
                throw new Error(`Cannot extract YEAR from value: ${value}`);
            }
            return match[1];
        }

        case 'DATE': {
            // "2026-02-14T10:30:00Z" → "2026-02-14"
            const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
            if (!match) {
                throw new Error(`Cannot extract DATE from value: ${value}`);
            }
            return match[1];
        }

        default:
            throw new Error(`Unknown transform: ${transform}`);
    }
}

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

/**
 * Extracts consistency keys from an event based on configuration
 */
export class KeyExtractor<Events extends Record<string, object> = Record<string, object>> {
    constructor(private readonly config: ConsistencyConfig<Events>) {
    }

    /**
     * Extract all consistency keys from an event
     */
    extract(event: NewEvent | StoredEvent): ExtractedKey[] {
        const eventConfig = this.config.eventTypes[event.type] as
            | {
            keys: Array<{
                name: string;
                path: string;
                transform?: string;
                nullHandling?: string;
                defaultValue?: string;
            }>;
        }
            | undefined;

        // No configuration for this event type — no keys extracted
        if (!eventConfig) {
            return [];
        }

        const keys: ExtractedKey[] = [];

        for (const keyDef of eventConfig.keys) {
            const rawValue = resolvePath(event, keyDef.path);

            // Handle null/undefined values
            if (rawValue === null || rawValue === undefined) {
                const handling = keyDef.nullHandling ?? 'error';

                switch (handling) {
                    case 'skip':
                        continue;

                    case 'default':
                        if (keyDef.defaultValue === undefined) {
                            throw new KeyExtractionError(
                                event.type,
                                keyDef.name,
                                keyDef.path,
                                'nullHandling is "default" but no defaultValue provided'
                            );
                        }
                        keys.push({name: keyDef.name, value: keyDef.defaultValue});
                        continue;

                    case 'error':
                    default:
                        throw new KeyExtractionError(
                            event.type,
                            keyDef.name,
                            keyDef.path,
                            'Path resolved to null/undefined'
                        );
                }
            }

            // Convert to string
            let stringValue: string;
            if (typeof rawValue === 'string') {
                stringValue = rawValue;
            } else if (typeof rawValue === 'number' || typeof rawValue === 'bigint') {
                stringValue = String(rawValue);
            } else if (typeof rawValue === 'boolean') {
                stringValue = rawValue ? 'true' : 'false';
            } else {
                throw new KeyExtractionError(
                    event.type,
                    keyDef.name,
                    keyDef.path,
                    `Cannot convert value of type ${typeof rawValue} to string`
                );
            }

            // Apply transformation
            const finalValue = applyTransform(stringValue, keyDef.transform as ConsistencyKeyTransform);

            keys.push({name: keyDef.name, value: finalValue});
        }

        return keys;
    }
}
