import { useEffect, useState } from 'react'
import { socket, joinMarket, leaveMarket } from '@/lib/socket'

interface LiveState {
  currentMu: number
  currentSigma: number
  totalLiquidity: number
}

export function useMarketSocket(id: string | undefined) {
  const [liveState, setLiveState] = useState<LiveState | null>(null)
  const [isResolved, setIsResolved] = useState(false)
  const [winningTokenId, setWinningTokenId] = useState<'1' | '2' | null>(null)

  useEffect(() => {
    if (!id) return

    joinMarket(id)

    const onStateUpdated = (data: LiveState) => {
      setLiveState(data)
    }

    const onResolved = (data: { winningTokenId: string }) => {
      setIsResolved(true)
      setWinningTokenId(data.winningTokenId as '1' | '2')
    }

    const onSnapshot = (data: LiveState & { isResolved?: boolean; winningTokenId?: string }) => {
      setLiveState({
        currentMu: data.currentMu,
        currentSigma: data.currentSigma,
        totalLiquidity: data.totalLiquidity,
      })
      if (data.isResolved) {
        setIsResolved(true)
        if (data.winningTokenId) setWinningTokenId(data.winningTokenId as '1' | '2')
      }
    }

    socket.on('marketStateUpdated', onStateUpdated)
    socket.on('marketResolved', onResolved)
    socket.on('marketSnapshot', onSnapshot)

    return () => {
      leaveMarket(id)
      socket.off('marketStateUpdated', onStateUpdated)
      socket.off('marketResolved', onResolved)
      socket.off('marketSnapshot', onSnapshot)
    }
  }, [id])

  return { liveState, isResolved, winningTokenId }
}
