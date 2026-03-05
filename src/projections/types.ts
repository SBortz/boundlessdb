/**
 * Projection Types
 * 
 * Types for defining and managing projections.
 */

import type { StoredEvent, QueryCondition } from '../types.js';

/**
 * ProjectionHandler defines how a projection processes events
 */
export interface ProjectionHandler<TState = unknown> {
  /**
   * Initial state of the projection
   */
  init: TState;

  /**
   * Event handlers: map event type to state reducer
   */
  when: Record<string, (state: TState, event: StoredEvent) => TState>;

  /**
   * Optional query conditions to filter which events this projection cares about
   * If omitted, all events matching the `when` handlers will be processed
   */
  query?: QueryCondition[];
}

/**
 * Current state of a running projection
 */
export interface ProjectionState<TState = unknown> {
  /**
   * Current projection state
   */
  state: TState;

  /**
   * Last processed event position
   */
  lastPosition: bigint;
}
