import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useMarket(id: string | undefined) {
  return useQuery({
    queryKey: ['market', id],
    queryFn: () => api.getMarket(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 15_000,
  })
}
