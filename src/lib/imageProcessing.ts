import type { ImageItem, PreparedSprite, PackerOptions, SpriteEffects, TrimInfo, SpritePolygon } from './packer';
import { computePolygonOutline, offsetPolygon } from './polygonTrim';
import { applySpriteEffects } from './spriteEffects';

type TrimBounds = { x: number; y: number; w: number; h: number };

function effectsKey(effects?: SpriteEffects): string {
  if (!effects || (!effects.outline && !effects.dropShadow && !effects.tint)) return '';
  return JSON.stringify({
    o: effects.outline ?? null,
    s: effects.dropShadow ?? null,
    t: effects.tint ?? null,
  });
}

function hasAnyEffect(effects?: SpriteEffects): boolean {
  if (!effects) return false;
  return Boolean(effects.outline || effects.dropShadow || effects.tint);
}

const TRIM_CACHE_LIMIT = 256;
const PREPARED_CACHE_LIMIT = 256;

const trimCache = new Map<string, TrimBounds | null>();
const preparedCache = new Map<string, PreparedSprite>();

function fifoSet<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

/**
 * Compute the tight non-transparent bounds of an image given an alpha threshold.
 * Scans top→bottom, bottom→top, left→right, right→left for the first pixel with
 * alpha >= threshold. Returns the inclusive rect or null when the image is fully
 * empty (caller decides how to render that — we treat it as a 1x1 trimmed sprite
 * in `prepareSpriteForAtlas` below).
 *
 * Results are memoised by `image.src + threshold`.
 */
export function computeTrimBounds(
  image: HTMLImageElement,
  threshold: number,
): TrimBounds | null {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (w <= 0 || h <= 0) return null;

  const thr = Math.max(0, Math.min(255, Math.floor(threshold)));
  const key = `${image.src}|${thr}`;
  if (trimCache.has(key)) return trimCache.get(key) ?? null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
      if (data[row + x * 4 + 3] >= thr) {
        found = true;
        break;
      }
    }
    if (found) {
      bottom = y;
      break;
    }
  }

  let left = w - 1;
  for (let x = 0; x < w; x++) {
    let found = false;
    for (let y = top; y <= bottom; y++) {
      if (data[(y * w + x) * 4 + 3] >= thr) {
        found = true;
        break;
      }
    }
    if (found) {
      left = x;
      break;
    }
  }

  let right = left;
  for (let x = w - 1; x > left; x--) {
    let found = false;
    for (let y = top; y <= bottom; y++) {
      if (data[(y * w + x) * 4 + 3] >= thr) {
        found = true;
        break;
      }
    }
    if (found) {
      right = x;
      break;
    }
  }

  const bounds: TrimBounds = {
    x: left,
    y: top,
    w: right - left + 1,
    h: bottom - top + 1,
  };
  fifoSet(trimCache, key, bounds, TRIM_CACHE_LIMIT);
  return bounds;
}

function buildExtrudedCanvas(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  ex: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sw + ex * 2;
  canvas.height = sh + ex * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Center: the actual trimmed sprite.
  ctx.drawImage(source, sx, sy, sw, sh, ex, ex, sw, sh);

  if (ex <= 0) return canvas;

  // Edge bands: stretch the 1-px edge of the source over the ex-wide band.
  // Left band: column sx, height sh → fills (0..ex, ex..ex+sh).
  ctx.drawImage(source, sx, sy, 1, sh, 0, ex, ex, sh);
  // Right band: column sx+sw-1.
  ctx.drawImage(source, sx + sw - 1, sy, 1, sh, ex + sw, ex, ex, sh);
  // Top band: row sy.
  ctx.drawImage(source, sx, sy, sw, 1, ex, 0, sw, ex);
  // Bottom band: row sy+sh-1.
  ctx.drawImage(source, sx, sy + sh - 1, sw, 1, ex, ex + sh, sw, ex);

  // Corners: stretch the 1-px corner pixel over the ex×ex corner square.
  ctx.drawImage(source, sx, sy, 1, 1, 0, 0, ex, ex);
  ctx.drawImage(source, sx + sw - 1, sy, 1, 1, ex + sw, 0, ex, ex);
  ctx.drawImage(source, sx, sy + sh - 1, 1, 1, 0, ex + sh, ex, ex);
  ctx.drawImage(source, sx + sw - 1, sy + sh - 1, 1, 1, ex + sw, ex + sh, ex, ex);

  return canvas;
}

function makeTransparent1x1(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

/**
 * Bake trim + inner padding + extrude into a fresh canvas usable as a
 * drawImage source.
 *
 * - PreparedSprite.width/height are the *inner* (engine-visible) frame size.
 * - `innerPadding` extends that frame with transparent pixels on every side.
 * - When `extrude > 0`, pixelSource is a (width + 2*ex) × (height + 2*ex)
 *   canvas with the 1-px edges stretched into a halo.
 * - When the source image is fully transparent under the threshold, we return a
 *   1×1 transparent sprite so the packer can still place a tiny slot for it.
 */
export function prepareSpriteForAtlas(item: ImageItem, options: PackerOptions): PreparedSprite {
  const ex = Math.max(0, Math.floor(options.extrude ?? 0));
  const ip = Math.max(0, Math.floor(options.innerPadding ?? 0));
  const threshold = Math.max(0, Math.min(255, Math.floor(options.trimThreshold ?? 1)));
  const requestedTrimMode = options.trimMode ?? (options.trimAlpha ? 'trim' : 'none');
  const trimMode = requestedTrimMode === 'rect' ? 'trim' : requestedTrimMode;
  const trimMargin = Math.max(0, Math.floor(options.trimMargin ?? 0));
  // Polygon outline mode implies alpha trim. It does not change the rectangular packer.
  const effectiveTrim = trimMode !== 'none';
  const polyTol = Math.max(0, Number(options.polygonTolerance ?? 2));
  const wantPolygon = trimMode === 'polygon-outline';
  const fxKey = effectsKey(options.effects);
  const cacheKey = `${item.image.src}|t:${effectiveTrim ? 1 : 0}|th:${threshold}|m:${trimMargin}|ip:${ip}|ex:${ex}|tm:${trimMode}|pt:${wantPolygon ? polyTol : 0}|fx:${fxKey}`;
  const cached = preparedCache.get(cacheKey);
  if (cached) {
    if (cached.item === item) return cached;
    // Same pixels, new ImageItem (e.g. re-uploaded): rebind item, reuse bitmap.
    const rebound: PreparedSprite = { ...cached, item };
    fifoSet(preparedCache, cacheKey, rebound, PREPARED_CACHE_LIMIT);
    return rebound;
  }

  const fullW = item.width;
  const fullH = item.height;

  let sx = 0;
  let sy = 0;
  let sw = fullW;
  let sh = fullH;
  let trimmed = false;
  let fullyEmpty = false;

  if (effectiveTrim) {
    const bounds = computeTrimBounds(item.image, threshold);
    if (bounds === null) {
      fullyEmpty = true;
      trimmed = true;
      sx = 0;
      sy = 0;
      sw = 1;
      sh = 1;
    } else {
      const left = Math.max(0, bounds.x - trimMargin);
      const top = Math.max(0, bounds.y - trimMargin);
      const right = Math.min(fullW, bounds.x + bounds.w + trimMargin);
      const bottom = Math.min(fullH, bounds.y + bounds.h + trimMargin);
      sx = left;
      sy = top;
      sw = right - left;
      sh = bottom - top;
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

  // First isolate the visible source pixels. Inner padding is deliberately
  // transparent and part of the exported sprite frame; unlike extrusion it is
  // represented in frame metadata.
  let frameSource: CanvasImageSource;
  if (fullyEmpty) {
    frameSource = makeTransparent1x1();
  } else if (trimmed) {
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(item.image, sx, sy, sw, sh, 0, 0, sw, sh);
    frameSource = canvas;
  } else {
    frameSource = item.image;
  }

  const frameW = sw + ip * 2;
  const frameH = sh + ip * 2;
  if (ip > 0) {
    const padded = document.createElement('canvas');
    padded.width = frameW;
    padded.height = frameH;
    const ctx = padded.getContext('2d');
    // A newly created canvas is transparent; drawing only the center is what
    // makes innerPadding a pixel operation instead of another layout gap.
    if (ctx) ctx.drawImage(frameSource, ip, ip, sw, sh);
    frameSource = padded;
  }

  let pixelSource: CanvasImageSource =
    ex > 0 ? buildExtrudedCanvas(frameSource, 0, 0, frameW, frameH, ex) : frameSource;

  let polygon: SpritePolygon | undefined;
  if (wantPolygon && !fullyEmpty) {
    const raw = computePolygonOutline(item.image, threshold, polyTol);
    if (raw && raw.length >= 6) {
      // Translate to padded frame coordinates (relative to the frame top-left).
      polygon = offsetPolygon(raw, sx - ip, sy - ip);
    }
  }

  // Apply sprite effects (outline / drop-shadow / tint) on top of the
  // trimmed+extruded bitmap. Effects can expand the bitmap asymmetrically; we
  // re-center it into a symmetric (max-padded) canvas so downstream code that
  // assumes a symmetric `extrudePadding` halo (publish render, packer) keeps
  // working. The packer reserves `2*extrudePadding` extra room around each
  // sprite — slightly more than the strict asymmetric extent, but correct.
  let effectExtrudeExtra = 0;
  if (!fullyEmpty && hasAnyEffect(options.effects)) {
    const innerW = frameW + ex * 2;
    const innerH = frameH + ex * 2;
    const applied = applySpriteEffects(pixelSource, innerW, innerH, options.effects);
    if (applied.canvas !== pixelSource) {
      const ext = applied.expand;
      const pad = Math.max(ext.left, ext.top, ext.right, ext.bottom);
      effectExtrudeExtra = pad;
      if (pad > 0) {
        // Re-center the asymmetric effect canvas into a symmetric (pad)-bordered canvas.
        const symW = innerW + pad * 2;
        const symH = innerH + pad * 2;
        const symCanvas = document.createElement('canvas');
        symCanvas.width = symW;
        symCanvas.height = symH;
        const sctx = symCanvas.getContext('2d');
        if (sctx) {
          // Effect canvas's sprite-origin is at (ext.left, ext.top); we want it
          // at (pad, pad) in the symmetric canvas.
          const dx = pad - ext.left;
          const dy = pad - ext.top;
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
    pixelSource,
    width: frameW,
    height: frameH,
    extrudePadding: totalExtrude > 0 ? totalExtrude : undefined,
    polygon,
  };
  fifoSet(preparedCache, cacheKey, prepared, PREPARED_CACHE_LIMIT);
  return prepared;
}
