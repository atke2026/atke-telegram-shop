import { isValidRating, MAX_RATING, MIN_RATING, type Feedback } from '../../core/entities/Feedback.js';
import { DomainError } from '../../core/errors/DomainError.js';
import type { FeedbackRepository } from '../../core/ports/repositories.js';

export class InvalidRatingError extends DomainError {
  readonly code = 'INVALID_RATING';

  constructor() {
    super(`rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}`);
  }
}

/**
 * Records how satisfied a customer said they were.
 *
 * The rating is validated here rather than at the route, because the same rule
 * has to hold whichever edge collects it, and an out-of-range value would
 * silently distort the average shown in the panel.
 */
export class SubmitFeedbackUseCase {
  constructor(private readonly deps: { feedback: FeedbackRepository }) {}

  async execute(input: { userId: string; rating: unknown }): Promise<Feedback> {
    if (!isValidRating(input.rating)) throw new InvalidRatingError();

    return this.deps.feedback.upsert(input.userId, input.rating);
  }

  /** Whether this customer has already answered, which is what suppresses the
   *  prompt for good rather than asking them again on the next visit. */
  async hasSubmitted(userId: string): Promise<boolean> {
    return (await this.deps.feedback.findByUserId(userId)) !== null;
  }
}
