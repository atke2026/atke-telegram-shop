import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Keeps receipt images uploaded from the web app so an admin can look at one
 * when reviewing the deposit. Bot uploads are not stored here — Telegram
 * already holds those, addressed by file_id.
 *
 * A `Deposit.screenshotUrl` therefore holds one of two things, distinguished
 * by the prefix:
 *   file:2026/07/<uuid>.jpg   a receipt on this server's disk
 *   <anything else>           a Telegram file_id
 */

const STORED_PREFIX = 'file:';

/** Magic bytes, so a renamed .exe cannot be written to disk as a "receipt". */
const SIGNATURES: { ext: string; bytes: number[]; offset?: number }[] = [
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  { ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

export class UnsupportedImageError extends Error {
  constructor() {
    super('The uploaded file is not a supported image');
    this.name = 'UnsupportedImageError';
  }
}

export function isStoredReceipt(reference: string): boolean {
  return reference.startsWith(STORED_PREFIX);
}

function detectExtension(buffer: Buffer): string | null {
  for (const signature of SIGNATURES) {
    const offset = signature.offset ?? 0;
    if (signature.bytes.every((byte, index) => buffer[offset + index] === byte)) {
      return signature.ext;
    }
  }

  return null;
}

export class ReceiptStorage {
  constructor(private readonly rootDir: string) {}

  /** Returns the reference to persist on the deposit. */
  async save(buffer: Buffer): Promise<string> {
    const extension = detectExtension(buffer);
    if (!extension) throw new UnsupportedImageError();

    const now = new Date();
    // Foldered by month so a directory listing stays manageable for years.
    const relativeDir = path.join(
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
    );

    await fs.mkdir(path.join(this.rootDir, relativeDir), { recursive: true });

    const relativePath = path.join(relativeDir, `${randomUUID()}.${extension}`);
    await fs.writeFile(path.join(this.rootDir, relativePath), buffer, { mode: 0o600 });

    return `${STORED_PREFIX}${relativePath}`;
  }

  async read(reference: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!isStoredReceipt(reference)) return null;

    const relativePath = reference.slice(STORED_PREFIX.length);

    // The reference comes from our own database, but a traversal here would
    // read arbitrary server files, so confirm it stays inside the root.
    const absolute = path.resolve(this.rootDir, relativePath);
    if (!absolute.startsWith(path.resolve(this.rootDir) + path.sep)) return null;

    try {
      const buffer = await fs.readFile(absolute);
      const extension = path.extname(absolute).slice(1).toLowerCase();

      return {
        buffer,
        contentType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
      };
    } catch {
      return null;
    }
  }
}
