// Smoke tests for the Node CLI (bin/wtp.mjs, P3-02). The CLI is exercised via
// spawnSync so we cover the real end-to-end path: shared core, canvas factory,
// argument parsing and disk writes.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..');
const CLI = join(REPO_ROOT, 'bin', 'wtp.mjs');
const PACKAGE_VERSION = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version as string;

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

function makeTempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'wtp-cli-test-'));
}

/** Build a real PNG using @napi-rs/canvas — the same encoder the CLI relies on. */
async function writeSquarePng(destPath: string, size: number, color: string): Promise<void> {
  // Dynamically imported so vitest doesn't require the native module for
  // every unrelated suite.
  const canvasModule = (await import('@napi-rs/canvas')) as typeof import('@napi-rs/canvas');
  const canvas = canvasModule.createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  writeFileSync(destPath, canvas.toBuffer('image/png'));
}

describe('wtp CLI (P3-02)', () => {
  beforeAll(() => {
    // Guarantee dist/cli/ is present so `version` and `pack` don't have to
    // rebuild it inline for every test.
    const distMarker = join(REPO_ROOT, 'dist', 'cli', '.built');
    if (!existsSync(distMarker)) {
      const build = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'build-cli.mjs'), '--quiet'], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
      });
      if (build.status !== 0) {
        throw new Error(`Failed to build CLI dist: ${build.stderr}`);
      }
    }
  }, 60_000);

  it('reports the package version and exits 0', () => {
    const result = runCli(['version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(PACKAGE_VERSION);
  });

  it('prints usage when invoked with no args', () => {
    const result = runCli([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('USAGE');
    expect(result.stdout).toContain('wtp pack');
  });

  it('rejects unknown commands with exit code 2', () => {
    const result = runCli(['does-not-exist']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown command');
  });

  it('packs a directory of PNGs into a JSON atlas', async () => {
    const workspace = makeTempWorkspace();
    try {
      const spritesDir = join(workspace, 'sprites');
      const outDir = join(workspace, 'out');
      mkdirSync(spritesDir, { recursive: true });
      await writeSquarePng(join(spritesDir, 'red.png'), 16, 'rgb(200, 0, 0)');
      await writeSquarePng(join(spritesDir, 'blue.png'), 24, 'rgb(0, 0, 200)');

      const result = runCli([
        'pack',
        spritesDir,
        '--out', outDir,
        '--format', 'json',
        '--name', 'atlas',
        '--json',
      ]);

      expect(result.status, `stderr:\n${result.stderr}`).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.ok).toBe(true);
      expect(summary.sprites).toBe(2);
      expect(summary.sheets).toHaveLength(1);
      expect(summary.sheets[0].spriteCount).toBe(2);

      const files = readdirSync(outDir);
      expect(files).toContain('atlas.png');
      expect(files).toContain('atlas.json');

      const atlas = JSON.parse(readFileSync(join(outDir, 'atlas.json'), 'utf8'));
      expect(atlas.frames).toBeDefined();
      const frameNames = Object.keys(atlas.frames).sort();
      expect(frameNames).toEqual(['blue', 'red']);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);

  it('errors out with exit code 2 on an invalid --format', async () => {
    const workspace = makeTempWorkspace();
    try {
      const spritesDir = join(workspace, 'sprites');
      mkdirSync(spritesDir, { recursive: true });
      await writeSquarePng(join(spritesDir, 'a.png'), 8, 'rgb(0, 200, 0)');
      const result = runCli([
        'pack',
        spritesDir,
        '--out', join(workspace, 'out'),
        '--algorithm', 'not-a-real-algorithm',
      ]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('algorithm');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});
