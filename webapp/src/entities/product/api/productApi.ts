import { baseApi, type MoneyDto } from '@shared/api/baseApi';

export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  details: string | null;
  stock: number;
  inStock: boolean;
  price: MoneyDto;
  /** Crossed-out original; null when no discount applies. */
  listPrice: MoneyDto | null;
  discountLabel: string | null;
  logoUrl: string;
}

export const productApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<ProductDto[], void>({
      query: () => '/products',
      transformResponse: (response: { products: ProductDto[] }) => response.products,
      providesTags: ['Product'],
    }),
  }),
});

export const { useGetProductsQuery } = productApi;
