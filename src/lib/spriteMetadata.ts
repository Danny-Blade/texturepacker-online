/** Per-sprite authoring data shared by the Inspector, project files and exporters. */
export type PivotMode = 'relative' | 'absolute';

export interface SpritePivot {
  /** Relative values are 0..1; absolute values are source-image pixels. */
  mode: PivotMode;
  x: number;
  y: number;
}

/** Projects created before P1-08 stored normalized coordinates without a mode. */
export interface LegacySpritePivot {
  x: number;
  y: number;
}

export interface SliceInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SpriteNineSlice {
  /** Non-stretching edge insets, in source-image pixels. */
  border: SliceInsets;
  /** Content padding, in source-image pixels. */
  content: SliceInsets;
}

export interface SpriteMetadata extends Record<string, unknown> {
  pivot?: SpritePivot | LegacySpritePivot;
  nineSlice?: SpriteNineSlice;
  /** Stable manual multipack assignment. */
  manualSheetId?: string;
}

export interface NormalizedSpriteMetadata extends SpriteMetadata {
  pivot?: SpritePivot;
}

export const DEFAULT_PIVOT: SpritePivot = { mode: 'relative', x: 0.5, y: 0.5 };
export const ZERO_INSETS: SliceInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export function readSpriteMetadata(value: unknown): NormalizedSpriteMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = value as SpriteMetadata;
  const rawPivot = metadata.pivot;
  const normalized = { ...metadata } as NormalizedSpriteMetadata;
  if (rawPivot) {
    normalized.pivot = 'mode' in rawPivot
      ? rawPivot
      : { mode: 'relative', x: rawPivot.x, y: rawPivot.y };
  }
  return normalized;
}

export function clampPivot(pivot: SpritePivot | LegacySpritePivot, width: number, height: number): SpritePivot {
  const mode: PivotMode = 'mode' in pivot ? pivot.mode : 'relative';
  const maxX = mode === 'relative' ? 1 : Math.max(0, width);
  const maxY = mode === 'relative' ? 1 : Math.max(0, height);
  return {
    mode,
    x: Math.max(0, Math.min(maxX, Number.isFinite(pivot.x) ? pivot.x : 0)),
    y: Math.max(0, Math.min(maxY, Number.isFinite(pivot.y) ? pivot.y : 0)),
  };
}

export function resolvePivot(
  metadata: unknown,
  width: number,
  height: number,
): { normalized: { x: number; y: number }; pixels: { x: number; y: number }; authored: SpritePivot } {
  const raw = readSpriteMetadata(metadata).pivot ?? DEFAULT_PIVOT;
  const authored = clampPivot(raw, width, height);
  if (authored.mode === 'absolute') {
    return {
      authored,
      normalized: {
        x: width > 0 ? authored.x / width : 0,
        y: height > 0 ? authored.y / height : 0,
      },
      pixels: { x: authored.x, y: authored.y },
    };
  }
  return {
    authored,
    normalized: { x: authored.x, y: authored.y },
    pixels: { x: authored.x * width, y: authored.y * height },
  };
}

export function clampInsets(insets: SliceInsets, width: number, height: number): SliceInsets {
  const left = clampNonNegative(insets.left, width);
  const right = clampNonNegative(insets.right, Math.max(0, width - left));
  const top = clampNonNegative(insets.top, height);
  const bottom = clampNonNegative(insets.bottom, Math.max(0, height - top));
  return { left, right, top, bottom };
}

export function normalizeNineSlice(
  nineSlice: SpriteNineSlice,
  width: number,
  height: number,
): SpriteNineSlice {
  return {
    border: clampInsets(nineSlice.border, width, height),
    content: clampInsets(nineSlice.content, width, height),
  };
}

export function scaleInsets(insets: SliceInsets, scale: number): SliceInsets {
  return {
    left: Math.round(insets.left * scale),
    right: Math.round(insets.right * scale),
    top: Math.round(insets.top * scale),
    bottom: Math.round(insets.bottom * scale),
  };
}

export interface ExportedSpriteMetadata {
  pivot?: {
    mode: PivotMode;
    x: number;
    y: number;
    normalized: { x: number; y: number };
    pixels: { x: number; y: number };
  };
  nineSlice?: SpriteNineSlice;
}

/** Resolve authored metadata into physical coordinates for one publish scale. */
export function spriteMetadataForExport(
  metadata: unknown,
  sourceWidth: number,
  sourceHeight: number,
  scale = 1,
): ExportedSpriteMetadata | undefined {
  const value = readSpriteMetadata(metadata);
  const output: ExportedSpriteMetadata = {};
  if (value.pivot) {
    const resolved = resolvePivot(value, sourceWidth, sourceHeight);
    output.pivot = {
      ...resolved.authored,
      normalized: resolved.normalized,
      pixels: {
        x: Math.round(resolved.pixels.x * scale * 1e6) / 1e6,
        y: Math.round(resolved.pixels.y * scale * 1e6) / 1e6,
      },
    };
  }
  if (value.nineSlice) {
    const normalized = normalizeNineSlice(value.nineSlice, sourceWidth, sourceHeight);
    output.nineSlice = {
      border: scaleInsets(normalized.border, scale),
      content: scaleInsets(normalized.content, scale),
    };
  }
  return output.pivot || output.nineSlice ? output : undefined;
}

function clampNonNegative(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isInsets(value: unknown): value is SliceInsets {
  return isRecord(value)
    && isFiniteNonNegative(value.left)
    && isFiniteNonNegative(value.right)
    && isFiniteNonNegative(value.top)
    && isFiniteNonNegative(value.bottom);
}

/** Validate known metadata while retaining forward-compatible unknown keys. */
export function isValidSpriteMetadata(value: unknown): value is SpriteMetadata {
  if (!isRecord(value)) return false;
  if (value.pivot !== undefined) {
    if (!isRecord(value.pivot)
      || (value.pivot.mode !== undefined && value.pivot.mode !== 'relative' && value.pivot.mode !== 'absolute')
      || !isFiniteNonNegative(value.pivot.x)
      || !isFiniteNonNegative(value.pivot.y)
      || ((value.pivot.mode === undefined || value.pivot.mode === 'relative') && (value.pivot.x > 1 || value.pivot.y > 1))) {
      return false;
    }
  }
  if (value.nineSlice !== undefined) {
    if (!isRecord(value.nineSlice)
      || !isInsets(value.nineSlice.border)
      || !isInsets(value.nineSlice.content)) {
      return false;
    }
  }
  if (value.manualSheetId !== undefined && typeof value.manualSheetId !== 'string') return false;
  return true;
}
