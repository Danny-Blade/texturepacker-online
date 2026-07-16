import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePng8Pixels, quantizeRgba } from '../src/lib/png8';

interface PngChunk {
  type: string;
  data: Uint8Array;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseChunks(png: Uint8Array): PngChunk[] {
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks: PngChunk[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = readUint32(png, offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    expect(readUint32(png, offset + 8 + length)).toBe(
      crc32(png.subarray(offset + 4, offset + 8 + length)),
    );
    chunks.push({ type, data: png.slice(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  return chunks;
}

describe('quantizeRgba', () => {
  it('keeps an image lossless when its RGBA colors fit in the palette', () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 128,
      99, 88, 77, 0,
      0, 0, 255, 255,
    ]);

    const result = quantizeRgba(rgba, 4);

    expect(Array.from(result.palette)).toEqual([
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 0, 0,
      0, 0, 255, 255,
    ]);
    expect(Array.from(result.indices)).toEqual([0, 1, 2, 3]);
  });

  it('honors the requested maximum color count', () => {
    const rgba = new Uint8Array(300 * 4);
    for (let i = 0; i < 300; i++) {
      rgba[i * 4] = i & 255;
      rgba[i * 4 + 1] = (i * 17) & 255;
      rgba[i * 4 + 2] = (i * 43) & 255;
      rgba[i * 4 + 3] = i % 5 === 0 ? 96 : 255;
    }

    const result = quantizeRgba(rgba, 16);

    expect(result.palette.length / 4).toBeLessThanOrEqual(16);
    expect(result.palette.length / 4).toBeGreaterThan(1);
    expect(result.indices).toHaveLength(300);
    expect(Math.max(...result.indices)).toBeLessThanOrEqual(15);
  });
});

describe('encodePng8Pixels', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes indexed PLTE/tRNS PNG data and packed scanlines', async () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 0, 0,
      0, 0, 255, 255,
    ]);

    const png = await encodePng8Pixels(rgba, 2, 2, 4);
    const chunks = parseChunks(png);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

    const ihdr = chunks[0].data;
    expect(readUint32(ihdr, 0)).toBe(2);
    expect(readUint32(ihdr, 4)).toBe(2);
    expect(ihdr[8]).toBe(2); // four colors use two bits per pixel
    expect(ihdr[9]).toBe(3); // PNG indexed-color type
    expect(chunks[1].data).toHaveLength(12);
    expect(Array.from(chunks[2].data)).toEqual([255, 128, 0]);

    const scanlines = inflateSync(chunks[3].data);
    expect(Array.from(scanlines)).toEqual([
      0, 0b0001_0000, // filter=None, palette indices 0 and 1
      0, 0b1011_0000, // filter=None, palette indices 2 and 3
    ]);
  });

  it('omits tRNS for fully opaque palettes and rejects mismatched input', async () => {
    const opaque = await encodePng8Pixels(
      new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
      2,
      1,
      2,
    );
    expect(parseChunks(opaque).map((chunk) => chunk.type)).toEqual([
      'IHDR',
      'PLTE',
      'IDAT',
      'IEND',
    ]);

    await expect(encodePng8Pixels(new Uint8Array(4), 2, 1)).rejects.toThrow(
      'RGBA data length does not match PNG dimensions',
    );
  });

  it('produces a valid zlib stream without CompressionStream support', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const png = await encodePng8Pixels(
      new Uint8Array([20, 40, 60, 255, 80, 100, 120, 100]),
      2,
      1,
      2,
    );
    const idat = parseChunks(png).find((chunk) => chunk.type === 'IDAT');

    expect(idat).toBeDefined();
    expect(Array.from(inflateSync(idat!.data))).toEqual([0, 0b0100_0000]);
  });
});
