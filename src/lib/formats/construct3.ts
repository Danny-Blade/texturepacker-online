import type { FormatGenerator } from './types';

/**
 * Construct 3 spritesheet manifest. Construct 3 reads a flat frame array with
 * `x/y/w/h` per entry, plus a top-level `type` discriminator so its importer can
 * distinguish sprite sheets from other JSON payloads.
 */
const construct3: FormatGenerator = {
  extension: 'json',
  label: 'Construct 3',
  generate(sheet, opts) {
    const data = {
      type: 'spritesheet',
      app: 'Web TexturePacker',
      image: opts.imageFileName(sheet.index),
      size: { w: sheet.width, h: sheet.height },
      scale: opts.scale ?? 1,
      frames: sheet.packed.map((item) => {
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
          spriteSourceSize: { ...item.spriteSourceSize },
          sourceSize: { w: item.sourceSize.w, h: item.sourceSize.h },
        };
      }),
    };
    return JSON.stringify(data, null, 2);
  },
};

export default construct3;
