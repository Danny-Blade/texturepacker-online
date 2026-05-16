import type { FormatGenerator } from './types';

const phaser3: FormatGenerator = {
  extension: 'json',
  label: 'Phaser 3',
  generate(sheet, opts) {
    const data = {
      textures: [
        {
          image: opts.imageFileName(sheet.index),
          format: 'RGBA8888',
          size: { w: sheet.width, h: sheet.height },
          scale: opts.scale ?? 1,
          frames: sheet.packed.map((item) => ({
            filename: item.name,
            rotated: item.rotated,
            trimmed: item.trimmed,
            sourceSize: item.sourceSize,
            spriteSourceSize: item.spriteSourceSize,
            frame: {
              x: item.x,
              y: item.y,
              w: item.rotated ? item.height : item.width,
              h: item.rotated ? item.width : item.height,
            },
          })),
        },
      ],
    };
    return JSON.stringify(data, null, 2);
  },
};

export default phaser3;
