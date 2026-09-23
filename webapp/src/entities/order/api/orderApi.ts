import { baseApi, type MoneyDto } from '@shared/api/baseApi';

export type OrderStatus = 'PENDING' | 'PAID' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface OrderDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePaid: MoneyDto;
  status: OrderStatus;
  deliveredItems: unknown[] | null;
  /** The product's redemption steps; shown beside the delivered item. */
  instructions: string | null;
  createdAt: string;
}

export interface PlaceOrderResponse {
  order: {
    id: string;
    productName: string;
    pricePaid: MoneyDto;
    deliveredItems: unknown[];
    /** Paid for, but the shop hands this product over by hand. */
    awaitingDelivery: boolean;
    instructions: string | null;
  };
  balance: MoneyDto;
}

export const orderApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getOrders: builder.query<OrderDto[], void>({
      query: () => '/orders',
      transformResponse: (response: { orders: OrderDto[] }) => response.orders,
      providesTags: ['Order'],
    }),
    placeOrder: builder.mutation<
      PlaceOrderResponse,
      { productId: string; customerInput?: string }
    >({
      query: (body) => ({ url: '/orders', method: 'POST', body }),
      // A purchase moves the balance, consumes stock and adds an order.
      invalidatesTags: ['Order', 'User', 'Product'],
    }),
  }),
});

export const { useGetOrdersQuery, usePlaceOrderMutation } = orderApi;
