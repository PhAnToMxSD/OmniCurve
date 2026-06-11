import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function usePortfolio(address: string | undefined) {
  return useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => api.getPortfolio(address!),
    enabled: !!address,
    // The backend indexes chain events with a few seconds of lag, so a single
    // refetch right after a trade confirms can still return stale data — poll
    // so the dashboard picks up new positions without a manual reload.
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}
