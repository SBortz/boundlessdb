/**
 * Decider Pattern - Inspired by Emmett
 * 
 * The Decider pattern provides a structured way to:
 * 1. evolve: Build state from events
 * 2. decide: Produce new events from commands and current state
 * 3. initialState: Provide the starting state
 */

import type { Event, StoredEvent } from './types.js';

/**
 * Decider definition for event-sourced aggregates.
 * 
 * @typeParam State - The aggregate state type
 * @typeParam Command - Union of command types this decider handles
 * @typeParam E - Union of event types this decider produces
 * 
 * @example
 * ```typescript
 * type ShoppingCartState = {
 *   items: Map<string, number>;
 *   checkedOut: boolean;
 * };
 * 
 * type AddItem = { type: 'AddItem'; productId: string; quantity: number };
 * type Checkout = { type: 'Checkout' };
 * type CartCommand = AddItem | Checkout;
 * 
 * type ItemAdded = Event<'ItemAdded', { productId: string; quantity: number }>;
 * type CartCheckedOut = Event<'CartCheckedOut', { itemCount: number }>;
 * type CartEvent = ItemAdded | CartCheckedOut;
 * 
 * const cartDecider: Decider<ShoppingCartState, CartCommand, CartEvent> = {
 *   initialState: () => ({ items: new Map(), checkedOut: false }),
 *   
 *   evolve: (state, event) => {
 *     switch (event.type) {
 *       case 'ItemAdded':
 *         const current = state.items.get(event.data.productId) ?? 0;
 *         state.items.set(event.data.productId, current + event.data.quantity);
 *         return state;
 *       case 'CartCheckedOut':
 *         return { ...state, checkedOut: true };
 *     }
 *   },
 *   
 *   decide: (command, state) => {
 *     switch (command.type) {
 *       case 'AddItem':
 *         if (state.checkedOut) throw new Error('Cart already checked out');
 *         return { type: 'ItemAdded', data: { productId: command.productId, quantity: command.quantity } };
 *       case 'Checkout':
 *         if (state.checkedOut) throw new Error('Already checked out');
 *         return { type: 'CartCheckedOut', data: { itemCount: state.items.size } };
 *     }
 *   }
 * };
 * ```
 */
export interface Decider<State, Command, E extends Event> {
  /**
   * Produce the initial state before any events
   */
  initialState: () => State;

  /**
   * Apply an event to the current state, returning the new state.
   * This is a pure function - it should not have side effects.
   */
  evolve: (state: State, event: E) => State;

  /**
   * Given a command and the current state, decide what events should occur.
   * May throw an error if the command is invalid for the current state.
   * 
   * @returns A single event, an array of events, or an empty array if no events should be produced
   */
  decide: (command: Command, state: State) => E | E[];
}

/**
 * Build state by folding events through a decider's evolve function.
 * 
 * @example
 * ```typescript
 * const result = await store.read<CartEvent>({ conditions });
 * const state = evolve(result.events, cartDecider);
 * ```
 */
export function evolve<State, Command, E extends Event>(
  events: readonly (E | StoredEvent<E>)[],
  decider: Decider<State, Command, E>
): State {
  return events.reduce(
    (state, event) => decider.evolve(state, event as E),
    decider.initialState()
  );
}

/**
 * Execute a command against a decider, given the current events.
 * Builds state from events, then calls decider.decide().
 * Returns the new events that should be appended.
 * 
 * @example
 * ```typescript
 * const result = await store.read<CartEvent>({ conditions });
 * const newEvents = decide(command, result.events, cartDecider);
 * await store.append(newEvents, result.token);
 * ```
 */
export function decide<State, Command, E extends Event>(
  command: Command,
  events: readonly (E | StoredEvent<E>)[],
  decider: Decider<State, Command, E>
): E[] {
  const state = evolve(events, decider);
  const result = decider.decide(command, state);
  return Array.isArray(result) ? result : [result];
}
