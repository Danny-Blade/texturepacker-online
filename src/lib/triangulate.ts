// Ear-clipping polygon triangulation used to emit mesh data alongside atlas
// exports. Input is a flat [x0,y0,x1,y1,...] polygon assumed simple (no
// self-intersections) and given in either winding order — we normalize to CCW
// internally. Output is a flat index array [i0,i1,i2, i0,i1,i2, ...] into
// the original vertex list.
//
// If ear-clipping fails (degenerate or near-collinear geometry, or a bug in
// this implementation) we fall back to a naive fan triangulation
// [0,1,2, 0,2,3, ...]. Callers should treat a fan as a best-effort placeholder
// suitable for convex-ish outlines; a console.warn documents the fallback so
// misfires surface in devtools during development.

const EPS = 1e-9;

type PolyRef = ReadonlyArray<number>;

function signedArea(poly: PolyRef): number {
  const n = poly.length / 2;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
  }
  return sum * 0.5;
}

function fanFallback(vertexCount: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < vertexCount - 1; i++) {
    out.push(0, i, i + 1);
  }
  return out;
}

function triangleArea2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  // Barycentric sign test. Points on an edge count as inside so that we do not
  // clip an ear that would leave a stray reflex vertex on its boundary.
  const d1 = triangleArea2(px, py, ax, ay, bx, by);
  const d2 = triangleArea2(px, py, bx, by, cx, cy);
  const d3 = triangleArea2(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < -EPS || d2 < -EPS || d3 < -EPS;
  const hasPos = d1 > EPS || d2 > EPS || d3 > EPS;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clip a simple polygon into a triangle-index list. Vertices reference the
 * original `polygon` array indices.
 *
 * A logically-invalid polygon (<3 verts or trivial degeneracy) returns [];
 * an unclippable-but-non-trivial polygon logs a warning and returns a fan
 * triangulation so callers always get *something* consumable.
 */
export function earClip(polygon: PolyRef): number[] {
  const n = polygon.length / 2;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  const area = signedArea(polygon);
  if (Math.abs(area) < EPS) {
    // Degenerate (colinear) polygon; no meaningful triangulation exists.
    return [];
  }
  // Ear-clipping expects counter-clockwise ordering. Working index list is
  // reversed for CW input so vertex indices in the result still point at the
  // original array. `ccw = true` means our indices already form a CCW loop.
  const indices: number[] = [];
  if (area > 0) {
    for (let i = 0; i < n; i++) indices.push(i);
  } else {
    for (let i = n - 1; i >= 0; i--) indices.push(i);
  }

  const triangles: number[] = [];
  let guard = indices.length * 3;
  while (indices.length > 3 && guard-- > 0) {
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const prev = indices[(i - 1 + indices.length) % indices.length];
      const cur = indices[i];
      const next = indices[(i + 1) % indices.length];
      const ax = polygon[prev * 2];
      const ay = polygon[prev * 2 + 1];
      const bx = polygon[cur * 2];
      const by = polygon[cur * 2 + 1];
      const cx = polygon[next * 2];
      const cy = polygon[next * 2 + 1];
      // Ear must be convex (left-turn under CCW winding).
      if (triangleArea2(ax, ay, bx, by, cx, cy) <= EPS) continue;
      // No other polygon vertex may lie inside the ear triangle.
      let contains = false;
      for (let k = 0; k < indices.length; k++) {
        const idx = indices[k];
        if (idx === prev || idx === cur || idx === next) continue;
        if (pointInTriangle(polygon[idx * 2], polygon[idx * 2 + 1], ax, ay, bx, by, cx, cy)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      triangles.push(prev, cur, next);
      indices.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) {
      console.warn('earClip: no ear found; falling back to fan triangulation.');
      return fanFallback(n);
    }
  }

  if (indices.length === 3) {
    triangles.push(indices[0], indices[1], indices[2]);
  }
  return triangles;
}

/**
 * Compute UV coordinates for the given polygon vertices, normalized to
 * [0..1] across `width` × `height`. Returns a flat [u0,v0,u1,v1,...] array
 * with the same length as the polygon.
 */
export function polygonUVs(polygon: PolyRef, width: number, height: number): number[] {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const out: number[] = new Array(polygon.length);
  for (let i = 0; i < polygon.length; i += 2) {
    out[i] = polygon[i] / w;
    out[i + 1] = polygon[i + 1] / h;
  }
  return out;
}
