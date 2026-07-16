export const MAX_IMAGE_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 67_108_864;

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

export type ImageLoadFailureCode =
  | 'unsupported'
  | 'file-too-large'
  | 'decode-failed'
  | 'dimension-too-large'
  | 'pixel-count-too-large'
  | 'duplicate-name';

export interface ImageLoadFailure {
  name: string;
  code: ImageLoadFailureCode;
  reason: string;
  suggestion: string;
}

interface FileDescriptor {
  name: string;
  size: number;
  type: string;
}

export function validateImageFile(file: FileDescriptor): ImageLoadFailure | null {
  const recognized = file.type.startsWith('image/') || IMAGE_EXTENSION_RE.test(file.name);
  if (!recognized) {
    return {
      name: file.name,
      code: 'unsupported',
      reason: 'unsupported image format',
      suggestion: 'Convert it to PNG, JPG, WebP, GIF, SVG, or BMP.',
    };
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return {
      name: file.name,
      code: 'file-too-large',
      reason: `file exceeds ${MAX_IMAGE_FILE_BYTES / 1024 / 1024} MB`,
      suggestion: 'Resize or compress the source image before importing.',
    };
  }
  return null;
}

export function validateDecodedImage(
  name: string,
  width: number,
  height: number,
  existingNames: ReadonlySet<string>,
): ImageLoadFailure | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return {
      name,
      code: 'decode-failed',
      reason: 'image has invalid dimensions',
      suggestion: 'Re-export the image with a supported encoder.',
    };
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      name,
      code: 'dimension-too-large',
      reason: `dimensions exceed ${MAX_IMAGE_DIMENSION} px`,
      suggestion: 'Split or resize the image before importing.',
    };
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    return {
      name,
      code: 'pixel-count-too-large',
      reason: `image exceeds ${MAX_IMAGE_PIXELS.toLocaleString('en-US')} pixels`,
      suggestion: 'Reduce the image dimensions to avoid browser memory exhaustion.',
    };
  }
  if (existingNames.has(name)) {
    return {
      name,
      code: 'duplicate-name',
      reason: 'another sprite already uses this atlas name',
      suggestion: 'Rename the file or place it in a distinct subfolder.',
    };
  }
  return null;
}

export function decodeFailure(name: string, error?: unknown): ImageLoadFailure {
  const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
  return {
    name,
    code: 'decode-failed',
    reason: `browser could not decode the image${detail}`,
    suggestion: 'Re-export it as PNG, JPG, WebP, GIF, SVG, or BMP.',
  };
}

export function formatImageLoadFailures(failures: ImageLoadFailure[], maxItems = 3): string {
  if (failures.length === 0) return '';
  const shown = failures
    .slice(0, Math.max(1, maxItems))
    .map((failure) => `${failure.name}: ${failure.reason}. ${failure.suggestion}`);
  const remaining = failures.length - shown.length;
  if (remaining > 0) shown.push(`…and ${remaining} more file(s).`);
  return `Skipped ${failures.length} file(s). ${shown.join(' ')}`;
}
