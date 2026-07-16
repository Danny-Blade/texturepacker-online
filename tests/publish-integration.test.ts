import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PackedItem, PackResult } from '../src/lib/packer';
import { performPublish } from '../src/lib/publish';
import type { PublishOptions } from '../src/lib/store';

interface EncodingCall {
  mime: string;
  quality: number | undefined;
  width: number;
  height: number;
}

function makePackResult(sheetCount = 1): PackResult {
  const sheets = Array.from({ length: sheetCount }, (_, index) => {
    const item: PackedItem = {
      id: `player-${index}`,
      name: `player-${index}`,
      width: 12,
      height: 8,
      image: {} as HTMLImageElement,
      url: 'data:image/png;base64,fixture',
      x: 0,
      y: 0,
      rotated: false,
      placed: true,
      sheetIndex: index,
      trimmed: false,
      sourceSize: { w: 12, h: 8 },
      spriteSourceSize: { x: 0, y: 0, w: 12, h: 8 },
    };
    return { index, width: 16, height: 8, packed: [item] };
  });
  const sheet = sheets[0];
  return {
    sheets,
    failed: [],
    packed: sheet.packed,
    width: sheet.width,
    height: sheet.height,
  };
}

function installCanvasEncoderMock(): EncodingCall[] {
  const calls: EncodingCall[] = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`Unexpected element: ${tag}`);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          drawImage: vi.fn(),
          getImageData: () => ({
            data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
          }),
        }),
        toBlob: (
          callback: (blob: Blob | null) => void,
          mime = 'image/png',
          quality?: number,
        ) => {
          calls.push({ mime, quality, width: canvas.width, height: canvas.height });
          callback(new Blob([`encoded:${mime}`], { type: mime }));
        },
      };
      return canvas;
    },
  });
  return calls;
}

function makeDirectoryMock() {
  const written = new Map<string, Blob>();
  const closed: string[] = [];
  const handle = {
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      expect(options).toEqual({ create: true });
      return {
        createWritable: vi.fn(async () => ({
          write: vi.fn(async (blob: Blob) => {
            written.set(name, blob);
          }),
          close: vi.fn(async () => {
            closed.push(name);
          }),
        })),
      };
    }),
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, written, closed };
}

function options(imageFormat: 'jpg' | 'webp'): PublishOptions {
  return {
    imageFormat,
    imageQuality: 0.73,
    scales: [1],
    imageFileTemplate: '{name}{suffix}{n}.{ext}',
    dataFileTemplate: '{name}{suffix}{n}.{ext}',
    bundleZip: false,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('performPublish browser encoding and directory delivery', () => {
  it.each([
    { format: 'jpg' as const, extension: 'jpg', mime: 'image/jpeg' },
    { format: 'webp' as const, extension: 'webp', mime: 'image/webp' },
  ])('encodes $format and writes both output files to a directory', async (codec) => {
    const encodingCalls = installCanvasEncoderMock();
    const directory = makeDirectoryMock();

    const result = await performPublish({
      packResult: makePackResult(),
      publishOptions: options(codec.format),
      exportFormat: 'json',
      fileName: 'atlas',
      dirHandle: directory.handle,
    });

    expect(result.delivered).toBe('directory');
    expect(result.warnings).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual([
      `atlas.${codec.extension}`,
      'atlas.json',
    ]);
    expect(encodingCalls).toEqual([
      { mime: codec.mime, quality: 0.73, width: 16, height: 8 },
    ]);
    expect(directory.handle.getFileHandle).toHaveBeenCalledTimes(2);
    expect(Array.from(directory.written.keys())).toEqual([
      `atlas.${codec.extension}`,
      'atlas.json',
    ]);
    expect(directory.written.get(`atlas.${codec.extension}`)?.type).toBe(codec.mime);
    expect(directory.written.get('atlas.json')?.type).toBe('text/plain');
    expect(directory.closed).toEqual([`atlas.${codec.extension}`, 'atlas.json']);
  });

  it('routes PNG-8 through the indexed encoder before directory delivery', async () => {
    installCanvasEncoderMock();
    const directory = makeDirectoryMock();

    await performPublish({
      packResult: makePackResult(),
      publishOptions: { ...options('jpg'), imageFormat: 'png-8' },
      exportFormat: 'json',
      fileName: 'indexed',
      dirHandle: directory.handle,
    });

    const blob = directory.written.get('indexed.png');
    expect(blob?.type).toBe('image/png');
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const binaryText = new TextDecoder('latin1').decode(bytes);
    expect(binaryText).toContain('PLTE');
    expect(binaryText).toContain('tRNS');
  });

  it('keeps multi-sheet, multi-scale filenames and metadata image references aligned', async () => {
    installCanvasEncoderMock();
    const directory = makeDirectoryMock();
    const publishOptions: PublishOptions = {
      ...options('webp'),
      scales: [0.5, 2],
      imageFileTemplate: '{name}-{n}{suffix}.{ext}',
      dataFileTemplate: '{name}-{n}{suffix}.{ext}',
    };

    const result = await performPublish({
      packResult: makePackResult(2),
      publishOptions,
      exportFormat: 'json',
      fileName: 'atlas',
      dirHandle: directory.handle,
    });

    expect(result.files).toHaveLength(8);
    expect(result.files.map((file) => file.name)).toEqual([
      'atlas-1@0.5x.webp',
      'atlas-1@0.5x.json',
      'atlas-2@0.5x.webp',
      'atlas-2@0.5x.json',
      'atlas-1@2x.webp',
      'atlas-1@2x.json',
      'atlas-2@2x.webp',
      'atlas-2@2x.json',
    ]);
    for (const scale of ['@0.5x', '@2x']) {
      for (const sheet of [1, 2]) {
        const metadata = JSON.parse(
          await directory.written.get(`atlas-${sheet}${scale}.json`)!.text(),
        );
        expect(metadata.meta.image).toBe(`atlas-${sheet}${scale}.webp`);
      }
    }
  });
});
