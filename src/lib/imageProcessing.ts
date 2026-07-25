// Browser image preparation entry point.
//
// The heavy lifting (trim / extrude / effects / polygon) now lives in
// `src/core/imagePipeline.ts` behind a `CanvasFactory` abstraction so the same
// algorithm powers the DOM publish path AND the Node CLI (P3-01).
//
// This file supplies the DOM-backed factory and re-exports the pure alpha
// helpers so the existing browser call sites and tests keep working
// byte-identically.

import type { ImageItem, PackerOptions, PreparedSprite } from './packer';
import {
  computeTrimBoundsCore,
  getProcessedSourceCore,
  prepareSpriteForAtlasCore,
  type CanvasFactory,
  type CanvasLike,
} from '../core/imagePipeline';

export {
  alphaBleedRgba,
  alphaClearRgba,
  premultiplyAlphaRgba,
  type AlphaHandling,
} from '../core/imagePipeline';

/**
 * DOM-backed canvas factory. Cast HTMLCanvasElement through `unknown` because
 * `CanvasLike` deliberately declares a permissive method surface that the
 * strictly-typed DOM `CanvasRenderingContext2D` does not structurally satisfy.
 */
export const browserCanvasFactory: CanvasFactory = {
  createCanvas(w: number, h: number): CanvasLike {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas as unknown as CanvasLike;
  },
};

/**
 * Compute the tight non-transparent bounds of an image given an alpha
 * threshold. Backwards-compatible wrapper around the core implementation.
 */
export function computeTrimBounds(
  image: HTMLImageElement,
  threshold: number,
): { x: number; y: number; w: number; h: number } | null {
  return computeTrimBoundsCore(image, threshold, browserCanvasFactory);
}

/**
 * Return the source bitmap used for trim/extrude/effects downstream.
 */
export function getProcessedSource(
  image: HTMLImageElement,
  mode: 'keep' | 'clear' | 'bleed' | 'premultiply',
  iterations: number,
): { source: CanvasImageSource; width: number; height: number; premultiplied: boolean } {
  const processed = getProcessedSourceCore(image, mode, iterations, browserCanvasFactory);
  return {
    source: processed.source as CanvasImageSource,
    width: processed.width,
    height: processed.height,
    premultiplied: processed.premultiplied,
  };
}

/**
 * Bake trim + inner padding + extrude into a fresh canvas usable as a
 * drawImage source. Delegates to the shared core so browser and Node CLI
 * pipelines never diverge.
 */
export function prepareSpriteForAtlas(item: ImageItem, options: PackerOptions): PreparedSprite {
  return prepareSpriteForAtlasCore(item, options, browserCanvasFactory);
}
