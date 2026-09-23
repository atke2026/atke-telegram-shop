import { Markup } from 'telegraf';

/** Web App action attached directly to the bot's welcome message. */
export function openMiniAppKeyboard(url: string) {
  return Markup.inlineKeyboard([[Markup.button.webApp('Open Atke Digital Shop', url)]]);
}

export function broadcastConfirmKeyboard(messageId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📢 Send to all', `broadcast:${messageId}`),
      Markup.button.callback('↩️ Cancel', 'cancel'),
    ],
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
