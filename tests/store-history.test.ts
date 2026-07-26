import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTpStore } from '../src/lib/store';
import type { ImageItem } from '../src/lib/packer';

function fakeImage(id: string): ImageItem {
  return {
    id,
    name: `${id}.png`,
    width: 16,
    height: 16,
    image: {} as HTMLImageElement,
    url: `test:${id}`,
  };
}

/**
 * Every store mutation kicks off a background pack via a microtask. That
 * ultimately calls `document.createElement('canvas')` and would throw an
 * unhandled `ReferenceError: document is not defined` in this node
 * environment — the exception happens outside the test body, so it wouldn't
 * fail assertions but it would pollute the reporter. Stubbing document with
 * a canvas factory that returns a no-op context sidesteps the whole path.
 */
function stubDocumentForPacker() {
  const fakeCtx = {
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    clearRect: () => {},
    fillRect: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    fillStyle: '#000',
    globalCompositeOperation: 'source-over',
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
  };
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => fakeCtx,
    }),
  });
}

describe('store undo/redo integration', () => {
  beforeEach(() => {
    stubDocumentForPacker();
    useTpStore.getState().__resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with an empty history stack', () => {
    const s = useTpStore.getState();
    expect(s.history.past).toEqual([]);
    expect(s.history.future).toEqual([]);
    expect(s.canUndoNow()).toBe(false);
    expect(s.canRedoNow()).toBe(false);
  });

  it('captures a snapshot before adding sprites', () => {
    useTpStore.getState().addImages([fakeImage('hero')]);
    const s = useTpStore.getState();
    expect(s.images).toHaveLength(1);
    expect(s.history.past).toHaveLength(1);
    // The archived snapshot is the pre-edit state (no sprites).
    expect(s.history.past[0].images).toEqual([]);
    expect(s.canUndoNow()).toBe(true);
  });

  it('records separate snapshots for successive edits', () => {
    useTpStore.getState().addImages([fakeImage('hero')]);
    useTpStore.getState().setSettings({ shapePadding: 8 });
    const s = useTpStore.getState();
    expect(s.history.past).toHaveLength(2);
    expect(s.settings.shapePadding).toBe(8);
  });

  it('undo restores the previous images and settings', () => {
    useTpStore.getState().addImages([fakeImage('hero')]);
    useTpStore.getState().setSettings({ shapePadding: 8 });
    useTpStore.getState().undo();
    const afterFirstUndo = useTpStore.getState();
    expect(afterFirstUndo.settings.shapePadding).toBe(2);
    expect(afterFirstUndo.images).toHaveLength(1);
    expect(afterFirstUndo.canRedoNow()).toBe(true);

    useTpStore.getState().undo();
    const afterSecondUndo = useTpStore.getState();
    expect(afterSecondUndo.images).toEqual([]);
    expect(afterSecondUndo.canUndoNow()).toBe(false);
    expect(afterSecondUndo.canRedoNow()).toBe(true);
  });

  it('redo re-applies the most recently undone edit', () => {
    useTpStore.getState().addImages([fakeImage('hero')]);
    useTpStore.getState().setSettings({ shapePadding: 8 });
    useTpStore.getState().undo();
    useTpStore.getState().undo();
    expect(useTpStore.getState().images).toEqual([]);

    useTpStore.getState().redo();
    expect(useTpStore.getState().images).toHaveLength(1);
    expect(useTpStore.getState().settings.shapePadding).toBe(2);

    useTpStore.getState().redo();
    expect(useTpStore.getState().settings.shapePadding).toBe(8);
    expect(useTpStore.getState().canRedoNow()).toBe(false);
  });

  it('a fresh edit after undo discards the redo timeline', () => {
    useTpStore.getState().addImages([fakeImage('hero')]);
    useTpStore.getState().setSettings({ shapePadding: 8 });
    useTpStore.getState().undo();
    expect(useTpStore.getState().canRedoNow()).toBe(true);

    useTpStore.getState().setFileName('branched');
    expect(useTpStore.getState().canRedoNow()).toBe(false);
    expect(useTpStore.getState().fileName).toBe('branched');
  });

  it('undo/redo are no-ops when their stacks are empty', () => {
    // Neither call should throw or corrupt state.
    useTpStore.getState().undo();
    useTpStore.getState().redo();
    const s = useTpStore.getState();
    expect(s.images).toEqual([]);
    expect(s.canUndoNow()).toBe(false);
    expect(s.canRedoNow()).toBe(false);
  });

  it('removeImages captures a snapshot and undo puts the sprites back', () => {
    useTpStore.getState().addImages([fakeImage('a'), fakeImage('b')]);
    const initialImages = useTpStore.getState().images;
    useTpStore.getState().removeImages([initialImages[0].id]);
    expect(useTpStore.getState().images.map((i) => i.id)).toEqual(['b']);
    useTpStore.getState().undo();
    expect(useTpStore.getState().images).toBe(initialImages);
  });
});
