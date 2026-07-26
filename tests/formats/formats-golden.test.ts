import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_EXPORT_FORMATS, getFormat } from '../../src/lib/formats';
import type { ExportFormat, PackedItem, PackSheet } from '../../src/lib/packer';
import { scalePackSheet } from '../../src/lib/publish';

interface GoldenCase {
  format: ExportFormat;
  extension: string;
  fixture: string;
}

const goldenCases: GoldenCase[] = [
  { format: 'json', extension: 'json', fixture: 'json-hash.golden.json' },
  { format: 'json-array', extension: 'json', fixture: 'json-array.golden.json' },
  { format: 'css', extension: 'css', fixture: 'css.golden.css' },
  { format: 'xml', extension: 'xml', fixture: 'xml.golden.xml' },
  { format: 'cocos2d', extension: 'plist', fixture: 'cocos2d.golden.plist' },
  { format: 'cocos-creator', extension: 'json', fixture: 'cocos-creator.golden.json' },
  { format: 'phaser3', extension: 'json', fixture: 'phaser3.golden.json' },
  { format: 'unity', extension: 'json', fixture: 'unity.golden.json' },
  { format: 'spine', extension: 'atlas', fixture: 'spine.golden.atlas' },
  { format: 'godot', extension: 'tres', fixture: 'godot.golden.tres' },
  { format: 'gamemaker', extension: 'json', fixture: 'gamemaker.golden.json' },
  { format: 'pixi', extension: 'json', fixture: 'pixi.golden.json' },
  { format: 'libgdx', extension: 'atlas', fixture: 'libgdx.golden.atlas' },
  { format: 'defold', extension: 'tpinfo', fixture: 'defold.golden.tpinfo' },
  { format: 'spritekit', extension: 'atlasc', fixture: 'spritekit.golden.atlasc' },
  { format: 'paper2d', extension: 'paper2dsprites', fixture: 'paper2d.golden.paper2dsprites' },
  { format: 'monogame', extension: 'json', fixture: 'monogame.golden.json' },
  { format: 'solar2d', extension: 'lua', fixture: 'solar2d.golden.lua' },
];

function makeScaledMultipackSheet(rotated = true): PackSheet {
  const item: PackedItem = {
    id: 'hero-id',
    name: 'hero&boss.png',
    width: 10,
    height: 6,
    image: {} as HTMLImageElement,
    url: 'blob:hero',
    x: 7,
    y: 11,
    rotated,
    placed: true,
    sheetIndex: 2,
    trimmed: true,
    sourceSize: { w: 16, h: 14 },
    spriteSourceSize: { x: 2, y: 3, w: 10, h: 6 },
    extrudePadding: 1,
    polygon: [0, 0, 10, 0, 10, 6, 0, 6],
  };
  return scalePackSheet({ index: 2, width: 64, height: 48, packed: [item] }, 2);
}

function generate(format: ExportFormat): { output: string; imageRequests: number[] } {
  const generator = getFormat(format);
  const imageRequests: number[] = [];
  const output = generator.generate(makeScaledMultipackSheet(format !== 'solar2d'), {
    fileName: 'atlas',
    imageFileName: (sheetIndex) => {
      imageRequests.push(sheetIndex);
      return `atlas-${sheetIndex + 1}@2x.png`;
    },
    dataFileName: `atlas-3@2x.${generator.extension}`,
    scale: 2,
  });
  return { output, imageRequests };
}

describe('format generator compatibility fixtures', () => {
  it('locks the 18-format golden data-format set and extensions', () => {
    // Golden fixtures cover data-format generators. Code-file generators
    // (Swift, C#, C++ — see tests/formats-code.test.ts) live in ALL_EXPORT_FORMATS
    // too but do not participate in the golden fixture set, so we check the
    // golden formats appear in ALL_EXPORT_FORMATS in the expected order rather
    // than demanding array equality.
    const nonGoldenFormats: ExportFormat[] = [
      'swift', 'csharp', 'cpp',                                  // code-file generators
      'cocos2d-js', 'construct3', 'melonjs', 'impactjs', 'kwavan', // P3-07 long-tail
    ];
    expect(ALL_EXPORT_FORMATS.filter((f) => !nonGoldenFormats.includes(f))).toEqual(
      goldenCases.map(({ format }) => format),
    );
    expect(goldenCases).toHaveLength(18);
    for (const { format, extension } of goldenCases) {
      expect(getFormat(format).extension).toBe(extension);
    }
  });

  it.each(goldenCases)('$format matches its golden output', ({ format, fixture }) => {
    const { output, imageRequests } = generate(format);
    const golden = readFileSync(
      new URL(`../fixtures/formats/${fixture}`, import.meta.url),
      'utf8',
    );

    expect(output.trimEnd()).toBe(golden.trimEnd());
    // Solar2D's official ImageSheet options table is passed to
    // graphics.newImageSheet(imageName, options), so it intentionally does not
    // embed a texture path. All other formats reference the page explicitly.
    expect(imageRequests).toEqual(format === 'solar2d' ? [] : [2]);
    if (format !== 'solar2d') expect(output).toContain('atlas-3@2x.png');
  });

  it.each([
    'json',
    'json-array',
    'cocos-creator',
    'phaser3',
    'unity',
    'gamemaker',
    'pixi',
    'paper2d',
    'monogame',
  ] as ExportFormat[])('$format remains parseable JSON', (format) => {
    expect(() => JSON.parse(generate(format).output)).not.toThrow();
  });

  it('keeps Starling XML escaped and physically scaled', () => {
    const output = generate('xml').output;
    expect(output).toContain('name="hero&amp;boss.png"');
    expect(output).toContain('x="14" y="22" width="12" height="20"');
    expect(output).toContain('frameX="-4" frameY="-6" frameWidth="32" frameHeight="28"');
  });

  it('keeps Cocos2d plist keys and physical values readable', () => {
    const output = generate('cocos2d').output;
    expect(output).toContain('<key>hero&amp;boss.png</key>');
    expect(output).toContain('<string>{{14,22},{12,20}}</string>');
    expect(output).toContain('<string>{32,28}</string>');
  });

  it('emits Defold tpinfo v2 text protobuf with a complete rectangular mesh', () => {
    const output = generate('defold').output;
    expect(output).toContain('version: "2.0"');
    expect(output).toContain('name: "atlas-3@2x.png"');
    expect(output).toContain('rotated: true');
    expect(output).toContain('indices: [1, 2, 3, 0, 1, 3]');
    expect(output.match(/vertices \{/g)).toHaveLength(4);
    expect(output.match(/\{/g) ?? []).toHaveLength((output.match(/\}/g) ?? []).length);
  });

  it('emits SpriteKit plist format 3 with rotation, trim, and escaped names', () => {
    const output = generate('spritekit').output;
    expect(output).toContain('<!DOCTYPE plist PUBLIC');
    expect(output).toContain('<key>hero&amp;boss.png</key>');
    expect(output).toContain('<key>textureRotated</key>\n      <true/>');
    expect(output).toContain('<key>format</key>\n    <integer>3</integer>');
    expect(output).toContain('<string>atlas-3@2x.png</string>');
  });

  it('emits the Unreal Paper2D importer target and TexturePacker hash fields', () => {
    const data = JSON.parse(generate('paper2d').output);
    expect(data.meta).toMatchObject({
      target: 'paper2d',
      image: 'atlas-3@2x.png',
      size: { w: 128, h: 96 },
      scale: '2',
    });
    expect(data.frames['hero&boss.png']).toEqual({
      frame: { x: 14, y: 22, w: 12, h: 20 },
      rotated: true,
      trimmed: true,
      spriteSourceSize: { x: 4, y: 6, w: 20, h: 12 },
      sourceSize: { w: 32, h: 28 },
    });
  });

  it('emits MonoGame.Extended 1.2 JSON accepted by Texture2DAtlas', () => {
    const data = JSON.parse(generate('monogame').output);
    expect(data.meta).toEqual({ dataformat: 'monogame-extended', version: '1.2' });
    expect(data.textures).toHaveLength(1);
    expect(data.textures[0].filename).toBe('atlas-3@2x.png');
    expect(data.textures[0].frames['hero&boss.png']).toEqual({
      frame: { x: 14, y: 22, w: 12, h: 20 },
      size: { w: 32, h: 28 },
      offset: { x: 4, y: 6 },
      pivot: { x: 0.5, y: 0.5 },
      rotated: 90,
    });
  });

  it('emits Solar2D complex ImageSheet data and name lookup helpers', () => {
    const output = generate('solar2d').output;
    expect(output).toContain('sheetContentWidth = 128');
    expect(output).toContain('sheetContentHeight = 96');
    expect(output).toContain('sourceX = 4');
    expect(output).toContain('sourceWidth = 32');
    expect(output).toContain('["hero&boss.png"] = 1');
    expect(output).toContain('function SheetInfo:getFrameIndex(name)');
    expect(output.trimEnd()).toMatch(/return SheetInfo$/);
  });

  it('rejects rotated Solar2D frames instead of producing invalid ImageSheet data', () => {
    const generator = getFormat('solar2d');
    expect(() =>
      generator.generate(makeScaledMultipackSheet(true), {
        fileName: 'atlas',
        imageFileName: () => 'atlas-3@2x.png',
        dataFileName: 'atlas-3@2x.lua',
        scale: 2,
      }),
    ).toThrow(/do not support rotated frames.*disable rotation/i);
  });
});
