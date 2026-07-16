import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import ts from 'typescript';

const sourcePath = new URL('../src/lib/packer.worker.ts', import.meta.url);
const outputPath = new URL('../public/packer.worker.js', import.meta.url);

export async function buildWorkerArtifact() {
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      lib: ['ES2020', 'WebWorker'],
      removeComments: false,
    },
    fileName: 'packer.worker.ts',
  }).outputText;
  const withoutLegacyHeader = transpiled.replace(
    /^\/\/ Web Worker module loaded via:[\s\S]*?(?=const HEURISTICS_FOR_BEST)/,
    '',
  );
  return [
    '// Generated from src/lib/packer.worker.ts — do not edit by hand.',
    '// Regenerate: node scripts/build-packer-worker.mjs',
    "// Browser entry: new Worker('/packer.worker.js', { type: 'module' })",
    withoutLegacyHeader,
  ].join('\n');
}

const expected = await buildWorkerArtifact();
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== expected) {
    console.error('public/packer.worker.js is stale; run node scripts/build-packer-worker.mjs');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, expected);
}
