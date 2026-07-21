/**
 * Where customers send money. Defined once so the bot's /deposit text and the
 * web app's wallet screen cannot drift apart — an account number that is right
 * in one place and stale in the other loses real payments.
 *
 * `logoSlug` matches a file in assets/logos, the same naming rule as products.
 */
export interface PaymentMethod {
  id: string;
  name: string;
  accountNumber: string;
  accountName: string;
  logoSlug: string;
}

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  {
    id: 'telebirr',
    name: 'Telebirr',
    accountNumber: '0975915991',
    accountName: 'Mikiyas Mulat Asmare',
    logoSlug: 'telebirr',
  },
  {
    id: 'cbe',
    name: 'CBE',
    accountNumber: '1000480204941',
    accountName: 'Mikiyas Mulat Asmare',
    logoSlug: 'cbe',
  },
];

/** Renders the methods as the Markdown block the bot sends on /deposit. */
export function paymentMethodsAsMarkdown(): string {
  const accounts = PAYMENT_METHODS.map(
    (method) => `📱 *${method.name}:* \`${method.accountNumber}\``,
  ).join('\n');

  // Every method is in one name here; if that ever differs, move the line up
  // into each account.
  const accountName = PAYMENT_METHODS[0]?.accountName ?? '';

  return (
    'Send your payment to one of these accounts, then upload the receipt screenshot:\n\n' +
    `${accounts}\n\n` +
    `👤 *Account name:* ${accountName}`
  );
}
