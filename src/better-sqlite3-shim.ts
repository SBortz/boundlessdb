/**
 * Browser shim for better-sqlite3
 * 
 * This module throws a helpful error if someone tries to use SqliteStorage in the browser.
 * Use SqlJsStorage instead for browser environments.
 */

class BrowserNotSupportedError extends Error {
  constructor() {
    super(
      'better-sqlite3 is not available in browser environments. ' +
      'Use SqlJsStorage instead for browser-based event storage.'
    );
    this.name = 'BrowserNotSupportedError';
  }
}

export default function Database(_path?: string) {
  throw new BrowserNotSupportedError();
}

export { BrowserNotSupportedError };
