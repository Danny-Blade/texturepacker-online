import { describe, expect, it } from 'vitest';
import {
  alphaBleedRgba,
  alphaClearRgba,
  premultiplyAlphaRgba,
} from '../src/lib/imageProcessing';

/**
 * Build a 4x4 sample buffer with:
 *  - a 2x2 opaque core at (1,1)..(2,2) with distinct RGB per pixel,
 *  - a partial-alpha edge pixel at (2,1) with distinct RGB,
 *  - "colored transparent" fringes everywhere else (alpha=0, RGB=(200,200,200)).
 * Encoded left-to-right, top-to-bottom (matching Canvas ImageData layout).
 */
function build4x4Sample(): Uint8ClampedArray {
  const w = 4;
  const h = 4;
  const buf = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    const off = (y * w + x) * 4;
    buf[off] = r;
    buf[off + 1] = g;
    buf[off + 2] = b;
    buf[off + 3] = a;
  };
  // Fill everything with colored-transparent grey first.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) set(x, y, 200, 200, 200, 0);
  }
  // Opaque core:
  set(1, 1, 255, 0, 0, 255);
  set(2, 1, 0, 255, 0, 128); // partial alpha edge, distinct RGB
  set(1, 2, 0, 0, 255, 255);
  set(2, 2, 255, 255, 0, 255);
  return buf;
}

function rgbaAt(buf: Uint8ClampedArray, x: number, y: number, w = 4): [number, number, number, number] {
  const off = (y * w + x) * 4;
  return [buf[off], buf[off + 1], buf[off + 2], buf[off + 3]];
}

describe('alphaClearRgba', () => {
  it('zeroes RGB of every pixel with alpha === 0', () => {
    const buf = build4x4Sample();
    alphaClearRgba(buf);
    // The 12 transparent pixels around the 2x2 core:
    for (const [x, y] of [
      [0, 0], [1, 0], [2, 0], [3, 0],
      [0, 1], [3, 1],
      [0, 2], [3, 2],
      [0, 3], [1, 3], [2, 3], [3, 3],
    ] as const) {
      expect(rgbaAt(buf, x, y)).toEqual([0, 0, 0, 0]);
    }
  });

  it('leaves non-transparent pixels untouched', () => {
    const buf = build4x4Sample();
    alphaClearRgba(buf);
    expect(rgbaAt(buf, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(rgbaAt(buf, 2, 1)).toEqual([0, 255, 0, 128]);
    expect(rgbaAt(buf, 1, 2)).toEqual([0, 0, 255, 255]);
    expect(rgbaAt(buf, 2, 2)).toEqual([255, 255, 0, 255]);
  });
});

describe('alphaBleedRgba', () => {
  it('after 1 iteration, a transparent pixel with exactly one opaque neighbour takes that neighbour RGB', () => {
    const buf = build4x4Sample();
    // Clear so the test does not confuse pre-existing fringe colour with bled colour.
    alphaClearRgba(buf);
    alphaBleedRgba(buf, 4, 4, 1);
    // (0,1) is transparent with (1,1) as only opaque 4-neighbour → picks up (255,0,0).
    expect(rgbaAt(buf, 0, 1)).toEqual([255, 0, 0, 0]);
    // (1,0) is transparent with (1,1) as only opaque 4-neighbour → picks up (255,0,0).
    expect(rgbaAt(buf, 1, 0)).toEqual([255, 0, 0, 0]);
    // (3,2) is transparent with (2,2) as only opaque 4-neighbour → picks up (255,255,0).
    expect(rgbaAt(buf, 3, 2)).toEqual([255, 255, 0, 0]);
    // Alpha stays unchanged everywhere.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const isOpaqueCore = (x === 1 && y === 1) || (x === 1 && y === 2) || (x === 2 && y === 2);
        const isPartialEdge = x === 2 && y === 1;
        const expectedAlpha = isOpaqueCore ? 255 : isPartialEdge ? 128 : 0;
        expect(rgbaAt(buf, x, y)[3]).toBe(expectedAlpha);
      }
    }
  });

  it('leaves fully-opaque pixels untouched', () => {
    const buf = build4x4Sample();
    alphaBleedRgba(buf, 4, 4, 3);
    expect(rgbaAt(buf, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(rgbaAt(buf, 1, 2)).toEqual([0, 0, 255, 255]);
    expect(rgbaAt(buf, 2, 2)).toEqual([255, 255, 0, 255]);
  });

  it('is a no-op when iterations <= 0', () => {
    const buf = build4x4Sample();
    const before = new Uint8ClampedArray(buf);
    alphaBleedRgba(buf, 4, 4, 0);
    expect(Array.from(buf)).toEqual(Array.from(before));
  });
});

describe('premultiplyAlphaRgba', () => {
  it('scales RGB by alpha / 255 for partial-alpha pixels', () => {
    const buf = build4x4Sample();
    premultiplyAlphaRgba(buf);
    // (2,1) was (0,255,0) with alpha 128 → round(255*128/255) = 128.
    expect(rgbaAt(buf, 2, 1)).toEqual([0, 128, 0, 128]);
  });

  it('leaves fully-opaque pixels untouched', () => {
    const buf = build4x4Sample();
    premultiplyAlphaRgba(buf);
    expect(rgbaAt(buf, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(rgbaAt(buf, 1, 2)).toEqual([0, 0, 255, 255]);
    expect(rgbaAt(buf, 2, 2)).toEqual([255, 255, 0, 255]);
  });

  it('leaves fully-transparent pixels untouched (short-circuits when alpha=0)', () => {
    const buf = new Uint8ClampedArray([100, 150, 200, 0]);
    premultiplyAlphaRgba(buf);
    // We do not clear RGB in premultiply mode; that is what `clear` is for.
    expect(Array.from(buf)).toEqual([100, 150, 200, 0]);
  });
});
