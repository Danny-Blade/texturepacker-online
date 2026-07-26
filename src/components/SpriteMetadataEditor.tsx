'use client';

import type { ImageItem } from '@/lib/packer';
import { getTranslations, type Locale } from '@/lib/i18n';
import { useTpStore } from '@/lib/store';
import {
  DEFAULT_PIVOT,
  ZERO_INSETS,
  clampPivot,
  normalizeNineSlice,
  readSpriteMetadata,
  resolvePivot,
  type PivotMode,
  type SliceInsets,
  type SpriteNineSlice,
} from '@/lib/spriteMetadata';

interface Props {
  locale: Locale;
  sprites: ImageItem[];
}

const PRESETS = [
  [0, 1], [0.5, 1], [1, 1],
  [0, 0.5], [0.5, 0.5], [1, 0.5],
  [0, 0], [0.5, 0], [1, 0],
] as const;

function NumberField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] text-[var(--tp-text-dim)]">{label}</span>
      <input
        type="number"
        className="tp-input tp-num"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function InsetsFields({ value, width, height, labels, onChange }: {
  value: SliceInsets; width: number; height: number;
  labels: { left: string; right: string; top: string; bottom: string };
  onChange: (next: SliceInsets) => void;
}) {
  const field = (key: keyof SliceInsets, max: number) => (
    <NumberField
      label={labels[key]}
      value={value[key]}
      min={0}
      max={max}
      onChange={(number) => onChange({ ...value, [key]: Math.max(0, Math.round(number || 0)) })}
    />
  );
  return <div className="grid grid-cols-4 gap-1.5">{field('left', width)}{field('right', width)}{field('top', height)}{field('bottom', height)}</div>;
}

export default function SpriteMetadataEditor({ locale, sprites }: Props) {
  const t = getTranslations(locale).inspector;
  const labels = {
    pivot: t.pivotAnchor, mode: t.coordinateMode, relative: t.relativeCoordinates,
    absolute: t.pixelCoordinates, x: 'X', y: 'Y', presets: t.presetPositions,
    nine: t.nineSlice, enable: t.enableNineSlice, border: t.stretchBorders,
    content: t.contentPadding, left: t.insetLeft, right: t.insetRight,
    top: t.insetTop, bottom: t.insetBottom, preview: t.nineSlicePreview,
    batch: t.batchSpriteMetadata,
  };
  const updateMetadata = useTpStore((state) => state.updateSpriteMetadata);
  const first = sprites[0];
  if (!first) return null;
  const metadata = readSpriteMetadata(first.metadata);
  const pivot = clampPivot(metadata.pivot ?? DEFAULT_PIVOT, first.width, first.height);
  const nine = metadata.nineSlice
    ? normalizeNineSlice(metadata.nineSlice, first.width, first.height)
    : undefined;
  const ids = sprites.map((sprite) => sprite.id);

  const setPivot = (next: typeof pivot) => updateMetadata(ids, { pivot: next });
  const setMode = (mode: PivotMode) => {
    const resolved = resolvePivot({ pivot }, first.width, first.height);
    setPivot(mode === 'relative'
      ? { mode, ...resolved.normalized }
      : { mode, ...resolved.pixels });
  };
  const setPreset = (x: number, y: number) => {
    setPivot(pivot.mode === 'relative'
      ? { mode: 'relative', x, y }
      : { mode: 'absolute', x: x * first.width, y: y * first.height });
  };
  const setNine = (next: SpriteNineSlice) => updateMetadata(ids, { nineSlice: next });
  const border = nine?.border ?? ZERO_INSETS;
  const content = nine?.content ?? ZERO_INSETS;
  const pctX = (n: number) => `${Math.min(100, (n / first.width) * 100)}%`;
  const pctY = (n: number) => `${Math.min(100, (n / first.height) * 100)}%`;

  return (
    <div className="space-y-4 border-t border-[var(--tp-border)] pt-3">
      {sprites.length > 1 && <p className="text-[10px] text-[var(--tp-text-dim)]">{labels.batch.replace('{n}', String(sprites.length))}</p>}
      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--tp-text)]">{labels.pivot}</div>
        <div>
          <div className="tp-label mb-1">{labels.mode}</div>
          <div className="grid grid-cols-2 rounded border border-[var(--tp-border)] p-0.5">
            {(['relative', 'absolute'] as PivotMode[]).map((mode) => (
              <button key={mode} type="button" onClick={() => setMode(mode)}
                className={`h-6 rounded text-[10px] ${pivot.mode === mode ? 'bg-[var(--tp-accent)] text-white' : 'text-[var(--tp-text-muted)]'}`}>
                {mode === 'relative' ? labels.relative : labels.absolute}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={labels.x} value={pivot.x} min={0} max={pivot.mode === 'relative' ? 1 : first.width} step={pivot.mode === 'relative' ? 0.01 : 1}
            onChange={(x) => setPivot(clampPivot({ ...pivot, x }, first.width, first.height))} />
          <NumberField label={labels.y} value={pivot.y} min={0} max={pivot.mode === 'relative' ? 1 : first.height} step={pivot.mode === 'relative' ? 0.01 : 1}
            onChange={(y) => setPivot(clampPivot({ ...pivot, y }, first.width, first.height))} />
        </div>
        <div>
          <div className="tp-label mb-1">{labels.presets}</div>
          <div className="grid w-[70px] grid-cols-3 gap-1">
            {PRESETS.map(([x, y]) => <button key={`${x}-${y}`} type="button" onClick={() => setPreset(x, y)}
              className="h-4 w-4 rounded-full border border-[var(--tp-border)] hover:border-[var(--tp-accent)] hover:bg-[var(--tp-accent)]" aria-label={`${labels.presets} ${x},${y}`} />)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--tp-text)]">{labels.nine}</div>
        <label className="flex items-center gap-2 text-xs text-[var(--tp-text)]">
          <input type="checkbox" checked={Boolean(nine)} onChange={(event) => updateMetadata(ids, {
            nineSlice: event.target.checked ? { border: { ...ZERO_INSETS }, content: { ...ZERO_INSETS } } : undefined,
          })} />
          {labels.enable}
        </label>
        {nine && <>
          <div className="relative mx-auto aspect-square w-full max-w-[180px] overflow-hidden rounded border border-[var(--tp-border)] bg-[var(--tp-bg)]" title={labels.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={first.url} alt="" className="h-full w-full object-fill opacity-70" />
            <div className="pointer-events-none absolute border border-red-400" style={{ left: pctX(border.left), right: pctX(border.right), top: pctY(border.top), bottom: pctY(border.bottom) }} />
            <div className="pointer-events-none absolute border border-emerald-400 border-dashed" style={{ left: pctX(content.left), right: pctX(content.right), top: pctY(content.top), bottom: pctY(content.bottom) }} />
          </div>
          <div className="tp-label">{labels.border}</div>
          <InsetsFields value={border} width={first.width} height={first.height} labels={labels} onChange={(next) => setNine(normalizeNineSlice({ ...nine, border: next }, first.width, first.height))} />
          <div className="tp-label">{labels.content}</div>
          <InsetsFields value={content} width={first.width} height={first.height} labels={labels} onChange={(next) => setNine(normalizeNineSlice({ ...nine, content: next }, first.width, first.height))} />
        </>}
      </div>
    </div>
  );
}
