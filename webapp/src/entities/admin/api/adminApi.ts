import { baseApi, type MoneyDto } from '@shared/api/baseApi';

export interface AdminSummary {
  products: { active: number; outOfStock: number };
  deposits: { pending: number; pendingTotal: MoneyDto };
  hubx: { balanceUSDT: string | null };
}

export interface AdminDepositRow {
  id: string;
  amount: MoneyDto;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  hasReceiptImage: boolean;
  user: {
    telegramId: string;
    firstName: string | null;
    username: string | null;
    balance: MoneyDto;
  } | null;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  stock: number;
  price: MoneyDto;
  logoUrl: string;
  costPriceUSDT: string;
  fixedPrice: boolean;
}

export interface AdminUserRow {
  id: string;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  isBanned: boolean;
  createdAt: string;
  balance: MoneyDto;
  orderCount: number;
  totalSpent: MoneyDto;
}

export interface AdminUserDetail {
  user: {
    id: string;
    telegramId: string;
    firstName: string | null;
    username: string | null;
    isBanned: boolean;
    createdAt: string;
    balance: MoneyDto;
  };
  totals: {
    spent: MoneyDto;
    deposited: MoneyDto;
    orderCount: number;
    depositCount: number;
  };
  orders: {
    id: string;
    productName: string;
    pricePaid: MoneyDto;
    status: string;
    createdAt: string;
  }[];
  deposits: {
    id: string;
    amount: MoneyDto;
    status: string;
    createdAt: string;
    hasReceiptImage: boolean;
  }[];
}

export interface AdminRow {
  telegramId: string;
  firstName: string | null;
  username: string | null;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
}

export const adminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminSummary: builder.query<AdminSummary, void>({
      query: () => '/admin/summary',
      providesTags: ['AdminSummary'],
    }),

    getAdminDeposits: builder.query<AdminDepositRow[], 'PENDING' | 'APPROVED' | 'REJECTED'>({
      query: (status) => `/admin/deposits?status=${status}`,
      transformResponse: (response: { deposits: AdminDepositRow[] }) => response.deposits,
      providesTags: ['AdminDeposit'],
    }),

    approveDeposit: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/admin/deposits/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['AdminDeposit', 'AdminSummary', 'Deposit', 'User'],
    }),

    rejectDeposit: builder.mutation<unknown, { id: string; note?: string }>({
      query: ({ id, note }) => ({
        url: `/admin/deposits/${id}/reject`,
        method: 'POST',
        body: note ? { note } : {},
      }),
      invalidatesTags: ['AdminDeposit', 'AdminSummary', 'Deposit'],
    }),

    getAdminProducts: builder.query<AdminProductRow[], void>({
      query: () => '/admin/products',
      transformResponse: (response: { products: AdminProductRow[] }) => response.products,
      providesTags: ['AdminProduct'],
    }),

    setProductPrice: builder.mutation<unknown, { slug: string; priceETB: string | null }>({
      query: ({ slug, priceETB }) => ({
        url: `/admin/products/${slug}/price`,
        method: 'POST',
        body: { priceETB },
      }),
      invalidatesTags: ['AdminProduct', 'Product'],
    }),

    syncProducts: builder.mutation<{ synced: number; deactivated: number; rate: string }, void>({
      query: () => ({ url: '/admin/sync', method: 'POST' }),
      invalidatesTags: ['AdminProduct', 'Product', 'AdminSummary'],
    }),

    adjustBalance: builder.mutation<unknown, { telegramId: string; deltaETB: string }>({
      query: ({ telegramId, deltaETB }) => ({
        url: `/admin/users/${telegramId}/balance`,
        method: 'POST',
        body: { deltaETB },
      }),
      invalidatesTags: ['User'],
    }),

    getAdminUsers: builder.query<
      { users: AdminUserRow[]; total: number },
      { query?: string; offset?: number }
    >({
      query: ({ query, offset = 0 }) => {
        const params = new URLSearchParams({ offset: String(offset), limit: '30' });
        if (query) params.set('query', query);
        return `/admin/users?${params.toString()}`;
      },
      providesTags: ['AdminUser'],
    }),

    getAdminUser: builder.query<AdminUserDetail, string>({
      query: (telegramId) => `/admin/users/${telegramId}`,
      providesTags: ['AdminUser'],
    }),

    setUserBanned: builder.mutation<unknown, { telegramId: string; banned: boolean }>({
      query: ({ telegramId, banned }) => ({
        url: `/admin/users/${telegramId}/ban`,
        method: 'POST',
        body: { banned },
      }),
      invalidatesTags: ['AdminUser'],
    }),

    getAdmins: builder.query<AdminRow[], void>({
      query: () => '/admin/admins',
      transformResponse: (response: { admins: AdminRow[] }) => response.admins,
      providesTags: ['Admin'],
    }),

    grantAdmin: builder.mutation<unknown, { telegramId: string; note?: string }>({
      query: (body) => ({ url: '/admin/admins', method: 'POST', body }),
      invalidatesTags: ['Admin'],
    }),

    revokeAdmin: builder.mutation<unknown, string>({
      query: (telegramId) => ({ url: `/admin/admins/${telegramId}`, method: 'DELETE' }),
      invalidatesTags: ['Admin'],
    }),
  }),
});

export const {
  useGetAdminUsersQuery,
  useGetAdminUserQuery,
  useSetUserBannedMutation,
  useGetAdminSummaryQuery,
  useGetAdminDepositsQuery,
  useApproveDepositMutation,
  useRejectDepositMutation,
  useGetAdminProductsQuery,
  useSetProductPriceMutation,
  useSyncProductsMutation,
  useAdjustBalanceMutation,
  useGetAdminsQuery,
  useGrantAdminMutation,
  useRevokeAdminMutation,
} = adminApi;
