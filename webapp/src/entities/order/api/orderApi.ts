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
  createdAt: string;
}

export interface PlaceOrderResponse {
  order: {
    id: string;
    productName: string;
    pricePaid: MoneyDto;
    deliveredItems: unknown[];
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
    placeOrder: builder.mutation<PlaceOrderResponse, { productId: string }>({
      query: (body) => ({ url: '/orders', method: 'POST', body }),
      // A purchase moves the balance, consumes stock and adds an order.
      invalidatesTags: ['Order', 'User', 'Product'],
    }),
  }),
});

export const { useGetOrdersQuery, usePlaceOrderMutation } = orderApi;
