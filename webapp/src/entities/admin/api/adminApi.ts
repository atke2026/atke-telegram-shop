import { baseApi, type MoneyDto } from '@shared/api/baseApi';
import { appPath } from '@shared/lib/appPath';

export interface AdminSummary {
  products: { active: number; outOfStock: number };
  deposits: { pending: number; pendingTotal: MoneyDto };
  yeneshop: { balance: MoneyDto | null };
}

export interface AdminMoneyAnalytics {
  range: {
    from: string;
    to: string;
    timezone: 'Africa/Addis_Ababa';
    estimatedEvents: number;
  };
  cash: {
    approvedDeposits: MoneyDto;
    approvedCount: number;
  };
  sales: {
    settled: MoneyDto;
    completedCount: number;
    pending: MoneyDto;
    pendingCount: number;
    refunds: MoneyDto;
    refundCount: number;
    retainedCancellations: MoneyDto;
    retainedCancellationCount: number;
  };
  yeneshop: {
    spentETB: MoneyDto;
    possibleSpendETB: MoneyDto;
    liveBalanceETB: MoneyDto | null;
  };
  profit: {
    gross: MoneyDto;
    marginPercent: string | null;
  };
  wallet: {
    actual: MoneyDto;
    expected: MoneyDto;
    mismatch: MoneyDto;
    manualAdjustments: MoneyDto;
    historicalOpeningAdjustment: MoneyDto;
    historicalOpeningCount: number;
  };
  channels: {
    retail: { orders: number; revenue: MoneyDto };
    reseller: { orders: number; revenue: MoneyDto };
  };
  products: {
    productId: string;
    name: string;
    orders: number;
    revenue: MoneyDto;
    costETB: MoneyDto;
    profit: MoneyDto;
  }[];
  anomalies: {
    count: number;
    awaitingDelivery: number;
    possibleYeneShopSpendETB: MoneyDto;
    completedYeneShopWithoutId: number;
    missingLedgerEvents: number;
    walletMismatch: MoneyDto;
  };
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
  inStock: boolean;
  price: MoneyDto;
  logoUrl: string;
  costPriceETB: string;
  fixedPrice: boolean;
  /** The product page / redemption steps, editable from the panel. */
  details: string | null;
  /** True when an admin has dragged this product into place. */
  placed: boolean;
  /** Every live product is synchronized through YeneShop's reseller API. */
  source: 'YENESHOP';
  /** False when YeneShop reports unlimited stock. */
  finiteStock: boolean;
  /** Suq sale switch controlled by the operator and preserved across syncs. */
  operatorAvailable: boolean;
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
    /**
     * null when the order never reached fulfilment, 0 when it completed but
     * upstream delivered nothing — the case worth spotting. The contents
     * themselves come from getAdminOrderItems.
     */
    deliveredItemCount: number | null;
  }[];
  deposits: {
    id: string;
    amount: MoneyDto;
    status: string;
    createdAt: string;
    hasReceiptImage: boolean;
  }[];
}

/** One user's satisfaction rating, as listed in the panel's Feedback tab. */
export interface AdminFeedbackRow {
  id: string;
  rating: number;
  createdAt: string;
  /** When they last changed their answer; the list is sorted on this. */
  updatedAt: string;
  user: {
    id: string;
    telegramId: string;
    firstName: string | null;
    username: string | null;
    isBanned: boolean;
  };
}

export interface AdminFeedbackPage {
  entries: AdminFeedbackRow[];
  total: number;
  /** Mean across everyone who has rated, to one decimal; null when nobody has. */
  average: number | null;
}

export interface AdminOrderItems {
  orderId: string;
  productName: string;
  status: string;
  yeneshopOrderId: string | null;
  deliveredItems: unknown[];
}

export interface AdminDiscountRow {
  id: string;
  scope: 'ALL' | 'PRODUCT';
  productId: string | null;
  productName: string | null;
  type: 'PERCENT' | 'FIXED';
  value: string;
  label: string | null;
  isActive: boolean;
  /** Active *and* inside its date window. */
  isLive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface CreateDiscountInput {
  scope: 'ALL' | 'PRODUCT';
  productId?: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  label?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface AdminRow {
  telegramId: string;
  firstName: string | null;
  username: string | null;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
}

export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  imageUrl: string | null;
}

export interface BackupEntry {
  name: string;
  kind: 'automatic' | 'manual' | 'pre-restore';
  createdAt: string;
  sizeBytes: number;
  warnings: string[];
}

export interface BackupStatus {
  intervalHours: number | null;
  retentionCount: number;
  nextRunAt: string | null;
  running: boolean;
  restoring: boolean;
  lastError: string | null;
  canRestore: boolean;
  backups: BackupEntry[];
}

export const adminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminSummary: builder.query<AdminSummary, void>({
      query: () => '/admin/summary',
      providesTags: ['AdminSummary'],
    }),

    getMoneyAnalytics: builder.query<AdminMoneyAnalytics, { from: string; to: string }>({
      query: ({ from, to }) =>
        `/admin/analytics?${new URLSearchParams({ from, to }).toString()}`,
      providesTags: ['AdminAnalytics'],
    }),

    getAdminDeposits: builder.query<AdminDepositRow[], 'PENDING' | 'APPROVED' | 'REJECTED'>({
      query: (status) => `/admin/deposits?status=${status}`,
      transformResponse: (response: { deposits: AdminDepositRow[] }) => response.deposits,
      providesTags: ['AdminDeposit'],
    }),

    approveDeposit: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/admin/deposits/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['AdminDeposit', 'AdminSummary', 'AdminAnalytics', 'Deposit', 'User'],
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
      transformResponse: (response: { products: AdminProductRow[] }) =>
        response.products.map((product) => ({
          ...product,
          logoUrl: appPath(product.logoUrl),
        })),
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

    announceNewArrival: builder.mutation<
      { productId: string; priceLabel: string; queued: true; channelMessageId: number },
      string
    >({
      query: (slug) => ({
        url: `/admin/products/${slug}/new-arrival`,
        method: 'POST',
      }),
      invalidatesTags: ['AdminProduct', 'Product'],
    }),

    publishLowStock: builder.mutation<{ messageId: number; stock: number }, string>({
      query: (slug) => ({
        url: `/admin/products/${slug}/channel-stock`,
        method: 'POST',
      }),
    }),

    setProductAvailability: builder.mutation<
      { operatorAvailable: boolean },
      { slug: string; available: boolean }
    >({
      query: ({ slug, available }) => ({
        url: `/admin/products/${slug}/availability`,
        method: 'POST',
        body: { available },
      }),
      invalidatesTags: ['AdminProduct', 'Product', 'AdminSummary'],
    }),

    reorderProducts: builder.mutation<{ placed: number }, string[]>({
      query: (productIds) => ({
        url: '/admin/products/order',
        method: 'POST',
        body: { productIds },
      }),
      invalidatesTags: ['AdminProduct', 'Product'],
    }),

    resetProductOrder: builder.mutation<{ cleared: number }, void>({
      query: () => ({ url: '/admin/products/order', method: 'DELETE' }),
      invalidatesTags: ['AdminProduct', 'Product'],
    }),

    setProductInstructions: builder.mutation<unknown, { slug: string; instructions: string | null }>({
      query: ({ slug, instructions }) => ({
        url: `/admin/products/${slug}/instructions`,
        method: 'POST',
        body: { instructions },
      }),
      // Customers read these after purchase, so their order list is stale too.
      invalidatesTags: ['AdminProduct', 'Product', 'Order'],
    }),

    setProductLogo: builder.mutation<
      { logoUrl: string; transparent: boolean },
      { slug: string; imageBase64: string; background?: 'auto' | 'transparent' | 'white' }
    >({
      query: ({ slug, imageBase64, background = 'auto' }) => ({
        url: `/admin/products/${slug}/logo`,
        method: 'POST',
        body: { imageBase64, background },
      }),
      invalidatesTags: ['AdminProduct', 'Product'],
    }),

    syncProducts: builder.mutation<{ synced: number; deactivated: number }, void>({
      query: () => ({ url: '/admin/sync', method: 'POST' }),
      invalidatesTags: ['AdminProduct', 'Product', 'AdminSummary'],
    }),

    adjustBalance: builder.mutation<unknown, { telegramId: string; deltaETB: string }>({
      query: ({ telegramId, deltaETB }) => ({
        url: `/admin/users/${telegramId}/balance`,
        method: 'POST',
        body: { deltaETB },
      }),
      invalidatesTags: ['User', 'AdminUser', 'AdminAnalytics'],
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

    getAdminFeedback: builder.query<AdminFeedbackPage, { offset?: number }>({
      query: ({ offset = 0 }) =>
        `/admin/feedback?${new URLSearchParams({ offset: String(offset), limit: '30' })}`,
      providesTags: ['AdminFeedback'],
    }),

    getAdminUser: builder.query<AdminUserDetail, string>({
      query: (telegramId) => `/admin/users/${telegramId}`,
      providesTags: ['AdminUser'],
    }),

    // Not cached under a tag: each read is logged server-side, so it should
    // happen when an admin actually asks, not on a background refetch.
    getAdminOrderItems: builder.query<AdminOrderItems, string>({
      query: (orderId) => `/admin/orders/${orderId}/items`,
    }),

    setUserBanned: builder.mutation<unknown, { telegramId: string; banned: boolean }>({
      query: ({ telegramId, banned }) => ({
        url: `/admin/users/${telegramId}/ban`,
        method: 'POST',
        body: { banned },
      }),
      invalidatesTags: ['AdminUser'],
    }),

    getDiscounts: builder.query<AdminDiscountRow[], void>({
      query: () => '/admin/discounts',
      transformResponse: (response: { discounts: AdminDiscountRow[] }) => response.discounts,
      providesTags: ['Discount'],
    }),

    createDiscount: builder.mutation<{ id: string }, CreateDiscountInput>({
      query: (body) => ({ url: '/admin/discounts', method: 'POST', body }),
      // Prices change everywhere, so the storefront caches go too.
      invalidatesTags: ['Discount', 'Product', 'AdminProduct'],
    }),

    setDiscountActive: builder.mutation<unknown, { id: string; isActive: boolean }>({
      query: ({ id, isActive }) => ({
        url: `/admin/discounts/${id}/active`,
        method: 'POST',
        body: { isActive },
      }),
      invalidatesTags: ['Discount', 'Product', 'AdminProduct'],
    }),

    deleteDiscount: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/admin/discounts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Discount', 'Product', 'AdminProduct'],
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

    getAdminMaintenance: builder.query<MaintenanceState, void>({
      query: () => '/admin/maintenance',
      transformResponse: (response: MaintenanceState) => ({
        ...response,
        imageUrl: response.imageUrl ? appPath(response.imageUrl) : null,
      }),
      providesTags: ['Maintenance'],
    }),

    setAdminMaintenance: builder.mutation<
      MaintenanceState,
      { enabled?: boolean; message?: string | null }
    >({
      query: (body) => ({ url: '/admin/maintenance', method: 'POST', body }),
      // Also refreshes the public gate the whole app reads on load.
      invalidatesTags: ['Maintenance'],
    }),

    setAdminMaintenanceImage: builder.mutation<MaintenanceState, { imageBase64: string | null }>({
      query: ({ imageBase64 }) => ({
        url: '/admin/maintenance/image',
        method: 'POST',
        body: { imageBase64 },
      }),
      invalidatesTags: ['Maintenance'],
    }),

    getBackups: builder.query<BackupStatus, void>({
      query: () => '/admin/backups',
      providesTags: ['Backup'],
    }),

    setBackupInterval: builder.mutation<BackupStatus, number | null>({
      query: (intervalHours) => ({
        url: '/admin/backups/schedule',
        method: 'POST',
        body: { intervalHours },
      }),
      invalidatesTags: ['Backup'],
    }),

    createBackup: builder.mutation<BackupEntry, void>({
      query: () => ({ url: '/admin/backups', method: 'POST' }),
      invalidatesTags: ['Backup'],
    }),

    downloadBackup: builder.mutation<Blob, string>({
      query: (name) => ({
        url: `/admin/backups/${encodeURIComponent(name)}/download`,
        method: 'GET',
        cache: 'no-store',
        responseHandler: (response) => response.blob(),
      }),
    }),

    restoreStoredBackup: builder.mutation<{ restoredAt: string }, string>({
      query: (name) => ({
        url: `/admin/backups/${encodeURIComponent(name)}/restore`,
        method: 'POST',
        body: { confirmation: 'RESTORE' },
      }),
      invalidatesTags: ['Backup', 'User', 'Product', 'Order', 'Admin'],
    }),

    importBackup: builder.mutation<{ restoredAt: string }, File>({
      query: (file) => ({
        url: '/admin/backups/import',
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.suq.backup',
          'X-Backup-Confirmation': 'RESTORE',
        },
        body: file,
        timeout: 10 * 60_000,
      }),
      invalidatesTags: ['Backup', 'User', 'Product', 'Order', 'Admin'],
    }),
  }),
});

export const {
  useGetDiscountsQuery,
  useCreateDiscountMutation,
  useSetDiscountActiveMutation,
  useDeleteDiscountMutation,
  useGetAdminUsersQuery,
  useGetAdminFeedbackQuery,
  useGetAdminUserQuery,
  useLazyGetAdminOrderItemsQuery,
  useSetUserBannedMutation,
  useGetAdminSummaryQuery,
  useGetMoneyAnalyticsQuery,
  useGetAdminDepositsQuery,
  useApproveDepositMutation,
  useRejectDepositMutation,
  useGetAdminProductsQuery,
  useSetProductPriceMutation,
  useAnnounceNewArrivalMutation,
  usePublishLowStockMutation,
  useSetProductAvailabilityMutation,
  useSetProductInstructionsMutation,
  useSetProductLogoMutation,
  useReorderProductsMutation,
  useResetProductOrderMutation,
  useSyncProductsMutation,
  useAdjustBalanceMutation,
  useGetAdminsQuery,
  useGrantAdminMutation,
  useRevokeAdminMutation,
  useGetAdminMaintenanceQuery,
  useSetAdminMaintenanceMutation,
  useSetAdminMaintenanceImageMutation,
  useGetBackupsQuery,
  useSetBackupIntervalMutation,
  useCreateBackupMutation,
  useDownloadBackupMutation,
  useRestoreStoredBackupMutation,
  useImportBackupMutation,
} = adminApi;
