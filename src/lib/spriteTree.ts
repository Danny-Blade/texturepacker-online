import type { ImageItem } from './packer';
import type { SortMode } from './store';

export interface SpriteNode {
  kind: 'sprite';
  id: string;
  image: ImageItem;
  depth: number;
  parentPath: string;
  baseName: string;
}

export interface FolderNode {
  kind: 'folder';
  path: string;
  baseName: string;
  depth: number;
  parentPath: string;
  spriteCount: number;
  totalCount: number;
  spriteIds: string[];
  descendantSpriteIds: string[];
  childFolders: string[];
}

export type TreeNode = SpriteNode | FolderNode;

export interface FlatTreeRow {
  node: TreeNode;
  visible: boolean;
}

export interface BuiltTree {
  rootSprites: SpriteNode[];
  rootFolders: FolderNode[];
  foldersByPath: Map<string, FolderNode>;
  spritesByFolder: Map<string, SpriteNode[]>;
  allFolderPaths: string[];
}

function splitName(name: string): { dir: string; base: string } {
  const idx = name.lastIndexOf('/');
  if (idx < 0) return { dir: '', base: name };
  return { dir: name.slice(0, idx), base: name.slice(idx + 1) };
}

function sortImages(images: ImageItem[], mode: SortMode): ImageItem[] {
  if (mode === 'manual') return images;
  const cmp = (a: ImageItem, b: ImageItem): number => {
    switch (mode) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'size-desc':
        return b.width * b.height - a.width * a.height;
      case 'size-asc':
        return a.width * a.height - b.width * b.height;
    }
  };
  return [...images].sort(cmp);
}

export function buildSpriteTree(images: ImageItem[], sortMode: SortMode = 'manual'): BuiltTree {
  const sorted = sortImages(images, sortMode);

  const foldersByPath = new Map<string, FolderNode>();
  const spritesByFolder = new Map<string, SpriteNode[]>();
  const ensureBucket = (path: string) => {
    if (!spritesByFolder.has(path)) spritesByFolder.set(path, []);
    return spritesByFolder.get(path)!;
  };

  const ensureFolder = (path: string): FolderNode => {
    const existing = foldersByPath.get(path);
    if (existing) return existing;
    const { dir, base } = splitName(path);
    const depth = path === '' ? -1 : path.split('/').length - 1;
    const folder: FolderNode = {
      kind: 'folder',
      path,
      baseName: base,
      depth,
      parentPath: dir,
      spriteCount: 0,
      totalCount: 0,
      spriteIds: [],
      descendantSpriteIds: [],
      childFolders: [],
    };
    foldersByPath.set(path, folder);
    if (path !== '') {
      const parent = ensureFolder(dir);
      if (!parent.childFolders.includes(path)) parent.childFolders.push(path);
    }
    return folder;
  };

  ensureFolder('');

  for (const img of sorted) {
    const { dir } = splitName(img.name);
    ensureFolder(dir);
    const parts = dir === '' ? [] : dir.split('/');
    for (let i = 1; i <= parts.length; i++) {
      ensureFolder(parts.slice(0, i).join('/'));
    }
  }

  for (const img of sorted) {
    const { dir, base } = splitName(img.name);
    const folder = foldersByPath.get(dir)!;
    const sprite: SpriteNode = {
      kind: 'sprite',
      id: img.id,
      image: img,
      depth: folder.depth + 1,
      parentPath: dir,
      baseName: base,
    };
    ensureBucket(dir).push(sprite);
    folder.spriteCount += 1;
    folder.spriteIds.push(img.id);
    let cur: string | undefined = dir;
    while (cur !== undefined) {
      const f = foldersByPath.get(cur);
      if (!f) break;
      f.totalCount += 1;
      f.descendantSpriteIds.push(img.id);
      if (cur === '') break;
      cur = f.parentPath;
    }
  }

  const root = foldersByPath.get('')!;
  const rootSprites = spritesByFolder.get('') ?? [];
  const rootFolders = root.childFolders
    .map((p) => foldersByPath.get(p)!)
    .sort((a, b) => a.baseName.localeCompare(b.baseName));

  const allFolderPaths = Array.from(foldersByPath.keys()).filter((p) => p !== '');

  return {
    rootSprites,
    rootFolders,
    foldersByPath,
    spritesByFolder,
    allFolderPaths,
  };
}

export function flattenTree(tree: BuiltTree, collapsed: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (folder: FolderNode, parentCollapsed: boolean) => {
    const isCollapsed = collapsed.has(folder.path);
    if (folder.path !== '') {
      out.push(folder);
    }
    if (parentCollapsed || isCollapsed) return;
    const children = folder.childFolders
      .map((p) => tree.foldersByPath.get(p)!)
      .sort((a, b) => a.baseName.localeCompare(b.baseName));
    for (const child of children) walk(child, false);
    const sprites = tree.spritesByFolder.get(folder.path) ?? [];
    for (const s of sprites) out.push(s);
  };
  walk(tree.foldersByPath.get('')!, false);
  return out;
}

export interface SelectionSummary {
  count: number;
  totalPixels: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  paths: string[];
}

export function summarizeSelection(images: ImageItem[], selectedIds: string[]): SelectionSummary {
  const set = new Set(selectedIds);
  const chosen = images.filter((i) => set.has(i.id));
  if (chosen.length === 0) {
    return { count: 0, totalPixels: 0, minW: 0, minH: 0, maxW: 0, maxH: 0, paths: [] };
  }
  let total = 0;
  let minW = Infinity;
  let minH = Infinity;
  let maxW = 0;
  let maxH = 0;
  const paths = new Set<string>();
  for (const img of chosen) {
    total += img.width * img.height;
    if (img.width < minW) minW = img.width;
    if (img.height < minH) minH = img.height;
    if (img.width > maxW) maxW = img.width;
    if (img.height > maxH) maxH = img.height;
    const idx = img.name.lastIndexOf('/');
    paths.add(idx >= 0 ? img.name.slice(0, idx) : '');
  }
  return {
    count: chosen.length,
    totalPixels: total,
    minW: minW === Infinity ? 0 : minW,
    minH: minH === Infinity ? 0 : minH,
    maxW,
    maxH,
    paths: Array.from(paths).sort(),
  };
}

export function descendantIdsOf(tree: BuiltTree, folderPath: string): string[] {
  return tree.foldersByPath.get(folderPath)?.descendantSpriteIds ?? [];
}
