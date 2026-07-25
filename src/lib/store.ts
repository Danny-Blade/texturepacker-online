'use client';

import { create } from 'zustand';
import {
  ExportFormat,
  ImageItem,
  PackedItem,
  PackerOptions,
  PackingAlgorithm,
  PackResult,
  PackSheet,
  packIntoSheets,
} from './packer';
import { prepareSpriteForAtlas } from './imageProcessing';
import { packAsync, type PackJob } from './packerClient';
import {
  clampPivot,
  normalizeNineSlice,
  type SpriteMetadata,
} from './spriteMetadata';

export type ThemeMode = 'dark' | 'light';

export type BackgroundMode = 'checker' | 'solid' | 'transparent';

export type SortMode = 'manual' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';

export type ImageFileFormat = 'png' | 'png-8' | 'jpg' | 'webp';

export type Png8DitherMode = 'none' | 'floyd-steinberg' | 'atkinson';

export interface ScalingVariant {
  id: string;
  name: string;
  scale: number;
  suffix: string;
  /** Optional case-insensitive substring matched against sprite names. */
  filter?: string;
  sort?: 'layout' | 'name' | 'area';
  algorithm?: 'nearest' | 'bilinear' | 'bicubic';
  maxWidth?: number;
  maxHeight?: number;
  sameLayout?: boolean;
}

export interface SmartFolder {
  id: string;
  /** Display label (folder name). */
  name: string;
  /** Last known sprite id list (so we can diff against the live directory). */
  trackedIds: string[];
  /** Last poll timestamp. */
  lastSync: number;
  /** Restored descriptors have no persisted directory handle and must be re-authorized. */
  requiresAuthorization?: boolean;
  /** Names are retained while authorization is pending so a resave is lossless. */
  trackedSpriteNames?: string[];
}

export interface PublishOptions {
  imageFormat: ImageFileFormat;
  imageQuality: number; // 0..1, used for jpg/webp
  scales: number[]; // e.g. [1] or [1, 2, 0.5]
  variants?: ScalingVariant[];
  imageFileTemplate: string; // supports {n}
  dataFileTemplate: string;
  bundleZip: boolean;
  /** PNG-8 palette size, clamped to [16, 256]. Optional so older tests and project files stay compatible. */
  png8Colors?: number;
  /** PNG-8 error-diffusion dither. Alpha is preserved verbatim. */
  png8Dither?: Png8DitherMode;
  /** Multiplier applied to the diffused error for PNG-8 dithering (0..1). */
  png8DitherStrength?: number;
}

export interface InspectorSectionState {
  output: boolean;
  data: boolean;
  layout: boolean;
  effects: boolean;
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
  publishOptions: PublishOptions;
  activeSheet: number;

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

  // sprite browser
  sortMode: SortMode;
  collapsedFolders: string[]; // serialisable; convert to Set in selectors when needed
  renamingId: string | null;

  // async packing
  isPacking: boolean;
  packProgress: number; // 0..1
  packError: string | null;

  // smart folders (watched directories)
  smartFolders: SmartFolder[];

  // derived (cached)
  packResult: PackResult | null;

  // actions — sprites
  addImages: (items: ImageItem[]) => void;
  removeImages: (ids: string[]) => void;
  clearImages: () => void;
  selectImages: (ids: string[]) => void;
  toggleSelectImage: (id: string, additive?: boolean) => void;
  reorderImages: (fromIds: string[], beforeId: string | null) => void;
  reorderImagesInto: (fromIds: string[], folderPath: string, beforeId: string | null) => void;
  renameImage: (id: string, newName: string) => void;
  updateSpriteMetadata: (ids: string[], patch: Partial<SpriteMetadata>) => void;
  startRename: (id: string | null) => void;

  // actions — sprite browser
  setSortMode: (m: SortMode) => void;
  toggleFolder: (folderPath: string) => void;
  setFolderCollapsed: (folderPath: string, collapsed: boolean) => void;
  expandAllFolders: () => void;
  collapseAllFolders: (folders: string[]) => void;

  // actions — settings
  setSettings: (patch: Partial<PackerOptions>) => void;

  // actions — export
  setExportFormat: (fmt: ExportFormat) => void;
  setFileName: (name: string) => void;
  setSelectedDirPath: (p: string) => void;
  setDirHandle: (h: FileSystemDirectoryHandle | null) => void;
  setPublishOptions: (patch: Partial<PublishOptions>) => void;
  setActiveSheet: (idx: number) => void;

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
  /** Set isPacking/progress externally (the worker driver calls this). */
  setPackProgress: (progress: number, isPacking?: boolean) => void;
  setPackError: (e: string | null) => void;
  setPackResult: (r: PackResult | null) => void;

  // smart folders
  addSmartFolder: (folder: SmartFolder) => void;
  removeSmartFolder: (id: string) => void;
  updateSmartFolder: (id: string, patch: Partial<SmartFolder>) => void;
}

const initialSettings: PackerOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  borderPadding: 0,
  shapePadding: 2,
  innerPadding: 0,
  allowRotation: false,
  powerOfTwo: true,
  forceSquare: false,
  sizeMode: 'max',
  sizeConstraint: 'pot',
  packMode: 'good',
  commonDivisorX: 1,
  commonDivisorY: 1,
  algorithm: 'maxrects-bssf',
  trimAlpha: false,
  trimThreshold: 1,
  trimMode: 'trim',
  polygonTolerance: 2,
  trimMargin: 0,
  extrude: 0,
  multipack: false,
  multipackMode: 'auto',
  manualSheets: [{ id: 'sheet-main', name: 'Main' }],
  aliasDuplicates: false,
  polygonPacking: false,
  exportMesh: false,
  alphaHandling: 'keep',
  alphaBleedIterations: 4,
  normalMapPairing: false,
  normalMapSuffixes: ['_n', '_nrm', '_normal'],
};

const initialPublishOptions: PublishOptions = {
  imageFormat: 'png',
  imageQuality: 0.92,
  scales: [1],
  imageFileTemplate: '{name}{suffix}{n}.{ext}',
  dataFileTemplate: '{name}{suffix}{n}.{ext}',
  bundleZip: false,
  png8Colors: 256,
  png8Dither: 'none',
  png8DitherStrength: 1,
};

function runPackSync(images: ImageItem[], settings: PackerOptions): PackResult | null {
  if (images.length === 0) return null;
  return packIntoSheets(images, settings, prepareSpriteForAtlas);
}

let currentJob: PackJob | null = null;

function triggerPack(): void {
  const s = useTpStore.getState();
  if (s.images.length === 0) {
    if (currentJob) {
      currentJob.cancel();
      currentJob = null;
    }
    useTpStore.setState({
      packResult: null,
      isPacking: false,
      packProgress: 0,
      packError: null,
    });
    return;
  }

  if (typeof window === 'undefined') {
    const result = runPackSync(s.images, s.settings);
    useTpStore.setState({
      packResult: result,
      isPacking: false,
      packProgress: result ? 1 : 0,
      packError: null,
    });
    return;
  }

  if (currentJob) {
    currentJob.cancel();
    currentJob = null;
  }
  useTpStore.setState({ isPacking: true, packProgress: 0, packError: null });
  const job = packAsync(s.images, s.settings, (p) => {
    if (currentJob === job) {
      useTpStore.getState().setPackProgress(p);
    }
  });
  currentJob = job;
  job.promise
    .then((r) => {
      if (currentJob === job) {
        useTpStore.getState().setPackResult(r);
        currentJob = null;
      }
    })
    .catch((err: unknown) => {
      if (currentJob !== job) return;
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'cancelled') {
        return;
      }
      useTpStore.getState().setPackError(message);
      useTpStore.setState({ isPacking: false, packProgress: 0 });
      currentJob = null;
    });
}

function schedulePack(): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(triggerPack);
  } else if (typeof window !== 'undefined') {
    window.setTimeout(triggerPack, 0);
  } else {
    triggerPack();
  }
}

export const useTpStore = create<TexturePackerState>((set, get) => ({
  images: [],
  selectedIds: [],

  settings: initialSettings,

  exportFormat: 'json',
  fileName: 'spritesheet',
  selectedDirPath: '',
  dirHandle: null,
  publishOptions: initialPublishOptions,
  activeSheet: 0,

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
    effects: false,
    sprites: true,
  },
  leftPanelWidth: 280,
  rightPanelWidth: 320,
  notification: null,

  sortMode: 'manual',
  collapsedFolders: [],
  renamingId: null,

  isPacking: false,
  packProgress: 0,
  packError: null,

  smartFolders: [],

  packResult: null,

  addImages: (items) => {
    set((s) => ({ images: [...s.images, ...items] }));
    schedulePack();
  },

  removeImages: (ids) => {
    set((s) => {
      const idSet = new Set(ids);
      const images = s.images.filter((i) => !idSet.has(i.id));
      const selectedIds = s.selectedIds.filter((id) => !idSet.has(id));
      return { images, selectedIds };
    });
    schedulePack();
  },

  clearImages: () => {
    if (currentJob) {
      currentJob.cancel();
      currentJob = null;
    }
    set({
      images: [],
      selectedIds: [],
      packResult: null,
      isPacking: false,
      packProgress: 0,
      packError: null,
    });
  },

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

  reorderImages: (fromIds, beforeId) => {
    set((s) => {
      const moving = s.images.filter((i) => fromIds.includes(i.id));
      const rest = s.images.filter((i) => !fromIds.includes(i.id));
      let insertAt = rest.length;
      if (beforeId) {
        const idx = rest.findIndex((i) => i.id === beforeId);
        if (idx >= 0) insertAt = idx;
      }
      const images = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
      return { images };
    });
    schedulePack();
  },

  reorderImagesInto: (fromIds, folderPath, beforeId) => {
    let changed = false;
    set((s) => {
      const moving = s.images.filter((i) => fromIds.includes(i.id));
      if (moving.length === 0) return {};
      const rest = s.images.filter((i) => !fromIds.includes(i.id));
      const reparented = moving.map((img) => {
        const base = img.name.split('/').pop() || img.name;
        const newName = folderPath ? `${folderPath}/${base}` : base;
        return { ...img, name: newName };
      });
      let insertAt = rest.length;
      if (beforeId) {
        const idx = rest.findIndex((i) => i.id === beforeId);
        if (idx >= 0) insertAt = idx;
      } else if (folderPath) {
        const lastIdx = rest.reduce((acc, img, idx) => {
          const dir = img.name.includes('/') ? img.name.slice(0, img.name.lastIndexOf('/')) : '';
          return dir === folderPath || dir.startsWith(`${folderPath}/`) ? idx : acc;
        }, -1);
        if (lastIdx >= 0) insertAt = lastIdx + 1;
      }
      const images = [...rest.slice(0, insertAt), ...reparented, ...rest.slice(insertAt)];
      changed = true;
      return { images };
    });
    if (changed) schedulePack();
  },

  renameImage: (id, newName) =>
    set((s) => {
      const trimmed = newName.trim();
      if (!trimmed) return {};
      const images = s.images.map((img) => (img.id === id ? { ...img, name: trimmed } : img));
      return { images, renamingId: null };
    }),

  updateSpriteMetadata: (ids, patch) => {
    const idSet = new Set(ids);
    set((s) => ({
      images: s.images.map((image) => {
        if (!idSet.has(image.id)) return image;
        const metadata: SpriteMetadata = { ...(image.metadata ?? {}) };
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete metadata[key];
          else if (key === 'pivot') metadata.pivot = clampPivot(value as NonNullable<SpriteMetadata['pivot']>, image.width, image.height);
          else if (key === 'nineSlice') metadata.nineSlice = normalizeNineSlice(value as NonNullable<SpriteMetadata['nineSlice']>, image.width, image.height);
          else metadata[key] = value;
        }
        return { ...image, metadata };
      }),
    }));
    schedulePack();
  },

  startRename: (id) => set({ renamingId: id }),

  setSettings: (patch) => {
    set((s) => {
      // `padding` was the only UI setting in older .tps JSON projects. Treat
      // it as a legacy alias for shapePadding, then discard it so there is one
      // authoritative value in current state and newly saved projects.
      const currentSettings = { ...s.settings };
      delete currentSettings.padding;
      const { padding: patchPadding, ...currentPatch } = patch;
      // If both exist, `padding` wins: old saved projects kept a stale
      // shapePadding default while the Inspector only changed `padding`.
      const shapePadding = patchPadding ?? currentPatch.shapePadding ?? currentSettings.shapePadding;
      const requestedTrimMode = currentPatch.trimMode as string | undefined;
      const trimMode =
        requestedTrimMode === 'polygon'
          ? 'polygon-outline'
          : requestedTrimMode === 'rect'
            ? 'trim'
          : currentPatch.trimMode ?? currentSettings.trimMode;
      const sizeConstraint =
        currentPatch.sizeConstraint ??
        (currentPatch.powerOfTwo === undefined
          ? currentSettings.sizeConstraint
          : currentPatch.powerOfTwo
            ? 'pot'
            : 'any');
      const powerOfTwo = sizeConstraint === 'pot';
      return {
        settings: {
          ...currentSettings,
          ...currentPatch,
          shapePadding,
          trimMode,
          sizeConstraint,
          powerOfTwo,
        },
      };
    });
    schedulePack();
  },

  setExportFormat: (fmt) => set({ exportFormat: fmt }),
  setFileName: (name) => set({ fileName: name }),
  setSelectedDirPath: (p) => set({ selectedDirPath: p }),
  setDirHandle: (h) => set({ dirHandle: h }),
  setPublishOptions: (patch) =>
    set((s) => ({ publishOptions: { ...s.publishOptions, ...patch } })),
  setActiveSheet: (idx) =>
    set((s) => {
      const total = s.packResult?.sheets.length ?? 0;
      if (total === 0) return { activeSheet: 0 };
      return { activeSheet: Math.max(0, Math.min(idx, total - 1)) };
    }),

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

  setSortMode: (m) => set({ sortMode: m }),

  toggleFolder: (folderPath) =>
    set((s) => {
      const has = s.collapsedFolders.includes(folderPath);
      return {
        collapsedFolders: has
          ? s.collapsedFolders.filter((p) => p !== folderPath)
          : [...s.collapsedFolders, folderPath],
      };
    }),

  setFolderCollapsed: (folderPath, collapsed) =>
    set((s) => {
      const has = s.collapsedFolders.includes(folderPath);
      if (collapsed && !has) return { collapsedFolders: [...s.collapsedFolders, folderPath] };
      if (!collapsed && has) return { collapsedFolders: s.collapsedFolders.filter((p) => p !== folderPath) };
      return {};
    }),

  expandAllFolders: () => set({ collapsedFolders: [] }),
  collapseAllFolders: (folders) => set({ collapsedFolders: folders }),

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

  repack: () => {
    schedulePack();
  },

  setPackProgress: (progress, isPacking) =>
    set((s) => ({
      packProgress: Math.max(0, Math.min(1, progress)),
      isPacking: typeof isPacking === 'boolean' ? isPacking : s.isPacking,
    })),
  setPackError: (e) => set({ packError: e }),
  setPackResult: (r) => set({ packResult: r, isPacking: false, packProgress: 1 }),

  addSmartFolder: (folder) =>
    set((s) => ({ smartFolders: [...s.smartFolders.filter((f) => f.id !== folder.id), folder] })),
  removeSmartFolder: (id) =>
    set((s) => ({ smartFolders: s.smartFolders.filter((f) => f.id !== id) })),
  updateSmartFolder: (id, patch) =>
    set((s) => ({
      smartFolders: s.smartFolders.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
}));

export function selectEfficiency(s: TexturePackerState): number {
  const r = s.packResult;
  if (!r || r.sheets.length === 0) return 0;
  let used = 0;
  let total = 0;
  for (const sh of r.sheets) {
    for (const it of sh.packed) used += it.width * it.height;
    total += sh.width * sh.height;
  }
  if (total === 0) return 0;
  return +((used / total) * 100).toFixed(1);
}

export function selectExceedsMax(s: TexturePackerState): boolean {
  const r = s.packResult;
  if (!r) return false;
  return r.sheets.some(
    (sh) => sh.width > s.settings.maxWidth || sh.height > s.settings.maxHeight,
  );
}

export function selectActiveSheet(s: TexturePackerState): PackSheet | null {
  const r = s.packResult;
  if (!r || r.sheets.length === 0) return null;
  return r.sheets[Math.max(0, Math.min(s.activeSheet, r.sheets.length - 1))] ?? null;
}

function hashDecodedPixels(image: HTMLImageElement): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let hash = 0x811c9dc5;
    for (let index = 0; index < pixels.length; index++) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 0x01000193);
    }
    return `${image.width}x${image.height}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  } catch {
    return undefined;
  }
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
          contentHash: hashDecodedPixels(img),
        });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to load image'));
    reader.readAsDataURL(file);
  });
}

export type {
  ExportFormat,
  ImageItem,
  PackedItem,
  PackerOptions,
  PackingAlgorithm,
  PackResult,
  PackSheet,
};
