import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  packIntoSheets,
  type ImageItem,
  type PackedItem,
  type PackerOptions,
  type PackingAlgorithm,
} from '../src/lib/packer';
import { prepareSpriteForAtlas } from '../src/lib/imageProcessing';

function options(overrides: Partial<PackerOptions> = {}): PackerOptions {
  return {
    maxWidth: 64,
    maxHeight: 64,
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

interface PixelSource {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

function image(id: string, width: number, height: number, pixels?: Uint8ClampedArray): ImageItem {
  return {
    id,
    name: `${id}.png`,
    width,
    height,
    image: {
      src: `test:${id}`,
      width,
      height,
      naturalWidth: width,
      naturalHeight: height,
      pixels: pixels ?? new Uint8ClampedArray(width * height * 4),
    } as unknown as HTMLImageElement,
    url: `test:${id}`,
  };
}

class TestCanvas implements PixelSource {
  private canvasWidth = 0;
  private canvasHeight = 0;
  pixels = new Uint8ClampedArray();

  get width(): number {
    return this.canvasWidth;
  }

  set width(value: number) {
    this.canvasWidth = value;
    this.resize();
  }

  get height(): number {
    return this.canvasHeight;
  }

  set height(value: number) {
    this.canvasHeight = value;
    this.resize();
  }

  private resize(): void {
    this.pixels = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight * 4);
  }

  getContext(): CanvasRenderingContext2D {
    const drawImage = (sourceValue: CanvasImageSource, ...args: number[]) => {
      const source = sourceValue as unknown as PixelSource;
      let sx = 0;
      let sy = 0;
      let sw = source.width;
      let sh = source.height;
      let dx: number;
      let dy: number;
      let dw = sw;
      let dh = sh;
      if (args.length === 2) {
        [dx, dy] = args;
      } else if (args.length === 4) {
        [dx, dy, dw, dh] = args;
      } else {
        [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      }
      for (let y = 0; y < dh; y++) {
        const sourceY = sy + Math.min(sh - 1, Math.floor((y * sh) / dh));
        for (let x = 0; x < dw; x++) {
          const sourceX = sx + Math.min(sw - 1, Math.floor((x * sw) / dw));
          const sourceOffset = (sourceY * source.width + sourceX) * 4;
          const targetX = dx + x;
          const targetY = dy + y;
          if (targetX < 0 || targetY < 0 || targetX >= this.width || targetY >= this.height) continue;
          const targetOffset = (targetY * this.width + targetX) * 4;
          this.pixels.set(source.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      }
    };
    const clearRect = (x: number, y: number, width: number, height: number) => {
      for (let py = y; py < y + height; py++) {
        for (let px = x; px < x + width; px++) {
          this.pixels.fill(0, (py * this.width + px) * 4, (py * this.width + px + 1) * 4);
        }
      }
    };
    const getImageData = (x: number, y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const sourceOffset = ((y + py) * this.width + x + px) * 4;
          data.set(this.pixels.subarray(sourceOffset, sourceOffset + 4), (py * width + px) * 4);
        }
      }
      return { data, width, height, colorSpace: 'srgb' } as ImageData;
    };
    return { drawImage, clearRect, getImageData } as unknown as CanvasRenderingContext2D;
  }
}

function installCanvas(): void {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      expect(tag).toBe('canvas');
      return new TestCanvas();
    },
  });
}

function visualSize(item: PackedItem): { width: number; height: number } {
  return item.rotated
    ? { width: item.height, height: item.width }
    : { width: item.width, height: item.height };
}

function overlaps(a: PackedItem, b: PackedItem): boolean {
  const as = visualSize(a);
  const bs = visualSize(b);
  return !(
    a.x + as.width <= b.x
    || b.x + bs.width <= a.x
    || a.y + as.height <= b.y
    || b.y + bs.height <= a.y
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('P1 layout, trim and multipack workflows', () => {
  it('applies every output size constraint and fixed-size mode', () => {
    const sprite = image('sized', 5, 3);
    expect(packIntoSheets([sprite], options({ sizeConstraint: 'any' })).sheets[0]).toMatchObject({ width: 5, height: 3 });
    expect(packIntoSheets([sprite], options({ sizeConstraint: 'word-aligned' })).sheets[0]).toMatchObject({ width: 6, height: 4 });
    expect(packIntoSheets([sprite], options({ sizeConstraint: 'multiple-of-4' })).sheets[0]).toMatchObject({ width: 8, height: 4 });
    expect(packIntoSheets([sprite], options({ sizeConstraint: 'pot' })).sheets[0]).toMatchObject({ width: 8, height: 4 });
    expect(packIntoSheets([sprite], options({ sizeMode: 'fixed', maxWidth: 32, maxHeight: 16 })).sheets[0]).toMatchObject({ width: 32, height: 16 });
  });

  it('aligns every placement to Common Divisor X/Y', () => {
    const result = packIntoSheets(
      [image('align-a', 7, 5), image('align-b', 6, 4), image('align-c', 3, 3)],
      options({ commonDivisorX: 4, commonDivisorY: 8, shapePadding: 1 }),
    );
    expect(result.failed).toHaveLength(0);
    for (const sprite of result.packed) {
      expect(sprite.x % 4).toBe(0);
      expect(sprite.y % 8).toBe(0);
    }
  });

  it('keeps manual sheet assignments stable and names the generated sheets', () => {
    const assigned = (id: string, sheet: string) => ({
      ...image(id, 8, 8),
      metadata: { manualSheetId: sheet },
    });
    const result = packIntoSheets(
      [assigned('hero', 'characters'), assigned('enemy', 'characters'), assigned('button', 'ui')],
      options({
        multipack: true,
        multipackMode: 'manual',
        manualSheets: [
          { id: 'characters', name: 'Characters' },
          { id: 'ui', name: 'UI' },
        ],
      }),
    );
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(['Characters', 'UI']);
    expect(result.sheets[0].packed.map((sprite) => sprite.id).sort()).toEqual(['enemy', 'hero']);
    expect(result.sheets[1].packed.map((sprite) => sprite.id)).toEqual(['button']);
  });

  it('packs exact duplicate images once while retaining alias metadata entries', () => {
    const original = image('original', 10, 6);
    const alias = { ...image('alias', 10, 6), url: original.url };
    const unique = image('unique', 4, 4);
    const result = packIntoSheets([original, alias, unique], options({ aliasDuplicates: true }));
    const byId = new Map(result.packed.map((sprite) => [sprite.id, sprite]));
    expect(result.packed).toHaveLength(3);
    expect(byId.get('alias')).toMatchObject({
      x: byId.get('original')?.x,
      y: byId.get('original')?.y,
      width: byId.get('original')?.width,
      height: byId.get('original')?.height,
    });
  });

  it('distinguishes trim, crop-keep-position, crop-flush and trim margin metadata', () => {
    installCanvas();
    const pixels = new Uint8ClampedArray(6 * 6 * 4);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) pixels[(y * 6 + x) * 4 + 3] = 255;
    const sprite = image('crop-modes', 6, 6, pixels);
    const trim = prepareSpriteForAtlas(sprite, options({ trimMode: 'trim', trimAlpha: true }));
    const keep = prepareSpriteForAtlas(sprite, options({ trimMode: 'crop-keep-position', trimAlpha: true }));
    const flush = prepareSpriteForAtlas(sprite, options({ trimMode: 'crop-flush', trimAlpha: true }));
    const margin = prepareSpriteForAtlas(sprite, options({ trimMode: 'trim', trimAlpha: true, trimMargin: 1 }));
    expect(trim.trim).toMatchObject({ sourceSize: { w: 6, h: 6 }, spriteSourceSize: { x: 2, y: 2, w: 2, h: 2 } });
    expect(keep.trim).toEqual(trim.trim);
    expect(flush.trim).toMatchObject({ sourceSize: { w: 2, h: 2 }, spriteSourceSize: { x: 0, y: 0, w: 2, h: 2 } });
    expect(margin.trim.spriteSourceSize).toEqual({ x: 1, y: 1, w: 4, h: 4 });
  });
});

describe('packer geometry invariants', () => {
  it.each<PackingAlgorithm>([
    'maxrects-bssf',
    'maxrects-blsf',
    'maxrects-baf',
    'maxrects-bl',
    'maxrects-cp',
    'maxrects-best',
    'shelf',
  ])('keeps placed sprites non-overlapping and inside bounds with %s', (algorithm) => {
    const result = packIntoSheets(
      [image('a', 17, 9), image('b', 8, 19), image('c', 11, 11), image('d', 7, 5)],
      options({ algorithm, borderPadding: 2, shapePadding: 2, allowRotation: true }),
    );

    expect(result.failed).toHaveLength(0);
    expect(result.sheets).toHaveLength(1);
    const sheet = result.sheets[0];
    for (let i = 0; i < sheet.packed.length; i++) {
      const current = sheet.packed[i];
      const size = visualSize(current);
      expect(current.x).toBeGreaterThanOrEqual(2);
      expect(current.y).toBeGreaterThanOrEqual(2);
      expect(current.x + size.width).toBeLessThanOrEqual(sheet.width - 2);
      expect(current.y + size.height).toBeLessThanOrEqual(sheet.height - 2);
      for (let j = i + 1; j < sheet.packed.length; j++) {
        expect(overlaps(current, sheet.packed[j])).toBe(false);
      }
    }
  });

  it('rotates only when rotation makes an otherwise impossible placement fit', () => {
    const sprite = image('wide', 12, 8);
    const rejected = packIntoSheets([sprite], options({ maxWidth: 8, maxHeight: 12 }));
    const accepted = packIntoSheets(
      [sprite],
      options({ maxWidth: 8, maxHeight: 12, allowRotation: true }),
    );

    expect(rejected.sheets).toHaveLength(0);
    expect(rejected.failed.map((item) => item.id)).toEqual(['wide']);
    expect(accepted.failed).toHaveLength(0);
    expect(accepted.packed[0]).toMatchObject({ rotated: true, x: 0, y: 0 });
    expect([accepted.width, accepted.height]).toEqual([8, 12]);
  });

  it('rounds sheet dimensions up to powers of two without clipping sprites', () => {
    const result = packIntoSheets(
      [image('pot-a', 17, 9), image('pot-b', 8, 7)],
      options({ powerOfTwo: true, shapePadding: 1 }),
    );
    const sheet = result.sheets[0];

    expect((sheet.width & (sheet.width - 1)) === 0).toBe(true);
    expect((sheet.height & (sheet.height - 1)) === 0).toBe(true);
    for (const packed of sheet.packed) {
      const size = visualSize(packed);
      expect(packed.x + size.width).toBeLessThanOrEqual(sheet.width);
      expect(packed.y + size.height).toBeLessThanOrEqual(sheet.height);
    }
  });

  it('returns a stable empty result for empty input', () => {
    expect(packIntoSheets([], options())).toEqual({
      sheets: [],
      failed: [],
      packed: [],
      width: 0,
      height: 0,
    });
  });

  it('splits overflow across sheets only when multipack is enabled', () => {
    const sprites = [image('one', 8, 8), image('two', 8, 8), image('three', 8, 8)];
    const single = packIntoSheets(sprites, options({ maxWidth: 8, maxHeight: 8 }));
    const multi = packIntoSheets(
      sprites,
      options({ maxWidth: 8, maxHeight: 8, multipack: true }),
    );

    expect(single.sheets).toHaveLength(1);
    expect(single.failed).toHaveLength(2);
    expect(multi.sheets.map((sheet) => sheet.index)).toEqual([0, 1, 2]);
    expect(multi.sheets.map((sheet) => sheet.packed.length)).toEqual([1, 1, 1]);
    expect(multi.failed).toHaveLength(0);
  });

  it('reports oversized and otherwise unplaceable sprites as failures', () => {
    const result = packIntoSheets(
      [image('too-wide', 65, 1), image('too-tall', 1, 65)],
      options({ maxWidth: 64, maxHeight: 64, multipack: true }),
    );

    expect(result.sheets).toHaveLength(0);
    expect(result.failed.map((sprite) => sprite.id).sort()).toEqual(['too-tall', 'too-wide']);
    expect(result.packed).toHaveLength(0);
  });
});

describe('sprite preprocessing contracts', () => {
  it('trims alpha bounds and preserves source reconstruction metadata', () => {
    installCanvas();
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
      pixels[(y * 4 + x) * 4 + 3] = 255;
    }

    const result = packIntoSheets(
      [image('trimmed', 4, 4, pixels)],
      options({ trimAlpha: true, trimMode: 'rect' }),
      prepareSpriteForAtlas,
    );

    expect(result.failed).toHaveLength(0);
    expect(result.packed[0]).toMatchObject({
      width: 2,
      height: 2,
      trimmed: true,
      sourceSize: { w: 4, h: 4 },
      spriteSourceSize: { x: 1, y: 1, w: 2, h: 2 },
    });
  });

  it('keeps a fully transparent input as a packable 1x1 transparent frame', () => {
    installCanvas();
    const result = packIntoSheets(
      [image('empty-alpha', 5, 3)],
      options({ trimAlpha: true, trimMode: 'rect' }),
      prepareSpriteForAtlas,
    );

    expect(result.failed).toHaveLength(0);
    expect(result.packed[0]).toMatchObject({
      width: 1,
      height: 1,
      trimmed: true,
      sourceSize: { w: 5, h: 3 },
      spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
    });
  });

  it('reserves extrusion outside frame metadata and duplicates edge pixels', () => {
    installCanvas();
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const result = packIntoSheets(
      [image('extruded', 2, 2, pixels)],
      options({ extrude: 1 }),
      prepareSpriteForAtlas,
    );
    const packed = result.packed[0];
    const canvas = packed.pixelSource as unknown as TestCanvas;
    const rgbaAt = (x: number, y: number) =>
      Array.from(canvas.pixels.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4));

    expect([packed.width, packed.height, packed.extrudePadding]).toEqual([2, 2, 1]);
    expect([packed.x, packed.y]).toEqual([1, 1]);
    expect([result.width, result.height]).toEqual([4, 4]);
    expect([canvas.width, canvas.height]).toEqual([4, 4]);
    expect(rgbaAt(0, 0)).toEqual([255, 0, 0, 255]);
    expect(rgbaAt(3, 0)).toEqual([0, 255, 0, 255]);
    expect(rgbaAt(0, 3)).toEqual([0, 0, 255, 255]);
    expect(rgbaAt(3, 3)).toEqual([255, 255, 0, 255]);
  });
});

describe('worker parity', () => {
  it('matches main-thread placements, bounds, rotation, failures, and multipack', async () => {
    type WorkerListener = (event: MessageEvent<unknown>) => void;
    const responses: Array<{ kind: string; sheets?: unknown; failedIds?: string[] }> = [];
    let listener: WorkerListener | undefined;
    vi.stubGlobal('self', {
      addEventListener: (kind: string, next: WorkerListener) => {
        if (kind === 'message') listener = next;
      },
      postMessage: (message: { kind: string; sheets?: unknown; failedIds?: string[] }) => {
        responses.push(message);
      },
    });
    await import('../src/lib/packer.worker');

    const sprites = [image('a', 7, 5), image('b', 5, 7), image('c', 6, 4), image('large', 20, 20)];
    const packOptions = options({
      maxWidth: 12,
      maxHeight: 12,
      borderPadding: 1,
      shapePadding: 1,
      allowRotation: true,
      multipack: true,
    });
    const main = packIntoSheets(sprites, packOptions);
    listener?.({
      data: {
        kind: 'pack',
        id: 42,
        rects: sprites.map((sprite) => ({ id: sprite.id, w: sprite.width, h: sprite.height })),
        options: {
          maxWidth: packOptions.maxWidth,
          maxHeight: packOptions.maxHeight,
          borderPadding: packOptions.borderPadding,
          shapePadding: packOptions.shapePadding,
          allowRotation: packOptions.allowRotation,
          powerOfTwo: packOptions.powerOfTwo,
          forceSquare: packOptions.forceSquare,
          algorithm: packOptions.algorithm,
          multipack: packOptions.multipack,
        },
      },
    } as MessageEvent<unknown>);
    const done = responses.find((response) => response.kind === 'done') as {
      kind: 'done';
      sheets: Array<{
        index: number;
        width: number;
        height: number;
        placed: Array<{ id: string; x: number; y: number; rotated: boolean }>;
      }>;
      failedIds: string[];
    };

    expect(done).toBeDefined();
    expect(done.failedIds).toEqual(main.failed.map((sprite) => sprite.id));
    expect(done.sheets).toEqual(
      main.sheets.map((sheet) => ({
        index: sheet.index,
        width: sheet.width,
        height: sheet.height,
        placed: sheet.packed.map((sprite) => ({
          id: sprite.id,
          x: sprite.x,
          y: sprite.y,
          rotated: sprite.rotated,
        })),
      })),
    );
  });
});
