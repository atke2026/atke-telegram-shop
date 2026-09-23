import { baseApi, type MoneyDto } from '@shared/api/baseApi';
import { appPath } from '@shared/lib/appPath';

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
  /** Something the buyer must supply before paying; null on most products. */
  input: { type: 'TEXT' | 'NUMBER'; placeholder: string | null } | null;
}

export const productApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<ProductDto[], void>({
      query: () => '/products',
      transformResponse: (response: { products: ProductDto[] }) =>
        response.products.map((product) => ({
          ...product,
          logoUrl: appPath(product.logoUrl),
        })),
      providesTags: ['Product'],
    }),
  }),
});

export const { useGetProductsQuery } = productApi;
