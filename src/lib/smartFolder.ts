const POLL_INTERVAL_MS = 4000;
const HANDLE_DB = 'web-texturepacker-smart-folders';
const HANDLE_STORE = 'handles';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

interface FsFileHandleLike extends FileSystemFileHandle {
  getFile(): Promise<File>;
}

interface FsDirHandleLike extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FsDirHandleLike | FsFileHandleLike]>;
}

interface PermissionCapableHandle {
  queryPermission?: (options?: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode: 'read' }) => Promise<PermissionState>;
}

export type SmartFolderPermission = PermissionState | 'unsupported';

export interface WatchedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  /** Snapshot captured atomically when the watcher is registered. */
  initialScan: ScanResult;
}

export interface ScannedFile {
  file: File;
  relativePath: string;
  key: string;
}

export interface ScanResult {
  files: File[];
  /** Relative paths inside the directory (e.g. "hero/walk/0001.png"). */
  relativePaths: string[];
  entries: ScannedFile[];
}

export interface SmartFolderChanges {
  added: ScannedFile[];
  removedPaths: string[];
  /** Same path with a changed size or modification timestamp. */
  modifiedPaths: string[];
}

export interface WatchOptions {
  id?: string;
  requestPermission?: boolean;
}

export interface SmartFolderManager {
  watch(handle: FileSystemDirectoryHandle, options?: WatchOptions): Promise<WatchedFolder>;
  unwatch(id: string): void;
  syncNow(id: string): Promise<void>;
  dispose(): void;
}

export interface SmartFolderCallbacks {
  onSync: (folder: WatchedFolder, changes: SmartFolderChanges) => void | Promise<void>;
  onError: (folder: WatchedFolder, error: Error) => void;
}

function isImageName(name: string): boolean {
  return IMAGE_EXT_RE.test(name);
}

function fileKey(file: File, relativePath: string): string {
  return `${relativePath}|${file.size}|${file.lastModified}`;
}

async function walk(
  dir: FsDirHandleLike,
  prefix: string,
  entries: ScannedFile[],
): Promise<void> {
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === 'directory') {
      await walk(entry as FsDirHandleLike, prefix ? `${prefix}/${name}` : name, entries);
    } else if (entry.kind === 'file' && isImageName(name)) {
      try {
        const file = await (entry as FsFileHandleLike).getFile();
        const relativePath = prefix ? `${prefix}/${name}` : name;
        entries.push({ file, relativePath, key: fileKey(file, relativePath) });
      } catch {
        // A temporarily unreadable file does not abort the rest of the folder.
      }
    }
  }
}

export async function scanDirectory(handle: FileSystemDirectoryHandle): Promise<ScanResult> {
  const entries: ScannedFile[] = [];
  await walk(handle as FsDirHandleLike, '', entries);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return {
    entries,
    files: entries.map((entry) => entry.file),
    relativePaths: entries.map((entry) => entry.relativePath),
  };
}

interface WatchedEntry {
  folder: WatchedFolder;
  lastByPath: Map<string, ScannedFile>;
  syncing: Promise<void> | null;
}

function createNoopManager(): SmartFolderManager {
  return {
    watch: async () => {
      throw new Error('Smart Folders are not supported in this environment.');
    },
    unwatch: () => {},
    syncNow: async () => {},
    dispose: () => {},
  };
}

export async function getDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  request = false,
): Promise<SmartFolderPermission> {
  const capable = handle as unknown as PermissionCapableHandle;
  try {
    if (capable.queryPermission) {
      const current = await capable.queryPermission({ mode: 'read' });
      if (current === 'granted' || !request) return current;
    } else if (!capable.requestPermission) {
      // Handles returned by older implementations are already readable.
      return 'unsupported';
    }
    if (request && capable.requestPermission) {
      return await capable.requestPermission({ mode: 'read' });
    }
    return 'prompt';
  } catch {
    return 'denied';
  }
}

export function createSmartFolderManager(callbacks: SmartFolderCallbacks): SmartFolderManager {
  if (typeof window === 'undefined') return createNoopManager();

  const watched = new Map<string, WatchedEntry>();

  const performSync = async (entry: WatchedEntry): Promise<void> => {
    let scan: ScanResult;
    try {
      scan = await scanDirectory(entry.folder.handle);
    } catch (error) {
      watched.delete(entry.folder.id);
      const normalized = error instanceof Error ? error : new Error(String(error));
      callbacks.onError(entry.folder, normalized);
      throw normalized;
    }

    const nextByPath = new Map(scan.entries.map((item) => [item.relativePath, item]));
    const added: ScannedFile[] = [];
    const removedPaths: string[] = [];
    const modifiedPaths: string[] = [];

    for (const item of scan.entries) {
      const previous = entry.lastByPath.get(item.relativePath);
      if (!previous) added.push(item);
      else if (previous.key !== item.key) {
        modifiedPaths.push(item.relativePath);
        added.push(item);
        removedPaths.push(item.relativePath);
      }
    }
    for (const path of entry.lastByPath.keys()) {
      if (!nextByPath.has(path)) removedPaths.push(path);
    }

    entry.lastByPath = nextByPath;
    if (added.length > 0 || removedPaths.length > 0) {
      await callbacks.onSync(entry.folder, { added, removedPaths, modifiedPaths });
    }
  };

  const syncEntry = (entry: WatchedEntry): Promise<void> => {
    if (entry.syncing) return entry.syncing;
    entry.syncing = performSync(entry).finally(() => { entry.syncing = null; });
    return entry.syncing;
  };

  const intervalId = window.setInterval(() => {
    for (const entry of watched.values()) void syncEntry(entry).catch(() => {});
  }, POLL_INTERVAL_MS);

  return {
    async watch(handle, options = {}) {
      const permission = await getDirectoryPermission(handle, options.requestPermission ?? true);
      if (permission === 'denied' || permission === 'prompt') {
        throw new DOMException('Read permission is required for this Smart Folder.', 'NotAllowedError');
      }
      const initialScan = await scanDirectory(handle);
      const folder: WatchedFolder = {
        id: options.id ?? `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: handle.name,
        handle,
        initialScan,
      };
      watched.set(folder.id, {
        folder,
        lastByPath: new Map(initialScan.entries.map((item) => [item.relativePath, item])),
        syncing: null,
      });
      return folder;
    },
    unwatch(id) {
      watched.delete(id);
    },
    async syncNow(id) {
      const entry = watched.get(id);
      if (entry) await syncEntry(entry);
    },
    dispose() {
      window.clearInterval(intervalId);
      watched.clear();
    },
  };
}

function openHandleDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
        request.result.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function withHandleStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openHandleDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(HANDLE_STORE, mode);
      const request = operation(tx.objectStore(HANDLE_STORE));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function persistDirectoryHandle(id: string, handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await withHandleStore('readwrite', (store) => store.put(handle, id))) !== null;
}

export async function restoreDirectoryHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  return await withHandleStore('readonly', (store) => store.get(id)) as FileSystemDirectoryHandle | null;
}

export async function forgetDirectoryHandle(id: string): Promise<void> {
  await withHandleStore('readwrite', (store) => store.delete(id));
}

export const WATCH_FOLDER_EVENT = 'tp:watch-folder';
export const SMART_FOLDER_COMMAND_EVENT = 'tp:smart-folder-command';

interface WatchFolderEventDetail {
  handle: FileSystemDirectoryHandle;
  folderId?: string;
}

export type SmartFolderCommand =
  | { action: 'sync'; folderId: string }
  | { action: 'unwatch'; folderId: string }
  | { action: 'authorize'; folderId: string };

export function dispatchSmartFolderCommand(command: SmartFolderCommand): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SmartFolderCommand>(SMART_FOLDER_COMMAND_EVENT, { detail: command }));
  }
}

export type WatchFolderEvent = CustomEvent<WatchFolderEventDetail>;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

interface WindowWithPicker {
  showDirectoryPicker: (options?: unknown) => Promise<FileSystemDirectoryHandle>;
}

export async function requestWatchFolder(folderId?: string): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    const handle = await (window as unknown as WindowWithPicker).showDirectoryPicker();
    window.dispatchEvent(new CustomEvent<WatchFolderEventDetail>(WATCH_FOLDER_EVENT, {
      detail: { handle, folderId },
    }));
    return handle;
  } catch {
    return null;
  }
}
