import { describe, it, expect } from 'vitest';
import { 
  Decider, 
  buildState, 
  buildStateWithDecider, 
  executeCommand 
} from '../src/decider.js';
import type { Event } from '../src/types.js';

// Test event types
type ItemAdded = Event<'ItemAdded', { productId: string; quantity: number }>;
type ItemRemoved = Event<'ItemRemoved', { productId: string }>;
type CartCheckedOut = Event<'CartCheckedOut', { itemCount: number }>;
type CartEvent = ItemAdded | ItemRemoved | CartCheckedOut;

// Test command types
type AddItem = { type: 'AddItem'; productId: string; quantity: number };
type RemoveItem = { type: 'RemoveItem'; productId: string };
type Checkout = { type: 'Checkout' };
type CartCommand = AddItem | RemoveItem | Checkout;

// Test state
type CartState = {
  items: Map<string, number>;
  checkedOut: boolean;
};

// Test decider
const cartDecider: Decider<CartState, CartCommand, CartEvent> = {
  initialState: () => ({ items: new Map(), checkedOut: false }),
  
  evolve: (state, event) => {
    switch (event.type) {
      case 'ItemAdded': {
        const newItems = new Map(state.items);
        const current = newItems.get(event.data.productId) ?? 0;
        newItems.set(event.data.productId, current + event.data.quantity);
        return { ...state, items: newItems };
      }
      case 'ItemRemoved': {
        const newItems = new Map(state.items);
        newItems.delete(event.data.productId);
        return { ...state, items: newItems };
      }
      case 'CartCheckedOut':
        return { ...state, checkedOut: true };
    }
  },
  
  decide: (command, state) => {
    switch (command.type) {
      case 'AddItem':
        if (state.checkedOut) throw new Error('Cart already checked out');
        return { 
          type: 'ItemAdded', 
          data: { productId: command.productId, quantity: command.quantity } 
        };
      case 'RemoveItem':
        if (state.checkedOut) throw new Error('Cart already checked out');
        if (!state.items.has(command.productId)) throw new Error('Item not in cart');
        return { 
          type: 'ItemRemoved', 
          data: { productId: command.productId } 
        };
      case 'Checkout':
        if (state.checkedOut) throw new Error('Already checked out');
        if (state.items.size === 0) throw new Error('Cart is empty');
        return { 
          type: 'CartCheckedOut', 
          data: { itemCount: state.items.size } 
        };
    }
  }
};

describe('Decider', () => {
  describe('buildState', () => {
    it('returns initial state for empty events', () => {
      const state = buildState<CartState, CartEvent>(
        [],
        cartDecider.evolve,
        cartDecider.initialState()
      );
      
      expect(state.items.size).toBe(0);
      expect(state.checkedOut).toBe(false);
    });

    it('evolves state from events', () => {
      const events: CartEvent[] = [
        { type: 'ItemAdded', data: { productId: 'apple', quantity: 3 } },
        { type: 'ItemAdded', data: { productId: 'banana', quantity: 2 } },
        { type: 'ItemAdded', data: { productId: 'apple', quantity: 1 } }, // Add more apples
      ];

      const state = buildState(events, cartDecider.evolve, cartDecider.initialState());
      
      expect(state.items.get('apple')).toBe(4);
      expect(state.items.get('banana')).toBe(2);
      expect(state.checkedOut).toBe(false);
    });

    it('handles checkout event', () => {
      const events: CartEvent[] = [
        { type: 'ItemAdded', data: { productId: 'apple', quantity: 1 } },
        { type: 'CartCheckedOut', data: { itemCount: 1 } },
      ];

      const state = buildState(events, cartDecider.evolve, cartDecider.initialState());
      
      expect(state.checkedOut).toBe(true);
    });
  });

  describe('buildStateWithDecider', () => {
    it('uses decider initialState and evolve', () => {
      const events: CartEvent[] = [
        { type: 'ItemAdded', data: { productId: 'apple', quantity: 5 } },
      ];

      const state = buildStateWithDecider(events, cartDecider);
      
      expect(state.items.get('apple')).toBe(5);
    });
  });

  describe('executeCommand', () => {
    it('produces events from command', () => {
      const events: CartEvent[] = [];
      const command: CartCommand = { type: 'AddItem', productId: 'apple', quantity: 3 };

      const newEvents = executeCommand(events, command, cartDecider);
      
      expect(newEvents).toHaveLength(1);
      expect(newEvents[0].type).toBe('ItemAdded');
      expect(newEvents[0].data).toEqual({ productId: 'apple', quantity: 3 });
    });

    it('considers current state when deciding', () => {
      const events: CartEvent[] = [
        { type: 'ItemAdded', data: { productId: 'apple', quantity: 1 } },
      ];
      const command: CartCommand = { type: 'Checkout' };

      const newEvents = executeCommand(events, command, cartDecider);
      
      expect(newEvents).toHaveLength(1);
      expect(newEvents[0].type).toBe('CartCheckedOut');
      expect(newEvents[0].data).toEqual({ itemCount: 1 });
    });

    it('throws when command violates business rules', () => {
      const events: CartEvent[] = [
        { type: 'ItemAdded', data: { productId: 'apple', quantity: 1 } },
        { type: 'CartCheckedOut', data: { itemCount: 1 } },
      ];
      const command: CartCommand = { type: 'AddItem', productId: 'banana', quantity: 1 };

      expect(() => executeCommand(events, command, cartDecider))
        .toThrow('Cart already checked out');
    });

    it('throws when checkout on empty cart', () => {
      const events: CartEvent[] = [];
      const command: CartCommand = { type: 'Checkout' };

      expect(() => executeCommand(events, command, cartDecider))
        .toThrow('Cart is empty');
    });

    it('throws when removing non-existent item', () => {
      const events: CartEvent[] = [];
      const command: CartCommand = { type: 'RemoveItem', productId: 'ghost' };

      expect(() => executeCommand(events, command, cartDecider))
        .toThrow('Item not in cart');
    });
  });
});
