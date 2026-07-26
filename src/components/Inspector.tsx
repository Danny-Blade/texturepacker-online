'use client';

import { useCallback, useMemo, useState } from 'react';
import SpriteMetadataEditor from './SpriteMetadataEditor';
import { getTranslations, type Locale } from '@/lib/i18n';
import { useTpStore, type BackgroundMode, type InspectorSectionState } from '@/lib/store';
import { summarizeSelection } from '@/lib/spriteTree';
import type {
  ExportFormat,
  ImageItem,
  PackedItem,
  PackingAlgorithm,
  SpriteEffects,
  TrimMode,
} from '@/lib/packer';

interface InspectorProps {
  locale: Locale;
}

import { FORMATS, ALL_EXPORT_FORMATS } from '@/lib/formats';

const ALGORITHMS: PackingAlgorithm[] = [
  'maxrects-best',
  'maxrects-bssf',
  'maxrects-blsf',
  'maxrects-baf',
  'maxrects-bl',
  'maxrects-cp',
  'shelf',
];

const EXPORT_FORMATS: ExportFormat[] = ALL_EXPORT_FORMATS;

const SIZE_OPTIONS = [256, 512, 1024, 2048, 4096, 8192] as const;

const FORMAT_EXT: Record<ExportFormat, string> = Object.fromEntries(
  ALL_EXPORT_FORMATS.map((fmt) => [fmt, FORMATS[fmt].extension]),
) as Record<ExportFormat, string>;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s ease',
      }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

interface SectionProps {
  title: string;
  sectionKey: keyof InspectorSectionState;
  open: boolean;
  children: React.ReactNode;
}

function Section({ title, sectionKey, open, children }: SectionProps) {
  const toggleInspectorSection = useTpStore((s) => s.toggleInspectorSection);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => toggleInspectorSection(sectionKey)}
        className="flex h-8 items-center justify-between border-b border-[var(--tp-border)] bg-[var(--tp-bg-elev)] px-3 hover:bg-[var(--tp-panel-2)] cursor-pointer"
      >
        <div className="flex items-center gap-2 text-[var(--tp-text)]">
          <ChevronIcon open={open} />
          <span className="text-xs font-medium uppercase tracking-wide">
            {title}
          </span>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-b border-[var(--tp-border)] px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <div className="tp-label mb-1.5">{label}</div>
      {children}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer text-xs text-[var(--tp-text)]">
      <span>{label}</span>
      <span className="relative inline-block w-9 h-5">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <span className="absolute inset-0 rounded-full bg-[var(--tp-panel-2)] peer-checked:bg-[var(--tp-accent)] transition" />
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

interface TrimSegmentedProps {
  value: TrimMode;
  onChange: (m: TrimMode) => void;
  labels: { none: string; trim: string; cropKeep: string; cropFlush: string; outline: string };
}

function TrimSegmented({ value, onChange, labels }: TrimSegmentedProps) {
  const modes: { key: TrimMode; label: string }[] = [
    { key: 'none', label: labels.none },
    { key: 'trim', label: labels.trim },
    { key: 'crop-keep-position', label: labels.cropKeep },
    { key: 'crop-flush', label: labels.cropFlush },
    { key: 'polygon-outline', label: labels.outline },
  ];
  return (
    <div className="grid grid-cols-1 gap-0.5 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0.5">
      {modes.map((m) => {
        const active = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={`h-6 rounded text-[11px] transition ${
              active
                ? 'bg-[var(--tp-accent)] text-white'
                : 'text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

interface BgSegmentedProps {
  value: BackgroundMode;
  onChange: (m: BackgroundMode) => void;
  labels: { checker: string; solid: string; transparent: string };
}

function BgSegmented({ value, onChange, labels }: BgSegmentedProps) {
  const modes: { key: BackgroundMode; label: string }[] = [
    { key: 'checker', label: labels.checker },
    { key: 'solid', label: labels.solid },
    { key: 'transparent', label: labels.transparent },
  ];
  return (
    <div className="grid grid-cols-3 gap-0 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0.5">
      {modes.map((m) => {
        const active = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={`h-6 rounded text-[11px] transition ${
              active
                ? 'bg-[var(--tp-accent)] text-white'
                : 'text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function humanizePixels(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MP`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KP`;
  return `${n} px`;
}

function splitFolderBase(name: string): { folder: string; base: string } {
  const idx = name.lastIndexOf('/');
  if (idx < 0) return { folder: '', base: name };
  return { folder: name.slice(0, idx), base: name.slice(idx + 1) };
}

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

interface KvRowProps {
  label: string;
  children: React.ReactNode;
}

function KvRow({ label, children }: KvRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="tp-label">{label}</div>
      <div className="text-right text-xs font-mono text-[var(--tp-text)]">
        {children}
      </div>
    </div>
  );
}

interface SpriteDetailProps {
  sprite: ImageItem;
  packed: PackedItem | undefined;
  failed: boolean;
  isRenaming: boolean;
  labels: {
    spriteName: string;
    sourceSize: string;
    pixels: string;
    packFrame: string;
    rotated: string;
    rotatedYes: string;
    rotatedNo: string;
    placement: string;
    placementPacked: string;
    placementFailed: string;
    placementNone: string;
    trimmed: string;
    trimmedOff: string;
    actionRename: string;
    actionRemove: string;
    rootFolder: string;
  };
}

function RenameInput({
  sprite,
}: {
  sprite: ImageItem;
}) {
  const startRename = useTpStore((s) => s.startRename);
  const renameImage = useTpStore((s) => s.renameImage);
  const [draft, setDraft] = useState(sprite.name);

  const onInputMount = useCallback((el: HTMLInputElement | null) => {
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      startRename(null);
      return;
    }
    if (trimmed !== sprite.name) {
      renameImage(sprite.id, trimmed);
    } else {
      startRename(null);
    }
  }, [draft, renameImage, sprite.id, sprite.name, startRename]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        startRename(null);
      }
    },
    [commit, startRename],
  );

  return (
    <input
      ref={onInputMount}
      type="text"
      className="tp-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
    />
  );
}

function SpriteDetail({
  sprite,
  packed,
  failed,
  isRenaming,
  labels,
}: SpriteDetailProps) {
  const startRename = useTpStore((s) => s.startRename);
  const removeImages = useTpStore((s) => s.removeImages);
  const { folder, base } = splitFolderBase(sprite.name);

  const frameW = packed ? (packed.rotated ? packed.height : packed.width) : 0;
  const frameH = packed ? (packed.rotated ? packed.width : packed.height) : 0;

  let placementLabel = labels.placementNone;
  let placementClass = 'text-[var(--tp-text-muted)]';
  if (packed) {
    placementLabel = labels.placementPacked;
    placementClass = 'text-[var(--tp-success)]';
  } else if (failed) {
    placementLabel = labels.placementFailed;
    placementClass = 'text-[var(--tp-danger)]';
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-sm border border-[var(--tp-border)] bg-[var(--tp-bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sprite.url}
            alt={base}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {isRenaming ? (
            <RenameInput sprite={sprite} />
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => startRename(sprite.id)}
                className="min-w-0 flex-1 truncate text-left text-xs text-[var(--tp-text)] hover:text-[var(--tp-accent)]"
                title={labels.actionRename}
              >
                {base}
              </button>
              <button
                type="button"
                onClick={() => startRename(sprite.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-accent)]"
                title={labels.actionRename}
                aria-label={labels.actionRename}
              >
                <PencilIcon />
              </button>
            </div>
          )}
          {folder && (
            <div className="truncate font-mono text-[10px] text-[var(--tp-text-dim)]">
              {folder}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <KvRow label={labels.sourceSize}>
          {sprite.width} × {sprite.height}
        </KvRow>
        <KvRow label={labels.pixels}>
          {humanizePixels(sprite.width * sprite.height)}
        </KvRow>
        <KvRow label={labels.packFrame}>
          {packed ? (
            <>
              {packed.x}, {packed.y}
              <span className="text-[var(--tp-text-muted)]">
                {' · '}
                {frameW} × {frameH}
              </span>
            </>
          ) : (
            <span className="text-[var(--tp-text-muted)]">—</span>
          )}
        </KvRow>
        <KvRow label={labels.rotated}>
          {packed && packed.rotated ? (
            <span className="text-[var(--tp-accent)]">{labels.rotatedYes}</span>
          ) : (
            <span className="text-[var(--tp-text-muted)]">{labels.rotatedNo}</span>
          )}
        </KvRow>
        <KvRow label={labels.placement}>
          <span className={placementClass}>{placementLabel}</span>
        </KvRow>
        <KvRow label={labels.trimmed}>
          <span className="text-[var(--tp-text-muted)]">{labels.trimmedOff}</span>
        </KvRow>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="tp-btn flex-1"
          onClick={() => startRename(sprite.id)}
        >
          {labels.actionRename}
        </button>
        <button
          type="button"
          className="tp-btn flex-1"
          onClick={() => removeImages([sprite.id])}
        >
          {labels.actionRemove}
        </button>
      </div>
    </div>
  );
}

interface SpritesSummaryProps {
  count: number;
  totalPixels: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  paths: string[];
  onSelectInverse: () => void;
  onRemoveAll: () => void;
  labels: {
    spritesSelected: string;
    totalPixels: string;
    minSize: string;
    maxSize2: string;
    folders: string;
    foldersCount: string;
    rootFolder: string;
    actionSelectInverse: string;
    actionRemoveAll: string;
  };
}

function SpritesSummary({
  count,
  totalPixels,
  minW,
  minH,
  maxW,
  maxH,
  paths,
  onSelectInverse,
  onRemoveAll,
  labels,
}: SpritesSummaryProps) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-[var(--tp-text)]">
        {formatTemplate(labels.spritesSelected, { n: count })}
      </div>
      <div className="space-y-1.5">
        <KvRow label={labels.totalPixels}>{humanizePixels(totalPixels)}</KvRow>
        <KvRow label={labels.minSize}>
          {minW} × {minH}
        </KvRow>
        <KvRow label={labels.maxSize2}>
          {maxW} × {maxH}
        </KvRow>
        <div className="flex items-baseline justify-between gap-2">
          <div className="tp-label">{labels.folders}</div>
          {paths.length <= 3 ? (
            <div className="flex flex-wrap justify-end gap-1">
              {paths.map((p) => (
                <span
                  key={p}
                  className="rounded-sm bg-[var(--tp-bg-elev)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--tp-text-muted)]"
                >
                  {p === '' ? labels.rootFolder : p}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-right text-xs font-mono text-[var(--tp-text)]">
              {formatTemplate(labels.foldersCount, { n: paths.length })}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="tp-btn flex-1" onClick={onSelectInverse}>
          {labels.actionSelectInverse}
        </button>
        <button type="button" className="tp-btn flex-1" onClick={onRemoveAll}>
          {labels.actionRemoveAll}
        </button>
      </div>
    </div>
  );
}

interface EffectsControlsProps {
  effects: SpriteEffects | undefined;
  setEffects: (next: SpriteEffects | undefined) => void;
  labels: {
    outline: string;
    outlineWidth: string;
    outlineColor: string;
    dropShadow: string;
    shadowOffset: string;
    shadowBlur: string;
    shadowColor: string;
    shadowOpacity: string;
    tint: string;
    tintMode: string;
    tintMultiply: string;
    tintOverlay: string;
    tintScreen: string;
    tintColor: string;
    tintOpacity: string;
  };
}

function patchEffects(
  current: SpriteEffects | undefined,
  patch: Partial<SpriteEffects>,
): SpriteEffects | undefined {
  const merged: SpriteEffects = { ...(current ?? {}) };
  if ('outline' in patch) {
    if (patch.outline === undefined) delete merged.outline;
    else merged.outline = patch.outline;
  }
  if ('dropShadow' in patch) {
    if (patch.dropShadow === undefined) delete merged.dropShadow;
    else merged.dropShadow = patch.dropShadow;
  }
  if ('tint' in patch) {
    if (patch.tint === undefined) delete merged.tint;
    else merged.tint = patch.tint;
  }
  if (!merged.outline && !merged.dropShadow && !merged.tint) return undefined;
  return merged;
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function EffectsControls({ effects, setEffects, labels }: EffectsControlsProps) {
  const outline = effects?.outline;
  const dropShadow = effects?.dropShadow;
  const tint = effects?.tint;

  const setOutlineEnabled = (on: boolean) => {
    setEffects(
      patchEffects(effects, {
        outline: on ? { width: 2, color: '#ffffff' } : undefined,
      }),
    );
  };
  const setShadowEnabled = (on: boolean) => {
    setEffects(
      patchEffects(effects, {
        dropShadow: on
          ? { offsetX: 2, offsetY: 2, blur: 4, color: '#000000', opacity: 50 }
          : undefined,
      }),
    );
  };
  const setTintEnabled = (on: boolean) => {
    setEffects(
      patchEffects(effects, {
        tint: on ? { mode: 'multiply', color: '#ffffff', opacity: 50 } : undefined,
      }),
    );
  };

  return (
    <div className="space-y-4">
      {/* Outline */}
      <div className="space-y-2">
        <ToggleRow
          label={labels.outline}
          value={Boolean(outline)}
          onChange={setOutlineEnabled}
        />
        {outline && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {labels.outlineWidth}
              </div>
              <input
                type="number"
                min={1}
                max={16}
                className="tp-input tp-num"
                value={outline.width}
                onChange={(e) =>
                  setEffects(
                    patchEffects(effects, {
                      outline: { ...outline, width: clampInt(Number(e.target.value), 1, 16) },
                    }),
                  )
                }
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {labels.outlineColor}
              </div>
              <input
                type="color"
                className="h-7 w-full cursor-pointer rounded border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0"
                value={outline.color}
                onChange={(e) =>
                  setEffects(
                    patchEffects(effects, {
                      outline: { ...outline, color: e.target.value },
                    }),
                  )
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Drop Shadow */}
      <div className="space-y-2">
        <ToggleRow
          label={labels.dropShadow}
          value={Boolean(dropShadow)}
          onChange={setShadowEnabled}
        />
        {dropShadow && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                  {labels.shadowOffset} X
                </div>
                <input
                  type="number"
                  min={-32}
                  max={32}
                  className="tp-input tp-num"
                  value={dropShadow.offsetX}
                  onChange={(e) =>
                    setEffects(
                      patchEffects(effects, {
                        dropShadow: {
                          ...dropShadow,
                          offsetX: clampInt(Number(e.target.value), -32, 32),
                        },
                      }),
                    )
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                  {labels.shadowOffset} Y
                </div>
                <input
                  type="number"
                  min={-32}
                  max={32}
                  className="tp-input tp-num"
                  value={dropShadow.offsetY}
                  onChange={(e) =>
                    setEffects(
                      patchEffects(effects, {
                        dropShadow: {
                          ...dropShadow,
                          offsetY: clampInt(Number(e.target.value), -32, 32),
                        },
                      }),
                    )
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                  {labels.shadowBlur}
                </div>
                <input
                  type="number"
                  min={0}
                  max={32}
                  className="tp-input tp-num"
                  value={dropShadow.blur}
                  onChange={(e) =>
                    setEffects(
                      patchEffects(effects, {
                        dropShadow: {
                          ...dropShadow,
                          blur: clampInt(Number(e.target.value), 0, 32),
                        },
                      }),
                    )
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                  {labels.shadowColor}
                </div>
                <input
                  type="color"
                  className="h-7 w-full cursor-pointer rounded border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0"
                  value={dropShadow.color}
                  onChange={(e) =>
                    setEffects(
                      patchEffects(effects, {
                        dropShadow: { ...dropShadow, color: e.target.value },
                      }),
                    )
                  }
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] text-[var(--tp-text-dim)]">
                  {labels.shadowOpacity}
                </span>
                <span className="text-[10px] tabular-nums text-[var(--tp-text)]">
                  {dropShadow.opacity}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={dropShadow.opacity}
                onChange={(e) =>
                  setEffects(
                    patchEffects(effects, {
                      dropShadow: {
                        ...dropShadow,
                        opacity: clampInt(Number(e.target.value), 0, 100),
                      },
                    }),
                  )
                }
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tint */}
      <div className="space-y-2">
        <ToggleRow label={labels.tint} value={Boolean(tint)} onChange={setTintEnabled} />
        {tint && (
          <div className="space-y-2">
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {labels.tintMode}
              </div>
              <select
                className="tp-input"
                value={tint.mode}
                onChange={(e) =>
                  setEffects(
                    patchEffects(effects, {
                      tint: {
                        ...tint,
                        mode: e.target.value as 'multiply' | 'overlay' | 'screen',
                      },
                    }),
                  )
                }
              >
                <option value="multiply">{labels.tintMultiply}</option>
                <option value="overlay">{labels.tintOverlay}</option>
                <option value="screen">{labels.tintScreen}</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {labels.tintColor}
              </div>
              <input
                type="color"
                className="h-7 w-full cursor-pointer rounded border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0"
                value={tint.color}
                onChange={(e) =>
                  setEffects(
                    patchEffects(effects, {
                      tint: { ...tint, color: e.target.value },
                    }),
                  )
                }
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] text-[var(--tp-text-dim)]">
                  {labels.tintOpacity}
                </span>
                <span className="text-[10px] tabular-nums text-[var(--tp-text)]">
                  {tint.opacity}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={tint.opacity}
                onChange={(e) =>
                  setEffects(
                    patchEffects(effects, {
                      tint: {
                        ...tint,
                        opacity: clampInt(Number(e.target.value), 0, 100),
                      },
                    }),
                  )
                }
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Inspector({ locale }: InspectorProps) {
  const t = getTranslations(locale);

  const sections = useTpStore((s) => s.inspectorSections);
  const fileName = useTpStore((s) => s.fileName);
  const setFileName = useTpStore((s) => s.setFileName);
  const exportFormat = useTpStore((s) => s.exportFormat);
  const setExportFormat = useTpStore((s) => s.setExportFormat);
  const settings = useTpStore((s) => s.settings);
  const setSettings = useTpStore((s) => s.setSettings);
  const bgMode = useTpStore((s) => s.bgMode);
  const setBgMode = useTpStore((s) => s.setBgMode);
  const bgColor = useTpStore((s) => s.bgColor);
  const setBgColor = useTpStore((s) => s.setBgColor);
  const images = useTpStore((s) => s.images);
  const packResult = useTpStore((s) => s.packResult);
  const selectedIds = useTpStore((s) => s.selectedIds);
  const renamingId = useTpStore((s) => s.renamingId);
  const selectImages = useTpStore((s) => s.selectImages);
  const removeImages = useTpStore((s) => s.removeImages);
  const updateSpriteMetadata = useTpStore((s) => s.updateSpriteMetadata);

  const selected = useMemo(() => {
    const set = new Set(selectedIds);
    return images.filter((i) => set.has(i.id));
  }, [images, selectedIds]);

  const selectedSummary = useMemo(
    () => (selected.length > 1 ? summarizeSelection(images, selectedIds) : null),
    [images, selectedIds, selected.length],
  );

  const packedMap = useMemo(() => {
    const m = new Map<string, PackedItem>();
    if (packResult) {
      for (const p of packResult.packed) m.set(p.id, p);
    }
    return m;
  }, [packResult]);

  const failedSet = useMemo(() => {
    const s = new Set<string>();
    if (packResult) {
      for (const f of packResult.failed) s.add(f.id);
    }
    return s;
  }, [packResult]);

  const dataExt = FORMAT_EXT[exportFormat];
  const dataFileName = `${fileName}.${dataExt}`;

  const onSelectInverse = useCallback(() => {
    const sel = new Set(selectedIds);
    selectImages(images.filter((i) => !sel.has(i.id)).map((i) => i.id));
  }, [images, selectedIds, selectImages]);

  const onRemoveAllSelected = useCallback(() => {
    const n = selectedIds.length;
    if (n === 0) return;
    const msg = formatTemplate(t.inspector.confirmRemoveN, { n });
    if (typeof window !== 'undefined' && window.confirm(msg)) {
      removeImages(selectedIds);
    }
  }, [removeImages, selectedIds, t.inspector.confirmRemoveN]);

  const onAlgorithmChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSettings({ algorithm: e.target.value as PackingAlgorithm });
    },
    [setSettings],
  );

  const onMaxWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSettings({ maxWidth: Number(e.target.value) });
    },
    [setSettings],
  );

  const onMaxHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSettings({ maxHeight: Number(e.target.value) });
    },
    [setSettings],
  );

  const onBorderPaddingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(0, Math.min(32, Number(e.target.value) || 0));
      setSettings({ borderPadding: v });
    },
    [setSettings],
  );

  const onShapePaddingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(0, Math.min(32, Number(e.target.value) || 0));
      setSettings({ shapePadding: v });
    },
    [setSettings],
  );

  const onInnerPaddingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(0, Math.min(32, Number(e.target.value) || 0));
      setSettings({ innerPadding: v });
    },
    [setSettings],
  );

  const onExtrudeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(0, Math.min(16, Number(e.target.value) || 0));
      setSettings({ extrude: v });
    },
    [setSettings],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--tp-panel)] text-[var(--tp-text)]">
      <div className="flex h-8 shrink-0 items-center border-b border-[var(--tp-border)] px-2">
        <span className="text-xs uppercase tracking-wider text-[var(--tp-text-muted)]">
          {t.panels.inspector}
        </span>
      </div>

      <Section
        title={t.inspector.output}
        sectionKey="output"
        open={sections.output}
      >
        <Field label={t.inspector.textureFormat}>
          <select className="tp-input" value="png-32" disabled>
            <option value="png-32">PNG-32</option>
          </select>
        </Field>

        <Field label={t.inspector.imageFile}>
          <div className="relative">
            <input
              type="text"
              className="tp-input pr-12"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--tp-text-muted)]">
              .png
            </span>
          </div>
        </Field>

        <Field label={t.inspector.dataFile}>
          <span className="block rounded border border-[var(--tp-border)] bg-[var(--tp-bg)] px-2 py-1 font-mono text-xs text-[var(--tp-text-muted)]">
            {dataFileName}
          </span>
        </Field>
      </Section>

      <Section
        title={t.inspector.data}
        sectionKey="data"
        open={sections.data}
      >
        <Field label={t.inspector.dataFormat}>
          <select
            className="tp-input"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            {EXPORT_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {t.formats[fmt]}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title={t.inspector.layout}
        sectionKey="layout"
        open={sections.layout}
      >
        <Field label={t.inspector.algorithm}>
          <select
            className="tp-input"
            value={settings.algorithm}
            onChange={onAlgorithmChange}
          >
            {ALGORITHMS.map((alg) => (
              <option key={alg} value={alg}>
                {t.algorithms[alg]}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t.inspector.packMode}>
          <select
            className="tp-input"
            value={settings.packMode ?? 'good'}
            onChange={(e) =>
              setSettings({ packMode: e.target.value as 'fast' | 'good' | 'best' })
            }
          >
            <option value="fast">{t.inspector.packFast}</option>
            <option value="good">{t.inspector.packGood}</option>
            <option value="best">{t.inspector.packBest}</option>
          </select>
        </Field>

        <Field label={t.inspector.sizeMode}>
          <select
            className="tp-input"
            value={settings.sizeMode ?? 'max'}
            onChange={(e) => setSettings({ sizeMode: e.target.value as 'max' | 'fixed' })}
          >
            <option value="max">{t.inspector.sizeModeMax}</option>
            <option value="fixed">{t.inspector.sizeModeFixed}</option>
          </select>
        </Field>

        <Field label={t.inspector.sizeConstraint}>
          <select
            className="tp-input"
            value={settings.sizeConstraint ?? (settings.powerOfTwo ? 'pot' : 'any')}
            onChange={(e) =>
              setSettings({
                sizeConstraint: e.target.value as 'pot' | 'any' | 'multiple-of-4' | 'word-aligned',
              })
            }
          >
            <option value="pot">{t.inspector.powerOfTwo}</option>
            <option value="any">{t.inspector.sizeAny}</option>
            <option value="multiple-of-4">{t.inspector.sizeMultiple4}</option>
            <option value="word-aligned">{t.inspector.sizeWordAligned}</option>
          </select>
        </Field>

        <div>
          <div className="tp-label mb-1.5">{t.inspector.maxSize}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {t.inspector.width}
              </div>
              <select
                className="tp-input"
                value={settings.maxWidth}
                onChange={onMaxWidthChange}
              >
                {SIZE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {t.inspector.height}
              </div>
              <select
                className="tp-input"
                value={settings.maxHeight}
                onChange={onMaxHeightChange}
              >
                {SIZE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <Field label={t.inspector.borderPadding}>
          <input
            type="number"
            min={0}
            max={32}
            className="tp-input tp-num"
            value={settings.borderPadding}
            onChange={onBorderPaddingChange}
          />
        </Field>

        <Field label={t.inspector.shapePadding}>
          <input
            type="number"
            min={0}
            max={32}
            className="tp-input tp-num"
            value={settings.shapePadding}
            onChange={onShapePaddingChange}
          />
        </Field>

        <Field label={t.inspector.innerPadding}>
          <input
            type="number"
            min={0}
            max={32}
            className="tp-input tp-num"
            value={settings.innerPadding ?? 0}
            onChange={onInnerPaddingChange}
          />
        </Field>

        <Field label={t.inspector.extrude}>
          <input
            type="number"
            min={0}
            max={16}
            className="tp-input tp-num"
            value={settings.extrude}
            onChange={onExtrudeChange}
          />
        </Field>

        <ToggleRow
          label={t.inspector.allowRotation}
          value={settings.allowRotation}
          onChange={(v) => setSettings({ allowRotation: v })}
        />
        <ToggleRow
          label={t.inspector.forceSquare}
          value={settings.forceSquare}
          onChange={(v) => setSettings({ forceSquare: v })}
        />
        <ToggleRow
          label={t.inspector.multipack}
          value={settings.multipack}
          onChange={(v) => setSettings({ multipack: v })}
        />
        <ToggleRow
          label={t.inspector.polygonPacking}
          value={settings.polygonPacking ?? false}
          onChange={(v) => setSettings({ polygonPacking: v })}
        />
        <ToggleRow
          label={t.inspector.exportMesh}
          value={settings.exportMesh ?? false}
          onChange={(v) => setSettings({ exportMesh: v })}
        />
        <Field label={t.inspector.multipackMode}>
          <select
            className="tp-input"
            value={settings.multipackMode ?? 'auto'}
            onChange={(e) =>
              setSettings({
                multipack: true,
                multipackMode: e.target.value as 'auto' | 'manual',
              })
            }
          >
            <option value="auto">{t.inspector.multipackAuto}</option>
            <option value="manual">{t.inspector.multipackManual}</option>
          </select>
        </Field>
        {settings.multipackMode === 'manual' && (
          <div className="space-y-2 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-2">
            <div className="tp-label">{t.inspector.manualSheets}</div>
            {(settings.manualSheets ?? []).map((sheet) => (
              <div key={sheet.id} className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--tp-text)]">{sheet.name}</span>
                <button
                  type="button"
                  className="tp-btn h-6 px-2 text-[10px]"
                  onClick={() => {
                    const name = window.prompt(t.inspector.renameSheet, sheet.name)?.trim();
                    if (!name) return;
                    setSettings({
                      manualSheets: (settings.manualSheets ?? []).map((item) =>
                        item.id === sheet.id ? { ...item, name } : item),
                    });
                  }}
                >
                  {t.inspector.renameSheet}
                </button>
                <button
                  type="button"
                  className="tp-btn h-6 px-2 text-[10px]"
                  disabled={(settings.manualSheets?.length ?? 0) <= 1}
                  onClick={() =>
                    setSettings({
                      manualSheets: (settings.manualSheets ?? []).filter((item) => item.id !== sheet.id),
                    })
                  }
                >
                  {t.inspector.deleteSheet}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="tp-btn w-full text-xs"
              onClick={() => {
                const sheets = settings.manualSheets ?? [];
                const name = window.prompt(t.inspector.addSheet, `Sheet ${sheets.length + 1}`)?.trim();
                if (!name) return;
                setSettings({
                  manualSheets: [...sheets, { id: `sheet-${Date.now()}`, name }],
                });
              }}
            >
              {t.inspector.addSheet}
            </button>
            {selectedIds.length > 0 && (settings.manualSheets?.length ?? 0) > 0 && (
              <Field label={t.inspector.assignSheet}>
                <select
                  className="tp-input"
                  value={
                    selected.length > 0 && selected.every((item) =>
                      item.metadata?.manualSheetId === selected[0].metadata?.manualSheetId)
                      ? selected[0].metadata?.manualSheetId ?? settings.manualSheets?.[0]?.id
                      : ''
                  }
                  onChange={(e) => updateSpriteMetadata(selectedIds, { manualSheetId: e.target.value })}
                >
                  <option value="" disabled>—</option>
                  {(settings.manualSheets ?? []).map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>{sheet.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
        <ToggleRow
          label={t.inspector.aliasDuplicates}
          value={settings.aliasDuplicates ?? false}
          onChange={(value) => setSettings({ aliasDuplicates: value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t.inspector.commonDivisorX}>
            <input
              type="number"
              min={1}
              max={256}
              className="tp-input tp-num"
              value={settings.commonDivisorX ?? 1}
              onChange={(e) => setSettings({ commonDivisorX: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label={t.inspector.commonDivisorY}>
            <input
              type="number"
              min={1}
              max={256}
              className="tp-input tp-num"
              value={settings.commonDivisorY ?? 1}
              onChange={(e) => setSettings({ commonDivisorY: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
        </div>
        <div>
          <div className="tp-label mb-1.5">{t.inspector.trimMode}</div>
          <TrimSegmented
            value={settings.trimMode}
            onChange={(m) =>
              setSettings({ trimMode: m, trimAlpha: m !== 'none' })
            }
            labels={{
              none: t.inspector.trimNone,
              trim: t.inspector.trimStandard,
              cropKeep: t.inspector.cropKeepPosition,
              cropFlush: t.inspector.cropFlush,
              outline: t.inspector.trimPolygon,
            }}
          />
          {settings.trimMode !== 'none' && (
            <div className="mt-2">
              <div className="tp-label mb-1.5">{t.inspector.trimMargin}</div>
              <input
                type="number"
                min={0}
                max={64}
                className="tp-input tp-num"
                value={settings.trimMargin ?? 0}
                onChange={(e) =>
                  setSettings({ trimMargin: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                }
              />
            </div>
          )}
          {settings.trimMode === 'polygon-outline' && (
            <div className="mt-2">
              <div className="tp-label mb-1.5">{t.inspector.polygonTolerance}</div>
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                className="tp-input tp-num"
                value={settings.polygonTolerance}
                onChange={(e) => {
                  const v = Math.max(0.5, Math.min(10, Number(e.target.value) || 0.5));
                  setSettings({ polygonTolerance: v });
                }}
              />
            </div>
          )}
        </div>

        <div>
          <div className="tp-label mb-1.5">{t.inspector.alphaHandling}</div>
          <div className="grid grid-cols-4 gap-0.5 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0.5">
            {([
              ['keep', t.inspector.alphaKeep],
              ['clear', t.inspector.alphaClear],
              ['bleed', t.inspector.alphaBleed],
              ['premultiply', t.inspector.alphaPremul],
            ] as const).map(([key, label]) => {
              const active = (settings.alphaHandling ?? 'keep') === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSettings({ alphaHandling: key })}
                  className={`h-6 rounded text-[11px] transition ${
                    active
                      ? 'bg-[var(--tp-accent)] text-white'
                      : 'text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {(settings.alphaHandling ?? 'keep') === 'bleed' && (
            <div className="mt-2">
              <div className="tp-label mb-1.5">{t.inspector.alphaBleedIterations}</div>
              <input
                type="number"
                min={1}
                max={16}
                className="tp-input tp-num"
                value={settings.alphaBleedIterations ?? 4}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(16, Math.floor(Number(e.target.value) || 1)));
                  setSettings({ alphaBleedIterations: v });
                }}
              />
            </div>
          )}
        </div>

        <div>
          <ToggleRow
            label={t.inspector.normalMapPairing}
            value={settings.normalMapPairing ?? false}
            onChange={(v) => setSettings({ normalMapPairing: v })}
          />
          {(settings.normalMapPairing ?? false) && (
            <div className="mt-2 space-y-2">
              <div className="tp-label">{t.inspector.normalMapSuffixes}</div>
              <input
                type="text"
                className="tp-input font-mono"
                value={(settings.normalMapSuffixes ?? ['_n', '_nrm', '_normal']).join(',')}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                  setSettings({ normalMapSuffixes: parts });
                }}
              />
              <div className="text-[10px] text-[var(--tp-text-dim)]">
                {t.inspector.normalMapHint}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="tp-label mb-1.5">{t.inspector.backgroundColor}</div>
          <BgSegmented
            value={bgMode}
            onChange={setBgMode}
            labels={{
              checker: t.canvas.bgChecker,
              solid: t.canvas.bgSolid,
              transparent: t.canvas.bgTransparent,
            }}
          />
          {bgMode === 'solid' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="tp-input flex-1 font-mono"
              />
            </div>
          )}
        </div>
      </Section>

      <Section
        title={t.inspector.effects}
        sectionKey="effects"
        open={sections.effects}
      >
        <EffectsControls
          effects={settings.effects}
          setEffects={(next) => setSettings({ effects: next })}
          labels={{
            outline: t.inspector.outline,
            outlineWidth: t.inspector.outlineWidth,
            outlineColor: t.inspector.outlineColor,
            dropShadow: t.inspector.dropShadow,
            shadowOffset: t.inspector.shadowOffset,
            shadowBlur: t.inspector.shadowBlur,
            shadowColor: t.inspector.shadowColor,
            shadowOpacity: t.inspector.shadowOpacity,
            tint: t.inspector.tint,
            tintMode: t.inspector.tintMode,
            tintMultiply: t.inspector.tintMultiply,
            tintOverlay: t.inspector.tintOverlay,
            tintScreen: t.inspector.tintScreen,
            tintColor: t.inspector.tintColor,
            tintOpacity: t.inspector.tintOpacity,
          }}
        />
      </Section>

      <Section
        title={t.inspector.sprites}
        sectionKey="sprites"
        open={sections.sprites}
      >
        {selected.length === 0 && (
          <div className="text-xs text-[var(--tp-text-muted)]">
            {t.inspector.selectDetail}
          </div>
        )}
        {selected.length === 1 && (
          <SpriteDetail
            sprite={selected[0]}
            packed={packedMap.get(selected[0].id)}
            failed={failedSet.has(selected[0].id)}
            isRenaming={renamingId === selected[0].id}
            labels={{
              spriteName: t.inspector.spriteName,
              sourceSize: t.inspector.sourceSize,
              pixels: t.inspector.pixels,
              packFrame: t.inspector.packFrame,
              rotated: t.inspector.rotated,
              rotatedYes: t.inspector.rotatedYes,
              rotatedNo: t.inspector.rotatedNo,
              placement: t.inspector.placement,
              placementPacked: t.inspector.placementPacked,
              placementFailed: t.inspector.placementFailed,
              placementNone: t.inspector.placementNone,
              trimmed: t.inspector.trimmed,
              trimmedOff: t.inspector.trimmedOff,
              actionRename: t.inspector.actionRename,
              actionRemove: t.inspector.actionRemove,
              rootFolder: t.inspector.rootFolder,
            }}
          />
        )}
        {selected.length > 1 && selectedSummary && (
          <SpritesSummary
            count={selectedSummary.count}
            totalPixels={selectedSummary.totalPixels}
            minW={selectedSummary.minW}
            minH={selectedSummary.minH}
            maxW={selectedSummary.maxW}
            maxH={selectedSummary.maxH}
            paths={selectedSummary.paths}
            onSelectInverse={onSelectInverse}
            onRemoveAll={onRemoveAllSelected}
            labels={{
              spritesSelected: t.inspector.spritesSelected,
              totalPixels: t.inspector.totalPixels,
              minSize: t.inspector.minSize,
              maxSize2: t.inspector.maxSize2,
              folders: t.inspector.folders,
              foldersCount: t.inspector.foldersCount,
              rootFolder: t.inspector.rootFolder,
              actionSelectInverse: t.inspector.actionSelectInverse,
              actionRemoveAll: t.inspector.actionRemoveAll,
            }}
          />
        )}
        {selected.length > 0 && <SpriteMetadataEditor locale={locale} sprites={selected} />}
      </Section>

      {images.length === 0 && !packResult && (
        <div className="px-3 py-3 text-[11px] italic text-[var(--tp-text-dim)]">
          Add sprites to see live results
        </div>
      )}
    </div>
  );
}
