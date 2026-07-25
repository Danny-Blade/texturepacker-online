import { describe, expect, it } from 'vitest';
import {
  defaultPrepareSprite,
  packIntoSheets,
  type ImageItem,
  type PackerOptions,
  type PreparedSprite,
  type SpritePreparer,
} from '../src/lib/packer';

/**
 * These tests check the polygon-aware placer end-to-end. Because the packer
 * pipeline expects a prepare function that produces PreparedSprite entries
 * (with polygon and mesh metadata), we hand-build a bespoke preparer per test
 * rather than invoking the real image processing path.
 */

function image(id: string, w: number, h: number): ImageItem {
  return {
    id,
    name: `${id}.png`,
    width: w,
    height: h,
    image: { src: `test:${id}`, width: w, height: h, naturalWidth: w, naturalHeight: h } as unknown as HTMLImageElement,
    url: `test:${id}`,
  };
}

/** Build a preparer that assigns each ImageItem a polygon by id lookup. */
function preparerWith(polys: Record<string, number[] | undefined>): SpritePreparer {
  return (item: ImageItem): PreparedSprite => {
    const base = defaultPrepareSprite(item);
    const polygon = polys[item.id];
    return polygon ? { ...base, polygon } : base;
  };
}

function options(overrides: Partial<PackerOptions> = {}): PackerOptions {
  return {
    maxWidth: 32,
    maxHeight: 32,
    borderPadding: 0,
    shapePadding: 0,
    innerPadding: 0,
    allowRotation: false,
    powerOfTwo: false,
    forceSquare: false,
    algorithm: 'maxrects-bssf',
    trimAlpha: false,
    trimThreshold: 1,
    trimMode: 'none',
    polygonTolerance: 2,
    extrude: 0,
    multipack: false,
    ...overrides,
  };
}

describe('polygon-aware packer', () => {
  it('permits bounding-rect overlap when polygons do not intersect', () => {
    // Upper-left triangle: fills the top-left half of a 10x10 quad.
    const upperLeft = [0, 0, 10, 0, 0, 10];
    // Lower-right triangle: fills the bottom-right half of a 10x10 quad.
    const lowerRight = [10, 0, 10, 10, 0, 10];
    const prepare = preparerWith({ a: upperLeft, b: lowerRight });

    const withPolygon = packIntoSheets(
      [image('a', 10, 10), image('b', 10, 10)],
      options({ polygonPacking: true }),
      prepare,
    );

    expect(withPolygon.failed).toHaveLength(0);
    expect(withPolygon.sheets).toHaveLength(1);
    const [a, b] = withPolygon.packed;
    // Both sprites end up in the same top-left corner because the tighten pass
    // sees no polygon collision and slides B on top of A.
    const rectsOverlap = !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    );
    expect(rectsOverlap).toBe(true);
  });

  it('preserves non-overlapping placements when polygonPacking is off', () => {
    const upperLeft = [0, 0, 10, 0, 0, 10];
    const lowerRight = [10, 0, 10, 10, 0, 10];
    const prepare = preparerWith({ a: upperLeft, b: lowerRight });

    const rectOnly = packIntoSheets(
      [image('a', 10, 10), image('b', 10, 10)],
      options({ polygonPacking: false }),
      prepare,
    );

    expect(rectOnly.failed).toHaveLength(0);
    const [a, b] = rectOnly.packed;
    const rectsOverlap = !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    );
    expect(rectsOverlap).toBe(false);
  });

  it('still rejects overlap when polygons genuinely intersect', () => {
    // Two full-coverage quads guarantee collision under SAT.
    const box = [0, 0, 10, 0, 10, 10, 0, 10];
    const prepare = preparerWith({ a: box, b: box });

    const withPolygon = packIntoSheets(
      [image('a', 10, 10), image('b', 10, 10)],
      options({ polygonPacking: true }),
      prepare,
    );

    expect(withPolygon.failed).toHaveLength(0);
    const [a, b] = withPolygon.packed;
    const rectsOverlap = !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    );
    expect(rectsOverlap).toBe(false);
  });
});
