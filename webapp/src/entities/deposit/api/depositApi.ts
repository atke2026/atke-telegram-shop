import { baseApi, type MoneyDto } from '@shared/api/baseApi';

export type DepositStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DepositDto {
  id: string;
  amount: MoneyDto;
  status: DepositStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface DepositsResponse {
  deposits: DepositDto[];
  minimum: MoneyDto;
}

export const depositApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDeposits: builder.query<DepositsResponse, void>({
      query: () => '/deposits',
      providesTags: ['Deposit'],
    }),
    requestDeposit: builder.mutation<
      { deposit: DepositDto },
      { amountETB: string; receiptBase64: string }
    >({
      query: (body) => ({ url: '/deposits', method: 'POST', body }),
      invalidatesTags: ['Deposit'],
    }),
  }),
});

export const { useGetDepositsQuery, useRequestDepositMutation } = depositApi;
