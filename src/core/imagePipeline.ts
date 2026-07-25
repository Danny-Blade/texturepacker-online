// Browser-agnostic sprite preparation pipeline (P3-01).
//
// Mirrors the algorithm previously baked into src/lib/imageProcessing.ts,
// src/lib/polygonTrim.ts and src/lib/spriteEffects.ts, but abstracts every
// `document.createElement('canvas')` call behind an injected `CanvasFactory`
// so the same code drives the browser publish path AND the Node CLI.
//
// The browser wrapper in src/lib/imageProcessing.ts supplies a factory backed
// by DOM canvases; the CLI at bin/wtp.mjs supplies a factory backed by
// @napi-rs/canvas. Behaviour, caching, and cache keys are byte-identical to
// the browser-only pre-refactor implementation.

import type {
  ImageItem,
  PreparedSprite,
  PackerOptions,
  SpriteEffects,
  SpriteMesh,
  SpritePolygon,
  TrimInfo,
} from '../lib/packer';
import { earClip, polygonUVs } from '../lib/triangulate';

// --- Injected canvas abstraction -------------------------------------------

export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Context2DLike {
  drawImage(...args: unknown[]): void;
  getImageData(x: number, y: number, w: number, h: number): ImageDataLike;
  putImageData(data: ImageDataLike, x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  fillStyle: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  filter: string;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): Context2DLike | null;
  toBlob?(cb: (b: Blob | null) => void, mime?: string, quality?: number): void;
  toBuffer?(mime: string, quality?: number): Buffer;
}

export interface CanvasFactory {
  createCanvas(w: number, h: number): CanvasLike;
}

// --- Pure alpha helpers (identical to imageProcessing.ts) ------------------

export type AlphaHandling = 'keep' | 'clear' | 'bleed' | 'premultiply';

export function alphaClearRgba(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
}

export function alphaBleedRgba(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  iterations: number,
): void {
  const iters = Math.max(0, Math.floor(iterations));
  if (iters <= 0 || w <= 0 || h <= 0) return;
  const assigned = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > 0) assigned[i] = 1;
  }
  for (let iter = 0; iter < iters; iter++) {
    const prevAssigned = assigned.slice();
    const prevData = new Uint8ClampedArray(data);
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (prevAssigned[idx]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        if (x > 0 && prevAssigned[idx - 1]) {
          const n = (idx - 1) * 4;
          r += prevData[n]; g += prevData[n + 1]; b += prevData[n + 2]; count++;
        }
        if (x < w - 1 && prevAssigned[idx + 1]) {
          const n = (idx + 1) * 4;
          r += prevData[n]; g += prevData[n + 1]; b += prevData[n + 2]; count++;
        }
        if (y > 0 && prevAssigned[idx - w]) {
          const n = (idx - w) * 4;
          r += prevData[n]; g += prevData[n + 1]; b += prevData[n + 2]; count++;
        }
        if (y < h - 1 && prevAssigned[idx + w]) {
          const n = (idx + w) * 4;
          r += prevData[n]; g += prevData[n + 1]; b += prevData[n + 2]; count++;
        }
        if (count > 0) {
          const p = idx * 4;
          data[p] = Math.round(r / count);
          data[p + 1] = Math.round(g / count);
          data[p + 2] = Math.round(b / count);
          assigned[idx] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

export function premultiplyAlphaRgba(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255 || a === 0) continue;
    data[i] = Math.round(data[i] * a / 255);
    data[i + 1] = Math.round(data[i + 1] * a / 255);
    data[i + 2] = Math.round(data[i + 2] * a / 255);
  }
}

// --- Cache plumbing --------------------------------------------------------

interface ProcessedSource {
  source: unknown; // CanvasImageSource (browser) or CanvasLike (node)
  width: number;
  height: number;
  premultiplied: boolean;
}

type TrimBounds = { x: number; y: number; w: number; h: number };

const PROCESSED_CACHE_LIMIT = 256;
const TRIM_CACHE_LIMIT = 256;
const PREPARED_CACHE_LIMIT = 256;
const POLYGON_CACHE_LIMIT = 256;

const processedCache = new Map<string, ProcessedSource>();
const trimCache = new Map<string, TrimBounds | null>();
const preparedCache = new Map<string, PreparedSprite>();
const polygonCache = new Map<string, SpritePolygon | null>();

function fifoSet<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

function imageKey(image: unknown): string {
  const src = (image as { src?: unknown }).src;
  if (typeof src === 'string') return src;
  if (src instanceof Uint8Array) return `bin:${src.byteLength}:${src[0] ?? 0}:${src[src.byteLength - 1] ?? 0}`;
  return String(src);
}

function imageDims(image: unknown): { w: number; h: number } {
  const img = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  return { w, h };
}

// --- Alpha-processed source ------------------------------------------------

export function getProcessedSourceCore(
  image: unknown,
  mode: AlphaHandling,
  iterations: number,
  factory: CanvasFactory,
): ProcessedSource {
  const { w, h } = imageDims(image);
  if (mode === 'keep' || w <= 0 || h <= 0) {
    return { source: image, width: w, height: h, premultiplied: false };
  }
  const iters = mode === 'bleed' ? Math.max(1, Math.floor(iterations)) : 0;
  const key = `${imageKey(image)}|${mode}|${iters}`;
  const cached = processedCache.get(key);
  if (cached) return cached;

  const canvas = factory.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { source: image, width: w, height: h, premultiplied: false };
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0);
  let imageData: ImageDataLike;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return { source: image, width: w, height: h, premultiplied: false };
  }
  const buffer = imageData.data;
  let premultiplied = false;
  if (mode === 'clear') {
    alphaClearRgba(buffer);
  } else if (mode === 'bleed') {
    alphaBleedRgba(buffer, w, h, iters);
  } else if (mode === 'premultiply') {
    premultiplyAlphaRgba(buffer);
    premultiplied = true;
  }
  ctx.putImageData(imageData, 0, 0);
  const result: ProcessedSource = { source: canvas, width: w, height: h, premultiplied };
  fifoSet(processedCache, key, result, PROCESSED_CACHE_LIMIT);
  return result;
}

// --- Alpha trim bounds -----------------------------------------------------

export function computeTrimBoundsCore(
  image: unknown,
  threshold: number,
  factory: CanvasFactory,
): TrimBounds | null {
  const { w, h } = imageDims(image);
  if (w <= 0 || h <= 0) return null;

  const thr = Math.max(0, Math.min(255, Math.floor(threshold)));
  const key = `${imageKey(image)}|${thr}`;
  if (trimCache.has(key)) return trimCache.get(key) ?? null;

  const canvas = factory.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    fifoSet(trimCache, key, null, TRIM_CACHE_LIMIT);
    return null;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    fifoSet(trimCache, key, null, TRIM_CACHE_LIMIT);
    return null;
  }

  let top = -1;
  for (let y = 0; y < h && top === -1; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] >= thr) {
        top = y;
        break;
      }
    }
  }

  if (top === -1) {
    fifoSet(trimCache, key, null, TRIM_CACHE_LIMIT);
    return null;
  }

  let bottom = top;
  for (let y = h - 1; y > top; y--) {
    const row = y * w * 4;
    let found = false;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] >= thr) { found = true; break; }
    }
    if (found) { bottom = y; break; }
  }

  let left = w - 1;
  for (let x = 0; x < w; x++) {
    let found = false;
    for (let y = top; y <= bottom; y++) {
      if (data[(y * w + x) * 4 + 3] >= thr) { found = true; break; }
    }
    if (found) { left = x; break; }
  }

  let right = left;
  for (let x = w - 1; x > left; x--) {
    let found = false;
    for (let y = top; y <= bottom; y++) {
      if (data[(y * w + x) * 4 + 3] >= thr) { found = true; break; }
    }
    if (found) { right = x; break; }
  }

  const bounds: TrimBounds = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  fifoSet(trimCache, key, bounds, TRIM_CACHE_LIMIT);
  return bounds;
}

// --- Polygon outline (marching squares + Douglas-Peucker) ------------------

interface MaskInfo {
  mask: Uint8Array;
  w: number;
  h: number;
  bounds: TrimBounds | null;
}

function buildMaskCore(image: unknown, threshold: number, factory: CanvasFactory): MaskInfo | null {
  const { w, h } = imageDims(image);
  if (w <= 0 || h <= 0) return null;

  const canvas = factory.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  const mask = new Uint8Array(w * h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a >= threshold) {
        mask[y * w + x] = 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bounds = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { mask, w, h, bounds };
}

function sampleMask(mask: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  return mask[y * w + x];
}

function marchingSquares(mask: Uint8Array, w: number, h: number): number[] | null {
  const cellsW = w + 1;
  const cellsH = h + 1;
  const visited = new Uint8Array(cellsW * cellsH);
  const transitions = new Int8Array(16 * 4).fill(-1);
  const set = (c: number, entry: number, exit: number) => {
    transitions[c * 4 + entry] = exit;
  };
  set(1, 0, 3);
  set(2, 1, 0);
  set(3, 0, 0);
  set(4, 2, 1);
  set(5, 2, 3);
  set(5, 0, 1);
  set(6, 1, 1);
  set(7, 2, 3);
  set(8, 3, 2);
  set(9, 3, 3);
  set(10, 1, 2);
  set(10, 3, 0);
  set(11, 1, 2);
  set(12, 2, 2);
  set(13, 0, 1);
  set(14, 3, 0);

  function caseAt(cx: number, cy: number): number {
    const tl = sampleMask(mask, w, h, cx - 1, cy - 1);
    const tr = sampleMask(mask, w, h, cx, cy - 1);
    const br = sampleMask(mask, w, h, cx, cy);
    const bl = sampleMask(mask, w, h, cx - 1, cy);
    return tl | (tr << 1) | (br << 2) | (bl << 3);
  }

  let largest: number[] | null = null;
  const dxs: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];

  for (let sy = 0; sy < cellsH; sy++) {
    for (let sx = 0; sx < cellsW; sx++) {
      const idx = sy * cellsW + sx;
      if (visited[idx]) continue;
      const c = caseAt(sx, sy);
      if (c === 0 || c === 15) continue;
      let entry = -1;
      for (let d = 0; d < 4; d++) {
        if (transitions[c * 4 + d] !== -1) { entry = d; break; }
      }
      if (entry === -1) continue;

      const path: number[] = [];
      let cx = sx;
      let cy = sy;
      let curEntry = entry;
      let safety = (cellsW * cellsH) * 4;
      while (safety-- > 0) {
        const idxc = cy * cellsW + cx;
        const cc = caseAt(cx, cy);
        if (cc === 0 || cc === 15) break;
        const exit = transitions[cc * 4 + curEntry];
        if (exit === -1) break;
        path.push(cx, cy);
        visited[idxc] = 1;
        const [ddx, ddy] = dxs[exit];
        const nx = cx + ddx;
        const ny = cy + ddy;
        const nextEntry = (exit + 2) & 3;
        if (nx === sx && ny === sy && nextEntry === entry) break;
        if (nx < 0 || ny < 0 || nx >= cellsW || ny >= cellsH) break;
        cx = nx;
        cy = ny;
        curEntry = nextEntry;
      }

      if (path.length >= 6 && (!largest || path.length > largest.length)) {
        largest = path;
      }
    }
  }
  return largest;
}

function perpDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const tc = Math.max(0, Math.min(1, t));
  const cx = ax + tc * dx;
  const cy = ay + tc * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

export function douglasPeucker(points: number[], tol: number): number[] {
  const n = points.length / 2;
  if (n < 3 || tol <= 0) return points.slice();
  const tolSq = tol * tol;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) break;
    const [lo, hi] = top;
    if (hi - lo < 2) continue;
    const ax = points[lo * 2];
    const ay = points[lo * 2 + 1];
    const bx = points[hi * 2];
    const by = points[hi * 2 + 1];
    let maxD = 0;
    let maxI = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDistSq(points[i * 2], points[i * 2 + 1], ax, ay, bx, by);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxI !== -1 && maxD > tolSq) {
      keep[maxI] = 1;
      stack.push([lo, maxI]);
      stack.push([maxI, hi]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  }
  return out;
}

export function offsetPolygon(poly: SpritePolygon, dx: number, dy: number): SpritePolygon {
  const out: number[] = new Array(poly.length);
  for (let i = 0; i < poly.length; i += 2) {
    out[i] = poly[i] - dx;
    out[i + 1] = poly[i + 1] - dy;
  }
  return out;
}

export function computePolygonOutlineCore(
  image: unknown,
  threshold: number,
  tolerance: number,
  factory: CanvasFactory,
): SpritePolygon | null {
  const { w, h } = imageDims(image);
  if (w <= 0 || h <= 0) return null;
  const thr = Math.max(0, Math.min(255, Math.floor(threshold)));
  const tol = Math.max(0, tolerance);
  const key = `${imageKey(image)}|${thr}|${tol}`;
  if (polygonCache.has(key)) return polygonCache.get(key) ?? null;

  const info = buildMaskCore(image, thr, factory);
  if (!info || !info.bounds) {
    fifoSet(polygonCache, key, null, POLYGON_CACHE_LIMIT);
    return null;
  }

  const raw = marchingSquares(info.mask, info.w, info.h);
  if (!raw || raw.length < 6) {
    const b = info.bounds;
    const rect: SpritePolygon = [
      b.x, b.y,
      b.x + b.w, b.y,
      b.x + b.w, b.y + b.h,
      b.x, b.y + b.h,
    ];
    fifoSet(polygonCache, key, rect, POLYGON_CACHE_LIMIT);
    return rect;
  }
  let simplified = tol > 0 ? douglasPeucker(raw, tol) : raw;
  if (simplified.length / 2 < 3) {
    const b = info.bounds;
    simplified = [
      b.x, b.y,
      b.x + b.w, b.y,
      b.x + b.w, b.y + b.h,
      b.x, b.y + b.h,
    ];
  }
  fifoSet(polygonCache, key, simplified, POLYGON_CACHE_LIMIT);
  return simplified;
}

// --- Extrude helper --------------------------------------------------------

function buildExtrudedCanvas(
  source: unknown,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  ex: number,
  factory: CanvasFactory,
): CanvasLike {
  const canvas = factory.createCanvas(sw + ex * 2, sh + ex * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(source, sx, sy, sw, sh, ex, ex, sw, sh);
  if (ex <= 0) return canvas;

  ctx.drawImage(source, sx, sy, 1, sh, 0, ex, ex, sh);
  ctx.drawImage(source, sx + sw - 1, sy, 1, sh, ex + sw, ex, ex, sh);
  ctx.drawImage(source, sx, sy, sw, 1, ex, 0, sw, ex);
  ctx.drawImage(source, sx, sy + sh - 1, sw, 1, ex, ex + sh, sw, ex);

  ctx.drawImage(source, sx, sy, 1, 1, 0, 0, ex, ex);
  ctx.drawImage(source, sx + sw - 1, sy, 1, 1, ex + sw, 0, ex, ex);
  ctx.drawImage(source, sx, sy + sh - 1, 1, 1, 0, ex + sh, ex, ex);
  ctx.drawImage(source, sx + sw - 1, sy + sh - 1, 1, 1, ex + sw, ex + sh, ex, ex);

  return canvas;
}

function makeTransparent1x1(factory: CanvasFactory): CanvasLike {
  return factory.createCanvas(1, 1);
}

// --- Sprite effects --------------------------------------------------------

function hasAnyEffect(effects?: SpriteEffects): boolean {
  if (!effects) return false;
  return Boolean(effects.outline || effects.dropShadow || effects.tint);
}

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function effectsExtent(effects?: SpriteEffects): {
  left: number; top: number; right: number; bottom: number;
} {
  if (!effects) return { left: 0, top: 0, right: 0, bottom: 0 };
  let l = 0, t = 0, r = 0, b = 0;
  if (effects.outline?.width) {
    const w = effects.outline.width;
    l = Math.max(l, w);
    t = Math.max(t, w);
    r = Math.max(r, w);
    b = Math.max(b, w);
  }
  if (effects.dropShadow) {
    const s = effects.dropShadow;
    const blur = Math.ceil(s.blur);
    l = Math.max(l, Math.max(0, -s.offsetX) + blur);
    t = Math.max(t, Math.max(0, -s.offsetY) + blur);
    r = Math.max(r, Math.max(0, s.offsetX) + blur);
    b = Math.max(b, Math.max(0, s.offsetY) + blur);
  }
  return { left: l, top: t, right: r, bottom: b };
}

interface AppliedEffects {
  canvas: unknown;
  expand: { left: number; top: number; right: number; bottom: number };
}

function makeCanvas(factory: CanvasFactory, w: number, h: number): CanvasLike {
  return factory.createCanvas(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
}

export function applySpriteEffectsCore(
  source: unknown,
  width: number,
  height: number,
  effects: SpriteEffects | undefined,
  factory: CanvasFactory,
): AppliedEffects {
  if (!hasAnyEffect(effects) || width <= 0 || height <= 0) {
    return { canvas: source, expand: { left: 0, top: 0, right: 0, bottom: 0 } };
  }
  const extent = effectsExtent(effects);
  const totalW = width + extent.left + extent.right;
  const totalH = height + extent.top + extent.bottom;

  const dest = makeCanvas(factory, totalW, totalH);
  const dctx = dest.getContext('2d');
  if (!dctx) {
    return { canvas: source, expand: { left: 0, top: 0, right: 0, bottom: 0 } };
  }

  const ox = extent.left;
  const oy = extent.top;

  if (effects?.dropShadow) {
    const s = effects.dropShadow;
    const shadowCanvas = makeCanvas(factory, totalW, totalH);
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      const sil = makeCanvas(factory, width, height);
      const silCtx = sil.getContext('2d');
      if (silCtx) {
        silCtx.drawImage(source, 0, 0, width, height);
        silCtx.globalCompositeOperation = 'source-in';
        silCtx.fillStyle = s.color;
        silCtx.fillRect(0, 0, width, height);
      }
      sctx.globalAlpha = clampUnit(s.opacity / 100);
      if (s.blur > 0) {
        sctx.filter = `blur(${Math.max(0, s.blur)}px)`;
      }
      sctx.drawImage(sil, ox + s.offsetX, oy + s.offsetY);
      sctx.filter = 'none';
      sctx.globalAlpha = 1;
      dctx.drawImage(shadowCanvas, 0, 0);
    }
  }

  const spriteLayer = makeCanvas(factory, width, height);
  const splctx = spriteLayer.getContext('2d');
  if (splctx) {
    splctx.drawImage(source, 0, 0, width, height);
    if (effects?.tint) {
      const t = effects.tint;
      const tintCanvas = makeCanvas(factory, width, height);
      const tctx = tintCanvas.getContext('2d');
      if (tctx) {
        tctx.drawImage(source, 0, 0, width, height);
        tctx.globalCompositeOperation = t.mode;
        tctx.fillStyle = t.color;
        tctx.fillRect(0, 0, width, height);
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(source, 0, 0, width, height);
        splctx.globalAlpha = clampUnit(t.opacity / 100);
        splctx.drawImage(tintCanvas, 0, 0);
        splctx.globalAlpha = 1;
      }
    }
  }

  if (effects?.outline && effects.outline.width > 0) {
    const ow = Math.max(1, Math.floor(effects.outline.width));
    const stamp = makeCanvas(factory, totalW, totalH);
    const stx = stamp.getContext('2d');
    if (stx) {
      const STEPS = 16;
      for (let i = 0; i < STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const dx = Math.round(Math.cos(a) * ow);
        const dy = Math.round(Math.sin(a) * ow);
        stx.drawImage(source, ox + dx, oy + dy, width, height);
      }
      stx.globalCompositeOperation = 'source-in';
      stx.fillStyle = effects.outline.color;
      stx.fillRect(0, 0, totalW, totalH);
      stx.globalCompositeOperation = 'destination-out';
      stx.drawImage(source, ox, oy, width, height);
      stx.globalCompositeOperation = 'source-over';
      dctx.drawImage(stamp, 0, 0);
    }
  }

  dctx.drawImage(spriteLayer, ox, oy);
  return {
    canvas: dest,
    expand: { left: extent.left, top: extent.top, right: extent.right, bottom: extent.bottom },
  };
}

// --- Main entry point ------------------------------------------------------

function effectsKey(effects?: SpriteEffects): string {
  if (!effects || (!effects.outline && !effects.dropShadow && !effects.tint)) return '';
  return JSON.stringify({
    o: effects.outline ?? null,
    s: effects.dropShadow ?? null,
    t: effects.tint ?? null,
  });
}

/**
 * Bake trim + inner padding + extrude + effects into a fresh canvas.
 * Byte-identical to the browser-only `prepareSpriteForAtlas` implementation
 * pre-P3-01, but takes an injected {@link CanvasFactory} so both the DOM
 * publish path and the Node CLI can share this pipeline.
 */
export function prepareSpriteForAtlasCore(
  item: ImageItem,
  options: PackerOptions,
  factory: CanvasFactory,
): PreparedSprite {
  const ex = Math.max(0, Math.floor(options.extrude ?? 0));
  const ip = Math.max(0, Math.floor(options.innerPadding ?? 0));
  const threshold = Math.max(0, Math.min(255, Math.floor(options.trimThreshold ?? 1)));
  const requestedTrimMode = options.trimMode ?? (options.trimAlpha ? 'trim' : 'none');
  const trimMode = requestedTrimMode === 'rect' ? 'trim' : requestedTrimMode;
  const trimMargin = Math.max(0, Math.floor(options.trimMargin ?? 0));
  const effectiveTrim = trimMode !== 'none';
  const polyTol = Math.max(0, Number(options.polygonTolerance ?? 2));
  const wantPolygon = trimMode === 'polygon-outline';
  const fxKey = effectsKey(options.effects);
  const alphaMode: AlphaHandling = options.alphaHandling ?? 'keep';
  const alphaIters = alphaMode === 'bleed'
    ? Math.max(1, Math.floor(options.alphaBleedIterations ?? 4))
    : 0;
  const alphaKey = `${alphaMode}:${alphaIters}`;
  const cacheKey = `${imageKey(item.image)}|t:${effectiveTrim ? 1 : 0}|th:${threshold}|m:${trimMargin}|ip:${ip}|ex:${ex}|tm:${trimMode}|pt:${wantPolygon ? polyTol : 0}|fx:${fxKey}|a:${alphaKey}`;
  const cached = preparedCache.get(cacheKey);
  if (cached) {
    if (cached.item === item) return cached;
    const rebound: PreparedSprite = { ...cached, item };
    fifoSet(preparedCache, cacheKey, rebound, PREPARED_CACHE_LIMIT);
    return rebound;
  }

  const fullW = item.width;
  const fullH = item.height;

  const processed = getProcessedSourceCore(item.image, alphaMode, alphaIters, factory);
  const drawSource = processed.source;
  const premultiplied = processed.premultiplied;

  let sx = 0;
  let sy = 0;
  let sw = fullW;
  let sh = fullH;
  let trimmed = false;
  let fullyEmpty = false;

  if (effectiveTrim) {
    const bounds = computeTrimBoundsCore(item.image, threshold, factory);
    if (bounds === null) {
      fullyEmpty = true;
      trimmed = true;
      sx = 0; sy = 0; sw = 1; sh = 1;
    } else {
      const left = Math.max(0, bounds.x - trimMargin);
      const top = Math.max(0, bounds.y - trimMargin);
      const right = Math.min(fullW, bounds.x + bounds.w + trimMargin);
      const bottom = Math.min(fullH, bounds.y + bounds.h + trimMargin);
      sx = left; sy = top; sw = right - left; sh = bottom - top;
      if (sw !== fullW || sh !== fullH || sx !== 0 || sy !== 0) trimmed = true;
    }
  }

  const cropFlush = trimMode === 'crop-flush';
  const trim: TrimInfo = {
    trimmed,
    sourceSize: cropFlush
      ? { w: sw + ip * 2, h: sh + ip * 2 }
      : { w: fullW + ip * 2, h: fullH + ip * 2 },
    spriteSourceSize: cropFlush
      ? { x: ip, y: ip, w: sw, h: sh }
      : { x: sx + ip, y: sy + ip, w: sw, h: sh },
  };

  let frameSource: unknown;
  if (fullyEmpty) {
    frameSource = makeTransparent1x1(factory);
  } else if (trimmed) {
    const canvas = factory.createCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(drawSource, sx, sy, sw, sh, 0, 0, sw, sh);
    frameSource = canvas;
  } else {
    frameSource = drawSource;
  }

  const frameW = sw + ip * 2;
  const frameH = sh + ip * 2;
  if (ip > 0) {
    const padded = factory.createCanvas(frameW, frameH);
    const ctx = padded.getContext('2d');
    if (ctx) ctx.drawImage(frameSource, ip, ip, sw, sh);
    frameSource = padded;
  }

  let pixelSource: unknown =
    ex > 0 ? buildExtrudedCanvas(frameSource, 0, 0, frameW, frameH, ex, factory) : frameSource;

  let polygon: SpritePolygon | undefined;
  let mesh: SpriteMesh | undefined;
  if (wantPolygon && !fullyEmpty) {
    const raw = computePolygonOutlineCore(item.image, threshold, polyTol, factory);
    if (raw && raw.length >= 6) {
      polygon = offsetPolygon(raw, sx - ip, sy - ip);
      const triangles = earClip(polygon);
      if (triangles.length >= 3 && triangles.length % 3 === 0) {
        mesh = {
          vertices: polygon.slice(),
          triangles,
          uvs: polygonUVs(polygon, sw + ip * 2, sh + ip * 2),
        };
      }
    }
  }

  let effectExtrudeExtra = 0;
  if (!fullyEmpty && hasAnyEffect(options.effects)) {
    const innerW = frameW + ex * 2;
    const innerH = frameH + ex * 2;
    const applied = applySpriteEffectsCore(pixelSource, innerW, innerH, options.effects, factory);
    if (applied.canvas !== pixelSource) {
      const extent = applied.expand;
      const pad = Math.max(extent.left, extent.top, extent.right, extent.bottom);
      effectExtrudeExtra = pad;
      if (pad > 0) {
        const symW = innerW + pad * 2;
        const symH = innerH + pad * 2;
        const symCanvas = factory.createCanvas(symW, symH);
        const sctx = symCanvas.getContext('2d');
        if (sctx) {
          const dx = pad - extent.left;
          const dy = pad - extent.top;
          sctx.drawImage(applied.canvas, dx, dy);
          pixelSource = symCanvas;
        } else {
          pixelSource = applied.canvas;
        }
      } else {
        pixelSource = applied.canvas;
      }
    }
  }
  const totalExtrude = ex + effectExtrudeExtra;

  const prepared: PreparedSprite = {
    item,
    trim,
    // PreparedSprite.pixelSource is typed as CanvasImageSource for the DOM
    // publish path; in the CLI the same value is a @napi-rs/canvas Canvas,
    // which the renderer treats structurally. The cast is safe because the
    // renderer never invokes DOM-only methods on it.
    pixelSource: pixelSource as unknown as CanvasImageSource,
    width: frameW,
    height: frameH,
    extrudePadding: totalExtrude > 0 ? totalExtrude : undefined,
    polygon,
    mesh,
    premultiplied: premultiplied ? true : undefined,
  };
  fifoSet(preparedCache, cacheKey, prepared, PREPARED_CACHE_LIMIT);
  return prepared;
}
