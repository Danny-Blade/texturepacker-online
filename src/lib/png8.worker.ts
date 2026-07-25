// Web Worker module loaded via:
//   new Worker('/png8.worker.js', { type: 'module' })
// It receives raw RGBA pixel data plus quantization options and returns the
// encoded PNG-8 byte stream. All encoding is delegated to encodePng8Pixels so
// the worker cannot drift from the main-thread implementation.

import {
  encodePng8Pixels,
  type Png8EncodeOptions,
  type Png8WorkerRequest,
  type Png8WorkerResponse,
} from './png8';

interface PostMessageTarget {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

function post(message: Png8WorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as PostMessageTarget).postMessage(message, transfer);
}

async function handleEncode(request: Png8WorkerRequest): Promise<void> {
  const { id, data, width, height, options } = request;
  try {
    const normalized: Png8EncodeOptions = {
      maxColors: options.maxColors,
      dither: options.dither,
      ditherStrength: options.ditherStrength,
    };
    const png = await encodePng8Pixels(data, width, height, normalized);
    post({ id, kind: 'done', png }, [png.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ id, kind: 'error', message });
  }
}

self.addEventListener('message', (event: MessageEvent<Png8WorkerRequest>) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  void handleEncode(data);
});
