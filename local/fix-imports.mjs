// Post-build script: add .js extensions to bare relative imports in dist/src/ files
// These come from the root src/ compiled with moduleResolution=bundler (Cloudflare Workers target)
// but need explicit .js for Node.js ESM resolution.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function walk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (entry.endsWith('.js')) {
      fixImports(full);
    }
  }
}

function fixImports(filePath) {
  let src = readFileSync(filePath, 'utf-8');
  // Add .js to relative imports/exports that lack an extension
  const fixed = src.replace(
    /((?:import|export)\s+(?:.*?\s+from\s+)?['"])(\.\.?\/[^'"]+?)(?<!\.js)(?<!\.mjs)(?<!\.cjs)(['"])/g,
    '$1$2.js$3'
  );
  if (fixed !== src) {
    writeFileSync(filePath, fixed, 'utf-8');
    console.log(`Fixed imports in: ${filePath}`);
  }
}

const distDir = join(__dirname, 'dist');
walk(distDir);
console.log('Import fix complete.');
