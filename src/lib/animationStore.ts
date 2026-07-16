'use client';

import { create } from 'zustand';
import type { AnimationGroup } from './animation';
import { clampFps } from './animation';

interface AnimationState {
  groups: AnimationGroup[];
  activeGroupId: string | null;
  setGroups: (groups: AnimationGroup[]) => void;
  upsertGroup: (group: AnimationGroup) => void;
  updateGroup: (id: string, patch: Partial<Pick<AnimationGroup, 'name' | 'frameIds' | 'fps' | 'loop'>>) => void;
  removeGroup: (id: string) => void;
  setActiveGroup: (id: string | null) => void;
  reset: () => void;
}

export const useAnimationStore = create<AnimationState>((set) => ({
  groups: [],
  activeGroupId: null,
  setGroups: (groups) => set((state) => ({
    groups,
    activeGroupId: groups.some((group) => group.id === state.activeGroupId)
      ? state.activeGroupId
      : (groups[0]?.id ?? null),
  })),
  upsertGroup: (group) => set((state) => {
    const exists = state.groups.some((item) => item.id === group.id);
    return {
      groups: exists
        ? state.groups.map((item) => (item.id === group.id ? group : item))
        : [...state.groups, group],
      activeGroupId: group.id,
    };
  }),
  updateGroup: (id, patch) => set((state) => ({
    groups: state.groups.map((group) => group.id === id
      ? { ...group, ...patch, ...(patch.fps === undefined ? {} : { fps: clampFps(patch.fps) }) }
      : group),
  })),
  removeGroup: (id) => set((state) => {
    const groups = state.groups.filter((group) => group.id !== id);
    return {
      groups,
      activeGroupId: state.activeGroupId === id ? (groups[0]?.id ?? null) : state.activeGroupId,
    };
  }),
  setActiveGroup: (activeGroupId) => set({ activeGroupId }),
  reset: () => set({ groups: [], activeGroupId: null }),
}));
