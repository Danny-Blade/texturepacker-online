'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTpStore, loadImageFromFile, type ImageItem } from '@/lib/store';
import { getTranslations, type Locale } from '@/lib/i18n';
import MenuBar from './MenuBar';
import Toolbar from './Toolbar';
import SpritesPanel from './SpritesPanel';
import CanvasViewport from './CanvasViewport';
import Inspector from './Inspector';
import StatusBar from './StatusBar';
import AnimationPanel from './AnimationPanel';
import PublishDialog from './PublishDialog';
import ShortcutsDialog from './ShortcutsDialog';
import CutterDialog from './CutterDialog';
import { parseTpsPlist } from '@/lib/tpsCompat';
import {
  createProjectDocument,
  decodeProjectSprites,
  parseProject,
  projectFileName,
  serializeProject,
} from '@/lib/projectFile';
import {
  decodeFailure,
  formatImageLoadFailures,
  validateDecodedImage,
  validateImageFile,
  type ImageLoadFailure,
} from '@/lib/imageValidation';
import {
  createSmartFolderManager,
  forgetDirectoryHandle,
  getDirectoryPermission,
  isFileSystemAccessSupported,
  persistDirectoryHandle,
  requestWatchFolder,
  restoreDirectoryHandle,
  SMART_FOLDER_COMMAND_EVENT,
  WATCH_FOLDER_EVENT,
  type SmartFolderCommand,
  type SmartFolderManager,
  type WatchedFolder,
} from '@/lib/smartFolder';
import { useAnimationStore } from '@/lib/animationStore';

interface AppShellProps {
  locale: Locale;
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (cb: (file: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      cb: (entries: FileSystemEntryLike[]) => void,
      err?: (e: unknown) => void,
    ) => void;
  };
}

async function collectFilesFromEntry(
  entry: FileSystemEntryLike,
  prefix = '',
): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise<File[]>((resolve) => {
      entry.file!(
        (f) => {
          if (prefix) {
            Object.defineProperty(f, 'webkitRelativePath', {
              value: `${prefix}${f.name}`,
              configurable: true,
            });
          }
          resolve([f]);
        },
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: File[] = [];
    const readBatch = (): Promise<void> =>
      new Promise<void>((resolve) => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          for (const child of entries) {
            const childFiles = await collectFilesFromEntry(child, `${prefix}${entry.name}/`);
            all.push(...childFiles);
          }
          await readBatch();
          resolve();
        });
      });
    await readBatch();
    return all;
  }
  return [];
}

export default function AppShell({ locale }: AppShellProps) {
  const t = getTranslations(locale);

  const leftWidth = useTpStore((s) => s.leftPanelWidth);
  const rightWidth = useTpStore((s) => s.rightPanelWidth);
  const setLeftWidth = useTpStore((s) => s.setLeftPanelWidth);
  const setRightWidth = useTpStore((s) => s.setRightPanelWidth);

  const dragSideRef = useRef<'left' | 'right' | null>(null);
  const dragStartRef = useRef<{ x: number; w: number }>({ x: 0, w: 0 });
  const [dragSide, setDragSide] = useState<'left' | 'right' | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [cutterOpen, setCutterOpen] = useState(false);

  const addSpritesInputRef = useRef<HTMLInputElement>(null);
  const addFolderInputRef = useRef<HTMLInputElement>(null);
  const openProjectInputRef = useRef<HTMLInputElement>(null);

  const startDrag = useCallback(
    (side: 'left' | 'right') => (e: React.MouseEvent) => {
      dragSideRef.current = side;
      setDragSide(side);
      dragStartRef.current = {
        x: e.clientX,
        w: side === 'left' ? leftWidth : rightWidth,
      };
    },
    [leftWidth, rightWidth],
  );

  useEffect(() => {
    if (!dragSide) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      if (dragSideRef.current === 'left') {
        setLeftWidth(dragStartRef.current.w + dx);
      } else {
        setRightWidth(dragStartRef.current.w - dx);
      }
    };
    const onUp = () => {
      dragSideRef.current = null;
      setDragSide(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragSide, setLeftWidth, setRightWidth]);

  const loadFiles = useCallback(async (files: File[]) => {
    const failures: ImageLoadFailure[] = [];
    const imageFiles = files.filter((file) => {
      const failure = validateImageFile(file);
      if (failure) failures.push(failure);
      return !failure;
    });
    const loaded: ImageItem[] = [];
    const decoded = await Promise.all(
      imageFiles.map(async (file) => {
        try {
          return { item: await loadImageFromFile(file), failure: null };
        } catch (error) {
          return { item: null, failure: decodeFailure(file.name, error) };
        }
      }),
    );
    const knownNames = new Set(useTpStore.getState().images.map((image) => image.name));
    for (const result of decoded) {
      if (result.failure) {
        failures.push(result.failure);
        continue;
      }
      if (!result.item) continue;
      const failure = validateDecodedImage(
        result.item.name,
        result.item.width,
        result.item.height,
        knownNames,
      );
      if (failure) {
        failures.push(failure);
        continue;
      }
      knownNames.add(result.item.name);
      loaded.push(result.item);
    }
    if (loaded.length > 0) {
      useTpStore.getState().addImages(loaded);
    }
    const loadedMessage =
      loaded.length > 0 ? `Loaded ${loaded.length} sprite${loaded.length === 1 ? '' : 's'}.` : '';
    const failureMessage = formatImageLoadFailures(failures);
    if (loadedMessage || failureMessage) {
      useTpStore.getState().showNotification(
        `${loadedMessage}${loadedMessage && failureMessage ? ' ' : ''}${failureMessage}`,
        failures.length > 0 ? 8000 : 2500,
      );
    }
  }, []);

  const onAddSpritesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      loadFiles(Array.from(files));
      e.target.value = '';
    },
    [loadFiles],
  );

  const onAddFolderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      loadFiles(Array.from(files));
      e.target.value = '';
    },
    [loadFiles],
  );

  const handleAddSprites = useCallback(() => addSpritesInputRef.current?.click(), []);
  const handleAddFolder = useCallback(() => addFolderInputRef.current?.click(), []);

  const smartFolderManagerRef = useRef<SmartFolderManager | null>(null);

  const loadFilesFromSmartFolder = useCallback(
    async (folder: WatchedFolder, files: File[], relativePaths: string[]) => {
      if (files.length === 0) return 0;
      const loaded: ImageItem[] = [];
      const failures: ImageLoadFailure[] = [];
      const decoded = await Promise.all(
        files.map(async (f, idx) => {
          const fileFailure = validateImageFile(f);
          if (fileFailure) return { item: null, failure: fileFailure };
          try {
            const rel = relativePaths[idx];
            try {
              Object.defineProperty(f, 'webkitRelativePath', {
                value: `${folder.name}/${rel}`,
                configurable: true,
              });
            } catch {
              // ignore
            }
            return { item: await loadImageFromFile(f), failure: null };
          } catch (error) {
            return { item: null, failure: decodeFailure(f.name, error) };
          }
        }),
      );
      const knownNames = new Set(useTpStore.getState().images.map((image) => image.name));
      for (const result of decoded) {
        if (result.failure) {
          failures.push(result.failure);
          continue;
        }
        if (!result.item) continue;
        const failure = validateDecodedImage(
          result.item.name,
          result.item.width,
          result.item.height,
          knownNames,
        );
        if (failure) {
          failures.push(failure);
          continue;
        }
        knownNames.add(result.item.name);
        loaded.push(result.item);
      }
      if (failures.length > 0) {
        useTpStore.getState().showNotification(formatImageLoadFailures(failures), 8000);
      }
      if (loaded.length === 0) return 0;
      const store = useTpStore.getState();
      store.addImages(loaded);
      const sf = store.smartFolders.find((f) => f.id === folder.id);
      const prevIds = sf ? sf.trackedIds : [];
      store.updateSmartFolder(folder.id, {
        trackedIds: [...prevIds, ...loaded.map((l) => l.id)],
        lastSync: Date.now(),
      });
      return loaded.length;
    },
    [],
  );

  const ensureSmartFolderManager = useCallback((): SmartFolderManager | null => {
    if (smartFolderManagerRef.current) return smartFolderManagerRef.current;
    if (typeof window === 'undefined') return null;
    const mgr = createSmartFolderManager({
      onSync: async (folder, changes) => {
        const store = useTpStore.getState();
        const prefix = `${folder.name}/`;
        const removedNames = new Set(
          changes.removedPaths.map((p) => `${prefix}${p}`.replace(/\.[^/.]+$/, '')),
        );
        let removedCount = 0;
        if (removedNames.size > 0) {
          const smartFolder = store.smartFolders.find((item) => item.id === folder.id);
          const trackedIds = new Set(smartFolder?.trackedIds ?? []);
          const removeIds = store.images
            .filter((img) => trackedIds.has(img.id) && removedNames.has(img.name))
            .map((img) => img.id);
          if (removeIds.length > 0) {
            store.removeImages(removeIds);
            removedCount = removeIds.length;
            const sf = store.smartFolders.find((f) => f.id === folder.id);
            if (sf) {
              const removeSet = new Set(removeIds);
              store.updateSmartFolder(folder.id, {
                trackedIds: sf.trackedIds.filter((id) => !removeSet.has(id)),
              });
            }
          }
        }
        const finalize = (addedCount: number) => {
          useTpStore.getState().updateSmartFolder(folder.id, { lastSync: Date.now() });
          useTpStore
            .getState()
            .showNotification(
              t.smartFolder.syncSummary
                .replace('{added}', String(addedCount))
                .replace('{removed}', String(removedCount)),
            );
        };
        if (changes.added.length > 0) {
          const addedCount = await loadFilesFromSmartFolder(
            folder,
            changes.added.map((entry) => entry.file),
            changes.added.map((entry) => entry.relativePath),
          );
          finalize(addedCount);
        } else {
          finalize(0);
        }
      },
      onError: (folder, err) => {
        const store = useTpStore.getState();
        const smartFolder = store.smartFolders.find((item) => item.id === folder.id);
        const tracked = new Set(smartFolder?.trackedIds ?? []);
        store.updateSmartFolder(folder.id, {
          requiresAuthorization: true,
          trackedSpriteNames: store.images.filter((image) => tracked.has(image.id)).map((image) => image.name),
        });
        store.showNotification(`${t.smartFolder.watchError}: ${err.message}`, 6000);
      },
    });
    smartFolderManagerRef.current = mgr;
    return mgr;
  }, [loadFilesFromSmartFolder, t.smartFolder.syncSummary, t.smartFolder.watchError]);

  useEffect(() => {
    return () => {
      smartFolderManagerRef.current?.dispose();
      smartFolderManagerRef.current = null;
    };
  }, []);

  const watchDirectoryHandle = useCallback(
    async (handle: FileSystemDirectoryHandle, requestedFolderId?: string, requestPermission = true) => {
      const mgr = ensureSmartFolderManager();
      if (!mgr) return;
      try {
        const beforeWatch = useTpStore.getState();
        const existing = beforeWatch.smartFolders.find((folder) =>
          requestedFolderId ? folder.id === requestedFolderId : folder.name === handle.name,
        );
        const folder = await mgr.watch(handle, { id: existing?.id ?? requestedFolderId, requestPermission });
        if (existing) {
          // Reauthorization performs an immediate full reconciliation. This
          // handles edits, renames and moved subdirectories that happened
          // while the project was closed without creating duplicate sprites.
          useTpStore.getState().removeImages(existing.trackedIds);
          useTpStore.getState().updateSmartFolder(existing.id, {
            name: folder.name,
            trackedIds: [],
            trackedSpriteNames: [],
            requiresAuthorization: false,
            lastSync: Date.now(),
          });
        } else {
          useTpStore.getState().addSmartFolder({
            id: folder.id,
            name: folder.name,
            trackedIds: [],
            lastSync: Date.now(),
            requiresAuthorization: false,
          });
        }
        const handlePersisted = await persistDirectoryHandle(folder.id, handle);
        const count = await loadFilesFromSmartFolder(
          folder,
          folder.initialScan.files,
          folder.initialScan.relativePaths,
        );
        const watchedMessage = (existing ? t.smartFolder.authorizationRestored : t.smartFolder.watching)
            .replace('{name}', folder.name)
            .replace('{n}', String(count));
        useTpStore.getState().showNotification(
          handlePersisted ? watchedMessage : `${watchedMessage} ${t.smartFolder.persistenceUnavailable}`,
          handlePersisted ? 2500 : 6000,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        useTpStore.getState().showNotification(`${t.smartFolder.scanError}: ${msg}`);
      }
    },
    [ensureSmartFolderManager, loadFilesFromSmartFolder, t.smartFolder.authorizationRestored, t.smartFolder.persistenceUnavailable, t.smartFolder.scanError, t.smartFolder.watching],
  );

  const handleWatchFolder = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      useTpStore.getState().showNotification(t.smartFolder.notSupported);
      return;
    }
    interface WindowWithPicker {
      showDirectoryPicker: (options?: unknown) => Promise<FileSystemDirectoryHandle>;
    }
    try {
      const w = window as unknown as WindowWithPicker;
      const handle = await w.showDirectoryPicker();
      await watchDirectoryHandle(handle);
    } catch {
      /* user cancelled */
    }
  }, [t.smartFolder.notSupported, watchDirectoryHandle]);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ handle: FileSystemDirectoryHandle; folderId?: string }>).detail;
      if (detail && detail.handle) {
        void watchDirectoryHandle(detail.handle, detail.folderId);
      }
    };
    window.addEventListener(WATCH_FOLDER_EVENT, onEvent);
    return () => window.removeEventListener(WATCH_FOLDER_EVENT, onEvent);
  }, [watchDirectoryHandle]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<SmartFolderCommand>).detail;
      if (!command?.folderId) return;
      if (command.action === 'authorize') {
        if (!isFileSystemAccessSupported()) {
          useTpStore.getState().showNotification(t.smartFolder.notSupported);
        } else {
          void requestWatchFolder(command.folderId);
        }
      } else if (command.action === 'sync') {
        const manager = smartFolderManagerRef.current;
        if (!manager) return;
        void manager.syncNow(command.folderId)
          .then(() => {
            useTpStore.getState().updateSmartFolder(command.folderId, { lastSync: Date.now() });
            useTpStore.getState().showNotification(t.smartFolder.syncComplete);
          })
          .catch(() => {});
      } else if (command.action === 'unwatch') {
        smartFolderManagerRef.current?.unwatch(command.folderId);
        void forgetDirectoryHandle(command.folderId);
        useTpStore.getState().removeSmartFolder(command.folderId);
      }
    };
    window.addEventListener(SMART_FOLDER_COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(SMART_FOLDER_COMMAND_EVENT, onCommand);
  }, [t.smartFolder.notSupported, t.smartFolder.syncComplete]);

  const triggerDownload = useCallback((filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handlePublish = useCallback(() => {
    const { packResult, showNotification } = useTpStore.getState();
    if (!packResult || packResult.sheets.length === 0) {
      showNotification(t.errors.noImages);
      return;
    }
    useTpStore.setState({ publishMode: 'atlas' });
    setPublishOpen(true);
  }, [t.errors.noImages]);

  const handleBatchConvert = useCallback(() => {
    const { images, showNotification } = useTpStore.getState();
    if (images.length === 0) {
      showNotification(t.errors.noImages);
      return;
    }
    useTpStore.setState({ publishMode: 'batch' });
    setPublishOpen(true);
  }, [t.errors.noImages]);

  const handleSaveProject = useCallback(async () => {
    const state = useTpStore.getState();
    const project = createProjectDocument(state, useAnimationStore.getState().groups);
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const outputName = projectFileName(state.fileName);

    type DirHandleAny = FileSystemDirectoryHandle & {
      getFileHandle: (n: string, o?: { create?: boolean }) => Promise<{
        createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
      }>;
    };
    if (state.dirHandle) {
      try {
        const dh = state.dirHandle as DirHandleAny;
        const fh = await dh.getFileHandle(outputName, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        useTpStore.getState().showNotification(t.project.saved);
        return;
      } catch {
        /* fall through */
      }
    }
    triggerDownload(outputName, blob);
    useTpStore.getState().showNotification(t.project.saved);
  }, [t.project.saved, triggerDownload]);

  const handleOpenProject = useCallback(() => openProjectInputRef.current?.click(), []);

  const handleProjectFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const raw = (ev.target?.result as string) ?? '';
        const head = raw.trimStart().slice(0, 256);
        const isPlist =
          head.startsWith('<?xml') || head.includes('<!DOCTYPE plist') || head.includes('<plist');

        if (isPlist) {
          try {
            const imported = parseTpsPlist(raw);
            const s = useTpStore.getState();
            if (Object.keys(imported.settings).length > 0) s.setSettings(imported.settings);
            if (imported.exportFormat) s.setExportFormat(imported.exportFormat);
            if (imported.fileName) s.setFileName(imported.fileName);
            for (const w of imported.warnings) console.warn(`[tps] ${w}`);
            const refCount = imported.referencedFiles.length;
            const baseMsg = t.tps.importedDesktop;
            const refMsg =
              refCount > 0
                ? ' ' + t.tps.referencedFilesWarning.replace('{n}', String(refCount))
                : '';
            s.showNotification(`${baseMsg}${refMsg}`);
          } catch {
            useTpStore.getState().showNotification(t.project.loadError);
          }
          return;
        }

        try {
          const parsed = parseProject(raw);
          const projectData = parsed.project;
          // Decode the whole embedded image set before touching live state.
          // A corrupt project must never replace the current workspace with a
          // silently partial sprite list.
          const loaded = await decodeProjectSprites(projectData.sprites);
          const projectFailures: ImageLoadFailure[] = [];
          const projectNames = new Set<string>();
          for (const image of loaded) {
            const failure = validateDecodedImage(image.name, image.width, image.height, projectNames);
            if (failure) projectFailures.push(failure);
            projectNames.add(image.name);
          }
          if (projectFailures.length > 0) {
            throw new Error(formatImageLoadFailures(projectFailures));
          }
          // Directory handles and watchers are browser capabilities, not
          // serializable project data. Dispose the previous project's live
          // watchers and clear its publish handle only after the new project
          // has parsed and decoded successfully.
          smartFolderManagerRef.current?.dispose();
          smartFolderManagerRef.current = null;
          const s = useTpStore.getState();
          s.clearImages();
          s.setDirHandle(null);
          s.setSettings(projectData.settings);
          s.setExportFormat(projectData.exportFormat);
          s.setFileName(projectData.fileName);
          s.setSelectedDirPath(projectData.selectedDirPath);
          s.setPublishOptions(projectData.publishOptions);
          useTpStore.setState({
            zoom: projectData.view.zoom,
            pan: projectData.view.pan,
            showBorders: projectData.view.showBorders,
            showSpriteNames: projectData.view.showSpriteNames,
            bgMode: projectData.view.bgMode,
            bgColor: projectData.view.bgColor,
            inspectorSections: projectData.view.inspectorSections,
            leftPanelWidth: projectData.view.leftPanelWidth,
            rightPanelWidth: projectData.view.rightPanelWidth,
            sortMode: projectData.view.sortMode,
            collapsedFolders: projectData.view.collapsedFolders,
            activeSheet: projectData.view.activeSheet,
            smartFolders: projectData.smartFolders.map((folder) => ({
              id: folder.id,
              name: folder.name,
              trackedIds: loaded
                .filter((image) => folder.trackedSpriteNames.includes(image.name))
                .map((image) => image.id),
              lastSync: folder.lastSync,
              requiresAuthorization: true,
              trackedSpriteNames: [...folder.trackedSpriteNames],
            })),
          });
          s.addImages(loaded);
          let restoredSmartFolderCount = 0;
          if (isFileSystemAccessSupported()) {
            for (const descriptor of projectData.smartFolders) {
              const savedHandle = await restoreDirectoryHandle(descriptor.id);
              if (!savedHandle) continue;
              const permission = await getDirectoryPermission(savedHandle, false);
              if (permission === 'granted' || permission === 'unsupported') {
                await watchDirectoryHandle(savedHandle, descriptor.id, false);
                restoredSmartFolderCount += 1;
              }
            }
          }
          useAnimationStore.getState().setGroups(projectData.animations);
          const warnings = [...parsed.warnings];
          const authorizationCount = projectData.smartFolders.length - restoredSmartFolderCount;
          if (authorizationCount > 0) {
            warnings.push(t.smartFolder.reopenAuthorization.replace('{n}', String(authorizationCount)));
          }
          s.showNotification(
            warnings.length > 0 ? `${t.project.loaded} ${warnings.join(' ')}` : t.project.loaded,
            6000,
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : t.project.loadError;
          useTpStore.getState().showNotification(`${t.project.loadError}: ${reason}`, 6000);
        }
      };
      reader.readAsText(file);
    },
    [t.project.loaded, t.project.loadError, t.smartFolder.reopenAuthorization, t.tps.importedDesktop, t.tps.referencedFilesWarning, watchDirectoryHandle],
  );

  const handleNewProject = useCallback(() => {
    const s = useTpStore.getState();
    s.clearImages();
    useAnimationStore.getState().reset();
    s.setFileName('spritesheet');
    s.showNotification('New project');
  }, []);

  // Global drop handler — accept files dropped on the whole window
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
      }
    };
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      const items = e.dataTransfer.items;
      const files: File[] = [];
      if (items && items.length > 0) {
        const entries: FileSystemEntryLike[] = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const ent =
            'webkitGetAsEntry' in it
              ? (it as DataTransferItem & { webkitGetAsEntry: () => FileSystemEntryLike | null }).webkitGetAsEntry()
              : null;
          if (ent) entries.push(ent);
          else {
            const f = it.getAsFile();
            if (f) files.push(f);
          }
        }
        for (const ent of entries) {
          const found = await collectFilesFromEntry(ent);
          files.push(...found);
        }
      } else if (e.dataTransfer.files) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          files.push(e.dataTransfer.files[i]);
        }
      }
      const tpsFile = files.find((f) => f.name.toLowerCase().endsWith('.tps'));
      if (tpsFile) {
        const fake = { target: { files: [tpsFile], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleProjectFileSelected(fake);
        return;
      }
      await loadFiles(files);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleProjectFileSelected, loadFiles]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSaveProject();
      } else if (meta && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenProject();
      } else if (meta && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewProject();
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePublish();
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        setCutterOpen(true);
      } else if (meta && e.key === '=') {
        e.preventDefault();
        useTpStore.getState().zoomIn();
      } else if (meta && e.key === '-') {
        e.preventDefault();
        useTpStore.getState().zoomOut();
      } else if (meta && e.key === '0') {
        e.preventDefault();
        useTpStore.getState().resetView();
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'z') {
        // Cmd+Shift+Z is the macOS redo convention; keep it before the plain
        // Ctrl+Z branch so the shift modifier is not swallowed.
        e.preventDefault();
        useTpStore.getState().redo();
      } else if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        useTpStore.getState().undo();
      } else if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useTpStore.getState().redo();
      } else if (!meta && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSaveProject, handleOpenProject, handleNewProject, handlePublish]);

  const handleUndo = useCallback(() => useTpStore.getState().undo(), []);
  const handleRedo = useCallback(() => useTpStore.getState().redo(), []);

  const handlerProps = {
    locale,
    onNewProject: handleNewProject,
    onOpenProject: handleOpenProject,
    onSaveProject: handleSaveProject,
    onSaveProjectAs: handleSaveProject,
    onAddSprites: handleAddSprites,
    onAddFolder: handleAddFolder,
    onWatchFolder: handleWatchFolder,
    onOpenCutter: () => setCutterOpen(true),
    onPublish: handlePublish,
    onOpenBatchConvert: handleBatchConvert,
    onShowShortcuts: () => setShortcutsOpen(true),
    onUndo: handleUndo,
    onRedo: handleRedo,
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--tp-bg)] text-[var(--tp-text)] overflow-hidden">
      <MenuBar {...handlerProps} />
      <Toolbar {...handlerProps} />

      <div className="flex-1 flex min-h-0">
        <aside
          style={{ width: leftWidth }}
          className="flex-shrink-0 flex flex-col bg-[var(--tp-panel)] border-r border-[var(--tp-border)] min-h-0"
        >
          <SpritesPanel locale={locale} />
        </aside>

        <div
          className={`tp-splitter${dragSide === 'left' ? ' is-dragging' : ''}`}
          onMouseDown={startDrag('left')}
          role="separator"
          aria-orientation="vertical"
        />

        <main className="flex-1 flex flex-col min-w-0 bg-[var(--tp-bg)]">
          <div className="flex-1 min-h-0">
            <CanvasViewport locale={locale} />
          </div>
          <AnimationPanel locale={locale} />
        </main>

        <div
          className={`tp-splitter${dragSide === 'right' ? ' is-dragging' : ''}`}
          onMouseDown={startDrag('right')}
          role="separator"
          aria-orientation="vertical"
        />

        <aside
          style={{ width: rightWidth }}
          className="flex-shrink-0 flex flex-col bg-[var(--tp-panel)] border-l border-[var(--tp-border)] min-h-0"
        >
          <Inspector locale={locale} />
        </aside>
      </div>

      <StatusBar locale={locale} />

      <input
        ref={addSpritesInputRef}
        data-testid="sprite-file-input"
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={onAddSpritesChange}
      />
      <input
        ref={addFolderInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={onAddFolderChange}
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      <input
        ref={openProjectInputRef}
        type="file"
        accept=".wtp.json,.tps,application/json"
        className="hidden"
        onChange={handleProjectFileSelected}
      />

      <PublishDialog
        locale={locale}
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
      />

      <ShortcutsDialog
        locale={locale}
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <CutterDialog
        locale={locale}
        isOpen={cutterOpen}
        onClose={() => setCutterOpen(false)}
      />
    </div>
  );
}
