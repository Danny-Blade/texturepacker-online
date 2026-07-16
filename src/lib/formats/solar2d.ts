import type { FormatGenerator } from './types';

function quoteLua(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`;
}

const solar2d: FormatGenerator = {
  extension: 'lua',
  label: 'Solar2D',
  generate(sheet) {
    const rotated = sheet.packed.find((item) => item.rotated);
    if (rotated) {
      throw new Error(
        `Solar2D image sheets do not support rotated frames; disable rotation and repack before exporting "${rotated.name}".`,
      );
    }
    const lines = [
      'local SheetInfo = {}',
      '',
      'SheetInfo.sheet =',
      '{',
      '    frames =',
      '    {',
    ];
    sheet.packed.forEach((item, index) => {
      lines.push(
        '        {',
        `            -- ${item.name.replace(/[\r\n]/g, ' ')}`,
        `            x = ${item.x},`,
        `            y = ${item.y},`,
        `            width = ${item.width},`,
        `            height = ${item.height},`,
        `            sourceX = ${item.spriteSourceSize.x},`,
        `            sourceY = ${item.spriteSourceSize.y},`,
        `            sourceWidth = ${item.sourceSize.w},`,
        `            sourceHeight = ${item.sourceSize.h},`,
        `        }${index < sheet.packed.length - 1 ? ',' : ''}`,
      );
    });
    lines.push(
      '    },',
      `    sheetContentWidth = ${sheet.width},`,
      `    sheetContentHeight = ${sheet.height},`,
      '}',
      '',
      'SheetInfo.frameIndex =',
      '{',
    );
    sheet.packed.forEach((item, index) => {
      lines.push(`    [${quoteLua(item.name)}] = ${index + 1},`);
    });
    lines.push(
      '}',
      '',
      'function SheetInfo:getSheet()',
      '    return self.sheet',
      'end',
      '',
      'function SheetInfo:getFrameIndex(name)',
      '    return self.frameIndex[name]',
      'end',
      '',
      'return SheetInfo',
    );
    return lines.join('\n');
  },
};

export default solar2d;
