import { Markup } from 'telegraf';

import type { ProductListItem } from '../../../use-cases/product/ListProductsUseCase.js';

export const mainMenu = Markup.keyboard([
  ['🛒 Products', '💰 Balance'],
  ['➕ Deposit', '📦 My Orders'],
  ['ℹ️ Help'],
]).resize();

export function productListKeyboard(products: ProductListItem[]) {
  const rows = products.map((product) => [
    Markup.button.callback(
      // The struck-out price cannot be rendered on a button, so the saving is
      // named instead.
      product.originalPriceLabel
        ? `${product.name} — ${product.priceLabel} (${product.discountLabel})`
        : `${product.name} — ${product.priceLabel}`,
      // Out-of-stock rows stay tappable but answer with a notice instead.
      product.inStock ? `product:${product.id}` : 'noop',
    ),
  ]);

  return Markup.inlineKeyboard(rows);
}

export function confirmPurchaseKeyboard(productId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirm purchase', `buy:${productId}`)],
    [Markup.button.callback('↩️ Cancel', 'cancel')],
  ]);
}

export function depositReviewKeyboard(depositId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Approve', `deposit:approve:${depositId}`),
      Markup.button.callback('❌ Reject', `deposit:reject:${depositId}`),
    ],
  ]);
}
