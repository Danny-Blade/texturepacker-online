import type { PackedItem } from '../packer';
import type { FormatGenerator } from './types';

function quote(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`;
}

function point(name: string, x: number, y: number, indent = '    '): string[] {
  return [
    `${indent}${name} {`,
    `${indent}  x: ${x}`,
    `${indent}  y: ${y}`,
    `${indent}}`,
  ];
}

function size(name: string, width: number, height: number, indent = '  '): string[] {
  return [
    `${indent}${name} {`,
    `${indent}  width: ${width}`,
    `${indent}  height: ${height}`,
    `${indent}}`,
  ];
}

function rect(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  indent = '    ',
): string[] {
  return [
    `${indent}${name} {`,
    `${indent}  x: ${x}`,
    `${indent}  y: ${y}`,
    `${indent}  width: ${width}`,
    `${indent}  height: ${height}`,
    `${indent}}`,
  ];
}

function spriteLines(item: PackedItem): string[] {
  const frameWidth = item.rotated ? item.height : item.width;
  const frameHeight = item.rotated ? item.width : item.height;
  const source = item.spriteSourceSize;
  const x0 = source.x;
  const y0 = source.y;
  const x1 = source.x + source.w;
  const y1 = source.y + source.h;
  const lines = [
    '  sprites {',
    `    name: ${quote(item.name)}`,
    `    trimmed: ${item.trimmed}`,
    `    rotated: ${item.rotated}`,
    '    is_solid: false',
    ...point('corner_offset', source.x, source.y),
    ...rect('source_rect', source.x, source.y, source.w, source.h),
    ...point('pivot', item.sourceSize.w / 2, item.sourceSize.h / 2),
    ...rect('frame_rect', item.x, item.y, frameWidth, frameHeight),
    ...size('untrimmed_size', item.sourceSize.w, item.sourceSize.h, '    '),
    '    indices: [1, 2, 3, 0, 1, 3]',
    ...point('vertices', x1, y0),
    ...point('vertices', x0, y0),
    ...point('vertices', x0, y1),
    ...point('vertices', x1, y1),
    '  }',
  ];
  return lines;
}

const defold: FormatGenerator = {
  extension: 'tpinfo',
  label: 'Defold',
  generate(sheet, opts) {
    const lines = [
      '# Exported by Web TexturePacker',
      '# Text-format protobuf compatible with Defold extension-texturepacker.',
      '',
      'version: "2.0"',
      'description: "Exported using Web TexturePacker"',
      'pages {',
      `  name: ${quote(opts.imageFileName(sheet.index))}`,
      ...size('size', sheet.width, sheet.height),
    ];
    for (const item of sheet.packed) lines.push(...spriteLines(item));
    lines.push('}');
    return lines.join('\n');
  },
};

export default defold;
