import { baseApi, type MoneyDto } from '@shared/api/baseApi';
import { appPath } from '@shared/lib/appPath';

export type DepositStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DepositDto {
  id: string;
  amount: MoneyDto;
  status: DepositStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface PaymentMethodDto {
  id: string;
  name: string;
  accountNumber: string;
  accountName: string;
  logoUrl: string;
}

export interface DepositsResponse {
  deposits: DepositDto[];
  minimum: MoneyDto;
  paymentMethods: PaymentMethodDto[];
}

export const depositApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDeposits: builder.query<DepositsResponse, void>({
      query: () => '/deposits',
      transformResponse: (response: DepositsResponse) => ({
        ...response,
        paymentMethods: response.paymentMethods.map((method) => ({
          ...method,
          logoUrl: appPath(method.logoUrl),
        })),
      }),
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
