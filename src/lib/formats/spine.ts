import type { FormatGenerator } from './types';
import type { SpritePolygon } from '../packer';

/**
 * Transform a sprite-local polygon to sheet coordinates.
 * For rotated items the bitmap is rotated 90° clockwise on the sheet
 * (canvas: translate(x + height, y); rotate(+pi/2)). Sprite-local (sx, sy)
 * maps to sheet (item.x + item.height - sy, item.y + sx).
 */
function polygonToSheet(
  poly: SpritePolygon,
  itemX: number,
  itemY: number,
  itemHeight: number,
  rotated: boolean,
): number[] {
  const out: number[] = new Array(poly.length);
  for (let i = 0; i < poly.length; i += 2) {
    const px = poly[i];
    const py = poly[i + 1];
    if (rotated) {
      out[i] = itemX + itemHeight - py;
      out[i + 1] = itemY + px;
    } else {
      out[i] = itemX + px;
      out[i + 1] = itemY + py;
    }
  }
  return out;
}

function formatVertices(verts: number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i < verts.length; i += 2) {
    pairs.push(`${verts[i]},${verts[i + 1]}`);
  }
  return pairs.join(', ');
}

const spine: FormatGenerator = {
  extension: 'atlas',
  label: 'Spine',
  generate(sheet, opts) {
    const image = opts.imageFileName(sheet.index);
    let out = '';
    out += `${image}\n`;
    out += `size: ${sheet.width},${sheet.height}\n`;
    out += `format: RGBA8888\n`;
    out += `filter: Linear,Linear\n`;
    out += `repeat: none\n`;
    if (opts.normalMapImageName) {
      // Custom extension line; Spine's parser tolerates unknown key/value
      // header entries and consumers that scan for it can pick up the pair.
      out += `normalMap: ${opts.normalMapImageName}\n`;
    }
    for (const item of sheet.packed) {
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      const origW = item.sourceSize.w;
      const origH = item.sourceSize.h;
      const offsetX = item.spriteSourceSize.x;
      const offsetY = origH - item.spriteSourceSize.h - item.spriteSourceSize.y;
      out += `\n${item.name}\n`;
      out += `  rotate: ${item.rotated ? 'true' : 'false'}\n`;
      out += `  xy: ${item.x}, ${item.y}\n`;
      out += `  size: ${fw}, ${fh}\n`;
      out += `  orig: ${origW}, ${origH}\n`;
      out += `  offset: ${offsetX}, ${offsetY}\n`;
      if (item.polygon && item.polygon.length >= 6) {
        const sheetVerts = polygonToSheet(
          item.polygon,
          item.x,
          item.y,
          item.height,
          item.rotated,
        );
        out += `  vertices: ${formatVertices(sheetVerts)}\n`;
      }
      out += `  index: -1\n`;
    }
    return out;
  },
};

export default spine;
