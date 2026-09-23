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

/** Suq's YeneShop reseller account cannot fund the purchase — user is not at fault. */
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

export class ProductImageNotFoundError extends DomainError {
  readonly code = 'PRODUCT_IMAGE_NOT_FOUND';

  constructor(readonly productId: string) {
    super(`Product ${productId} has no publishable image`);
  }
}

export class NoFiniteStockError extends DomainError {
  readonly code = 'NO_FINITE_STOCK';

  constructor(readonly productId: string) {
    super(`Product ${productId} does not have a finite stock count`);
  }
}

export class ChannelPublishError extends DomainError {
  readonly code = 'CHANNEL_PUBLISH_FAILED';

  constructor() {
    super('The product post could not be published to the announcement channel');
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

/** YeneShop rejected Suq's credentials — the operator must rotate the key. */
export class InvalidApiKeyError extends DomainError {
  readonly code = 'INVALID_API_KEY';

  constructor() {
    super('YeneShop rejected the reseller API key');
  }
}

export class NotAResellerError extends DomainError {
  readonly code = 'NOT_A_RESELLER';

  constructor() {
    super('This account does not have reseller access');
  }
}

export class ResellerSuspendedError extends DomainError {
  readonly code = 'RESELLER_SUSPENDED';

  constructor() {
    super('This reseller account is suspended');
  }
}

export class InvalidResellerApiKeyError extends DomainError {
  readonly code = 'INVALID_RESELLER_API_KEY';

  constructor() {
    super('The reseller API key is invalid or revoked');
  }
}

export class ResellerProductUnavailableError extends DomainError {
  readonly code = 'RESELLER_PRODUCT_UNAVAILABLE';

  constructor(readonly productId: string) {
    super(`Product ${productId} is not available to resellers`);
  }
}

export class InvalidResellerPriceError extends DomainError {
  readonly code = 'INVALID_RESELLER_PRICE';

  constructor(message: string) {
    super(message);
  }
}

export class ResellerExternalIdConflictError extends DomainError {
  readonly code = 'RESELLER_EXTERNAL_ID_CONFLICT';

  constructor(readonly externalId: string) {
    super(`External id ${externalId} has already been used for another order`);
  }
}

export class InvalidResellerExternalIdError extends DomainError {
  readonly code = 'INVALID_RESELLER_EXTERNAL_ID';

  constructor() {
    super('External order ID must be 1-100 URL-safe characters');
  }
}

/** Internal race signal: the unique reseller/external-id boundary won elsewhere. */
export class ResellerExternalOrderExistsError extends DomainError {
  readonly code = 'RESELLER_EXTERNAL_ORDER_EXISTS';

  constructor() {
    super('The reseller order already exists');
  }
}
