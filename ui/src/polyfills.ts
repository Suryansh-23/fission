// Polyfills for Node.js modules in browser environment
import { Buffer } from 'buffer';

// Declare process as any to avoid TypeScript errors
declare var process: any;

// Make Buffer available globally
(window as any).Buffer = Buffer;
(window as any).global = window;

// Polyfill process.env and other process methods
if (typeof process === 'undefined') {
  (window as any).process = {
    env: import.meta.env || {},
    platform: 'browser',
    version: 'v18.0.0',
    versions: { node: '18.0.0' },
    nextTick: (cb: () => void) => setTimeout(cb, 0),
    cwd: () => '/',
    exit: () => {},
  };
}

// Crypto polyfill for browser
if (typeof window !== 'undefined' && !window.crypto?.subtle) {
  try {
    // Fallback crypto implementation
    import('crypto-browserify').then((crypto) => {
      (window as any).crypto = {
        ...window.crypto,
        ...crypto,
        getRandomValues: (arr: any) => {
          const randomBytes = crypto.randomBytes(arr.length);
          arr.set(randomBytes);
          return arr;
        }
      };
    }).catch(() => {
      console.warn('Crypto polyfill not available');
    });
  } catch (e) {
    console.warn('Crypto polyfill not available');
  }
}

// Additional polyfills for Node.js modules
(window as any).require = (module: string) => {
  console.warn(`Module ${module} not available in browser`);
  return {};
};
