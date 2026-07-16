import type { FormatGenerator } from './types';
import { spriteMetadataForExport } from '../spriteMetadata';

const jsonArray: FormatGenerator = {
  extension: 'json',
  label: 'JSON (Array)',
  generate(sheet, opts) {
    const scale = opts.scale ?? 1;
    const data = {
      meta: {
        image: opts.imageFileName(sheet.index),
        size: { w: sheet.width, h: sheet.height },
        scale,
        format: 'RGBA8888',
        app: 'Web TexturePacker',
        version: '1.0',
      },
      frames: sheet.packed.map((item) => {
        const frame: Record<string, unknown> = {
          filename: item.name,
          frame: {
            x: item.x,
            y: item.y,
            w: item.rotated ? item.height : item.width,
            h: item.rotated ? item.width : item.height,
          },
          rotated: item.rotated,
          trimmed: item.trimmed,
          spriteSourceSize: item.spriteSourceSize,
          sourceSize: item.sourceSize,
        };
        if (item.polygon && item.polygon.length >= 6) {
          frame.polygon = item.polygon.slice();
        }
        const spriteMetadata = spriteMetadataForExport(
          item.metadata,
          item.sourceSize.w / scale,
          item.sourceSize.h / scale,
          scale,
        );
        if (spriteMetadata) frame.metadata = spriteMetadata;
        return frame;
      }),
    };
    return JSON.stringify(data, null, 2);
  },
};

export default jsonArray;
