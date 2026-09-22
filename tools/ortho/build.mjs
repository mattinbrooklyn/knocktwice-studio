/* Render a spec to one combined sheet plus a file per view. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { renderSheet, renderSingle, VIEW_NAMES } from './ortho.js';

const specPath = process.argv[2];
const outDir = process.argv[3] || 'out';
if (!specPath) { console.error('usage: node build.mjs <spec.json> [outDir]'); process.exit(1); }

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const stem = basename(specPath).replace(/\.json$/, '');
mkdirSync(outDir, { recursive: true });

const write = (name, svg) => {
  const p = join(outDir, name);
  writeFileSync(p, svg);
  const cm = svg.match(/width="([\d.]+)cm"/)[1];
  console.log(`  ${name.padEnd(34)} ${cm}cm wide`);
};

console.log(`\n${spec.meta.name}`);
console.log(`overall ${spec.overall.width}W x ${spec.overall.depth}D x ${spec.overall.height}H in\n`);
write(`${stem}-sheet.svg`, renderSheet(spec));
for (const v of VIEW_NAMES) write(`${stem}-${v}.svg`, renderSingle(spec, v));
console.log('');
