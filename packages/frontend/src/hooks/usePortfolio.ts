import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function usePortfolio(address: string | undefined) {
  return useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => api.getPortfolio(address!),
    enabled: !!address,
    staleTime: 30_000,
  })
}
