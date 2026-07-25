import { describe, expect, it } from 'vitest';
import { compileTemplate, escapeHtml, type TemplateContext } from '../src/lib/templates/dsl';

function makeContext(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    imageFile: 'atlas.png',
    dataFile: 'atlas.txt',
    sheet: { index: 0, width: 512, height: 256 },
    sprites: [
      {
        name: 'hero',
        x: 0,
        y: 0,
        w: 32,
        h: 32,
        rotated: false,
        trimmed: false,
        sourceSize: { w: 32, h: 32 },
        spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      },
      {
        name: 'boss',
        x: 34,
        y: 0,
        w: 48,
        h: 48,
        rotated: true,
        trimmed: true,
        sourceSize: { w: 64, h: 64 },
        spriteSourceSize: { x: 8, y: 8, w: 48, h: 48 },
      },
    ],
    meta: { app: 'Web TexturePacker', version: '1.0', scale: 1 },
    ...overrides,
  };
}

describe('custom template DSL', () => {
  it('renders a dotted-path scalar', () => {
    const ctx = makeContext();
    expect(compileTemplate('Hello {{sheet.width}}x{{sheet.height}}').render(ctx)).toBe(
      'Hello 512x256',
    );
  });

  it('iterates arrays with {{#sprites}}{{/sprites}}', () => {
    const ctx = makeContext();
    const out = compileTemplate('{{#sprites}}{{name}}\n{{/sprites}}').render(ctx);
    expect(out).toBe('hero\nboss\n');
  });

  it('inverted section renders when the array is empty', () => {
    const ctx = makeContext({ sprites: [] });
    expect(compileTemplate('{{^sprites}}none{{/sprites}}').render(ctx)).toBe('none');
  });

  it('inverted section is silent when the array has entries', () => {
    const ctx = makeContext();
    expect(compileTemplate('{{^sprites}}none{{/sprites}}').render(ctx)).toBe('');
  });

  it('HTML-escapes {{name}} but not {{{name}}}', () => {
    const ctx = makeContext({
      sprites: [
        {
          name: '<hero>',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          rotated: false,
          trimmed: false,
          sourceSize: { w: 1, h: 1 },
          spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
        },
      ],
    });
    expect(compileTemplate('{{#sprites}}{{name}}{{/sprites}}').render(ctx)).toBe('&lt;hero&gt;');
    expect(compileTemplate('{{#sprites}}{{{name}}}{{/sprites}}').render(ctx)).toBe('<hero>');
  });

  it('escapeHtml swaps all five reserved characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('comments are stripped from output', () => {
    expect(compileTemplate('a{{! ignore me }}b').render(makeContext())).toBe('ab');
  });

  it('dotted access into the current loop item', () => {
    const ctx = makeContext();
    const out = compileTemplate('{{#sprites}}{{name}}:{{sourceSize.w}}x{{sourceSize.h}}\n{{/sprites}}').render(ctx);
    expect(out).toBe('hero:32x32\nboss:64x64\n');
  });

  it('entering an object section exposes its fields', () => {
    const ctx = makeContext();
    const out = compileTemplate('{{#sheet}}{{width}}x{{height}}{{/sheet}}').render(ctx);
    expect(out).toBe('512x256');
  });

  it('rejects an unclosed section with a descriptive error and line number', () => {
    const src = 'header\n{{#sprites}}\n  {{name}}\n';
    expect(() => compileTemplate(src)).toThrow(/Unclosed section at line 2/);
  });

  it('rejects mismatched closing tags with line context', () => {
    const src = 'a\n{{#sprites}}\n{{/sheet}}';
    expect(() => compileTemplate(src)).toThrow(/Mismatched section/);
  });

  it('rejects invalid identifiers', () => {
    expect(() => compileTemplate('{{a+b}}')).toThrow(/Invalid identifier/);
  });

  it('caps the template source length at 64KB', () => {
    const oversized = 'x'.repeat(64 * 1024 + 1);
    expect(() => compileTemplate(oversized)).toThrow(/exceeds/);
  });

  it('throws when rendered output would exceed 4MB', () => {
    // Loop over sprites and emit ~200 KB per sprite via a repeated literal
    // (the DSL itself won't let a single template string balloon past 64KB,
    // but a modest loop over many entries can, which is the guard under test).
    const bigLiteral = 'x'.repeat(1024); // 1KB per iteration
    const template = `{{#sprites}}${bigLiteral}{{/sprites}}`;
    const ctx: TemplateContext = {
      imageFile: 'a.png',
      dataFile: 'a.txt',
      sheet: { index: 0, width: 1, height: 1 },
      sprites: Array.from({ length: 4096 + 8 }, (_, i) => ({
        name: `s${i}`,
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        rotated: false,
        trimmed: false,
        sourceSize: { w: 1, h: 1 },
        spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
      })),
      meta: { app: 'Web TexturePacker', version: '1.0', scale: 1 },
    };
    expect(() => compileTemplate(template).render(ctx)).toThrow(/exceeded/);
  });
});
