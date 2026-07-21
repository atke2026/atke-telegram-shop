import type { Deposit } from '../../core/entities/Deposit.js';
import type { User } from '../../core/entities/User.js';
import type { DepositRepository } from '../../core/ports/repositories.js';
import type { Logger } from '../../shared/logger.js';

export interface ApproveDepositResult {
  deposit: Deposit;
  user: User;
}

/**
 * Credits the wallet. The repository does the claim-then-credit in one
 * transaction, so a double-tap on Approve cannot credit twice.
 */
export class ApproveDepositUseCase {
  constructor(private readonly deps: { deposits: DepositRepository; logger: Logger }) {}

  async execute(input: { depositId: string; reviewerTelegramId: bigint }): Promise<ApproveDepositResult> {
    const result = await this.deps.deposits.approveAndCredit(input.depositId, input.reviewerTelegramId);

    this.deps.logger.info(
      {
        depositId: result.deposit.id,
        userId: result.user.id,
        amount: result.deposit.amount.toDecimalString(),
        reviewer: input.reviewerTelegramId.toString(),
      },
      'Deposit approved and wallet credited',
    );

    return result;
  }
}

export class RejectDepositUseCase {
  constructor(private readonly deps: { deposits: DepositRepository; logger: Logger }) {}

  async execute(input: {
    depositId: string;
    reviewerTelegramId: bigint;
    note?: string;
  }): Promise<Deposit> {
    const deposit = await this.deps.deposits.reject(
      input.depositId,
      input.reviewerTelegramId,
      input.note ?? null,
    );

    this.deps.logger.info(
      { depositId: deposit.id, reviewer: input.reviewerTelegramId.toString() },
      'Deposit rejected',
    );

    return deposit;
  }
}
