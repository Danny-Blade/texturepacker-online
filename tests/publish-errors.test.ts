import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PackedItem, PackResult } from '../src/lib/packer';
import { performPublish } from '../src/lib/publish';

const baseContext = {
  exportFormat: 'json' as const,
  fileName: 'atlas',
  dirHandle: null,
  publishOptions: {
    imageFormat: 'png' as const,
    imageQuality: 0.9,
    scales: [1],
    imageFileTemplate: '{name}{suffix}{n}.{ext}',
    dataFileTemplate: '{name}{suffix}{n}.{ext}',
    bundleZip: false,
  },
};

function failedItem(name: string): PackedItem {
  return {
    id: name,
    name,
    width: 20,
    height: 10,
    image: {} as HTMLImageElement,
    url: `blob:${name}`,
    x: 0,
    y: 0,
    rotated: false,
    placed: false,
    sheetIndex: -1,
    trimmed: false,
    sourceSize: { w: 20, h: 10 },
    spriteSourceSize: { x: 0, y: 0, w: 20, h: 10 },
  };
}

function packResult(overrides: Partial<PackResult> = {}): PackResult {
  return {
    sheets: [{ index: 0, width: 32, height: 16, packed: [] }],
    failed: [],
    packed: [],
    width: 32,
    height: 16,
    ...overrides,
  };
}

function installBrowser(options: { context?: object | null; blob?: Blob | null; clickError?: Error } = {}) {
  const context = options.context === undefined ? {} : options.context;
  const blob = options.blob === undefined ? new Blob(['image']) : options.blob;
  const click = vi.fn(() => {
    if (options.clickError) throw options.clickError;
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: (value: Blob | null) => void) => callback(blob)),
  };
  const anchor = { href: '', download: '', click };
  const body = { appendChild: vi.fn(), removeChild: vi.fn() };
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => (tag === 'canvas' ? canvas : anchor)),
    body,
  });
  const objectUrl = {
    createObjectURL: vi.fn(() => 'blob:download'),
    revokeObjectURL: vi.fn(),
  };
  vi.stubGlobal('URL', objectUrl);
  return { canvas, anchor, body, objectUrl };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('publish resource errors', () => {
  it('rejects unsafe scaled canvas dimensions with an actionable message', async () => {
    await expect(
      performPublish({
        ...baseContext,
        publishOptions: { ...baseContext.publishOptions, scales: [2] },
        packResult: {
          sheets: [{ index: 0, width: 9000, height: 2, packed: [] }],
          failed: [],
          packed: [],
          width: 9000,
          height: 2,
        },
      }),
    ).rejects.toThrow(/atlas@2x\.png[\s\S]*sheet 1[\s\S]*2x[\s\S]*reduce the maximum size/i);
  });

  it('rejects unsafe output pixel counts before allocating a canvas', async () => {
    await expect(
      performPublish({
        ...baseContext,
        packResult: packResult({
          sheets: [{ index: 0, width: 8192, height: 8193, packed: [] }],
        }),
      }),
    ).rejects.toThrow(
      /atlas\.png[\s\S]*67[\s\S]*enable Multipack|atlas\.png[\s\S]*needs[\s\S]*pixels/i,
    );
  });

  it('identifies the output file and sheet when Canvas allocation fails', async () => {
    installBrowser({ context: null });

    await expect(
      performPublish({ ...baseContext, packResult: packResult() }),
    ).rejects.toThrow(
      /atlas\.png[\s\S]*sheet 1[\s\S]*32×16[\s\S]*enable Multipack/i,
    );
  });

  it('identifies the output file and suggests a fallback when browser encoding fails', async () => {
    installBrowser({ blob: null });

    await expect(
      performPublish({
        ...baseContext,
        publishOptions: { ...baseContext.publishOptions, imageFormat: 'webp' },
        packResult: packResult(),
      }),
    ).rejects.toThrow(/atlas\.webp[\s\S]*WEBP encoding failed[\s\S]*Try PNG/i);
  });

  it('warns with sprite names when a published result omits unpacked sprites', async () => {
    installBrowser();
    const result = await performPublish({
      ...baseContext,
      packResult: packResult({ failed: [failedItem('boss.png'), failedItem('menu.png')] }),
    });

    expect(result.delivered).toBe('download');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('2 sprite(s)');
    expect(result.warnings[0]).toContain('boss.png');
    expect(result.warnings[0]).toContain('menu.png');
    expect(result.warnings[0]).toMatch(/Multipack|maximum atlas size/);
  });

  it('rejects an all-failed pack instead of reporting an empty successful publish', async () => {
    await expect(
      performPublish({
        ...baseContext,
        packResult: packResult({ sheets: [], failed: [failedItem('too-large.png')] }),
      }),
    ).rejects.toThrow(
      /too-large\.png[\s\S]*Multipack|too-large\.png[\s\S]*maximum atlas size/i,
    );
  });

  it('names the failed directory file, suggests recovery, and reports download fallback', async () => {
    installBrowser();
    const dirHandle = {
      getFileHandle: vi.fn(async () => {
        throw new Error('permission denied');
      }),
    } as unknown as FileSystemDirectoryHandle;

    const result = await performPublish({
      ...baseContext,
      dirHandle,
      packResult: packResult(),
    });

    expect(result.delivered).toBe('download');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('atlas.png');
    expect(result.warnings[0]).toContain('permission denied');
    expect(result.warnings[0]).toMatch(/folder permission|disk space/);
    expect(result.warnings[0]).toContain('downloaded instead');
  });

  it('identifies a browser-blocked download and suggests ZIP output', async () => {
    const browser = installBrowser({ clickError: new Error('blocked') });

    await expect(
      performPublish({ ...baseContext, packResult: packResult() }),
    ).rejects.toThrow(
      /atlas\.png[\s\S]*blocked[\s\S]*download permissions[\s\S]*ZIP/i,
    );
    expect(browser.body.removeChild).toHaveBeenCalledWith(browser.anchor);
    expect(browser.objectUrl.revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('returns a complete empty result instead of silently omitting fields', async () => {
    await expect(
      performPublish({
        ...baseContext,
        packResult: { sheets: [], failed: [], packed: [], width: 0, height: 0 },
      }),
    ).resolves.toEqual({ files: [], delivered: 'download', warnings: [] });
  });
});
