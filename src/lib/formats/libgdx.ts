import type { FormatGenerator } from './types';

const libgdx: FormatGenerator = {
  extension: 'atlas',
  label: 'LibGDX',
  generate(sheet, opts) {
    const image = opts.imageFileName(sheet.index);
    let out = '';
    out += `\n${image}\n`;
    out += `size: ${sheet.width},${sheet.height}\n`;
    out += `format: RGBA8888\n`;
    out += `filter: Nearest,Nearest\n`;
    out += `repeat: none\n`;
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      const origW = item.sourceSize.w;
      const origH = item.sourceSize.h;
      const offsetX = item.spriteSourceSize.x;
      const offsetY = origH - item.spriteSourceSize.h - item.spriteSourceSize.y;
      out += `${item.name}\n`;
      out += `  rotate: ${item.rotated ? 'true' : 'false'}\n`;
      out += `  xy: ${item.x}, ${item.y}\n`;
      out += `  size: ${fw}, ${fh}\n`;
      out += `  orig: ${origW}, ${origH}\n`;
      out += `  offset: ${offsetX}, ${offsetY}\n`;
      out += `  index: -1\n`;
    }
    return out;
  },
};

export default libgdx;
