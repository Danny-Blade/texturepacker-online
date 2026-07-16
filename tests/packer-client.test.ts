import { afterEach, describe, expect, it, vi } from 'vitest';
import { packAsync } from '../src/lib/packerClient';
import type { ImageItem, PackerOptions } from '../src/lib/packer';

const settings: PackerOptions = {
  maxWidth: 64,
  maxHeight: 64,
  borderPadding: 0,
  shapePadding: 2,
  innerPadding: 0,
  allowRotation: false,
  powerOfTwo: false,
  forceSquare: false,
  algorithm: 'maxrects-bssf',
  trimAlpha: false,
  trimThreshold: 1,
  trimMode: 'none',
  polygonTolerance: 2,
  extrude: 0,
  multipack: false,
};

const sprite: ImageItem = {
  id: 'worker-fallback',
  name: 'worker-fallback',
  width: 8,
  height: 6,
  image: { src: 'test:worker-fallback', width: 8, height: 6 } as HTMLImageElement,
  url: 'data:image/png;base64,AA==',
};

describe('packer worker client', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads executable public JavaScript and falls back instead of hanging forever', async () => {
    vi.useFakeTimers();
    const created: Array<{ url: string | URL; options?: WorkerOptions; terminated: boolean }> = [];
    class HangingWorker {
      private record: { url: string | URL; options?: WorkerOptions; terminated: boolean };

      constructor(url: string | URL, options?: WorkerOptions) {
        this.record = { url, options, terminated: false };
        created.push(this.record);
      }

      addEventListener(): void {}
      postMessage(): void {}
      terminate(): void {
        this.record.terminated = true;
      }
    }
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
    vi.stubGlobal('Worker', HangingWorker);

    const job = packAsync([sprite], settings);
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await job.promise;

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      url: '/packer.worker.js',
      options: { type: 'module' },
      terminated: true,
    });
    expect(result.failed).toHaveLength(0);
    expect(result.packed[0]).toMatchObject({ id: 'worker-fallback', placed: true });
  });
});
