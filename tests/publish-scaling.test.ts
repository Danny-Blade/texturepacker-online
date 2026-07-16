import { describe, expect, it } from 'vitest';
import type { PackedItem, PackSheet } from '../src/lib/packer';
import jsonHash from '../src/lib/formats/jsonHash';
import { scalePackSheet } from '../src/lib/publish';

function makeItem(overrides: Partial<PackedItem> = {}): PackedItem {
  return {
    id: 'hero-id',
    name: 'hero.png',
    width: 11,
    height: 7,
    image: {} as HTMLImageElement,
    url: 'blob:hero',
    x: 13,
    y: 17,
    rotated: true,
    placed: true,
    sheetIndex: 3,
    trimmed: true,
    sourceSize: { w: 21, h: 15 },
    spriteSourceSize: { x: 3, y: 5, w: 11, h: 7 },
    pixelSource: {} as CanvasImageSource,
    extrudePadding: 3,
    polygon: [0, 0, 10, 1, 8, 6, 1, 5],
    ...overrides,
  };
}

function makeSheet(item = makeItem()): PackSheet {
  return {
    index: 3,
    width: 63,
    height: 47,
    packed: [item],
  };
}

describe('scalePackSheet', () => {
  it.each([
    {
      scale: 0.5,
      sheetSize: [32, 24],
      xy: [7, 9],
      itemSize: [6, 4],
      sourceSize: { w: 11, h: 8 },
      spriteSourceSize: { x: 2, y: 3, w: 6, h: 4 },
      extrudePadding: 2,
      polygon: [0, 0, 5, 1, 4, 3, 1, 3],
    },
    {
      scale: 1,
      sheetSize: [63, 47],
      xy: [13, 17],
      itemSize: [11, 7],
      sourceSize: { w: 21, h: 15 },
      spriteSourceSize: { x: 3, y: 5, w: 11, h: 7 },
      extrudePadding: 3,
      polygon: [0, 0, 10, 1, 8, 6, 1, 5],
    },
    {
      scale: 2,
      sheetSize: [126, 94],
      xy: [26, 34],
      itemSize: [22, 14],
      sourceSize: { w: 42, h: 30 },
      spriteSourceSize: { x: 6, y: 10, w: 22, h: 14 },
      extrudePadding: 6,
      polygon: [0, 0, 20, 2, 16, 12, 2, 10],
    },
  ])(
    'scales all physical metadata at $scale x while preserving rotation',
    ({
      scale,
      sheetSize,
      xy,
      itemSize,
      sourceSize,
      spriteSourceSize,
      extrudePadding,
      polygon,
    }) => {
      const source = makeSheet();
      const result = scalePackSheet(source, scale);
      const item = result.packed[0];

      expect([result.width, result.height]).toEqual(sheetSize);
      expect([item.x, item.y]).toEqual(xy);
      expect([item.width, item.height]).toEqual(itemSize);
      expect(item.sourceSize).toEqual(sourceSize);
      expect(item.spriteSourceSize).toEqual(spriteSourceSize);
      expect(item.extrudePadding).toBe(extrudePadding);
      expect(item.polygon).toEqual(polygon);
      expect(item.rotated).toBe(true);
      expect(item.image).toBe(source.packed[0].image);
      expect(item.pixelSource).toBe(source.packed[0].pixelSource);
    },
  );

  it('does not mutate the source sheet or its nested metadata', () => {
    const source = makeSheet();
    const sheetSnapshot = {
      width: source.width,
      height: source.height,
    };
    const itemSnapshot = {
      x: source.packed[0].x,
      y: source.packed[0].y,
      width: source.packed[0].width,
      height: source.packed[0].height,
      sourceSize: { ...source.packed[0].sourceSize },
      spriteSourceSize: { ...source.packed[0].spriteSourceSize },
      polygon: source.packed[0].polygon?.slice(),
    };

    const result = scalePackSheet(source, 2);

    expect(source).toMatchObject(sheetSnapshot);
    expect(source.packed[0]).toMatchObject(itemSnapshot);
    expect(result).not.toBe(source);
    expect(result.packed).not.toBe(source.packed);
    expect(result.packed[0]).not.toBe(source.packed[0]);
    expect(result.packed[0].sourceSize).not.toBe(source.packed[0].sourceSize);
    expect(result.packed[0].spriteSourceSize).not.toBe(source.packed[0].spriteSourceSize);
    expect(result.packed[0].polygon).not.toBe(source.packed[0].polygon);
  });

  it('rounds every scaled field to the nearest physical pixel', () => {
    const source = makeSheet(
      makeItem({
        x: 1,
        y: 3,
        width: 5,
        height: 9,
        sourceSize: { w: 11, h: 13 },
        spriteSourceSize: { x: 1, y: 3, w: 5, h: 9 },
        extrudePadding: 1,
        polygon: [1, 3, 5, 9, 7, 11],
      }),
    );

    const item = scalePackSheet(source, 0.5).packed[0];

    expect([item.x, item.y, item.width, item.height]).toEqual([1, 2, 3, 5]);
    expect(item.sourceSize).toEqual({ w: 6, h: 7 });
    expect(item.spriteSourceSize).toEqual({ x: 1, y: 2, w: 3, h: 5 });
    expect(item.extrudePadding).toBe(1);
    expect(item.polygon).toEqual([1, 2, 3, 5, 4, 6]);
  });

  it('feeds formats physical rotated-frame coordinates while retaining scale metadata', () => {
    const sheet = scalePackSheet(makeSheet(), 0.5);
    const output = JSON.parse(
      jsonHash.generate(sheet, {
        fileName: 'atlas',
        imageFileName: () => 'atlas@0.5x.png',
        dataFileName: 'atlas@0.5x.json',
        scale: 0.5,
      }),
    );

    expect(output.meta).toMatchObject({
      image: 'atlas@0.5x.png',
      size: { w: 32, h: 24 },
      scale: 0.5,
    });
    expect(output.frames['hero.png']).toMatchObject({
      frame: { x: 7, y: 9, w: 4, h: 6 },
      rotated: true,
      spriteSourceSize: { x: 2, y: 3, w: 6, h: 4 },
      sourceSize: { w: 11, h: 8 },
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid scale %s',
    (scale) => {
      expect(() => scalePackSheet(makeSheet(), scale)).toThrow(RangeError);
    },
  );
});
