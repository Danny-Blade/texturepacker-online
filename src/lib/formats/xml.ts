import type { FormatGenerator } from './types';

const xml: FormatGenerator = {
  extension: 'xml',
  label: 'XML (Starling)',
  generate(sheet, opts) {
    const image = opts.imageFileName(sheet.index);
    let out = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    out += `<TextureAtlas imagePath="${image}" width="${sheet.width}" height="${sheet.height}">\n`;
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      out += `  <SubTexture name="${escapeAttr(item.name)}" x="${item.x}" y="${item.y}" width="${fw}" height="${fh}"`;
      if (item.rotated) out += ` rotated="true"`;
      if (item.trimmed) {
        out += ` frameX="${-item.spriteSourceSize.x}" frameY="${-item.spriteSourceSize.y}" frameWidth="${item.sourceSize.w}" frameHeight="${item.sourceSize.h}"`;
      }
      out += `/>\n`;
    }
    out += `</TextureAtlas>`;
    return out;
  },
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export default xml;
