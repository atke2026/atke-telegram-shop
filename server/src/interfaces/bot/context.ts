import type { Context, Scenes } from 'telegraf';

import type { User } from '../../core/entities/User.js';

/** Per-chat conversation state. */
export interface SessionData {
  // Admin "set maintenance image & message" flow.
  awaitingMaintenanceImage?: boolean;
  awaitingMaintenanceMessage?: boolean;
  /**
   * Carries the image decision between the two edit steps:
   *   absent  → keep the current image
   *   ''      → remove the image
   *   file_id → set this new image
   */
  pendingMaintenanceImage?: string;
}

export interface BotContext extends Context {
  session: SessionData;
  /** Populated by the auth middleware on every update from a known user. */
  user?: User;
  isAdmin: boolean;
}

export type { Scenes };
