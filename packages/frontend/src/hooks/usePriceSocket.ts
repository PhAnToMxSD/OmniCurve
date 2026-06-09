import { useEffect, useRef, useState } from 'react'
import { socket, requestPrice } from '@/lib/socket'
import { pYes as localPYes, pNo as localPNo } from '@/lib/math'

interface PriceSocketParams {
  marketId: string | undefined
  x: number
  direction: 'yes' | 'no'
  mu: number
  sigma: number
}

interface PriceResult {
  pYes: number
  pNo: number
  isLoading: boolean
}

export function usePriceSocket({ marketId, x, direction, mu, sigma }: PriceSocketParams): PriceResult {
  const [serverPrice, setServerPrice] = useState<{ pYes: number; pNo: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!marketId) return

    const onPriceUpdate = (data: { pYes: number; pNo: number; marketId: string }) => {
      if (data.marketId === marketId) {
        setServerPrice({ pYes: data.pYes, pNo: data.pNo })
        setIsLoading(false)
      }
    }

    socket.on('priceUpdate', onPriceUpdate)
    return () => {
      socket.off('priceUpdate', onPriceUpdate)
    }
  }, [marketId])

  useEffect(() => {
    if (!marketId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setIsLoading(true)
    debounceRef.current = setTimeout(() => {
      requestPrice({ marketId, x, direction })
    }, 50)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [marketId, x, direction])

  const localYes = localPYes(x, mu, sigma)
  const localNo = localPNo(x, mu, sigma)

  return {
    pYes: serverPrice?.pYes ?? localYes,
    pNo: serverPrice?.pNo ?? localNo,
    isLoading,
  }
}
