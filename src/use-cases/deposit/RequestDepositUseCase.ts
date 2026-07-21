import type { Deposit } from '../../core/entities/Deposit.js';
import { Money } from '../../core/entities/Money.js';
import { InvalidAmountError, UserBannedError, UserNotFoundError } from '../../core/errors/DomainError.js';
import type { DepositRepository, ProductRepository, UserRepository } from '../../core/ports/repositories.js';

/** Used only when the catalogue is empty, so deposits are never fully blocked. */
const FALLBACK_MIN_DEPOSIT = Money.fromDecimal('50');
const MAX_DEPOSIT = Money.fromDecimal('100000');

export interface RequestDepositInput {
  userId: string;
  amountETB: string;
  /** Telegram file_id of the uploaded receipt. */
  screenshotUrl: string;
}

/** Records a pending deposit; no money moves until an admin approves it. */
export class RequestDepositUseCase {
  constructor(
    private readonly deps: {
      users: UserRepository;
      deposits: DepositRepository;
      products: ProductRepository;
    },
  ) {}

  /**
   * The cheapest product on sale. Depositing less than that buys nothing, so
   * it is the only floor that makes sense — and it follows price changes.
   */
  async minimumDeposit(): Promise<Money> {
    const products = await this.deps.products.listActive();
    if (products.length === 0) return FALLBACK_MIN_DEPOSIT;

    return products.reduce(
      (cheapest, product) => (product.sellingPrice.isLessThan(cheapest) ? product.sellingPrice : cheapest),
      products[0]!.sellingPrice,
    );
  }

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

    const minimum = await this.minimumDeposit();
    if (amount.isLessThan(minimum)) {
      throw new InvalidAmountError(
        `Minimum deposit is ${minimum.format()} — that is the price of our cheapest product.`,
      );
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

export { FALLBACK_MIN_DEPOSIT, MAX_DEPOSIT };
