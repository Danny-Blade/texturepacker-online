import type { FormatGenerator } from './types';

/**
 * Melon.js atlas. `me.loader.load` reads a TexturePacker JSON-Array payload
 * wrapped in a `textures` list; each frame uses `filename` and camelCase
 * `sourceSize` / `spriteSourceSize` keys.
 */
const melonJs: FormatGenerator = {
  extension: 'json',
  label: 'Melon.js',
  generate(sheet, opts) {
    const scale = opts.scale ?? 1;
    const data = {
      textures: [
        {
          image: opts.imageFileName(sheet.index),
          format: 'RGBA8888',
          size: { w: sheet.width, h: sheet.height },
          scale,
          frames: sheet.packed.map((item) => {
            const fw = item.rotated ? item.height : item.width;
            const fh = item.rotated ? item.width : item.height;
            return {
              filename: item.name,
              frame: { x: item.x, y: item.y, w: fw, h: fh },
              rotated: item.rotated,
              trimmed: item.trimmed,
              spriteSourceSize: { ...item.spriteSourceSize },
              sourceSize: { w: item.sourceSize.w, h: item.sourceSize.h },
            };
          }),
        },
      ],
      meta: {
        app: 'Web TexturePacker',
        version: '1.0',
      },
    };
    return JSON.stringify(data, null, 2);
  },
};

export default melonJs;
