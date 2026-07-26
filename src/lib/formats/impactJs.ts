import type { FormatGenerator } from './types';

/**
 * Impact.js baker format. Impact's `ig.Image` accepts a lean manifest with an
 * `image` reference, the sheet's dimensions, and a `sub` array of atlas frames.
 * Rotation is not part of the runtime, so callers should disable it when
 * targeting Impact.js.
 */
const impactJs: FormatGenerator = {
  extension: 'json',
  label: 'Impact.js',
  generate(sheet, opts) {
    const data = {
      image: opts.imageFileName(sheet.index),
      w: sheet.width,
      h: sheet.height,
      scale: opts.scale ?? 1,
      sub: sheet.packed.map((item) => {
        const fw = item.rotated ? item.height : item.width;
        const fh = item.rotated ? item.width : item.height;
        return {
          name: item.name,
          x: item.x,
          y: item.y,
          w: fw,
          h: fh,
          rotated: item.rotated,
          trimmed: item.trimmed,
          sourceW: item.sourceSize.w,
          sourceH: item.sourceSize.h,
          offsetX: item.spriteSourceSize.x,
          offsetY: item.spriteSourceSize.y,
        };
      }),
    };
    return JSON.stringify(data, null, 2);
  },
};

export default impactJs;
