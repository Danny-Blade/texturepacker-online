import type { ImageItem } from './packer';

export type AnimationGroupSource = 'auto' | 'manual';

export interface AnimationGroup {
  id: string;
  name: string;
  frameIds: string[];
  fps: number;
  loop: boolean;
  source: AnimationGroupSource;
}

export interface SpritePivot {
  mode: 'relative' | 'absolute';
  x: number;
  y: number;
}

interface NumberedFrame {
  image: ImageItem;
  groupKey: string;
  groupName: string;
  number: number;
}

const NUMBERED_FRAME_RE = /^(.*?)(?:[_ .-]?)(\d+)$/;

function splitPath(name: string): { directory: string; base: string } {
  const slash = name.lastIndexOf('/');
  return slash < 0
    ? { directory: '', base: name }
    : { directory: name.slice(0, slash), base: name.slice(slash + 1) };
}

function numberedFrame(image: ImageItem): NumberedFrame | null {
  // Imported ImageItem names are normally extensionless, but restored or
  // programmatic inputs may still carry a common image extension.
  const { directory, base } = splitPath(
    image.name.replace(/\.(?:png|jpe?g|webp|gif|svg|bmp|avif)$/i, ''),
  );
  const match = base.match(NUMBERED_FRAME_RE);
  if (!match || !match[1]) return null;
  const stem = match[1].replace(/[_ .-]+$/, '');
  if (!stem) return null;
  const groupName = directory ? `${directory}/${stem}` : stem;
  return {
    image,
    groupKey: groupName.toLocaleLowerCase(),
    groupName,
    number: Number(match[2]),
  };
}

function autoGroupId(groupKey: string): string {
  return `auto:${encodeURIComponent(groupKey)}`;
}

/** Detect sequences such as run_01, run_02 or effects/hit-1, effects/hit-2. */
export function detectAnimationGroups(images: ImageItem[]): AnimationGroup[] {
  const buckets = new Map<string, NumberedFrame[]>();
  for (const image of images) {
    const frame = numberedFrame(image);
    if (!frame) continue;
    const bucket = buckets.get(frame.groupKey) ?? [];
    bucket.push(frame);
    buckets.set(frame.groupKey, bucket);
  }

  return [...buckets.entries()]
    .filter(([, frames]) => frames.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, frames]) => {
      frames.sort((a, b) => a.number - b.number || a.image.name.localeCompare(b.image.name));
      return {
        id: autoGroupId(key),
        name: frames[0].groupName,
        frameIds: frames.map((frame) => frame.image.id),
        fps: 12,
        loop: true,
        source: 'auto',
      };
    });
}

/** Reconcile detected sequences while retaining user-customized playback settings. */
export function mergeDetectedAnimationGroups(
  existing: AnimationGroup[],
  detected: AnimationGroup[],
  validSpriteIds?: ReadonlySet<string>,
): AnimationGroup[] {
  const detectedIds = new Set(detected.map((group) => group.id));
  const manual = existing
    .filter((group) => group.source === 'manual')
    .map((group) => validSpriteIds
      ? { ...group, frameIds: group.frameIds.filter((id) => validSpriteIds.has(id)) }
      : group)
    .filter((group) => group.frameIds.length > 0);
  const previous = new Map(existing.map((group) => [group.id, group]));
  const automatic = detected.map((group) => {
    const saved = previous.get(group.id);
    return saved
      ? { ...group, name: saved.name, fps: saved.fps, loop: saved.loop }
      : group;
  });
  // Old auto groups disappear when their source sequence no longer exists.
  return [...automatic, ...manual].filter(
    (group) => group.source === 'manual' || detectedIds.has(group.id),
  );
}

export function sanitizeAnimationGroup(
  group: AnimationGroup,
  validSpriteIds: ReadonlySet<string>,
): AnimationGroup | null {
  if (!group.id || !group.name.trim() || !['auto', 'manual'].includes(group.source)) return null;
  const frameIds = [...new Set(group.frameIds)].filter((id) => validSpriteIds.has(id));
  if (frameIds.length === 0) return null;
  return {
    ...group,
    name: group.name.trim(),
    frameIds,
    fps: clampFps(group.fps),
    loop: Boolean(group.loop),
  };
}

export function clampFps(fps: number): number {
  return Number.isFinite(fps) ? Math.max(1, Math.min(60, Math.round(fps))) : 12;
}

export function spritePivot(image: ImageItem): SpritePivot {
  const candidate = image.metadata?.pivot;
  if (typeof candidate !== 'object' || candidate === null) {
    return { mode: 'relative', x: 0.5, y: 0.5 };
  }
  const pivot = candidate as Partial<SpritePivot>;
  if (typeof pivot.x !== 'number' || !Number.isFinite(pivot.x)
    || typeof pivot.y !== 'number' || !Number.isFinite(pivot.y)) {
    return { mode: 'relative', x: 0.5, y: 0.5 };
  }
  // Legacy projects stored normalized x/y without an explicit mode.
  const mode = pivot.mode === 'absolute' ? 'absolute' : 'relative';
  return { mode, x: pivot.x, y: pivot.y };
}

export function normalizedSpritePivot(image: ImageItem): { x: number; y: number } {
  const pivot = spritePivot(image);
  if (pivot.mode === 'relative') return { x: pivot.x, y: pivot.y };
  return {
    x: image.width > 0 ? pivot.x / image.width : 0.5,
    y: image.height > 0 ? pivot.y / image.height : 0.5,
  };
}

export function nextAnimationFrame(
  current: number,
  frameCount: number,
  loop: boolean,
): { index: number; ended: boolean } {
  if (frameCount <= 0) return { index: 0, ended: true };
  if (current + 1 < frameCount) return { index: current + 1, ended: false };
  return loop ? { index: 0, ended: false } : { index: frameCount - 1, ended: true };
}
