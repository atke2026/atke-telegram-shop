import type { Admin } from '../../core/entities/Admin.js';
import { DomainError } from '../../core/errors/DomainError.js';
import type { AdminRepository, UserRepository } from '../../core/ports/repositories.js';
import type { Logger } from '../../shared/logger.js';

export class NotAnAdminError extends DomainError {
  readonly code = 'NOT_AN_ADMIN';

  constructor() {
    super('This action requires administrator access');
  }
}

export class LastAdminError extends DomainError {
  readonly code = 'LAST_ADMIN';

  constructor() {
    super('Cannot remove the last administrator');
  }
}

export interface AdminWithProfile {
  admin: Admin;
  firstName: string | null;
  username: string | null;
}

/**
 * Administrator membership. Every check goes through `isAdmin`, which reads
 * the table — the caller's identity always comes from verified Telegram
 * initData, never from anything the client sends.
 */
export class ManageAdminsUseCase {
  constructor(
    private readonly deps: {
      admins: AdminRepository;
      users: UserRepository;
      logger: Logger;
    },
  ) {}

  isAdmin(telegramId: bigint): Promise<boolean> {
    return this.deps.admins.isAdmin(telegramId);
  }

  /**
   * Puts the environment's operators in the table, but only while it is empty.
   * Seeding on every boot would silently resurrect an admin someone had just
   * revoked; seeding only when empty still gives a way back in if the table is
   * ever wiped.
   */
  async seedIfEmpty(telegramIds: bigint[]): Promise<number> {
    if (telegramIds.length === 0) return 0;
    if ((await this.deps.admins.count()) > 0) return 0;

    for (const telegramId of telegramIds) {
      await this.deps.admins.add(telegramId, null, 'seeded from ADMIN_TELEGRAM_IDS');
    }

    this.deps.logger.info({ count: telegramIds.length }, 'Seeded administrators');
    return telegramIds.length;
  }

  /** Admins with their profile, when the user has ever used the bot. */
  async list(): Promise<AdminWithProfile[]> {
    const admins = await this.deps.admins.list();

    return Promise.all(
      admins.map(async (admin) => {
        const user = await this.deps.users.findByTelegramId(admin.telegramId);
        return {
          admin,
          firstName: user?.firstName ?? null,
          username: user?.username ?? null,
        };
      }),
    );
  }

  async grant(input: { telegramId: bigint; grantedBy: bigint; note?: string }): Promise<Admin> {
    const admin = await this.deps.admins.add(input.telegramId, input.grantedBy, input.note ?? null);

    this.deps.logger.warn(
      { telegramId: input.telegramId.toString(), grantedBy: input.grantedBy.toString() },
      'Administrator granted',
    );

    return admin;
  }

  async revoke(input: { telegramId: bigint; revokedBy: bigint }): Promise<void> {
    // Losing the last admin would leave the panel unreachable, recoverable
    // only by editing the database by hand.
    if ((await this.deps.admins.count()) <= 1) throw new LastAdminError();

    const removed = await this.deps.admins.remove(input.telegramId);
    if (!removed) return;

    this.deps.logger.warn(
      { telegramId: input.telegramId.toString(), revokedBy: input.revokedBy.toString() },
      'Administrator revoked',
    );
  }
}
