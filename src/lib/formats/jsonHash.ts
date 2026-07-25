import type { FormatGenerator } from './types';
import { spriteMetadataForExport } from '../spriteMetadata';

const jsonHash: FormatGenerator = {
  extension: 'json',
  label: 'JSON (Hash)',
  generate(sheet, opts) {
    const scale = opts.scale ?? 1;
    const meta: Record<string, unknown> = {
      image: opts.imageFileName(sheet.index),
      size: { w: sheet.width, h: sheet.height },
      scale,
      format: 'RGBA8888',
      app: 'Web TexturePacker',
      version: '1.0',
    };
    if (opts.normalMapImageName) meta.normalMap = opts.normalMapImageName;
    const data = {
      meta,
      frames: {} as Record<string, object>,
    };
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      const frame: Record<string, unknown> = {
        frame: { x: item.x, y: item.y, w: fw, h: fh },
        rotated: item.rotated,
        trimmed: item.trimmed,
        spriteSourceSize: item.spriteSourceSize,
        sourceSize: item.sourceSize,
      };
      if (item.polygon && item.polygon.length >= 6) {
        frame.polygon = item.polygon.slice();
      }
      if (item.mesh && item.mesh.vertices.length >= 6 && item.mesh.triangles.length >= 3) {
        // Sprite-local coordinates: vertices and uvs are relative to the
        // (unrotated) trimmed frame origin; atlas consumers apply the frame's
        // sheet placement/rotation themselves.
        frame.mesh = {
          vertices: item.mesh.vertices.slice(),
          triangles: item.mesh.triangles.slice(),
          uvs: item.mesh.uvs.slice(),
        };
      }
      const spriteMetadata = spriteMetadataForExport(
        item.metadata,
        item.sourceSize.w / scale,
        item.sourceSize.h / scale,
        scale,
      );
      if (spriteMetadata) frame.metadata = spriteMetadata;
      data.frames[item.name] = frame;
    }
    return JSON.stringify(data, null, 2);
  },
};

export default jsonHash;
