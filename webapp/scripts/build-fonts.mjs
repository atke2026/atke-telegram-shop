/**
 * Converts the SchriftedSans TTFs at the repo root into woff2 for the web.
 *
 * Only upright text weights ship: italics and the extreme weights are unused
 * by the UI, and every extra face is a font file the user waits for on a
 * mobile connection.
 *
 * Run: npm run fonts:build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compress } from 'wawoff2';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const SOURCE_DIR = path.join(REPO_ROOT, 'SchriftedSans');
const OUTPUT_DIR = path.join(REPO_ROOT, 'webapp/public/fonts');

/** file suffix → CSS font-weight */
const WEIGHTS = {
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let totalIn = 0;
let totalOut = 0;

for (const [suffix, weight] of Object.entries(WEIGHTS)) {
  const source = path.join(SOURCE_DIR, `SchriftedSans-${suffix}.ttf`);
  if (!fs.existsSync(source)) {
    console.error(`❌ missing ${source}`);
    continue;
  }

  const ttf = fs.readFileSync(source);
  const woff2 = Buffer.from(await compress(ttf));
  const target = path.join(OUTPUT_DIR, `SchriftedSans-${suffix}.woff2`);
  fs.writeFileSync(target, woff2);

  totalIn += ttf.length;
  totalOut += woff2.length;
  console.log(
    `✅ ${suffix.padEnd(9)} weight ${weight}  ${(ttf.length / 1024).toFixed(0)}KB → ${(woff2.length / 1024).toFixed(0)}KB`,
  );
}

console.log(
  `\n${Object.keys(WEIGHTS).length} faces · ${(totalIn / 1024).toFixed(0)}KB → ${(totalOut / 1024).toFixed(0)}KB` +
    ` (${(100 - (totalOut / totalIn) * 100).toFixed(0)}% smaller)`,
);
