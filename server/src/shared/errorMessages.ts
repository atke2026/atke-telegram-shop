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
    case 'PRODUCT_IMAGE_NOT_FOUND':
      return '🖼 Upload a product picture before publishing this announcement.';
    case 'NO_FINITE_STOCK':
      return '📦 This product does not have a limited stock count to announce.';
    case 'CHANNEL_PUBLISH_FAILED':
      return '📣 The channel post failed. Check that the bot is still an administrator of the Suq announcement channel.';
    case 'NOT_A_RESELLER':
      return 'This account does not have reseller access.';
    case 'RESELLER_SUSPENDED':
      return 'This reseller account is suspended. Please contact support.';
    case 'INVALID_RESELLER_API_KEY':
      return 'The reseller API key is invalid or has been revoked.';
    case 'RESELLER_PRODUCT_UNAVAILABLE':
      return 'That product is not available through the reseller API.';
    case 'INVALID_RESELLER_PRICE':
      return 'The reseller price configuration is invalid.';
    case 'RESELLER_EXTERNAL_ID_CONFLICT':
      return 'That external order ID has already been used with different order details.';
    case 'INVALID_RESELLER_EXTERNAL_ID':
      return 'External order ID must be 1–100 characters using letters, numbers, dot, underscore, colon or hyphen.';
    case 'USER_BANNED':
      return '🚫 Your account has been suspended. Contact support if you believe this is a mistake.';
    case 'USER_NOT_FOUND':
      return '👋 Please send /start first.';
    // The only safe passthrough: these messages state a limit the customer
    // has to know, and are written for them.
    case 'INVALID_AMOUNT':
    // Names the field they left out, e.g. "Please enter your phone number."
    case 'CUSTOMER_INPUT_REQUIRED':
      return `⚠️ ${error.message}`;
    case 'DEPOSIT_ALREADY_REVIEWED':
      return 'ℹ️ This deposit has already been reviewed.';
    case 'DEPOSIT_NOT_FOUND':
      return '❓ That deposit no longer exists.';
    case 'ORDER_NOT_FOUND':
      return '❓ That order no longer exists.';
    case 'NOT_A_YENESHOP_PRODUCT':
      return '⚠️ This availability switch is only for YeneShop products.';
    case 'INVALID_RATING':
      return '⚠️ Please pick a rating from 1 to 5 stars.';
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
