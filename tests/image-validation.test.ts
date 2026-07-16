import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FILE_BYTES,
  decodeFailure,
  formatImageLoadFailures,
  validateDecodedImage,
  validateImageFile,
} from '../src/lib/imageValidation';

describe('image import validation', () => {
  it('accepts browser image MIME types and known image extensions', () => {
    expect(validateImageFile({ name: 'hero.png', size: 12, type: 'image/png' })).toBeNull();
    expect(validateImageFile({ name: 'icon.svg', size: 12, type: '' })).toBeNull();
  });

  it('rejects unsupported and oversized source files with guidance', () => {
    const unsupported = validateImageFile({ name: 'notes.txt', size: 12, type: 'text/plain' });
    const oversized = validateImageFile({
      name: 'huge.png',
      size: MAX_IMAGE_FILE_BYTES + 1,
      type: 'image/png',
    });

    expect(unsupported).toMatchObject({ name: 'notes.txt', code: 'unsupported' });
    expect(unsupported?.suggestion).toContain('Convert');
    expect(oversized).toMatchObject({ name: 'huge.png', code: 'file-too-large' });
    expect(oversized?.reason).toContain('100 MB');
    expect(oversized?.suggestion).toMatch(/Resize|compress/);
  });

  it('rejects unsafe dimensions and pixel counts', () => {
    const wide = validateDecodedImage('wide', MAX_IMAGE_DIMENSION + 1, 1, new Set());
    const dense = validateDecodedImage('dense', 8192, 8193, new Set());

    expect(wide).toMatchObject({ name: 'wide', code: 'dimension-too-large' });
    expect(wide?.suggestion).toMatch(/Split|resize/);
    expect(dense).toMatchObject({ name: 'dense', code: 'pixel-count-too-large' });
    expect(dense?.suggestion).toContain('memory');
  });

  it('reports the affected image and recovery guidance after decoding fails', () => {
    const failure = decodeFailure('broken.webp', new Error('corrupt header'));

    expect(failure).toMatchObject({ name: 'broken.webp', code: 'decode-failed' });
    expect(failure.reason).toContain('corrupt header');
    expect(failure.suggestion).toContain('Re-export');
  });

  it('rejects duplicate atlas names instead of silently overwriting metadata', () => {
    const failure = validateDecodedImage('ui/button', 64, 32, new Set(['ui/button']));
    expect(failure?.code).toBe('duplicate-name');
    expect(failure?.suggestion).toContain('Rename');
  });

  it('summarizes affected files, reasons, and recovery suggestions', () => {
    const unsupported = validateImageFile({ name: 'a.psd', size: 5, type: '' });
    const duplicate = validateDecodedImage('hero', 10, 10, new Set(['hero']));
    const message = formatImageLoadFailures([unsupported!, duplicate!]);
    expect(message).toContain('Skipped 2 file(s)');
    expect(message).toContain('a.psd');
    expect(message).toContain('hero');
    expect(message).toContain('Rename');
  });

  it('caps long summaries without hiding the total affected count', () => {
    const failures = ['a.psd', 'b.psd', 'c.psd', 'd.psd'].map(
      (name) => validateImageFile({ name, size: 5, type: '' })!,
    );
    const message = formatImageLoadFailures(failures, 2);

    expect(message).toContain('Skipped 4 file(s)');
    expect(message).toContain('a.psd');
    expect(message).toContain('b.psd');
    expect(message).not.toContain('c.psd');
    expect(message).toContain('and 2 more file(s)');
  });
});
