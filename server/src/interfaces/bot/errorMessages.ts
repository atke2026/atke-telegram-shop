import { DomainError } from '../../core/errors/DomainError.js';

/**
 * Maps domain failures to user-facing copy. Anything unmapped is deliberately
 * vague — internal detail never reaches the customer.
 */
export function toUserMessage(error: unknown): string {
  if (!(error instanceof DomainError)) {
    return '⚠️ Something went wrong on our side. Please try again shortly.';
  }

  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      return '💸 Your balance is too low for this purchase. Use ➕ Deposit to top up.';
    case 'OUT_OF_STOCK':
      return '🔴 This product is currently out of stock. Please try another one.';
    case 'SYSTEM_OFFLINE':
      return '🛠 The store is temporarily offline. Our team has been notified — please try again later.';
    case 'PRODUCT_NOT_FOUND':
      return '❓ That product is no longer available.';
    case 'USER_BANNED':
      return '🚫 Your account has been suspended. Contact support if you believe this is a mistake.';
    case 'USER_NOT_FOUND':
      return '👋 Please send /start first.';
    case 'INVALID_AMOUNT':
      return `⚠️ ${error.message}`;
    case 'DEPOSIT_ALREADY_REVIEWED':
      return 'ℹ️ This deposit has already been reviewed.';
    case 'DEPOSIT_NOT_FOUND':
      return '❓ That deposit no longer exists.';
    case 'INVALID_API_KEY':
      return '🛠 The store is temporarily offline. Our team has been notified.';
    default:
      return '⚠️ Something went wrong. Please try again shortly.';
  }
}
