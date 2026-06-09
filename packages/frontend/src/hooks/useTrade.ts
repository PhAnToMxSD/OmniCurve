import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { maxUint256 } from 'viem'
import { USDC_ADDRESS, USDC_ABI, ROUTER_ABI } from '@/config/contracts'
import { floatToWad } from '@/lib/math'
import { estimateGasLimit } from '@/lib/gas'

export type TradeStep = 'idle' | 'approving' | 'approved' | 'buying' | 'confirmed' | 'error'

interface TradeParams {
  direction: 'yes' | 'no'
  strikeX: number
  // Raw USDC (6 decimals) the user stakes. The contract derives the token
  // amount itself and carves the 1% fee out of this stake.
  stakeUsdc: bigint
}

interface UseTradeOptions {
  marketId: string
  routerAddress: string
}

export function useTrade({ marketId, routerAddress }: UseTradeOptions) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<TradeStep>('idle')
  const [pendingParams, setPendingParams] = useState<TradeParams | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [error, setError] = useState<Error | undefined>()

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [address!, routerAddress as `0x${string}`],
    query: { enabled: !!address },
  })

  const { writeContractAsync } = useWriteContract()

  const getGasFees = useCallback(async () => {
    if (!publicClient) return {}
    try {
      const block = await publicClient.getBlock()
      const baseFee = block.baseFeePerGas ?? 0n
      return {
        maxFeePerGas: baseFee * 2n + 1_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
      }
    } catch {
      return {}
    }
  }, [publicClient])

  const { isLoading: isWaitingForTx } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash && (step === 'approving' || step === 'buying'),
    },
  })

  const execute = useCallback(
    async (params: TradeParams) => {
      if (!address) return
      setError(undefined)
      setPendingParams(params)

      try {
        const gasFees = await getGasFees()
        // Check allowance — the router pulls exactly stakeUsdc from the user.
        const currentAllowance = allowance ?? 0n
        if (currentAllowance < params.stakeUsdc) {
          setStep('approving')
          const approveTx = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: 'approve',
            args: [routerAddress as `0x${string}`, maxUint256],
            ...gasFees,
          })
          setTxHash(approveTx)
          await publicClient!.waitForTransactionReceipt({ hash: approveTx })
          await refetchAllowance()
        }

        setStep('buying')
        const targetPriceWad = floatToWad(params.strikeX)
        const fn = params.direction === 'yes' ? 'buyYes' : 'buyNo'
        const buyArgs = [targetPriceWad, params.stakeUsdc] as const
        // Explicit gas limit — MetaMask can't reliably estimate gas for the Stylus
        // router, which surfaces as "Network fee — Unavailable" and blocks the send.
        const gas = await estimateGasLimit(publicClient, {
          address: routerAddress as `0x${string}`,
          abi: ROUTER_ABI,
          functionName: fn,
          args: buyArgs,
          account: address,
        })
        // buyYes/buyNo(target_price_wad, stake_usdc_6dec)
        const tradeTx = await writeContractAsync({
          address: routerAddress as `0x${string}`,
          abi: ROUTER_ABI,
          functionName: fn,
          args: buyArgs,
          ...gasFees,
          gas,
        })
        setTxHash(tradeTx)
        setStep('confirmed')

        queryClient.invalidateQueries({ queryKey: ['market', marketId] })
        queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Transaction failed'))
        setStep('error')
      }
    },
    [address, allowance, routerAddress, marketId, writeContractAsync, refetchAllowance, queryClient, getGasFees],
  )

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(undefined)
    setError(undefined)
    setPendingParams(null)
  }, [])

  return {
    step,
    execute,
    reset,
    txHash,
    error,
    isWaitingForTx,
    pendingParams,
  }
}
