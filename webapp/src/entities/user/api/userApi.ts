import { baseApi, type MoneyDto } from '@shared/api/baseApi';

export interface UserDto {
  id: string;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  balance: MoneyDto;
  /** Cosmetic only — the server re-checks on every admin route. */
  isAdmin: boolean;
}

export const userApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<UserDto, void>({
      query: () => '/me',
      transformResponse: (response: { user: UserDto }) => response.user,
      providesTags: ['User'],
    }),
  }),
});

export const { useGetMeQuery } = userApi;
