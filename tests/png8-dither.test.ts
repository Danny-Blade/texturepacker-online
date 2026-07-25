import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePng8, encodePng8Pixels } from '../src/lib/png8';

interface FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface FakeContext {
  getImageData: (x: number, y: number, w: number, h: number) => FakeImageData;
}

interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => FakeContext;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Build a 32x32 RGBA gradient with alternating alpha to exercise tRNS. */
function makeGradient(): Uint8Array {
  const width = 32;
  const height = 32;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // A hue-shifted gradient that produces many distinct colors so a 16-slot
      // palette necessarily loses information — the perfect input for dither.
      pixels[idx] = (x * 8 + y * 4) & 255;
      pixels[idx + 1] = (y * 8) & 255;
      pixels[idx + 2] = ((x + y) * 5) & 255;
      // First column is fully transparent so we can verify alpha preservation.
      pixels[idx + 3] = x === 0 ? 0 : 255;
    }
  }
  return pixels;
}

function pixelsToCanvas(pixels: Uint8Array, width: number, height: number): FakeCanvas {
  const buffer = new Uint8ClampedArray(pixels.length);
  buffer.set(pixels);
  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ data: buffer, width, height }),
    }),
  };
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function findChunk(png: Uint8Array, type: 'IHDR' | 'PLTE' | 'tRNS' | 'IDAT'): Uint8Array | null {
  for (let offset = 8; offset < png.length;) {
    const length =
      (png[offset] * 0x1000000
      + (png[offset + 1] << 16)
      + (png[offset + 2] << 8)
      + png[offset + 3]) >>> 0;
    const chunkType = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    if (chunkType === type) {
      return png.slice(offset + 8, offset + 8 + length);
    }
    offset += length + 12;
  }
  return null;
}

afterEach(() => vi.unstubAllGlobals());

describe('encodePng8 dithering (P2-05)', () => {
  it('writes a real PNG-8 with PLTE when the maxColors budget is tight', async () => {
    const pixels = makeGradient();
    const canvas = pixelsToCanvas(pixels, 32, 32) as unknown as HTMLCanvasElement;

    const blob = await encodePng8(canvas, { maxColors: 16, dither: 'none' });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect(findChunk(bytes, 'PLTE')).not.toBeNull();
    // Gradient uses transparent first column, so tRNS must ship too.
    expect(findChunk(bytes, 'tRNS')).not.toBeNull();
  });

  it('produces different bytes when dithering is enabled', async () => {
    const pixels = makeGradient();
    const noDither = await encodePng8Pixels(pixels, 32, 32, { maxColors: 16, dither: 'none' });
    const floydDither = await encodePng8Pixels(pixels, 32, 32, {
      maxColors: 16,
      dither: 'floyd-steinberg',
    });

    expect(hash(floydDither)).not.toBe(hash(noDither));
    expect(Array.from(floydDither.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect(findChunk(floydDither, 'PLTE')).not.toBeNull();
  });

  it('preserves alpha=0 pixels regardless of dither choice', async () => {
    const pixels = makeGradient();
    for (const dither of ['none', 'floyd-steinberg', 'atkinson'] as const) {
      const png = await encodePng8Pixels(pixels, 32, 32, { maxColors: 16, dither });
      const trns = findChunk(png, 'tRNS');
      expect(trns, `tRNS should be present for ${dither}`).not.toBeNull();
      // At least one palette entry must map to a fully transparent slot so the
      // originally alpha=0 column can decode back to alpha=0.
      expect(trns!.some((byte) => byte === 0)).toBe(true);
    }
  });

  it('Atkinson and Floyd-Steinberg produce distinct outputs', async () => {
    const pixels = makeGradient();
    const floyd = await encodePng8Pixels(pixels, 32, 32, {
      maxColors: 16,
      dither: 'floyd-steinberg',
    });
    const atkinson = await encodePng8Pixels(pixels, 32, 32, {
      maxColors: 16,
      dither: 'atkinson',
    });

    expect(hash(atkinson)).not.toBe(hash(floyd));
  });

  it('ditherStrength=0 collapses to the same output as dither="none"', async () => {
    const pixels = makeGradient();
    const noDither = await encodePng8Pixels(pixels, 32, 32, { maxColors: 16, dither: 'none' });
    const zeroStrength = await encodePng8Pixels(pixels, 32, 32, {
      maxColors: 16,
      dither: 'floyd-steinberg',
      ditherStrength: 0,
    });

    expect(hash(zeroStrength)).toBe(hash(noDither));
  });
});
