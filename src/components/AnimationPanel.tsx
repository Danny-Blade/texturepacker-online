'use client';

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTpStore } from '@/lib/store';
import { useAnimationStore } from '@/lib/animationStore';
import {
  clampFps,
  detectAnimationGroups,
  mergeDetectedAnimationGroups,
  nextAnimationFrame,
  normalizedSpritePivot,
  type AnimationGroup,
} from '@/lib/animation';
import type { Locale } from '@/lib/i18n';

interface AnimationPanelProps { locale: Locale }

const copy = {
  en: {
    title: 'Animation Preview', collapse: 'Collapse', expand: 'Expand', empty: 'Add numbered frames such as run_01, run_02.',
    group: 'Animation', create: 'Group selection', delete: 'Delete group', name: 'Name', fps: 'FPS', loop: 'Loop',
    play: 'Play', pause: 'Pause', previous: 'Previous frame', next: 'Next frame', frame: 'Frame', auto: 'Auto', manual: 'Manual',
    selectHint: 'Select at least two sprites to create a manual animation.', pivot: 'Pivot',
  },
  zh: {
    title: '动画预览', collapse: '收起', expand: '展开', empty: '添加 run_01、run_02 等带数字后缀的帧。',
    group: '动画', create: '将选中项分组', delete: '删除分组', name: '名称', fps: '帧率', loop: '循环',
    play: '播放', pause: '暂停', previous: '上一帧', next: '下一帧', frame: '帧', auto: '自动', manual: '手动',
    selectHint: '至少选择两个精灵以创建手动动画。', pivot: 'Pivot',
  },
} as const;

function manualGroup(images: { id: string; name: string }[]): AnimationGroup {
  const first = images[0]?.name.split('/').pop() ?? 'animation';
  const base = first.replace(/(?:[_ .-]?\d+)?$/, '') || 'animation';
  return {
    id: `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: base,
    frameIds: images.map((image) => image.id),
    fps: 12,
    loop: true,
    source: 'manual',
  };
}

export default function AnimationPanel({ locale }: AnimationPanelProps) {
  const t = copy[locale];
  const { images, selectedIds } = useTpStore(useShallow((state) => ({
    images: state.images,
    selectedIds: state.selectedIds,
  })));
  const updateSpriteMetadata = useTpStore((state) => state.updateSpriteMetadata);
  const { groups, activeGroupId, setGroups, upsertGroup, updateGroup, removeGroup, setActiveGroup } =
    useAnimationStore(useShallow((state) => state));
  const [collapsed, setCollapsed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  const detected = useMemo(() => detectAnimationGroups(images), [images]);
  useEffect(() => {
    const validIds = new Set(images.map((image) => image.id));
    const next = mergeDetectedAnimationGroups(useAnimationStore.getState().groups, detected, validIds);
    const current = useAnimationStore.getState().groups;
    if (JSON.stringify(next) !== JSON.stringify(current)) setGroups(next);
  }, [detected, images, setGroups]);

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0] ?? null;
  const imageMap = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const frames = useMemo(
    () => activeGroup?.frameIds.map((id) => imageMap.get(id)).filter((image) => image !== undefined) ?? [],
    [activeGroup, imageMap],
  );
  const safeFrameIndex = Math.min(frameIndex, Math.max(0, frames.length - 1));
  const currentFrame = frames[safeFrameIndex] ?? null;
  const pivot = currentFrame ? normalizedSpritePivot(currentFrame) : { x: 0.5, y: 0.5 };

  useEffect(() => {
    if (!playing || !activeGroup || frames.length < 2) return;
    const interval = window.setInterval(() => {
      setFrameIndex((index) => {
        const next = nextAnimationFrame(index, frames.length, activeGroup.loop);
        if (next.ended) setPlaying(false);
        return next.index;
      });
    }, 1000 / clampFps(activeGroup.fps));
    return () => window.clearInterval(interval);
  }, [playing, activeGroup, frames.length]);

  const selectedImages = images.filter((image) => selectedIds.includes(image.id));
  const createManual = () => {
    if (selectedImages.length < 2) return;
    upsertGroup(manualGroup(selectedImages));
    setFrameIndex(0);
    setPlaying(false);
  };
  const step = (delta: number) => {
    if (frames.length === 0) return;
    setFrameIndex((index) => (index + delta + frames.length) % frames.length);
  };
  const updateCurrentPivot = (axis: 'x' | 'y', value: number) => {
    if (!currentFrame || !Number.isFinite(value)) return;
    updateSpriteMetadata([currentFrame.id], {
      pivot: { mode: 'relative', x: axis === 'x' ? value : pivot.x, y: axis === 'y' ? value : pivot.y },
    });
  };

  return (
    <section className="flex-shrink-0 border-t border-[var(--tp-border)] bg-[var(--tp-panel)]" aria-label={t.title}>
      <div className="h-8 px-3 flex items-center gap-2 border-b border-[var(--tp-border)]">
        <button className="text-xs font-semibold" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
          {collapsed ? '▸' : '▾'} {t.title}
        </button>
        {!collapsed && <span className="text-[10px] text-[var(--tp-text-muted)]">{groups.length}</span>}
        <button className="ml-auto text-[10px] text-[var(--tp-text-muted)] hover:text-[var(--tp-text)]" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? t.expand : t.collapse}
        </button>
      </div>
      {!collapsed && (
        <div className="h-[184px] p-2 flex gap-2 min-w-0">
          <div className="w-[180px] flex-shrink-0 flex flex-col gap-1">
            <select className="h-7 text-xs rounded border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] px-2" value={activeGroup?.id ?? ''} onChange={(event) => { setActiveGroup(event.target.value || null); setFrameIndex(0); setPlaying(false); }} aria-label={t.group}>
              {groups.length === 0 && <option value="">{t.empty}</option>}
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.source === 'auto' ? t.auto : t.manual}</option>)}
            </select>
            <button disabled={selectedImages.length < 2} title={selectedImages.length < 2 ? t.selectHint : undefined} className="h-7 text-xs rounded border border-[var(--tp-border)] disabled:opacity-40 hover:bg-[var(--tp-panel-2)]" onClick={createManual}>+ {t.create}</button>
            {activeGroup && (
              <>
                <label className="text-[10px] text-[var(--tp-text-muted)]">{t.name}
                  <input className="mt-0.5 w-full h-6 px-1 rounded border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] text-xs text-[var(--tp-text)]" value={activeGroup.name} onChange={(event) => updateGroup(activeGroup.id, { name: event.target.value })} />
                </label>
                <div className="flex gap-2 items-end">
                  <label className="text-[10px] text-[var(--tp-text-muted)] flex-1">{t.fps}
                    <input type="number" min={1} max={60} className="mt-0.5 w-full h-6 px-1 rounded border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] text-xs text-[var(--tp-text)]" value={activeGroup.fps} onChange={(event) => updateGroup(activeGroup.id, { fps: Number(event.target.value) })} />
                  </label>
                  <label className="h-6 flex items-center gap-1 text-xs"><input type="checkbox" checked={activeGroup.loop} onChange={(event) => updateGroup(activeGroup.id, { loop: event.target.checked })} /> {t.loop}</label>
                </div>
                <button className="h-6 text-[10px] text-[var(--tp-danger)] hover:bg-[var(--tp-panel-2)] rounded" onClick={() => { removeGroup(activeGroup.id); setFrameIndex(0); setPlaying(false); }}>{t.delete}</button>
              </>
            )}
          </div>

          <div className="flex-1 min-w-[180px] relative overflow-hidden rounded border border-[var(--tp-border)] tp-checker" data-testid="animation-preview">
            {currentFrame ? (
              <>
                {/* Project sprites are already local object/data URLs; optimization would break them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentFrame.url} alt={currentFrame.name} draggable={false} className="absolute max-w-none [image-rendering:pixelated]" style={{ width: currentFrame.width, height: currentFrame.height, left: `calc(50% - ${pivot.x * currentFrame.width}px)`, top: `calc(50% - ${pivot.y * currentFrame.height}px)` }} />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-rose-400/75 pointer-events-none" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-rose-400/75 pointer-events-none" />
                <div className="absolute top-1 left-2 text-[10px] px-1 rounded bg-black/60 text-white">{currentFrame.name} · {t.pivot} {pivot.x.toFixed(2)}, {pivot.y.toFixed(2)}</div>
              </>
            ) : <div className="absolute inset-0 grid place-items-center text-xs text-[var(--tp-text-muted)] px-4 text-center">{t.empty}</div>}
          </div>

          <div className="w-32 flex-shrink-0 flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-1">
              <button className="h-7 w-7 rounded border border-[var(--tp-border)]" onClick={() => step(-1)} aria-label={t.previous}>◀</button>
              <button className="h-8 w-9 rounded border border-[var(--tp-accent)] text-[var(--tp-accent)]" onClick={() => setPlaying((value) => !value)} aria-label={playing ? t.pause : t.play}>{playing ? 'Ⅱ' : '▶'}</button>
              <button className="h-7 w-7 rounded border border-[var(--tp-border)]" onClick={() => step(1)} aria-label={t.next}>▶</button>
            </div>
            <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={safeFrameIndex} onChange={(event) => { setFrameIndex(Number(event.target.value)); setPlaying(false); }} className="w-full" aria-label={t.frame} />
            <span className="text-[10px] tabular-nums text-[var(--tp-text-muted)]">{frames.length ? safeFrameIndex + 1 : 0} / {frames.length}</span>
            {currentFrame && (
              <div className="w-full grid grid-cols-2 gap-1" aria-label={t.pivot}>
                <label className="text-[9px] text-[var(--tp-text-muted)]">Pivot X
                  <input type="number" step="0.01" className="mt-0.5 h-6 w-full rounded border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] px-1 text-[10px] text-[var(--tp-text)]" value={Number(pivot.x.toFixed(3))} onChange={(event) => updateCurrentPivot('x', Number(event.target.value))} />
                </label>
                <label className="text-[9px] text-[var(--tp-text-muted)]">Pivot Y
                  <input type="number" step="0.01" className="mt-0.5 h-6 w-full rounded border border-[var(--tp-border)] bg-[var(--tp-bg-elev)] px-1 text-[10px] text-[var(--tp-text)]" value={Number(pivot.y.toFixed(3))} onChange={(event) => updateCurrentPivot('y', Number(event.target.value))} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
