'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTpStore } from '@/lib/store';
import { getTranslations, type Locale } from '@/lib/i18n';
import {
  cutGrid,
  cutTransparentStrips,
  parseAtlasData,
  type CutFrame,
  type CutGridOptions,
} from '@/lib/cutter';
import { extractSprites } from '@/lib/cutter/extractSprites';

interface CutterDialogProps {
  locale: Locale;
  isOpen: boolean;
  onClose: () => void;
}

type CutterMode = 'grid' | 'data' | 'strips';

interface GridState {
  cellWidth: number;
  cellHeight: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
  namePrefix: string;
  startIndex: number;
  padDigits: number;
}

const DEFAULT_GRID: GridState = {
  cellWidth: 32,
  cellHeight: 32,
  marginX: 0,
  marginY: 0,
  spacingX: 0,
  spacingY: 0,
  namePrefix: 'sprite_',
  startIndex: 0,
  padDigits: 4,
};

interface LoadedImage {
  element: HTMLImageElement;
  baseName: string;
}

/**
 * Read an image `File` into an `<img>` element via a data URL. The atlas
 * bytes never leave the browser — this mirrors the loader used elsewhere
 * in the app for consistency.
 */
function loadImageFromFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result;
      if (typeof url !== 'string') {
        reject(new Error('Failed to read image'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        resolve({ element: img, baseName });
      };
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = url;
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        reject(new Error('Failed to read data file'));
        return;
      }
      resolve(text);
    };
    reader.onerror = () => reject(new Error('Failed to read data file'));
    reader.readAsText(file);
  });
}

export default function CutterDialog({ locale, isOpen, onClose }: CutterDialogProps) {
  const t = getTranslations(locale);
  const addImages = useTpStore((s) => s.addImages);
  const showNotification = useTpStore((s) => s.showNotification);

  const [mode, setMode] = useState<CutterMode>('grid');
  const [grid, setGrid] = useState<GridState>(DEFAULT_GRID);
  const [alphaThreshold, setAlphaThreshold] = useState<number>(1);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [dataContent, setDataContent] = useState<string | null>(null);
  const [dataFrames, setDataFrames] = useState<CutFrame[] | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const previewRef = useRef<HTMLCanvasElement | null>(null);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Reset transient state when the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setDataError(null);
      setIsExtracting(false);
    }
  }, [isOpen]);

  // Cached ImageData for the strips mode. Rebuilt whenever the source
  // image changes so users can retune the alpha threshold without paying
  // the drawImage cost again.
  const imageData = useMemo<ImageData | null>(() => {
    if (!image || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.element.width;
    canvas.height = image.element.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image.element, 0, 0);
    try {
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return null;
    }
  }, [image]);

  // Compute the frames for the active mode. Grid + strips are cheap;
  // data-mode frames come from the parsed file cached separately.
  const frames = useMemo<CutFrame[]>(() => {
    if (!image) return [];
    const w = image.element.width;
    const h = image.element.height;
    if (mode === 'grid') {
      const opts: CutGridOptions = {
        cellWidth: Math.max(1, grid.cellWidth),
        cellHeight: Math.max(1, grid.cellHeight),
        marginX: Math.max(0, grid.marginX),
        marginY: Math.max(0, grid.marginY),
        spacingX: Math.max(0, grid.spacingX),
        spacingY: Math.max(0, grid.spacingY),
        namePrefix: grid.namePrefix || 'sprite_',
        startIndex: Math.max(0, Math.floor(grid.startIndex)),
        padDigits: Math.max(0, Math.floor(grid.padDigits)),
      };
      return cutGrid(w, h, opts);
    }
    if (mode === 'strips') {
      if (!imageData) return [];
      return cutTransparentStrips(imageData, alphaThreshold);
    }
    if (mode === 'data') {
      return dataFrames ?? [];
    }
    return [];
  }, [mode, grid, alphaThreshold, image, imageData, dataFrames]);

  // Redraw the preview canvas whenever the frame set or image changes.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!image) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const maxPreview = 480;
    const iw = image.element.width;
    const ih = image.element.height;
    const scale = Math.min(1, maxPreview / Math.max(iw, ih));
    const cw = Math.max(1, Math.round(iw * scale));
    const ch = Math.max(1, Math.round(ih * scale));
    canvas.width = cw;
    canvas.height = ch;
    // Checker background so transparent atlases are still visible.
    const tile = 8;
    for (let y = 0; y < ch; y += tile) {
      for (let x = 0; x < cw; x += tile) {
        const dark = ((x / tile) + (y / tile)) % 2 === 0;
        ctx.fillStyle = dark ? '#1a2233' : '#0f1522';
        ctx.fillRect(x, y, tile, tile);
      }
    }
    ctx.drawImage(image.element, 0, 0, iw, ih, 0, 0, cw, ch);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    for (const f of frames) {
      ctx.strokeRect(
        Math.floor(f.x * scale) + 0.5,
        Math.floor(f.y * scale) + 0.5,
        Math.max(1, Math.round(f.w * scale) - 1),
        Math.max(1, Math.round(f.h * scale) - 1),
      );
    }
  }, [image, frames]);

  const handleImageInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const loaded = await loadImageFromFile(file);
      setImage(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load image';
      showNotification(message);
    }
  }, [showNotification]);

  const handleDataInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      setDataContent(null);
      setDataFrames(null);
      setDataError(null);
      return;
    }
    if (!image) {
      // Buffer the raw content; we'll re-parse once we know the image size.
      try {
        const text = await readTextFile(file);
        setDataContent(text);
        setDataFrames(null);
        setDataError(t.cutter.needsImage);
      } catch (err) {
        setDataError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    try {
      const text = await readTextFile(file);
      setDataContent(text);
      const parsed = parseAtlasData(text, image.element.width, image.element.height);
      if (parsed === null) {
        setDataFrames(null);
        setDataError(t.cutter.parseFailure);
        return;
      }
      setDataFrames(parsed);
      setDataError(null);
      setMode('data');
      showNotification(t.cutter.dataLoaded.replace('{n}', String(parsed.length)));
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err));
    }
  }, [image, showNotification, t.cutter.dataLoaded, t.cutter.needsImage, t.cutter.parseFailure]);

  // Re-parse the buffered data content when the image finishes loading.
  useEffect(() => {
    if (!image || !dataContent) return;
    const parsed = parseAtlasData(dataContent, image.element.width, image.element.height);
    if (parsed === null) {
      setDataError(t.cutter.parseFailure);
      setDataFrames(null);
      return;
    }
    setDataFrames(parsed);
    setDataError(null);
  }, [image, dataContent, t.cutter.parseFailure]);

  const handleAdd = useCallback(async () => {
    if (!image || frames.length === 0) return;
    setIsExtracting(true);
    try {
      const items = await extractSprites(image.element, frames, { namePrefix: image.baseName });
      if (items.length > 0) {
        addImages(items);
        showNotification(t.cutter.added.replace('{n}', String(items.length)));
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showNotification(message);
    } finally {
      setIsExtracting(false);
    }
  }, [image, frames, addImages, showNotification, t.cutter.added, onClose]);

  if (!isOpen) return null;

  const segBtn = (active: boolean) =>
    `h-7 px-3 rounded-md text-xs border transition ${
      active
        ? 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent)] border-[var(--tp-accent)]'
        : 'bg-[var(--tp-bg-elev)] text-[var(--tp-text-muted)] border-[var(--tp-border)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
    }`;

  const totalArea = frames.reduce((acc, f) => acc + f.w * f.h, 0);
  const disableAdd = isExtracting || !image || frames.length === 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.cutter.title}
        className="max-w-4xl w-full max-h-[92vh] overflow-auto rounded-lg border border-[var(--tp-border)] bg-[var(--tp-panel)] shadow-2xl"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--tp-border)]">
          <h2 className="text-sm font-semibold text-[var(--tp-text)]">{t.cutter.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]"
            aria-label={t.cutter.cancel}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="p-4 space-y-4">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="tp-label mb-1 block">{t.cutter.image}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageInput}
                className="tp-input"
                data-testid="cutter-image-input"
              />
              {image && (
                <span className="mt-1 block text-[10px] text-[var(--tp-text-dim)]">
                  {image.baseName} — {image.element.width}×{image.element.height}
                </span>
              )}
            </label>
            <label className="block">
              <span className="tp-label mb-1 block">{t.cutter.dataFile}</span>
              <input
                type="file"
                accept=".json,.xml,.plist,.atlas,text/*"
                onChange={handleDataInput}
                className="tp-input"
                data-testid="cutter-data-input"
              />
              {dataError && (
                <span className="mt-1 block text-[10px] text-[var(--tp-danger)]">
                  {dataError}
                </span>
              )}
            </label>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
            <div className="space-y-3">
              <section>
                <span className="tp-label mb-2 block">{t.cutter.mode}</span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      { key: 'grid', label: t.cutter.modeGrid },
                      { key: 'data', label: t.cutter.modeData },
                      { key: 'strips', label: t.cutter.modeStrips },
                    ] as const
                  ).map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setMode(c.key)}
                      className={segBtn(mode === c.key)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </section>

              {mode === 'grid' && (
                <section className="tp-panel rounded-md p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.cellWidth}
                      <input
                        type="number"
                        min={1}
                        className="tp-input mt-1"
                        value={grid.cellWidth}
                        onChange={(e) => setGrid({ ...grid, cellWidth: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.cellHeight}
                      <input
                        type="number"
                        min={1}
                        className="tp-input mt-1"
                        value={grid.cellHeight}
                        onChange={(e) => setGrid({ ...grid, cellHeight: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.marginX}
                      <input
                        type="number"
                        min={0}
                        className="tp-input mt-1"
                        value={grid.marginX}
                        onChange={(e) => setGrid({ ...grid, marginX: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.marginY}
                      <input
                        type="number"
                        min={0}
                        className="tp-input mt-1"
                        value={grid.marginY}
                        onChange={(e) => setGrid({ ...grid, marginY: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.spacingX}
                      <input
                        type="number"
                        min={0}
                        className="tp-input mt-1"
                        value={grid.spacingX}
                        onChange={(e) => setGrid({ ...grid, spacingX: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.spacingY}
                      <input
                        type="number"
                        min={0}
                        className="tp-input mt-1"
                        value={grid.spacingY}
                        onChange={(e) => setGrid({ ...grid, spacingY: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>
                  </div>
                  <label className="block text-[10px] text-[var(--tp-text-muted)]">
                    {t.cutter.namePrefix}
                    <input
                      type="text"
                      className="tp-input mt-1"
                      value={grid.namePrefix}
                      onChange={(e) => setGrid({ ...grid, namePrefix: e.target.value })}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.startIndex}
                      <input
                        type="number"
                        min={0}
                        className="tp-input mt-1"
                        value={grid.startIndex}
                        onChange={(e) => setGrid({ ...grid, startIndex: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                      />
                    </label>
                    <label className="block text-[10px] text-[var(--tp-text-muted)]">
                      {t.cutter.padDigits}
                      <input
                        type="number"
                        min={0}
                        max={8}
                        className="tp-input mt-1"
                        value={grid.padDigits}
                        onChange={(e) => setGrid({ ...grid, padDigits: Math.max(0, Math.min(8, Math.floor(Number(e.target.value) || 0))) })}
                      />
                    </label>
                  </div>
                </section>
              )}

              {mode === 'data' && (
                <section className="tp-panel rounded-md p-3 space-y-2">
                  <p className="text-[11px] text-[var(--tp-text-muted)]">{t.cutter.dataHint}</p>
                  {dataFrames && (
                    <p className="text-[11px] text-[var(--tp-text)]">
                      {t.cutter.dataLoaded.replace('{n}', String(dataFrames.length))}
                    </p>
                  )}
                </section>
              )}

              {mode === 'strips' && (
                <section className="tp-panel rounded-md p-3 space-y-2">
                  <label className="block text-[10px] text-[var(--tp-text-muted)]">
                    {t.cutter.alphaThreshold}
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="range"
                        min={0}
                        max={64}
                        value={alphaThreshold}
                        onChange={(e) => setAlphaThreshold(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-[11px] tabular-nums text-[var(--tp-text)] w-8 text-right">
                        {alphaThreshold}
                      </span>
                    </div>
                  </label>
                  <p className="text-[11px] text-[var(--tp-text-muted)]">{t.cutter.stripsHint}</p>
                </section>
              )}
            </div>

            <div className="space-y-2">
              <div className="tp-panel rounded-md p-3 flex flex-col items-center justify-center min-h-[240px]">
                {image ? (
                  <canvas
                    ref={previewRef}
                    className="max-w-full h-auto border border-[var(--tp-border)]"
                    data-testid="cutter-preview-canvas"
                  />
                ) : (
                  <span className="text-[11px] text-[var(--tp-text-muted)]">
                    {t.cutter.needsImage}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--tp-text)]">
                {t.cutter.previewFrames.replace('{n}', String(frames.length))}
                {frames.length > 0 && (
                  <span className="ml-2 text-[var(--tp-text-muted)]">
                    ({totalArea.toLocaleString()} px²)
                  </span>
                )}
              </div>
              {frames.length > 200 && (
                <div className="text-[11px] text-[var(--tp-warning,#f59e0b)]">
                  {t.cutter.tooManyFrames.replace('{n}', String(frames.length))}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--tp-border)] bg-[var(--tp-bg-elev)]">
          <button type="button" onClick={onClose} className="tp-btn" disabled={isExtracting}>
            {t.cutter.cancel}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="tp-btn tp-btn-primary"
            disabled={disableAdd}
          >
            {t.cutter.add.replace('{n}', String(frames.length))}
          </button>
        </footer>
      </div>
    </div>
  );
}
