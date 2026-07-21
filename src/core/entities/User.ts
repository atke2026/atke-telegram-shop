import { Money } from './Money.js';

export interface User {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  balance: Money;
  isBanned: boolean;
  createdAt: Date;
}

export function canAfford(user: User, price: Money): boolean {
  return !user.balance.isLessThan(price);
}
