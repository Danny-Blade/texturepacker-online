/**
 * Browser-agnostic re-export of the format generators. Everything under
 * `src/lib/formats` is pure string generation — safe to import from a Node
 * CLI or a Web Worker with no DOM shim.
 */
export * from '../lib/formats';
