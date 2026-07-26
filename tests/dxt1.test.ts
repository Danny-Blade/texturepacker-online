import { describe, expect, it } from 'vitest';
import { encodeDds, encodeDxt1 } from '../src/lib/dxt1';

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

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

/** Read the packed 2-bit index of the pixel at position `p` (0..15) from the 4-byte index block. */
function readBlockIndex(bytes: Uint8Array, blockOffset: number, p: number): number {
  const byte = bytes[blockOffset + 4 + (p >> 2)];
  return (byte >> ((p & 3) * 2)) & 0x3;
}

function makeSolid(width: number, height: number, r: number, g: number, b: number, a: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  return rgba;
}

describe('encodeDxt1', () => {
  it('encodes a 4×4 solid-red block into 8 bytes with matching endpoints and all-zero indices', () => {
    const rgba = makeSolid(4, 4, 255, 0, 0, 255);
    const output = encodeDxt1(rgba, 4, 4);

    expect(output).toHaveLength(8);
    // RGB(255,0,0) → RGB565 0xF800 for both endpoints.
    expect(readUint16LE(output, 0)).toBe(0xf800);
    expect(readUint16LE(output, 2)).toBe(0xf800);
    for (let p = 0; p < 16; p++) {
      expect(readBlockIndex(output, 0, p)).toBe(0);
    }
  });

  it('emits one 8-byte block per 4×4 tile (8×8 → 32 bytes)', () => {
    const rgba = makeSolid(8, 8, 0, 128, 255, 255);
    const output = encodeDxt1(rgba, 8, 8);
    expect(output).toHaveLength(32);
  });

  it('rejects dimensions that are not positive multiples of 4', () => {
    const rgba = new Uint8Array(5 * 4 * 4);
    expect(() => encodeDxt1(rgba, 5, 4)).toThrow(/multiples of 4/);
    expect(() => encodeDxt1(new Uint8Array(0), 0, 4)).toThrow(/positive integers/);
  });

  it('switches to alpha mode and flips endpoint ordering when a pixel is below the threshold', () => {
    // 4×4 block: 15 red pixels + 1 black pixel; then repeat with 1 pixel forced transparent.
    // Opaque baseline: bounding box is (0,0,0)..(255,0,0) → c0 = 0xF800, c1 = 0x0000.
    const opaqueRgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      opaqueRgba[i * 4] = i === 0 ? 0 : 255;
      opaqueRgba[i * 4 + 1] = 0;
      opaqueRgba[i * 4 + 2] = 0;
      opaqueRgba[i * 4 + 3] = 255;
    }
    const opaqueOut = encodeDxt1(opaqueRgba, 4, 4);
    expect(readUint16LE(opaqueOut, 0)).toBe(0xf800);
    expect(readUint16LE(opaqueOut, 2)).toBe(0x0000);
    // Opaque mode requires c0 > c1.
    expect(readUint16LE(opaqueOut, 0)).toBeGreaterThan(readUint16LE(opaqueOut, 2));

    const alphaRgba = new Uint8Array(opaqueRgba);
    // Make pixel index 5 fully transparent.
    alphaRgba[5 * 4 + 3] = 0;
    const alphaOut = encodeDxt1(alphaRgba, 4, 4);
    // Alpha mode requires c0 <= c1; endpoints are the bounding-box min/max of
    // opaque pixels (black..red), so the ordering is now (0x0000, 0xF800).
    expect(readUint16LE(alphaOut, 0)).toBe(0x0000);
    expect(readUint16LE(alphaOut, 2)).toBe(0xf800);
    expect(readUint16LE(alphaOut, 0)).toBeLessThanOrEqual(readUint16LE(alphaOut, 2));
    // The transparent pixel must decode to palette slot 3.
    expect(readBlockIndex(alphaOut, 0, 5)).toBe(3);
    // The single black pixel (index 0) still lands on palette slot 0 (min).
    expect(readBlockIndex(alphaOut, 0, 0)).toBe(0);
  });

  it('honours a custom alphaThreshold so borderline pixels stay opaque', () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = i === 0 ? 100 : 255;
    }
    // With the default threshold (128) pixel 0 is transparent → alpha mode.
    const withDefault = encodeDxt1(rgba, 4, 4);
    expect(readBlockIndex(withDefault, 0, 0)).toBe(3);
    // Lowering the threshold below 100 keeps everything opaque.
    const withCustom = encodeDxt1(rgba, 4, 4, { alphaThreshold: 50 });
    expect(readBlockIndex(withCustom, 0, 0)).not.toBe(3);
  });
});

describe('encodeDds', () => {
  it('wraps DXT1 blocks in a 128-byte DDS header ("DDS " magic, correct total size)', () => {
    const rgba = makeSolid(4, 4, 32, 64, 128, 255);
    const canvas = pixelsToCanvas(rgba, 4, 4) as unknown as HTMLCanvasElement;

    const blob = encodeDds(canvas);
    return blob.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      expect(bytes).toHaveLength(128 + 8);
      // "DDS " magic in bytes 0..3
      expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('DDS ');
      // Header size at offset 4 must be 124.
      expect(readUint32LE(bytes, 4)).toBe(124);
      // Width/height (offsets 12/16) match the source.
      expect(readUint32LE(bytes, 12)).toBe(4); // height
      expect(readUint32LE(bytes, 16)).toBe(4); // width
      // Pixel format's FourCC at offset 84 = "DXT1"
      expect(String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87])).toBe('DXT1');
      // Linear size at offset 20 = 8 bytes (one 4x4 block).
      expect(readUint32LE(bytes, 20)).toBe(8);
      // The MIME on the produced Blob identifies the file type for downloads.
      expect(blob.type).toBe('image/vnd-ms.dds');
    });
  });
});
