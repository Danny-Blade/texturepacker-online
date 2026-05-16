// Web Worker module loaded via:
//   new Worker(new URL('./packer.worker.ts', import.meta.url), { type: 'module' })
// It performs pure rectangle packing (no DOM, no image work). The main thread
// preprocesses sprites and sends lightweight rects; the worker returns
// placements. Cancellation is cooperative: the host can send a `cancel`
// message with the same request id to abort an in-flight pack.

export type PackingAlgorithm =
  | 'maxrects-bssf'
  | 'maxrects-blsf'
  | 'maxrects-baf'
  | 'maxrects-bl'
  | 'maxrects-cp'
  | 'maxrects-best'
  | 'shelf';

export interface WorkerPackOptions {
  maxWidth: number;
  maxHeight: number;
  borderPadding: number;
  shapePadding: number;
  allowRotation: boolean;
  powerOfTwo: boolean;
  forceSquare: boolean;
  algorithm: PackingAlgorithm;
  multipack: boolean;
}

export interface WorkerRect {
  id: string;
  w: number;
  h: number;
}

export interface WorkerPlaced {
  id: string;
  x: number;
  y: number;
  rotated: boolean;
}

export interface WorkerSheet {
  index: number;
  width: number;
  height: number;
  placed: WorkerPlaced[];
}

export type WorkerRequest =
  | { kind: 'pack'; id: number; rects: WorkerRect[]; options: WorkerPackOptions }
  | { kind: 'cancel'; id: number };

export type WorkerResponse =
  | { kind: 'progress'; id: number; progress: number }
  | { kind: 'done'; id: number; sheets: WorkerSheet[]; failedIds: string[] }
  | { kind: 'error'; id: number; message: string };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlacementInput {
  id: string;
  width: number;
  height: number;
}

interface PlacementResult {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
  rotated: boolean;
  placed: boolean;
}

const HEURISTICS_FOR_BEST: PackingAlgorithm[] = [
  'maxrects-bssf',
  'maxrects-blsf',
  'maxrects-baf',
  'maxrects-bl',
  'maxrects-cp',
];

function rectArea(r: Rect): number {
  return r.width * r.height;
}

class MaxRectsPacker {
  private maxWidth: number;
  private maxHeight: number;
  private padding: number;
  private borderPadding: number;
  private allowRotation: boolean;
  private algorithm: PackingAlgorithm;
  private freeRects: Rect[] = [];
  private usedRects: Rect[] = [];

  constructor(options: WorkerPackOptions) {
    this.maxWidth = options.maxWidth;
    this.maxHeight = options.maxHeight;
    this.padding = Math.max(options.shapePadding ?? 0, 0);
    this.borderPadding = Math.max(options.borderPadding ?? 0, 0);
    this.allowRotation = options.allowRotation;
    this.algorithm = options.algorithm;
    const bp = this.borderPadding;
    this.freeRects = [
      {
        x: bp,
        y: bp,
        width: Math.max(0, this.maxWidth - bp * 2),
        height: Math.max(0, this.maxHeight - bp * 2),
      },
    ];
  }

  pack(items: PlacementInput[]): PlacementResult[] {
    const sorted = items.slice().sort((a, b) => b.width * b.height - a.width * a.height);
    const out: PlacementResult[] = [];
    for (const img of sorted) {
      const paddedW = img.width + this.padding * 2;
      const paddedH = img.height + this.padding * 2;
      let result = this.findBestRect(paddedW, paddedH);
      let rotated = false;
      if (!result && this.allowRotation && img.width !== img.height) {
        result = this.findBestRect(paddedH, paddedW);
        if (result) rotated = true;
      }
      if (result) {
        out.push({
          id: img.id,
          width: img.width,
          height: img.height,
          x: result.x + this.padding,
          y: result.y + this.padding,
          rotated,
          placed: true,
        });
        this.placeRect(result);
      } else {
        out.push({
          id: img.id,
          width: img.width,
          height: img.height,
          x: 0,
          y: 0,
          rotated: false,
          placed: false,
        });
      }
    }
    return out;
  }

  private findBestRect(width: number, height: number): Rect | null {
    let best: Rect | null = null;
    let bestPrimary = Infinity;
    let bestSecondary = Infinity;
    for (const rect of this.freeRects) {
      if (rect.width < width || rect.height < height) continue;
      const leftoverX = rect.width - width;
      const leftoverY = rect.height - height;
      let primary: number;
      let secondary: number;
      switch (this.algorithm) {
        case 'maxrects-blsf':
          primary = Math.max(leftoverX, leftoverY);
          secondary = Math.min(leftoverX, leftoverY);
          break;
        case 'maxrects-baf':
          primary = rectArea(rect) - width * height;
          secondary = Math.min(leftoverX, leftoverY);
          break;
        case 'maxrects-bl':
          primary = rect.y + height;
          secondary = rect.x;
          break;
        case 'maxrects-cp':
          primary = Math.min(leftoverX, leftoverY);
          secondary = rect.x + rect.y;
          break;
        case 'shelf':
          primary = rect.y;
          secondary = rect.x;
          break;
        case 'maxrects-bssf':
        default:
          primary = Math.min(leftoverX, leftoverY);
          secondary = Math.max(leftoverX, leftoverY);
          break;
      }
      if (primary < bestPrimary || (primary === bestPrimary && secondary < bestSecondary)) {
        best = { x: rect.x, y: rect.y, width, height };
        bestPrimary = primary;
        bestSecondary = secondary;
      }
    }
    return best;
  }

  private placeRect(rect: Rect): void {
    const n = this.freeRects.length;
    for (let i = 0; i < n; i++) {
      if (this.splitFreeNode(this.freeRects[i], rect)) {
        this.freeRects.splice(i, 1);
        i--;
      }
    }
    this.pruneFreeList();
    this.usedRects.push(rect);
  }

  private splitFreeNode(freeNode: Rect, usedNode: Rect): boolean {
    if (
      usedNode.x >= freeNode.x + freeNode.width ||
      usedNode.x + usedNode.width <= freeNode.x ||
      usedNode.y >= freeNode.y + freeNode.height ||
      usedNode.y + usedNode.height <= freeNode.y
    ) {
      return false;
    }
    if (usedNode.x < freeNode.x + freeNode.width && usedNode.x + usedNode.width > freeNode.x) {
      if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.height) {
        const n = { ...freeNode };
        n.height = usedNode.y - n.y;
        this.freeRects.push(n);
      }
      if (usedNode.y + usedNode.height < freeNode.y + freeNode.height) {
        const n = { ...freeNode };
        n.y = usedNode.y + usedNode.height;
        n.height = freeNode.y + freeNode.height - (usedNode.y + usedNode.height);
        this.freeRects.push(n);
      }
    }
    if (usedNode.y < freeNode.y + freeNode.height && usedNode.y + usedNode.height > freeNode.y) {
      if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.width) {
        const n = { ...freeNode };
        n.width = usedNode.x - n.x;
        this.freeRects.push(n);
      }
      if (usedNode.x + usedNode.width < freeNode.x + freeNode.width) {
        const n = { ...freeNode };
        n.x = usedNode.x + usedNode.width;
        n.width = freeNode.x + freeNode.width - (usedNode.x + usedNode.width);
        this.freeRects.push(n);
      }
    }
    return true;
  }

  private pruneFreeList(): void {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        if (this.isContainedIn(this.freeRects[i], this.freeRects[j])) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (this.isContainedIn(this.freeRects[j], this.freeRects[i])) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }

  private isContainedIn(a: Rect, b: Rect): boolean {
    return (
      a.x >= b.x &&
      a.y >= b.y &&
      a.x + a.width <= b.x + b.width &&
      a.y + a.height <= b.y + b.height
    );
  }

  getUsedBounds(): { width: number; height: number } {
    if (this.usedRects.length === 0) return { width: 0, height: 0 };
    let maxX = 0;
    let maxY = 0;
    for (const r of this.usedRects) {
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y + r.height > maxY) maxY = r.y + r.height;
    }
    return { width: maxX + this.borderPadding, height: maxY + this.borderPadding };
  }
}

function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

interface CancelToken {
  cancelled: boolean;
}

interface AttemptResult {
  sheets: WorkerSheet[];
  failedIds: string[];
  score: number;
}

function packWithAlgorithm(
  rects: WorkerRect[],
  options: WorkerPackOptions,
  token: CancelToken,
  reportProgress: () => void,
): AttemptResult | null {
  const placement: PlacementInput[] = rects.map((r) => ({ id: r.id, width: r.w, height: r.h }));
  const sheets: WorkerSheet[] = [];
  const failedIds: string[] = [];
  let remaining = placement;
  let sheetIndex = 0;
  let safety = 64;

  while (remaining.length > 0 && safety-- > 0) {
    if (token.cancelled) return null;
    const packer = new MaxRectsPacker(options);
    const sheetItems = packer.pack(remaining);
    const placedInThisSheet = sheetItems.filter((s) => s.placed);
    const unplaced = sheetItems.filter((s) => !s.placed);

    if (placedInThisSheet.length === 0) {
      for (const u of unplaced) failedIds.push(u.id);
      break;
    }

    const bounds = packer.getUsedBounds();
    let sheetWidth = bounds.width;
    let sheetHeight = bounds.height;
    if (options.powerOfTwo) {
      sheetWidth = nextPowerOfTwo(sheetWidth);
      sheetHeight = nextPowerOfTwo(sheetHeight);
    }
    if (options.forceSquare) {
      const side = Math.max(sheetWidth, sheetHeight);
      sheetWidth = side;
      sheetHeight = side;
    }
    sheetWidth = Math.max(sheetWidth, 1);
    sheetHeight = Math.max(sheetHeight, 1);

    sheets.push({
      index: sheetIndex,
      width: sheetWidth,
      height: sheetHeight,
      placed: placedInThisSheet.map((p) => ({ id: p.id, x: p.x, y: p.y, rotated: p.rotated })),
    });

    if (!options.multipack) {
      for (const u of unplaced) failedIds.push(u.id);
      break;
    }

    remaining = unplaced.map((u) => ({ id: u.id, width: u.width, height: u.height }));
    sheetIndex += 1;
    reportProgress();
  }

  const score = sheets.reduce((s, sh) => s + sh.width * sh.height, 0);
  return { sheets, failedIds, score };
}

const tokens = new Map<number, CancelToken>();

function handlePack(req: Extract<WorkerRequest, { kind: 'pack' }>): void {
  const token: CancelToken = { cancelled: false };
  tokens.set(req.id, token);
  try {
    const algorithms =
      req.options.algorithm === 'maxrects-best'
        ? HEURISTICS_FOR_BEST
        : [req.options.algorithm];

    let best: AttemptResult | null = null;
    const total = algorithms.length;
    for (let i = 0; i < algorithms.length; i++) {
      if (token.cancelled) {
        post({ kind: 'error', id: req.id, message: 'cancelled' });
        return;
      }
      const alg = algorithms[i];
      const attempt = packWithAlgorithm(
        req.rects,
        { ...req.options, algorithm: alg },
        token,
        () => {
          const base = i / total;
          post({ kind: 'progress', id: req.id, progress: Math.min(0.99, base + 0.5 / total) });
        },
      );
      if (token.cancelled || attempt === null) {
        post({ kind: 'error', id: req.id, message: 'cancelled' });
        return;
      }
      if (attempt.score > 0 && (!best || attempt.score < best.score)) {
        best = attempt;
      } else if (!best) {
        best = attempt;
      }
      post({ kind: 'progress', id: req.id, progress: (i + 1) / total });
    }

    if (!best) {
      post({ kind: 'done', id: req.id, sheets: [], failedIds: req.rects.map((r) => r.id) });
      return;
    }

    post({ kind: 'done', id: req.id, sheets: best.sheets, failedIds: best.failedIds });
  } catch (err) {
    post({ kind: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
  } finally {
    tokens.delete(req.id);
  }
}

interface PostMessageTarget {
  postMessage(message: unknown): void;
}

function post(msg: WorkerResponse): void {
  (self as unknown as PostMessageTarget).postMessage(msg);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.kind === 'pack') {
    handlePack(data);
  } else if (data.kind === 'cancel') {
    const tok = tokens.get(data.id);
    if (tok) tok.cancelled = true;
  }
});
