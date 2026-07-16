/** A dependency-free indexed PNG encoder for RGBA canvas data. */

interface HistogramColor {
  r: number;
  g: number;
  b: number;
  a: number;
  count: number;
}

interface ColorBox {
  colors: HistogramColor[];
  population: number;
  ranges: [number, number, number, number];
}

export interface QuantizedImage {
  /** RGBA entries; every four bytes describe one palette color. */
  palette: Uint8Array;
  /** One palette index per source pixel. */
  indices: Uint8Array;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_HISTOGRAM_SAMPLES = 262_144;

function clampColorCount(maxColors: number): number {
  if (!Number.isFinite(maxColors)) return 256;
  return Math.max(1, Math.min(256, Math.floor(maxColors)));
}

function packedRgba(r: number, g: number, b: number, a: number): number {
  // RGB underneath a fully transparent pixel is not visible and should not
  // consume several palette entries.
  if (a === 0) return 0;
  return (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
}

function unpackColor(value: number, count: number): HistogramColor {
  if (value === 0) return { r: 0, g: 0, b: 0, a: 0, count };
  return {
    r: value >>> 24,
    g: (value >>> 16) & 255,
    b: (value >>> 8) & 255,
    a: value & 255,
    count,
  };
}

function exactHistogram(
  rgba: Uint8Array | Uint8ClampedArray,
  stopAfter: number,
): Map<number, number> | null {
  const histogram = new Map<number, number>();
  for (let i = 0; i < rgba.length; i += 4) {
    const color = packedRgba(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    histogram.set(color, (histogram.get(color) ?? 0) + 1);
    if (histogram.size > stopAfter) return null;
  }
  return histogram;
}

function sampledHistogram(
  rgba: Uint8Array | Uint8ClampedArray,
): Map<number, number> {
  const pixelCount = rgba.length / 4;
  const stride = Math.max(1, Math.ceil(pixelCount / MAX_HISTOGRAM_SAMPLES));
  const histogram = new Map<number, number>();
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const i = pixel * 4;
    const color = packedRgba(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    histogram.set(color, (histogram.get(color) ?? 0) + 1);
  }
  return histogram;
}

function makeBox(colors: HistogramColor[]): ColorBox {
  const min = [255, 255, 255, 255];
  const max = [0, 0, 0, 0];
  let population = 0;
  for (const color of colors) {
    const channels = [color.r, color.g, color.b, color.a];
    for (let channel = 0; channel < 4; channel++) {
      min[channel] = Math.min(min[channel], channels[channel]);
      max[channel] = Math.max(max[channel], channels[channel]);
    }
    population += color.count;
  }
  return {
    colors,
    population,
    ranges: [
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2],
      max[3] - min[3],
    ],
  };
}

function widestChannel(box: ColorBox): number {
  let channel = 0;
  // Alpha differences are slightly more important than equally sized RGB
  // differences because losing transparency creates visible halos.
  let widest = box.ranges[0];
  for (let i = 1; i < 4; i++) {
    const range = box.ranges[i] * (i === 3 ? 1.25 : 1);
    if (range > widest) {
      widest = range;
      channel = i;
    }
  }
  return channel;
}

function channelValue(color: HistogramColor, channel: number): number {
  if (channel === 0) return color.r;
  if (channel === 1) return color.g;
  if (channel === 2) return color.b;
  return color.a;
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] | null {
  if (box.colors.length < 2) return null;
  const channel = widestChannel(box);
  const colors = box.colors
    .slice()
    .sort((a, b) => channelValue(a, channel) - channelValue(b, channel));
  const midpoint = box.population / 2;
  let cumulative = 0;
  let splitAt = 1;
  for (; splitAt < colors.length; splitAt++) {
    cumulative += colors[splitAt - 1].count;
    if (cumulative >= midpoint) break;
  }
  splitAt = Math.min(colors.length - 1, splitAt);
  return [makeBox(colors.slice(0, splitAt)), makeBox(colors.slice(splitAt))];
}

function averageColor(box: ColorBox): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const color of box.colors) {
    r += color.r * color.count;
    g += color.g * color.count;
    b += color.b * color.count;
    a += color.a * color.count;
  }
  const divisor = Math.max(1, box.population);
  return [
    Math.round(r / divisor),
    Math.round(g / divisor),
    Math.round(b / divisor),
    Math.round(a / divisor),
  ];
}

function createPalette(colors: HistogramColor[], maxColors: number): Uint8Array {
  let boxes = [makeBox(colors)];
  while (boxes.length < maxColors) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.colors.length < 2) continue;
      const score = Math.max(...box.ranges) * Math.sqrt(box.population);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    const split = splitBox(boxes[bestIndex]);
    if (!split) break;
    boxes = [
      ...boxes.slice(0, bestIndex),
      split[0],
      split[1],
      ...boxes.slice(bestIndex + 1),
    ];
  }

  const entries = boxes.map(averageColor);
  const palette = new Uint8Array(entries.length * 4);
  entries.forEach((entry, index) => palette.set(entry, index * 4));
  return palette;
}

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  a: number,
  palette: Uint8Array,
): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 4) {
    const paletteAlpha = palette[i + 3];
    const alphaDelta = paletteAlpha - a;
    // Compare premultiplied RGB so hidden color in transparent pixels does not
    // skew matching, while weighting alpha enough to retain clean edges.
    const dr = palette[i] * paletteAlpha - r * a;
    const dg = palette[i + 1] * paletteAlpha - g * a;
    const db = palette[i + 2] * paletteAlpha - b * a;
    const distance = dr * dr + dg * dg + db * db + alphaDelta * alphaDelta * 65_025;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i / 4;
      if (distance === 0) break;
    }
  }
  return bestIndex;
}

/** Quantize RGBA pixels to at most `maxColors` RGBA palette entries. */
export function quantizeRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  maxColors: number = 256,
): QuantizedImage {
  if (rgba.length === 0 || rgba.length % 4 !== 0) {
    throw new Error('RGBA data must contain one or more complete pixels');
  }
  const colorCap = clampColorCount(maxColors);
  const exact = exactHistogram(rgba, colorCap);
  const histogram = exact ?? sampledHistogram(rgba);
  const colors = Array.from(histogram, ([value, count]) => unpackColor(value, count));
  const palette = exact
    ? new Uint8Array(colors.flatMap((color) => [color.r, color.g, color.b, color.a]))
    : createPalette(colors, colorCap);
  const indices = new Uint8Array(rgba.length / 4);

  if (exact) {
    const paletteLookup = new Map<number, number>();
    colors.forEach((color, index) => {
      paletteLookup.set(packedRgba(color.r, color.g, color.b, color.a), index);
    });
    for (let pixel = 0; pixel < indices.length; pixel++) {
      const i = pixel * 4;
      indices[pixel] = paletteLookup.get(
        packedRgba(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]),
      ) ?? 0;
    }
    return { palette, indices };
  }

  // Cache nearest-color results in a compact 5/5/5/4-bit RGBA lookup table.
  const nearestCache = new Uint16Array(1 << 19);
  for (let pixel = 0; pixel < indices.length; pixel++) {
    const i = pixel * 4;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    const cacheKey = a === 0
      ? 0
      : ((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4);
    let encodedIndex = nearestCache[cacheKey];
    if (encodedIndex === 0) {
      encodedIndex = nearestPaletteIndex(r, g, b, a, palette) + 1;
      nearestCache[cacheKey] = encodedIndex;
    }
    indices[pixel] = encodedIndex - 1;
  }
  return { palette, indices };
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24;
  target[offset + 1] = value >>> 16;
  target[offset + 2] = value >>> 8;
  target[offset + 3] = value;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let value = n;
      for (let bit = 0; bit < 8; bit++) {
        value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[n] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(data.length + 12);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, data.length + 8, crc32(chunk.subarray(4, data.length + 8)));
  return chunk;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let offset = 0; offset < bytes.length; offset += 5552) {
    const end = Math.min(offset + 5552, bytes.length);
    for (let i = offset; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Standards-compliant zlib stream using uncompressed DEFLATE blocks. */
function deflateStored(bytes: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(bytes.length / 65_535));
  const output = new Uint8Array(2 + bytes.length + blockCount * 5 + 4);
  output[0] = 0x78;
  output[1] = 0x01;
  let inputOffset = 0;
  let outputOffset = 2;
  for (let block = 0; block < blockCount; block++) {
    const length = Math.min(65_535, bytes.length - inputOffset);
    output[outputOffset++] = block === blockCount - 1 ? 1 : 0;
    output[outputOffset++] = length & 255;
    output[outputOffset++] = length >>> 8;
    const inverse = (~length) & 0xffff;
    output[outputOffset++] = inverse & 255;
    output[outputOffset++] = inverse >>> 8;
    output.set(bytes.subarray(inputOffset, inputOffset + length), outputOffset);
    inputOffset += length;
    outputOffset += length;
  }
  writeUint32(output, outputOffset, adler32(bytes));
  return output;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([bytes.slice()])
        .stream()
        .pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // Older engines may expose CompressionStream without supporting deflate.
    }
  }
  return deflateStored(bytes);
}

function indexedScanlines(
  indices: Uint8Array,
  width: number,
  height: number,
  bitDepth: number,
): Uint8Array {
  const rowBytes = Math.ceil((width * bitDepth) / 8);
  const scanlines = new Uint8Array((rowBytes + 1) * height);
  const mask = (1 << bitDepth) - 1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowBytes + 1);
    // Filter byte remains 0 (None).
    for (let x = 0; x < width; x++) {
      const value = indices[y * width + x] & mask;
      const bitOffset = x * bitDepth;
      scanlines[rowOffset + 1 + (bitOffset >> 3)] |= value << (8 - bitDepth - (bitOffset & 7));
    }
  }
  return scanlines;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** Encode RGBA pixels as an indexed-color PNG (PNG color type 3). */
export async function encodePng8Pixels(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxColors: number = 256,
): Promise<Uint8Array> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('PNG dimensions must be positive integers');
  }
  if (rgba.length !== width * height * 4) {
    throw new Error('RGBA data length does not match PNG dimensions');
  }
  const { palette, indices } = quantizeRgba(rgba, maxColors);
  const paletteSize = palette.length / 4;
  const bitDepth = paletteSize <= 2 ? 1 : paletteSize <= 4 ? 2 : paletteSize <= 16 ? 4 : 8;

  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = 3; // indexed color

  const plte = new Uint8Array(paletteSize * 3);
  let lastTransparent = -1;
  for (let i = 0; i < paletteSize; i++) {
    plte.set(palette.subarray(i * 4, i * 4 + 3), i * 3);
    if (palette[i * 4 + 3] < 255) lastTransparent = i;
  }
  const parts = [PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('PLTE', plte)];
  if (lastTransparent >= 0) {
    const transparency = new Uint8Array(lastTransparent + 1);
    for (let i = 0; i <= lastTransparent; i++) transparency[i] = palette[i * 4 + 3];
    parts.push(pngChunk('tRNS', transparency));
  }
  parts.push(
    pngChunk('IDAT', await deflate(indexedScanlines(indices, width, height, bitDepth))),
    pngChunk('IEND', new Uint8Array()),
  );
  return concatenate(parts);
}

/** Quantize a canvas and encode a real PLTE/tRNS indexed PNG. */
export async function encodePng8(
  canvas: HTMLCanvasElement,
  maxColors: number = 256,
): Promise<Blob> {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Cannot encode an empty canvas');
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Failed to read canvas pixels');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const png = await encodePng8Pixels(image.data, canvas.width, canvas.height, maxColors);
  return new Blob([png.slice()], { type: 'image/png' });
}
