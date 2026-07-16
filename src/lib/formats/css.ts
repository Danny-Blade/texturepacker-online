import type { FormatGenerator } from './types';

const css: FormatGenerator = {
  extension: 'css',
  label: 'CSS',
  generate(sheet, opts) {
    const image = opts.imageFileName(sheet.index);
    let out = `.sprite { background-image: url('${image}'); background-repeat: no-repeat; }\n\n`;
    for (const item of sheet.packed) {
      const cls = item.name.replace(/[^a-zA-Z0-9_-]/g, '-');
      const w = item.rotated ? item.height : item.width;
      const h = item.rotated ? item.width : item.height;
      out += `.sprite-${cls} {\n`;
      out += `  width: ${w}px;\n`;
      out += `  height: ${h}px;\n`;
      out += `  background-position: -${item.x}px -${item.y}px;\n`;
      out += `}\n\n`;
    }
    return out;
  },
};

export default css;
