/**
 * Renders a delivered item without assuming YeneShop's payload shape — it may be a
 * bare string, or an object of key/value pairs we have never seen before.
 *
 * Shared so the customer's order list and the admin's view of the same order
 * cannot disagree about what was delivered.
 */
export function itemToText(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    return Object.entries(item as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');
  }
  return String(item);
}
