import type { Context, Scenes } from 'telegraf';

import type { User } from '../../core/entities/User.js';

/** Per-chat conversation state. Only the deposit flow needs it so far. */
export interface SessionData {
  awaitingDepositAmount?: boolean;
  pendingDepositAmount?: string;
  awaitingReceipt?: boolean;
}

export interface BotContext extends Context {
  session: SessionData;
  /** Populated by the auth middleware on every update from a known user. */
  user?: User;
  isAdmin: boolean;
}

export type { Scenes };
