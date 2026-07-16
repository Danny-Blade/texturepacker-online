import { describe, expect, it } from 'vitest';
import {
  clampFps,
  detectAnimationGroups,
  mergeDetectedAnimationGroups,
  normalizedSpritePivot,
  nextAnimationFrame,
  sanitizeAnimationGroup,
  type AnimationGroup,
} from '../src/lib/animation';
import type { ImageItem } from '../src/lib/packer';

function image(id: string, name: string, metadata?: Record<string, unknown>): ImageItem {
  return {
    id,
    name,
    width: 100,
    height: 50,
    image: {} as HTMLImageElement,
    url: `data:image/png;base64,${id}`,
    metadata,
  };
}

describe('animation recognition', () => {
  it('groups numbered suffixes by folder and stem in numeric order', () => {
    const groups = detectAnimationGroups([
      image('10', 'characters/run_10.png'),
      image('idle', 'characters/idle'),
      image('2', 'characters/run_02.png'),
      image('1', 'characters/run_1.png'),
      image('other-2', 'effects/run_2'),
      image('other-1', 'effects/run_1'),
      image('dot-2', 'characters/blink.002'),
      image('dot-1', 'characters/blink.001'),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.name === 'characters/run')?.frameIds).toEqual(['1', '2', '10']);
    expect(groups.find((group) => group.name === 'effects/run')?.frameIds).toEqual(['other-1', 'other-2']);
    expect(groups.find((group) => group.name === 'characters/blink')?.frameIds).toEqual(['dot-1', 'dot-2']);
  });

  it('ignores non-numbered sprites and single numbered frames', () => {
    expect(detectAnimationGroups([image('a', 'idle'), image('b', 'jump_01')])).toEqual([]);
  });

  it('keeps customized auto playback and all manual groups while reconciling frames', () => {
    const detected = detectAnimationGroups([image('1', 'walk_1'), image('2', 'walk_2'), image('3', 'walk_3')]);
    const savedAuto = { ...detected[0], fps: 24, loop: false, frameIds: ['1', '2'] };
    const manual: AnimationGroup = { id: 'manual:x', name: 'Combo', frameIds: ['3', '1'], fps: 8, loop: true, source: 'manual' };
    const merged = mergeDetectedAnimationGroups([savedAuto, manual], detected);

    expect(merged[0]).toMatchObject({ fps: 24, loop: false, frameIds: ['1', '2', '3'] });
    expect(merged[1]).toEqual(manual);
  });

  it('removes stale manual frame references when sprites are deleted', () => {
    const manual: AnimationGroup = { id: 'manual:x', name: 'Combo', frameIds: ['gone', 'kept'], fps: 8, loop: true, source: 'manual' };
    expect(mergeDetectedAnimationGroups([manual], [], new Set(['kept']))[0].frameIds).toEqual(['kept']);
    expect(mergeDetectedAnimationGroups([manual], [], new Set())).toEqual([]);
  });
});

describe('animation data validation and pivot alignment', () => {
  it('clamps fps to the supported live-preview range', () => {
    expect(clampFps(0)).toBe(1);
    expect(clampFps(120)).toBe(60);
    expect(clampFps(Number.NaN)).toBe(12);
  });

  it('filters stale and duplicate frame references', () => {
    const result = sanitizeAnimationGroup(
      { id: 'manual:a', name: '  Test  ', frameIds: ['one', 'missing', 'one'], fps: 100, loop: true, source: 'manual' },
      new Set(['one']),
    );
    expect(result).toMatchObject({ name: 'Test', frameIds: ['one'], fps: 60 });
  });

  it('normalizes relative, absolute, invalid, and missing pivots', () => {
    expect(normalizedSpritePivot(image('a', 'a', { pivot: { mode: 'relative', x: 0.25, y: 0.8 } }))).toEqual({ x: 0.25, y: 0.8 });
    expect(normalizedSpritePivot(image('b', 'b', { pivot: { mode: 'absolute', x: 25, y: 10 } }))).toEqual({ x: 0.25, y: 0.2 });
    expect(normalizedSpritePivot(image('c', 'c', { pivot: { x: 0.1, y: 0.9 } }))).toEqual({ x: 0.1, y: 0.9 });
    expect(normalizedSpritePivot(image('d', 'd'))).toEqual({ x: 0.5, y: 0.5 });
  });

  it('advances, loops, and stops playback at the final frame', () => {
    expect(nextAnimationFrame(0, 3, false)).toEqual({ index: 1, ended: false });
    expect(nextAnimationFrame(2, 3, true)).toEqual({ index: 0, ended: false });
    expect(nextAnimationFrame(2, 3, false)).toEqual({ index: 2, ended: true });
    expect(nextAnimationFrame(0, 0, true)).toEqual({ index: 0, ended: true });
  });
});
