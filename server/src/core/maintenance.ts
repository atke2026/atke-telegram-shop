import { CONFIG_KEYS } from './constants.js';
import type { ConfigRepository } from './ports/repositories.js';

/**
 * Maintenance mode. When enabled, both the bot and the web app show the
 * operator's notice to everyone except admins, who keep full access so they
 * can turn it back off. The image is a Telegram file_id — the same handle the
 * deposit receipts use — resolved to a real URL on demand for the web app.
 */
export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  imageFileId: string | null;
}

/** Shown when maintenance is on but no custom message has been set. */
export const DEFAULT_MAINTENANCE_MESSAGE =
  '🛠 We are briefly down for maintenance and will be back shortly. Thank you for your patience!';

const OFF: MaintenanceState = { enabled: false, message: null, imageFileId: null };

export async function getMaintenance(config: ConfigRepository): Promise<MaintenanceState> {
  const raw = await config.get(CONFIG_KEYS.maintenance);
  if (!raw) return OFF;

  try {
    const parsed = JSON.parse(raw) as Partial<MaintenanceState>;
    return {
      enabled: parsed.enabled === true,
      message: typeof parsed.message === 'string' && parsed.message ? parsed.message : null,
      imageFileId:
        typeof parsed.imageFileId === 'string' && parsed.imageFileId ? parsed.imageFileId : null,
    };
  } catch {
    // A corrupt blob must never leave the store stuck in maintenance.
    return OFF;
  }
}

/**
 * Public URL for the notice image, or null when none is set. The `v` query
 * changes whenever the image does, so a new image is never masked by a cached
 * copy of the old one at the otherwise-static path.
 */
export function maintenanceImageUrl(state: MaintenanceState): string | null {
  if (!state.imageFileId) return null;
  const version = state.imageFileId.slice(-10).replace(/[^a-zA-Z0-9]/g, '');
  return `/api/maintenance/image?v=${version}`;
}

/** Merges the patch onto the current state and persists it, returning the result. */
export async function setMaintenance(
  config: ConfigRepository,
  patch: Partial<MaintenanceState>,
): Promise<MaintenanceState> {
  const current = await getMaintenance(config);
  const next: MaintenanceState = { ...current, ...patch };
  await config.set(CONFIG_KEYS.maintenance, JSON.stringify(next));
  return next;
}
