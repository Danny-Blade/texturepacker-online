// Polygon trim pipeline:
// 1) Build an alpha mask from the image (alpha >= threshold).
// 2) Trace its boundary with marching-squares (2x2 cell lookup), keeping only the
//    LARGEST closed contour by point count — smaller islands of a multi-component
//    sprite are discarded so a single outline is emitted.
// 3) Simplify the contour with Douglas-Peucker at the given tolerance (pixels).
//    If simplification collapses below 3 vertices, fall back to the trimmed
//    bounding box (4 vertices).
import type { SpritePolygon } from './packer';

const CACHE_LIMIT = 256;
const cache = new Map<string, SpritePolygon | null>();

function fifoSet(key: string, value: SpritePolygon | null): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

interface MaskInfo {
  mask: Uint8Array;
  w: number;
  h: number;
  bounds: { x: number; y: number; w: number; h: number } | null;
}

function buildMask(image: HTMLImageElement, threshold: number): MaskInfo | null {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (w <= 0 || h <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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

  const bounds =
    maxX < 0
      ? null
      : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { mask, w, h, bounds };
}

/** Sample mask with out-of-bounds = 0. */
function sampleMask(mask: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  return mask[y * w + x];
}

/**
 * Marching squares: traces 2x2-cell boundary contours. Returns the largest
 * closed contour (by vertex count) as a flat number array [x0,y0,x1,y1,...].
 * Vertex coordinates are in image space; contour vertices live on cell corners
 * (integer offsets 0..w and 0..h).
 */
function marchingSquares(
  mask: Uint8Array,
  w: number,
  h: number,
): number[] | null {
  // We scan cells (cx,cy) in [0..w] x [0..h] where each cell looks at samples
  // (cx-1,cy-1), (cx,cy-1), (cx-1,cy), (cx,cy) — 4 corners. The contour passes
  // through the midpoints of cells with mixed values. For simplicity we trace
  // each connected boundary by following from a starting outside-to-inside
  // transition.

  // Build a visited grid of edges keyed by (cell index, direction). To keep it
  // simple and robust we walk cell-to-cell and emit one polygon vertex per
  // traversed cell at the cell's top-left corner. This gives a closed polyline
  // around each boundary component.

  // First, find all start cells: cells whose 4 corners form a non-zero, non-15
  // marching-squares case. For each start cell that isn't already part of a
  // traced contour, walk along the boundary until we return.
  const cellsW = w + 1;
  const cellsH = h + 1;
  const visited = new Uint8Array(cellsW * cellsH);

  // Direction deltas for next cell from each case (0..15). Cases follow:
  //   bit 0: TL, bit 1: TR, bit 2: BR, bit 3: BL  (corners sampled at cell)
  // For our contour-following we use a simplified table that gives "exit"
  // direction given an entry direction. Each cell has up to 2 exits (case 5/10
  // are saddles; we pick a consistent resolution).
  //
  // Encoding direction:  0 = right (+x), 1 = down (+y), 2 = left (-x), 3 = up (-y)
  //
  // Table indexed by [caseIndex][entryDir] => exitDir or -1
  const transitions: Int8Array = new Int8Array(16 * 4).fill(-1);
  const set = (c: number, entry: number, exit: number) => {
    transitions[c * 4 + entry] = exit;
  };
  // Standard marching-squares case exits (clockwise traversal of filled region):
  // case 1 (TL filled): right -> up
  set(1, 0, 3);
  // case 2 (TR filled): down -> right
  set(2, 1, 0);
  // case 3 (TL+TR filled): down -> up turns into right (horizontal edge)
  set(3, 0, 0);
  // case 4 (BR filled): left -> down
  set(4, 2, 1);
  // case 5 (TL+BR saddle): ambiguous — split as: from left->up, from right->down
  set(5, 2, 3);
  set(5, 0, 1);
  // case 6 (TR+BR filled): vertical edge
  set(6, 1, 1);
  // case 7 (TL+TR+BR filled): left -> up
  set(7, 2, 3);
  // case 8 (BL filled): up -> left
  set(8, 3, 2);
  // case 9 (TL+BL filled): vertical edge
  set(9, 3, 3);
  // case 10 (TR+BL saddle): from down->left, from up->right
  set(10, 1, 2);
  set(10, 3, 0);
  // case 11 (TL+TR+BL filled): down -> left
  set(11, 1, 2);
  // case 12 (BL+BR filled): horizontal edge
  set(12, 2, 2);
  // case 13 (TL+BL+BR filled): right -> down
  set(13, 0, 1);
  // case 14 (TR+BL+BR filled): up -> right
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
    [1, 0], // right
    [0, 1], // down
    [-1, 0], // left
    [0, -1], // up
  ];

  for (let sy = 0; sy < cellsH; sy++) {
    for (let sx = 0; sx < cellsW; sx++) {
      const idx = sy * cellsW + sx;
      if (visited[idx]) continue;
      const c = caseAt(sx, sy);
      if (c === 0 || c === 15) continue;
      // Pick a starting entry direction: try each that has an exit.
      let entry = -1;
      for (let d = 0; d < 4; d++) {
        if (transitions[c * 4 + d] !== -1) {
          entry = d;
          break;
        }
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
        // Entry direction into next cell is opposite of exit direction.
        const nextEntry = (exit + 2) & 3;
        if (nx === sx && ny === sy && nextEntry === entry) {
          break; // closed loop
        }
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

/** Perpendicular squared distance from point (px,py) to the segment (ax,ay)-(bx,by). */
function perpDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
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

/** Standard recursive Douglas-Peucker simplification. Polyline form. */
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
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxI !== -1 && maxD > tolSq) {
      keep[maxI] = 1;
      stack.push([lo, maxI]);
      stack.push([maxI, hi]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      out.push(points[i * 2], points[i * 2 + 1]);
    }
  }
  return out;
}

/**
 * Extracts a tight polygon outline from an image's alpha channel.
 * Returns a flat array of vertices [x0,y0,x1,y1,...] relative to the IMAGE origin
 * (not the trimmed origin). The caller may offset the polygon to be relative to
 * the trimmed sprite if needed.
 *
 * `tolerance` is Douglas-Peucker simplification distance in pixels.
 * Returns null when the image is entirely below threshold.
 *
 * NOTE: For multi-component sprites only the LARGEST connected outline is kept;
 * smaller islands are dropped.
 */
export function computePolygonOutline(
  image: HTMLImageElement,
  threshold: number,
  tolerance: number,
): SpritePolygon | null {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (w <= 0 || h <= 0) return null;

  const thr = Math.max(0, Math.min(255, Math.floor(threshold)));
  const tol = Math.max(0, tolerance);
  const key = `${image.src}|${thr}|${tol}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const info = buildMask(image, thr);
  if (!info || !info.bounds) {
    fifoSet(key, null);
    return null;
  }

  const raw = marchingSquares(info.mask, info.w, info.h);
  if (!raw || raw.length < 6) {
    // Fallback: trimmed bounding rect as 4 vertices.
    const b = info.bounds;
    const rect: SpritePolygon = [
      b.x,
      b.y,
      b.x + b.w,
      b.y,
      b.x + b.w,
      b.y + b.h,
      b.x,
      b.y + b.h,
    ];
    fifoSet(key, rect);
    return rect;
  }

  let simplified = tol > 0 ? douglasPeucker(raw, tol) : raw;
  if (simplified.length / 2 < 3) {
    const b = info.bounds;
    simplified = [
      b.x,
      b.y,
      b.x + b.w,
      b.y,
      b.x + b.w,
      b.y + b.h,
      b.x,
      b.y + b.h,
    ];
  }

  fifoSet(key, simplified);
  return simplified;
}

/** Translate every vertex by (-dx, -dy). */
export function offsetPolygon(poly: SpritePolygon, dx: number, dy: number): SpritePolygon {
  const out: number[] = new Array(poly.length);
  for (let i = 0; i < poly.length; i += 2) {
    out[i] = poly[i] - dx;
    out[i + 1] = poly[i + 1] - dy;
  }
  return out;
}
