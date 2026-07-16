'use client';

import { prepareSpriteForAtlas } from './imageProcessing';
import {
  packIntoSheets,
  type ImageItem,
  type PackedItem,
  type PackerOptions,
  type PackResult,
  type PackSheet,
  type PreparedSprite,
} from './packer';

type PackingAlgorithm = PackerOptions['algorithm'];

interface WorkerPackOptions {
  maxWidth: number;
  maxHeight: number;
  borderPadding: number;
  shapePadding: number;
  allowRotation: boolean;
  powerOfTwo: boolean;
  forceSquare: boolean;
  sizeMode: 'max' | 'fixed';
  sizeConstraint: 'pot' | 'any' | 'multiple-of-4' | 'word-aligned';
  packMode: 'fast' | 'good' | 'best';
  commonDivisorX: number;
  commonDivisorY: number;
  algorithm: PackingAlgorithm;
  multipack: boolean;
}

interface WorkerRect {
  id: string;
  w: number;
  h: number;
}

interface WorkerPlaced {
  id: string;
  x: number;
  y: number;
  rotated: boolean;
}

interface WorkerSheet {
  index: number;
  width: number;
  height: number;
  placed: WorkerPlaced[];
}

type WorkerRequest =
  | { kind: 'pack'; id: number; rects: WorkerRect[]; options: WorkerPackOptions }
  | { kind: 'cancel'; id: number };

type WorkerResponse =
  | { kind: 'progress'; id: number; progress: number }
  | { kind: 'done'; id: number; sheets: WorkerSheet[]; failedIds: string[] }
  | { kind: 'error'; id: number; message: string };

export type PackProgressCallback = (progress: number) => void;

export interface PackJob {
  promise: Promise<PackResult>;
  cancel: () => void;
}

interface PendingJob {
  resolve: (r: PackResult) => void;
  reject: (e: Error) => void;
  onProgress?: PackProgressCallback;
  prepared: Map<string, PreparedSprite>;
  items: ImageItem[];
  options: PackerOptions;
  settled: boolean;
  timeoutId?: number;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingJob>();
const WORKER_TIMEOUT_MS = 8_000;

function clearJobTimeout(job: PendingJob): void {
  if (job.timeoutId !== undefined) {
    window.clearTimeout(job.timeoutId);
    job.timeoutId = undefined;
  }
}

function settleWithSyncFallback(id: number, job: PendingJob): void {
  if (job.settled) return;
  job.settled = true;
  clearJobTimeout(job);
  pending.delete(id);
  try {
    const result = packIntoSheets(job.items, job.options, prepareSpriteForAtlas);
    job.onProgress?.(1);
    job.resolve(result);
  } catch (error) {
    job.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

function resetWorkerAndFallbackPending(): void {
  if (worker) worker.terminate();
  worker = null;
  for (const [id, job] of Array.from(pending)) settleWithSyncFallback(id, job);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  // Turbopack currently emits a `new URL('./*.worker.ts', import.meta.url)`
  // target as raw TypeScript media and strips the module worker option. Serve
  // an explicitly compiled ES module instead so every browser executes JS.
  const w = new Worker('/packer.worker.js', { type: 'module' });
  w.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const job = pending.get(msg.id);
    if (!job || job.settled) return;
    if (msg.kind === 'progress') {
      if (job.onProgress) job.onProgress(Math.max(0, Math.min(1, msg.progress)));
      return;
    }
    if (msg.kind === 'done') {
      job.settled = true;
      clearJobTimeout(job);
      pending.delete(msg.id);
      job.resolve(buildPackResult(msg.sheets, msg.failedIds, job));
      return;
    }
    if (msg.kind === 'error') {
      settleWithSyncFallback(msg.id, job);
    }
  });
  w.addEventListener('error', () => resetWorkerAndFallbackPending());
  w.addEventListener('messageerror', () => resetWorkerAndFallbackPending());
  worker = w;
  return w;
}

function toWorkerOptions(options: PackerOptions): WorkerPackOptions {
  return {
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    borderPadding: options.borderPadding,
    shapePadding: options.shapePadding ?? options.padding ?? 0,
    allowRotation: options.allowRotation,
    powerOfTwo: options.powerOfTwo,
    forceSquare: options.forceSquare,
    sizeMode: options.sizeMode ?? 'max',
    sizeConstraint: options.sizeConstraint ?? (options.powerOfTwo ? 'pot' : 'any'),
    packMode: options.packMode ?? 'good',
    commonDivisorX: Math.max(1, Math.floor(options.commonDivisorX ?? 1)),
    commonDivisorY: Math.max(1, Math.floor(options.commonDivisorY ?? 1)),
    algorithm: options.algorithm,
    multipack: options.multipack,
  };
}

function buildPackResult(
  sheets: WorkerSheet[],
  failedIds: string[],
  job: PendingJob,
): PackResult {
  const itemsById = new Map<string, ImageItem>();
  for (const it of job.items) itemsById.set(it.id, it);

  const builtSheets: PackSheet[] = sheets.map((sh) => {
    const packed: PackedItem[] = [];
    for (const p of sh.placed) {
      const item = itemsById.get(p.id);
      const prep = job.prepared.get(p.id);
      if (!item || !prep) continue;
      const ex = prep.extrudePadding ?? 0;
      packed.push({
        ...item,
        x: p.x + ex,
        y: p.y + ex,
        rotated: p.rotated,
        placed: true,
        sheetIndex: sh.index,
        trimmed: prep.trim.trimmed,
        sourceSize: prep.trim.sourceSize,
        spriteSourceSize: prep.trim.spriteSourceSize,
        pixelSource: prep.pixelSource,
        extrudePadding: ex || undefined,
        polygon: prep.polygon,
        width: prep.width,
        height: prep.height,
      });
    }
    return { index: sh.index, width: sh.width, height: sh.height, packed };
  });

  const failed: PackedItem[] = [];
  for (const id of failedIds) {
    const item = itemsById.get(id);
    const prep = job.prepared.get(id);
    if (!item) continue;
    if (prep) {
      const ex = prep.extrudePadding ?? 0;
      failed.push({
        ...item,
        x: 0,
        y: 0,
        rotated: false,
        placed: false,
        sheetIndex: -1,
        trimmed: prep.trim.trimmed,
        sourceSize: prep.trim.sourceSize,
        spriteSourceSize: prep.trim.spriteSourceSize,
        pixelSource: prep.pixelSource,
        extrudePadding: ex || undefined,
        polygon: prep.polygon,
        width: prep.width,
        height: prep.height,
      });
    } else {
      failed.push({
        ...item,
        x: 0,
        y: 0,
        rotated: false,
        placed: false,
        sheetIndex: -1,
        trimmed: false,
        sourceSize: { w: item.width, h: item.height },
        spriteSourceSize: { x: 0, y: 0, w: item.width, h: item.height },
      });
    }
  }

  const primary = builtSheets[0];
  return {
    sheets: builtSheets,
    failed,
    packed: primary ? primary.packed : [],
    width: primary ? primary.width : 0,
    height: primary ? primary.height : 0,
  };
}

function emptyResult(): PackResult {
  return { sheets: [], failed: [], packed: [], width: 0, height: 0 };
}

export function packAsync(
  images: ImageItem[],
  options: PackerOptions,
  onProgress?: PackProgressCallback,
): PackJob {
  if (images.length === 0) {
    return { promise: Promise.resolve(emptyResult()), cancel: () => {} };
  }
  if (typeof window === 'undefined') {
    return { promise: Promise.resolve(emptyResult()), cancel: () => {} };
  }
  if (options.multipackMode === 'manual' || options.aliasDuplicates) {
    return {
      promise: Promise.resolve().then(() => {
        const result = packIntoSheets(images, options, prepareSpriteForAtlas);
        onProgress?.(1);
        return result;
      }),
      cancel: () => {},
    };
  }

  const id = nextRequestId++;
  const prepared = new Map<string, PreparedSprite>();
  const rects: WorkerRect[] = [];
  for (const item of images) {
    const p = prepareSpriteForAtlas(item, options);
    prepared.set(item.id, p);
    const ex = p.extrudePadding ?? 0;
    rects.push({ id: item.id, w: p.width + ex * 2, h: p.height + ex * 2 });
  }

  let resolve!: (r: PackResult) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<PackResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const job: PendingJob = {
    resolve,
    reject,
    onProgress,
    prepared,
    items: images,
    options,
    settled: false,
  };
  pending.set(id, job);

  try {
    const w = ensureWorker();
    const request: WorkerRequest = {
      kind: 'pack',
      id,
      rects,
      options: toWorkerOptions(options),
    };
    w.postMessage(request);
    job.timeoutId = window.setTimeout(() => {
      if (!job.settled) resetWorkerAndFallbackPending();
    }, WORKER_TIMEOUT_MS);
  } catch {
    settleWithSyncFallback(id, job);
  }

  const cancel = (): void => {
    if (job.settled) return;
    job.settled = true;
    clearJobTimeout(job);
    pending.delete(id);
    if (worker) {
      const cancelMsg: WorkerRequest = { kind: 'cancel', id };
      try {
        worker.postMessage(cancelMsg);
      } catch {
        // ignore
      }
    }
    reject(new Error('cancelled'));
  };

  return { promise, cancel };
}
