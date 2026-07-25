import type {
  BackgroundMode,
  InspectorSectionState,
  PublishOptions,
  SmartFolder,
  SortMode,
  TexturePackerState,
} from './store';
import type {
  ExportFormat,
  ImageItem,
  PackerOptions,
  PackingAlgorithm,
  SpriteEffects,
  TrimMode,
} from './packer';
import { sanitizeAnimationGroup, type AnimationGroup } from './animation';
import { isValidSpriteMetadata, readSpriteMetadata, type SpriteMetadata } from './spriteMetadata';

export const PROJECT_FILE_FORMAT = 'web-texturepacker-project';
export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_FILE_EXTENSION = '.wtp.json';

export interface ProjectSprite {
  id: string;
  name: string;
  width: number;
  height: number;
  imageData: string;
  contentHash?: string;
  metadata: SpriteMetadata;
}

export interface ProjectSmartFolder {
  id: string;
  name: string;
  trackedSpriteNames: string[];
  lastSync: number;
  requiresAuthorization: true;
}

export interface ProjectViewState {
  zoom: number;
  pan: { x: number; y: number };
  showBorders: boolean;
  showSpriteNames: boolean;
  bgMode: BackgroundMode;
  bgColor: string;
  inspectorSections: InspectorSectionState;
  leftPanelWidth: number;
  rightPanelWidth: number;
  sortMode: SortMode;
  collapsedFolders: string[];
  activeSheet: number;
}

export interface WebTexturePackerProject {
  format: typeof PROJECT_FILE_FORMAT;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  savedAt: string;
  settings: PackerOptions;
  exportFormat: ExportFormat;
  fileName: string;
  selectedDirPath: string;
  publishOptions: PublishOptions;
  view: ProjectViewState;
  sprites: ProjectSprite[];
  smartFolders: ProjectSmartFolder[];
  animations: AnimationGroup[];
}

export interface ProjectParseResult {
  project: WebTexturePackerProject;
  warnings: string[];
}

type ProjectState = Pick<
  TexturePackerState,
  | 'images'
  | 'settings'
  | 'exportFormat'
  | 'fileName'
  | 'selectedDirPath'
  | 'publishOptions'
  | 'zoom'
  | 'pan'
  | 'showBorders'
  | 'showSpriteNames'
  | 'bgMode'
  | 'bgColor'
  | 'inspectorSections'
  | 'leftPanelWidth'
  | 'rightPanelWidth'
  | 'sortMode'
  | 'collapsedFolders'
  | 'activeSheet'
  | 'smartFolders'
>;

const DEFAULT_PUBLISH_OPTIONS: PublishOptions = {
  imageFormat: 'png',
  imageQuality: 0.92,
  scales: [1],
  imageFileTemplate: '{name}{suffix}{n}.{ext}',
  dataFileTemplate: '{name}{suffix}{n}.{ext}',
  bundleZip: false,
};

const DEFAULT_SETTINGS: PackerOptions = {
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
  trimMargin: 0,
  polygonTolerance: 2,
  extrude: 0,
  multipack: false,
  multipackMode: 'auto',
  manualSheets: [{ id: 'sheet-main', name: 'Main' }],
  aliasDuplicates: false,
};

const DEFAULT_VIEW: ProjectViewState = {
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
  sortMode: 'manual',
  collapsedFolders: [],
  activeSheet: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

const ALGORITHMS: readonly PackingAlgorithm[] = [
  'maxrects-bssf',
  'maxrects-blsf',
  'maxrects-baf',
  'maxrects-bl',
  'maxrects-cp',
  'maxrects-best',
  'shelf',
];
const TRIM_MODES: readonly TrimMode[] = [
  'none',
  'trim',
  'crop-keep-position',
  'crop-flush',
  'polygon-outline',
];
const EXPORT_FORMATS: readonly ExportFormat[] = [
  'json', 'json-array', 'css', 'xml', 'cocos2d', 'phaser3', 'unity',
  'spine', 'godot', 'gamemaker', 'pixi', 'libgdx', 'cocos-creator',
  'defold', 'spritekit', 'paper2d', 'monogame', 'solar2d',
];
const IMAGE_FORMATS = ['png', 'png-8', 'jpg', 'webp'] as const;
const BACKGROUND_MODES: readonly BackgroundMode[] = ['checker', 'solid', 'transparent'];
const SORT_MODES: readonly SortMode[] = ['manual', 'name-asc', 'name-desc', 'size-desc', 'size-asc'];

function isSpriteEffects(value: unknown): value is SpriteEffects {
  if (!isRecord(value)) return false;
  if (value.outline !== undefined) {
    if (!isRecord(value.outline)
      || !isNonNegativeNumber(value.outline.width)
      || typeof value.outline.color !== 'string') return false;
  }
  if (value.dropShadow !== undefined) {
    if (!isRecord(value.dropShadow)
      || !isFiniteNumber(value.dropShadow.offsetX)
      || !isFiniteNumber(value.dropShadow.offsetY)
      || !isNonNegativeNumber(value.dropShadow.blur)
      || typeof value.dropShadow.color !== 'string'
      || !isFiniteNumber(value.dropShadow.opacity)
      || value.dropShadow.opacity < 0 || value.dropShadow.opacity > 100) return false;
  }
  if (value.tint !== undefined) {
    if (!isRecord(value.tint)
      || !isOneOf(value.tint.mode, ['multiply', 'overlay', 'screen'] as const)
      || typeof value.tint.color !== 'string'
      || !isFiniteNumber(value.tint.opacity)
      || value.tint.opacity < 0 || value.tint.opacity > 100) return false;
  }
  return true;
}

function isProjectSprite(value: unknown): value is ProjectSprite {
  if (!isRecord(value)) return false;
  const validHeader = (
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.name === 'string' && value.name.length > 0 &&
    Number.isInteger(value.width) && (value.width as number) > 0 &&
    Number.isInteger(value.height) && (value.height as number) > 0 &&
    typeof value.imageData === 'string' && value.imageData.startsWith('data:image/') &&
    (value.contentHash === undefined || typeof value.contentHash === 'string') &&
    (value.metadata === undefined || isValidSpriteMetadata(value.metadata))
  );
  if (!validHeader) return false;
  const width = value.width as number;
  const height = value.height as number;
  const metadata = readSpriteMetadata(value.metadata);
  if (metadata.pivot?.mode === 'absolute'
    && (metadata.pivot.x > width || metadata.pivot.y > height)) return false;
  if (metadata.nineSlice) {
    for (const insets of [metadata.nineSlice.border, metadata.nineSlice.content]) {
      if (insets.left + insets.right > width || insets.top + insets.bottom > height) return false;
    }
  }
  return true;
}

function isProjectSmartFolder(value: unknown): value is ProjectSmartFolder {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.length > 0
    && isStringArray(value.trackedSpriteNames)
    && isNonNegativeNumber(value.lastSync)
    && value.requiresAuthorization === true;
}

function isProjectAnimation(value: unknown): value is AnimationGroup {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.trim().length > 0
    && isStringArray(value.frameIds) && value.frameIds.length > 0
    && isFiniteNumber(value.fps) && value.fps >= 1 && value.fps <= 60
    && typeof value.loop === 'boolean'
    && isOneOf(value.source, ['auto', 'manual'] as const);
}

function parseSettings(value: unknown, legacy: boolean): PackerOptions {
  if (!isRecord(value)) throw new Error('Project packer settings are invalid');
  const required = [
    'maxWidth', 'maxHeight', 'borderPadding', 'shapePadding', 'allowRotation',
    'powerOfTwo', 'forceSquare', 'algorithm', 'trimAlpha', 'trimThreshold',
    'trimMode', 'polygonTolerance', 'extrude', 'multipack',
  ];
  if (!legacy && required.some((key) => !(key in value))) {
    throw new Error('Project packer settings are incomplete');
  }
  const legacyPadding = isNonNegativeNumber(value.padding) ? value.padding : undefined;
  const trimModeValue =
    value.trimMode === 'polygon'
      ? 'polygon-outline'
      : value.trimMode === 'rect'
        ? 'trim'
        : value.trimMode;
  const merged: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    ...value,
    shapePadding: legacyPadding ?? value.shapePadding ?? DEFAULT_SETTINGS.shapePadding,
    innerPadding: value.innerPadding ?? DEFAULT_SETTINGS.innerPadding,
    trimMode: trimModeValue ?? DEFAULT_SETTINGS.trimMode,
    trimMargin: value.trimMargin ?? DEFAULT_SETTINGS.trimMargin,
  };
  if (!Number.isInteger(merged.maxWidth) || (merged.maxWidth as number) < 1
    || !Number.isInteger(merged.maxHeight) || (merged.maxHeight as number) < 1
    || !Number.isInteger(merged.borderPadding) || (merged.borderPadding as number) < 0
    || !Number.isInteger(merged.shapePadding) || (merged.shapePadding as number) < 0
    || !Number.isInteger(merged.innerPadding) || (merged.innerPadding as number) < 0
    || typeof merged.allowRotation !== 'boolean'
    || typeof merged.powerOfTwo !== 'boolean'
    || typeof merged.forceSquare !== 'boolean'
    || !isOneOf(merged.sizeMode, ['max', 'fixed'] as const)
    || !isOneOf(merged.sizeConstraint, ['pot', 'any', 'multiple-of-4', 'word-aligned'] as const)
    || !isOneOf(merged.packMode, ['fast', 'good', 'best'] as const)
    || !Number.isInteger(merged.commonDivisorX) || (merged.commonDivisorX as number) < 1
    || !Number.isInteger(merged.commonDivisorY) || (merged.commonDivisorY as number) < 1
    || !isOneOf(merged.algorithm, ALGORITHMS)
    || typeof merged.trimAlpha !== 'boolean'
    || !Number.isInteger(merged.trimThreshold)
    || (merged.trimThreshold as number) < 0 || (merged.trimThreshold as number) > 255
    || !isOneOf(merged.trimMode, TRIM_MODES)
    || !Number.isInteger(merged.trimMargin) || (merged.trimMargin as number) < 0
    || !isNonNegativeNumber(merged.polygonTolerance)
    || !Number.isInteger(merged.extrude) || (merged.extrude as number) < 0
    || typeof merged.multipack !== 'boolean'
    || !isOneOf(merged.multipackMode, ['auto', 'manual'] as const)
    || !Array.isArray(merged.manualSheets)
    || merged.manualSheets.length === 0
    || !merged.manualSheets.every((sheet) =>
      isRecord(sheet) && typeof sheet.id === 'string' && sheet.id.length > 0
      && typeof sheet.name === 'string' && sheet.name.length > 0)
    || typeof merged.aliasDuplicates !== 'boolean'
    || (merged.effects !== undefined && !isSpriteEffects(merged.effects))) {
    throw new Error('Project packer settings contain invalid values');
  }
  const valid = merged as unknown as PackerOptions;
  return {
    maxWidth: valid.maxWidth,
    maxHeight: valid.maxHeight,
    borderPadding: valid.borderPadding,
    shapePadding: valid.shapePadding,
    innerPadding: valid.innerPadding,
    allowRotation: valid.allowRotation,
    powerOfTwo: valid.powerOfTwo,
    forceSquare: valid.forceSquare,
    sizeMode: valid.sizeMode,
    sizeConstraint: valid.sizeConstraint,
    packMode: valid.packMode,
    commonDivisorX: valid.commonDivisorX,
    commonDivisorY: valid.commonDivisorY,
    algorithm: valid.algorithm,
    trimAlpha: valid.trimAlpha,
    trimThreshold: valid.trimThreshold,
    trimMode: valid.trimMode,
    trimMargin: valid.trimMargin,
    polygonTolerance: valid.polygonTolerance,
    extrude: valid.extrude,
    multipack: valid.multipack,
    multipackMode: valid.multipackMode,
    manualSheets: valid.manualSheets?.map((sheet) => ({ ...sheet })),
    aliasDuplicates: valid.aliasDuplicates,
    ...(valid.effects === undefined ? {} : { effects: valid.effects }),
  };
}

function parsePublishOptions(value: unknown): PublishOptions {
  if (!isRecord(value)
    || !isOneOf(value.imageFormat, IMAGE_FORMATS)
    || !isFiniteNumber(value.imageQuality) || value.imageQuality < 0 || value.imageQuality > 1
    || !Array.isArray(value.scales) || value.scales.length === 0
    || !value.scales.every((scale) => isFiniteNumber(scale) && scale > 0)
    || typeof value.imageFileTemplate !== 'string'
    || typeof value.dataFileTemplate !== 'string'
    || typeof value.bundleZip !== 'boolean') {
    throw new Error('Project publish options are invalid');
  }
  const variants = value.variants;
  if (variants !== undefined && (!Array.isArray(variants) || !variants.every((variant) =>
    isRecord(variant)
    && typeof variant.id === 'string' && variant.id.length > 0
    && typeof variant.name === 'string' && variant.name.length > 0
    && isFiniteNumber(variant.scale) && variant.scale > 0
    && typeof variant.suffix === 'string'
    && (variant.filter === undefined || typeof variant.filter === 'string')
    && (variant.sort === undefined || isOneOf(variant.sort, ['layout', 'name', 'area'] as const))
    && (variant.algorithm === undefined || isOneOf(variant.algorithm, ['nearest', 'bilinear', 'bicubic'] as const))
    && (variant.maxWidth === undefined || (isFiniteNumber(variant.maxWidth) && Number.isInteger(variant.maxWidth) && variant.maxWidth > 0))
    && (variant.maxHeight === undefined || (isFiniteNumber(variant.maxHeight) && Number.isInteger(variant.maxHeight) && variant.maxHeight > 0))
    && (variant.sameLayout === undefined || typeof variant.sameLayout === 'boolean')))) {
    throw new Error('Project scaling variants are invalid');
  }
  // PNG-8 fields were added later; fill in defaults for older projects.
  const png8Colors = isFiniteNumber(value.png8Colors) && value.png8Colors >= 16 && value.png8Colors <= 256
    ? Math.round(value.png8Colors as number)
    : 256;
  const png8Dither = isOneOf(value.png8Dither, ['none', 'floyd-steinberg', 'atkinson'] as const)
    ? value.png8Dither
    : 'none';
  const png8DitherStrength = isFiniteNumber(value.png8DitherStrength)
      && (value.png8DitherStrength as number) >= 0
      && (value.png8DitherStrength as number) <= 1
    ? (value.png8DitherStrength as number)
    : 1;
  return {
    ...value,
    scales: [...value.scales],
    variants: variants?.map((variant) => ({ ...variant })),
    png8Colors,
    png8Dither,
    png8DitherStrength,
  } as unknown as PublishOptions;
}

function parseView(value: unknown): ProjectViewState {
  if (!isRecord(value) || !isRecord(value.pan) || !isRecord(value.inspectorSections)
    || !isFiniteNumber(value.zoom) || value.zoom < 0.1 || value.zoom > 8
    || !isFiniteNumber(value.pan.x) || !isFiniteNumber(value.pan.y)
    || typeof value.showBorders !== 'boolean' || typeof value.showSpriteNames !== 'boolean'
    || !isOneOf(value.bgMode, BACKGROUND_MODES) || typeof value.bgColor !== 'string'
    || typeof value.inspectorSections.output !== 'boolean'
    || typeof value.inspectorSections.data !== 'boolean'
    || typeof value.inspectorSections.layout !== 'boolean'
    || typeof value.inspectorSections.effects !== 'boolean'
    || typeof value.inspectorSections.sprites !== 'boolean'
    || !isFiniteNumber(value.leftPanelWidth) || value.leftPanelWidth < 200 || value.leftPanelWidth > 560
    || !isFiniteNumber(value.rightPanelWidth) || value.rightPanelWidth < 240 || value.rightPanelWidth > 640
    || !isOneOf(value.sortMode, SORT_MODES) || !isStringArray(value.collapsedFolders)
    || !Number.isInteger(value.activeSheet) || (value.activeSheet as number) < 0) {
    throw new Error('Project view state is invalid');
  }
  return {
    zoom: value.zoom,
    pan: { x: value.pan.x, y: value.pan.y },
    showBorders: value.showBorders,
    showSpriteNames: value.showSpriteNames,
    bgMode: value.bgMode,
    bgColor: value.bgColor,
    inspectorSections: {
      output: value.inspectorSections.output,
      data: value.inspectorSections.data,
      layout: value.inspectorSections.layout,
      effects: value.inspectorSections.effects,
      sprites: value.inspectorSections.sprites,
    },
    leftPanelWidth: value.leftPanelWidth,
    rightPanelWidth: value.rightPanelWidth,
    sortMode: value.sortMode,
    collapsedFolders: [...value.collapsedFolders],
    activeSheet: value.activeSheet as number,
  };
}

function smartFolderForProject(folder: SmartFolder, images: ImageItem[]): ProjectSmartFolder {
  const tracked = new Set(folder.trackedIds);
  const trackedSpriteNames = folder.trackedSpriteNames
    ?? images.filter((image) => tracked.has(image.id)).map((image) => image.name);
  return {
    id: folder.id,
    name: folder.name,
    trackedSpriteNames: [...trackedSpriteNames],
    lastSync: folder.lastSync,
    requiresAuthorization: true,
  };
}

function normalizeProjectSettings(settings: PackerOptions): PackerOptions {
  return parseSettings(settings, true);
}

export function createProjectDocument(
  state: ProjectState,
  animations: AnimationGroup[] = [],
): WebTexturePackerProject {
  const spriteIds = new Set(state.images.map((image) => image.id));
  const validAnimations = animations
    .map((animation) => sanitizeAnimationGroup(animation, spriteIds))
    .filter((animation): animation is AnimationGroup => animation !== null);
  return {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    settings: normalizeProjectSettings(state.settings),
    exportFormat: state.exportFormat,
    fileName: state.fileName,
    selectedDirPath: state.selectedDirPath,
    publishOptions: {
      ...state.publishOptions,
      scales: [...state.publishOptions.scales],
      variants: state.publishOptions.variants?.map((variant) => ({ ...variant })),
    },
    view: {
      zoom: state.zoom,
      pan: { ...state.pan },
      showBorders: state.showBorders,
      showSpriteNames: state.showSpriteNames,
      bgMode: state.bgMode,
      bgColor: state.bgColor,
      inspectorSections: { ...state.inspectorSections },
      leftPanelWidth: state.leftPanelWidth,
      rightPanelWidth: state.rightPanelWidth,
      sortMode: state.sortMode,
      collapsedFolders: [...state.collapsedFolders],
      activeSheet: state.activeSheet,
    },
    sprites: state.images.map((image) => ({
      id: image.id,
      name: image.name,
      width: image.width,
      height: image.height,
      imageData: image.url,
      contentHash: image.contentHash,
      metadata: isRecord(image.metadata) ? { ...image.metadata } : {},
    })),
    smartFolders: state.smartFolders.map((folder) =>
      smartFolderForProject(folder, state.images),
    ),
    animations: validAnimations.map((animation) => ({
      ...animation,
      frameIds: [...animation.frameIds],
    })),
  };
}

export function serializeProject(project: WebTexturePackerProject): string {
  return JSON.stringify(project, null, 2);
}

function migrateLegacyProject(value: Record<string, unknown>): ProjectParseResult {
  if (!isRecord(value.settings) || !Array.isArray(value.images)
    || !value.images.every(isProjectSprite)) {
    throw new Error('Invalid legacy Web TexturePacker project');
  }
  const images = value.images;
  const project: WebTexturePackerProject = {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    settings: parseSettings(value.settings, true),
    exportFormat: isOneOf(value.exportFormat, EXPORT_FORMATS) ? value.exportFormat : 'json',
    fileName: typeof value.fileName === 'string' ? value.fileName : 'spritesheet',
    selectedDirPath: typeof value.selectedDirPath === 'string' ? value.selectedDirPath : '',
    publishOptions: { ...DEFAULT_PUBLISH_OPTIONS },
    view: { ...DEFAULT_VIEW, pan: { ...DEFAULT_VIEW.pan }, inspectorSections: { ...DEFAULT_VIEW.inspectorSections } },
    sprites: images.map((image) => ({ ...image, metadata: image.metadata ?? {} })),
    smartFolders: [],
    animations: [],
  };
  return {
    project,
    warnings: ['Legacy .tps JSON was migrated in memory. Save it as .wtp.json to keep all settings.'],
  };
}

export function parseProject(raw: string): ProjectParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Project file is not valid JSON');
  }
  if (!isRecord(value)) throw new Error('Project root must be an object');

  if (value.format !== PROJECT_FILE_FORMAT) {
    if (value.tool === 'web-texturepacker' && value.version === '1.0') {
      return migrateLegacyProject(value);
    }
    throw new Error('Unsupported project format');
  }
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Unsupported project schema version: ${String(value.schemaVersion)}`);
  }
  if (!Array.isArray(value.sprites) || !value.sprites.every(isProjectSprite)) {
    throw new Error('Project sprites are invalid');
  }
  const spriteIds = new Set(value.sprites.map((sprite) => sprite.id));
  if (spriteIds.size !== value.sprites.length) throw new Error('Project sprite ids must be unique');
  if (!isOneOf(value.exportFormat, EXPORT_FORMATS)
    || typeof value.fileName !== 'string'
    || typeof value.selectedDirPath !== 'string'
    || typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) {
    throw new Error('Project header fields are invalid');
  }
  if (!Array.isArray(value.smartFolders) || !value.smartFolders.every(isProjectSmartFolder)) {
    throw new Error('Project Smart Folder descriptors are invalid');
  }
  // `animations` was added compatibly to schema v1. Older native projects
  // without the field open with an empty animation list.
  const animations = value.animations === undefined ? [] : value.animations;
  if (!Array.isArray(animations) || !animations.every(isProjectAnimation)) {
    throw new Error('Project animation groups are invalid');
  }
  const animationIds = new Set(animations.map((animation) => animation.id));
  if (animationIds.size !== animations.length) {
    throw new Error('Project animation group ids must be unique');
  }
  if (animations.some((animation) => animation.frameIds.some((id) => !spriteIds.has(id)))) {
    throw new Error('Project animation frames must reference existing sprites');
  }
  const smartFolderIds = new Set(value.smartFolders.map((folder) => folder.id));
  if (smartFolderIds.size !== value.smartFolders.length) {
    throw new Error('Project Smart Folder ids must be unique');
  }
  const settings = parseSettings(value.settings, false);
  const publishOptions = parsePublishOptions(value.publishOptions);
  const view = parseView(value.view);
  return {
    project: {
      format: PROJECT_FILE_FORMAT,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      savedAt: value.savedAt,
      settings,
      exportFormat: value.exportFormat,
      fileName: value.fileName,
      selectedDirPath: value.selectedDirPath,
      publishOptions,
      view,
      sprites: value.sprites.map((sprite) => ({
        ...sprite,
        metadata: isRecord(sprite.metadata) ? { ...sprite.metadata } : {},
      })),
      smartFolders: value.smartFolders.map((folder) => ({
        ...folder,
        trackedSpriteNames: [...folder.trackedSpriteNames],
      })),
      animations: animations.map((animation) => ({
        ...animation,
        frameIds: [...animation.frameIds],
      })),
    },
    warnings: [],
  };
}

export class ProjectSpriteDecodeError extends Error {
  readonly spriteNames: string[];

  constructor(spriteNames: string[]) {
    super(`Could not decode ${spriteNames.length} project sprite(s): ${spriteNames.slice(0, 3).join(', ')}`);
    this.name = 'ProjectSpriteDecodeError';
    this.spriteNames = spriteNames;
  }
}

/** Decode every embedded sprite before the caller mutates live application state. */
export async function decodeProjectSprites(
  sprites: ProjectSprite[],
  createImage: () => HTMLImageElement = () => new Image(),
): Promise<ImageItem[]> {
  const results = await Promise.all(sprites.map(async (sprite) => {
    try {
      const decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = createImage();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to decode embedded image'));
        image.src = sprite.imageData;
      });
      if (!Number.isFinite(decoded.width) || !Number.isFinite(decoded.height)
        || decoded.width < 1 || decoded.height < 1) {
        throw new Error('Decoded image has invalid dimensions');
      }
      return {
        item: {
          id: sprite.id,
          name: sprite.name,
          width: decoded.width,
          height: decoded.height,
          image: decoded,
          url: sprite.imageData,
          contentHash: sprite.contentHash,
          metadata: { ...sprite.metadata },
        } satisfies ImageItem,
        failedName: null,
      };
    } catch {
      return { item: null, failedName: sprite.name };
    }
  }));
  const failedNames = results
    .map((result) => result.failedName)
    .filter((name): name is string => name !== null);
  if (failedNames.length > 0) throw new ProjectSpriteDecodeError(failedNames);
  const decoded: ImageItem[] = [];
  for (const result of results) {
    if (result.item) decoded.push(result.item);
  }
  return decoded;
}

export function projectFileName(baseName: string): string {
  const safe = baseName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'project';
  return safe.endsWith(PROJECT_FILE_EXTENSION) ? safe : `${safe}${PROJECT_FILE_EXTENSION}`;
}
