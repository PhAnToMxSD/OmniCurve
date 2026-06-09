import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { maxUint256 } from 'viem'
import { USDC_ADDRESS, USDC_ABI, AMM_ABI } from '@/config/contracts'
import { floatToWad } from '@/lib/math'
import { estimateGasLimit } from '@/lib/gas'

export type LPStep = 'idle' | 'approving' | 'submitting' | 'confirmed' | 'error'

interface UseLPOptions {
  marketId: string
  ammAddress: string
}

export function useLP({ marketId, ammAddress }: UseLPOptions) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<LPStep>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [error, setError] = useState<Error | undefined>()

  // Fetches current base fee and returns maxFeePerGas with a 2x buffer,
  // guarding against Arbitrum Sepolia's rapidly fluctuating gas price.
  const getGasFees = useCallback(async () => {
    if (!publicClient) return {}
    try {
      const block = await publicClient.getBlock()
      const baseFee = block.baseFeePerGas ?? 0n
      const maxFeePerGas = baseFee * 2n + 1_000_000n
      const maxPriorityFeePerGas = 1_000_000n
      return { maxFeePerGas, maxPriorityFeePerGas }
    } catch {
      return {}
    }
  }, [publicClient])

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [address!, ammAddress as `0x${string}`],
    query: { enabled: !!address },
  })

  const { writeContractAsync } = useWriteContract()

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['market', marketId] })
    queryClient.invalidateQueries({ queryKey: ['portfolio'] })
  }, [queryClient, marketId])

  const add = useCallback(
    async (amountUsdc: number, targetMu: number, targetSigma: number) => {
      if (!address) return
      setError(undefined)
      try {
        const amountWad = floatToWad(amountUsdc)
        const currentAllowance = allowance ?? 0n
        const costUsdc = BigInt(Math.round(amountUsdc * 1e6))
        const gasFees = await getGasFees()

        if (currentAllowance < costUsdc * 1_000_000_000_000n) {
          setStep('approving')
          const approveTx = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: 'approve',
            args: [ammAddress as `0x${string}`, maxUint256],
            ...gasFees,
          })
          await publicClient!.waitForTransactionReceipt({ hash: approveTx })
          await refetchAllowance()
        }

        setStep('submitting')
        const addArgs = [amountWad, floatToWad(targetMu), floatToWad(targetSigma)] as const
        const gas = await estimateGasLimit(publicClient, {
          address: ammAddress as `0x${string}`,
          abi: AMM_ABI,
          functionName: 'addLiquidity',
          args: addArgs,
          account: address,
        })
        const tx = await writeContractAsync({
          address: ammAddress as `0x${string}`,
          abi: AMM_ABI,
          functionName: 'addLiquidity',
          args: addArgs,
          ...gasFees,
          gas,
        })
        setTxHash(tx)
        setStep('confirmed')
        invalidate()
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Transaction failed'))
        setStep('error')
      }
    },
    [address, allowance, ammAddress, writeContractAsync, refetchAllowance, invalidate, getGasFees],
  )

  const remove = useCallback(
    async (sharesWad: bigint) => {
      if (!address) return
      setError(undefined)
      try {
        const gasFees = await getGasFees()
        setStep('submitting')
        const gas = await estimateGasLimit(publicClient, {
          address: ammAddress as `0x${string}`,
          abi: AMM_ABI,
          functionName: 'removeLiquidity',
          args: [sharesWad],
          account: address,
        })
        const tx = await writeContractAsync({
          address: ammAddress as `0x${string}`,
          abi: AMM_ABI,
          functionName: 'removeLiquidity',
          args: [sharesWad],
          ...gasFees,
          gas,
        })
        setTxHash(tx)
        setStep('confirmed')
        invalidate()
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Transaction failed'))
        setStep('error')
      }
    },
    [address, ammAddress, writeContractAsync, invalidate, getGasFees],
  )

  const claim = useCallback(async () => {
    if (!address) return
    setError(undefined)
    try {
      const gasFees = await getGasFees()
      setStep('submitting')
      const gas = await estimateGasLimit(publicClient, {
        address: ammAddress as `0x${string}`,
        abi: AMM_ABI,
        functionName: 'claimFees',
        args: [],
        account: address,
      })
      const tx = await writeContractAsync({
        address: ammAddress as `0x${string}`,
        abi: AMM_ABI,
        functionName: 'claimFees',
        args: [],
        ...gasFees,
        gas,
      })
      setTxHash(tx)
      setStep('confirmed')
      invalidate()
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Transaction failed'))
      setStep('error')
    }
  }, [address, ammAddress, writeContractAsync, invalidate, getGasFees])

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(undefined)
    setError(undefined)
  }, [])

  return { step, add, remove, claim, reset, txHash, error }
}
