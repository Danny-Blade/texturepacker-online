import type { ExportFormat, PackerOptions } from './packer';
import type { PublishOptions } from './store';

/**
 * Web TexturePacker tool version used in the Smart Update hash. Bumping this
 * intentionally invalidates every stored hash. The value is kept in sync with
 * `package.json` by the release scripts / CI; we hardcode it here so the
 * module stays SSR-safe (no dynamic JSON import needed in the browser bundle).
 */
export const SMART_UPDATE_TOOL_VERSION = '0.1.0';

/** Sidecar filename written into the destination directory. */
export const SMART_UPDATE_SIDECAR = '.wtp-smart-update';

const LOCAL_STORAGE_PREFIX = 'wtp:smart-update:';

export interface SmartUpdateInputs {
  toolVersion: string;
  images: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    contentHash: string;
  }>;
  settings: PackerOptions;
  publishOptions: PublishOptions;
  exportFormat: ExportFormat;
  customFormatId?: string;
  fileName: string;
  /** Optional list of Smart Folder ids so manual membership edits invalidate the cache. */
  smartFolderIds?: string[];
}

export interface SmartUpdateRecord {
  hash: string;
  filenames: string[];
}

// ---------- canonical serialization ----------

/**
 * Recursively sort object keys, drop `undefined` values, coerce `NaN` → null,
 * then `JSON.stringify`. This guarantees `{a:1,b:2}` and `{b:2,a:1}` hash to
 * the same value while ignoring `undefined` fields that projects add over
 * time. Arrays keep their order because order carries meaning (sheet layout,
 * variant list, sprite ordering).
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return null; // only reached inside arrays / at root
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const raw = record[key];
      if (raw === undefined) continue;
      out[key] = canonicalize(raw);
    }
    return out;
  }
  // Functions, symbols, and other non-serializable values are dropped so
  // ImageItem's `image: HTMLImageElement` in packer types doesn't upset the
  // hash — callers are expected to only feed pure data to computeSmartUpdateHash.
  return null;
}

// ---------- SHA-256 ----------

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  // Copy into a fresh ArrayBuffer to satisfy the BufferSource signature under
  // TS 5.x lib.dom where Uint8Array<ArrayBufferLike> isn't assignable to
  // BufferSource<ArrayBuffer>.
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const buffer = await crypto.subtle.digest('SHA-256', copy.buffer);
  return toHex(buffer);
}

/** Deterministic SHA-256 hex hash of the canonical Smart Update inputs. */
export async function computeSmartUpdateHash(inputs: SmartUpdateInputs): Promise<string> {
  const canonical = canonicalStringify(inputs);
  const bytes = new TextEncoder().encode(canonical);
  return sha256Hex(bytes);
}

// ---------- image content hashes ----------

const contentHashCache = new Map<string, string>();

function decodeBase64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  const nodeGlobal = globalThis as typeof globalThis & {
    Buffer?: { from: (input: string, encoding: string) => { buffer: ArrayBufferLike; byteOffset: number; byteLength: number } };
  };
  if (nodeGlobal.Buffer) {
    const buf = nodeGlobal.Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return new TextEncoder().encode(base64);
}

/**
 * Hash the raw bytes of a `data:` URL (base64 or percent-encoded). For any
 * other URL scheme we fall back to hashing the URL string itself — it is the
 * best a browser can do without fetching the resource, and it still detects
 * URL changes. Results are memoised per URL so a project with the same sprite
 * pack multiple times only pays the hash cost once.
 */
export async function computeImageContentHash(url: string): Promise<string> {
  if (typeof url !== 'string' || url.length === 0) return '';
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const cached = contentHashCache.get(url);
  if (cached) return cached;

  let bytes: Uint8Array;
  const match = /^data:([^;,]*)?(;base64)?,(.*)$/i.exec(url);
  if (match && match[2] === ';base64') {
    bytes = decodeBase64ToBytes(match[3]);
  } else if (match) {
    try {
      bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
    } catch {
      bytes = new TextEncoder().encode(match[3]);
    }
  } else {
    bytes = new TextEncoder().encode(url);
  }
  const hash = await sha256Hex(bytes);
  contentHashCache.set(url, hash);
  return hash;
}

// ---------- filesystem sidecar / localStorage persistence ----------

interface WritableStreamLike {
  write: (data: Blob | string | BufferSource) => Promise<void>;
  close: () => Promise<void>;
}

interface FileHandleLike {
  getFile: () => Promise<Blob>;
  createWritable: () => Promise<WritableStreamLike>;
}

interface DirHandleLike {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandleLike>;
}

function asDirHandle(dirHandle: FileSystemDirectoryHandle | null): DirHandleLike | null {
  if (!dirHandle) return null;
  // The File System Access API mirrors these shapes in every browser that
  // implements it; we type them locally to stay compatible with older lib.dom.d.ts.
  return dirHandle as unknown as DirHandleLike;
}

/**
 * Ensure every filename in `filenames` still exists inside `dirHandle`. When
 * the FileSystem API isn't available (no handle at all), we return false so
 * the caller re-publishes rather than trusting a stale cache.
 */
export async function outputsExist(
  dirHandle: FileSystemDirectoryHandle | null,
  filenames: string[],
): Promise<boolean> {
  const dh = asDirHandle(dirHandle);
  if (!dh) return false;
  if (filenames.length === 0) return true;
  try {
    for (const name of filenames) {
      const fh = await dh.getFileHandle(name, { create: false });
      // Some polyfills throw only on file access, not handle lookup — probe.
      await fh.getFile();
    }
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function localStorageKey(fileName: string): string {
  return `${LOCAL_STORAGE_PREFIX}${fileName}`;
}

function isValidRecord(value: unknown): value is SmartUpdateRecord {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.hash !== 'string') return false;
  if (!Array.isArray(rec.filenames)) return false;
  return rec.filenames.every((name) => typeof name === 'string');
}

async function readSidecar(dh: DirHandleLike): Promise<Record<string, SmartUpdateRecord>> {
  try {
    const fh = await dh.getFileHandle(SMART_UPDATE_SIDECAR, { create: false });
    const file = await fh.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, SmartUpdateRecord> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidRecord(value)) {
        out[key] = { hash: value.hash, filenames: [...value.filenames] };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function loadLastHashRecord(
  dirHandle: FileSystemDirectoryHandle | null,
  fileName: string,
): Promise<SmartUpdateRecord | null> {
  const dh = asDirHandle(dirHandle);
  if (dh) {
    const sidecar = await readSidecar(dh);
    const entry = sidecar[fileName];
    return entry ? { hash: entry.hash, filenames: [...entry.filenames] } : null;
  }
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(localStorageKey(fileName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (isValidRecord(parsed)) {
      return { hash: parsed.hash, filenames: [...parsed.filenames] };
    }
  } catch {
    /* corrupted entry — treat as missing */
  }
  return null;
}

export async function saveLastHashRecord(
  dirHandle: FileSystemDirectoryHandle | null,
  fileName: string,
  record: SmartUpdateRecord,
): Promise<void> {
  const clone: SmartUpdateRecord = { hash: record.hash, filenames: [...record.filenames] };
  const dh = asDirHandle(dirHandle);
  if (dh) {
    try {
      const sidecar = await readSidecar(dh);
      sidecar[fileName] = clone;
      const fh = await dh.getFileHandle(SMART_UPDATE_SIDECAR, { create: true });
      const writable = await fh.createWritable();
      const payload = JSON.stringify(sidecar, null, 2);
      try {
        await writable.write(new Blob([payload], { type: 'application/json' }));
      } catch {
        // Some polyfills only accept plain strings; retry once.
        await writable.write(payload);
      }
      await writable.close();
      return;
    } catch {
      /* fall through to localStorage as best-effort */
    }
  }
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(localStorageKey(fileName), JSON.stringify(clone));
  } catch {
    /* quota / private-mode — silently drop, publishing still succeeds */
  }
}

/** Test-only helper: reset the memoised content-hash cache. */
export function _resetSmartUpdateCachesForTesting(): void {
  contentHashCache.clear();
}
