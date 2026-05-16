'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ChangeEvent as ReactChangeEvent,
} from 'react';
import { getTranslations, type Locale } from '@/lib/i18n';
import {
  loadImageFromFile,
  useTpStore,
  type ImageItem,
} from '@/lib/store';
import {
  buildSpriteTree,
  descendantIdsOf,
  flattenTree,
  type FolderNode,
  type SpriteNode,
  type TreeNode,
} from '@/lib/spriteTree';

interface SpritesPanelProps {
  locale: Locale;
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (file: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      cb: (entries: FileSystemEntryLike[]) => void,
      err?: (e: unknown) => void,
    ) => void;
  };
}

type DragOverTarget =
  | { kind: 'sprite-before'; id: string }
  | { kind: 'sprite-after'; id: string }
  | { kind: 'folder'; id: string }
  | { kind: 'root-end' }
  | null;

type SpriteContextMenu = {
  kind: 'sprite';
  id: string;
  x: number;
  y: number;
};

type FolderContextMenu = {
  kind: 'folder';
  path: string;
  x: number;
  y: number;
};

type ContextMenuState = SpriteContextMenu | FolderContextMenu | null;

const TP_DRAG_MIME = 'application/x-tp-sprites';

async function collectFilesFromEntry(
  entry: FileSystemEntryLike,
): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise<File[]>((resolve) => {
      entry.file!(
        (file) => {
          const path = entry.name;
          if (!('webkitRelativePath' in file) || !file.webkitRelativePath) {
            try {
              Object.defineProperty(file, 'webkitRelativePath', {
                value: path,
                configurable: true,
              });
            } catch {
              // ignore
            }
          }
          resolve([file]);
        },
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: File[] = [];
    const readBatch = (): Promise<FileSystemEntryLike[]> =>
      new Promise((resolve) => {
        reader.readEntries(
          (entries) => resolve(entries),
          () => resolve([]),
        );
      });
    let batch = await readBatch();
    while (batch.length > 0) {
      const nestedLists = await Promise.all(
        batch.map((sub) => collectFilesFromEntryWithPath(sub, entry.name)),
      );
      for (const list of nestedLists) all.push(...list);
      batch = await readBatch();
    }
    return all;
  }
  return [];
}

async function collectFilesFromEntryWithPath(
  entry: FileSystemEntryLike,
  parentPath: string,
): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise<File[]>((resolve) => {
      entry.file!(
        (file) => {
          const fullPath = `${parentPath}/${entry.name}`;
          try {
            Object.defineProperty(file, 'webkitRelativePath', {
              value: fullPath,
              configurable: true,
            });
          } catch {
            // ignore
          }
          resolve([file]);
        },
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: File[] = [];
    const readBatch = (): Promise<FileSystemEntryLike[]> =>
      new Promise((resolve) => {
        reader.readEntries(
          (entries) => resolve(entries),
          () => resolve([]),
        );
      });
    let batch = await readBatch();
    while (batch.length > 0) {
      const nestedLists = await Promise.all(
        batch.map((sub) =>
          collectFilesFromEntryWithPath(sub, `${parentPath}/${entry.name}`),
        ),
      );
      for (const list of nestedLists) all.push(...list);
      batch = await readBatch();
    }
    return all;
  }
  return [];
}

function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
}

function formatPixels(images: ImageItem[]): string {
  const total = images.reduce((sum, i) => sum + i.width * i.height, 0);
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)} MP`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)} KP`;
  return `${total} P`;
}

function isFolderDescendantOf(target: string, ancestor: string): boolean {
  if (!ancestor) return target !== '';
  if (target === ancestor) return true;
  return target.startsWith(`${ancestor}/`);
}

function ancestorPathsOf(folderPath: string): string[] {
  if (!folderPath) return [];
  const parts = folderPath.split('/');
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
}

export default function SpritesPanel({ locale }: SpritesPanelProps) {
  const t = getTranslations(locale);
  const images = useTpStore((s) => s.images);
  const selectedIds = useTpStore((s) => s.selectedIds);
  const sortMode = useTpStore((s) => s.sortMode);
  const collapsedFolders = useTpStore((s) => s.collapsedFolders);
  const renamingId = useTpStore((s) => s.renamingId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const anchorIdRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sortBtnRef = useRef<HTMLButtonElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [isFileDragging, setIsFileDragging] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState<DragOverTarget>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const collapsedSet = useMemo(() => new Set(collapsedFolders), [collapsedFolders]);

  const tree = useMemo(() => buildSpriteTree(images, sortMode), [images, sortMode]);
  const flat = useMemo(() => flattenTree(tree, collapsedSet), [tree, collapsedSet]);
  const visibleSpriteIds = useMemo(
    () => flat.filter((n): n is SpriteNode => n.kind === 'sprite').map((n) => n.id),
    [flat],
  );

  const ingestFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) return;
    const loaded = await Promise.all(
      imageFiles.map((f) => loadImageFromFile(f).catch(() => null)),
    );
    const ok = loaded.filter((x): x is ImageItem => x !== null);
    if (ok.length === 0) return;
    useTpStore.getState().addImages(ok);
    useTpStore.getState().showNotification(`Loaded ${ok.length} sprites`);
  }, []);

  const onPickFiles = useCallback(
    async (e: ReactChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list) return;
      const files = Array.from(list);
      e.target.value = '';
      await ingestFiles(files);
    },
    [ingestFiles],
  );

  const hasFiles = (e: ReactDragEvent<HTMLDivElement>): boolean => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true;
    return false;
  };

  const hasInternalDrag = (e: ReactDragEvent<HTMLDivElement>): boolean => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) if (types[i] === TP_DRAG_MIME) return true;
    return false;
  };

  const onAreaDragEnter = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (hasInternalDrag(e)) return;
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsFileDragging(true);
  }, []);

  const onAreaDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (hasInternalDrag(e)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      return;
    }
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onAreaDragLeave = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (hasInternalDrag(e)) return;
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsFileDragging(false);
  }, []);

  const onAreaDrop = useCallback(
    async (e: ReactDragEvent<HTMLDivElement>) => {
      if (hasInternalDrag(e)) {
        return;
      }
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsFileDragging(false);

      const dt = e.dataTransfer;
      if (!dt) return;

      const files: File[] = [];
      const items = dt.items;
      if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
        const entries: FileSystemEntryLike[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) entries.push(entry as unknown as FileSystemEntryLike);
        }
        const lists = await Promise.all(entries.map((en) => collectFilesFromEntry(en)));
        for (const list of lists) files.push(...list);
      } else if (dt.files) {
        for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
      }
      await ingestFiles(files);
    },
    [ingestFiles],
  );

  const onSpriteRowClick = useCallback(
    (e: ReactMouseEvent<HTMLElement>, id: string) => {
      const state = useTpStore.getState();
      if (state.renamingId === id) return;
      if (e.shiftKey && anchorIdRef.current) {
        const a = visibleSpriteIds.indexOf(anchorIdRef.current);
        const b = visibleSpriteIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [start, end] = a < b ? [a, b] : [b, a];
          state.selectImages(visibleSpriteIds.slice(start, end + 1));
          return;
        }
      }
      if (e.metaKey || e.ctrlKey) {
        state.toggleSelectImage(id, true);
        anchorIdRef.current = id;
        return;
      }
      state.selectImages([id]);
      anchorIdRef.current = id;
    },
    [visibleSpriteIds],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (renamingId) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        useTpStore.getState().removeImages(selectedIds);
      } else if (e.key === 'Enter' && selectedIds.length === 1) {
        e.preventDefault();
        useTpStore.getState().startRename(selectedIds[0]);
      } else if (e.key === 'Escape') {
        useTpStore.getState().selectImages([]);
      }
    },
    [selectedIds, renamingId],
  );

  // Auto-scroll & expand ancestors when exactly one is selected.
  useEffect(() => {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    const img = images.find((i) => i.id === id);
    if (!img) return;
    const idx = img.name.lastIndexOf('/');
    const parent = idx >= 0 ? img.name.slice(0, idx) : '';
    for (const p of ancestorPathsOf(parent)) {
      useTpStore.getState().setFolderCollapsed(p, false);
    }
    requestAnimationFrame(() => {
      const el = rowRefs.current.get(id);
      if (el) el.scrollIntoView({ block: 'nearest' });
    });
  }, [selectedIds, images]);

  // Initialise rename draft when entering rename mode.
  useEffect(() => {
    if (!renamingId) return;
    const img = images.find((i) => i.id === renamingId);
    if (!img) return;
    const idx = img.name.lastIndexOf('/');
    setRenameDraft(idx >= 0 ? img.name.slice(idx + 1) : img.name);
  }, [renamingId, images]);

  // Close context menu / sort menu on global mousedown or Escape.
  useEffect(() => {
    if (!contextMenu && !sortMenuOpen) return;
    const onDown = () => {
      setContextMenu(null);
      setSortMenuOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setContextMenu(null);
        setSortMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu, sortMenuOpen]);

  const commitRename = useCallback(
    (id: string, raw: string) => {
      const trimmed = raw.trim();
      const state = useTpStore.getState();
      if (!trimmed) {
        state.startRename(null);
        return;
      }
      if (trimmed.includes('/')) {
        state.showNotification('Slashes are not allowed in rename — use drag to move');
        state.startRename(null);
        return;
      }
      const img = state.images.find((i) => i.id === id);
      if (!img) {
        state.startRename(null);
        return;
      }
      const idx = img.name.lastIndexOf('/');
      const folder = idx >= 0 ? img.name.slice(0, idx + 1) : '';
      state.renameImage(id, `${folder}${trimmed}`);
    },
    [],
  );

  const cancelRename = useCallback(() => {
    useTpStore.getState().startRename(null);
  }, []);

  const getDraggedIds = useCallback(
    (id: string): string[] => {
      const state = useTpStore.getState();
      if (selectedSet.has(id) && selectedIds.length > 1) return selectedIds;
      return [id];
    },
    [selectedIds, selectedSet],
  );

  const onSpriteDragStart = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, id: string) => {
      e.stopPropagation();
      const state = useTpStore.getState();
      let ids: string[];
      if (selectedSet.has(id) && selectedIds.length > 1) {
        ids = selectedIds;
      } else {
        state.selectImages([id]);
        anchorIdRef.current = id;
        ids = [id];
      }
      if (e.dataTransfer) {
        e.dataTransfer.setData(TP_DRAG_MIME, JSON.stringify({ kind: 'sprites', ids }));
        e.dataTransfer.effectAllowed = 'move';
        const ghost = document.createElement('div');
        ghost.style.position = 'fixed';
        ghost.style.top = '-1000px';
        ghost.style.left = '-1000px';
        ghost.style.padding = '4px 8px';
        ghost.style.background = 'var(--tp-bg-elev)';
        ghost.style.border = '1px solid var(--tp-border-strong)';
        ghost.style.color = 'var(--tp-text)';
        ghost.style.font = '12px sans-serif';
        ghost.style.borderRadius = '4px';
        ghost.textContent = `${ids.length} sprite${ids.length === 1 ? '' : 's'}`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => ghost.remove(), 0);
      }
    },
    [selectedIds, selectedSet],
  );

  const onFolderDragStart = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, folder: FolderNode) => {
      e.stopPropagation();
      const ids = descendantIdsOf(tree, folder.path);
      if (e.dataTransfer) {
        e.dataTransfer.setData(
          TP_DRAG_MIME,
          JSON.stringify({ kind: 'folder', path: folder.path, ids }),
        );
        e.dataTransfer.effectAllowed = 'move';
        const ghost = document.createElement('div');
        ghost.style.position = 'fixed';
        ghost.style.top = '-1000px';
        ghost.style.left = '-1000px';
        ghost.style.padding = '4px 8px';
        ghost.style.background = 'var(--tp-bg-elev)';
        ghost.style.border = '1px solid var(--tp-border-strong)';
        ghost.style.color = 'var(--tp-text)';
        ghost.style.font = '12px sans-serif';
        ghost.style.borderRadius = '4px';
        ghost.textContent = `${folder.baseName || 'folder'} (${ids.length})`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => ghost.remove(), 0);
      }
    },
    [tree],
  );

  const parseDragData = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): { kind: 'sprites' | 'folder'; ids: string[]; path?: string } | null => {
      const raw = e.dataTransfer?.getData(TP_DRAG_MIME);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { kind: 'sprites' | 'folder'; ids: string[]; path?: string };
        if (!parsed || !Array.isArray(parsed.ids)) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    [],
  );

  const updateDragOver = useCallback((next: DragOverTarget) => {
    setDragOverTarget((prev) => {
      if (prev === next) return prev;
      if (prev && next && prev.kind === next.kind) {
        const a = 'id' in prev ? prev.id : undefined;
        const b = 'id' in next ? next.id : undefined;
        if (a === b) return prev;
      }
      return next;
    });
  }, []);

  const onSpriteRowDragOver = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, id: string) => {
      if (!hasInternalDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const isTopHalf = e.clientY - rect.top < rect.height / 2;
      updateDragOver({ kind: isTopHalf ? 'sprite-before' : 'sprite-after', id });
    },
    [updateDragOver],
  );

  const onFolderRowDragOver = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, folder: FolderNode) => {
      if (!hasInternalDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      updateDragOver({ kind: 'folder', id: folder.path });
    },
    [updateDragOver],
  );

  const onRootEndDragOver = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      if (!hasInternalDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      updateDragOver({ kind: 'root-end' });
    },
    [updateDragOver],
  );

  const clearDragOver = useCallback(() => {
    setDragOverTarget(null);
  }, []);

  const performInternalDrop = useCallback(
    (
      e: ReactDragEvent<HTMLDivElement>,
      target: DragOverTarget,
    ) => {
      const data = parseDragData(e);
      if (!data || data.ids.length === 0) return;
      const state = useTpStore.getState();
      const draggedFolderPath = data.kind === 'folder' ? data.path ?? '' : undefined;

      const targetFolderPath = ((): string | null => {
        if (!target) return null;
        if (target.kind === 'folder') return target.id;
        if (target.kind === 'root-end') return '';
        if (target.kind === 'sprite-before' || target.kind === 'sprite-after') {
          const img = state.images.find((i) => i.id === target.id);
          if (!img) return null;
          const idx = img.name.lastIndexOf('/');
          return idx >= 0 ? img.name.slice(0, idx) : '';
        }
        return null;
      })();

      if (targetFolderPath === null) return;

      if (draggedFolderPath !== undefined) {
        if (isFolderDescendantOf(targetFolderPath, draggedFolderPath)) {
          state.showNotification('Cannot move folder into itself');
          return;
        }
      }

      if (target?.kind === 'folder') {
        state.reorderImagesInto(data.ids, targetFolderPath, null);
        return;
      }
      if (target?.kind === 'root-end') {
        state.reorderImagesInto(data.ids, '', null);
        return;
      }
      if (target?.kind === 'sprite-before') {
        state.reorderImagesInto(data.ids, targetFolderPath, target.id);
        return;
      }
      if (target?.kind === 'sprite-after') {
        const list = state.images;
        const idx = list.findIndex((i) => i.id === target.id);
        let beforeId: string | null = null;
        for (let i = idx + 1; i < list.length; i++) {
          if (!data.ids.includes(list[i].id)) {
            beforeId = list[i].id;
            break;
          }
        }
        state.reorderImagesInto(data.ids, targetFolderPath, beforeId);
        return;
      }
    },
    [parseDragData],
  );

  const onSpriteRowDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, id: string) => {
      if (!hasInternalDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const isTopHalf = e.clientY - rect.top < rect.height / 2;
      performInternalDrop(e, { kind: isTopHalf ? 'sprite-before' : 'sprite-after', id });
      clearDragOver();
    },
    [performInternalDrop, clearDragOver],
  );

  const onFolderRowDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, folder: FolderNode) => {
      if (!hasInternalDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      performInternalDrop(e, { kind: 'folder', id: folder.path });
      clearDragOver();
    },
    [performInternalDrop, clearDragOver],
  );

  const onRootEndDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      if (!hasInternalDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      performInternalDrop(e, { kind: 'root-end' });
      clearDragOver();
    },
    [performInternalDrop, clearDragOver],
  );

  const onAnyDragEnd = useCallback(() => {
    clearDragOver();
  }, [clearDragOver]);

  const onSpriteContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const state = useTpStore.getState();
      if (!state.selectedIds.includes(id)) {
        state.selectImages([id]);
        anchorIdRef.current = id;
      }
      setContextMenu({ kind: 'sprite', id, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const onFolderContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, folder: FolderNode) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ kind: 'folder', path: folder.path, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const closeMenus = useCallback(() => {
    setContextMenu(null);
    setSortMenuOpen(false);
  }, []);

  // Folder context menu actions.
  const folderSelectAll = (path: string) => {
    const ids = descendantIdsOf(tree, path);
    useTpStore.getState().selectImages(ids);
  };

  const folderCollapseSubtree = (path: string) => {
    const all = tree.allFolderPaths.filter((p) => isFolderDescendantOf(p, path));
    const state = useTpStore.getState();
    const merged = Array.from(new Set([...state.collapsedFolders, ...all]));
    state.collapseAllFolders(merged);
  };

  const folderRemove = (path: string) => {
    const ids = descendantIdsOf(tree, path);
    if (ids.length === 0) return;
    const ok = window.confirm(t.inspector.confirmRemoveN.replace('{n}', String(ids.length)));
    if (!ok) return;
    useTpStore.getState().removeImages(ids);
  };

  const totalPixelsLabel = useMemo(() => formatPixels(images), [images]);
  const hasSelection = selectedIds.length > 0;
  const hasImages = images.length > 0;
  const selectedCountText = t.panels.selectedCount.replace('{n}', String(selectedIds.length));

  const sortOptions: { mode: typeof sortMode; label: string }[] = [
    { mode: 'manual', label: 'Manual' },
    { mode: 'name-asc', label: 'Name ↑' },
    { mode: 'name-desc', label: 'Name ↓' },
    { mode: 'size-desc', label: 'Size ↓' },
    { mode: 'size-asc', label: 'Size ↑' },
  ];

  const renderSpriteRow = (node: SpriteNode) => {
    const selected = selectedSet.has(node.id);
    const isRenaming = renamingId === node.id;
    const indent = 8 + node.depth * 16;
    const showBefore = dragOverTarget?.kind === 'sprite-before' && dragOverTarget.id === node.id;
    const showAfter = dragOverTarget?.kind === 'sprite-after' && dragOverTarget.id === node.id;
    return (
      <div
        key={node.id}
        ref={(el) => {
          if (el) rowRefs.current.set(node.id, el);
          else rowRefs.current.delete(node.id);
        }}
        draggable={!isRenaming}
        onDragStart={(e) => onSpriteDragStart(e, node.id)}
        onDragOver={(e) => onSpriteRowDragOver(e, node.id)}
        onDragLeave={() => {
          if (
            dragOverTarget &&
            (dragOverTarget.kind === 'sprite-before' || dragOverTarget.kind === 'sprite-after') &&
            dragOverTarget.id === node.id
          ) {
            clearDragOver();
          }
        }}
        onDrop={(e) => onSpriteRowDrop(e, node.id)}
        onDragEnd={onAnyDragEnd}
        onClick={(e) => onSpriteRowClick(e, node.id)}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isRenaming) useTpStore.getState().startRename(node.id);
        }}
        onContextMenu={(e) => onSpriteContextMenu(e, node.id)}
        className={`group relative flex h-11 cursor-pointer items-center gap-2 pr-2 hover:bg-[var(--tp-panel-2)] ${
          selected ? 'bg-[var(--tp-accent-soft)]' : ''
        }`}
        style={{ paddingLeft: indent }}
      >
        {selected && (
          <span className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-[var(--tp-accent)]" />
        )}
        {showBefore && (
          <span className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] bg-[var(--tp-accent)]" />
        )}
        {showAfter && (
          <span className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--tp-accent)]" />
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-[var(--tp-border)] bg-[var(--tp-bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={node.image.url} alt={node.image.name} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              autoFocus
              value={renameDraft}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename(node.id, renameDraft);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={() => commitRename(node.id, renameDraft)}
              className="w-full rounded-sm border border-[var(--tp-accent)] bg-[var(--tp-bg)] px-1 py-0.5 text-xs text-[var(--tp-text)] outline-none"
            />
          ) : (
            <div className="truncate text-xs text-[var(--tp-text)]">{node.baseName}</div>
          )}
          <div className="text-[10px] text-[var(--tp-text-dim)]">
            {node.image.width} × {node.image.height}
          </div>
        </div>
        {!isRenaming && (
          <div
            className={`flex shrink-0 items-center gap-1 ${
              selected ? '' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <button
              type="button"
              aria-label={t.inspector.actionRename}
              title={t.inspector.actionRename}
              onClick={(e) => {
                e.stopPropagation();
                useTpStore.getState().startRename(node.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex h-4 w-4 items-center justify-center rounded text-[var(--tp-text-muted)] hover:text-[var(--tp-text)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={t.imageList.remove}
              title={t.imageList.remove}
              onClick={(e) => {
                e.stopPropagation();
                useTpStore.getState().removeImages([node.id]);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex h-4 w-4 items-center justify-center rounded text-[var(--tp-text-muted)] hover:text-[var(--tp-danger)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderFolderRow = (node: FolderNode) => {
    const isCollapsed = collapsedSet.has(node.path);
    const indent = 8 + node.depth * 16;
    const isDropTarget = dragOverTarget?.kind === 'folder' && dragOverTarget.id === node.path;
    return (
      <div
        key={`folder:${node.path}`}
        draggable
        onDragStart={(e) => onFolderDragStart(e, node)}
        onDragOver={(e) => onFolderRowDragOver(e, node)}
        onDragLeave={() => {
          if (dragOverTarget?.kind === 'folder' && dragOverTarget.id === node.path) {
            clearDragOver();
          }
        }}
        onDrop={(e) => onFolderRowDrop(e, node)}
        onDragEnd={onAnyDragEnd}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-folder-menu]')) return;
          useTpStore.getState().toggleFolder(node.path);
        }}
        onContextMenu={(e) => onFolderContextMenu(e, node)}
        onMouseEnter={() => setHoveredFolder(node.path)}
        onMouseLeave={() => setHoveredFolder((p) => (p === node.path ? null : p))}
        className={`group flex h-7 cursor-pointer items-center gap-1 pr-2 hover:bg-[var(--tp-panel-2)] ${
          isDropTarget ? 'bg-[var(--tp-accent-soft)] outline outline-1 outline-[var(--tp-accent)]' : ''
        }`}
        style={{ paddingLeft: indent }}
      >
        <span
          className="flex h-3 w-3 shrink-0 items-center justify-center text-[var(--tp-text-muted)]"
          style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 80ms' }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M2 1l4 3-4 3z" />
          </svg>
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-[var(--tp-text-muted)]"
        >
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
          {node.baseName}
        </span>
        <span className="ml-auto rounded bg-[var(--tp-bg-elev)] px-1.5 text-[10px] leading-4 text-[var(--tp-text-muted)]">
          {node.totalCount}
        </span>
        <button
          type="button"
          data-folder-menu
          onClick={(e) => {
            e.stopPropagation();
            setContextMenu({ kind: 'folder', path: node.path, x: e.clientX, y: e.clientY });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`flex h-4 w-4 items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-elev)] hover:text-[var(--tp-text)] ${
            hoveredFolder === node.path ? '' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Folder menu"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </button>
      </div>
    );
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const items: { label: string; onClick: () => void; danger?: boolean; separator?: boolean }[] = [];
    if (contextMenu.kind === 'sprite') {
      items.push({
        label: `${t.inspector.actionRename} (Enter)`,
        onClick: () => useTpStore.getState().startRename(contextMenu.id),
      });
      items.push({
        label: `${t.inspector.actionRemove} (Del)`,
        danger: true,
        onClick: () => {
          const state = useTpStore.getState();
          const ids = state.selectedIds.includes(contextMenu.id) ? state.selectedIds : [contextMenu.id];
          state.removeImages(ids);
        },
      });
      items.push({ label: '', onClick: () => {}, separator: true });
      items.push({
        label: 'Reveal selection',
        onClick: () => {
          const el = rowRefs.current.get(contextMenu.id);
          if (el) el.scrollIntoView({ block: 'nearest' });
        },
      });
    } else {
      items.push({
        label: 'Select All in Folder',
        onClick: () => folderSelectAll(contextMenu.path),
      });
      items.push({
        label: 'Collapse Subfolders',
        onClick: () => folderCollapseSubtree(contextMenu.path),
      });
      items.push({ label: '', onClick: () => {}, separator: true });
      items.push({
        label: 'Remove Folder',
        danger: true,
        onClick: () => folderRemove(contextMenu.path),
      });
    }
    return (
      <div
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-50 min-w-[160px] rounded border border-[var(--tp-border-strong)] bg-[var(--tp-bg-elev)] py-1 text-xs text-[var(--tp-text)] shadow-lg"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        {items.map((it, i) =>
          it.separator ? (
            <div key={`sep-${i}`} className="my-1 h-px bg-[var(--tp-border)]" />
          ) : (
            <button
              key={`item-${i}`}
              type="button"
              onClick={() => {
                it.onClick();
                closeMenus();
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--tp-accent-soft)] ${
                it.danger ? 'text-[var(--tp-danger)]' : ''
              }`}
            >
              {it.label}
            </button>
          ),
        )}
      </div>
    );
  };

  return (
    <div
      className="flex h-full flex-col bg-[var(--tp-panel)] text-[var(--tp-text)] outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="flex h-8 items-center justify-between border-b border-[var(--tp-border)] px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--tp-text-muted)]">
            {t.panels.sprites}
          </span>
          <span className="rounded-sm bg-[var(--tp-bg-elev)] px-1.5 py-0.5 text-[10px] text-[var(--tp-text-muted)]">
            {images.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={t.toolbar.tooltipAddSprites}
            aria-label={t.toolbar.addSprites}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
              <path d="M12 12v6" />
              <path d="M9 15h6" />
            </svg>
          </button>
          <button
            type="button"
            title={t.toolbar.tooltipAddFolder}
            aria-label={t.toolbar.addFolder}
            onClick={() => folderInputRef.current?.click()}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M12 11v6" />
              <path d="M9 14h6" />
            </svg>
          </button>
          <button
            type="button"
            title="Expand all"
            aria-label="Expand all folders"
            onClick={() => useTpStore.getState().expandAllFolders()}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            title="Collapse all"
            aria-label="Collapse all folders"
            onClick={() => useTpStore.getState().collapseAllFolders(tree.allFolderPaths)}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <div className="relative">
            <button
              ref={sortBtnRef}
              type="button"
              title="Sort"
              aria-label="Sort sprites"
              onClick={(e) => {
                e.stopPropagation();
                setContextMenu(null);
                setSortMenuOpen((v) => !v);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--tp-panel-2)] ${
                sortMode !== 'manual'
                  ? 'text-[var(--tp-accent)]'
                  : 'text-[var(--tp-text-muted)] hover:text-[var(--tp-text)]'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h13" />
                <path d="M3 12h9" />
                <path d="M3 18h5" />
                <path d="M17 9l3-3 3 3" />
                <path d="M20 6v12" />
              </svg>
            </button>
            {sortMenuOpen && (
              <div
                role="menu"
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute right-0 top-6 z-40 w-32 rounded border border-[var(--tp-border-strong)] bg-[var(--tp-bg-elev)] py-1 text-xs shadow-lg"
              >
                {sortOptions.map((opt) => {
                  const active = sortMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => {
                        useTpStore.getState().setSortMode(opt.mode);
                        setSortMenuOpen(false);
                      }}
                      className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--tp-accent-soft)] ${
                        active ? 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent)]' : 'text-[var(--tp-text)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            title={t.menu.removeSelected}
            aria-label={t.menu.removeSelected}
            disabled={!hasSelection}
            onClick={() => useTpStore.getState().removeImages(selectedIds)}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-danger)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--tp-text-muted)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      </div>

      {hasSelection && (
        <div className="flex h-7 items-center justify-between bg-[var(--tp-accent-soft)] px-2 text-xs text-[var(--tp-text)]">
          <span>{selectedCountText}</span>
          <button
            type="button"
            onClick={() => useTpStore.getState().selectImages([])}
            className="text-[11px] text-[var(--tp-text-muted)] hover:text-[var(--tp-text)]"
          >
            {t.menu.clearSelection}
          </button>
        </div>
      )}

      <div
        ref={scrollAreaRef}
        className={`flex-1 overflow-auto ${
          isFileDragging
            ? 'border-2 border-dashed border-[var(--tp-accent)] bg-[var(--tp-accent-soft)]'
            : ''
        }`}
        onDragEnter={onAreaDragEnter}
        onDragOver={onAreaDragOver}
        onDragLeave={onAreaDragLeave}
        onDrop={onAreaDrop}
      >
        {!hasImages ? (
          <div className="flex h-full items-center justify-center px-4 py-12 text-center text-xs text-[var(--tp-text-muted)]">
            {t.panels.noSpritesHint}
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="flex flex-col">
              {flat.map((node) =>
                node.kind === 'folder' ? renderFolderRow(node) : renderSpriteRow(node),
              )}
            </div>
            <div
              onDragOver={onRootEndDragOver}
              onDrop={onRootEndDrop}
              onDragLeave={() => {
                if (dragOverTarget?.kind === 'root-end') clearDragOver();
              }}
              className={`min-h-[24px] flex-1 ${
                dragOverTarget?.kind === 'root-end' ? 'bg-[var(--tp-accent-soft)]' : ''
              }`}
            />
          </div>
        )}
      </div>

      <div className="flex h-7 items-center justify-between border-t border-[var(--tp-border)] px-2 text-[10px] text-[var(--tp-text-muted)]">
        <span>
          {images.length} {t.status.sprites} · {totalPixelsLabel}
        </span>
        <button
          type="button"
          disabled={!hasImages}
          onClick={() => useTpStore.getState().clearImages()}
          className="text-[10px] hover:text-[var(--tp-danger)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--tp-text-muted)]"
        >
          {t.actions.clear}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={onPickFiles}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={onPickFiles}
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
      />

      {renderContextMenu()}
    </div>
  );
}
