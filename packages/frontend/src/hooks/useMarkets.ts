import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useMarkets(params?: { category?: string; active?: boolean }) {
  return useQuery({
    queryKey: ['markets', params],
    queryFn: () => api.getMarkets(params),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}
