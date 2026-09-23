import { baseApi } from '@shared/api/baseApi';
import { appPath } from '@shared/lib/appPath';

export interface MaintenanceDto {
  enabled: boolean;
  message: string | null;
  /** Relative URL to the notice image, or null when none is set. */
  imageUrl: string | null;
}

export const maintenanceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMaintenance: builder.query<MaintenanceDto, void>({
      query: () => '/maintenance',
      transformResponse: (response: MaintenanceDto) => ({
        ...response,
        imageUrl: response.imageUrl ? appPath(response.imageUrl) : null,
      }),
      providesTags: ['Maintenance'],
    }),
  }),
});

export const { useGetMaintenanceQuery } = maintenanceApi;
