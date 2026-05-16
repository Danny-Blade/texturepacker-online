'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTpStore, loadImageFromFile, type ImageItem } from '@/lib/store';
import { generateExportData } from '@/lib/packer';
import { getTranslations, type Locale } from '@/lib/i18n';
import MenuBar from './MenuBar';
import Toolbar from './Toolbar';
import SpritesPanel from './SpritesPanel';
import CanvasViewport from './CanvasViewport';
import Inspector from './Inspector';
import StatusBar from './StatusBar';

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

function extForFormat(fmt: string): string {
  if (fmt === 'css') return 'css';
  if (fmt === 'xml') return 'xml';
  if (fmt === 'cocos2d') return 'plist';
  return 'json';
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
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const loaded: ImageItem[] = [];
    await Promise.all(
      imageFiles.map(async (f) => {
        try {
          loaded.push(await loadImageFromFile(f));
        } catch {
          /* ignore single failure */
        }
      }),
    );
    if (loaded.length > 0) {
      useTpStore.getState().addImages(loaded);
      useTpStore.getState().showNotification(`Loaded ${loaded.length} sprite${loaded.length === 1 ? '' : 's'}`);
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

  const handlePublish = useCallback(async () => {
    const { packResult, fileName, exportFormat, dirHandle } = useTpStore.getState();
    if (!packResult) {
      useTpStore.getState().showNotification(t.errors.noImages);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = packResult.width;
    canvas.height = packResult.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    packResult.packed.forEach((item) => {
      ctx.save();
      if (item.rotated) {
        ctx.translate(item.x + item.height, item.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(item.image, 0, 0, item.width, item.height);
      } else {
        ctx.drawImage(item.image, item.x, item.y, item.width, item.height);
      }
      ctx.restore();
    });
    const imageBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!imageBlob) return;
    const dataExt = extForFormat(exportFormat);
    const dataStr = generateExportData(
      packResult.packed,
      packResult.width,
      packResult.height,
      exportFormat,
      `${fileName}.png`,
    );
    const dataBlob = new Blob([dataStr], { type: 'text/plain' });

    type DirHandleAny = FileSystemDirectoryHandle & {
      getFileHandle: (n: string, o?: { create?: boolean }) => Promise<{
        createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
      }>;
    };
    if (dirHandle) {
      try {
        const dh = dirHandle as DirHandleAny;
        const imgFh = await dh.getFileHandle(`${fileName}.png`, { create: true });
        const imgW = await imgFh.createWritable();
        await imgW.write(imageBlob);
        await imgW.close();
        const dataFh = await dh.getFileHandle(`${fileName}.${dataExt}`, { create: true });
        const dataW = await dataFh.createWritable();
        await dataW.write(dataBlob);
        await dataW.close();
        useTpStore.getState().showNotification('Published to output folder');
        return;
      } catch {
        /* fall through to download */
      }
    }
    triggerDownload(`${fileName}.png`, imageBlob);
    triggerDownload(`${fileName}.${dataExt}`, dataBlob);
    useTpStore.getState().showNotification('Sprite sheet published');
  }, [t.errors.noImages, triggerDownload]);

  const handleSaveProject = useCallback(async () => {
    const { images, settings, exportFormat, fileName, selectedDirPath, dirHandle } =
      useTpStore.getState();
    const projectData = {
      version: '1.0',
      tool: 'web-texturepacker',
      settings,
      exportFormat,
      fileName,
      selectedDirPath,
      images: images.map((img) => ({
        id: img.id,
        name: img.name,
        width: img.width,
        height: img.height,
        imageData: img.url,
      })),
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const projectFileName = `${fileName || 'project'}.tps`;

    type DirHandleAny = FileSystemDirectoryHandle & {
      getFileHandle: (n: string, o?: { create?: boolean }) => Promise<{
        createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
      }>;
    };
    if (dirHandle) {
      try {
        const dh = dirHandle as DirHandleAny;
        const fh = await dh.getFileHandle(projectFileName, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        useTpStore.getState().showNotification(t.project.saved);
        return;
      } catch {
        /* fall through */
      }
    }
    triggerDownload(projectFileName, blob);
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
        try {
          const projectData = JSON.parse(ev.target?.result as string);
          if (!projectData.version || !projectData.images) throw new Error('Invalid project');
          const loaded: ImageItem[] = [];
          for (const data of projectData.images) {
            try {
              const img = await new Promise<ImageItem>((resolve, reject) => {
                const im = new Image();
                im.onload = () =>
                  resolve({
                    id: data.id,
                    name: data.name,
                    width: im.width,
                    height: im.height,
                    image: im,
                    url: data.imageData,
                  });
                im.onerror = () => reject(new Error('Failed to decode'));
                im.src = data.imageData;
              });
              loaded.push(img);
            } catch {
              /* skip */
            }
          }
          const s = useTpStore.getState();
          s.clearImages();
          if (projectData.settings) s.setSettings(projectData.settings);
          if (projectData.exportFormat) s.setExportFormat(projectData.exportFormat);
          if (projectData.fileName) s.setFileName(projectData.fileName);
          if (projectData.selectedDirPath) s.setSelectedDirPath(projectData.selectedDirPath);
          s.addImages(loaded);
          s.showNotification(t.project.loaded);
        } catch {
          useTpStore.getState().showNotification(t.project.loadError);
        }
      };
      reader.readAsText(file);
    },
    [t.project.loaded, t.project.loadError],
  );

  const handleNewProject = useCallback(() => {
    const s = useTpStore.getState();
    s.clearImages();
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
      } else if (meta && e.key === '=') {
        e.preventDefault();
        useTpStore.getState().zoomIn();
      } else if (meta && e.key === '-') {
        e.preventDefault();
        useTpStore.getState().zoomOut();
      } else if (meta && e.key === '0') {
        e.preventDefault();
        useTpStore.getState().resetView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSaveProject, handleOpenProject, handleNewProject, handlePublish]);

  const handlerProps = {
    locale,
    onNewProject: handleNewProject,
    onOpenProject: handleOpenProject,
    onSaveProject: handleSaveProject,
    onSaveProjectAs: handleSaveProject,
    onAddSprites: handleAddSprites,
    onAddFolder: handleAddFolder,
    onPublish: handlePublish,
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
          <CanvasViewport locale={locale} />
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
        accept=".tps,application/json"
        className="hidden"
        onChange={handleProjectFileSelected}
      />
    </div>
  );
}
