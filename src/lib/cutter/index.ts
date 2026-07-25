/**
 * Sprite Sheet Cutter — pure logic module.
 *
 * The cutter is the reverse of the packer. Given a source sprite sheet the
 * user has just opened, it produces the list of `CutFrame` rectangles that
 * should be sliced out. Three strategies are supported:
 *
 * 1. `cutGrid` — mechanical grid slicing based on cell size + margin +
 *    spacing. Used for classic engine sheets where every cell has the
 *    same footprint.
 * 2. `parseAtlasData` — parses a data file that ships alongside the atlas
 *    (JSON Hash, JSON Array, Starling XML, Cocos2d plist, Spine/LibGDX
 *    .atlas) and returns the exact frames the tool that produced the
 *    atlas defined. `null` is returned only when the content isn't
 *    recognizable as any of these formats.
 * 3. `cutTransparentStrips` — connected-component labeling over an
 *    `ImageData` alpha channel that yields the bounding rectangles of the
 *    opaque islands. Handy for hand-authored strips with transparent
 *    gutters.
 *
 * The module is pure: it never touches the DOM, never allocates canvases,
 * never depends on the store. Rendering & sprite extraction are handled
 * separately in `extractSprites.ts` so the parsing logic stays testable
 * under a plain Node environment.
 */

export interface CutFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutGridOptions {
  cellWidth: number;
  cellHeight: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
  namePrefix: string;
  startIndex: number;
  padDigits: number;
}

export const DEFAULT_GRID_OPTIONS: CutGridOptions = {
  cellWidth: 32,
  cellHeight: 32,
  marginX: 0,
  marginY: 0,
  spacingX: 0,
  spacingY: 0,
  namePrefix: 'sprite_',
  startIndex: 0,
  padDigits: 4,
};

/**
 * Slice the source image into equal cells laid out on a regular grid.
 *
 * A partial cell at the right/bottom edge is silently skipped — a common
 * expectation for engine sheets where trailing pixels are just padding.
 */
export function cutGrid(imageW: number, imageH: number, opts: CutGridOptions): CutFrame[] {
  const {
    cellWidth,
    cellHeight,
    marginX,
    marginY,
    spacingX,
    spacingY,
    namePrefix,
    startIndex,
    padDigits,
  } = opts;
  if (cellWidth <= 0 || cellHeight <= 0) return [];
  if (imageW <= 0 || imageH <= 0) return [];

  const frames: CutFrame[] = [];
  let index = startIndex;
  const digits = Math.max(0, Math.floor(padDigits));

  for (let y = marginY; y + cellHeight <= imageH - marginY + 0.001; y += cellHeight + spacingY) {
    for (let x = marginX; x + cellWidth <= imageW - marginX + 0.001; x += cellWidth + spacingX) {
      const seq = digits > 0 ? String(index).padStart(digits, '0') : String(index);
      frames.push({
        name: `${namePrefix}${seq}`,
        x,
        y,
        w: cellWidth,
        h: cellHeight,
      });
      index += 1;
    }
  }
  return frames;
}

/**
 * Find rectangular opaque islands in an `ImageData` using two-pass
 * connected-component labeling on the alpha channel.
 *
 * `alphaThreshold` in [0..255]: pixels with `alpha > threshold` are
 * considered opaque. Islands smaller than 4 pixels are discarded to avoid
 * dust from anti-aliased edges triggering hundreds of one-off frames.
 */
export function cutTransparentStrips(imageData: ImageData, alphaThreshold: number): CutFrame[] {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return [];

  // Union-find over pixel labels. We connect 4-neighbours (top/left) using
  // a scanline pass, then a second pass collects each root's bounding box.
  const labels = new Int32Array(width * height);
  const parents: number[] = [0];
  const ranks: number[] = [0];

  const makeSet = (): number => {
    const id = parents.length;
    parents.push(id);
    ranks.push(0);
    return id;
  };

  const find = (i: number): number => {
    let root = i;
    while (parents[root] !== root) root = parents[root];
    let node = i;
    while (parents[node] !== root) {
      const next = parents[node];
      parents[node] = root;
      node = next;
    }
    return root;
  };

  const union = (a: number, b: number): number => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return ra;
    if (ranks[ra] < ranks[rb]) {
      parents[ra] = rb;
      return rb;
    }
    if (ranks[ra] > ranks[rb]) {
      parents[rb] = ra;
      return ra;
    }
    parents[rb] = ra;
    ranks[ra] += 1;
    return ra;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const alpha = data[idx * 4 + 3];
      if (alpha <= alphaThreshold) {
        labels[idx] = 0;
        continue;
      }
      const left = x > 0 ? labels[idx - 1] : 0;
      const top = y > 0 ? labels[idx - width] : 0;
      if (left === 0 && top === 0) {
        labels[idx] = makeSet();
      } else if (left !== 0 && top === 0) {
        labels[idx] = left;
      } else if (left === 0 && top !== 0) {
        labels[idx] = top;
      } else {
        labels[idx] = union(left, top);
      }
    }
  }

  interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    count: number;
  }
  const bounds = new Map<number, Bounds>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const raw = labels[idx];
      if (raw === 0) continue;
      const root = find(raw);
      const existing = bounds.get(root);
      if (existing === undefined) {
        bounds.set(root, { minX: x, minY: y, maxX: x, maxY: y, count: 1 });
      } else {
        if (x < existing.minX) existing.minX = x;
        if (x > existing.maxX) existing.maxX = x;
        if (y < existing.minY) existing.minY = y;
        if (y > existing.maxY) existing.maxY = y;
        existing.count += 1;
      }
    }
  }

  const collected: CutFrame[] = [];
  let n = 0;
  const sorted = Array.from(bounds.values()).sort((a, b) => {
    if (a.minY !== b.minY) return a.minY - b.minY;
    return a.minX - b.minX;
  });
  for (const b of sorted) {
    if (b.count < 4) continue;
    collected.push({
      name: `strip_${String(n).padStart(4, '0')}`,
      x: b.minX,
      y: b.minY,
      w: b.maxX - b.minX + 1,
      h: b.maxY - b.minY + 1,
    });
    n += 1;
  }
  return collected;
}

// --- Data-file parsing ------------------------------------------------------

/**
 * Coerce a parsed frame rect to integers and validate it fits inside the
 * source image. Frames outside the image are dropped; a data file that
 * references sprites on a different (or scaled) atlas must not silently
 * produce garbage cutouts.
 */
function clampFrame(
  frame: CutFrame,
  imageWidth: number,
  imageHeight: number,
): CutFrame | null {
  const x = Math.round(frame.x);
  const y = Math.round(frame.y);
  const w = Math.round(frame.w);
  const h = Math.round(frame.h);
  if (w <= 0 || h <= 0) return null;
  if (x < 0 || y < 0) return null;
  if (x + w > imageWidth || y + h > imageHeight) return null;
  return { name: frame.name, x, y, w, h };
}

/** Coerce any value to a finite number; returns `null` when unparseable. */
function toFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

interface FrameRectLike {
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
  width?: unknown;
  height?: unknown;
}

function frameFromRectLike(rect: FrameRectLike, name: string): CutFrame | null {
  const x = toFinite(rect.x);
  const y = toFinite(rect.y);
  const w = toFinite(rect.w ?? rect.width);
  const h = toFinite(rect.h ?? rect.height);
  if (x === null || y === null || w === null || h === null) return null;
  return { name, x, y, w, h };
}

function parseJsonAtlas(content: string): CutFrame[] | null {
  let root: unknown;
  try {
    root = JSON.parse(content);
  } catch {
    return null;
  }
  if (!root || typeof root !== 'object') return null;
  const rec = root as Record<string, unknown>;
  const frames = rec.frames;
  const out: CutFrame[] = [];

  if (Array.isArray(frames)) {
    // JSON (Array): [{ filename, frame: {x,y,w,h}}]
    for (const entry of frames) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const name =
        typeof item.filename === 'string'
          ? item.filename
          : typeof item.name === 'string'
            ? item.name
            : `frame_${out.length}`;
      const rect = item.frame;
      if (!rect || typeof rect !== 'object') continue;
      const frame = frameFromRectLike(rect as FrameRectLike, name);
      if (frame) out.push(frame);
    }
    return out;
  }

  if (frames && typeof frames === 'object') {
    // JSON (Hash): { name: { frame: {x,y,w,h} } }
    for (const [name, entry] of Object.entries(frames as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const rect = (entry as Record<string, unknown>).frame;
      if (!rect || typeof rect !== 'object') continue;
      const frame = frameFromRectLike(rect as FrameRectLike, name);
      if (frame) out.push(frame);
    }
    return out;
  }

  // A JSON document that isn't shaped like a texture atlas is not our
  // format — return `null` so the caller can try other parsers or report
  // the unrecognized file to the user.
  return null;
}

/**
 * Parse Starling / Sparrow XML with a regex sweep. Doing this without
 * `DOMParser` keeps the module usable in Node tests where no DOM exists,
 * and Starling's schema is a flat list of self-closing `<SubTexture>` tags
 * so a regex is sufficient and easy to reason about.
 */
function parseStarlingXml(content: string): CutFrame[] | null {
  if (!/<TextureAtlas\b/i.test(content) && !/<SubTexture\b/i.test(content)) {
    return null;
  }
  const subTextureRegex = /<SubTexture\b([^>]*)\/?>/gi;
  const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
  const out: CutFrame[] = [];
  let match: RegExpExecArray | null;
  while ((match = subTextureRegex.exec(content)) !== null) {
    const attrs: Record<string, string> = {};
    const raw = match[1];
    let am: RegExpExecArray | null;
    attrRegex.lastIndex = 0;
    while ((am = attrRegex.exec(raw)) !== null) {
      attrs[am[1]] = am[2];
    }
    const name = attrs.name ?? `frame_${out.length}`;
    const frame = frameFromRectLike(
      { x: attrs.x, y: attrs.y, w: attrs.width, h: attrs.height },
      name,
    );
    if (frame) out.push(frame);
  }
  return out;
}

/**
 * Parse Cocos2d-x plist atlas format. Cocos serializes frame rects as
 * strings like `{{x,y},{w,h}}` inside a `<string>` value keyed by the
 * sprite name. We do not need a full plist AST — a scan over `<key>` /
 * `<string>` pairs is enough to locate every frame rect.
 */
function parseCocos2dPlist(content: string): CutFrame[] | null {
  if (!/<plist\b/i.test(content) && !/<key>\s*frames\s*<\/key>/i.test(content)) {
    return null;
  }
  const framesKeyIdx = content.search(/<key>\s*frames\s*<\/key>/i);
  if (framesKeyIdx === -1) return null;
  // Isolate the frames dictionary: from the <dict> immediately after the
  // frames key up to the next </dict> at the same depth. A depth counter
  // handles nested dicts within each entry.
  const dictOpen = content.indexOf('<dict>', framesKeyIdx);
  if (dictOpen === -1) return null;
  let depth = 1;
  const cursor = dictOpen + '<dict>'.length;
  let dictClose = -1;
  const tagRegex = /<(\/?)dict\s*>/gi;
  tagRegex.lastIndex = cursor;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(content)) !== null) {
    if (m[1] === '') depth += 1;
    else {
      depth -= 1;
      if (depth === 0) {
        dictClose = m.index;
        break;
      }
    }
  }
  if (dictClose === -1) return null;
  const framesBody = content.slice(dictOpen + '<dict>'.length, dictClose);

  // Match "<key>NAME</key>\s*<dict>...</dict>" for each frame entry.
  const entryRegex = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/gi;
  const out: CutFrame[] = [];
  let em: RegExpExecArray | null;
  while ((em = entryRegex.exec(framesBody)) !== null) {
    const name = em[1].trim();
    const body = em[2];
    // Legacy format v1/v2: <key>frame</key><string>{{x,y},{w,h}}</string>
    // Format v3: separate keys — <key>textureRect</key><string>{{x,y},{w,h}}</string>
    let rectMatch = body.match(
      /<key>\s*(?:frame|textureRect)\s*<\/key>\s*<string>\s*\{\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*,\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*\}\s*<\/string>/i,
    );
    if (!rectMatch) {
      // Format v3 alternative: split origin + size.
      const origin = body.match(
        /<key>\s*(?:spriteOffset|origin)\s*<\/key>\s*<string>\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*<\/string>/i,
      );
      const size = body.match(
        /<key>\s*(?:spriteSize|size)\s*<\/key>\s*<string>\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*<\/string>/i,
      );
      if (!origin || !size) continue;
      rectMatch = [
        '',
        origin[1],
        origin[2],
        size[1],
        size[2],
      ] as unknown as RegExpMatchArray;
    }
    const [, xs, ys, ws, hs] = rectMatch;
    const frame = frameFromRectLike({ x: xs, y: ys, w: ws, h: hs }, name);
    if (frame) out.push(frame);
  }
  return out;
}

/**
 * Parse Spine / LibGDX .atlas format. Sprites are line-based:
 *
 *     spriteName
 *       xy: 12, 34
 *       size: 16, 16
 *       ...
 *
 * We track the current sprite as we walk lines, emitting a frame once we
 * have both `xy:` and `size:` for it. Header lines (the first `size:`,
 * `format:`, etc.) belong to the sheet itself and are recognized by
 * appearing before any sprite header.
 */
function parseSpineAtlas(content: string): CutFrame[] | null {
  const lines = content.split(/\r?\n/);
  let sawSpriteEntry = false;
  const out: CutFrame[] = [];

  interface Pending {
    name: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  }
  let current: Pending | null = null;

  const flush = () => {
    if (
      current &&
      current.x !== undefined &&
      current.y !== undefined &&
      current.w !== undefined &&
      current.h !== undefined
    ) {
      out.push({ name: current.name, x: current.x, y: current.y, w: current.w, h: current.h });
    }
    current = null;
  };

  let sheetHeaderDone = false;
  for (const rawLine of lines) {
    const line = rawLine;
    if (line.trim() === '') {
      // Blank line delimits one sprite entry from the next. Once we've
      // seen the empty line after the header block, all subsequent named
      // lines are sprite names.
      flush();
      sheetHeaderDone = true;
      continue;
    }
    const kv = line.match(/^\s+(\w+):\s*(.+)$/);
    if (kv) {
      if (!current) {
        // Sheet-level metadata (size/format/filter/repeat). Skip.
        continue;
      }
      const key = kv[1];
      const value = kv[2].trim();
      if (key === 'xy') {
        const nums = value.split(/\s*,\s*/).map((s) => Number(s));
        if (nums.length >= 2 && nums.every((n) => Number.isFinite(n))) {
          current.x = nums[0];
          current.y = nums[1];
        }
      } else if (key === 'size') {
        const nums = value.split(/\s*,\s*/).map((s) => Number(s));
        if (nums.length >= 2 && nums.every((n) => Number.isFinite(n))) {
          current.w = nums[0];
          current.h = nums[1];
        }
      } else if (key === 'bounds') {
        // Newer libgdx: bounds: x, y, w, h (single line).
        const nums = value.split(/\s*,\s*/).map((s) => Number(s));
        if (nums.length >= 4 && nums.every((n) => Number.isFinite(n))) {
          current.x = nums[0];
          current.y = nums[1];
          current.w = nums[2];
          current.h = nums[3];
        }
      }
      continue;
    }
    // Non-indented, non-empty line: image name (first) or sprite name.
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!sheetHeaderDone && /\.(png|jpg|jpeg|webp)$/i.test(trimmed) && !sawSpriteEntry) {
      // Sheet image reference.
      continue;
    }
    flush();
    current = { name: trimmed };
    sawSpriteEntry = true;
    sheetHeaderDone = true;
  }
  flush();

  if (!sawSpriteEntry) return null;
  return out;
}

/**
 * Attempt every known atlas format in the order most likely to succeed
 * given the file's opening bytes. Returns `null` for content that doesn't
 * look like any format so callers can distinguish "empty atlas" from
 * "wrong file dropped".
 */
export function parseAtlasData(
  content: string,
  imageWidth: number,
  imageHeight: number,
): CutFrame[] | null {
  if (typeof content !== 'string' || content.length === 0) return null;
  const trimmed = content.trimStart();

  let frames: CutFrame[] | null = null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    frames = parseJsonAtlas(content);
  } else if (trimmed.startsWith('<')) {
    // XML — could be plist or Starling. Plist declares its root explicitly.
    if (/<plist\b/i.test(trimmed) || /<key>\s*frames\s*<\/key>/i.test(trimmed)) {
      frames = parseCocos2dPlist(content);
    } else if (/<TextureAtlas\b/i.test(trimmed) || /<SubTexture\b/i.test(trimmed)) {
      frames = parseStarlingXml(content);
    } else {
      // Some other XML dropped in — not recognized.
      return null;
    }
  } else {
    // No leading brace / angle bracket — try the line-based Spine/LibGDX
    // format. It's the only recognized format that starts with a bare
    // filename or empty line.
    frames = parseSpineAtlas(content);
  }

  if (frames === null) return null;

  // Clamp/reject frames that fall outside the given image bounds so a
  // mismatched data file cannot produce garbage cutouts.
  const clamped: CutFrame[] = [];
  for (const frame of frames) {
    const inside = clampFrame(frame, imageWidth, imageHeight);
    if (inside) clamped.push(inside);
  }
  return clamped;
}
