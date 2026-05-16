'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTpStore, selectExceedsMax, selectActiveSheet } from '@/lib/store';
import { getTranslations, Locale } from '@/lib/i18n';
import type { PackedItem } from '@/lib/packer';

interface CanvasViewportProps {
  locale: Locale;
}

interface DragState {
  startPanX: number;
  startPanY: number;
  startMouseX: number;
  startMouseY: number;
  moved: boolean;
  fromEmpty: boolean;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const FOCUS_ANIM_MS = 200;
const KEYBOARD_NUDGE_PX = 20;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function basename(name: string): string {
  const idx = name.lastIndexOf('/');
  return idx >= 0 ? name.slice(idx + 1) : name;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function visualBoundsOf(item: PackedItem): Bounds {
  return {
    x: item.x,
    y: item.y,
    width: item.rotated ? item.height : item.width,
    height: item.rotated ? item.width : item.height,
  };
}

function unionBounds(items: PackedItem[]): Bounds | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const b = visualBoundsOf(it);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export default function CanvasViewport({ locale }: CanvasViewportProps) {
  const t = getTranslations(locale);

  const {
    zoom,
    pan,
    bgMode,
    bgColor,
    showBorders,
    showSpriteNames,
    packResult,
    selectedIds,
    maxWidth,
    maxHeight,
    activeSheet,
  } = useTpStore(
    useShallow((s) => ({
      zoom: s.zoom,
      pan: s.pan,
      bgMode: s.bgMode,
      bgColor: s.bgColor,
      showBorders: s.showBorders,
      showSpriteNames: s.showSpriteNames,
      packResult: s.packResult,
      selectedIds: s.selectedIds,
      maxWidth: s.settings.maxWidth,
      maxHeight: s.settings.maxHeight,
      activeSheet: s.activeSheet,
    })),
  );

  const exceedsMax = useTpStore(selectExceedsMax);
  const sheetData = useTpStore(selectActiveSheet);
  const setActiveSheet = useTpStore((s) => s.setActiveSheet);

  const setZoom = useTpStore((s) => s.setZoom);
  const zoomIn = useTpStore((s) => s.zoomIn);
  const zoomOut = useTpStore((s) => s.zoomOut);
  const resetView = useTpStore((s) => s.resetView);
  const setPan = useTpStore((s) => s.setPan);
  const setBgMode = useTpStore((s) => s.setBgMode);
  const setBgColor = useTpStore((s) => s.setBgColor);
  const toggleBorders = useTpStore((s) => s.toggleBorders);
  const toggleSpriteNames = useTpStore((s) => s.toggleSpriteNames);
  const selectImages = useTpStore((s) => s.selectImages);
  const toggleSelectImage = useTpStore((s) => s.toggleSelectImage);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const spaceHeldRef = useRef(false);
  const lastFocusedIdRef = useRef<string | null>(null);
  const focusAnimRef = useRef<number | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!sheetData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { packed, width, height } = sheetData;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (bgMode === 'solid') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }

    packed.forEach((item) => {
      const src = item.pixelSource ?? item.image;
      const ex = item.extrudePadding ?? 0;
      // Offset by -ex so the halo lands in the padding ring around the frame:
      // item.x/y address the inner frame, but pixelSource bakes the halo around it.
      ctx.save();
      if (item.rotated) {
        ctx.translate(item.x + item.height, item.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(src, -ex, -ex, item.width + ex * 2, item.height + ex * 2);
      } else {
        ctx.drawImage(src, item.x - ex, item.y - ex, item.width + ex * 2, item.height + ex * 2);
      }
      ctx.restore();

      if (showBorders) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = 1;
        const w = item.rotated ? item.height : item.width;
        const h = item.rotated ? item.width : item.height;
        ctx.strokeRect(item.x + 0.5, item.y + 0.5, w - 1, h - 1);
      }
    });
  }, [sheetData, showBorders, bgMode, bgColor]);

  /**
   * Animate the viewport pan (and optionally zoom) to focus a world-space bounds rect.
   * Caller passes the bounds in surface coordinates plus an optional target zoom (else current zoom).
   */
  const animateFocusToBounds = useCallback(
    (bounds: Bounds, options?: { fitZoom?: boolean }) => {
      const container = viewportRef.current;
      const sheet = sheetData;
      if (!container || !sheet) return;
      const rect = container.getBoundingClientRect();
      const state = useTpStore.getState();

      let targetZoom = state.zoom;
      if (options?.fitZoom && bounds.width > 0 && bounds.height > 0) {
        const fit = Math.min(rect.width / bounds.width, rect.height / bounds.height) * 0.9;
        const clamped = clamp(fit, ZOOM_MIN, ZOOM_MAX);
        // Only auto-zoom-out: don't fight the user by zooming in.
        if (clamped < state.zoom) targetZoom = clamped;
      }

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      let targetPanX = rect.width / 2 - centerX * targetZoom;
      let targetPanY = rect.height / 2 - centerY * targetZoom;

      // Best-effort clamp: keep at least half the sheet visible.
      const halfW = (sheet.width * targetZoom) / 2;
      const halfH = (sheet.height * targetZoom) / 2;
      const minPanX = -sheet.width * targetZoom + halfW;
      const maxPanX = rect.width - halfW;
      const minPanY = -sheet.height * targetZoom + halfH;
      const maxPanY = rect.height - halfH;
      if (minPanX <= maxPanX) targetPanX = clamp(targetPanX, minPanX, maxPanX);
      if (minPanY <= maxPanY) targetPanY = clamp(targetPanY, minPanY, maxPanY);

      const startPanX = state.pan.x;
      const startPanY = state.pan.y;
      const startZoom = state.zoom;
      const startTime = performance.now();

      if (focusAnimRef.current !== null) cancelAnimationFrame(focusAnimRef.current);

      const step = (now: number) => {
        const elapsed = now - startTime;
        const t01 = clamp(elapsed / FOCUS_ANIM_MS, 0, 1);
        const e = easeOutCubic(t01);
        const z = startZoom + (targetZoom - startZoom) * e;
        const px = startPanX + (targetPanX - startPanX) * e;
        const py = startPanY + (targetPanY - startPanY) * e;
        if (z !== useTpStore.getState().zoom) setZoom(z);
        setPan({ x: px, y: py });
        if (t01 < 1) {
          focusAnimRef.current = requestAnimationFrame(step);
        } else {
          focusAnimRef.current = null;
        }
      };
      focusAnimRef.current = requestAnimationFrame(step);
    },
    [sheetData, setPan, setZoom],
  );

  // Auto-focus on single-selection changes.
  useEffect(() => {
    if (!sheetData) {
      lastFocusedIdRef.current = null;
      return;
    }
    if (selectedIds.length !== 1) {
      lastFocusedIdRef.current = null;
      return;
    }
    const id = selectedIds[0];
    if (id === lastFocusedIdRef.current) return;
    const item = sheetData.packed.find((p) => p.id === id);
    if (!item || !item.placed) {
      lastFocusedIdRef.current = null;
      return;
    }
    lastFocusedIdRef.current = id;
    animateFocusToBounds(visualBoundsOf(item), { fitZoom: true });
    // animateFocusToBounds is stable for our purposes; we deliberately ignore it
    // to avoid re-firing when zoom/pan changes inside the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, sheetData]);

  // Cancel pending animation if user starts dragging.
  useEffect(() => {
    if (isDragging && focusAnimRef.current !== null) {
      cancelAnimationFrame(focusAnimRef.current);
      focusAnimRef.current = null;
    }
  }, [isDragging]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceHeldRef.current) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const state = useTpStore.getState();
      const newZoom = clamp(state.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      if (newZoom === state.zoom) return;
      const worldX = (mouseX - state.pan.x) / state.zoom;
      const worldY = (mouseY - state.pan.y) / state.zoom;
      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom, setPan]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const dx = e.clientX - ds.startMouseX;
      const dy = e.clientY - ds.startMouseY;
      if (!ds.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        ds.moved = true;
      }
      setPan({ x: ds.startPanX + dx, y: ds.startPanY + dy });
    };
    const onUp = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (ds && !ds.moved && ds.fromEmpty && e.button === 0 && !spaceHeldRef.current) {
        selectImages([]);
      }
      dragStateRef.current = null;
      setIsDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, setPan, selectImages]);

  const beginPanDrag = useCallback(
    (e: React.MouseEvent, fromEmpty: boolean) => {
      const state = useTpStore.getState();
      dragStateRef.current = {
        startPanX: state.pan.x,
        startPanY: state.pan.y,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        moved: false,
        fromEmpty,
      };
      setIsDragging(true);
    },
    [],
  );

  const onViewportMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Focus the viewport so keyboard nudge / shortcuts work.
      viewportRef.current?.focus({ preventScroll: true });
      if (e.button === 1) {
        e.preventDefault();
        beginPanDrag(e, false);
        return;
      }
      if (e.button === 0 && spaceHeldRef.current) {
        e.preventDefault();
        beginPanDrag(e, false);
        return;
      }
      if (e.button === 0) {
        beginPanDrag(e, true);
      }
    },
    [beginPanDrag],
  );

  const onSpriteMouseDown = useCallback(
    (e: React.MouseEvent, item: PackedItem) => {
      if (spaceHeldRef.current || e.button === 1) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey) {
        toggleSelectImage(item.id, true);
      } else {
        if (!selectedSet.has(item.id) || selectedIds.length !== 1) {
          selectImages([item.id]);
        }
      }
    },
    [toggleSelectImage, selectImages, selectedSet, selectedIds.length],
  );

  // Fit-to-selection action (also bound to keyboard 'f').
  const fitToSelection = useCallback(() => {
    if (!sheetData || selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const items = sheetData.packed.filter((p) => idSet.has(p.id) && p.placed);
    const bounds = unionBounds(items);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    animateFocusToBounds(bounds, { fitZoom: true });
  }, [sheetData, selectedIds, animateFocusToBounds]);

  // Local keyboard handler on the viewport (arrow nudges, f, 0).
  const onViewportKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target && target !== viewportRef.current) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const step = e.shiftKey ? KEYBOARD_NUDGE_PX * 2 : KEYBOARD_NUDGE_PX;
      const state = useTpStore.getState();
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setPan({ x: state.pan.x + step, y: state.pan.y });
          return;
        case 'ArrowRight':
          e.preventDefault();
          setPan({ x: state.pan.x - step, y: state.pan.y });
          return;
        case 'ArrowUp':
          e.preventDefault();
          setPan({ x: state.pan.x, y: state.pan.y + step });
          return;
        case 'ArrowDown':
          e.preventDefault();
          setPan({ x: state.pan.x, y: state.pan.y - step });
          return;
        case '0':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            resetView();
          }
          return;
        case 'f':
        case 'F':
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            fitToSelection();
          }
          return;
      }
    },
    [setPan, resetView, fitToSelection],
  );

  const surfaceWidth = sheetData?.width ?? 0;
  const surfaceHeight = sheetData?.height ?? 0;
  const sheetsList = packResult?.sheets ?? [];
  const showTabs = sheetsList.length > 1;

  const cursor = isDragging
    ? 'grabbing'
    : spaceHeld
      ? 'grab'
      : 'default';

  const bgClass = bgMode === 'checker' ? 'tp-checker' : '';
  const bgStyle: React.CSSProperties =
    bgMode === 'solid'
      ? { background: bgColor }
      : bgMode === 'transparent'
        ? { background: 'var(--tp-bg)' }
        : {};

  const segBtn = (active: boolean) =>
    `h-6 px-2 rounded-md text-[11px] border transition ${
      active
        ? 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent)] border-[var(--tp-accent)]'
        : 'bg-[var(--tp-bg-elev)] text-[var(--tp-text-muted)] border-[var(--tp-border)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
    }`;

  const iconBtn =
    'h-6 px-2 rounded-md text-[11px] border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] text-[var(--tp-text)] hover:bg-[var(--tp-panel-2)] inline-flex items-center justify-center';

  const plainBtn =
    'h-6 w-6 rounded-md text-[12px] text-[var(--tp-text)] hover:bg-[var(--tp-panel-2)] inline-flex items-center justify-center';

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--tp-bg)]">
      {showTabs && (
        <div
          className="h-7 flex items-center px-2 gap-1 border-b overflow-x-auto"
          style={{ borderColor: 'var(--tp-border)', background: 'var(--tp-bg)' }}
          role="tablist"
          aria-label="Sheets"
        >
          {sheetsList.map((sh, i) => {
            const active = i === activeSheet;
            const label = t.canvas.sheet.replace('{n}', String(i + 1));
            return (
              <button
                key={sh.index}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSheet(i)}
                className={`h-6 px-3 text-[11px] rounded-t-md border-x border-t transition whitespace-nowrap ${
                  active
                    ? 'bg-[var(--tp-panel)] text-[var(--tp-text)] border-[var(--tp-border)]'
                    : 'bg-[var(--tp-bg-elev)] text-[var(--tp-text-muted)] border-transparent hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
                }`}
                style={
                  active
                    ? { boxShadow: 'inset 0 -2px 0 0 var(--tp-accent)' }
                    : undefined
                }
              >
                {label} ({sh.width}×{sh.height})
              </button>
            );
          })}
        </div>
      )}
      <div
        className="h-9 flex items-center px-3 gap-2 text-xs border-b"
        style={{ borderColor: 'var(--tp-border)', background: 'var(--tp-bg-elev)' }}
      >
        <div className="flex items-center gap-1">
          <button className={plainBtn} onClick={zoomOut} aria-label={t.menu.zoomOut} title={t.menu.zoomOut}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <div className="h-6 min-w-[52px] px-2 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] text-[var(--tp-text)] inline-flex items-center justify-center text-[11px] tabular-nums">
            {Math.round(zoom * 100)}%
          </div>
          <button className={plainBtn} onClick={zoomIn} aria-label={t.menu.zoomIn} title={t.menu.zoomIn}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button className={iconBtn} onClick={resetView} title={t.menu.zoomFit}>
            {t.canvas.fit}
          </button>
          <button className={iconBtn} onClick={() => setZoom(1)} title={t.menu.zoomActual}>
            {t.canvas.actual}
          </button>
          {selectedIds.length > 0 && (
            <button
              className={iconBtn}
              onClick={fitToSelection}
              title="Fit to selection (F)"
            >
              Selection
            </button>
          )}
        </div>

        <div className="h-5 w-px mx-1" style={{ background: 'var(--tp-border)' }} />

        <div className="flex items-center gap-1">
          <button className={segBtn(bgMode === 'checker')} onClick={() => setBgMode('checker')}>
            {t.canvas.bgChecker}
          </button>
          <button className={segBtn(bgMode === 'solid')} onClick={() => setBgMode('solid')}>
            {t.canvas.bgSolid}
          </button>
          <button className={segBtn(bgMode === 'transparent')} onClick={() => setBgMode('transparent')}>
            {t.canvas.bgTransparent}
          </button>
          {bgMode === 'solid' && (
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-6 w-7 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] cursor-pointer p-0.5"
              aria-label={t.inspector.backgroundColor}
              title={t.inspector.backgroundColor}
            />
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button className={segBtn(showBorders)} onClick={toggleBorders}>
            {t.canvas.showBorders}
          </button>
          <button className={segBtn(showSpriteNames)} onClick={toggleSpriteNames}>
            {t.canvas.showNames}
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        className={`relative flex-1 overflow-hidden outline-none ${bgClass}`}
        style={{ ...bgStyle, cursor }}
        onMouseDown={onViewportMouseDown}
        onKeyDown={onViewportKeyDown}
      >
        {sheetData ? (
          <div
            ref={surfaceRef}
            className="absolute top-0 left-0"
            style={{
              width: surfaceWidth,
              height: surfaceHeight,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <canvas
              ref={canvasRef}
              className="block"
              style={{ width: surfaceWidth, height: surfaceHeight, imageRendering: 'pixelated' }}
            />
            <div className="absolute inset-0 pointer-events-none">
              {sheetData.packed.map((item) => {
                const w = item.rotated ? item.height : item.width;
                const h = item.rotated ? item.width : item.height;
                const selected = selectedSet.has(item.id);
                const labelText = truncate(basename(item.name), 16);
                return (
                  <div
                    key={item.id}
                    className="absolute pointer-events-auto"
                    style={{
                      left: item.x,
                      top: item.y,
                      width: w,
                      height: h,
                      cursor: spaceHeld ? 'grab' : 'default',
                      boxShadow: selected ? 'inset 0 0 0 2px var(--tp-accent)' : undefined,
                    }}
                    onMouseDown={(e) => onSpriteMouseDown(e, item)}
                  >
                    {showSpriteNames && (
                      <div
                        className={`absolute top-0 left-0 text-[10px] font-mono px-1 py-px rounded-sm pointer-events-none overflow-hidden whitespace-nowrap text-ellipsis max-w-[160px] leading-none ${
                          selected
                            ? 'bg-[var(--tp-accent)] text-white'
                            : 'bg-[rgba(15,23,42,0.85)] text-white'
                        }`}
                        style={{
                          transform: `scale(${1 / zoom})`,
                          transformOrigin: '0 0',
                        }}
                      >
                        {labelText}
                      </div>
                    )}
                  </div>
                );
              })}
              {exceedsMax && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: 0,
                    top: 0,
                    width: maxWidth,
                    height: maxHeight,
                    border: '3px dashed var(--tp-danger)',
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--tp-text-dim)' }}
              className="mb-3"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <p className="text-sm text-[var(--tp-text-muted)] max-w-xs">{t.panels.noPackHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
