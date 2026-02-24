/**
 * EventNotifier Interface
 * 
 * Abstracts notification mechanism for new events in the event store.
 */

export interface EventNotifier {
  /**
   * Register callback for new events
   * @param callback Called with the position of the latest event
   */
  onNewEvents(callback: (fromPosition: bigint) => void): void;

  /**
   * Stop listening for events
   */
  close(): void;
}
