// Packing types and algorithms. Phase 3 implementations live in this file.
export interface ImageItem {
  id: string;
  name: string;
  width: number;
  height: number;
  image: HTMLImageElement;
  url: string;
}

export interface TrimInfo {
  trimmed: boolean;
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
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
}

export interface PackSheet {
  index: number;
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

export interface PackerOptions {
  maxWidth: number;
  maxHeight: number;
  padding: number;
  /** Border padding inside the sheet edges. */
  borderPadding: number;
  /** Padding between sprites (separate from border). */
  shapePadding: number;
  allowRotation: boolean;
  powerOfTwo: boolean;
  forceSquare: boolean;
  algorithm: PackingAlgorithm;
  trimAlpha: boolean;
  trimThreshold: number; // 0..255 alpha threshold below which a pixel is "empty"
  extrude: number;
  multipack: boolean;
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
  private freeRects: Rect[] = [];
  private usedRects: Rect[] = [];

  constructor(options: PackerOptions) {
    this.maxWidth = options.maxWidth;
    this.maxHeight = options.maxHeight;
    this.padding = Math.max(options.shapePadding ?? options.padding ?? 0, 0);
    this.borderPadding = Math.max(options.borderPadding ?? 0, 0);
    this.allowRotation = options.allowRotation;
    this.algorithm = options.algorithm;
    const bp = this.borderPadding;
    this.freeRects = [
      {
        x: bp,
        y: bp,
        width: Math.max(0, this.maxWidth - bp * 2),
        height: Math.max(0, this.maxHeight - bp * 2),
      },
    ];
  }

  pack(items: ImageItem[]): PackedItem[] {
    const sorted = items.slice().sort((a, b) => b.width * b.height - a.width * a.height);
    const packed: PackedItem[] = [];

    for (const img of sorted) {
      const paddedW = img.width + this.padding * 2;
      const paddedH = img.height + this.padding * 2;

      let result = this.findBestRect(paddedW, paddedH);
      let rotated = false;

      if (!result && this.allowRotation && img.width !== img.height) {
        result = this.findBestRect(paddedH, paddedW);
        if (result) rotated = true;
      }

      if (result) {
        packed.push({
          ...img,
          x: result.x + this.padding,
          y: result.y + this.padding,
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
      if (rect.width < width || rect.height < height) continue;
      const leftoverX = rect.width - width;
      const leftoverY = rect.height - height;
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
        best = { x: rect.x, y: rect.y, width, height };
        bestPrimary = primary;
        bestSecondary = secondary;
      }
    }
    return best;
  }

  private placeRect(rect: Rect): void {
    const n = this.freeRects.length;
    for (let i = 0; i < n; i++) {
      if (this.splitFreeNode(this.freeRects[i], rect)) {
        this.freeRects.splice(i, 1);
        i--;
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
    return { width: maxX + this.borderPadding, height: maxY + this.borderPadding };
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

  // Resolve heuristic (Best = try several, pick smallest total atlas area).
  const algorithmsToTry =
    options.algorithm === 'maxrects-best' ? HEURISTICS_FOR_BEST : [options.algorithm];

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
    if (options.powerOfTwo) {
      sheetWidth = nextPowerOfTwo(sheetWidth);
      sheetHeight = nextPowerOfTwo(sheetHeight);
    }
    if (options.forceSquare) {
      const side = Math.max(sheetWidth, sheetHeight);
      sheetWidth = side;
      sheetHeight = side;
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
  | 'cocos-creator';

// Format dispatch lives in lib/formats. Re-export it here for legacy import paths.
export { generateExportData } from './formats';
