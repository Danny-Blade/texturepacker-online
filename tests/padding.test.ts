import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaxRectsPacker, type ImageItem, type PackerOptions } from '../src/lib/packer';
import { prepareSpriteForAtlas } from '../src/lib/imageProcessing';
import { useTpStore } from '../src/lib/store';

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

function item(id: string, width: number, height: number): ImageItem {
  return {
    id,
    name: `${id}.png`,
    width,
    height,
    image: { src: `test:${id}`, width, height } as HTMLImageElement,
    url: `test:${id}`,
  };
}

class PixelCanvas {
  width = 0;
  height = 0;
  pixels = new Uint8ClampedArray();

  private ensurePixels(): void {
    const size = this.width * this.height * 4;
    if (this.pixels.length !== size) this.pixels = new Uint8ClampedArray(size);
  }

  getContext(): CanvasRenderingContext2D {
    this.ensurePixels();
    return {
      drawImage: ((source: PixelImage, dx: number, dy: number, dw: number, dh: number) => {
        this.ensurePixels();
        for (let y = 0; y < dh; y++) {
          for (let x = 0; x < dw; x++) {
            const sourceOffset = (y * source.width + x) * 4;
            const targetOffset = ((dy + y) * this.width + dx + x) * 4;
            this.pixels.set(source.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
          }
        }
      }) as CanvasRenderingContext2D['drawImage'],
    } as CanvasRenderingContext2D;
  }
}

interface PixelImage extends HTMLImageElement {
  pixels: Uint8ClampedArray;
}

describe('padding semantics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses borderPadding only at the atlas edges', () => {
    const packer = new MaxRectsPacker(options({ borderPadding: 4 }));
    const packed = packer.pack([item('hero', 10, 6)]);

    expect(packed[0]).toMatchObject({ x: 4, y: 4, placed: true });
    expect(packer.getUsedBounds()).toEqual({ width: 18, height: 14 });
  });

  it('uses shapePadding as the exact transparent distance between sprites', () => {
    const packer = new MaxRectsPacker(
      options({ maxWidth: 32, maxHeight: 10, shapePadding: 3 }),
    );
    const packed = packer.pack([item('a', 10, 10), item('b', 10, 10)]);
    const byX = packed.slice().sort((a, b) => a.x - b.x);

    expect(byX.every((sprite) => sprite.placed)).toBe(true);
    expect(byX[1].x - (byX[0].x + byX[0].width)).toBe(3);
    expect(packer.getUsedBounds().width).toBe(23);
  });

  it('bakes innerPadding as transparent pixels inside the exported frame', () => {
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        expect(tag).toBe('canvas');
        return new PixelCanvas();
      },
    });
    const source = item('pixel-padding', 3, 2);
    const pixels = new Uint8ClampedArray(3 * 2 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels.set([20, 40, 60, 255], i);
    }
    (source.image as PixelImage).pixels = pixels;

    const prepared = prepareSpriteForAtlas(source, options({ innerPadding: 2 }));
    const canvas = prepared.pixelSource as unknown as PixelCanvas;
    const alphaAt = (x: number, y: number) => canvas.pixels[(y * canvas.width + x) * 4 + 3];

    expect([prepared.width, prepared.height]).toEqual([7, 6]);
    expect(prepared.trim.sourceSize).toEqual({ w: 7, h: 6 });
    expect(prepared.trim.spriteSourceSize).toEqual({ x: 2, y: 2, w: 3, h: 2 });
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(1, 3)).toBe(0);
    expect(alphaAt(2, 2)).toBe(255);
    expect(alphaAt(4, 3)).toBe(255);
    expect(alphaAt(6, 5)).toBe(0);
  });

  it('maps legacy padding to shapePadding without retaining two state fields', () => {
    useTpStore.getState().setSettings({ padding: 7, shapePadding: 2 });
    const settings = useTpStore.getState().settings;

    expect(settings.shapePadding).toBe(7);
    expect(settings).not.toHaveProperty('padding');
    useTpStore.getState().setSettings({ shapePadding: 2 });
  });
});
