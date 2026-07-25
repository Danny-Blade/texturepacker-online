import type { FormatGenerator } from './types';
import { resolvePivot, readSpriteMetadata, scaleInsets } from '../spriteMetadata';

const unity: FormatGenerator = {
  extension: 'json',
  label: 'Unity',
  generate(sheet, opts) {
    const scale = opts.scale ?? 1;
    const sprites = sheet.packed.map((item) => {
      const sourceWidth = item.sourceSize.w / scale;
      const sourceHeight = item.sourceSize.h / scale;
      const pivot = resolvePivot(item.metadata, sourceWidth, sourceHeight).normalized;
      const nineSlice = readSpriteMetadata(item.metadata).nineSlice;
      const border = nineSlice ? scaleInsets(nineSlice.border, scale) : undefined;
      const content = nineSlice ? scaleInsets(nineSlice.content, scale) : undefined;
      const base: Record<string, unknown> = {
        name: item.name,
        rect: {
          x: item.x,
          y: sheet.height - item.y - (item.rotated ? item.width : item.height),
          width: item.rotated ? item.height : item.width,
          height: item.rotated ? item.width : item.height,
        },
        pivot,
        // Unity's Vector4 order is left, bottom, right, top.
        border: border
          ? { x: border.left, y: border.bottom, z: border.right, w: border.top }
          : { x: 0, y: 0, z: 0, w: 0 },
        ...(content ? { contentPadding: content } : {}),
        rotated: item.rotated,
        trimmed: item.trimmed,
      };
      if (item.mesh && item.mesh.vertices.length >= 6 && item.mesh.triangles.length >= 3) {
        // Tight-mesh data suitable for Sprite.OverrideGeometry — vertices are
        // sprite-local (relative to the trimmed frame's top-left, unrotated).
        base.mesh = {
          vertices: item.mesh.vertices.slice(),
          triangles: item.mesh.triangles.slice(),
          uvs: item.mesh.uvs.slice(),
        };
      }
      return base;
    });
    return JSON.stringify(
      { texture: opts.imageFileName(sheet.index), sprites, size: { w: sheet.width, h: sheet.height } },
      null,
      2,
    );
  },
};

export default unity;
