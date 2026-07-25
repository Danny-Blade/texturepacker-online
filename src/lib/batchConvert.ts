import JSZip from 'jszip';
import type { ImageItem } from './packer';
import type { ImageFileFormat, Png8DitherMode } from './store';
import {
  expandTemplate,
  imageExtFor,
  imageMimeFor,
  suffixForScale,
  type ImageFileFormatLite,
} from './publish';
import { encodePng8, type Png8EncodeOptions } from './png8';
import {
  alphaBleedRgba,
  alphaClearRgba,
  computeTrimBounds,
  premultiplyAlphaRgba,
  type AlphaHandling,
} from './imageProcessing';
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from './imageValidation';

/**
 * Options for the batch image conversion pipeline. Batch conversion skips
 * atlas packing entirely — every input image becomes a standalone output
 * image, run through the same scale/alpha/extrude/encode pipeline as atlas
 * publish. See {@link performBatchConvert}.
 */
export interface BatchConvertOptions {
  /** Output image codec. Same set as atlas publish. */
  imageFormat: ImageFileFormat;
  /** 0..1 quality passed to JPG/WebP toBlob. Ignored for PNG. */
  imageQuality: number;
  /** Scaling variants. Empty falls back to `[1]`. */
  scales: number[];
  /**
   * Filename template. Supports `{name}` (basename of the input),
   * `{suffix}` (`''` for 1x, `@2x`/`@0.5x`/`@Nx` otherwise) and `{ext}`.
   * `{n}` is intentionally unused (batch never spans sheets).
   */
  imageFileTemplate: string;
  alphaHandling: AlphaHandling;
  alphaBleedIterations: number;
  /**
   * Kept for API symmetry with the `PublishOptions` type. When true, the
   * pipeline behaves as if `alphaHandling === 'premultiply'` unless the
   * caller has already set that mode explicitly.
   */
  premultiply: boolean;
  png8Colors?: number;
  png8Dither?: Png8DitherMode;
  png8DitherStrength?: number;
  /** Extrude halo, in output pixels. 0 disables extrusion. */
  extrudePadding: number;
  /**
   * Trim transparent edges before scaling. The output is a tighter image
   * framing the visible pixels; empty inputs are reported via `skipped`.
   */
  trimAlpha: boolean;
  /** Bundle all outputs into a single .zip download. */
  bundleZip: boolean;
}

export interface BatchConvertWritten {
  inputId: string;
  filename: string;
  blob: Blob;
  scale: number;
}

export interface BatchConvertResult {
  written: BatchConvertWritten[];
  /** Ids of inputs whose visible-pixel region was empty. */
  skipped: string[];
}

export interface BatchConvertContext {
  dirHandle: FileSystemDirectoryHandle | null;
  onProgress?: (done: number, total: number) => void;
}

interface DirHandleAny {
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

function baseNameFor(image: ImageItem): string {
  const stem = image.name.split('/').pop() ?? image.name;
  const dot = stem.lastIndexOf('.');
  return dot > 0 ? stem.slice(0, dot) : stem;
}

function ensureExtrude(canvas: HTMLCanvasElement, ex: number): HTMLCanvasElement {
  if (ex <= 0) return canvas;
  const dw = canvas.width;
  const dh = canvas.height;
  const target = document.createElement('canvas');
  target.width = dw + ex * 2;
  target.height = dh + ex * 2;
  const ctx = target.getContext('2d');
  if (!ctx) {
    throw new Error(
      `Could not allocate a ${target.width}×${target.height} canvas for extrude. Reduce the extrude padding.`,
    );
  }
  ctx.drawImage(canvas, ex, ex);
  // Edge bands: stretch the 1-px edge of the sprite over the ex-wide band.
  ctx.drawImage(canvas, 0, 0, 1, dh, 0, ex, ex, dh);
  ctx.drawImage(canvas, dw - 1, 0, 1, dh, ex + dw, ex, ex, dh);
  ctx.drawImage(canvas, 0, 0, dw, 1, ex, 0, dw, ex);
  ctx.drawImage(canvas, 0, dh - 1, dw, 1, ex, ex + dh, dw, ex);
  // Corners: stretch the 1-px corner pixel over the ex×ex corner square.
  ctx.drawImage(canvas, 0, 0, 1, 1, 0, 0, ex, ex);
  ctx.drawImage(canvas, dw - 1, 0, 1, 1, ex + dw, 0, ex, ex);
  ctx.drawImage(canvas, 0, dh - 1, 1, 1, 0, ex + dh, ex, ex);
  ctx.drawImage(canvas, dw - 1, dh - 1, 1, 1, ex + dw, ex + dh, ex, ex);
  return target;
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ImageFileFormatLite,
  quality: number,
  png8Options?: Png8EncodeOptions,
): Promise<Blob> {
  if (format === 'png-8') {
    return encodePng8(canvas, png8Options);
  }
  const mime = imageMimeFor(format);
  return new Promise<Blob>((resolve, reject) => {
    const failMessage = mime === 'image/png'
      ? 'PNG encoding failed. Try a smaller image or another browser.'
      : `${format.toUpperCase()} encoding failed in this browser. Try PNG output.`;
    const onBlob = (blob: Blob | null): void => {
      if (blob) resolve(blob);
      else reject(new Error(failMessage));
    };
    if (mime === 'image/png') canvas.toBlob(onBlob, mime);
    else canvas.toBlob(onBlob, mime, quality);
  });
}

interface ConvertedImage {
  blob: Blob;
  /** True when the source image had no visible pixels at all. */
  fullyEmpty: boolean;
}

async function convertOne(
  image: ImageItem,
  scale: number,
  options: BatchConvertOptions,
): Promise<ConvertedImage | null> {
  const fullW = image.width;
  const fullH = image.height;
  if (fullW <= 0 || fullH <= 0) return null;

  // Trim first so the scale operates on the tightest possible source.
  let sx = 0;
  let sy = 0;
  let sw = fullW;
  let sh = fullH;
  if (options.trimAlpha) {
    const bounds = computeTrimBounds(image.image, 1);
    if (bounds === null) {
      return { blob: new Blob(), fullyEmpty: true };
    }
    sx = bounds.x;
    sy = bounds.y;
    sw = bounds.w;
    sh = bounds.h;
  }

  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  if (dw > MAX_IMAGE_DIMENSION || dh > MAX_IMAGE_DIMENSION) {
    throw new Error(
      `Batch output for "${image.name}" would be ${dw}×${dh}; reduce the scale below ${MAX_IMAGE_DIMENSION}px per side.`,
    );
  }
  if (dw * dh > MAX_IMAGE_PIXELS) {
    throw new Error(
      `Batch output for "${image.name}" would need ${dw * dh} pixels; reduce the scale so the image stays below the browser limit.`,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(
      `The browser could not allocate a ${dw}×${dh} canvas for "${image.name}". Try a smaller scale.`,
    );
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.image, sx, sy, sw, sh, 0, 0, dw, dh);

  // Alpha handling runs on the resampled bitmap so any downscale-induced
  // fringe colours (that atlas mode would have baked into a separate
  // preprocessing pass) are still cleaned up here.
  const alphaMode: AlphaHandling = options.premultiply && options.alphaHandling === 'keep'
    ? 'premultiply'
    : options.alphaHandling;
  if (alphaMode !== 'keep') {
    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, dw, dh);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read pixels for "${image.name}" (${reason}).`);
    }
    if (alphaMode === 'clear') alphaClearRgba(data.data);
    else if (alphaMode === 'bleed') {
      alphaBleedRgba(data.data, dw, dh, Math.max(1, Math.floor(options.alphaBleedIterations)));
    } else if (alphaMode === 'premultiply') premultiplyAlphaRgba(data.data);
    ctx.putImageData(data, 0, 0);
  }

  const ex = Math.max(0, Math.floor(options.extrudePadding));
  const finalCanvas = ensureExtrude(canvas, ex);
  const blob = await encodeCanvas(finalCanvas, options.imageFormat as ImageFileFormatLite, options.imageQuality, {
    maxColors: options.png8Colors,
    dither: options.png8Dither,
    ditherStrength: options.png8DitherStrength,
  });
  return { blob, fullyEmpty: false };
}

async function writeToDir(
  dirHandle: FileSystemDirectoryHandle,
  files: BatchConvertWritten[],
): Promise<void> {
  const dh = dirHandle as unknown as DirHandleAny;
  for (const file of files) {
    try {
      const fh = await dh.getFileHandle(file.filename, { create: true });
      const w = await fh.createWritable();
      await w.write(file.blob);
      await w.close();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not write "${file.filename}" (${reason}). Check folder permission and disk space.`,
      );
    }
  }
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a') as HTMLAnchorElement;
  a.href = url;
  a.download = filename;
  let appended = false;
  try {
    document.body.appendChild(a);
    appended = true;
    a.click();
  } finally {
    if (appended) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Convert a collection of input images into standalone output images, one per
 * input × scale combination. Filesystem delivery is preferred (via
 * `dirHandle`); otherwise the caller can request a single .zip via
 * `bundleZip`, and finally we fall back to sequential anchor-tag downloads.
 * Progress ticks after each attempted image × scale via `onProgress`, so
 * callers can drive a determinate progress bar during long runs.
 */
export async function performBatchConvert(
  images: ImageItem[],
  options: BatchConvertOptions,
  ctx: BatchConvertContext,
): Promise<BatchConvertResult> {
  const scales = options.scales.length > 0 ? options.scales : [1];
  const total = images.length * scales.length;
  const written: BatchConvertWritten[] = [];
  const skipped: string[] = [];
  const ext = imageExtFor(options.imageFormat as ImageFileFormatLite);
  let done = 0;

  for (const image of images) {
    const name = baseNameFor(image);
    let anyWritten = false;
    for (const scale of scales) {
      try {
        const result = await convertOne(image, scale, options);
        if (result === null) {
          skipped.push(image.id);
          continue;
        }
        if (result.fullyEmpty) {
          continue;
        }
        const filename = expandTemplate(options.imageFileTemplate, {
          name,
          n: '',
          n0: '',
          n1: '',
          suffix: suffixForScale(scale),
          ext,
          isSingleSheet: true,
        });
        written.push({ inputId: image.id, filename, blob: result.blob, scale });
        anyWritten = true;
      } finally {
        done++;
        ctx.onProgress?.(done, total);
      }
    }
    if (!anyWritten && !skipped.includes(image.id)) {
      // Every scale for this input produced a fully-empty result — surface
      // the id so callers can flag it in the UI instead of silently dropping.
      skipped.push(image.id);
    }
  }

  if (ctx.dirHandle) {
    await writeToDir(ctx.dirHandle, written);
    return { written, skipped };
  }

  if (options.bundleZip && written.length > 0) {
    const zip = new JSZip();
    for (const f of written) zip.file(f.filename, f.blob);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload('batch.zip', zipBlob);
    return { written, skipped };
  }

  for (const f of written) {
    triggerDownload(f.filename, f.blob);
  }
  return { written, skipped };
}
