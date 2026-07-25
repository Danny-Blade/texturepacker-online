import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import ts from 'typescript';

const png8Path = new URL('../src/lib/png8.ts', import.meta.url);
const workerPath = new URL('../src/lib/png8.worker.ts', import.meta.url);
const outputPath = new URL('../public/png8.worker.js', import.meta.url);

// png8.worker.ts imports named exports from ./png8. The worker artifact must
// be self-contained, so we naively bundle the two files by stripping the local
// import statement and concatenating the sources before transpiling.
const LOCAL_IMPORT = /^import\s*(?:type\s+)?\{[^}]*\}\s*from\s*['"]\.\/png8['"];?\s*$/gm;

export async function buildPng8WorkerArtifact() {
  const png8Source = await readFile(png8Path, 'utf8');
  const workerSource = await readFile(workerPath, 'utf8');
  const strippedWorker = workerSource.replace(LOCAL_IMPORT, '');
  const combined = `${png8Source}\n${strippedWorker}`;
  const transpiled = ts.transpileModule(combined, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      lib: ['ES2020', 'WebWorker'],
      removeComments: false,
    },
    fileName: 'png8.worker.ts',
  }).outputText;
  return [
    '// Generated from src/lib/png8.ts + src/lib/png8.worker.ts — do not edit by hand.',
    '// Regenerate: node scripts/build-png8-worker.mjs',
    "// Browser entry: new Worker('/png8.worker.js', { type: 'module' })",
    transpiled,
  ].join('\n');
}

const expected = await buildPng8WorkerArtifact();
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== expected) {
    console.error('public/png8.worker.js is stale; run node scripts/build-png8-worker.mjs');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, expected);
}
