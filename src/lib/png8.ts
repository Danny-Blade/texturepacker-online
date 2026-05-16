// PNG-8 (256-color quantized) encoding. Phase 7 implementation.

/**
 * Implementation choice: median-cut quantization in pure JS, then re-render to
 * a canvas and let the browser's PNG encoder compress it via toBlob. The output
 * is technically a PNG24/32 stream, but the reduced color count makes the zlib
 * stream substantially smaller. A true PNG-8 (PLTE+tRNS chunks) would require a
 * JS PNG encoder; we skip that to avoid adding a dependency / large binary.
 */

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface ColorBox {
  pixels: RGBA[];
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

interface CacheEntry {
  maxColors: number;
  blob: Blob;
}

const encodeCache = new WeakMap<HTMLCanvasElement, CacheEntry>();

function clamp8(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return Math.round(n);
}

function makeBox(pixels: RGBA[]): ColorBox {
  let rMin = 255, rMax = 0;
  let gMin = 255, gMax = 0;
  let bMin = 255, bMax = 0;
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }
  return { pixels, rMin, rMax, gMin, gMax, bMin, bMax };
}

function boxLongestAxis(box: ColorBox): 'r' | 'g' | 'b' {
  const dr = box.rMax - box.rMin;
  const dg = box.gMax - box.gMin;
  const db = box.bMax - box.bMin;
  if (dr >= dg && dr >= db) return 'r';
  if (dg >= db) return 'g';
  return 'b';
}

function boxRange(box: ColorBox): number {
  return Math.max(
    box.rMax - box.rMin,
    box.gMax - box.gMin,
    box.bMax - box.bMin,
  );
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  const axis = boxLongestAxis(box);
  const sorted = box.pixels.slice().sort((a, b) => {
    if (axis === 'r') return a.r - b.r;
    if (axis === 'g') return a.g - b.g;
    return a.b - b.b;
  });
  const mid = Math.floor(sorted.length / 2);
  const left = sorted.slice(0, mid);
  const right = sorted.slice(mid);
  return [makeBox(left), makeBox(right)];
}

function boxAverage(box: ColorBox): RGBA {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < box.pixels.length; i++) {
    r += box.pixels[i].r;
    g += box.pixels[i].g;
    b += box.pixels[i].b;
  }
  const n = Math.max(1, box.pixels.length);
  return { r: clamp8(r / n), g: clamp8(g / n), b: clamp8(b / n), a: 255 };
}

function medianCut(allPixels: RGBA[], maxColors: number): RGBA[] {
  if (allPixels.length === 0) return [];
  let boxes: ColorBox[] = [makeBox(allPixels)];
  while (boxes.length < maxColors) {
    // pick the box with the largest range to split
    let bestIdx = -1;
    let bestRange = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length < 2) continue;
      const range = boxRange(boxes[i]);
      if (range > bestRange) {
        bestRange = range;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    const [a, b] = splitBox(boxes[bestIdx]);
    boxes = boxes.slice(0, bestIdx).concat(boxes.slice(bestIdx + 1));
    if (a.pixels.length > 0) boxes.push(a);
    if (b.pixels.length > 0) boxes.push(b);
  }
  return boxes.map(boxAverage);
}

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: RGBA[],
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = p.r - r;
    const dg = p.g - g;
    const db = p.b - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = i;
      if (d === 0) return i;
    }
  }
  return best;
}

/**
 * Quantize an RGBA canvas to at most `maxColors` colors and encode as PNG.
 * Results are memoised by canvas reference (WeakMap).
 */
export async function encodePng8(
  canvas: HTMLCanvasElement,
  maxColors: number = 256,
): Promise<Blob> {
  const colorCap = Math.max(16, Math.min(256, Math.floor(maxColors)));

  const cached = encodeCache.get(canvas);
  if (cached && cached.maxColors === colorCap) {
    return cached.blob;
  }

  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('Failed to encode PNG');
    return blob;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('Failed to encode PNG');
    return blob;
  }

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('Failed to encode PNG');
    return blob;
  }

  const src = imageData.data;
  const total = w * h;

  // Collect opaque-enough pixels for quantization (skip fully transparent).
  // To bound work for very large canvases, deduplicate via a 4-bit/channel
  // histogram bucket and keep at most one sample per bucket.
  const seen = new Uint8Array(1 << 12); // 16^3 buckets
  const samples: RGBA[] = [];
  for (let i = 0; i < total; i++) {
    const a = src[i * 4 + 3];
    if (a < 8) continue;
    const r = src[i * 4];
    const g = src[i * 4 + 1];
    const b = src[i * 4 + 2];
    const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    if (seen[bucket]) continue;
    seen[bucket] = 1;
    samples.push({ r, g, b, a: 255 });
  }

  let palette: RGBA[] = medianCut(samples, colorCap);
  if (palette.length === 0) {
    // Fully transparent image — palette doesn't matter.
    palette = [{ r: 0, g: 0, b: 0, a: 255 }];
  }

  // Map pixels to nearest palette color, preserving original alpha.
  const out = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i++) {
    const a = src[i * 4 + 3];
    if (a === 0) {
      // fully transparent — keep zero RGBA
      continue;
    }
    const r = src[i * 4];
    const g = src[i * 4 + 1];
    const b = src[i * 4 + 2];
    const idx = nearestPaletteIndex(r, g, b, palette);
    const p = palette[idx];
    out[i * 4] = p.r;
    out[i * 4 + 1] = p.g;
    out[i * 4 + 2] = p.b;
    out[i * 4 + 3] = a;
  }

  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  if (!tctx) throw new Error('Failed to allocate canvas');
  tctx.putImageData(new ImageData(out, w, h), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    tmp.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) throw new Error('Failed to encode PNG');

  encodeCache.set(canvas, { maxColors: colorCap, blob });
  return blob;
}
