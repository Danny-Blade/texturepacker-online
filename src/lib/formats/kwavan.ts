import type { FormatGenerator } from './types';

/**
 * Kwavan framework atlas. Manifests describe a single sheet with a compact
 * `rect: [x, y, w, h]` per frame plus the trimmed source rect, keeping the
 * runtime parser trivial. The shape is intentionally minimal so it can be
 * consumed with a hand-rolled loader.
 */
const kwavan: FormatGenerator = {
  extension: 'json',
  label: 'Kwavan',
  generate(sheet, opts) {
    const data = {
      sheet: {
        image: opts.imageFileName(sheet.index),
        dimensions: [sheet.width, sheet.height],
        scale: opts.scale ?? 1,
      },
      frames: sheet.packed.map((item) => {
        const fw = item.rotated ? item.height : item.width;
        const fh = item.rotated ? item.width : item.height;
        return {
          name: item.name,
          rect: [item.x, item.y, fw, fh],
          rotated: item.rotated,
          trimmed: item.trimmed,
          source: [item.sourceSize.w, item.sourceSize.h],
          offset: [item.spriteSourceSize.x, item.spriteSourceSize.y],
        };
      }),
    };
    return JSON.stringify(data, null, 2);
  },
};

export default kwavan;
