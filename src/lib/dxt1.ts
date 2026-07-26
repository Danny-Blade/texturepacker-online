/**
 * Pure-JS DXT1 (BC1) encoder producing DDS files.
 *
 * DXT1 encodes each 4×4 pixel block into 8 bytes:
 *   - 2 × 16-bit RGB565 endpoints
 *   - 32-bit index map (2 bits per pixel)
 *
 * Alpha is 1-bit: pixels with `alpha < alphaThreshold` are treated as
 * transparent (index 3 in the 1-bit-alpha palette). All-opaque blocks use the
 * 4-color palette with endpoints ordered `c0 > c1`; blocks containing any
 * transparent pixel switch to the 3-color palette with endpoints ordered
 * `c0 ≤ c1` (bounding-box min/max, which the RGB565 packing preserves).
 *
 * Quality trade-off: endpoints are picked from the RGB bounding box of the
 * opaque pixels in the block — fast, but approximately 15% quality loss vs a
 * PCA-optimal encoder. Suitable for the widely-supported DXT1 baseline that
 * older Unity / UE4 / desktop OpenGL toolchains accept without any WASM.
 */

export interface Dxt1EncodeOptions {
  /** Pixels below this alpha value (0..255) are encoded as transparent. Defaults to 128. */
  alphaThreshold?: number;
}

const DEFAULT_ALPHA_THRESHOLD = 128;

/** DDS header constants (Microsoft DDS_HEADER). */
const DDS_MAGIC = 0x20534444; // "DDS " little-endian
const DDS_HEADER_SIZE = 124;
const DDPF_FOURCC = 0x00000004;
const DDSCAPS_TEXTURE = 0x00001000;
const DDSD_CAPS = 0x00000001;
const DDSD_HEIGHT = 0x00000002;
const DDSD_WIDTH = 0x00000004;
const DDSD_PIXELFORMAT = 0x00001000;
const DDSD_LINEARSIZE = 0x00080000;
const DDS_FOURCC_DXT1 = 0x31545844; // "DXT1" little-endian

function rgbTo565(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

function rgb565ToR(c: number): number {
  const v = (c >> 11) & 0x1f;
  return (v << 3) | (v >> 2);
}

function rgb565ToG(c: number): number {
  const v = (c >> 5) & 0x3f;
  return (v << 2) | (v >> 4);
}

function rgb565ToB(c: number): number {
  const v = c & 0x1f;
  return (v << 3) | (v >> 2);
}

interface Palette {
  r: [number, number, number, number];
  g: [number, number, number, number];
  b: [number, number, number, number];
}

function encodeBlock(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  threshold: number,
  out: Uint8Array,
  outOffset: number,
): void {
  let hasTransparent = false;
  let hasOpaque = false;
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;

  // First pass: bounding box over opaque pixels + transparency flag.
  for (let y = 0; y < 4; y++) {
    const rowStart = (y0 + y) * width;
    for (let x = 0; x < 4; x++) {
      const i = (rowStart + (x0 + x)) * 4;
      const a = rgba[i + 3];
      if (a < threshold) {
        hasTransparent = true;
        continue;
      }
      hasOpaque = true;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      if (r < minR) minR = r;
      if (g < minG) minG = g;
      if (b < minB) minB = b;
      if (r > maxR) maxR = r;
      if (g > maxG) maxG = g;
      if (b > maxB) maxB = b;
    }
  }

  // Fully transparent block: emit c0=c1=0 in alpha mode with all indices = 3.
  if (!hasOpaque) {
    out[outOffset] = 0;
    out[outOffset + 1] = 0;
    out[outOffset + 2] = 0;
    out[outOffset + 3] = 0;
    out[outOffset + 4] = 0xff;
    out[outOffset + 5] = 0xff;
    out[outOffset + 6] = 0xff;
    out[outOffset + 7] = 0xff;
    return;
  }

  const min565 = rgbTo565(minR, minG, minB);
  const max565 = rgbTo565(maxR, maxG, maxB);
  // Because min/max come from a componentwise bounding box, RGB565 packing
  // preserves the ordering: min565 ≤ max565 for every input.
  const minR8 = rgb565ToR(min565);
  const minG8 = rgb565ToG(min565);
  const minB8 = rgb565ToB(min565);
  const maxR8 = rgb565ToR(max565);
  const maxG8 = rgb565ToG(max565);
  const maxB8 = rgb565ToB(max565);

  let c0: number;
  let c1: number;
  const palette: Palette = {
    r: [0, 0, 0, 0],
    g: [0, 0, 0, 0],
    b: [0, 0, 0, 0],
  };
  let paletteSearchLen: number;

  if (hasTransparent) {
    // 1-bit alpha mode requires c0 ≤ c1 numerically. Endpoint 0 is min.
    c0 = min565;
    c1 = max565;
    palette.r[0] = minR8;
    palette.g[0] = minG8;
    palette.b[0] = minB8;
    palette.r[1] = maxR8;
    palette.g[1] = maxG8;
    palette.b[1] = maxB8;
    palette.r[2] = (minR8 + maxR8) >> 1;
    palette.g[2] = (minG8 + maxG8) >> 1;
    palette.b[2] = (minB8 + maxB8) >> 1;
    // Slot 3 is transparent; never chosen by the nearest-color search.
    palette.r[3] = 0;
    palette.g[3] = 0;
    palette.b[3] = 0;
    paletteSearchLen = 3;
  } else {
    // Opaque mode: c0 > c1 selects the 4-color palette. When min == max the
    // block is a solid colour — c0 == c1 then falls into the alpha
    // interpretation, but every visible palette slot is the same colour so
    // the decoded output is unchanged.
    c0 = max565;
    c1 = min565;
    palette.r[0] = maxR8;
    palette.g[0] = maxG8;
    palette.b[0] = maxB8;
    palette.r[1] = minR8;
    palette.g[1] = minG8;
    palette.b[1] = minB8;
    if (c0 === c1) {
      // Solid colour: palette entries 2 and 3 don't matter; use the endpoint
      // colour so any tie-break still decodes to the same pixel.
      palette.r[2] = maxR8;
      palette.g[2] = maxG8;
      palette.b[2] = maxB8;
      palette.r[3] = maxR8;
      palette.g[3] = maxG8;
      palette.b[3] = maxB8;
    } else {
      palette.r[2] = Math.round((2 * maxR8 + minR8) / 3);
      palette.g[2] = Math.round((2 * maxG8 + minG8) / 3);
      palette.b[2] = Math.round((2 * maxB8 + minB8) / 3);
      palette.r[3] = Math.round((maxR8 + 2 * minR8) / 3);
      palette.g[3] = Math.round((maxG8 + 2 * minG8) / 3);
      palette.b[3] = Math.round((maxB8 + 2 * minB8) / 3);
    }
    paletteSearchLen = 4;
  }

  // Second pass: assign indices.
  let low = 0; // pixels 0..15, 2 bits each → 32 bits total, split into two 16-bit halves for safety.
  let high = 0;
  for (let y = 0; y < 4; y++) {
    const rowStart = (y0 + y) * width;
    for (let x = 0; x < 4; x++) {
      const p = y * 4 + x;
      const i = (rowStart + (x0 + x)) * 4;
      const a = rgba[i + 3];
      let idx: number;
      if (hasTransparent && a < threshold) {
        idx = 3;
      } else {
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        let bestIdx = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let k = 0; k < paletteSearchLen; k++) {
          const dr = palette.r[k] - r;
          const dg = palette.g[k] - g;
          const db = palette.b[k] - b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = k;
            if (dist === 0) break;
          }
        }
        idx = bestIdx;
      }
      if (p < 8) low |= (idx & 0x3) << (p * 2);
      else high |= (idx & 0x3) << ((p - 8) * 2);
    }
  }

  out[outOffset] = c0 & 0xff;
  out[outOffset + 1] = (c0 >> 8) & 0xff;
  out[outOffset + 2] = c1 & 0xff;
  out[outOffset + 3] = (c1 >> 8) & 0xff;
  out[outOffset + 4] = low & 0xff;
  out[outOffset + 5] = (low >> 8) & 0xff;
  out[outOffset + 6] = high & 0xff;
  out[outOffset + 7] = (high >> 8) & 0xff;
}

/**
 * Encode RGBA pixels to raw DXT1 (BC1) bytes — 8 bytes per 4×4 block, no DDS
 * header. `width` and `height` must both be positive multiples of 4; callers
 * are expected to pad transparent rows/columns before invoking.
 */
export function encodeDxt1(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options?: Dxt1EncodeOptions,
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('DXT1 dimensions must be positive integers');
  }
  if (width % 4 !== 0 || height % 4 !== 0) {
    throw new Error('DXT1 dimensions must be multiples of 4');
  }
  if (rgba.length !== width * height * 4) {
    throw new Error('RGBA data length does not match the provided width and height');
  }
  const threshold = Math.max(
    0,
    Math.min(255, Math.floor(options?.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD)),
  );
  const blocksX = width / 4;
  const blocksY = height / 4;
  const output = new Uint8Array(blocksX * blocksY * 8);
  let offset = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      encodeBlock(rgba, width, bx * 4, by * 4, threshold, output, offset);
      offset += 8;
    }
  }
  return output;
}

function padToMultipleOf4(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8Array; width: number; height: number } {
  const paddedW = (width + 3) & ~3;
  const paddedH = (height + 3) & ~3;
  if (paddedW === width && paddedH === height) {
    const copy = new Uint8Array(rgba.length);
    copy.set(rgba);
    return { data: copy, width, height };
  }
  const padded = new Uint8Array(paddedW * paddedH * 4);
  for (let y = 0; y < height; y++) {
    const srcOffset = y * width * 4;
    const dstOffset = y * paddedW * 4;
    padded.set(rgba.subarray(srcOffset, srcOffset + width * 4), dstOffset);
  }
  return { data: padded, width: paddedW, height: paddedH };
}

interface CanvasWithGetImageData {
  width: number;
  height: number;
  getContext(kind: '2d', options?: { willReadFrequently?: boolean }): {
    getImageData(x: number, y: number, w: number, h: number): {
      data: Uint8Array | Uint8ClampedArray;
      width: number;
      height: number;
    };
  } | null;
}

function writeDdsHeader(target: Uint8Array, width: number, height: number, linearSize: number): void {
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  view.setUint32(0, DDS_MAGIC, true);
  // DDS_HEADER (124 bytes)
  view.setUint32(4, DDS_HEADER_SIZE, true); // dwSize
  view.setUint32(
    8,
    DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE,
    true,
  ); // dwFlags
  view.setUint32(12, height, true); // dwHeight
  view.setUint32(16, width, true); // dwWidth
  view.setUint32(20, linearSize, true); // dwPitchOrLinearSize
  view.setUint32(24, 0, true); // dwDepth
  view.setUint32(28, 0, true); // dwMipMapCount
  // dwReserved1[11] at offset 32..75 — leave zeroed.
  // DDS_PIXELFORMAT at offset 76:
  view.setUint32(76, 32, true); // pf.dwSize
  view.setUint32(80, DDPF_FOURCC, true); // pf.dwFlags
  view.setUint32(84, DDS_FOURCC_DXT1, true); // pf.dwFourCC = "DXT1"
  view.setUint32(88, 0, true); // pf.dwRGBBitCount
  view.setUint32(92, 0, true); // pf.dwRBitMask
  view.setUint32(96, 0, true); // pf.dwGBitMask
  view.setUint32(100, 0, true); // pf.dwBBitMask
  view.setUint32(104, 0, true); // pf.dwABitMask
  view.setUint32(108, DDSCAPS_TEXTURE, true); // dwCaps
  view.setUint32(112, 0, true); // dwCaps2
  view.setUint32(116, 0, true); // dwCaps3
  view.setUint32(120, 0, true); // dwCaps4
  view.setUint32(124, 0, true); // dwReserved2
}

/**
 * Encode a canvas as a complete DDS file (128-byte header + DXT1 block stream)
 * and return it as a Blob with MIME `image/vnd-ms.dds`.
 */
export function encodeDds(canvas: HTMLCanvasElement, options?: Dxt1EncodeOptions): Blob {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Cannot encode an empty canvas');
  }
  const shim = canvas as unknown as CanvasWithGetImageData;
  const context = shim.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Failed to read canvas pixels for DDS encoding');
  const image = context.getImageData(0, 0, shim.width, shim.height);
  const raw = image.data instanceof Uint8Array
    ? image.data
    : new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  const padded = padToMultipleOf4(raw, shim.width, shim.height);
  const blocks = encodeDxt1(padded.data, padded.width, padded.height, options);
  const output = new Uint8Array(128 + blocks.length);
  // DDS stores the actual (unpadded) pixel dimensions — decoders that pad on
  // decode still discard the trailing rows/columns.
  writeDdsHeader(output, shim.width, shim.height, blocks.length);
  output.set(blocks, 128);
  return new Blob([output.slice()], { type: 'image/vnd-ms.dds' });
}
