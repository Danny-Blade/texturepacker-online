import type { FormatGenerator } from './types';

const cocosCreator: FormatGenerator = {
  extension: 'json',
  label: 'Cocos Creator',
  generate(sheet, opts) {
    const image = opts.imageFileName(sheet.index);
    const spriteFrames: Record<string, object> = {};
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      const offsetX = Math.round(
        item.spriteSourceSize.x + item.spriteSourceSize.w / 2 - item.sourceSize.w / 2,
      );
      const offsetY = Math.round(
        -(item.spriteSourceSize.y + item.spriteSourceSize.h / 2 - item.sourceSize.h / 2),
      );
      spriteFrames[item.name] = {
        rect: [item.x, item.y, fw, fh],
        rotated: item.rotated,
        offset: [item.trimmed ? offsetX : 0, item.trimmed ? offsetY : 0],
        originalSize: [item.sourceSize.w, item.sourceSize.h],
      };
    }
    const data = {
      __type__: 'cc.SpriteAtlas',
      name: opts.fileName,
      _native: image,
      spriteFrames,
      size: [sheet.width, sheet.height],
    };
    return JSON.stringify(data, null, 2);
  },
};

export default cocosCreator;
