import type { FormatGenerator } from './types';

const jsonHash: FormatGenerator = {
  extension: 'json',
  label: 'JSON (Hash)',
  generate(sheet, opts) {
    const scale = opts.scale ?? 1;
    const data = {
      meta: {
        image: opts.imageFileName(sheet.index),
        size: { w: sheet.width, h: sheet.height },
        scale,
        format: 'RGBA8888',
        app: 'Web TexturePacker',
        version: '1.0',
      },
      frames: {} as Record<string, object>,
    };
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      data.frames[item.name] = {
        frame: { x: item.x, y: item.y, w: fw, h: fh },
        rotated: item.rotated,
        trimmed: item.trimmed,
        spriteSourceSize: item.spriteSourceSize,
        sourceSize: item.sourceSize,
      };
    }
    return JSON.stringify(data, null, 2);
  },
};

export default jsonHash;
