import { useState, useCallback } from 'react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FACTORY_ADDRESS, FACTORY_ABI, USDC_ADDRESS } from '@/config/contracts'
import { floatToWad } from '@/lib/math'
import { estimateGasLimit } from '@/lib/gas'

export type CreateStep = 'idle' | 'submitting' | 'confirmed' | 'error'

export function useCreateMarket() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const publicClient = usePublicClient()
  const { address } = useAccount()
  const [step, setStep] = useState<CreateStep>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [error, setError] = useState<Error | undefined>()

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

  const create = useCallback(
    async (sigmaMin: number) => {
      setError(undefined)
      try {
        setStep('submitting')
        const sigmaMinWad = floatToWad(sigmaMin)
        const gasFees = await getGasFees()
        // createMarket deploys 3 proxies + wiring — heavy, and MetaMask can't estimate
        // gas for the Stylus factory. Provide an explicit limit (generous fallback).
        const gas = address
          ? await estimateGasLimit(
              publicClient,
              {
                address: FACTORY_ADDRESS,
                abi: FACTORY_ABI,
                functionName: 'createMarket',
                args: [USDC_ADDRESS, sigmaMinWad],
                account: address,
              },
              6_000_000n,
            )
          : 6_000_000n
        const tx = await writeContractAsync({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'createMarket',
          args: [USDC_ADDRESS, sigmaMinWad],
          ...gasFees,
          gas,
        })
        setTxHash(tx)
        // Wait for on-chain confirmation before marking done — catches reverts
        await publicClient!.waitForTransactionReceipt({ hash: tx })
        setStep('confirmed')
        queryClient.invalidateQueries({ queryKey: ['markets'] })
        navigate('/markets')
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Transaction failed'))
        setStep('error')
      }
    },
    [address, writeContractAsync, publicClient, queryClient, navigate, getGasFees],
  )

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(undefined)
    setError(undefined)
  }, [])

  return { step, create, reset, txHash, error }
}
