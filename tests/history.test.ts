import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  clearHistory,
  COALESCE_WINDOW_MS,
  DEFAULT_HISTORY_LIMIT,
  initialHistoryState,
  pushSnapshot,
  redo,
  undo,
  type HistorySnapshot,
  type HistoryState,
} from '../src/lib/history';
import type { ImageItem, PackerOptions } from '../src/lib/packer';
import type { PublishOptions } from '../src/lib/store';

function baseSettings(overrides: Partial<PackerOptions> = {}): PackerOptions {
  return {
    maxWidth: 512,
    maxHeight: 512,
    borderPadding: 0,
    shapePadding: 2,
    innerPadding: 0,
    allowRotation: false,
    powerOfTwo: true,
    forceSquare: false,
    algorithm: 'maxrects-bssf',
    trimAlpha: false,
    trimThreshold: 1,
    trimMode: 'none',
    polygonTolerance: 2,
    extrude: 0,
    multipack: false,
    ...overrides,
  };
}

function basePublishOptions(overrides: Partial<PublishOptions> = {}): PublishOptions {
  return {
    imageFormat: 'png',
    imageQuality: 0.9,
    scales: [1],
    imageFileTemplate: '{name}.{ext}',
    dataFileTemplate: '{name}.{ext}',
    bundleZip: false,
    ...overrides,
  };
}

function snap(overrides: Partial<HistorySnapshot> = {}): HistorySnapshot {
  return {
    images: overrides.images ?? [],
    settings: overrides.settings ?? baseSettings(),
    publishOptions: overrides.publishOptions ?? basePublishOptions(),
    exportFormat: overrides.exportFormat ?? 'json',
    fileName: overrides.fileName ?? 'spritesheet',
    activeSheet: overrides.activeSheet ?? 0,
    label: overrides.label ?? 'test',
    timestamp: overrides.timestamp ?? Date.now(),
    coalesceKey: overrides.coalesceKey,
  };
}

function fakeImage(id: string): ImageItem {
  return {
    id,
    name: `${id}.png`,
    width: 10,
    height: 10,
    image: {} as HTMLImageElement,
    url: `test:${id}`,
  };
}

describe('history reducer', () => {
  it('starts with a canonical empty state', () => {
    expect(initialHistoryState.past).toEqual([]);
    expect(initialHistoryState.future).toEqual([]);
    expect(initialHistoryState.limit).toBe(DEFAULT_HISTORY_LIMIT);
    expect(canUndo(initialHistoryState)).toBe(false);
    expect(canRedo(initialHistoryState)).toBe(false);
  });

  it('pushSnapshot appends to past and leaves future empty', () => {
    const s = snap({ label: 'first' });
    const next = pushSnapshot(initialHistoryState, s);
    expect(next.past).toEqual([s]);
    expect(next.future).toEqual([]);
    expect(canUndo(next)).toBe(true);
  });

  it('evicts the oldest snapshot when past exceeds limit', () => {
    let state: HistoryState = { past: [], future: [], limit: 3 };
    for (let i = 0; i < 5; i++) {
      state = pushSnapshot(state, snap({ label: `s${i}`, fileName: `file-${i}` }));
    }
    expect(state.past).toHaveLength(3);
    expect(state.past.map((s) => s.label)).toEqual(['s2', 's3', 's4']);
  });

  it('undo moves the tip of past to future and returns it', () => {
    const a = snap({ label: 'a' });
    const b = snap({ label: 'b', fileName: 'b' });
    let state = pushSnapshot(initialHistoryState, a);
    state = pushSnapshot(state, b);
    const current = snap({ label: 'current', fileName: 'current' });
    const { history, snap: restored } = undo(state, current);
    expect(restored).toBe(b);
    expect(history.past).toEqual([a]);
    expect(history.future[0]).toBe(current);
    expect(canRedo(history)).toBe(true);
  });

  it('redo moves the head of future back into past', () => {
    const a = snap({ label: 'a' });
    const b = snap({ label: 'b', fileName: 'b' });
    let state = pushSnapshot(initialHistoryState, a);
    state = pushSnapshot(state, b);
    const current = snap({ label: 'current', fileName: 'current' });
    const { history: afterUndo } = undo(state, current);
    // Simulate the caller updating "current" to the restored snapshot before redo.
    const { history: afterRedo, snap: restored } = redo(afterUndo, b);
    expect(restored).toBe(current);
    expect(afterRedo.future).toEqual([]);
    expect(afterRedo.past[afterRedo.past.length - 1]).toBe(b);
  });

  it('undo/redo are no-ops when their respective stacks are empty', () => {
    const current = snap({ label: 'current' });
    const undoResult = undo(initialHistoryState, current);
    expect(undoResult.snap).toBeNull();
    expect(undoResult.history).toBe(initialHistoryState);

    const state = pushSnapshot(initialHistoryState, snap({ label: 'a' }));
    const redoResult = redo(state, current);
    expect(redoResult.snap).toBeNull();
    expect(redoResult.history).toBe(state);
  });

  it('pushSnapshot after undo clears the future timeline', () => {
    const a = snap({ label: 'a' });
    const b = snap({ label: 'b', fileName: 'b' });
    let state = pushSnapshot(initialHistoryState, a);
    state = pushSnapshot(state, b);
    const current = snap({ label: 'current', fileName: 'current' });
    const { history: afterUndo } = undo(state, current);
    expect(afterUndo.future).toHaveLength(1);
    // A new edit while a redo timeline exists must discard it.
    const branched = pushSnapshot(afterUndo, snap({ label: 'branch', fileName: 'branch' }));
    expect(branched.future).toEqual([]);
    expect(branched.past.map((s) => s.label)).toEqual(['a', 'branch']);
  });

  it('skips consecutive byte-equivalent pushes and still clears future', () => {
    const images = [fakeImage('a')];
    const a = snap({ label: 'a', images });
    const b = snap({ label: 'a-again', images });
    let state = pushSnapshot(initialHistoryState, a);
    // Reintroduce a redo entry so the equality-skip branch has something to
    // clear (mirrors what happens if a user undoes then triggers a no-op edit).
    state = { ...state, future: [snap({ label: 'orphan' })] };
    const next = pushSnapshot(state, b);
    expect(next.past).toEqual([a]);
    expect(next.future).toEqual([]);
  });

  it('collapses same-key slider drags within the coalesce window', () => {
    const t = 1_000;
    const a = snap({
      label: 'Change padding',
      coalesceKey: 'settings:padding',
      settings: baseSettings({ shapePadding: 2 }),
      timestamp: t,
    });
    const b = snap({
      label: 'Change padding',
      coalesceKey: 'settings:padding',
      settings: baseSettings({ shapePadding: 3 }),
      timestamp: t + COALESCE_WINDOW_MS - 1,
    });
    let state = pushSnapshot(initialHistoryState, a);
    state = pushSnapshot(state, b);
    // The pre-drag snapshot (a) is retained; b is dropped so undo jumps back
    // to before the drag started, not to an intermediate step.
    expect(state.past).toEqual([a]);
  });

  it('does not coalesce past the time window or across keys', () => {
    const t = 1_000;
    const a = snap({ label: 'padding', coalesceKey: 'settings:padding', timestamp: t });
    const late = snap({
      label: 'padding',
      coalesceKey: 'settings:padding',
      timestamp: t + COALESCE_WINDOW_MS + 1,
    });
    let state = pushSnapshot(initialHistoryState, a);
    state = pushSnapshot(state, late);
    expect(state.past).toEqual([a, late]);

    const other = snap({ label: 'extrude', coalesceKey: 'settings:extrude', timestamp: t });
    state = pushSnapshot(initialHistoryState, a);
    state = pushSnapshot(state, other);
    expect(state.past).toEqual([a, other]);
  });

  it('clearHistory returns a fresh empty state', () => {
    const state = pushSnapshot(initialHistoryState, snap({ label: 'x' }));
    expect(canUndo(state)).toBe(true);
    const cleared = clearHistory();
    expect(cleared.past).toEqual([]);
    expect(cleared.future).toEqual([]);
    expect(cleared).not.toBe(initialHistoryState);
  });
});
