import { afterEach, describe, expect, it } from 'vitest';
import {
  SMART_UPDATE_SIDECAR,
  SMART_UPDATE_TOOL_VERSION,
  _resetSmartUpdateCachesForTesting,
  canonicalStringify,
  computeImageContentHash,
  computeSmartUpdateHash,
  loadLastHashRecord,
  outputsExist,
  saveLastHashRecord,
  type SmartUpdateInputs,
} from '../src/lib/smartUpdate';
import type { PackerOptions } from '../src/lib/packer';
import type { PublishOptions } from '../src/lib/store';

function makeSettings(overrides: Partial<PackerOptions> = {}): PackerOptions {
  return {
    maxWidth: 2048,
    maxHeight: 2048,
    borderPadding: 0,
    shapePadding: 2,
    innerPadding: 0,
    allowRotation: false,
    powerOfTwo: true,
    forceSquare: false,
    sizeMode: 'max',
    sizeConstraint: 'pot',
    packMode: 'good',
    commonDivisorX: 1,
    commonDivisorY: 1,
    algorithm: 'maxrects-bssf',
    trimAlpha: false,
    trimThreshold: 1,
    trimMode: 'trim',
    polygonTolerance: 2,
    trimMargin: 0,
    extrude: 0,
    multipack: false,
    multipackMode: 'auto',
    manualSheets: [{ id: 'sheet-main', name: 'Main' }],
    aliasDuplicates: false,
    ...overrides,
  };
}

function makePublishOptions(overrides: Partial<PublishOptions> = {}): PublishOptions {
  return {
    imageFormat: 'png',
    imageQuality: 0.92,
    scales: [1],
    imageFileTemplate: '{name}{suffix}{n}.{ext}',
    dataFileTemplate: '{name}{suffix}{n}.{ext}',
    bundleZip: false,
    png8Colors: 256,
    png8Dither: 'none',
    png8DitherStrength: 1,
    forcePublish: false,
    ...overrides,
  };
}

function makeInputs(overrides: Partial<SmartUpdateInputs> = {}): SmartUpdateInputs {
  return {
    toolVersion: SMART_UPDATE_TOOL_VERSION,
    images: [
      { id: 'a', name: 'a.png', width: 16, height: 16, contentHash: 'hash-a' },
      { id: 'b', name: 'b.png', width: 8, height: 8, contentHash: 'hash-b' },
    ],
    settings: makeSettings(),
    publishOptions: makePublishOptions(),
    exportFormat: 'json',
    fileName: 'spritesheet',
    ...overrides,
  };
}

afterEach(() => {
  _resetSmartUpdateCachesForTesting();
});

describe('canonicalStringify', () => {
  it('produces the same output regardless of key order', () => {
    expect(canonicalStringify({ a: 1, b: 2 })).toBe(canonicalStringify({ b: 2, a: 1 }));
  });

  it('drops undefined values inside objects', () => {
    expect(canonicalStringify({ a: 1, b: undefined })).toBe(
      canonicalStringify({ a: 1 }),
    );
  });

  it('coerces NaN to null', () => {
    expect(canonicalStringify({ a: Number.NaN })).toBe(JSON.stringify({ a: null }));
  });

  it('preserves array order (order carries meaning)', () => {
    expect(canonicalStringify([1, 2, 3])).not.toBe(canonicalStringify([3, 2, 1]));
  });

  it('recurses into nested objects', () => {
    const one = canonicalStringify({ outer: { c: 3, a: 1, b: 2 } });
    const two = canonicalStringify({ outer: { a: 1, b: 2, c: 3 } });
    expect(one).toBe(two);
  });
});

describe('computeSmartUpdateHash', () => {
  it('is stable across two calls with the same input', async () => {
    const a = await computeSmartUpdateHash(makeInputs());
    const b = await computeSmartUpdateHash(makeInputs());
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('is stable when unrelated key order changes', async () => {
    const a = await computeSmartUpdateHash(makeInputs());
    const b = await computeSmartUpdateHash({
      exportFormat: 'json',
      fileName: 'spritesheet',
      publishOptions: makePublishOptions(),
      settings: makeSettings(),
      toolVersion: SMART_UPDATE_TOOL_VERSION,
      images: [
        { name: 'a.png', id: 'a', height: 16, width: 16, contentHash: 'hash-a' },
        { contentHash: 'hash-b', id: 'b', name: 'b.png', width: 8, height: 8 },
      ],
    });
    expect(a).toBe(b);
  });

  it('changes when a single setting changes', async () => {
    const base = await computeSmartUpdateHash(makeInputs());
    const bumped = await computeSmartUpdateHash(
      makeInputs({ settings: makeSettings({ shapePadding: 4 }) }),
    );
    expect(base).not.toBe(bumped);
  });

  it('changes when toolVersion changes', async () => {
    const base = await computeSmartUpdateHash(makeInputs());
    const bumped = await computeSmartUpdateHash(makeInputs({ toolVersion: '9.9.9' }));
    expect(base).not.toBe(bumped);
  });

  it('changes when an image contentHash changes', async () => {
    const base = await computeSmartUpdateHash(makeInputs());
    const changed = await computeSmartUpdateHash(makeInputs({
      images: [
        { id: 'a', name: 'a.png', width: 16, height: 16, contentHash: 'hash-a-v2' },
        { id: 'b', name: 'b.png', width: 8, height: 8, contentHash: 'hash-b' },
      ],
    }));
    expect(base).not.toBe(changed);
  });

  it('changes when the export format changes', async () => {
    const base = await computeSmartUpdateHash(makeInputs());
    const changed = await computeSmartUpdateHash(makeInputs({ exportFormat: 'phaser3' }));
    expect(base).not.toBe(changed);
  });
});

describe('computeImageContentHash', () => {
  it('returns the same hash for identical data URLs', async () => {
    const url = 'data:image/png;base64,AAAA';
    const a = await computeImageContentHash(url);
    const b = await computeImageContentHash(url);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('returns different hashes for different payloads', async () => {
    const a = await computeImageContentHash('data:image/png;base64,AAAA');
    const b = await computeImageContentHash('data:image/png;base64,BBBB');
    expect(a).not.toBe(b);
  });

  it('handles non-data URLs by hashing the URL string itself', async () => {
    const a = await computeImageContentHash('blob:http://x/1');
    const b = await computeImageContentHash('blob:http://x/2');
    expect(a).not.toBe(b);
    expect(await computeImageContentHash('blob:http://x/1')).toBe(a);
  });

  it('returns empty string for an empty URL', async () => {
    expect(await computeImageContentHash('')).toBe('');
  });
});

// ---------- filesystem sidecar mock ----------

interface WritableCapture {
  data: string | null;
  closed: boolean;
}

function makeDirectoryMock(initial: Record<string, string> = {}) {
  const files: Map<string, string> = new Map(Object.entries(initial));
  const missingFileError = new Error('NotFoundError');
  const handle = {
    files,
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const exists = files.has(name);
      if (!exists && !options?.create) {
        throw missingFileError;
      }
      const capture: WritableCapture = { data: null, closed: false };
      return {
        getFile: async () => {
          if (!files.has(name)) throw missingFileError;
          const text = files.get(name) ?? '';
          return {
            text: async () => text,
            arrayBuffer: async () => new TextEncoder().encode(text).buffer,
          } as unknown as Blob;
        },
        createWritable: async () => ({
          write: async (input: Blob | string) => {
            if (typeof input === 'string') {
              capture.data = input;
            } else {
              // A minimal Blob polyfill for Node isn't guaranteed — coerce.
              capture.data = await (input as Blob).text();
            }
          },
          close: async () => {
            capture.closed = true;
            if (capture.data !== null) files.set(name, capture.data);
          },
        }),
      };
    },
  };
  return handle;
}

describe('sidecar persistence', () => {
  it('save + load round-trips through a FileSystem directory handle', async () => {
    const dir = makeDirectoryMock();
    await saveLastHashRecord(dir as unknown as FileSystemDirectoryHandle, 'atlas', {
      hash: 'deadbeef',
      filenames: ['atlas.png', 'atlas.json'],
    });
    // The sidecar file should now exist inside the mock directory.
    expect(dir.files.has(SMART_UPDATE_SIDECAR)).toBe(true);
    const loaded = await loadLastHashRecord(dir as unknown as FileSystemDirectoryHandle, 'atlas');
    expect(loaded).toEqual({ hash: 'deadbeef', filenames: ['atlas.png', 'atlas.json'] });
  });

  it('keeps sidecar entries for other filenames when saving one', async () => {
    const dir = makeDirectoryMock();
    await saveLastHashRecord(dir as unknown as FileSystemDirectoryHandle, 'atlas-a', {
      hash: 'aaa',
      filenames: ['a.png'],
    });
    await saveLastHashRecord(dir as unknown as FileSystemDirectoryHandle, 'atlas-b', {
      hash: 'bbb',
      filenames: ['b.png'],
    });
    const a = await loadLastHashRecord(dir as unknown as FileSystemDirectoryHandle, 'atlas-a');
    const b = await loadLastHashRecord(dir as unknown as FileSystemDirectoryHandle, 'atlas-b');
    expect(a).toEqual({ hash: 'aaa', filenames: ['a.png'] });
    expect(b).toEqual({ hash: 'bbb', filenames: ['b.png'] });
  });

  it('returns null for missing entries', async () => {
    const dir = makeDirectoryMock();
    expect(await loadLastHashRecord(dir as unknown as FileSystemDirectoryHandle, 'missing')).toBeNull();
  });
});

describe('outputsExist', () => {
  it('returns false when the handle is null', async () => {
    expect(await outputsExist(null, ['atlas.png'])).toBe(false);
  });

  it('returns true when every filename exists', async () => {
    const dir = makeDirectoryMock({ 'atlas.png': 'x', 'atlas.json': 'y' });
    expect(
      await outputsExist(dir as unknown as FileSystemDirectoryHandle, ['atlas.png', 'atlas.json']),
    ).toBe(true);
  });

  it('returns false when any filename is missing', async () => {
    const dir = makeDirectoryMock({ 'atlas.png': 'x' });
    expect(
      await outputsExist(dir as unknown as FileSystemDirectoryHandle, ['atlas.png', 'atlas.json']),
    ).toBe(false);
  });
});
