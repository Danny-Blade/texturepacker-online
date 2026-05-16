'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTpStore, selectExceedsMax } from '@/lib/store';
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

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
    })),
  );

  const exceedsMax = useTpStore(selectExceedsMax);

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
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!packResult || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { packed, width, height } = packResult;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (bgMode === 'solid') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }

    packed.forEach((item) => {
      ctx.save();
      if (item.rotated) {
        ctx.translate(item.x + item.height, item.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(item.image, 0, 0, item.width, item.height);
      } else {
        ctx.drawImage(item.image, item.x, item.y, item.width, item.height);
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
  }, [packResult, showBorders, bgMode, bgColor]);

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

  const surfaceWidth = packResult?.width ?? 0;
  const surfaceHeight = packResult?.height ?? 0;

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
        className={`relative flex-1 overflow-hidden ${bgClass}`}
        style={{ ...bgStyle, cursor }}
        onMouseDown={onViewportMouseDown}
      >
        {packResult ? (
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
              {packResult.packed.map((item) => {
                const w = item.rotated ? item.height : item.width;
                const h = item.rotated ? item.width : item.height;
                const selected = selectedSet.has(item.id);
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
                        className="absolute top-0 left-0 px-1 py-0.5 text-[10px] leading-none text-white pointer-events-none"
                        style={{
                          background: 'rgba(15, 23, 42, 0.85)',
                          maxWidth: '100%',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          transform: `scale(${1 / zoom})`,
                          transformOrigin: '0 0',
                        }}
                      >
                        {item.name}
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
