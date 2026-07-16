import type { FormatGenerator } from './types';

const monoGame: FormatGenerator = {
  extension: 'json',
  label: 'MonoGame Extended',
  generate(sheet, opts) {
    const frames: Record<string, object> = {};
    for (const item of sheet.packed) {
      const frame: Record<string, unknown> = {
        frame: {
          x: item.x,
          y: item.y,
          w: item.rotated ? item.height : item.width,
          h: item.rotated ? item.width : item.height,
        },
        size: { w: item.sourceSize.w, h: item.sourceSize.h },
        offset: { x: item.spriteSourceSize.x, y: item.spriteSourceSize.y },
        pivot: { x: 0.5, y: 0.5 },
      };
      if (item.rotated) frame.rotated = 90;
      frames[item.name] = frame;
    }
    return JSON.stringify(
      {
        textures: [{ filename: opts.imageFileName(sheet.index), frames }],
        meta: { dataformat: 'monogame-extended', version: '1.2' },
      },
      null,
      2,
    );
  },
};

export default monoGame;
