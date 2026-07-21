export interface Admin {
  id: string;
  telegramId: bigint;
  addedByTelegramId: bigint | null;
  note: string | null;
  createdAt: Date;
}
