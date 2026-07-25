import { afterEach, describe, expect, it, vi } from 'vitest';
import { performBatchConvert } from '../src/lib/batchConvert';
import type { ImageItem } from '../src/lib/packer';

/**
 * A minimal canvas mock that models width/height and an in-memory RGBA
 * buffer. drawImage copies from a source's `_testPixels` (Uint8ClampedArray)
 * into the destination — enough to make PNG-8 output actually reflect the
 * input pixels, which is what the alpha-handling assertion needs.
 */
interface FakeImage {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  src: string;
  _testPixels: Uint8ClampedArray;
}

interface FakeCanvasCtx {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  save: () => void;
  restore: () => void;
  translate: () => void;
  rotate: () => void;
  clearRect: () => void;
  drawImage: (source: unknown, ...rest: number[]) => void;
  getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
  putImageData: (data: { data: Uint8ClampedArray }) => void;
}

interface FakeCanvas {
  width: number;
  height: number;
  getContext: (kind: string) => FakeCanvasCtx | null;
  toBlob: (cb: (blob: Blob | null) => void, mime?: string, quality?: number) => void;
  _pixels: Uint8ClampedArray;
}

function makeFakeCanvas(): FakeCanvas {
  const canvas = {
    _width: 0,
    _height: 0,
    _pixels: new Uint8ClampedArray(0),
  } as unknown as FakeCanvas & { _width: number; _height: number };

  Object.defineProperty(canvas, 'width', {
    get() {
      return canvas._width;
    },
    set(v: number) {
      canvas._width = v;
      canvas._pixels = new Uint8ClampedArray(canvas._width * canvas._height * 4);
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(canvas, 'height', {
    get() {
      return canvas._height;
    },
    set(v: number) {
      canvas._height = v;
      canvas._pixels = new Uint8ClampedArray(canvas._width * canvas._height * 4);
    },
    enumerable: true,
    configurable: true,
  });

  const ctx: FakeCanvasCtx = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'medium',
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    clearRect: () => {},
    drawImage: (source: unknown) => {
      const src = source as Partial<FakeImage> & Partial<FakeCanvas>;
      const bytes =
        (src as FakeImage)._testPixels ??
        (src as FakeCanvas)._pixels;
      if (!bytes) return;
      const dst = canvas._pixels;
      const copy = Math.min(bytes.length, dst.length);
      for (let i = 0; i < copy; i++) dst[i] = bytes[i];
    },
    getImageData: (_x, _y, w, h) => {
      // Return a defensive copy — the alpha helpers mutate this buffer.
      const bytes = canvas._pixels.slice(0, w * h * 4);
      return { data: bytes };
    },
    putImageData: (imageData: { data: Uint8ClampedArray }) => {
      const src = imageData.data;
      const dst = canvas._pixels;
      const copy = Math.min(src.length, dst.length);
      for (let i = 0; i < copy; i++) dst[i] = src[i];
    },
  };

  canvas.getContext = () => ctx;
  canvas.toBlob = (cb, mime = 'image/png') => {
    // Return a blob whose bytes reflect the current canvas pixels so that
    // downstream hashing detects pixel-level differences (e.g. premultiply
    // vs. keep). We prepend the canvas dims for extra collision resistance.
    const header = new Uint8Array([canvas._width & 255, canvas._height & 255]);
    cb(new Blob([header, canvas._pixels.slice()], { type: mime }));
  };
  return canvas;
}

function installCanvasEnvironment(): { anchor: { href: string; download: string; click: () => void } } {
  const anchor = {
    href: '',
    download: '',
    click: () => {},
  };
  const body = { appendChild: () => {}, removeChild: () => {} };
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'canvas') return makeFakeCanvas();
      return anchor;
    },
    body,
  });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: () => {},
  });
  return { anchor };
}

function makeImage(name: string, width: number, height: number, pixels?: Uint8ClampedArray): ImageItem {
  const fill = pixels ?? new Uint8ClampedArray(width * height * 4).fill(255);
  const image = {
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    src: `data:image/png;base64,${name}`,
    _testPixels: fill,
  } as unknown as HTMLImageElement;
  return {
    id: `img-${name}`,
    name,
    width,
    height,
    image,
    url: `data:image/png;base64,${name}`,
  };
}

async function hashBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('performBatchConvert', () => {
  it('produces one PNG per input at scale 1x with the input basename', async () => {
    installCanvasEnvironment();
    const images = [makeImage('hero', 4, 4), makeImage('villain', 4, 4)];

    const result = await performBatchConvert(
      images,
      {
        imageFormat: 'png',
        imageQuality: 0.9,
        scales: [1],
        imageFileTemplate: '{name}{suffix}.{ext}',
        alphaHandling: 'keep',
        alphaBleedIterations: 4,
        premultiply: false,
        extrudePadding: 0,
        trimAlpha: false,
        bundleZip: false,
      },
      { dirHandle: null },
    );

    expect(result.written).toHaveLength(2);
    expect(result.written.map((f) => f.filename)).toEqual(['hero.png', 'villain.png']);
    expect(result.written.every((f) => f.blob.type === 'image/png')).toBe(true);
    expect(result.skipped).toEqual([]);
  });

  it('emits one output per input × scale combination', async () => {
    installCanvasEnvironment();
    const images = [makeImage('hero', 4, 4), makeImage('villain', 4, 4)];

    const result = await performBatchConvert(
      images,
      {
        imageFormat: 'png',
        imageQuality: 0.9,
        scales: [1, 2],
        imageFileTemplate: '{name}{suffix}.{ext}',
        alphaHandling: 'keep',
        alphaBleedIterations: 4,
        premultiply: false,
        extrudePadding: 0,
        trimAlpha: false,
        bundleZip: false,
      },
      { dirHandle: null },
    );

    expect(result.written).toHaveLength(4);
    expect(result.written.map((f) => f.filename)).toEqual([
      'hero.png',
      'hero@2x.png',
      'villain.png',
      'villain@2x.png',
    ]);
  });

  it('produces distinct output bytes when the alpha handling mode changes', async () => {
    installCanvasEnvironment();

    // Build a pixel buffer with distinct RGB values and partial alpha so that
    // premultiply produces a visibly different bitmap than keep.
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      const off = i * 4;
      pixels[off] = (i * 17) & 255;
      pixels[off + 1] = (i * 41) & 255;
      pixels[off + 2] = (i * 71) & 255;
      pixels[off + 3] = i < 4 ? 0 : i < 12 ? 128 : 255;
    }
    const image = makeImage('hero', 4, 4, pixels);

    const baseOptions = {
      imageFormat: 'png-8' as const,
      imageQuality: 0.9,
      scales: [1],
      imageFileTemplate: '{name}{suffix}.{ext}',
      alphaBleedIterations: 4,
      extrudePadding: 0,
      trimAlpha: false,
      bundleZip: false,
    };

    const keep = await performBatchConvert(
      [image],
      { ...baseOptions, alphaHandling: 'keep', premultiply: false },
      { dirHandle: null },
    );
    const premul = await performBatchConvert(
      [image],
      { ...baseOptions, alphaHandling: 'premultiply', premultiply: true },
      { dirHandle: null },
    );

    expect(keep.written).toHaveLength(1);
    expect(premul.written).toHaveLength(1);
    const [keepHash, premulHash] = await Promise.all([
      hashBlob(keep.written[0].blob),
      hashBlob(premul.written[0].blob),
    ]);
    expect(keepHash).not.toBe(premulHash);
  });

  it('honors a custom filename template', async () => {
    installCanvasEnvironment();
    const image = makeImage('hero', 4, 4);

    const result = await performBatchConvert(
      [image],
      {
        imageFormat: 'png',
        imageQuality: 0.9,
        scales: [1],
        imageFileTemplate: '{name}_converted.{ext}',
        alphaHandling: 'keep',
        alphaBleedIterations: 4,
        premultiply: false,
        extrudePadding: 0,
        trimAlpha: false,
        bundleZip: false,
      },
      { dirHandle: null },
    );

    expect(result.written.map((f) => f.filename)).toEqual(['hero_converted.png']);
  });
});
