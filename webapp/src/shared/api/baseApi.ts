import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import { getInitData } from '@shared/lib/telegram';

export interface MoneyDto {
  amount: string;
  label: string;
}

/**
 * One API slice for the whole app; entity slices extend it with injectEndpoints
 * so each business domain owns its own queries without a second cache.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  tagTypes: [
    'User',
    'Product',
    'Order',
    'Deposit',
    'Admin',
    'AdminSummary',
    'AdminDeposit',
    'AdminProduct',
    'AdminUser',
    'Discount',
  ],
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: (headers) => {
      // Re-read on every request: Telegram can refresh initData mid-session.
      const initData = getInitData();
      if (initData) headers.set('Authorization', `tma ${initData}`);
      return headers;
    },
  }),
  endpoints: () => ({}),
});

/** Pulls a readable message out of an RTK Query error shape. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }

  return fallback;
}
