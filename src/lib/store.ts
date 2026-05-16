'use client';

import { create } from 'zustand';
import {
  ExportFormat,
  ImageItem,
  PackedItem,
  PackerOptions,
  PackingAlgorithm,
  MaxRectsPacker,
  nextPowerOfTwo,
} from './packer';

export type ThemeMode = 'dark' | 'light';

export type BackgroundMode = 'checker' | 'solid' | 'transparent';

export interface PackResult {
  packed: PackedItem[];
  failed: PackedItem[];
  width: number;
  height: number;
}

export interface InspectorSectionState {
  output: boolean;
  data: boolean;
  layout: boolean;
  sprites: boolean;
}

export interface TexturePackerState {
  // sprites
  images: ImageItem[];
  selectedIds: string[];

  // packer settings
  settings: PackerOptions;

  // publish / export
  exportFormat: ExportFormat;
  fileName: string;
  selectedDirPath: string;
  dirHandle: FileSystemDirectoryHandle | null;

  // viewport
  zoom: number;
  pan: { x: number; y: number };
  showBorders: boolean;
  showSpriteNames: boolean;
  bgMode: BackgroundMode;
  bgColor: string;

  // ui
  inspectorSections: InspectorSectionState;
  leftPanelWidth: number;
  rightPanelWidth: number;
  notification: string | null;

  // derived (cached)
  packResult: PackResult | null;

  // actions — sprites
  addImages: (items: ImageItem[]) => void;
  removeImages: (ids: string[]) => void;
  clearImages: () => void;
  selectImages: (ids: string[]) => void;
  toggleSelectImage: (id: string, additive?: boolean) => void;
  reorderImages: (fromIds: string[], beforeId: string | null) => void;

  // actions — settings
  setSettings: (patch: Partial<PackerOptions>) => void;

  // actions — export
  setExportFormat: (fmt: ExportFormat) => void;
  setFileName: (name: string) => void;
  setSelectedDirPath: (p: string) => void;
  setDirHandle: (h: FileSystemDirectoryHandle | null) => void;

  // actions — viewport
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  setPan: (p: { x: number; y: number }) => void;
  toggleBorders: () => void;
  toggleSpriteNames: () => void;
  setBgMode: (m: BackgroundMode) => void;
  setBgColor: (c: string) => void;

  // actions — ui
  toggleInspectorSection: (k: keyof InspectorSectionState) => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setNotification: (n: string | null) => void;
  showNotification: (n: string, ms?: number) => void;

  // packing
  repack: () => void;
}

const initialSettings: PackerOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  padding: 2,
  allowRotation: false,
  powerOfTwo: true,
  algorithm: 'maxrects-bssf',
  trimAlpha: false,
  extrude: 0,
};

function runPack(images: ImageItem[], settings: PackerOptions): PackResult | null {
  if (images.length === 0) return null;
  const packer = new MaxRectsPacker(settings);
  const packed = packer.pack(images);
  const bounds = packer.getUsedBounds();
  let w = bounds.width;
  let h = bounds.height;
  if (settings.powerOfTwo) {
    w = nextPowerOfTwo(w);
    h = nextPowerOfTwo(h);
  }
  w = Math.max(w, 1);
  h = Math.max(h, 1);
  return {
    packed: packed.filter((p) => p.placed),
    failed: packed.filter((p) => !p.placed),
    width: w,
    height: h,
  };
}

export const useTpStore = create<TexturePackerState>((set, get) => ({
  images: [],
  selectedIds: [],

  settings: initialSettings,

  exportFormat: 'json',
  fileName: 'spritesheet',
  selectedDirPath: '',
  dirHandle: null,

  zoom: 1,
  pan: { x: 0, y: 0 },
  showBorders: true,
  showSpriteNames: false,
  bgMode: 'checker',
  bgColor: '#1e293b',

  inspectorSections: {
    output: true,
    data: true,
    layout: true,
    sprites: false,
  },
  leftPanelWidth: 280,
  rightPanelWidth: 320,
  notification: null,

  packResult: null,

  addImages: (items) =>
    set((s) => {
      const images = [...s.images, ...items];
      return { images, packResult: runPack(images, s.settings) };
    }),

  removeImages: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const images = s.images.filter((i) => !idSet.has(i.id));
      const selectedIds = s.selectedIds.filter((id) => !idSet.has(id));
      return { images, selectedIds, packResult: runPack(images, s.settings) };
    }),

  clearImages: () => set({ images: [], selectedIds: [], packResult: null }),

  selectImages: (ids) => set({ selectedIds: ids }),

  toggleSelectImage: (id, additive = false) =>
    set((s) => {
      if (!additive) {
        return { selectedIds: s.selectedIds.includes(id) && s.selectedIds.length === 1 ? [] : [id] };
      }
      const has = s.selectedIds.includes(id);
      return {
        selectedIds: has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
      };
    }),

  reorderImages: (fromIds, beforeId) =>
    set((s) => {
      const moving = s.images.filter((i) => fromIds.includes(i.id));
      const rest = s.images.filter((i) => !fromIds.includes(i.id));
      let insertAt = rest.length;
      if (beforeId) {
        const idx = rest.findIndex((i) => i.id === beforeId);
        if (idx >= 0) insertAt = idx;
      }
      const images = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
      return { images, packResult: runPack(images, s.settings) };
    }),

  setSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      return { settings, packResult: runPack(s.images, settings) };
    }),

  setExportFormat: (fmt) => set({ exportFormat: fmt }),
  setFileName: (name) => set({ fileName: name }),
  setSelectedDirPath: (p) => set({ selectedDirPath: p }),
  setDirHandle: (h) => set({ dirHandle: h }),

  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(8, z)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(8, +(s.zoom * 1.2).toFixed(3)) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.1, +(s.zoom / 1.2).toFixed(3)) })),
  resetView: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),
  setPan: (p) => set({ pan: p }),
  toggleBorders: () => set((s) => ({ showBorders: !s.showBorders })),
  toggleSpriteNames: () => set((s) => ({ showSpriteNames: !s.showSpriteNames })),
  setBgMode: (m) => set({ bgMode: m }),
  setBgColor: (c) => set({ bgColor: c }),

  toggleInspectorSection: (k) =>
    set((s) => ({
      inspectorSections: { ...s.inspectorSections, [k]: !s.inspectorSections[k] },
    })),

  setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(200, Math.min(560, w)) }),
  setRightPanelWidth: (w) => set({ rightPanelWidth: Math.max(240, Math.min(640, w)) }),

  setNotification: (n) => set({ notification: n }),
  showNotification: (n, ms = 2500) => {
    set({ notification: n });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (get().notification === n) set({ notification: null });
      }, ms);
    }
  },

  repack: () => set((s) => ({ packResult: runPack(s.images, s.settings) })),
}));

export function selectEfficiency(s: TexturePackerState): number {
  const r = s.packResult;
  if (!r || r.packed.length === 0) return 0;
  const used = r.packed.reduce((sum, it) => sum + it.width * it.height, 0);
  return +((used / (r.width * r.height)) * 100).toFixed(1);
}

export function selectExceedsMax(s: TexturePackerState): boolean {
  const r = s.packResult;
  if (!r) return false;
  return r.width > s.settings.maxWidth || r.height > s.settings.maxHeight;
}

export function loadImageFromFile(file: File): Promise<ImageItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const fullName = path ? path.replace(/\.[^/.]+$/, '') : baseName;
        resolve({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: fullName,
          width: img.width,
          height: img.height,
          image: img,
          url: e.target?.result as string,
        });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to load image'));
    reader.readAsDataURL(file);
  });
}

export type { ExportFormat, ImageItem, PackedItem, PackerOptions, PackingAlgorithm };
