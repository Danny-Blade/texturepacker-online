import { describe, expect, it } from 'vitest';
import type { ImageItem, PackedItem, PackResult, PackSheet } from '../src/lib/packer';
import { expandTemplate, previewFilenames } from '../src/lib/publish';
import type { PublishOptions } from '../src/lib/store';

function packed(id: string, name: string, sheetIndex: number): PackedItem {
  const image: ImageItem = {
    id,
    name,
    width: 8,
    height: 8,
    image: {} as HTMLImageElement,
    url: `test:${id}`,
  };
  return {
    ...image,
    x: 0,
    y: 0,
    rotated: false,
    placed: true,
    sheetIndex,
    trimmed: false,
    sourceSize: { w: 8, h: 8 },
    spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
  };
}

function result(): PackResult {
  const sheets: PackSheet[] = [
    { index: 0, width: 8, height: 8, packed: [packed('hero', 'characters/hero', 0)] },
    { index: 1, width: 8, height: 8, packed: [packed('button', 'ui/button', 1)] },
  ];
  return { sheets, failed: [], packed: sheets[0].packed, width: 8, height: 8 };
}

const base: PublishOptions = {
  imageFormat: 'png',
  imageQuality: 1,
  scales: [1],
  imageFileTemplate: '{name}-{v}-{n0}-{n1}-{n}{suffix}.{ext}',
  dataFileTemplate: '{name}-{v}-{n0}-{n1}-{n}{suffix}.{ext}',
  bundleZip: false,
  png8Colors: 256,
  png8Dither: 'none',
  png8DitherStrength: 1,
};

describe('Scaling Variants v2 publishing contracts', () => {
  it('expands zero-based, one-based and variant filename placeholders', () => {
    expect(expandTemplate('{name}-{v}-{n0}-{n1}-{n}.{ext}', {
      name: 'atlas',
      v: 'hd',
      n: '2',
      n0: '1',
      n1: '2',
      suffix: '@1.25x',
      ext: 'png',
      isSingleSheet: false,
    })).toBe('atlas-hd-1-2-2.png');
  });

  it('supports arbitrary scales, names, suffixes and sprite filters', () => {
    const preview = previewFilenames({
      packResult: result(),
      publishOptions: {
        ...base,
        variants: [
          { id: 'all', name: 'hd', scale: 1.25, suffix: '@hd', sort: 'name', algorithm: 'bicubic', sameLayout: true },
          { id: 'ui', name: 'ui-only', scale: 0.75, suffix: '@ui', filter: 'ui/', sort: 'area', algorithm: 'nearest', maxWidth: 128, maxHeight: 128, sameLayout: false },
        ],
      },
      exportFormat: 'json',
      fileName: 'atlas',
    });

    expect(preview.images).toEqual([
      'atlas-hd-0-1-1@hd.png',
      'atlas-hd-1-2-2@hd.png',
      'atlas-ui-only---@ui.png',
    ]);
    expect(preview.dataFiles).toHaveLength(3);
  });
});
