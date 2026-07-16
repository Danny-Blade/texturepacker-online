import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('browser worker artifact', () => {
  it('is regenerated from the canonical TypeScript worker without drift', () => {
    expect(() => {
      execFileSync(process.execPath, ['scripts/build-packer-worker.mjs', '--check'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }).not.toThrow();
  });
});
