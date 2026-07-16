import type { ExportFormat, PackerOptions, PackingAlgorithm } from './packer';

export interface TpsImport {
  isDesktopPlist: boolean;
  settings: Partial<PackerOptions>;
  exportFormat: ExportFormat | null;
  fileName: string | null;
  referencedFiles: string[];
  warnings: string[];
}

type PlistValue = string | number | boolean | PlistValue[] | { [k: string]: PlistValue };

function isObject(v: PlistValue | undefined): v is { [k: string]: PlistValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: PlistValue | undefined): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parseNode(el: Element): PlistValue {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'dict': {
      const out: { [k: string]: PlistValue } = {};
      const children = Array.from(el.children);
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c.tagName.toLowerCase() !== 'key') continue;
        const key = c.textContent ?? '';
        const valEl = children[i + 1];
        if (!valEl) break;
        out[key] = parseNode(valEl);
        i++;
      }
      return out;
    }
    case 'array': {
      const arr: PlistValue[] = [];
      for (const c of Array.from(el.children)) {
        arr.push(parseNode(c));
      }
      return arr;
    }
    case 'string':
    case 'enum':
      return el.textContent ?? '';
    case 'integer':
    case 'uint': {
      const n = parseInt(el.textContent ?? '0', 10);
      return Number.isFinite(n) ? n : 0;
    }
    case 'real': {
      const n = parseFloat(el.textContent ?? '0');
      return Number.isFinite(n) ? n : 0;
    }
    case 'true':
      return true;
    case 'false':
      return false;
    case 'data':
    case 'date':
      return el.textContent ?? '';
    default:
      return el.textContent ?? '';
  }
}

function emptyImport(isPlist: boolean, warnings: string[] = []): TpsImport {
  return {
    isDesktopPlist: isPlist,
    settings: {},
    exportFormat: null,
    fileName: null,
    referencedFiles: [],
    warnings,
  };
}

function mapAlgorithm(
  algorithm: string | undefined,
  heuristic: string | undefined,
  warnings: string[],
): PackingAlgorithm | undefined {
  if (!algorithm) return undefined;
  const alg = algorithm.toLowerCase();
  if (alg === 'basic' || alg === 'shelf') return 'shelf';
  if (alg === 'maxrects') {
    const h = (heuristic ?? '').toLowerCase();
    if (h === 'best') return 'maxrects-best';
    if (h === 'bestshortsidefit' || h === 'shortsidefit') return 'maxrects-bssf';
    if (h === 'bestlongsidefit' || h === 'longsidefit') return 'maxrects-blsf';
    if (h === 'bestareafit' || h === 'areafit') return 'maxrects-baf';
    if (h === 'bottomleftrule' || h === 'bottomleft') return 'maxrects-bl';
    if (h === 'contactpointrule' || h === 'contactpoint') return 'maxrects-cp';
    return 'maxrects-bssf';
  }
  if (alg === 'polygon') {
    warnings.push('Polygon packing is not supported — falling back to MaxRects BSSF.');
    return 'maxrects-bssf';
  }
  warnings.push(`Unknown algorithm "${algorithm}" — falling back to MaxRects BSSF.`);
  return 'maxrects-bssf';
}

const DATA_FORMAT_MAP: Record<string, ExportFormat> = {
  json: 'json',
  'json-hash': 'json',
  'json-array': 'json-array',
  css: 'css',
  sparrow: 'xml',
  starling: 'xml',
  cocos2d: 'cocos2d',
  'cocos2d-v3': 'cocos2d',
  'cocos2d-x': 'cocos2d',
  'phaser-json-hash': 'phaser3',
  'phaser-json-array': 'phaser3',
  phaser3: 'phaser3',
  unity3d: 'unity',
  unity: 'unity',
  'unity-texture2d': 'unity',
  spine: 'spine',
  godot: 'godot',
  godot3: 'godot',
  godot4: 'godot',
  'gamemaker-studio': 'gamemaker',
  gamemaker: 'gamemaker',
  pixijs: 'pixi',
  pixi: 'pixi',
  libgdx: 'libgdx',
  'cocos-creator': 'cocos-creator',
  defold: 'defold',
  defoldexporter: 'defold',
  spritekit: 'spritekit',
  unreal: 'paper2d',
  paper2d: 'paper2d',
  'unreal-paper2d': 'paper2d',
  'unrealengine-paper2d': 'paper2d',
  monogame: 'monogame',
  'monogame-extended': 'monogame',
  corona: 'solar2d',
  'corona-imagesheet': 'solar2d',
  solar2d: 'solar2d',
};

function mapDataFormat(
  fmt: string | undefined,
  warnings: string[],
): ExportFormat | null {
  if (!fmt) return null;
  const key = fmt.toLowerCase();
  const mapped = DATA_FORMAT_MAP[key];
  if (mapped) return mapped;
  warnings.push(`Unsupported data format "${fmt}" — keeping current export format.`);
  return null;
}

function basenameNoExt(p: string): string {
  const slash = p.replace(/\\/g, '/').split('/').pop() ?? p;
  const dot = slash.lastIndexOf('.');
  return dot > 0 ? slash.slice(0, dot) : slash;
}

const KNOWN_KEYS = new Set([
  'fileFormatVersion',
  'texturePackerVersion',
  'settings',
  'fileList',
  'maxTextureSize',
  'fixedTextureSize',
  'shapePadding',
  'borderPadding',
  'innerPadding',
  'trimMode',
  'trimThreshold',
  'rotation',
  'allowRotation',
  'powerOfTwo',
  'forcePowerOfTwo',
  'extrude',
  'algorithm',
  'maxrectsHeuristics',
  'dataFormat',
  'textureFileName',
  'multiPack',
  'autoSDSettings',
  'squarePot',
  'forceSquared',
  'forceSquare',
  'globalSpriteSettings',
  'jsonHash',
  'reduceBorderArtifacts',
  'premultiplyAlpha',
  'textureFormat',
  'pngOptimizationLevel',
  'webpQualityLevel',
  'jpgQuality',
]);

export function parseTpsPlist(xml: string): TpsImport {
  if (typeof DOMParser === 'undefined') {
    return emptyImport(false, ['DOMParser unavailable (SSR) — .tps not parsed.']);
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return emptyImport(false, ['Failed to parse .tps as XML.']);
  }

  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    return emptyImport(false, ['Malformed plist XML — .tps could not be read.']);
  }

  const plist = doc.getElementsByTagName('plist')[0];
  if (!plist) {
    return emptyImport(false, ['Missing <plist> root.']);
  }

  const rootDictEl = Array.from(plist.children).find(
    (c) => c.tagName.toLowerCase() === 'dict',
  );
  if (!rootDictEl) {
    return emptyImport(true, ['No root <dict> found in plist.']);
  }

  const root = parseNode(rootDictEl);
  if (!isObject(root)) {
    return emptyImport(true, ['Root plist node was not a dictionary.']);
  }

  const warnings: string[] = [];
  const settings: Partial<PackerOptions> = {};
  let exportFormat: ExportFormat | null = null;
  let fileName: string | null = null;
  let referencedFiles: string[] = [];

  const sNode = root.settings;
  const settingsDict: { [k: string]: PlistValue } = isObject(sNode) ? sNode : root;

  for (const key of Object.keys(root)) {
    if (key === 'settings') continue;
    if (!KNOWN_KEYS.has(key)) warnings.push(`Ignored key: ${key}`);
  }

  const fileList = settingsDict.fileList;
  if (isStringArray(fileList)) {
    referencedFiles = fileList.slice();
  } else if (Array.isArray(fileList)) {
    referencedFiles = fileList.filter((v): v is string => typeof v === 'string');
  }

  const maxTex = settingsDict.maxTextureSize;
  if (isObject(maxTex)) {
    if (typeof maxTex.width === 'number') settings.maxWidth = maxTex.width;
    if (typeof maxTex.height === 'number') settings.maxHeight = maxTex.height;
  }

  if (typeof settingsDict.shapePadding === 'number') {
    settings.shapePadding = settingsDict.shapePadding;
    settings.padding = settingsDict.shapePadding;
  }
  if (typeof settingsDict.borderPadding === 'number') {
    settings.borderPadding = settingsDict.borderPadding;
  }
  if (typeof settingsDict.innerPadding === 'number') {
    settings.innerPadding = settingsDict.innerPadding;
  }

  const trimMode = settingsDict.trimMode;
  if (typeof trimMode === 'string') {
    settings.trimAlpha = trimMode !== 'None';
    if (trimMode === 'None') {
      settings.trimMode = 'none';
    } else if (trimMode === 'Polygon') {
      settings.trimMode = 'polygon-outline';
      warnings.push('Polygon trim imported as polygon outline metadata; packing remains rectangular.');
    } else {
      settings.trimMode = 'rect';
    }
    if (trimMode === 'Crop, keep position' || trimMode === 'CropFlush' || trimMode === 'Crop') {
      warnings.push(`Trim mode "${trimMode}" is mapped to alpha-trim (closest available).`);
    }
  }
  if (typeof settingsDict.trimThreshold === 'number') {
    settings.trimThreshold = settingsDict.trimThreshold;
  }

  if (typeof settingsDict.rotation === 'boolean') {
    settings.allowRotation = settingsDict.rotation;
  } else if (typeof settingsDict.allowRotation === 'boolean') {
    settings.allowRotation = settingsDict.allowRotation;
  }

  if (typeof settingsDict.powerOfTwo === 'boolean') {
    settings.powerOfTwo = settingsDict.powerOfTwo;
  } else if (typeof settingsDict.forcePowerOfTwo === 'boolean') {
    settings.powerOfTwo = settingsDict.forcePowerOfTwo;
  }

  if (typeof settingsDict.extrude === 'number') {
    settings.extrude = settingsDict.extrude;
  }

  if (typeof settingsDict.multiPack === 'boolean') {
    settings.multipack = settingsDict.multiPack;
  }

  const square =
    (typeof settingsDict.forceSquared === 'boolean' && settingsDict.forceSquared) ||
    (typeof settingsDict.squarePot === 'boolean' && settingsDict.squarePot) ||
    (typeof settingsDict.forceSquare === 'boolean' && settingsDict.forceSquare);
  if (square) settings.forceSquare = true;

  const alg = typeof settingsDict.algorithm === 'string' ? settingsDict.algorithm : undefined;
  const heur =
    typeof settingsDict.maxrectsHeuristics === 'string'
      ? settingsDict.maxrectsHeuristics
      : undefined;
  const mappedAlg = mapAlgorithm(alg, heur, warnings);
  if (mappedAlg) settings.algorithm = mappedAlg;

  const df = typeof settingsDict.dataFormat === 'string' ? settingsDict.dataFormat : undefined;
  exportFormat = mapDataFormat(df, warnings);

  const texName = settingsDict.textureFileName;
  if (typeof texName === 'string' && texName.trim()) {
    fileName = basenameNoExt(texName.trim());
  }

  for (const key of Object.keys(settingsDict)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`Ignored key: settings.${key}`);
  }

  return {
    isDesktopPlist: true,
    settings,
    exportFormat,
    fileName,
    referencedFiles,
    warnings,
  };
}
