// Convex-polygon collision helpers used by the polygon-aware packer.
//
// The public entry point `polyPolyCollide` implements the Separating Axis
// Theorem (SAT). For each polygon it walks the edges, uses each edge normal as
// a candidate separating axis, and projects both polygons onto it. If any axis
// separates the projections the polygons cannot overlap; if none do, they
// intersect.
//
// Vertices are flat number arrays [x0,y0,x1,y1,...] in polygon-local
// coordinates; callers provide a translation (ax, ay) / (bx, by) so a single
// polygon can be reused at different placements.
//
// Convexity assumption: outlines produced by Douglas-Peucker over marching
// squares are typically near-convex. Concave inputs still return a
// conservative "collide=true" whenever SAT cannot separate them, so no false
// non-collision is reported — the price is that some legitimately-separable
// concave shapes fail to overlap in the tighten pass.

import type { SpritePolygon } from './packer';

/** True when the two translated convex polygons overlap (touching is not an overlap). */
export function polyPolyCollide(
  a: SpritePolygon,
  ax: number,
  ay: number,
  b: SpritePolygon,
  bx: number,
  by: number,
): boolean {
  if (a.length < 6 || b.length < 6) return false;
  if (!checkAxes(a, ax, ay, b, bx, by)) return false;
  if (!checkAxes(b, bx, by, a, ax, ay)) return false;
  return true;
}

/**
 * Returns `true` when NO separating axis is found from the edges of
 * `poly`. `true` means "polygons cannot be separated using these axes" —
 * caller must combine both directions to confirm collision.
 */
function checkAxes(
  poly: SpritePolygon,
  px: number,
  py: number,
  other: SpritePolygon,
  ox: number,
  oy: number,
): boolean {
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[i * 2];
    const y0 = poly[i * 2 + 1];
    const x1 = poly[j * 2];
    const y1 = poly[j * 2 + 1];
    // Edge (x1-x0, y1-y0). Normal is (-(y1-y0), x1-x0). Length does not matter
    // for the sign comparison used below.
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    if (nx === 0 && ny === 0) continue;

    let aMin = Infinity;
    let aMax = -Infinity;
    for (let k = 0; k < n; k++) {
      const proj = (poly[k * 2] + px) * nx + (poly[k * 2 + 1] + py) * ny;
      if (proj < aMin) aMin = proj;
      if (proj > aMax) aMax = proj;
    }

    let bMin = Infinity;
    let bMax = -Infinity;
    const m = other.length / 2;
    for (let k = 0; k < m; k++) {
      const proj = (other[k * 2] + ox) * nx + (other[k * 2 + 1] + oy) * ny;
      if (proj < bMin) bMin = proj;
      if (proj > bMax) bMax = proj;
    }

    // Strict inequalities: exact edge/vertex touches are not overlaps.
    if (aMax <= bMin || bMax <= aMin) return false;
  }
  return true;
}

/**
 * Rotate a sprite-local polygon by 90° clockwise so it lives in "on-sheet"
 * space for a rotated placement, matching the canvas draw performed at
 * publish time (translate(x + height, y); rotate(pi/2)).
 * Input polygon vertices are relative to (0, 0)–(width, height); the returned
 * polygon lives inside (0, 0)–(height, width).
 */
export function rotatePolygon90(poly: SpritePolygon, height: number): SpritePolygon {
  const out: number[] = new Array(poly.length);
  for (let i = 0; i < poly.length; i += 2) {
    const px = poly[i];
    const py = poly[i + 1];
    out[i] = height - py;
    out[i + 1] = px;
  }
  return out;
}
