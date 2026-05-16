import type { FormatGenerator } from './types';

const unity: FormatGenerator = {
  extension: 'json',
  label: 'Unity',
  generate(sheet, opts) {
    const sprites = sheet.packed.map((item) => ({
      name: item.name,
      rect: {
        x: item.x,
        y: sheet.height - item.y - (item.rotated ? item.width : item.height),
        width: item.rotated ? item.height : item.width,
        height: item.rotated ? item.width : item.height,
      },
      pivot: { x: 0.5, y: 0.5 },
      border: { x: 0, y: 0, z: 0, w: 0 },
      rotated: item.rotated,
      trimmed: item.trimmed,
    }));
    return JSON.stringify(
      { texture: opts.imageFileName(sheet.index), sprites, size: { w: sheet.width, h: sheet.height } },
      null,
      2,
    );
  },
};

export default unity;
