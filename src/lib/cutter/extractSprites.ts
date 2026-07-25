/**
 * Draw each `CutFrame` into a fresh offscreen canvas, then wrap the
 * resulting PNG data URL in an `ImageItem` compatible with the store.
 *
 * We deliberately use `toDataURL` + a new `HTMLImageElement` (not an
 * `HTMLCanvasElement`) so the store hashing, canvas viewport and existing
 * decoded-pixel dedupe path all operate on the same object shape they
 * expect from a real file drop.
 */

import type { CutFrame } from './index';
import type { ImageItem } from '../store';

export interface ExtractOptions {
  /**
   * Prefix (typically the source atlas basename without extension) that
   * gets prepended to each sprite's name. Empty by default; the caller
   * decides whether to namespace.
   */
  namePrefix?: string;
}

function hashDecodedPixels(canvas: HTMLCanvasElement): string | undefined {
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let index = 0; index < pixels.length; index++) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 0x01000193);
    }
    return `${canvas.width}x${canvas.height}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  } catch {
    return undefined;
  }
}

function loadDataUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode cut sprite'));
    img.src = url;
  });
}

export async function extractSprites(
  image: HTMLImageElement | HTMLCanvasElement,
  frames: CutFrame[],
  options: ExtractOptions = {},
): Promise<ImageItem[]> {
  if (frames.length === 0) return [];
  if (typeof document === 'undefined') return [];

  const prefix = options.namePrefix ? `${options.namePrefix.replace(/\/+$/, '')}/` : '';
  const now = Date.now();
  const items: ImageItem[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(frame.w));
    canvas.height = Math.max(1, Math.round(frame.h));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) continue;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
    ctx.drawImage(
      image,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const url = canvas.toDataURL('image/png');
    const loaded = await loadDataUrl(url);
    const contentHash = hashDecodedPixels(canvas);
    const name = `${prefix}${frame.name}`;
    items.push({
      id: `cut-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      width: canvas.width,
      height: canvas.height,
      image: loaded,
      url,
      contentHash,
    });
  }

  return items;
}
