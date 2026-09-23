import { baseApi } from '@shared/api/baseApi';

export interface FeedbackStatus {
  /** True once this customer has rated us; the prompt never appears again. */
  submitted: boolean;
  /** True once they have ordered something — nobody else is asked to rate us. */
  hasPurchased: boolean;
}

export const feedbackApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFeedbackStatus: builder.query<FeedbackStatus, void>({
      query: () => '/feedback',
      providesTags: ['Feedback'],
    }),
    submitFeedback: builder.mutation<{ feedback: { rating: number } }, { rating: number }>({
      query: (body) => ({ url: '/feedback', method: 'POST', body }),
      // Refreshes the status this app instance holds, and the panel's list for
      // an admin who happens to be looking at it.
      invalidatesTags: ['Feedback', 'AdminFeedback'],
    }),
  }),
});

export const { useGetFeedbackStatusQuery, useSubmitFeedbackMutation } = feedbackApi;
