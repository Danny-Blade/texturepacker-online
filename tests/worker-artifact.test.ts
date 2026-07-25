import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('browser worker artifacts', () => {
  it('regenerates the packer worker from its canonical TypeScript source without drift', () => {
    expect(() => {
      execFileSync(process.execPath, ['scripts/build-packer-worker.mjs', '--check'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  it('regenerates the png8 worker from its canonical TypeScript source without drift', () => {
    expect(() => {
      execFileSync(process.execPath, ['scripts/build-png8-worker.mjs', '--check'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }).not.toThrow();
  });
});
