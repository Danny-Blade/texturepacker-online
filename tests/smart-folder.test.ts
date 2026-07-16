import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSmartFolderManager,
  getDirectoryPermission,
  isFileSystemAccessSupported,
  restoreDirectoryHandle,
  scanDirectory,
  type SmartFolderChanges,
} from '../src/lib/smartFolder';

class FakeFileHandle {
  readonly kind = 'file' as const;
  constructor(readonly name: string, public file: File) {}
  async getFile() { return this.file; }
}

class FakeDirectoryHandle {
  readonly kind = 'directory' as const;
  queryPermission = vi.fn(async () => 'granted' as PermissionState);
  requestPermission = vi.fn(async () => 'granted' as PermissionState);

  constructor(
    readonly name: string,
    readonly children = new Map<string, FakeDirectoryHandle | FakeFileHandle>(),
  ) {}

  async *entries(): AsyncIterableIterator<[string, FakeDirectoryHandle | FakeFileHandle]> {
    for (const entry of this.children.entries()) yield entry;
  }
}

function file(name: string, body: string, lastModified: number): File {
  return new File([body], name, { type: 'image/png', lastModified });
}

function asDirectory(value: FakeDirectoryHandle): FileSystemDirectoryHandle {
  return value as unknown as FileSystemDirectoryHandle;
}

const originalWindow = globalThis.window;
const originalIndexedDb = globalThis.indexedDB;

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn(),
    },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb });
  vi.restoreAllMocks();
});

describe('Smart Folder directory snapshots', () => {
  it('recursively scans supported images with deterministic relative paths', async () => {
    const nested = new FakeDirectoryHandle('walk', new Map([
      ['002.png', new FakeFileHandle('002.png', file('002.png', 'b', 2))],
      ['notes.txt', new FakeFileHandle('notes.txt', new File(['x'], 'notes.txt'))],
    ]));
    const root = new FakeDirectoryHandle('characters', new Map<string, FakeDirectoryHandle | FakeFileHandle>([
      ['walk', nested],
      ['hero.webp', new FakeFileHandle('hero.webp', file('hero.webp', 'a', 1))],
    ]));

    const result = await scanDirectory(asDirectory(root));
    expect(result.relativePaths).toEqual(['hero.webp', 'walk/002.png']);
    expect(result.entries.map((entry) => entry.key)).toEqual([
      'hero.webp|1|1',
      'walk/002.png|1|2',
    ]);
  });

  it('reports content changes as a replacement at the same path', async () => {
    const sprite = new FakeFileHandle('hero.png', file('hero.png', 'old', 1));
    const root = new FakeDirectoryHandle('characters', new Map([['hero.png', sprite]]));
    const changes: SmartFolderChanges[] = [];
    const manager = createSmartFolderManager({
      onSync: (_folder, diff) => { changes.push(diff); },
      onError: vi.fn(),
    });
    const watched = await manager.watch(asDirectory(root));

    sprite.file = file('hero.png', 'new-content', 2);
    await manager.syncNow(watched.id);

    expect(changes).toHaveLength(1);
    expect(changes[0].modifiedPaths).toEqual(['hero.png']);
    expect(changes[0].removedPaths).toEqual(['hero.png']);
    expect(changes[0].added.map((entry) => entry.relativePath)).toEqual(['hero.png']);
    manager.dispose();
  });

  it('detects renames and directory hierarchy moves without duplicate additions', async () => {
    const original = new FakeFileHandle('hero.png', file('hero.png', 'same', 1));
    const root = new FakeDirectoryHandle('characters', new Map([['hero.png', original]]));
    const changes: SmartFolderChanges[] = [];
    const manager = createSmartFolderManager({
      onSync: (_folder, diff) => { changes.push(diff); },
      onError: vi.fn(),
    });
    const watched = await manager.watch(asDirectory(root));

    root.children.clear();
    root.children.set('ui', new FakeDirectoryHandle('ui', new Map([
      ['portrait.png', new FakeFileHandle('portrait.png', file('portrait.png', 'same', 1))],
    ])));
    await manager.syncNow(watched.id);

    expect(changes[0].removedPaths).toEqual(['hero.png']);
    expect(changes[0].added.map((entry) => entry.relativePath)).toEqual(['ui/portrait.png']);
    expect(new Set(changes[0].added.map((entry) => entry.relativePath)).size).toBe(1);
    manager.dispose();
  });

  it('captures the initial snapshot during watch and does not re-emit it on immediate sync', async () => {
    const root = new FakeDirectoryHandle('ui', new Map([
      ['button.png', new FakeFileHandle('button.png', file('button.png', 'a', 1))],
    ]));
    const onSync = vi.fn();
    const manager = createSmartFolderManager({ onSync, onError: vi.fn() });
    const watched = await manager.watch(asDirectory(root));
    expect(watched.initialScan.relativePaths).toEqual(['button.png']);
    await manager.syncNow(watched.id);
    expect(onSync).not.toHaveBeenCalled();
    manager.dispose();
  });
});

describe('Smart Folder permissions and fallback', () => {
  it('queries first and requests permission only when explicitly allowed', async () => {
    const root = new FakeDirectoryHandle('ui');
    root.queryPermission.mockResolvedValue('prompt');
    root.requestPermission.mockResolvedValue('granted');
    expect(await getDirectoryPermission(asDirectory(root), false)).toBe('prompt');
    expect(root.requestPermission).not.toHaveBeenCalled();
    expect(await getDirectoryPermission(asDirectory(root), true)).toBe('granted');
    expect(root.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
  });

  it('does not register a watcher when read permission is denied', async () => {
    const root = new FakeDirectoryHandle('private');
    root.queryPermission.mockResolvedValue('denied');
    root.requestPermission.mockResolvedValue('denied');
    const manager = createSmartFolderManager({ onSync: vi.fn(), onError: vi.fn() });
    await expect(manager.watch(asDirectory(root))).rejects.toMatchObject({ name: 'NotAllowedError' });
    manager.dispose();
  });

  it('degrades cleanly when the picker and IndexedDB are unavailable', async () => {
    expect(isFileSystemAccessSupported()).toBe(false);
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    expect(await restoreDirectoryHandle('missing')).toBeNull();
  });
});
