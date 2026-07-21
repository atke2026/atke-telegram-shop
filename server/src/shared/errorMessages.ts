import { DomainError } from '../core/errors/DomainError.js';

/**
 * Maps domain failures to user-facing copy, shared by the bot and the web API.
 *
 * Domain error messages are written for operators and logs: SystemOfflineError
 * says "reseller balance too low", InvalidApiKeyError names the reseller key.
 * Neither belongs in front of a customer, so nothing here is derived from
 * `error.message` — every case returns copy written for the person reading it,
 * and anything unmapped is deliberately vague.
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
    // The only safe passthrough: these messages state a limit the customer
    // has to know, and are written for them.
    case 'INVALID_AMOUNT':
      return `⚠️ ${error.message}`;
    case 'DEPOSIT_ALREADY_REVIEWED':
      return 'ℹ️ This deposit has already been reviewed.';
    case 'DEPOSIT_NOT_FOUND':
      return '❓ That deposit no longer exists.';
    case 'NOT_AN_ADMIN':
      return '🚫 This action requires administrator access.';
    case 'LAST_ADMIN':
      return '⚠️ You cannot remove the last administrator.';
    case 'INVALID_API_KEY':
      return '🛠 The store is temporarily offline. Our team has been notified.';
    default:
      return '⚠️ Something went wrong. Please try again shortly.';
  }
}
