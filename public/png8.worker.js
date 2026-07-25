// Generated from src/lib/png8.ts + src/lib/png8.worker.ts — do not edit by hand.
// Regenerate: node scripts/build-png8-worker.mjs
// Browser entry: new Worker('/png8.worker.js', { type: 'module' })
/** A dependency-free indexed PNG encoder for RGBA canvas data. */
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_HISTOGRAM_SAMPLES = 262144;
function clampColorCount(maxColors) {
    if (!Number.isFinite(maxColors))
        return 256;
    return Math.max(1, Math.min(256, Math.floor(maxColors)));
}
function packedRgba(r, g, b, a) {
    if (a === 0)
        return 0;
    return (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
}
function unpackColor(value, count) {
    if (value === 0)
        return { r: 0, g: 0, b: 0, a: 0, count };
    return {
        r: value >>> 24,
        g: (value >>> 16) & 255,
        b: (value >>> 8) & 255,
        a: value & 255,
        count,
    };
}
function exactHistogram(rgba, stopAfter) {
    const histogram = new Map();
    for (let i = 0; i < rgba.length; i += 4) {
        const color = packedRgba(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
        histogram.set(color, (histogram.get(color) ?? 0) + 1);
        if (histogram.size > stopAfter)
            return null;
    }
    return histogram;
}
function sampledHistogram(rgba) {
    const pixelCount = rgba.length / 4;
    const stride = Math.max(1, Math.ceil(pixelCount / MAX_HISTOGRAM_SAMPLES));
    const histogram = new Map();
    for (let pixel = 0; pixel < pixelCount; pixel += stride) {
        const i = pixel * 4;
        const color = packedRgba(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
        histogram.set(color, (histogram.get(color) ?? 0) + 1);
    }
    return histogram;
}
function makeBox(colors) {
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
function widestChannel(box) {
    let channel = 0;
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
function channelValue(color, channel) {
    if (channel === 0)
        return color.r;
    if (channel === 1)
        return color.g;
    if (channel === 2)
        return color.b;
    return color.a;
}
function splitBox(box) {
    if (box.colors.length < 2)
        return null;
    const channel = widestChannel(box);
    const colors = box.colors
        .slice()
        .sort((a, b) => channelValue(a, channel) - channelValue(b, channel));
    const midpoint = box.population / 2;
    let cumulative = 0;
    let splitAt = 1;
    for (; splitAt < colors.length; splitAt++) {
        cumulative += colors[splitAt - 1].count;
        if (cumulative >= midpoint)
            break;
    }
    splitAt = Math.min(colors.length - 1, splitAt);
    return [makeBox(colors.slice(0, splitAt)), makeBox(colors.slice(splitAt))];
}
function averageColor(box) {
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
function createPalette(colors, maxColors) {
    let boxes = [makeBox(colors)];
    while (boxes.length < maxColors) {
        let bestIndex = -1;
        let bestScore = -1;
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            if (box.colors.length < 2)
                continue;
            const score = Math.max(...box.ranges) * Math.sqrt(box.population);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }
        if (bestIndex < 0)
            break;
        const split = splitBox(boxes[bestIndex]);
        if (!split)
            break;
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
function nearestPaletteIndex(r, g, b, a, palette) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < palette.length; i += 4) {
        const paletteAlpha = palette[i + 3];
        const alphaDelta = paletteAlpha - a;
        const dr = palette[i] * paletteAlpha - r * a;
        const dg = palette[i + 1] * paletteAlpha - g * a;
        const db = palette[i + 2] * paletteAlpha - b * a;
        const distance = dr * dr + dg * dg + db * db + alphaDelta * alphaDelta * 65025;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i / 4;
            if (distance === 0)
                break;
        }
    }
    return bestIndex;
}
function normalizeEncodeOptions(input) {
    const raw = typeof input === 'number'
        ? { maxColors: input }
        : input ?? {};
    const rawStrength = raw.ditherStrength;
    const strength = typeof rawStrength === 'number' && Number.isFinite(rawStrength)
        ? Math.max(0, Math.min(1, rawStrength))
        : 1;
    return {
        maxColors: clampColorCount(raw.maxColors ?? 256),
        dither: raw.dither ?? 'none',
        ditherStrength: strength,
    };
}
const FLOYD_STEINBERG = {
    entries: [
        [1, 0, 7 / 16],
        [-1, 1, 3 / 16],
        [0, 1, 5 / 16],
        [1, 1, 1 / 16],
    ],
};
const ATKINSON = {
    entries: [
        [1, 0, 1 / 8],
        [2, 0, 1 / 8],
        [-1, 1, 1 / 8],
        [0, 1, 1 / 8],
        [1, 1, 1 / 8],
        [0, 2, 1 / 8],
    ],
};
function assignIndicesNearest(rgba, palette) {
    const indices = new Uint8Array(rgba.length / 4);
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
    return indices;
}
function assignIndicesDithered(rgba, width, height, palette, kernel, strength) {
    const indices = new Uint8Array(rgba.length / 4);
    const rowStride = width * 3;
    const rows = [
        new Float32Array(rowStride),
        new Float32Array(rowStride),
        new Float32Array(rowStride),
    ];
    for (let y = 0; y < height; y++) {
        const currentRow = rows[y % 3];
        for (let x = 0; x < width; x++) {
            const pi = y * width + x;
            const i = pi * 4;
            const a = rgba[i + 3];
            if (a === 0) {
                indices[pi] = nearestPaletteIndex(0, 0, 0, 0, palette);
                continue;
            }
            const ex = currentRow[x * 3];
            const eg = currentRow[x * 3 + 1];
            const eb = currentRow[x * 3 + 2];
            const rWanted = rgba[i] + ex;
            const gWanted = rgba[i + 1] + eg;
            const bWanted = rgba[i + 2] + eb;
            const clampR = rWanted < 0 ? 0 : rWanted > 255 ? 255 : Math.round(rWanted);
            const clampG = gWanted < 0 ? 0 : gWanted > 255 ? 255 : Math.round(gWanted);
            const clampB = bWanted < 0 ? 0 : bWanted > 255 ? 255 : Math.round(bWanted);
            const idx = nearestPaletteIndex(clampR, clampG, clampB, a, palette);
            indices[pi] = idx;
            const pr = palette[idx * 4];
            const pg = palette[idx * 4 + 1];
            const pb = palette[idx * 4 + 2];
            const errR = (rWanted - pr) * strength;
            const errG = (gWanted - pg) * strength;
            const errB = (bWanted - pb) * strength;
            for (const [dx, dy, weight] of kernel.entries) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= width || ny >= height)
                    continue;
                const targetRow = rows[ny % 3];
                const j = nx * 3;
                targetRow[j] += errR * weight;
                targetRow[j + 1] += errG * weight;
                targetRow[j + 2] += errB * weight;
            }
        }
        currentRow.fill(0);
    }
    return indices;
}
/** Quantize RGBA pixels to at most `maxColors` RGBA palette entries. */
export function quantizeRgba(rgba, options, width, height) {
    if (rgba.length === 0 || rgba.length % 4 !== 0) {
        throw new Error('RGBA data must contain one or more complete pixels');
    }
    const opts = normalizeEncodeOptions(options);
    const exact = exactHistogram(rgba, opts.maxColors);
    const histogram = exact ?? sampledHistogram(rgba);
    const colors = Array.from(histogram, ([value, count]) => unpackColor(value, count));
    const palette = exact
        ? new Uint8Array(colors.flatMap((color) => [color.r, color.g, color.b, color.a]))
        : createPalette(colors, opts.maxColors);
    if (exact) {
        const paletteLookup = new Map();
        colors.forEach((color, index) => {
            paletteLookup.set(packedRgba(color.r, color.g, color.b, color.a), index);
        });
        const indices = new Uint8Array(rgba.length / 4);
        for (let pixel = 0; pixel < indices.length; pixel++) {
            const i = pixel * 4;
            indices[pixel] = paletteLookup.get(packedRgba(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) ?? 0;
        }
        return { palette, indices };
    }
    if (opts.dither !== 'none') {
        if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
            throw new Error('Dithered quantization requires positive width and height');
        }
        if (rgba.length !== width * height * 4) {
            throw new Error('RGBA data length does not match the provided width and height');
        }
        const kernel = opts.dither === 'atkinson' ? ATKINSON : FLOYD_STEINBERG;
        return {
            palette,
            indices: assignIndicesDithered(rgba, width, height, palette, kernel, opts.ditherStrength),
        };
    }
    return { palette, indices: assignIndicesNearest(rgba, palette) };
}
function writeUint32(target, offset, value) {
    target[offset] = value >>> 24;
    target[offset + 1] = value >>> 16;
    target[offset + 2] = value >>> 8;
    target[offset + 3] = value;
}
let crcTable = null;
function crc32(bytes) {
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
    for (const byte of bytes)
        crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const chunk = new Uint8Array(data.length + 12);
    writeUint32(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    writeUint32(chunk, data.length + 8, crc32(chunk.subarray(4, data.length + 8)));
    return chunk;
}
function adler32(bytes) {
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
function deflateStored(bytes) {
    const blockCount = Math.max(1, Math.ceil(bytes.length / 65535));
    const output = new Uint8Array(2 + bytes.length + blockCount * 5 + 4);
    output[0] = 0x78;
    output[1] = 0x01;
    let inputOffset = 0;
    let outputOffset = 2;
    for (let block = 0; block < blockCount; block++) {
        const length = Math.min(65535, bytes.length - inputOffset);
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
async function deflate(bytes) {
    if (typeof CompressionStream !== 'undefined') {
        try {
            const stream = new Blob([bytes.slice()])
                .stream()
                .pipeThrough(new CompressionStream('deflate'));
            return new Uint8Array(await new Response(stream).arrayBuffer());
        }
        catch {
            // Older engines may expose CompressionStream without supporting deflate.
        }
    }
    return deflateStored(bytes);
}
function indexedScanlines(indices, width, height, bitDepth) {
    const rowBytes = Math.ceil((width * bitDepth) / 8);
    const scanlines = new Uint8Array((rowBytes + 1) * height);
    const mask = (1 << bitDepth) - 1;
    for (let y = 0; y < height; y++) {
        const rowOffset = y * (rowBytes + 1);
        for (let x = 0; x < width; x++) {
            const value = indices[y * width + x] & mask;
            const bitOffset = x * bitDepth;
            scanlines[rowOffset + 1 + (bitOffset >> 3)] |= value << (8 - bitDepth - (bitOffset & 7));
        }
    }
    return scanlines;
}
function concatenate(parts) {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}
/** Encode RGBA pixels as an indexed-color PNG (PNG color type 3). */
export async function encodePng8Pixels(rgba, width, height, options) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new Error('PNG dimensions must be positive integers');
    }
    if (rgba.length !== width * height * 4) {
        throw new Error('RGBA data length does not match PNG dimensions');
    }
    const opts = normalizeEncodeOptions(options);
    const { palette, indices } = quantizeRgba(rgba, opts, width, height);
    const paletteSize = palette.length / 4;
    const bitDepth = paletteSize <= 2 ? 1 : paletteSize <= 4 ? 2 : paletteSize <= 16 ? 4 : 8;
    const ihdr = new Uint8Array(13);
    writeUint32(ihdr, 0, width);
    writeUint32(ihdr, 4, height);
    ihdr[8] = bitDepth;
    ihdr[9] = 3;
    const plte = new Uint8Array(paletteSize * 3);
    let lastTransparent = -1;
    for (let i = 0; i < paletteSize; i++) {
        plte.set(palette.subarray(i * 4, i * 4 + 3), i * 3);
        if (palette[i * 4 + 3] < 255)
            lastTransparent = i;
    }
    const parts = [PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('PLTE', plte)];
    if (lastTransparent >= 0) {
        const transparency = new Uint8Array(lastTransparent + 1);
        for (let i = 0; i <= lastTransparent; i++)
            transparency[i] = palette[i * 4 + 3];
        parts.push(pngChunk('tRNS', transparency));
    }
    parts.push(pngChunk('IDAT', await deflate(indexedScanlines(indices, width, height, bitDepth))), pngChunk('IEND', new Uint8Array()));
    return concatenate(parts);
}
let workerInstance = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pendingRequests = new Map();
function failAllPending(reason) {
    const entries = Array.from(pendingRequests.entries());
    pendingRequests.clear();
    for (const [, job] of entries) {
        job.reject(new Error(reason));
    }
}
function ensurePng8Worker() {
    if (workerUnavailable)
        return null;
    if (workerInstance)
        return workerInstance;
    if (typeof Worker === 'undefined')
        return null;
    try {
        const worker = new Worker('/png8.worker.js', { type: 'module' });
        worker.addEventListener('message', (event) => {
            const message = event.data;
            const job = pendingRequests.get(message.id);
            if (!job)
                return;
            pendingRequests.delete(message.id);
            if (message.kind === 'done') {
                job.resolve(message.png);
            }
            else {
                job.reject(new Error(message.message));
            }
        });
        const failover = (reason) => {
            workerUnavailable = true;
            workerInstance = null;
            try {
                worker.terminate();
            }
            catch {
                // ignore terminate failures
            }
            failAllPending(reason);
        };
        worker.addEventListener('error', () => failover('png8 worker error'));
        worker.addEventListener('messageerror', () => failover('png8 worker message error'));
        workerInstance = worker;
        return worker;
    }
    catch {
        workerUnavailable = true;
        return null;
    }
}
async function encodeViaWorker(data, width, height, options) {
    const worker = ensurePng8Worker();
    if (!worker)
        return null;
    const id = nextRequestId++;
    const promise = new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
    });
    try {
        const request = { id, data, width, height, options };
        worker.postMessage(request, [data.buffer]);
    }
    catch (error) {
        pendingRequests.delete(id);
        workerUnavailable = true;
        workerInstance = null;
        try {
            worker.terminate();
        }
        catch {
            // ignore
        }
        throw error instanceof Error ? error : new Error(String(error));
    }
    try {
        return await promise;
    }
    catch (error) {
        if (workerInstance === null)
            workerUnavailable = true;
        throw error;
    }
}
/** Quantize a canvas and encode a real PLTE/tRNS indexed PNG. */
export async function encodePng8(canvas, options) {
    if (canvas.width <= 0 || canvas.height <= 0) {
        throw new Error('Cannot encode an empty canvas');
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context)
        throw new Error('Failed to read canvas pixels');
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const opts = normalizeEncodeOptions(options);
    const source = image.data instanceof Uint8Array
        ? image.data
        : new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    const payload = new Uint8Array(source.length);
    payload.set(source);
    let png = null;
    try {
        png = await encodeViaWorker(payload, canvas.width, canvas.height, opts);
    }
    catch {
        png = null;
    }
    if (!png) {
        png = await encodePng8Pixels(source, canvas.width, canvas.height, opts);
    }
    return new Blob([png.slice()], { type: 'image/png' });
}
/** Test hook: reset the lazy worker singleton state. */
export function __resetPng8WorkerForTests() {
    if (workerInstance) {
        try {
            workerInstance.terminate();
        }
        catch {
            // ignore
        }
    }
    workerInstance = null;
    workerUnavailable = false;
    pendingRequests.clear();
    nextRequestId = 1;
}
function post(message, transfer) {
    self.postMessage(message, transfer);
}
async function handleEncode(request) {
    const { id, data, width, height, options } = request;
    try {
        const normalized = {
            maxColors: options.maxColors,
            dither: options.dither,
            ditherStrength: options.ditherStrength,
        };
        const png = await encodePng8Pixels(data, width, height, normalized);
        post({ id, kind: 'done', png }, [png.buffer]);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        post({ id, kind: 'error', message });
    }
}
self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object')
        return;
    void handleEncode(data);
});
