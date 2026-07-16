import type { FormatGenerator } from './types';
import { readSpriteMetadata, resolvePivot, scaleInsets } from '../spriteMetadata';

const cocos2d: FormatGenerator = {
  extension: 'plist',
  label: 'Cocos2d',
  generate(sheet, opts) {
    const image = opts.imageFileName(sheet.index);
    const scale = opts.scale ?? 1;
    let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
    out += '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';
    out += '<plist version="1.0">\n<dict>\n';
    out += '  <key>frames</key>\n  <dict>\n';
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      out += `    <key>${escapeXml(item.name)}</key>\n    <dict>\n`;
      out += `      <key>frame</key>\n`;
      out += `      <string>{{${item.x},${item.y}},{${fw},${fh}}}</string>\n`;
      out += `      <key>offset</key>\n`;
      out += `      <string>{${
        item.trimmed
          ? Math.round(item.spriteSourceSize.x + item.spriteSourceSize.w / 2 - item.sourceSize.w / 2)
          : 0
      },${
        item.trimmed
          ? Math.round(-(item.spriteSourceSize.y + item.spriteSourceSize.h / 2 - item.sourceSize.h / 2))
          : 0
      }}</string>\n`;
      out += `      <key>rotated</key>\n      <${item.rotated ? 'true' : 'false'}/>\n`;
      out += `      <key>sourceColorRect</key>\n`;
      out += `      <string>{{${item.spriteSourceSize.x},${item.spriteSourceSize.y}},{${item.spriteSourceSize.w},${item.spriteSourceSize.h}}}</string>\n`;
      out += `      <key>sourceSize</key>\n`;
      out += `      <string>{${item.sourceSize.w},${item.sourceSize.h}}</string>\n`;
      const metadata = readSpriteMetadata(item.metadata);
      if (metadata.pivot) {
        const pivot = resolvePivot(
          metadata,
          item.sourceSize.w / scale,
          item.sourceSize.h / scale,
        ).normalized;
        out += `      <key>anchor</key>\n      <string>{${pivot.x},${pivot.y}}</string>\n`;
      }
      if (metadata.nineSlice) {
        const border = scaleInsets(metadata.nineSlice.border, scale);
        const content = scaleInsets(metadata.nineSlice.content, scale);
        const centerW = Math.max(0, item.sourceSize.w - border.left - border.right);
        const centerH = Math.max(0, item.sourceSize.h - border.top - border.bottom);
        const contentW = Math.max(0, item.sourceSize.w - content.left - content.right);
        const contentH = Math.max(0, item.sourceSize.h - content.top - content.bottom);
        out += `      <key>capInsets</key>\n      <string>{{${border.left},${border.bottom}},{${centerW},${centerH}}}</string>\n`;
        out += `      <key>contentRect</key>\n      <string>{{${content.left},${content.bottom}},{${contentW},${contentH}}}</string>\n`;
      }
      out += '    </dict>\n';
    }
    out += '  </dict>\n';
    out += '  <key>metadata</key>\n  <dict>\n';
    out += '    <key>format</key>\n    <integer>2</integer>\n';
    out += `    <key>size</key>\n    <string>{${sheet.width},${sheet.height}}</string>\n`;
    out += `    <key>textureFileName</key>\n    <string>${image}</string>\n`;
    out += '  </dict>\n</dict>\n</plist>';
    return out;
  },
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export default cocos2d;
