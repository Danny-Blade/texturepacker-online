import { describe, expect, it } from 'vitest';
import { getFormat } from '../src/lib/formats';
import type { ExportFormat, PackSheet, PackedItem } from '../src/lib/packer';
import type { FormatOptions } from '../src/lib/formats/types';

/**
 * Minimal two-sprite sheet used to smoke-test the long-tail formats added by
 * P3-07. One sprite is rotated (frame w/h swap), the other is trimmed.
 */
function makeSheet(): PackSheet {
  const items: PackedItem[] = [
    {
      id: 'hero-id',
      name: 'hero',
      width: 32,
      height: 32,
      image: {} as HTMLImageElement,
      url: 'blob:hero',
      x: 0,
      y: 0,
      rotated: false,
      placed: true,
      sheetIndex: 0,
      trimmed: true,
      sourceSize: { w: 40, h: 40 },
      spriteSourceSize: { x: 4, y: 4, w: 32, h: 32 },
    },
    {
      id: 'foe-id',
      name: 'foe/idle',
      width: 16,
      height: 24,
      image: {} as HTMLImageElement,
      url: 'blob:foe',
      x: 40,
      y: 0,
      rotated: true,
      placed: true,
      sheetIndex: 0,
      trimmed: false,
      sourceSize: { w: 16, h: 24 },
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 24 },
    },
  ];
  return { index: 0, width: 128, height: 128, packed: items };
}

function options(): FormatOptions {
  return {
    fileName: 'atlas',
    imageFileName: () => 'atlas.png',
    dataFileName: 'atlas.json',
    scale: 1,
  };
}

interface LongTailCase {
  format: ExportFormat;
  extension: string;
  label: string;
  starts: string;
  isJson: boolean;
}

const cases: LongTailCase[] = [
  { format: 'cocos2d-js', extension: 'js', label: 'Cocos2d-JS', starts: '//', isJson: false },
  { format: 'construct3', extension: 'json', label: 'Construct 3', starts: '{', isJson: true },
  { format: 'melonjs', extension: 'json', label: 'Melon.js', starts: '{', isJson: true },
  { format: 'impactjs', extension: 'json', label: 'Impact.js', starts: '{', isJson: true },
  { format: 'kwavan', extension: 'json', label: 'Kwavan', starts: '{', isJson: true },
];

describe('P3-07 long-tail export formats', () => {
  it.each(cases)('$format advertises its extension and label', ({ format, extension, label }) => {
    const gen = getFormat(format);
    expect(gen.extension).toBe(extension);
    expect(gen.label).toBe(label);
  });

  it.each(cases)('$format emits both sprite names verbatim and a valid header', ({ format, starts }) => {
    const output = getFormat(format).generate(makeSheet(), options());
    expect(output.trimStart().startsWith(starts)).toBe(true);
    expect(output).toContain('"hero"');
    expect(output).toContain('"foe/idle"');
  });

  it('Cocos2d-JS output is a CommonJS module wrapping a JSON body', () => {
    const output = getFormat('cocos2d-js').generate(makeSheet(), options());
    expect(output).toContain('module.exports =');
    const jsonBody = output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1);
    const parsed = JSON.parse(jsonBody) as { frames: Record<string, unknown> };
    expect(Object.keys(parsed.frames)).toHaveLength(2);
  });

  it.each(cases.filter((c) => c.isJson))('$format parses as JSON with two frames', ({ format }) => {
    const output = getFormat(format).generate(makeSheet(), options());
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const frames = collectFrames(parsed);
    expect(frames).toHaveLength(2);
  });

  it('Construct 3 marks the payload as a spritesheet', () => {
    const parsed = JSON.parse(getFormat('construct3').generate(makeSheet(), options())) as {
      type: string;
    };
    expect(parsed.type).toBe('spritesheet');
  });

  it('Melon.js wraps frames under a textures[] entry with camelCase keys', () => {
    const parsed = JSON.parse(getFormat('melonjs').generate(makeSheet(), options())) as {
      textures: Array<{ frames: Array<Record<string, unknown>> }>;
    };
    expect(parsed.textures).toHaveLength(1);
    const first = parsed.textures[0].frames[0];
    expect(first).toHaveProperty('filename');
    expect(first).toHaveProperty('spriteSourceSize');
    expect(first).toHaveProperty('sourceSize');
  });

  it('Impact.js exposes a flat sub[] and rotates the frame dimensions', () => {
    const parsed = JSON.parse(getFormat('impactjs').generate(makeSheet(), options())) as {
      sub: Array<{ name: string; w: number; h: number; rotated: boolean }>;
    };
    const foe = parsed.sub.find((entry) => entry.name === 'foe/idle');
    expect(foe).toBeDefined();
    // Rotated: frame w/h are swapped from the source width/height.
    expect(foe?.w).toBe(24);
    expect(foe?.h).toBe(16);
    expect(foe?.rotated).toBe(true);
  });

  it('Kwavan encodes rects as [x, y, w, h] tuples', () => {
    const parsed = JSON.parse(getFormat('kwavan').generate(makeSheet(), options())) as {
      sheet: { image: string; dimensions: [number, number] };
      frames: Array<{ name: string; rect: [number, number, number, number] }>;
    };
    expect(parsed.sheet.dimensions).toEqual([128, 128]);
    const hero = parsed.frames.find((frame) => frame.name === 'hero');
    expect(hero?.rect).toEqual([0, 0, 32, 32]);
  });
});

function collectFrames(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.frames)) return payload.frames as unknown[];
  if (payload.frames && typeof payload.frames === 'object') {
    return Object.values(payload.frames as Record<string, unknown>);
  }
  if (Array.isArray(payload.sub)) return payload.sub as unknown[];
  if (Array.isArray(payload.textures)) {
    const first = payload.textures[0] as { frames?: unknown[] } | undefined;
    if (first && Array.isArray(first.frames)) return first.frames;
  }
  return [];
}
