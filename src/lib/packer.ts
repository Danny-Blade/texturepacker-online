import type { SpriteMetadata } from './spriteMetadata';

// Packing types and algorithms. Phase 3 implementations live in this file.
export interface ImageItem {
  id: string;
  name: string;
  width: number;
  height: number;
  image: HTMLImageElement;
  url: string;
  /** Hash of decoded RGBA pixels used for duplicate alias detection. */
  contentHash?: string;
  /** Forward-compatible per-sprite project data (pivot, 9-slice, tags, etc.). */
  metadata?: SpriteMetadata;
}

export interface TrimInfo {
  trimmed: boolean;
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
}

/** A flat polygon outline in trimmed-sprite coordinates [x0,y0,x1,y1,...]. */
export type SpritePolygon = number[];

export interface SpriteEffects {
  outline?: { width: number; color: string };
  dropShadow?: { offsetX: number; offsetY: number; blur: number; color: string; opacity: number };
  tint?: { mode: 'multiply' | 'overlay' | 'screen'; color: string; opacity: number };
}

export interface PackedItem extends ImageItem {
  x: number;
  y: number;
  rotated: boolean;
  placed: boolean;
  sheetIndex: number;
  trimmed: boolean;
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  pixelSource?: CanvasImageSource;
  extrudePadding?: number;
  polygon?: SpritePolygon;
}

export interface PackSheet {
  index: number;
  id?: string;
  name?: string;
  width: number;
  height: number;
  packed: PackedItem[];
}

export interface PackResult {
  sheets: PackSheet[];
  failed: PackedItem[];
  // primary sheet helpers for backwards-compatible UI consumption:
  packed: PackedItem[];
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PackingAlgorithm =
  | 'maxrects-bssf'
  | 'maxrects-blsf'
  | 'maxrects-baf'
  | 'maxrects-bl'
  | 'maxrects-cp'
  | 'maxrects-best'
  | 'shelf';

export type TrimMode =
  | 'none'
  | 'trim'
  | 'crop-keep-position'
  | 'crop-flush'
  | 'polygon-outline'
  /** Legacy alias migrated to `trim` when projects are loaded. */
  | 'rect';

export type SizeMode = 'max' | 'fixed';
export type SizeConstraint = 'pot' | 'any' | 'multiple-of-4' | 'word-aligned';
export type PackMode = 'fast' | 'good' | 'best';
export interface ManualSheetDefinition { id: string; name: string }

export interface PackerOptions {
  maxWidth: number;
  maxHeight: number;
  /**
   * Legacy combined padding used by projects saved before padding was split.
   * New code must write `shapePadding`; this field is read only as a fallback.
   */
  padding?: number;
  /** Border padding inside the sheet edges. */
  borderPadding: number;
  /** Minimum transparent distance between sprite rectangles. */
  shapePadding: number;
  /** Transparent pixels added to each side of the engine-visible sprite frame. */
  innerPadding?: number;
  allowRotation: boolean;
  powerOfTwo: boolean;
  forceSquare: boolean;
  /** Whether the configured size is a hard output size or only an upper bound. */
  sizeMode?: SizeMode;
  /** Output dimension alignment. `powerOfTwo` remains a legacy alias for `pot`. */
  sizeConstraint?: SizeConstraint;
  /** Packing effort. Best evaluates all MaxRects heuristics. */
  packMode?: PackMode;
  /** Top-left coordinate alignment for packed frames. */
  commonDivisorX?: number;
  commonDivisorY?: number;
  algorithm: PackingAlgorithm;
  trimAlpha: boolean;
  trimThreshold: number; // 0..255 alpha threshold below which a pixel is "empty"
  /** Transparent pixels retained around the detected alpha bounds. */
  trimMargin?: number;
  /** Polygon outline emits mesh metadata but still uses rectangular packing. */
  trimMode: TrimMode;
  /** Tolerance for Douglas-Peucker polygon simplification, in pixels. */
  polygonTolerance: number;
  extrude: number;
  multipack: boolean;
  multipackMode?: 'auto' | 'manual';
  manualSheets?: ManualSheetDefinition[];
  /** Pack byte-identical sprites once while retaining one metadata entry per name. */
  aliasDuplicates?: boolean;
  effects?: SpriteEffects;
}

const HEURISTICS_FOR_BEST: PackingAlgorithm[] = [
  'maxrects-bssf',
  'maxrects-blsf',
  'maxrects-baf',
  'maxrects-bl',
  'maxrects-cp',
];

function rectArea(r: Rect): number {
  return r.width * r.height;
}

export class MaxRectsPacker {
  private maxWidth: number;
  private maxHeight: number;
  private padding: number; // effective shape padding
  private borderPadding: number;
  private allowRotation: boolean;
  private algorithm: PackingAlgorithm;
  private divisorX: number;
  private divisorY: number;
  private freeRects: Rect[] = [];
  private usedRects: Rect[] = [];

  constructor(options: PackerOptions) {
    this.maxWidth = options.maxWidth;
    this.maxHeight = options.maxHeight;
    this.padding = Math.max(options.shapePadding ?? options.padding ?? 0, 0);
    this.borderPadding = Math.max(options.borderPadding ?? 0, 0);
    this.allowRotation = options.allowRotation;
    this.algorithm = options.algorithm;
    this.divisorX = Math.max(1, Math.floor(options.commonDivisorX ?? 1));
    this.divisorY = Math.max(1, Math.floor(options.commonDivisorY ?? 1));
    const bp = this.borderPadding;
    // Shape padding belongs between shapes, not between a shape and the atlas
    // border. Extending the virtual packing area by one padding unit lets the
    // final row/column consume its trailing reservation without reducing the
    // usable atlas area.
    const virtualShapePadding = this.padding;
    this.freeRects = [
      {
        x: bp,
        y: bp,
        width: Math.max(0, this.maxWidth - bp * 2 + virtualShapePadding),
        height: Math.max(0, this.maxHeight - bp * 2 + virtualShapePadding),
      },
    ];
  }

  pack(items: ImageItem[]): PackedItem[] {
    const sorted = items.slice().sort((a, b) => b.width * b.height - a.width * a.height);
    const packed: PackedItem[] = [];

    for (const img of sorted) {
      const paddedW = img.width + this.padding;
      const paddedH = img.height + this.padding;

      let result = this.findBestRect(paddedW, paddedH);
      let rotated = false;

      if (!result && this.allowRotation && img.width !== img.height) {
        result = this.findBestRect(paddedH, paddedW);
        if (result) rotated = true;
      }

      if (result) {
        packed.push({
          ...img,
          x: result.x,
          y: result.y,
          rotated,
          placed: true,
          sheetIndex: 0,
          trimmed: false,
          sourceSize: { w: img.width, h: img.height },
          spriteSourceSize: { x: 0, y: 0, w: img.width, h: img.height },
        });
        this.placeRect(result);
      } else {
        packed.push({
          ...img,
          x: 0,
          y: 0,
          rotated: false,
          placed: false,
          sheetIndex: -1,
          trimmed: false,
          sourceSize: { w: img.width, h: img.height },
          spriteSourceSize: { x: 0, y: 0, w: img.width, h: img.height },
        });
      }
    }

    return packed;
  }

  private findBestRect(width: number, height: number): Rect | null {
    let best: Rect | null = null;
    let bestPrimary = Infinity;
    let bestSecondary = Infinity;

    for (const rect of this.freeRects) {
      const x = Math.ceil(rect.x / this.divisorX) * this.divisorX;
      const y = Math.ceil(rect.y / this.divisorY) * this.divisorY;
      const availableWidth = rect.x + rect.width - x;
      const availableHeight = rect.y + rect.height - y;
      if (availableWidth < width || availableHeight < height) continue;
      const leftoverX = availableWidth - width;
      const leftoverY = availableHeight - height;
      let primary: number;
      let secondary: number;
      switch (this.algorithm) {
        case 'maxrects-blsf':
          primary = Math.max(leftoverX, leftoverY); // long side
          secondary = Math.min(leftoverX, leftoverY);
          break;
        case 'maxrects-baf':
          primary = rectArea(rect) - width * height;
          secondary = Math.min(leftoverX, leftoverY);
          break;
        case 'maxrects-bl':
          primary = rect.y + height;
          secondary = rect.x;
          break;
        case 'maxrects-cp':
          primary = Math.min(leftoverX, leftoverY);
          secondary = rect.x + rect.y;
          break;
        case 'shelf':
          primary = rect.y;
          secondary = rect.x;
          break;
        case 'maxrects-bssf':
        default:
          primary = Math.min(leftoverX, leftoverY);
          secondary = Math.max(leftoverX, leftoverY);
          break;
      }
      if (primary < bestPrimary || (primary === bestPrimary && secondary < bestSecondary)) {
        best = { x, y, width, height };
        bestPrimary = primary;
        bestSecondary = secondary;
      }
    }
    return best;
  }

  private placeRect(rect: Rect): void {
    // Only process nodes that existed before splitting. splitFreeNode may append
    // new nodes, while splice removes the current one; keep the loop bound in
    // sync so an exact-fit placement never reads past the end of the list.
    let nodesToProcess = this.freeRects.length;
    for (let i = 0; i < nodesToProcess; i++) {
      if (this.splitFreeNode(this.freeRects[i], rect)) {
        this.freeRects.splice(i, 1);
        i--;
        nodesToProcess--;
      }
    }
    this.pruneFreeList();
    this.usedRects.push(rect);
  }

  private splitFreeNode(freeNode: Rect, usedNode: Rect): boolean {
    if (
      usedNode.x >= freeNode.x + freeNode.width ||
      usedNode.x + usedNode.width <= freeNode.x ||
      usedNode.y >= freeNode.y + freeNode.height ||
      usedNode.y + usedNode.height <= freeNode.y
    ) {
      return false;
    }
    if (usedNode.x < freeNode.x + freeNode.width && usedNode.x + usedNode.width > freeNode.x) {
      if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.height) {
        const n = { ...freeNode };
        n.height = usedNode.y - n.y;
        this.freeRects.push(n);
      }
      if (usedNode.y + usedNode.height < freeNode.y + freeNode.height) {
        const n = { ...freeNode };
        n.y = usedNode.y + usedNode.height;
        n.height = freeNode.y + freeNode.height - (usedNode.y + usedNode.height);
        this.freeRects.push(n);
      }
    }
    if (usedNode.y < freeNode.y + freeNode.height && usedNode.y + usedNode.height > freeNode.y) {
      if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.width) {
        const n = { ...freeNode };
        n.width = usedNode.x - n.x;
        this.freeRects.push(n);
      }
      if (usedNode.x + usedNode.width < freeNode.x + freeNode.width) {
        const n = { ...freeNode };
        n.x = usedNode.x + usedNode.width;
        n.width = freeNode.x + freeNode.width - (usedNode.x + usedNode.width);
        this.freeRects.push(n);
      }
    }
    return true;
  }

  private pruneFreeList(): void {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        if (this.isContainedIn(this.freeRects[i], this.freeRects[j])) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (this.isContainedIn(this.freeRects[j], this.freeRects[i])) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }

  private isContainedIn(a: Rect, b: Rect): boolean {
    return (
      a.x >= b.x &&
      a.y >= b.y &&
      a.x + a.width <= b.x + b.width &&
      a.y + a.height <= b.y + b.height
    );
  }

  getUsedBounds(): { width: number; height: number } {
    if (this.usedRects.length === 0) return { width: 0, height: 0 };
    let maxX = 0;
    let maxY = 0;
    for (const r of this.usedRects) {
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y + r.height > maxY) maxY = r.y + r.height;
    }
    return {
      width: maxX - this.padding + this.borderPadding,
      height: maxY - this.padding + this.borderPadding,
    };
  }
}

export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

function alignDimension(value: number, constraint: SizeConstraint): number {
  const safe = Math.max(1, Math.ceil(value));
  if (constraint === 'pot') return nextPowerOfTwo(safe);
  if (constraint === 'multiple-of-4') return Math.ceil(safe / 4) * 4;
  if (constraint === 'word-aligned') return Math.ceil(safe / 2) * 2;
  return safe;
}

function resolveSizeConstraint(options: PackerOptions): SizeConstraint {
  return options.sizeConstraint ?? (options.powerOfTwo ? 'pot' : 'any');
}

/**
 * Trim alpha + extrude pipeline. These two functions are stubs that Phase 3
 * (Agent A) replaces with real implementations. Default behaviour: identity.
 */
export interface PreparedSprite {
  item: ImageItem;
  trim: TrimInfo;
  /** the bitmap to draw at publish-time, possibly trimmed + extruded. */
  pixelSource: CanvasImageSource;
  /** effective width/height of the bitmap to place in the atlas (excluding extrude halo). */
  width: number;
  height: number;
  /** number of extrude pixels surrounding the inner frame in pixelSource. */
  extrudePadding?: number;
  /** Optional polygon outline in trimmed-sprite coordinates [x0,y0,x1,y1,...] */
  polygon?: SpritePolygon;
}

export function defaultPrepareSprite(item: ImageItem): PreparedSprite {
  return {
    item,
    trim: {
      trimmed: false,
      sourceSize: { w: item.width, h: item.height },
      spriteSourceSize: { x: 0, y: 0, w: item.width, h: item.height },
    },
    pixelSource: item.image,
    width: item.width,
    height: item.height,
  };
}

export type SpritePreparer = (item: ImageItem, options: PackerOptions) => PreparedSprite;

/**
 * Multi-sheet packing. Iterates packing into a fresh sheet for any items that
 * didn't fit, until all are placed or `multipack` is false (then leftovers are
 * marked `failed`).
 */
export function packIntoSheets(
  items: ImageItem[],
  options: PackerOptions,
  prepare: SpritePreparer = defaultPrepareSprite,
): PackResult {
  if (items.length === 0) {
    return { sheets: [], failed: [], packed: [], width: 0, height: 0 };
  }

  if (options.aliasDuplicates) {
    const representatives: ImageItem[] = [];
    const aliasesByRepresentative = new Map<string, ImageItem[]>();
    const representativeByKey = new Map<string, ImageItem>();
    for (const item of items) {
      const key = `${item.width}x${item.height}:${item.contentHash ?? item.url}`;
      const representative = representativeByKey.get(key);
      if (!representative) {
        representativeByKey.set(key, item);
        representatives.push(item);
      } else {
        const aliases = aliasesByRepresentative.get(representative.id) ?? [];
        aliases.push(item);
        aliasesByRepresentative.set(representative.id, aliases);
      }
    }
    if (representatives.length !== items.length) {
      const base = packIntoSheets(
        representatives,
        { ...options, aliasDuplicates: false },
        prepare,
      );
      const expand = (packed: PackedItem): PackedItem[] => [
        packed,
        ...(aliasesByRepresentative.get(packed.id) ?? []).map((alias) => ({
          ...packed,
          ...alias,
          x: packed.x,
          y: packed.y,
          width: packed.width,
          height: packed.height,
          rotated: packed.rotated,
          placed: packed.placed,
          sheetIndex: packed.sheetIndex,
          trimmed: packed.trimmed,
          sourceSize: packed.sourceSize,
          spriteSourceSize: packed.spriteSourceSize,
          pixelSource: packed.pixelSource,
          extrudePadding: packed.extrudePadding,
          polygon: packed.polygon,
        })),
      ];
      const sheets = base.sheets.map((sheet) => ({
        ...sheet,
        packed: sheet.packed.flatMap(expand),
      }));
      const failed = base.failed.flatMap(expand);
      return {
        ...base,
        sheets,
        failed,
        packed: sheets[0]?.packed ?? [],
      };
    }
  }

  if (options.multipackMode === 'manual' && (options.manualSheets?.length ?? 0) > 0) {
    const definitions = options.manualSheets!;
    const known = new Set(definitions.map((sheet) => sheet.id));
    const fallbackId = definitions[0].id;
    const allSheets: PackSheet[] = [];
    const failed: PackedItem[] = [];
    for (const definition of definitions) {
      const group = items.filter((item) => {
        const assigned = item.metadata?.manualSheetId;
        const effective = typeof assigned === 'string' && known.has(assigned) ? assigned : fallbackId;
        return effective === definition.id;
      });
      if (group.length === 0) continue;
      const result = packIntoSheets(group, {
        ...options,
        multipack: false,
        multipackMode: 'auto',
      }, prepare);
      for (const sheet of result.sheets) {
        const index = allSheets.length;
        allSheets.push({
          ...sheet,
          index,
          id: definition.id,
          name: definition.name,
          packed: sheet.packed.map((item) => ({ ...item, sheetIndex: index })),
        });
      }
      failed.push(...result.failed);
    }
    const primary = allSheets[0];
    return {
      sheets: allSheets,
      failed,
      packed: primary?.packed ?? [],
      width: primary?.width ?? 0,
      height: primary?.height ?? 0,
    };
  }

  // Resolve heuristic (Best = try several, pick smallest total atlas area).
  const algorithmsToTry =
    options.packMode === 'fast'
      ? (['shelf'] as PackingAlgorithm[])
      : options.packMode === 'best' || options.algorithm === 'maxrects-best'
      ? HEURISTICS_FOR_BEST
      : [options.algorithm];

  let bestResult: PackResult | null = null;
  let bestScore = Infinity;

  for (const alg of algorithmsToTry) {
    const attempt = packWithAlgorithm(items, { ...options, algorithm: alg }, prepare);
    const score = attempt.sheets.reduce((s, sh) => s + sh.width * sh.height, 0);
    if (score > 0 && score < bestScore) {
      bestScore = score;
      bestResult = attempt;
    } else if (!bestResult) {
      bestResult = attempt;
    }
  }
  return bestResult!;
}

function packWithAlgorithm(
  items: ImageItem[],
  options: PackerOptions,
  prepare: SpritePreparer,
): PackResult {
  // Prepare (trim + extrude). The prepared bitmap is what goes into the atlas;
  // PreparedSprite.width/height represent the *trimmed* inner frame size; the
  // extrude halo lives only on the prepared bitmap. To make the packer reserve
  // room for that halo without baking it into the engine-visible frame size,
  // we inflate the placement rect by 2*extrudePadding but restore the inner
  // dimensions when building the final PackedItem.
  const prepared: Map<string, PreparedSprite> = new Map();
  const placement: ImageItem[] = [];
  for (const item of items) {
    const p = prepare(item, options);
    prepared.set(item.id, p);
    const ex = p.extrudePadding ?? 0;
    placement.push({ ...item, width: p.width + ex * 2, height: p.height + ex * 2 });
  }

  const sheets: PackSheet[] = [];
  const failed: PackedItem[] = [];
  let remaining = placement;
  let sheetIndex = 0;
  let safety = 64;

  while (remaining.length > 0 && safety-- > 0) {
    const packer = new MaxRectsPacker(options);
    const sheetItems = packer.pack(remaining);

    const placedInThisSheet = sheetItems.filter((s) => s.placed);
    const unplaced = sheetItems.filter((s) => !s.placed);

    if (placedInThisSheet.length === 0) {
      // can't fit even one — mark rest as failed
      for (const u of unplaced) {
        const p = prepared.get(u.id) ?? defaultPrepareSprite(u);
        const ex = p.extrudePadding ?? 0;
        failed.push({
          ...u,
          width: p.width,
          height: p.height,
          sheetIndex: -1,
          trimmed: p.trim.trimmed,
          sourceSize: p.trim.sourceSize,
          spriteSourceSize: p.trim.spriteSourceSize,
          pixelSource: p.pixelSource,
          extrudePadding: ex || undefined,
        });
      }
      break;
    }

    const bounds = packer.getUsedBounds();
    let sheetWidth = bounds.width;
    let sheetHeight = bounds.height;
    const sizeConstraint = resolveSizeConstraint(options);
    sheetWidth = alignDimension(sheetWidth, sizeConstraint);
    sheetHeight = alignDimension(sheetHeight, sizeConstraint);
    if (options.forceSquare) {
      const side = Math.max(sheetWidth, sheetHeight);
      sheetWidth = side;
      sheetHeight = side;
    }
    if (options.sizeMode === 'fixed') {
      sheetWidth = options.maxWidth;
      sheetHeight = options.maxHeight;
      if (options.forceSquare) {
        const side = Math.max(sheetWidth, sheetHeight);
        sheetWidth = side;
        sheetHeight = side;
      }
    }
    sheetWidth = Math.max(sheetWidth, 1);
    sheetHeight = Math.max(sheetHeight, 1);

    const enrichedPacked: PackedItem[] = placedInThisSheet.map((p) => {
      const prep = prepared.get(p.id) ?? defaultPrepareSprite(p);
      const ex = prep.extrudePadding ?? 0;
      return {
        ...p,
        // Offset placement by +ex so that x/y refers to the inner (engine-visible)
        // frame rather than the top-left of the halo region.
        x: p.x + ex,
        y: p.y + ex,
        sheetIndex,
        trimmed: prep.trim.trimmed,
        sourceSize: prep.trim.sourceSize,
        spriteSourceSize: prep.trim.spriteSourceSize,
        pixelSource: prep.pixelSource,
        extrudePadding: ex || undefined,
        // restore the inner trimmed frame dimensions (format generators consume these):
        width: prep.width,
        height: prep.height,
        polygon: prep.polygon,
      };
    });

    sheets.push({
      index: sheetIndex,
      width: sheetWidth,
      height: sheetHeight,
      packed: enrichedPacked,
    });

    if (!options.multipack) {
      for (const u of unplaced) {
        const prep = prepared.get(u.id) ?? defaultPrepareSprite(u);
        const ex = prep.extrudePadding ?? 0;
        failed.push({
          ...u,
          width: prep.width,
          height: prep.height,
          sheetIndex: -1,
          trimmed: prep.trim.trimmed,
          sourceSize: prep.trim.sourceSize,
          spriteSourceSize: prep.trim.spriteSourceSize,
          pixelSource: prep.pixelSource,
          extrudePadding: ex || undefined,
        });
      }
      break;
    }

    remaining = unplaced;
    sheetIndex += 1;
  }

  const primary = sheets[0];
  return {
    sheets,
    failed,
    packed: primary ? primary.packed : [],
    width: primary ? primary.width : 0,
    height: primary ? primary.height : 0,
  };
}

// ---- Re-exports for back-compat with format generators ----
export type ExportFormat =
  | 'json'
  | 'json-array'
  | 'css'
  | 'xml'
  | 'cocos2d'
  | 'phaser3'
  | 'unity'
  | 'spine'
  | 'godot'
  | 'gamemaker'
  | 'pixi'
  | 'libgdx'
  | 'cocos-creator'
  | 'defold'
  | 'spritekit'
  | 'paper2d'
  | 'monogame'
  | 'solar2d';

// Format dispatch lives in lib/formats. Re-export it here for legacy import paths.
export { generateExportData } from './formats';
