import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { UnsupportedImageError } from './ReceiptStorage.js';

/**
 * Product logos uploaded from the admin panel.
 *
 * Written into the same directory the repo ships (`assets/logos`) and under
 * the same `<slug>.webp` naming rule, so an uploaded logo is indistinguishable
 * from a built one and the client still needs no lookup table.
 *
 * Legacy product artwork can still be retained for order history, so this is
 * the only way to give one a logo without a redeploy.
 */

/** Matches the tile the cards render, and what scripts/build-logos.ts produces. */
const SIZE = 512;
/** Breathing room so a logo does not touch the edge of its tile. */
const PADDING = 40;
const QUALITY = 90;

/** Slugs come from the database, but this is the last gate before a filename. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Small enough to be quick, large enough for the statistics to mean anything. */
const ANALYSIS_SIZE = 128;
/** Below this alpha a pixel is backdrop, not artwork. */
const TRANSPARENT_ALPHA = 16;
/** Fraction of the image that must be see-through before alpha is worth keeping. */
const MIN_TRANSPARENCY = 0.05;
/** Rec. 709 luma below which a pixel is ink that a dark theme would swallow. */
const DARK_INK = 72;
/** How far a dark pixel looks for a hole; a couple of pixels at ANALYSIS_SIZE. */
const EXPOSURE_RADIUS = 2;
/** Share of exposed dark ink a mark may have and still lose its white plate. */
const MAX_EXPOSED_DARK = 0.04;

/** What the caller asked for; `auto` lets the measurement below decide. */
export type LogoBackground = 'auto' | 'transparent' | 'white';

export interface PreparedLogo {
  webp: Buffer;
  /** True when the alpha channel was kept, so the tile shows through. */
  transparent: boolean;
}

interface Artwork {
  /** Share of the image that is see-through. */
  transparency: number;
  /** Share of the mark that is dark ink sitting directly against a hole. */
  exposedDark: number;
}

/**
 * Measures whether a cut-out mark would survive a dark background.
 *
 * The question is not "is this logo dark" — a black glyph inside its own white
 * badge (Notion) is perfectly readable with no backdrop at all. What actually
 * disappears is dark ink with *nothing behind it*: the black AUTODESK wordmark,
 * the black NordVPN lettering. So a dark pixel only counts against the logo
 * when a transparent pixel sits within a couple of pixels of it.
 *
 * On the shop's own eleven logos that separates cleanly — the two that vanish
 * score 0.15 and 0.30, everything that reads scores under 0.02.
 *
 * Done on a thumbnail: a 5MB upload decoded raw at full size is tens of
 * megabytes for statistics that a 128px sample answers just as well.
 */
async function describeArtwork(buffer: Buffer): Promise<Artwork> {
  const { data, info } = await sharp(buffer)
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const offsetAt = (x: number, y: number) => (y * width + x) * channels;
  const isHole = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height || data[offsetAt(x, y) + 3]! < TRANSPARENT_ALPHA;

  let seeThrough = 0;
  let visible = 0;
  let exposed = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = offsetAt(x, y);
      if (data[offset + 3]! < TRANSPARENT_ALPHA) {
        seeThrough += 1;
        continue;
      }

      visible += 1;
      const luma = 0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!;
      if (luma >= DARK_INK) continue;

      for (let dy = -EXPOSURE_RADIUS; dy <= EXPOSURE_RADIUS; dy += 1) {
        for (let dx = -EXPOSURE_RADIUS; dx <= EXPOSURE_RADIUS; dx += 1) {
          if (isHole(x + dx, y + dy)) {
            exposed += 1;
            dy = EXPOSURE_RADIUS;
            break;
          }
        }
      }
    }
  }

  const total = seeThrough + visible;

  return {
    transparency: total === 0 ? 0 : seeThrough / total,
    exposedDark: visible === 0 ? 0 : exposed / visible,
  };
}

/**
 * Normalises artwork to the square 512px webp tile every surface expects, and
 * decides whether it keeps its transparency.
 *
 * On `auto`, transparency is kept when the upload actually has some and the
 * mark would still read on a dark theme. Anything else is put back on a white
 * plate, which is what the shop did for every logo before this — so the
 * operator uploads a PNG and gets the right answer either way: a cut-out mark
 * blends into the card, and dark ink keeps the white it needs.
 *
 * The judgement is a measurement, not a certainty, so the caller can overrule
 * it outright. That matters for artwork this has never seen: getting it wrong
 * silently would leave a logo invisible on half the phones out there.
 */
export async function prepareLogo(
  buffer: Buffer,
  choice: LogoBackground = 'auto',
): Promise<PreparedLogo> {
  let transparent = choice === 'transparent';

  if (choice === 'auto') {
    const artwork = await describeArtwork(buffer);
    transparent =
      artwork.transparency >= MIN_TRANSPARENCY && artwork.exposedDark <= MAX_EXPOSED_DARK;
  }

  const background = transparent ? TRANSPARENT : WHITE;
  const inner = SIZE - PADDING * 2;

  let pipeline = sharp(buffer)
    .resize(inner, inner, { fit: 'contain', background })
    .extend({ top: PADDING, bottom: PADDING, left: PADDING, right: PADDING, background });

  // Only when the alpha is being discarded anyway: flattening a mark we mean
  // to keep see-through would undo the whole point.
  if (!transparent) pipeline = pipeline.flatten({ background: '#ffffff' });

  const webp = await pipeline
    // alphaQuality 100 keeps cut-out edges clean; without it the webp encoder
    // softens them and the mark gets a faint halo on a dark card.
    .webp({ quality: QUALITY, ...(transparent ? { alphaQuality: 100 } : {}) })
    .toBuffer();

  return { webp, transparent };
}

export class LogoStorage {
  constructor(private readonly rootDir: string) {}

  /**
   * Reads the storefront artwork as a Telegram-safe JPEG. Some product tiles
   * are transparent WebP files; flattening them onto white avoids Telegram
   * treating them as documents or rejecting an unsupported photo payload.
   */
  async read(slug: string): Promise<Buffer | null> {
    if (!SAFE_SLUG.test(slug)) return null;

    try {
      const webp = await fs.readFile(path.join(this.rootDir, `${slug}.webp`));
      return await sharp(webp).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /**
   * Normalises an uploaded image to the square webp tile and replaces the
   * product's logo, keeping its transparency where that still reads on a dark
   * theme. Returns the public path the client already expects, and which way
   * the backdrop went so the panel can say so.
   */
  async save(
    slug: string,
    buffer: Buffer,
    background: LogoBackground = 'auto',
  ): Promise<{ path: string; transparent: boolean }> {
    if (!SAFE_SLUG.test(slug)) throw new UnsupportedImageError();

    let prepared: PreparedLogo;
    try {
      prepared = await prepareLogo(buffer, background);
    } catch {
      // sharp rejects anything that is not a decodable image, which is the
      // check — a renamed executable never reaches the disk.
      throw new UnsupportedImageError();
    }

    await fs.mkdir(this.rootDir, { recursive: true });

    // Written beside the target and renamed: a half-flushed file would
    // otherwise be served as a corrupt logo while the write is in flight.
    const target = path.join(this.rootDir, `${slug}.webp`);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, prepared.webp);
    await fs.rename(temporary, target);

    return { path: `/logos/${slug}.webp`, transparent: prepared.transparent };
  }
}
