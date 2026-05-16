const POLL_INTERVAL_MS = 4000;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

interface FsFileHandleLike extends FileSystemFileHandle {
  getFile(): Promise<File>;
}

interface FsDirHandleLike extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FsDirHandleLike | FsFileHandleLike]>;
}

export interface WatchedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
}

export interface ScanResult {
  files: File[];
  /** Relative paths inside the directory (e.g. "hero/walk/0001.png"). */
  relativePaths: string[];
}

export interface SmartFolderManager {
  watch(handle: FileSystemDirectoryHandle): Promise<WatchedFolder>;
  unwatch(id: string): void;
  syncNow(id: string): Promise<void>;
  dispose(): void;
}

export interface SmartFolderCallbacks {
  onSync: (folder: WatchedFolder, added: File[], removed: string[]) => void;
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
  files: File[],
  relativePaths: string[],
): Promise<void> {
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === 'directory') {
      await walk(entry as FsDirHandleLike, prefix ? `${prefix}/${name}` : name, files, relativePaths);
    } else if (entry.kind === 'file') {
      if (!isImageName(name)) continue;
      try {
        const file = await (entry as FsFileHandleLike).getFile();
        files.push(file);
        relativePaths.push(prefix ? `${prefix}/${name}` : name);
      } catch {
        // Skip unreadable file
      }
    }
  }
}

export async function scanDirectory(handle: FileSystemDirectoryHandle): Promise<ScanResult> {
  const files: File[] = [];
  const relativePaths: string[] = [];
  await walk(handle as FsDirHandleLike, '', files, relativePaths);
  return { files, relativePaths };
}

interface WatchedEntry {
  folder: WatchedFolder;
  lastFileKeys: Set<string>;
  lastByKey: Map<string, string>;
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

export function createSmartFolderManager(callbacks: SmartFolderCallbacks): SmartFolderManager {
  if (typeof window === 'undefined') return createNoopManager();

  const entries = new Map<string, WatchedEntry>();

  const syncEntry = async (entry: WatchedEntry): Promise<void> => {
    let scan: ScanResult;
    try {
      scan = await scanDirectory(entry.folder.handle);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      entries.delete(entry.folder.id);
      callbacks.onError(entry.folder, error);
      return;
    }

    const nextKeys = new Set<string>();
    const nextByKey = new Map<string, string>();
    const addedFiles: File[] = [];

    for (let i = 0; i < scan.files.length; i++) {
      const file = scan.files[i];
      const rel = scan.relativePaths[i];
      const key = fileKey(file, rel);
      nextKeys.add(key);
      nextByKey.set(key, rel);
      if (!entry.lastFileKeys.has(key)) {
        try {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: `${entry.folder.name}/${rel}`,
            configurable: true,
          });
        } catch {
          // ignore
        }
        addedFiles.push(file);
      }
    }

    const removedPaths: string[] = [];
    for (const oldKey of entry.lastFileKeys) {
      if (!nextKeys.has(oldKey)) {
        const path = entry.lastByKey.get(oldKey);
        if (path) removedPaths.push(path);
      }
    }

    entry.lastFileKeys = nextKeys;
    entry.lastByKey = nextByKey;

    if (addedFiles.length > 0 || removedPaths.length > 0) {
      callbacks.onSync(entry.folder, addedFiles, removedPaths);
    }
  };

  const intervalId = window.setInterval(() => {
    for (const entry of Array.from(entries.values())) {
      void syncEntry(entry);
    }
  }, POLL_INTERVAL_MS);

  return {
    async watch(handle) {
      const folder: WatchedFolder = {
        id: `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: handle.name,
        handle,
      };
      const initial = await scanDirectory(handle);
      const keys = new Set<string>();
      const byKey = new Map<string, string>();
      for (let i = 0; i < initial.files.length; i++) {
        const k = fileKey(initial.files[i], initial.relativePaths[i]);
        keys.add(k);
        byKey.set(k, initial.relativePaths[i]);
      }
      entries.set(folder.id, { folder, lastFileKeys: keys, lastByKey: byKey });
      return folder;
    },
    unwatch(id) {
      entries.delete(id);
    },
    async syncNow(id) {
      const entry = entries.get(id);
      if (!entry) return;
      await syncEntry(entry);
    },
    dispose() {
      window.clearInterval(intervalId);
      entries.clear();
    },
  };
}

export const WATCH_FOLDER_EVENT = 'tp:watch-folder';

interface WatchFolderEventDetail {
  handle: FileSystemDirectoryHandle;
}

export type WatchFolderEvent = CustomEvent<WatchFolderEventDetail>;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

interface WindowWithPicker {
  showDirectoryPicker: (options?: unknown) => Promise<FileSystemDirectoryHandle>;
}

export async function requestWatchFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    const w = window as unknown as WindowWithPicker;
    const handle = await w.showDirectoryPicker();
    const detail: WatchFolderEventDetail = { handle };
    window.dispatchEvent(new CustomEvent<WatchFolderEventDetail>(WATCH_FOLDER_EVENT, { detail }));
    return handle;
  } catch {
    return null;
  }
}
