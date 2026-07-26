import type { ExportFormat, ImageItem, PackerOptions } from './packer';
import type { PublishOptions } from './store';

/**
 * A single point-in-time capture of the undoable slice of the store.
 * Image bitmaps are held by reference — `ImageItem.image` (HTMLImageElement)
 * is effectively immutable for the lifetime of a sprite, so cloning would
 * only waste memory. Metadata patches produce fresh `ImageItem` objects, so
 * shallow-comparing the `images` array by reference is a valid change signal.
 */
export interface HistorySnapshot {
  images: ImageItem[];
  settings: PackerOptions;
  publishOptions: PublishOptions;
  exportFormat: ExportFormat;
  fileName: string;
  activeSheet: number;
  /** Human-readable description of the edit ("Add 3 sprites", "Change padding"). */
  label: string;
  /** Wall-clock timestamp of when the snapshot was captured. */
  timestamp: number;
  /**
   * Optional coalescing key. When two consecutive pushes share the same key
   * within {@link COALESCE_WINDOW_MS} the newer push replaces the tip of
   * `past` instead of growing it, so dragging a slider does not flood
   * history with per-pixel snapshots.
   */
  coalesceKey?: string;
}

export interface HistoryState {
  /** Oldest to newest. The tip (last element) is the state immediately before the current one. */
  past: HistorySnapshot[];
  /** Newest to oldest, so `future[0]` is the next state to redo into. */
  future: HistorySnapshot[];
  /** Cap on `past.length`; oldest entries are evicted first. */
  limit: number;
}

export const DEFAULT_HISTORY_LIMIT = 100;

/** Coalescing window for repeated single-key setting changes (e.g. slider drags). */
export const COALESCE_WINDOW_MS = 400;

export const initialHistoryState: HistoryState = {
  past: [],
  future: [],
  limit: DEFAULT_HISTORY_LIMIT,
};

/** Fingerprint used to detect byte-equivalent snapshots. Cheap enough per-edit. */
function snapshotFingerprint(snap: HistorySnapshot): string {
  return [
    JSON.stringify(snap.settings),
    JSON.stringify(snap.publishOptions),
    snap.exportFormat,
    snap.fileName,
    String(snap.activeSheet),
  ].join('|');
}

function snapshotsEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  if (!Object.is(a.images, b.images)) return false;
  return snapshotFingerprint(a) === snapshotFingerprint(b);
}

/**
 * Push `snap` onto `past` and clear `future` (a new edit always invalidates
 * the redo timeline). No-op when the incoming snapshot is byte-equivalent to
 * the tip of `past`. When the incoming snapshot shares a `coalesceKey` with
 * the tip and lands within {@link COALESCE_WINDOW_MS}, it *replaces* the tip
 * instead of appending — this keeps slider drags to a single undoable step.
 */
export function pushSnapshot(state: HistoryState, snap: HistorySnapshot): HistoryState {
  const tip = state.past.length > 0 ? state.past[state.past.length - 1] : null;
  if (tip && snapshotsEqual(tip, snap)) {
    // Same state as tip; nothing to record but still clear future because the
    // caller intended to mutate (they invalidated the redo chain).
    return state.future.length === 0 ? state : { ...state, future: [] };
  }
  if (
    tip &&
    snap.coalesceKey &&
    tip.coalesceKey === snap.coalesceKey &&
    snap.timestamp - tip.timestamp <= COALESCE_WINDOW_MS
  ) {
    // Skip the push: the earlier snapshot already captured the pre-drag
    // state, so undo from the current state should jump straight past every
    // intermediate slider frame. `future` is still cleared because the
    // caller intended a fresh edit.
    return state.future.length === 0 ? state : { ...state, future: [] };
  }
  const past = [...state.past, snap];
  while (past.length > state.limit) past.shift();
  return { ...state, past, future: [] };
}

/**
 * Pop the tip of `past` and return it, pushing `current` to the head of
 * `future` so `redo()` can restore it. Returns `snap: null` when there is
 * nothing to undo; callers should leave state untouched in that case.
 */
export function undo(
  state: HistoryState,
  current: HistorySnapshot,
): { history: HistoryState; snap: HistorySnapshot | null } {
  if (state.past.length === 0) {
    return { history: state, snap: null };
  }
  const past = state.past.slice(0, -1);
  const snap = state.past[state.past.length - 1];
  const future = [current, ...state.future];
  return { history: { ...state, past, future }, snap };
}

/**
 * Symmetric with {@link undo}: shift the head of `future` back into place and
 * push `current` to the tail of `past`.
 */
export function redo(
  state: HistoryState,
  current: HistorySnapshot,
): { history: HistoryState; snap: HistorySnapshot | null } {
  if (state.future.length === 0) {
    return { history: state, snap: null };
  }
  const snap = state.future[0];
  const future = state.future.slice(1);
  const past = [...state.past, current];
  while (past.length > state.limit) past.shift();
  return { history: { ...state, past, future }, snap };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

export function clearHistory(): HistoryState {
  return { ...initialHistoryState };
}
