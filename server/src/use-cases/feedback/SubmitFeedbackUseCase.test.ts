import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Feedback } from '../../core/entities/Feedback.js';
import type { FeedbackRepository } from '../../core/ports/repositories.js';
import { InvalidRatingError, SubmitFeedbackUseCase } from './SubmitFeedbackUseCase.js';

function makeFeedback(rating: number): Feedback {
  return {
    id: 'feedback-1',
    userId: 'user-1',
    rating,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('SubmitFeedbackUseCase', () => {
  let feedback: FeedbackRepository;
  let useCase: SubmitFeedbackUseCase;

  beforeEach(() => {
    feedback = {
      upsert: vi.fn(async (_userId: string, rating: number) => makeFeedback(rating)),
      findByUserId: vi.fn().mockResolvedValue(null),
      list: vi.fn(),
    } as unknown as FeedbackRepository;

    useCase = new SubmitFeedbackUseCase({ feedback });
  });

  it('stores every rating on the scale', async () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const stored = await useCase.execute({ userId: 'user-1', rating });
      expect(stored.rating).toBe(rating);
    }

    expect(feedback.upsert).toHaveBeenCalledTimes(5);
  });

  it('rejects ratings outside the scale', async () => {
    for (const rating of [0, 6, -1, 100]) {
      await expect(useCase.execute({ userId: 'user-1', rating })).rejects.toThrow(InvalidRatingError);
    }

    expect(feedback.upsert).not.toHaveBeenCalled();
  });

  // A fraction would pass a naive range check and then quietly skew the
  // average the panel reports, which is the whole reason the panel has one.
  it('rejects fractional ratings', async () => {
    await expect(useCase.execute({ userId: 'user-1', rating: 4.5 })).rejects.toThrow(
      InvalidRatingError,
    );
  });

  it('rejects anything that is not a number, without coercing it', async () => {
    for (const rating of ['5', null, undefined, {}, true]) {
      await expect(useCase.execute({ userId: 'user-1', rating })).rejects.toThrow(InvalidRatingError);
    }

    expect(feedback.upsert).not.toHaveBeenCalled();
  });

  it('reports whether a customer has already answered', async () => {
    expect(await useCase.hasSubmitted('user-1')).toBe(false);

    vi.mocked(feedback.findByUserId).mockResolvedValueOnce(makeFeedback(4));
    expect(await useCase.hasSubmitted('user-1')).toBe(true);
  });
});
