// Compile the browser-agnostic core (src/core/**) + its lib dependencies to
// plain ESM JavaScript under `dist/cli/`, so `bin/wtp.mjs` can `import()` it
// from Node without any runtime transpilation.
//
// This is intentionally minimal — no bundling, no source maps, no watch. Just
// enough to make the CLI runnable straight from the repo (P3-02) and from a
// published package (via `prepack`).

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(projectRoot, 'src');
const outRoot = join(projectRoot, 'dist', 'cli');

// Only compile the modules the CLI reaches — nothing DOM/React/Next-shaped.
const includedDirs = [
  'core',
  'lib/formats',
];
const includedFiles = [
  'lib/packer.ts',
  'lib/polygonCollision.ts',
  'lib/triangulate.ts',
  'lib/normalMapPairing.ts',
  'lib/spriteMetadata.ts',
  'lib/png8.ts',
];

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) results.push(...walk(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.worker.ts')) {
      results.push(full);
    }
  }
  return results;
}

function collectSources() {
  const sources = new Set();
  for (const dir of includedDirs) {
    for (const file of walk(join(srcRoot, dir))) sources.add(file);
  }
  for (const file of includedFiles) sources.add(join(srcRoot, file));
  return [...sources];
}

function rewriteImports(source, tsPath) {
  // Rewrite bare relative imports to include a `.js` extension so the ESM
  // loader can resolve them. Directory imports (`../formats`) become
  // `../formats/index.js`. Package imports (no `.` prefix) are left alone.
  return source.replace(
    /(from\s+|import\s*\(\s*)(['"])(\.\.?\/[^'"]+?)\2/g,
    (match, prefix, quote, spec) => {
      if (spec.endsWith('.js') || spec.endsWith('.json')) return match;
      const abs = resolve(dirname(tsPath), spec);
      let target = `${spec}.js`;
      if (existsSync(abs + '.ts')) {
        target = `${spec}.js`;
      } else if (existsSync(abs) && statSync(abs).isDirectory()) {
        target = `${spec}/index.js`;
      }
      return `${prefix}${quote}${target}${quote}`;
    },
  );
}

function transpileOne(tsPath) {
  const source = readFileSync(tsPath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
      removeComments: false,
      importsNotUsedAsValues: 'remove',
    },
    fileName: tsPath,
  });
  if (result.diagnostics && result.diagnostics.length > 0) {
    for (const d of result.diagnostics) {
      console.warn(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    }
  }
  return rewriteImports(result.outputText, tsPath);
}

function outPathFor(tsPath) {
  const rel = relative(srcRoot, tsPath).replace(/\.ts$/, '.js');
  return join(outRoot, rel);
}

export async function buildCli() {
  const sources = collectSources();
  for (const src of sources) {
    const js = transpileOne(src);
    const dest = outPathFor(src);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, js);
  }
  // `dist/cli/` needs its own package.json so Node treats every emitted .js
  // as an ES module regardless of the parent package's `"type"` setting.
  writeFileSync(
    join(outRoot, 'package.json'),
    JSON.stringify({ type: 'module', private: true }, null, 2) + '\n',
  );
  // Marker file so `bin/wtp.mjs` can quickly tell whether a build already ran.
  writeFileSync(join(outRoot, '.built'), new Date().toISOString());
  return sources.length;
}

// Allow direct `node scripts/build-cli.mjs` invocation OR `import()` from bin/.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const count = await buildCli();
  if (!process.argv.includes('--quiet')) {
    console.log(`Compiled ${count} module(s) into ${outRoot}`);
  }
}

export function cliDistExists() {
  return existsSync(join(outRoot, '.built'));
}

export const cliDistRoot = outRoot;
