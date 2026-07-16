import type { FormatGenerator } from './types';

const paper2d: FormatGenerator = {
  extension: 'paper2dsprites',
  label: 'Unreal / Paper2D',
  generate(sheet, opts) {
    const frames: Record<string, object> = {};
    for (const item of sheet.packed) {
      frames[item.name] = {
        frame: {
          x: item.x,
          y: item.y,
          w: item.rotated ? item.height : item.width,
          h: item.rotated ? item.width : item.height,
        },
        rotated: item.rotated,
        trimmed: item.trimmed,
        spriteSourceSize: item.spriteSourceSize,
        sourceSize: item.sourceSize,
      };
    }
    return JSON.stringify(
      {
        frames,
        meta: {
          app: 'Web TexturePacker',
          version: '1.0',
          target: 'paper2d',
          image: opts.imageFileName(sheet.index),
          format: 'RGBA8888',
          size: { w: sheet.width, h: sheet.height },
          scale: String(opts.scale ?? 1),
        },
      },
      null,
      2,
    );
  },
};

export default paper2d;
