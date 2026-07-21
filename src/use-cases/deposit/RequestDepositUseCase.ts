import type { Deposit } from '../../core/entities/Deposit.js';
import { Money } from '../../core/entities/Money.js';
import { InvalidAmountError, UserBannedError, UserNotFoundError } from '../../core/errors/DomainError.js';
import type { DepositRepository, UserRepository } from '../../core/ports/repositories.js';

const MIN_DEPOSIT = Money.fromDecimal('50');
const MAX_DEPOSIT = Money.fromDecimal('100000');

export interface RequestDepositInput {
  userId: string;
  amountETB: string;
  /** Telegram file_id of the uploaded receipt. */
  screenshotUrl: string;
}

/** Records a pending deposit; no money moves until an admin approves it. */
export class RequestDepositUseCase {
  constructor(private readonly deps: { users: UserRepository; deposits: DepositRepository }) {}

  async execute(input: RequestDepositInput): Promise<Deposit> {
    const user = await this.deps.users.findById(input.userId);
    if (!user) throw new UserNotFoundError(input.userId);
    if (user.isBanned) throw new UserBannedError();

    let amount: Money;
    try {
      amount = Money.fromDecimal(input.amountETB);
    } catch {
      throw new InvalidAmountError(`"${input.amountETB}" is not a valid amount`);
    }

    if (amount.isLessThan(MIN_DEPOSIT)) {
      throw new InvalidAmountError(`Minimum deposit is ${MIN_DEPOSIT.format()}`);
    }
    if (amount.isGreaterThan(MAX_DEPOSIT)) {
      throw new InvalidAmountError(`Maximum deposit is ${MAX_DEPOSIT.format()}`);
    }

    return this.deps.deposits.create({
      userId: user.id,
      amount,
      screenshotUrl: input.screenshotUrl,
    });
  }
}

export { MIN_DEPOSIT, MAX_DEPOSIT };
