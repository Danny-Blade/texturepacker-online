import type { FormatGenerator } from './types';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const spriteKit: FormatGenerator = {
  extension: 'atlasc',
  label: 'SpriteKit',
  generate(sheet, opts) {
    const image = escapeXml(opts.imageFileName(sheet.index));
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '  <key>frames</key>',
      '  <dict>',
    ];
    for (const item of sheet.packed) {
      const offsetX = item.spriteSourceSize.x + item.spriteSourceSize.w / 2 - item.sourceSize.w / 2;
      const offsetY = -(item.spriteSourceSize.y + item.spriteSourceSize.h / 2 - item.sourceSize.h / 2);
      lines.push(
        `    <key>${escapeXml(item.name)}</key>`,
        '    <dict>',
        '      <key>aliases</key>',
        '      <array/>',
        '      <key>spriteOffset</key>',
        `      <string>{${offsetX},${offsetY}}</string>`,
        '      <key>spriteSize</key>',
        `      <string>{${item.width},${item.height}}</string>`,
        '      <key>spriteSourceSize</key>',
        `      <string>{${item.sourceSize.w},${item.sourceSize.h}}</string>`,
        '      <key>textureRect</key>',
        `      <string>{{${item.x},${item.y}},{${item.width},${item.height}}}</string>`,
        '      <key>textureRotated</key>',
        `      <${item.rotated ? 'true' : 'false'}/>`,
        '    </dict>',
      );
    }
    lines.push(
      '  </dict>',
      '  <key>metadata</key>',
      '  <dict>',
      '    <key>format</key>',
      '    <integer>3</integer>',
      '    <key>pixelFormat</key>',
      '    <string>RGBA8888</string>',
      '    <key>premultiplyAlpha</key>',
      '    <false/>',
      '    <key>realTextureFileName</key>',
      `    <string>${image}</string>`,
      '    <key>size</key>',
      `    <string>{${sheet.width},${sheet.height}}</string>`,
      '    <key>textureFileName</key>',
      `    <string>${image}</string>`,
      '  </dict>',
      '</dict>',
      '</plist>',
    );
    return lines.join('\n');
  },
};

export default spriteKit;
