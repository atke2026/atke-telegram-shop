import { Money } from './Money.js';

export type DepositStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Deposit {
  id: string;
  userId: string;
  amount: Money;
  /** Telegram file_id of the payment receipt. */
  screenshotUrl: string;
  status: DepositStatus;
  reviewedBy: bigint | null;
  reviewedAt: Date | null;
  rejectionNote: string | null;
  createdAt: Date;
}
