/**
 * Browser-agnostic re-export of the packing core.
 *
 * The canonical implementation lives in `src/lib/packer.ts` — that file is
 * still imported directly by the Web Worker build script, the browser code and
 * existing tests, so this module is deliberately a `export *` alias to keep a
 * single source of truth (P3-01).
 */
export * from '../lib/packer';
