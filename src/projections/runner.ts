/**
 * ProjectionRunner
 * 
 * Manages running projections with catchup and live updates.
 */

import type { EventStore } from '../event-store.js';
import type { EventNotifier } from './notifier.js';
import type { ProjectionHandler, ProjectionState } from './types.js';

export class ProjectionRunner {
  private states: Map<string, ProjectionState> = new Map();
  private running = false;

  constructor(
    private readonly store: EventStore,
    private readonly notifier: EventNotifier,
    private readonly projections: Record<string, ProjectionHandler>
  ) {}

  /**
   * Start the projection runner
   * - Performs catchup (reads all events since last position)
   * - Starts listening for new events
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('ProjectionRunner is already running');
    }

    this.running = true;

    // Initialize states
    for (const [name, handler] of Object.entries(this.projections)) {
      this.states.set(name, {
        state: handler.init,
        lastPosition: 0n,
      });
    }

    // Perform catchup for each projection
    await this.catchup();

    // Start listening for new events
    this.notifier.onNewEvents((position) => {
      this.processNewEvents(position).catch(err => {
        console.error('[ProjectionRunner] Error processing new events:', err);
      });
    });
  }

  /**
   * Catchup: read all events since last position and rebuild state
   */
  private async catchup(): Promise<void> {
    for (const [name, handler] of Object.entries(this.projections)) {
      const projectionState = this.states.get(name)!;
      
      // Build query conditions from handler
      const conditions = handler.query ?? Object.keys(handler.when).map(type => ({ type }));
      
      if (conditions.length === 0) {
        continue; // No events to process
      }

      // Read all events since last position
      const result = await this.store.read({
        conditions,
        fromPosition: projectionState.lastPosition,
      });

      // Process events
      let currentState = projectionState.state;
      for (const event of result.events) {
        const eventHandler = handler.when[event.type];
        if (eventHandler) {
          currentState = eventHandler(currentState, event);
          projectionState.lastPosition = event.position;
        }
      }

      // Update state
      projectionState.state = currentState;
    }
  }

  /**
   * Process new events (called by notifier)
   */
  private async processNewEvents(latestPosition: bigint): Promise<void> {
    if (!this.running) {
      return;
    }

    for (const [name, handler] of Object.entries(this.projections)) {
      const projectionState = this.states.get(name)!;
      
      // Skip if we've already processed up to this position
      if (projectionState.lastPosition >= latestPosition) {
        continue;
      }

      // Build query conditions
      const conditions = handler.query ?? Object.keys(handler.when).map(type => ({ type }));
      
      if (conditions.length === 0) {
        continue;
      }

      // Read events since last position
      const result = await this.store.read({
        conditions,
        fromPosition: projectionState.lastPosition,
      });

      // Process events
      let currentState = projectionState.state;
      for (const event of result.events) {
        const eventHandler = handler.when[event.type];
        if (eventHandler) {
          currentState = eventHandler(currentState, event);
          projectionState.lastPosition = event.position;
        }
      }

      // Update state
      projectionState.state = currentState;
    }
  }

  /**
   * Stop the projection runner
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.notifier.close();
  }

  /**
   * Get current state of a projection
   */
  getState<T = unknown>(name: string): ProjectionState<T> {
    const state = this.states.get(name);
    if (!state) {
      throw new Error(`Projection '${name}' not found`);
    }
    return state as ProjectionState<T>;
  }

  /**
   * Check if runner is currently running
   */
  isRunning(): boolean {
    return this.running;
  }
}
