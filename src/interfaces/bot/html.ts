/**
 * Escapes text for Telegram's HTML parse mode. Telegram only requires these
 * three, and escaping more would show literal entities to the user.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
