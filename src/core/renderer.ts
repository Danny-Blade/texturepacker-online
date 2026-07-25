// Shared sheet renderer (P3-01). Extracted from src/lib/publish.ts so the
// browser publish path and the Node CLI can render sheets through the same
// code, differing only in the `CanvasFactory` they supply.

import type { PackSheet, PackedItem } from '../lib/packer';
import type { CanvasFactory, CanvasLike, Context2DLike } from './imagePipeline';

export type SheetRenderLayer = 'color' | 'normal';

export interface RenderSheetOptions {
  /** 'nearest' turns off image smoothing; 'bicubic' asks for high quality. */
  scalingAlgorithm?: 'nearest' | 'bilinear' | 'bicubic';
  /** Which pass to render. 'normal' emits the paired normal-map atlas. */
  layer?: SheetRenderLayer;
}

interface Smoothable extends Context2DLike {
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: string;
}

/**
 * Draw a packed sheet into a fresh canvas produced by `factory`.
 *
 * The returned canvas has been fully painted but not encoded — the caller is
 * responsible for turning it into a Blob (browser) or Buffer (Node) using
 * whatever encoder the target platform prefers.
 */
export function renderSheetCore(
  sheet: PackSheet,
  factory: CanvasFactory,
  options: RenderSheetOptions = {},
): CanvasLike {
  const layer: SheetRenderLayer = options.layer ?? 'color';
  const scalingAlgorithm = options.scalingAlgorithm ?? 'bilinear';

  const canvas = factory.createCanvas(sheet.width, sheet.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(
      `Could not allocate a ${sheet.width}x${sheet.height} 2D context for sheet ${sheet.index + 1}.`,
    );
  }
  const smoothable = ctx as Smoothable;
  smoothable.imageSmoothingEnabled = scalingAlgorithm !== 'nearest';
  if (smoothable.imageSmoothingEnabled) {
    smoothable.imageSmoothingQuality = scalingAlgorithm === 'bicubic' ? 'high' : 'medium';
  }

  for (const item of sheet.packed as PackedItem[]) {
    if (layer === 'normal') {
      if (!item.normalMapImage || !item.normalMapFrame) continue;
      const nf = item.normalMapFrame;
      ctx.save();
      if (item.rotated) {
        ctx.translate(nf.x + nf.h, nf.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(item.normalMapImage, 0, 0, nf.w, nf.h);
      } else {
        ctx.drawImage(item.normalMapImage, nf.x, nf.y, nf.w, nf.h);
      }
      ctx.restore();
      continue;
    }
    const src = (item.pixelSource ?? item.image) as unknown;
    const ex = item.extrudePadding ?? 0;
    ctx.save();
    if (item.rotated) {
      ctx.translate(item.x + item.height, item.y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(src, -ex, -ex, item.width + ex * 2, item.height + ex * 2);
    } else {
      ctx.drawImage(src, item.x - ex, item.y - ex, item.width + ex * 2, item.height + ex * 2);
    }
    ctx.restore();
  }
  return canvas;
}
