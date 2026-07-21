/**
 * Normalises the raw brand logos in product_logos/ into web-ready assets:
 * one square, white-backed, 512x512 WebP per product, named by product slug.
 *
 * Every mark sits on white. Transparency was tried and reverted: several of
 * these logos are dark ink on white (Autodesk, NordVPN), and they disappear
 * against a dark Telegram theme with nothing behind them.
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
const PADDING = 40;

/** Squared RGB distance at which a pixel counts as background. */
const FULLY_BACKGROUND = 1_200;
/** Beyond this a pixel is kept opaque; between the two it fades, which keeps
 *  anti-aliased edges smooth instead of jagged. */
const EDGE_BACKGROUND = 5_000;

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

/**
 * Payment provider marks for the wallet screen. Optional: drop a source file
 * in with one of these names and re-run, and the wallet picks it up. The UI
 * hides the image if a file is absent, so a missing logo is not a broken page.
 */
const PAYMENT_LOGOS: Record<string, string[]> = {
  telebirr: ['telebirr.png', 'telebirr.jpeg', 'telebirr.jpg', 'telebirr.webp', 'telebirr.svg'],
  cbe: ['cbe.png', 'cbe.jpeg', 'cbe.jpg', 'cbe.webp', 'cbe.svg'],
};

function colourDistance(a: number[], b: number[]): number {
  return (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
}

/**
 * Erases the backdrop by flooding inwards from the edges.
 *
 * A plain "make every white pixel transparent" pass would punch holes through
 * the logos themselves — Canva's letter and Notion's page are both white. Only
 * background that is *reachable from the border* is removed, so enclosed white
 * survives.
 *
 * Returns a PNG buffer; a no-op if the image already has a transparent border.
 */
async function removeBackdrop(source: string): Promise<Buffer> {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const rgbAt = (index: number) => [data[index]!, data[index + 1]!, data[index + 2]!];

  // Sample the corners to learn what the backdrop is.
  const cornerOffsets = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    ((height - 1) * width + width - 1) * channels,
  ];

  // Already cut out: every corner is transparent.
  if (cornerOffsets.every((offset) => data[offset + 3]! === 0)) {
    return sharp(data, { raw: info }).png().toBuffer();
  }

  const corners = cornerOffsets.map(rgbAt);
  const reference = corners[0]!;
  const uniform = corners.every((corner) => colourDistance(corner, reference) <= 900);

  // A logo that bleeds to the edge has no backdrop to remove; leaving it alone
  // beats eating into the artwork.
  if (!uniform) return sharp(data, { raw: info }).png().toBuffer();

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;

    const pixel = y * width + x;
    if (visited[pixel]) return;

    const offset = pixel * channels;
    const distance = colourDistance(rgbAt(offset), reference);
    if (distance > EDGE_BACKGROUND) return;

    visited[pixel] = 1;
    stack.push(pixel);

    data[offset + 3] =
      distance <= FULLY_BACKGROUND
        ? 0
        : Math.round(((distance - FULLY_BACKGROUND) / (EDGE_BACKGROUND - FULLY_BACKGROUND)) * 255);
  };

  for (let x = 0; x < width; x += 1) {
    consider(x, 0);
    consider(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    consider(0, y);
    consider(width - 1, y);
  }

  while (stack.length > 0) {
    const pixel = stack.pop()!;
    const x = pixel % width;
    const y = (pixel - x) / width;

    consider(x - 1, y);
    consider(x + 1, y);
    consider(x, y - 1);
    consider(x, y + 1);
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const inner = SIZE - PADDING * 2;
let totalIn = 0;
let totalOut = 0;

// Payment logos are only built when their source is present.
const paymentSources = Object.entries(PAYMENT_LOGOS).reduce<Record<string, string>>(
  (found, [slug, candidates]) => {
    const match = candidates.find((candidate) => fs.existsSync(path.join(SOURCE_DIR, candidate)));
    if (match) found[slug] = match;
    return found;
  },
  {},
);

const jobs = [
  ...Object.entries(LOGOS).map(([slug, file]) => ({ slug, file })),
  ...Object.entries(paymentSources).map(([slug, file]) => ({ slug, file })),
];

for (const { slug, file } of jobs) {
  const source = path.join(SOURCE_DIR, file);
  if (!fs.existsSync(source)) {
    console.error(`❌ ${slug}: missing source ${source}`);
    continue;
  }

  const target = path.join(OUTPUT_DIR, `${slug}.webp`);
  const meta = await sharp(source).metadata();

  // removeBackdrop still runs first: it strips whatever backdrop a source
  // shipped with (Lovable's is cream), so flattening puts every mark on the
  // *same* white rather than each keeping its own.
  await sharp(await removeBackdrop(source))
    // With the backdrop gone, trimming evens out the margins so every mark
    // ends up at the same optical size.
    .trim({ threshold: 8 })
    .resize(inner, inner, { fit: 'contain', background: WHITE })
    .extend({ top: PADDING, bottom: PADDING, left: PADDING, right: PADDING, background: WHITE })
    .flatten({ background: '#ffffff' })
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

const built = jobs.length;
console.log(
  `\n${built} logos · ${(totalIn / 1024).toFixed(0)}KB → ${(totalOut / 1024).toFixed(0)}KB` +
    ` (${(100 - (totalOut / totalIn) * 100).toFixed(0)}% smaller)`,
);

// A product with no tile would render as a broken image in the web app.
const used = [...Object.values(LOGOS), ...Object.values(paymentSources)];
const unused = fs.readdirSync(SOURCE_DIR).filter((file) => !used.includes(file));
if (unused.length > 0) console.log(`\n⚠️  unused source files: ${unused.join(', ')}`);

const missingPayment = Object.keys(PAYMENT_LOGOS).filter((slug) => !paymentSources[slug]);
if (missingPayment.length > 0) {
  console.log(
    `\nℹ️  no source yet for: ${missingPayment.join(', ')}` +
      `\n   drop e.g. ${missingPayment[0]}.png into product_logos/ and re-run.`,
  );
}
