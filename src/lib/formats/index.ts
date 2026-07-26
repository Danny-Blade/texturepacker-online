import type { ExportFormat, PackedItem, PackSheet } from '../packer';
import type { FormatGenerator, FormatOptions } from './types';
import jsonHash from './jsonHash';
import jsonArray from './jsonArray';
import css from './css';
import xml from './xml';
import cocos2d from './cocos2d';
import phaser3 from './phaser3';
import unity from './unity';
import spine from './spine';
import godot from './godot';
import gamemaker from './gamemaker';
import pixi from './pixi';
import libgdx from './libgdx';
import cocosCreator from './cocosCreator';
import defold from './defold';
import spriteKit from './spriteKit';
import paper2d from './paper2d';
import monoGame from './monoGame';
import solar2d from './solar2d';
import swift from './swift';
import csharp from './csharp';
import cpp from './cpp';
import cocos2dJs from './cocos2dJs';
import construct3 from './construct3';
import melonJs from './melonJs';
import impactJs from './impactJs';
import kwavan from './kwavan';

const customPlaceholder: FormatGenerator = {
  extension: 'txt',
  label: 'Custom template',
  generate() {
    throw new Error(
      'Select a custom template via the Publish dialog — the "custom" format needs a template id.',
    );
  },
};

export const FORMATS: Record<ExportFormat, FormatGenerator> = {
  json: jsonHash,
  'json-array': jsonArray,
  css,
  xml,
  cocos2d,
  phaser3,
  unity,
  spine,
  godot,
  gamemaker,
  pixi,
  libgdx,
  'cocos-creator': cocosCreator,
  defold,
  spritekit: spriteKit,
  paper2d,
  monogame: monoGame,
  solar2d,
  swift,
  csharp,
  cpp,
  'cocos2d-js': cocos2dJs,
  construct3,
  melonjs: melonJs,
  impactjs: impactJs,
  kwavan,
  custom: customPlaceholder,
};

export const ALL_EXPORT_FORMATS: ExportFormat[] = [
  'json',
  'json-array',
  'css',
  'xml',
  'cocos2d',
  'cocos-creator',
  'phaser3',
  'unity',
  'spine',
  'godot',
  'gamemaker',
  'pixi',
  'libgdx',
  'defold',
  'spritekit',
  'paper2d',
  'monogame',
  'solar2d',
  'swift',
  'csharp',
  'cpp',
  'cocos2d-js',
  'construct3',
  'melonjs',
  'impactjs',
  'kwavan',
];

/**
 * Resolve a format id string to a FormatGenerator. Accepts both built-in
 * ExportFormat literals and `custom:<templateId>` addressing user templates
 * from `lib/templates/store.ts`. Returns null when the id is unknown.
 */
export function getFormatById(id: string): FormatGenerator | null {
  if (id in FORMATS) return FORMATS[id as ExportFormat];
  return null;
}

export function getFormat(fmt: ExportFormat): FormatGenerator {
  return FORMATS[fmt] ?? jsonHash;
}

/**
 * Legacy compatibility wrapper: build one data string for the first sheet only.
 * Multi-sheet publishing should iterate sheets and call `getFormat(fmt).generate(sheet, opts)` directly.
 */
export function generateExportData(
  packed: PackedItem[],
  width: number,
  height: number,
  format: ExportFormat,
  imageName: string = 'spritesheet.png',
): string {
  const sheet: PackSheet = { index: 0, width, height, packed };
  const opts: FormatOptions = {
    fileName: imageName.replace(/\.[^.]+$/, ''),
    imageFileName: () => imageName,
    dataFileName: imageName.replace(/\.[^.]+$/, '') + '.' + getFormat(format).extension,
    scale: 1,
  };
  return getFormat(format).generate(sheet, opts);
}

export type { FormatGenerator, FormatOptions };
