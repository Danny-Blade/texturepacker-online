'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { getTranslations, type Locale } from '@/lib/i18n';
import {
  loadImageFromFile,
  useTpStore,
  type ImageItem,
} from '@/lib/store';

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

function splitName(name: string): { prefix: string; base: string } {
  const idx = name.lastIndexOf('/');
  if (idx < 0) return { prefix: '', base: name };
  return { prefix: name.slice(0, idx + 1), base: name.slice(idx + 1) };
}

function formatPixels(images: ImageItem[]): string {
  const total = images.reduce((sum, i) => sum + i.width * i.height, 0);
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)} MP`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)} KP`;
  return `${total} P`;
}

export default function SpritesPanel({ locale }: SpritesPanelProps) {
  const t = getTranslations(locale);
  const images = useTpStore((s) => s.images);
  const selectedIds = useTpStore((s) => s.selectedIds);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const anchorIdRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const ingestFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) return;
    const loaded = await Promise.all(
      imageFiles.map((f) =>
        loadImageFromFile(f).catch(() => null),
      ),
    );
    const ok = loaded.filter((x): x is ImageItem => x !== null);
    if (ok.length === 0) return;
    useTpStore.getState().addImages(ok);
    useTpStore.getState().showNotification(`Loaded ${ok.length} sprites`);
  }, []);

  const onPickFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list) return;
      const files = Array.from(list);
      e.target.value = '';
      await ingestFiles(files);
    },
    [ingestFiles],
  );

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);

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

  const onRowClick = useCallback(
    (e: React.MouseEvent<HTMLElement>, id: string) => {
      const state = useTpStore.getState();
      if (e.shiftKey && anchorIdRef.current) {
        const list = state.images;
        const a = list.findIndex((i) => i.id === anchorIdRef.current);
        const b = list.findIndex((i) => i.id === id);
        if (a >= 0 && b >= 0) {
          const [start, end] = a < b ? [a, b] : [b, a];
          const range = list.slice(start, end + 1).map((i) => i.id);
          state.selectImages(range);
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
    [],
  );

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
      e.preventDefault();
      useTpStore.getState().removeImages(selectedIds);
    }
  }, [selectedIds]);

  const totalPixelsLabel = useMemo(() => formatPixels(images), [images]);
  const hasSelection = selectedIds.length > 0;
  const hasImages = images.length > 0;
  const selectedCountText = t.panels.selectedCount.replace('{n}', String(selectedIds.length));

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
        className={`flex-1 overflow-auto ${
          isDragging
            ? 'border-2 border-dashed border-[var(--tp-accent)] bg-[var(--tp-accent-soft)]'
            : ''
        }`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {!hasImages ? (
          <div className="flex h-full items-center justify-center px-4 py-12 text-center text-xs text-[var(--tp-text-muted)]">
            {t.panels.noSpritesHint}
          </div>
        ) : (
          <ul className="flex flex-col">
            {images.map((img) => {
              const selected = selectedSet.has(img.id);
              const { prefix, base } = splitName(img.name);
              return (
                <li
                  key={img.id}
                  onClick={(e) => onRowClick(e, img.id)}
                  className={`group flex h-11 cursor-pointer items-center gap-2 px-2 hover:bg-[var(--tp-panel-2)] ${
                    selected
                      ? 'border-l-2 border-[var(--tp-accent)] bg-[var(--tp-accent-soft)] pl-[6px]'
                      : ''
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-[var(--tp-border)] bg-[var(--tp-bg)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs">
                      {prefix && (
                        <span className="text-[var(--tp-text-muted)]">{prefix}</span>
                      )}
                      <span className="text-[var(--tp-text)]">{base}</span>
                    </div>
                    <div className="text-[10px] text-[var(--tp-text-dim)]">
                      {img.width} × {img.height}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={t.imageList.remove}
                    onClick={(e) => {
                      e.stopPropagation();
                      useTpStore.getState().removeImages([img.id]);
                    }}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--tp-text-muted)] hover:text-[var(--tp-danger)] ${
                      selected ? '' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
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
        // webkitdirectory / directory are non-standard but supported by Chromium/WebKit
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
      />
    </div>
  );
}
