/**
 * A customer's satisfaction rating: one star is bad, five is very satisfied.
 *
 * The scale lives here rather than being re-asserted at each edge, so the
 * route, the use case and the panel all agree on what a valid rating is.
 */
export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface Feedback {
  id: string;
  userId: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Narrows anything that arrived from a client to a rating we will store.
 * Rejects fractions as well as out-of-range values — the UI only ever sends
 * whole stars, and a 4.5 would quietly skew every average built on top.
 */
export function isValidRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_RATING &&
    value <= MAX_RATING
  );
}
