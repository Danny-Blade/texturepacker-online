import type { FormatGenerator, FormatOptions } from './types';
import type { PackSheet } from '../packer';
import { compileTemplate, type TemplateContext } from '../templates/dsl';
import type { CustomTemplate } from '../templates/store';

/**
 * Adapt a user-authored template into a FormatGenerator so the publish pipeline
 * can treat it exactly like a built-in exporter.
 */
export function makeCustomFormat(template: CustomTemplate): FormatGenerator {
  return {
    extension: sanitizeExtension(template.extension),
    label: template.name,
    generate(sheet, opts) {
      const compiled = compileTemplate(template.source);
      return compiled.render(buildContext(sheet, opts));
    },
  };
}

function sanitizeExtension(ext: string): string {
  const cleaned = (ext || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : 'txt';
}

export function buildContext(sheet: PackSheet, opts: FormatOptions): TemplateContext {
  const scale = opts.scale ?? 1;
  return {
    imageFile: opts.imageFileName(sheet.index),
    dataFile: opts.dataFileName,
    sheet: { index: sheet.index, width: sheet.width, height: sheet.height },
    sprites: sheet.packed.map((item) => {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      const sprite: TemplateContext['sprites'][number] = {
        name: item.name,
        x: item.x,
        y: item.y,
        w: fw,
        h: fh,
        rotated: item.rotated,
        trimmed: item.trimmed,
        sourceSize: { w: item.sourceSize.w, h: item.sourceSize.h },
        spriteSourceSize: {
          x: item.spriteSourceSize.x,
          y: item.spriteSourceSize.y,
          w: item.spriteSourceSize.w,
          h: item.spriteSourceSize.h,
        },
      };
      if (item.polygon && item.polygon.length >= 6) sprite.polygon = item.polygon.slice();
      return sprite;
    }),
    meta: { app: 'Web TexturePacker', version: '1.0', scale },
  };
}
