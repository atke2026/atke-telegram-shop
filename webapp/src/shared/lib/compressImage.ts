/**
 * Shrinks a photo before it is uploaded.
 *
 * Phone cameras produce 4–12MB images, and base64 inflates that by a third
 * again — a slow upload on Ethiopian mobile data and a large request body for
 * something that only has to be legible enough to read an amount and a
 * reference number off a receipt.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface CompressedImage {
  /** data: URL, ready to POST. */
  dataUrl: string;
  originalBytes: number;
  compressedBytes: number;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('unreadable image'));
    image.src = dataUrl;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('unreadable file'));
    reader.readAsDataURL(file);
  });
}

/** Rough byte count of a data: URL payload without materialising a Blob. */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;

  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const original = await readAsDataUrl(file);
  const originalBytes = file.size;

  try {
    const image = await loadImage(original);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext('2d');
    if (!context) return { dataUrl: original, originalBytes, compressedBytes: originalBytes };

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // JPEG rather than WebP: Telegram's in-app browsers are varied, and every
    // one of them can encode JPEG.
    const compressed = canvas.toDataURL('image/jpeg', QUALITY);

    // A tiny screenshot can come out larger after re-encoding; keep the smaller.
    const compressedBytes = dataUrlBytes(compressed);
    if (compressedBytes >= originalBytes) {
      return { dataUrl: original, originalBytes, compressedBytes: originalBytes };
    }

    return { dataUrl: compressed, originalBytes, compressedBytes };
  } catch {
    // A format the browser cannot decode still uploads, just uncompressed.
    return { dataUrl: original, originalBytes, compressedBytes: originalBytes };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
