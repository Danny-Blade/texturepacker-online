import type { FormatGenerator } from './types';

const pixi: FormatGenerator = {
  extension: 'json',
  label: 'PixiJS',
  generate(sheet, opts) {
    const frames: Record<string, object> = {};
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      frames[item.name] = {
        frame: { x: item.x, y: item.y, w: fw, h: fh },
        rotated: item.rotated,
        trimmed: item.trimmed,
        spriteSourceSize: {
          x: item.spriteSourceSize.x,
          y: item.spriteSourceSize.y,
          w: item.spriteSourceSize.w,
          h: item.spriteSourceSize.h,
        },
        sourceSize: { w: item.sourceSize.w, h: item.sourceSize.h },
      };
    }
    const data = {
      frames,
      meta: {
        app: 'Web TexturePacker',
        version: '1.0',
        image: opts.imageFileName(sheet.index),
        format: 'RGBA8888',
        size: { w: sheet.width, h: sheet.height },
        // PixiJS expects scale as a string
        scale: String(opts.scale ?? 1),
      },
    };
    return JSON.stringify(data, null, 2);
  },
};

export default pixi;
