import type { FormatGenerator } from './types';

const gamemaker: FormatGenerator = {
  extension: 'json',
  label: 'GameMaker',
  generate(sheet, opts) {
    const data = {
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
          originalW: item.sourceSize.w,
          originalH: item.sourceSize.h,
          offsetX: item.spriteSourceSize.x,
          offsetY: item.spriteSourceSize.y,
        };
      }),
    };
    return JSON.stringify(data, null, 2);
  },
};

export default gamemaker;
