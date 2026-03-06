/**
 * Consistency Config Validator
 */

import type {ConsistencyConfig} from '../types.js';

export class ConfigValidationError extends Error {
    constructor(public readonly errors: string[]) {
        super(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
        this.name = 'ConfigValidationError';
    }
}

const VALID_TRANSFORMS = ['LOWER', 'UPPER', 'MONTH', 'YEAR', 'DATE'] as const;
const VALID_NULL_HANDLING = ['error', 'skip', 'default'] as const;
const KEY_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

/**
 * Validate a single key definition
 */
function validateKeyDef(
    eventType: string,
    keyDef: Record<string, unknown>,
    index: number
): string[] {
    const errors: string[] = [];
    const prefix = `eventTypes.${eventType}.keys[${index}]`;
    const name = keyDef.name as string | undefined;
    const path = keyDef.path as string | undefined;

    // name: required, valid format
    if (!name) {
        errors.push(`${prefix}.name is required`);
    } else if (!KEY_NAME_PATTERN.test(name)) {
        errors.push(`${prefix}.name "${name}" must match pattern ${KEY_NAME_PATTERN}`);
    }

    // path: required, valid format
    if (!path) {
        errors.push(`${prefix}.path is required`);
    } else if (!PATH_PATTERN.test(path)) {
        errors.push(`${prefix}.path "${path}" must be a valid dot-notation path`);
    }

    // transform: optional, must be valid
    if (keyDef.transform !== undefined) {
        if (!VALID_TRANSFORMS.includes(keyDef.transform as (typeof VALID_TRANSFORMS)[number])) {
            errors.push(
                `${prefix}.transform "${keyDef.transform}" must be one of: ${VALID_TRANSFORMS.join(', ')}`
            );
        }
    }

    // nullHandling: optional, must be valid
    if (keyDef.nullHandling !== undefined) {
        if (
            !VALID_NULL_HANDLING.includes(keyDef.nullHandling as (typeof VALID_NULL_HANDLING)[number])
        ) {
            errors.push(
                `${prefix}.nullHandling "${keyDef.nullHandling}" must be one of: ${VALID_NULL_HANDLING.join(', ')}`
            );
        }

        // If nullHandling is 'default', defaultValue must be provided
        if (keyDef.nullHandling === 'default' && keyDef.defaultValue === undefined) {
            errors.push(`${prefix}.defaultValue is required when nullHandling is "default"`);
        }
    }

    return errors;
}

/**
 * Validate a full consistency configuration
 * @throws ConfigValidationError if validation fails
 */
export function validateConfig(config: ConsistencyConfig): void {
    const errors: string[] = [];

    // Basic structure check
    if (!config || typeof config !== 'object') {
        throw new ConfigValidationError(['Configuration must be an object']);
    }

    if (!config.eventTypes || typeof config.eventTypes !== 'object') {
        throw new ConfigValidationError(['eventTypes must be an object']);
    }

    // Validate each event type
    for (const [eventType, eventConfig] of Object.entries(config.eventTypes)) {
        if (!eventConfig || typeof eventConfig !== 'object') {
            errors.push(`eventTypes.${eventType} must be an object`);
            continue;
        }

        if (!Array.isArray(eventConfig.keys)) {
            errors.push(`eventTypes.${eventType}.keys must be an array`);
            continue;
        }

        // Validate each key definition (duplicate key names are allowed —
        // e.g. UsernameChanged needs two 'username' keys for old + new value)
        for (let i = 0; i < eventConfig.keys.length; i++) {
            const keyDef = eventConfig.keys[i] as unknown as Record<string, unknown>;
            errors.push(...validateKeyDef(eventType, keyDef, i));
        }
    }

    if (errors.length > 0) {
        throw new ConfigValidationError(errors);
    }
}
