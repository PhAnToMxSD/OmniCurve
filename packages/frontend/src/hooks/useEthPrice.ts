import { useQuery } from '@tanstack/react-query'

/**
 * Live ETH/USD spot price for the market chart's reference line.
 *
 * This is a demo/PoC convenience — OmniCurve has no on-chain oracle. The price is
 * shown purely as a vertical marker on the Gaussian chart so traders can compare the
 * market's belief (μ) against the real world. It does NOT drive pricing or settlement.
 *
 * Source: Coinbase public spot API (CORS-friendly, no key). Falls back to a constant
 * if the request fails so the chart line always renders.
 */
const FALLBACK_ETH_USD = 3500

async function fetchEthUsd(): Promise<number> {
  const res = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
  if (!res.ok) throw new Error(`spot fetch ${res.status}`)
  const json = (await res.json()) as { data?: { amount?: string } }
  const amount = Number(json?.data?.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('bad spot payload')
  return amount
}

export function useEthPrice() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['eth-spot-usd'],
    queryFn: fetchEthUsd,
    refetchInterval: 30_000,
    staleTime: 30_000,
    retry: 1,
  })

  return {
    ethUsd: data ?? FALLBACK_ETH_USD,
    isLive: data !== undefined,
    isLoading,
    error,
  }
}
