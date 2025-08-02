// Polyfills for Node.js modules in browser environment
import { Buffer } from 'buffer';

// Make Buffer available globally
(window as any).Buffer = Buffer;

// Make global available
(window as any).global = window;

// Polyfill process.env if needed
if (typeof process === 'undefined') {
  (window as any).process = {
    env: {},
    nextTick: (cb: () => void) => setTimeout(cb, 0),
  };
}
