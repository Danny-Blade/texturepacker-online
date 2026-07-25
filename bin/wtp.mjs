#!/usr/bin/env node
// Web TexturePacker CLI — P3-02.
//
// Loads the browser-agnostic core compiled under `dist/cli/` (see
// `scripts/build-cli.mjs`), wires it to a @napi-rs/canvas-backed
// `CanvasFactory`, and runs the requested subcommand.

import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, relative, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = join(PROJECT_ROOT, 'dist', 'cli');
const DIST_MARKER = join(DIST_ROOT, '.built');

const PKG_JSON = JSON.parse(await readFile(join(PROJECT_ROOT, 'package.json'), 'utf8'));

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const VALID_ALGORITHMS = new Set([
  'maxrects-bssf',
  'maxrects-blsf',
  'maxrects-baf',
  'maxrects-bl',
  'maxrects-cp',
  'maxrects-best',
  'shelf',
]);
const VALID_TRIM = new Set(['none', 'trim', 'crop-keep-position', 'crop-flush', 'polygon-outline']);
const VALID_IMAGE_FORMATS = new Set(['png', 'png-8', 'jpg', 'webp']);

/** ExitCode.OK: 0, Runtime: 1, Args: 2. */
const EXIT = { OK: 0, RUNTIME: 1, ARGS: 2 };

class CliError extends Error {
  constructor(message, code = EXIT.RUNTIME) {
    super(message);
    this.code = code;
  }
}

function ensureCliBuild() {
  if (existsSync(DIST_MARKER)) return;
  process.stderr.write('[wtp] Compiling packer core (first run)...\n');
  const result = spawnSync(
    process.execPath,
    [join(PROJECT_ROOT, 'scripts', 'build-cli.mjs'), '--quiet'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new CliError('Failed to compile packer core; see errors above.', EXIT.RUNTIME);
  }
}

async function loadCore() {
  ensureCliBuild();
  const url = pathToFileURL(join(DIST_ROOT, 'core', 'index.js')).href;
  return await import(url);
}

async function loadNodeCanvas() {
  try {
    return await import('@napi-rs/canvas');
  } catch (error) {
    throw new CliError(
      'The @napi-rs/canvas package is required. Install it with `npm install --save-dev @napi-rs/canvas`. Original error: '
        + (error instanceof Error ? error.message : String(error)),
      EXIT.RUNTIME,
    );
  }
}

function makeNodeCanvasFactory(nodeCanvasModule) {
  const { createCanvas } = nodeCanvasModule;
  return {
    createCanvas(w, h) {
      return createCanvas(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
    },
  };
}

// ---------------------------------------------------------------------------
// Image discovery + loading
// ---------------------------------------------------------------------------

async function collectImageFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectImageFiles(full)));
    } else if (entry.isFile() && IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out.sort();
}

function nameForFile(root, absPath) {
  const rel = relative(root, absPath).split(/[\\/]/).join('/');
  const withoutExt = rel.replace(/\.[^.]+$/, '');
  return withoutExt;
}

async function loadImageItems(inputDir, nodeCanvasModule) {
  const { loadImage } = nodeCanvasModule;
  const files = await collectImageFiles(inputDir);
  const items = [];
  for (const file of files) {
    const buf = await readFile(file);
    const image = await loadImage(buf);
    items.push({
      id: file,
      name: nameForFile(inputDir, file),
      width: image.width,
      height: image.height,
      image,
      url: pathToFileURL(file).href,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Option parsing
// ---------------------------------------------------------------------------

const PACK_OPTIONS = {
  out: { type: 'string', default: './output' },
  name: { type: 'string', default: 'spritesheet' },
  format: { type: 'string', default: 'json' },
  'image-format': { type: 'string', default: 'png' },
  'max-width': { type: 'string', default: '2048' },
  'max-height': { type: 'string', default: '2048' },
  padding: { type: 'string', default: '2' },
  extrude: { type: 'string', default: '0' },
  rotate: { type: 'boolean', default: false },
  pot: { type: 'boolean', default: false },
  trim: { type: 'string', default: 'none' },
  multipack: { type: 'boolean', default: false },
  algorithm: { type: 'string', default: 'maxrects-bssf' },
  scale: { type: 'string', multiple: true },
  json: { type: 'boolean', default: false },
  verbose: { type: 'boolean', short: 'v', default: false },
  force: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

function parseInt10(name, raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || String(n) !== String(raw)) {
    throw new CliError(`Option --${name} must be an integer (got "${raw}").`, EXIT.ARGS);
  }
  return n;
}

function parsePositive(name, raw, allowZero = false) {
  const n = parseInt10(name, raw);
  if (allowZero ? n < 0 : n <= 0) {
    throw new CliError(`Option --${name} must be > ${allowZero ? -1 : 0}.`, EXIT.ARGS);
  }
  return n;
}

function parseScaleList(raw) {
  if (!raw || raw.length === 0) return [1];
  const scales = raw.map((r) => {
    const n = Number.parseFloat(r);
    if (!Number.isFinite(n) || n <= 0) {
      throw new CliError(`--scale value must be > 0 (got "${r}").`, EXIT.ARGS);
    }
    return n;
  });
  return scales;
}

function validateEnum(name, value, allowed) {
  if (!allowed.has(value)) {
    throw new CliError(
      `--${name} must be one of ${[...allowed].join(', ')} (got "${value}").`,
      EXIT.ARGS,
    );
  }
}

function buildPackerOptions(opts) {
  const padding = parsePositive('padding', opts.padding, true);
  const maxWidth = parsePositive('max-width', opts['max-width']);
  const maxHeight = parsePositive('max-height', opts['max-height']);
  const extrude = parsePositive('extrude', opts.extrude, true);
  validateEnum('algorithm', opts.algorithm, VALID_ALGORITHMS);
  validateEnum('trim', opts.trim, VALID_TRIM);
  return {
    maxWidth,
    maxHeight,
    borderPadding: padding,
    shapePadding: padding,
    innerPadding: 0,
    allowRotation: Boolean(opts.rotate),
    powerOfTwo: Boolean(opts.pot),
    forceSquare: false,
    sizeMode: 'max',
    sizeConstraint: opts.pot ? 'pot' : 'any',
    packMode: 'good',
    algorithm: opts.algorithm,
    trimAlpha: opts.trim !== 'none',
    trimThreshold: 1,
    trimMode: opts.trim,
    polygonTolerance: 2,
    extrude,
    multipack: Boolean(opts.multipack),
    multipackMode: 'auto',
  };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function extFor(format) {
  if (format === 'jpg') return 'jpg';
  if (format === 'png-8') return 'png';
  return format;
}

function suffixForScale(scale) {
  if (scale === 1) return '';
  if (scale === 2) return '@2x';
  if (scale === 0.5) return '@0.5x';
  return `@${scale}x`;
}

function sheetIndexLabel(idx0, totalSheets) {
  if (totalSheets <= 1) return '';
  const i = idx0 + 1;
  return totalSheets >= 10 ? String(i).padStart(2, '0') : String(i);
}

// Reproduces src/lib/publish.ts::scalePackSheet for the CLI (pure math).
function scalePackSheet(sheet, scale) {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new CliError(`Scale must be a positive finite number (got ${scale}).`, EXIT.ARGS);
  }
  const coord = (v) => Math.round(v * scale);
  const dim = (v) => Math.max(1, coord(v));
  return {
    ...sheet,
    width: dim(sheet.width),
    height: dim(sheet.height),
    packed: sheet.packed.map((item) => ({
      ...item,
      x: coord(item.x),
      y: coord(item.y),
      width: dim(item.width),
      height: dim(item.height),
      sourceSize: { w: dim(item.sourceSize.w), h: dim(item.sourceSize.h) },
      spriteSourceSize: {
        x: coord(item.spriteSourceSize.x),
        y: coord(item.spriteSourceSize.y),
        w: dim(item.spriteSourceSize.w),
        h: dim(item.spriteSourceSize.h),
      },
      extrudePadding: item.extrudePadding === undefined ? undefined : coord(item.extrudePadding),
      polygon: item.polygon?.map(coord),
      mesh: item.mesh
        ? {
            vertices: item.mesh.vertices.map(coord),
            triangles: item.mesh.triangles.slice(),
            uvs: item.mesh.uvs.slice(),
          }
        : undefined,
      normalMapFrame: item.normalMapFrame
        ? {
            x: coord(item.normalMapFrame.x),
            y: coord(item.normalMapFrame.y),
            w: dim(item.normalMapFrame.w),
            h: dim(item.normalMapFrame.h),
          }
        : undefined,
      normalMapImage: item.normalMapImage,
    })),
  };
}

async function encodeSheet(canvas, imageFormat, core) {
  if (imageFormat === 'png-8') {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = img.data instanceof Uint8Array
      ? img.data
      : new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    const png = await core.encodePng8Pixels(src, canvas.width, canvas.height, { maxColors: 256 });
    return Buffer.from(png);
  }
  if (imageFormat === 'jpg') return canvas.toBuffer('image/jpeg', 90);
  if (imageFormat === 'webp') return canvas.toBuffer('image/webp', 90);
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function printHelp() {
  process.stdout.write(`wtp — Web TexturePacker CLI

USAGE
  wtp pack <input-dir> [options]
  wtp project <file.wtp.json | file.tps> [--override key=value ...]
  wtp version
  wtp help

PACK OPTIONS
  --out <dir>              output directory (default: ./output)
  --name <basename>        output file base name (default: spritesheet)
  --format <fmt>           export format (default: json)
  --image-format <fmt>     png | png-8 | jpg | webp (default: png)
  --max-width <n>          atlas max width in px (default: 2048)
  --max-height <n>         atlas max height in px (default: 2048)
  --padding <n>            border + shape padding in px (default: 2)
  --extrude <n>            extrude halo in px (default: 0)
  --rotate                 allow 90° rotation (default: off)
  --pot                    force power-of-two atlas size
  --trim <mode>            none | trim | crop-keep-position | crop-flush | polygon-outline
  --multipack              spill sprites into extra sheets when they overflow
  --algorithm <alg>        maxrects-bssf | maxrects-blsf | maxrects-baf |
                           maxrects-bl | maxrects-cp | maxrects-best | shelf
  --scale <n>              scale variant, repeat for multiples (default: 1)
  --json                   emit a machine-readable JSON summary to stdout
  -v, --verbose            progress messages on stderr
  --force                  proceed even when Smart Update reports no change
  -h, --help               show this help

EXIT CODES
  0  success
  1  runtime / IO / packing error
  2  invalid argument or option
`);
}

async function commandPack(argv, cliMeta) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: PACK_OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new CliError((error instanceof Error ? error.message : String(error)), EXIT.ARGS);
  }
  if (parsed.values.help) {
    printHelp();
    return { ok: true, quiet: true };
  }
  const positional = parsed.positionals;
  if (positional.length !== 1) {
    throw new CliError('`wtp pack` requires exactly one <input-dir> positional.', EXIT.ARGS);
  }
  const inputDir = resolve(positional[0]);
  const info = await stat(inputDir).catch(() => null);
  if (!info || !info.isDirectory()) {
    throw new CliError(`Input directory "${positional[0]}" does not exist or is not a directory.`, EXIT.ARGS);
  }
  validateEnum('image-format', parsed.values['image-format'], VALID_IMAGE_FORMATS);

  const outDir = resolve(parsed.values.out);
  const name = parsed.values.name;
  const format = parsed.values.format;
  const imageFormat = parsed.values['image-format'];
  const scales = parseScaleList(parsed.values.scale);
  const verbose = Boolean(parsed.values.verbose);
  const emitJson = Boolean(parsed.values.json);

  const packerOptions = buildPackerOptions(parsed.values);
  const nodeCanvas = await loadNodeCanvas();
  const factory = makeNodeCanvasFactory(nodeCanvas);
  const core = cliMeta.core;

  const items = await loadImageItems(inputDir, nodeCanvas);
  if (verbose) process.stderr.write(`[wtp] loaded ${items.length} sprite(s) from ${inputDir}\n`);
  if (items.length === 0) {
    throw new CliError(`No supported images found under "${inputDir}". Supported: ${[...IMAGE_EXTS].join(', ')}.`, EXIT.RUNTIME);
  }

  const formatDef = core.getFormat(format);
  if (!formatDef) {
    throw new CliError(`Unknown --format "${format}". Try one of: ${core.ALL_EXPORT_FORMATS.join(', ')}.`, EXIT.ARGS);
  }

  const packResult = core.packIntoSheets(
    items,
    packerOptions,
    (item, opts) => core.prepareSpriteForAtlasCore(item, opts, factory),
  );

  if (packResult.sheets.length === 0) {
    throw new CliError('Packer produced no sheets. Check the input images.', EXIT.RUNTIME);
  }
  if (packResult.failed.length > 0 && !packerOptions.multipack) {
    const names = packResult.failed.slice(0, 3).map((f) => `"${f.name}"`).join(', ');
    process.stderr.write(
      `[wtp] Warning: ${packResult.failed.length} sprite(s) did not fit (e.g. ${names}). Enable --multipack or raise --max-width/--max-height.\n`,
    );
  }

  await mkdir(outDir, { recursive: true });
  const imageExt = extFor(imageFormat);
  const dataExt = formatDef.extension;

  const producedSheets = [];
  const producedDataFiles = [];

  for (const scale of scales) {
    const suffix = suffixForScale(scale);
    const scaleTag = scale === 1 ? '' : suffix;
    const isSingleSheet = packResult.sheets.length <= 1;

    const imageNames = packResult.sheets.map((_, i) => {
      const label = sheetIndexLabel(i, packResult.sheets.length);
      const sheetPart = isSingleSheet ? '' : `-${label}`;
      return `${name}${sheetPart}${scaleTag}.${imageExt}`;
    });

    for (let i = 0; i < packResult.sheets.length; i++) {
      const scaledSheet = scalePackSheet(packResult.sheets[i], scale);
      const canvas = core.renderSheetCore(scaledSheet, factory, {
        scalingAlgorithm: 'bilinear',
        layer: 'color',
      });
      const buffer = await encodeSheet(canvas, imageFormat, core);
      const imagePath = join(outDir, imageNames[i]);
      await writeFile(imagePath, buffer);
      producedSheets.push({
        path: imagePath,
        width: scaledSheet.width,
        height: scaledSheet.height,
        spriteCount: scaledSheet.packed.length,
        scale,
      });
      if (verbose) process.stderr.write(`[wtp] wrote ${imagePath}\n`);

      const label = sheetIndexLabel(i, packResult.sheets.length);
      const sheetPart = isSingleSheet ? '' : `-${label}`;
      const dataName = `${name}${sheetPart}${scaleTag}.${dataExt}`;
      const dataStr = formatDef.generate(scaledSheet, {
        fileName: name,
        imageFileName: (sheetIndex) => imageNames[sheetIndex] ?? imageNames[i],
        dataFileName: dataName,
        scale,
      });
      const dataPath = join(outDir, dataName);
      await writeFile(dataPath, dataStr);
      producedDataFiles.push({ path: dataPath, format });
      if (verbose) process.stderr.write(`[wtp] wrote ${dataPath}\n`);
    }
  }

  const summary = {
    ok: true,
    inputDir,
    outputDir: outDir,
    format,
    imageFormat,
    sprites: items.length,
    sheets: producedSheets,
    dataFiles: producedDataFiles,
    failed: packResult.failed.map((f) => ({ id: f.id, name: f.name })),
  };
  if (emitJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(
      `Packed ${items.length} sprite(s) into ${producedSheets.length} sheet(s) at ${outDir}\n`,
    );
    for (const s of producedSheets) {
      process.stdout.write(`  ${basename(s.path)}  ${s.width}x${s.height}  (${s.spriteCount} sprite${s.spriteCount === 1 ? '' : 's'})\n`);
    }
    if (packResult.failed.length > 0) {
      process.stdout.write(`  ${packResult.failed.length} sprite(s) unplaced\n`);
    }
  }
  return { ok: true, summary };
}

async function commandProject(argv) {
  // Project loading is intentionally minimal for the first CLI landing:
  // detect .wtp.json vs .tps and refuse the latter until the parser lands
  // in a shared location. Overrides are captured but not yet applied.
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        override: { type: 'string', multiple: true },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw new CliError((error instanceof Error ? error.message : String(error)), EXIT.ARGS);
  }
  if (parsed.values.help) {
    printHelp();
    return { ok: true, quiet: true };
  }
  if (parsed.positionals.length !== 1) {
    throw new CliError('`wtp project` requires exactly one project file path.', EXIT.ARGS);
  }
  const file = resolve(parsed.positionals[0]);
  const info = await stat(file).catch(() => null);
  if (!info || !info.isFile()) {
    throw new CliError(`Project file "${parsed.positionals[0]}" not found.`, EXIT.ARGS);
  }
  const lower = file.toLowerCase();
  if (!lower.endsWith('.wtp.json') && !lower.endsWith('.tps')) {
    throw new CliError('Project file must have a .wtp.json or .tps extension.', EXIT.ARGS);
  }
  throw new CliError(
    '`wtp project` is not yet wired to the shared project loader; use `wtp pack` for now.',
    EXIT.RUNTIME,
  );
}

async function commandVersion() {
  process.stdout.write(`${PKG_JSON.version}\n`);
  return { ok: true, quiet: true };
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(argv) {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
    printHelp();
    return EXIT.OK;
  }
  const [cmd, ...rest] = argv;
  const meta = {};
  if (cmd === 'version' || cmd === '--version' || cmd === '-V') {
    await commandVersion();
    return EXIT.OK;
  }
  meta.core = await loadCore();
  if (cmd === 'pack') {
    await commandPack(rest, meta);
    return EXIT.OK;
  }
  if (cmd === 'project') {
    await commandProject(rest);
    return EXIT.OK;
  }
  throw new CliError(`Unknown command "${cmd}". Run \`wtp help\` for usage.`, EXIT.ARGS);
}

try {
  const code = await main(process.argv.slice(2));
  process.exit(code);
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`wtp: ${error.message}\n`);
    process.exit(error.code);
  }
  process.stderr.write(`wtp: unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(EXIT.RUNTIME);
}
