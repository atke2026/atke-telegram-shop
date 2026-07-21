/**
 * Base class for every expected, business-rule failure. Anything that is not a
 * DomainError is an unexpected fault and gets reported to the admin as such.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';

  constructor(readonly requiredETB: string, readonly availableETB: string) {
    super(`Balance ${availableETB} ETB is below the required ${requiredETB} ETB`);
  }
}

export class OutOfStockError extends DomainError {
  readonly code = 'OUT_OF_STOCK';

  constructor(readonly productId: string) {
    super(`Product ${productId} is out of stock`);
  }
}

/** The reseller (HubX) account itself cannot fund the purchase — user is not at fault. */
export class SystemOfflineError extends DomainError {
  readonly code = 'SYSTEM_OFFLINE';

  constructor(reason: string) {
    super(`Reseller system unavailable: ${reason}`);
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';

  constructor(readonly productId: string) {
    super(`Product ${productId} was not found`);
  }
}

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';

  constructor(readonly userId: string) {
    super(`User ${userId} was not found`);
  }
}

export class UserBannedError extends DomainError {
  readonly code = 'USER_BANNED';

  constructor() {
    super('This account has been suspended');
  }
}

export class DepositNotFoundError extends DomainError {
  readonly code = 'DEPOSIT_NOT_FOUND';

  constructor(readonly depositId: string) {
    super(`Deposit ${depositId} was not found`);
  }
}

export class DepositAlreadyReviewedError extends DomainError {
  readonly code = 'DEPOSIT_ALREADY_REVIEWED';

  constructor(readonly depositId: string, readonly status: string) {
    super(`Deposit ${depositId} was already ${status.toLowerCase()}`);
  }
}

export class InvalidAmountError extends DomainError {
  readonly code = 'INVALID_AMOUNT';

  constructor(message: string) {
    super(message);
  }
}

/** HubX rejected our credentials — the admin must rotate the key. */
export class InvalidApiKeyError extends DomainError {
  readonly code = 'INVALID_API_KEY';

  constructor() {
    super('HubX rejected the reseller API key');
  }
}
