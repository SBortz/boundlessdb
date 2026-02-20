/**
 * Consistency Config Validator
 */

import type { ConsistencyConfig, ConsistencyKeyDef } from '../types.js';

export class ConfigValidationError extends Error {
  constructor(
    public readonly errors: string[]
  ) {
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
  keyDef: ConsistencyKeyDef,
  index: number
): string[] {
  const errors: string[] = [];
  const prefix = `eventTypes.${eventType}.keys[${index}]`;

  // name: required, valid format
  if (!keyDef.name) {
    errors.push(`${prefix}.name is required`);
  } else if (!KEY_NAME_PATTERN.test(keyDef.name)) {
    errors.push(
      `${prefix}.name "${keyDef.name}" must match pattern ${KEY_NAME_PATTERN}`
    );
  }

  // path: required, valid format
  if (!keyDef.path) {
    errors.push(`${prefix}.path is required`);
  } else if (!PATH_PATTERN.test(keyDef.path)) {
    errors.push(
      `${prefix}.path "${keyDef.path}" must be a valid dot-notation path`
    );
  }

  // transform: optional, must be valid
  if (keyDef.transform !== undefined) {
    if (!VALID_TRANSFORMS.includes(keyDef.transform as typeof VALID_TRANSFORMS[number])) {
      errors.push(
        `${prefix}.transform "${keyDef.transform}" must be one of: ${VALID_TRANSFORMS.join(', ')}`
      );
    }
  }

  // nullHandling: optional, must be valid
  if (keyDef.nullHandling !== undefined) {
    if (!VALID_NULL_HANDLING.includes(keyDef.nullHandling as typeof VALID_NULL_HANDLING[number])) {
      errors.push(
        `${prefix}.nullHandling "${keyDef.nullHandling}" must be one of: ${VALID_NULL_HANDLING.join(', ')}`
      );
    }

    // If nullHandling is 'default', defaultValue must be provided
    if (keyDef.nullHandling === 'default' && keyDef.defaultValue === undefined) {
      errors.push(
        `${prefix}.defaultValue is required when nullHandling is "default"`
      );
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

    // Check for duplicate key names within the same event type
    const keyNames = new Set<string>();
    for (let i = 0; i < eventConfig.keys.length; i++) {
      const keyDef = eventConfig.keys[i];
      
      // Validate the key definition
      errors.push(...validateKeyDef(eventType, keyDef, i));

      // Check for duplicates
      if (keyDef.name && keyNames.has(keyDef.name)) {
        errors.push(
          `eventTypes.${eventType}.keys has duplicate key name "${keyDef.name}"`
        );
      }
      keyNames.add(keyDef.name);
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
}
