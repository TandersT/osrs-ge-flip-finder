import { useQuery } from '@tanstack/react-query';
import type { AppConfig, ItemsResponse, TimeseriesPoint, Timestep } from '@osrs-flip/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

const DEFAULT_CONFIG: AppConfig = {
  captureRate: 0.1,
  offerOffset: 1,
  clientRefreshSeconds: 60,
  staleAfterSeconds: 1800,
};

/** Server-side .env knobs; falls back to defaults so the UI renders without it. */
export function useAppConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: () => fetchJson<AppConfig>('/api/config'),
    staleTime: Infinity,
  });
  return data ?? DEFAULT_CONFIG;
}

export function useItems(refreshSeconds: number) {
  return useQuery({
    queryKey: ['items'],
    queryFn: () => fetchJson<ItemsResponse>('/api/items'),
    refetchInterval: refreshSeconds * 1000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export interface TimeseriesResponse {
  data: TimeseriesPoint[];
  fetchedAt: number;
  upstreamStale: boolean;
}

export function useTimeseries(id: number, timestep: Timestep, enabled = true) {
  return useQuery({
    queryKey: ['timeseries', id, timestep],
    queryFn: () => fetchJson<TimeseriesResponse>(`/api/timeseries?id=${id}&timestep=${timestep}`),
    staleTime: 5 * 60_000,
    enabled,
  });
}
