/**
 * Normalises the raw brand logos in product_logos/ into web-ready assets:
 * one square, white-backed, 512x512 WebP per product, named by product slug.
 *
 * Sources are left untouched. Run: npx tsx scripts/build-logos.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

// Logos live at the repo root, not inside server/, because the web app will
// consume them too. Resolved from this file so the cwd does not matter.
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const SOURCE_DIR = path.join(REPO_ROOT, 'product_logos');
const OUTPUT_DIR = path.join(REPO_ROOT, 'assets/logos');
const SIZE = 512;
/** Breathing room so logos don't touch the tile edge in a card layout. */
const PADDING = 48;

/**
 * Product slug → source file. Both Lovable products share one brand mark.
 * Keyed by slug so the web app can resolve an image with no lookup table.
 */
const LOGOS: Record<string, string> = {
  'canva-single': 'canva.jpeg',
  'google-ai-pro-12m': 'gemini.jpeg',
  'coursera-plus-12m': 'coursera.png',
  'quillbot-premium': 'quillbot.webp',
  'nord-vpn': 'nord.png',
  'notion-business-12m': 'notion.png',
  'autodesk-panel': 'autodesk admin.jpeg',
  'lovable-unlimited-extension-lifetime': 'lovable.png',
  'lovable-extension-admin-panel-lifetime': 'lovable.png',
};

/** Squared RGB distance — cheap enough per pixel and good enough for flat fills. */
function colourDistance(a: number[], b: number[]): number {
  return (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
}

/**
 * Repaints a logo's own off-white backdrop to pure white.
 *
 * Lovable's mark ships on cream (247,244,237). `trim` cannot remove it: the
 * corners are partially transparent, so the border is not uniform and trim
 * gives up. Detected by sampling the four corners — if they agree, are light,
 * but are not already white, every pixel near that colour is set to white.
 * Images that already sit on white fail the check and pass through untouched.
 */
async function normaliseBackdrop(source: string): Promise<Buffer> {
  const { data, info } = await sharp(source)
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const at = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };

  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const [reference] = corners as [number[]];

  const uniform = corners.every((corner) => colourDistance(corner, reference) <= 64);
  const light = reference.every((channel) => channel >= 200);
  const alreadyWhite = reference.every((channel) => channel >= 250);

  if (!uniform || !light || alreadyWhite) {
    return sharp(data, { raw: info }).png().toBuffer();
  }

  for (let i = 0; i < data.length; i += channels) {
    if (colourDistance([data[i]!, data[i + 1]!, data[i + 2]!], reference) <= 576) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const inner = SIZE - PADDING * 2;
let totalIn = 0;
let totalOut = 0;

for (const [slug, file] of Object.entries(LOGOS)) {
  const source = path.join(SOURCE_DIR, file);
  if (!fs.existsSync(source)) {
    console.error(`❌ ${slug}: missing source ${source}`);
    continue;
  }

  const target = path.join(OUTPUT_DIR, `${slug}.webp`);
  const meta = await sharp(source).metadata();

  await sharp(await normaliseBackdrop(source))
    // With every backdrop now white, trimming evens out the margins so the
    // marks end up at the same optical size across the set.
    .trim({ threshold: 12 })
    // `contain` keeps the whole mark visible; transparent PNGs get the same
    // white field as the opaque JPEGs so every tile matches.
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: '#ffffff' })
    .extend({
      top: PADDING,
      bottom: PADDING,
      left: PADDING,
      right: PADDING,
      background: '#ffffff',
    })
    .webp({ quality: 90, effort: 6 })
    .toFile(target);

  const inSize = fs.statSync(source).size;
  const outSize = fs.statSync(target).size;
  totalIn += inSize;
  totalOut += outSize;

  console.log(
    `✅ ${slug}.webp`.padEnd(46) +
      `${meta.width}x${meta.height} ${meta.format} ${(inSize / 1024).toFixed(0)}KB` +
      ` → ${SIZE}x${SIZE} webp ${(outSize / 1024).toFixed(0)}KB`,
  );
}

console.log(
  `\n${Object.keys(LOGOS).length} logos · ${(totalIn / 1024).toFixed(0)}KB → ${(totalOut / 1024).toFixed(0)}KB` +
    ` (${(100 - (totalOut / totalIn) * 100).toFixed(0)}% smaller)`,
);

// A product with no tile would render as a broken image in the web app.
const unused = fs
  .readdirSync(SOURCE_DIR)
  .filter((file) => !Object.values(LOGOS).includes(file));
if (unused.length > 0) console.log(`\n⚠️  unused source files: ${unused.join(', ')}`);
