import { useState, useCallback } from 'react'
import { parseEventLogs } from 'viem'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FACTORY_ADDRESS, FACTORY_ABI, USDC_ADDRESS } from '@/config/contracts'
import { api } from '@/lib/api'
import { floatToWad } from '@/lib/math'
import { estimateGasLimit, getGasFees } from '@/lib/gas'

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

  const create = useCallback(
    async (sigmaMin: number, meta?: { title: string; category?: string }) => {
      setError(undefined)
      try {
        setStep('submitting')
        const sigmaMinWad = floatToWad(sigmaMin)
        // The market title is now stored immutably on-chain by the factory.
        const title = meta?.title ?? ''
        const gasFees = await getGasFees(publicClient)
        // createMarket deploys 3 proxies + wiring — heavy, and MetaMask can't estimate
        // gas for the Stylus factory. Provide an explicit limit (generous fallback).
        const gas = address
          ? await estimateGasLimit(
              publicClient,
              {
                address: FACTORY_ADDRESS,
                abi: FACTORY_ABI,
                functionName: 'createMarket',
                args: [USDC_ADDRESS, sigmaMinWad, title],
                account: address,
              },
              6_000_000n,
            )
          : 6_000_000n
        const tx = await writeContractAsync({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'createMarket',
          args: [USDC_ADDRESS, sigmaMinWad, title],
          ...gasFees,
          gas,
        })
        setTxHash(tx)
        // Wait for on-chain confirmation before marking done — catches reverts
        const receipt = await publicClient!.waitForTransactionReceipt({ hash: tx })
        if (receipt.status === 'reverted') {
          throw new Error('createMarket transaction reverted on-chain')
        }

        // The title is now stored on-chain by the factory, but we still mirror
        // title + category into the backend so its REST endpoints (markets list,
        // portfolio) and the category filter keep working without a chain read.
        // Pull the new market id from the MarketCreated log to do so.
        if (meta?.title) {
          try {
            const [created] = parseEventLogs({
              abi: FACTORY_ABI,
              logs: receipt.logs,
              eventName: 'MarketCreated',
            }) as unknown as { args: { market_id: bigint } }[]
            if (created) {
              const marketId = created.args.market_id.toString()
              // Retry a few times: the backend may briefly be busy (or its chain
              // watcher mid-upsert) right after the tx confirms, and a lost PATCH
              // leaves the market as "Market #N" forever.
              let lastErr: unknown
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  await api.updateMarketMetadata(marketId, meta)
                  lastErr = undefined
                  break
                } catch (err) {
                  lastErr = err
                  await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
                }
              }
              if (lastErr) throw lastErr
            }
          } catch (metaErr) {
            // Metadata is cosmetic — never fail the creation flow over it.
            console.warn('[createMarket] could not store market title:', metaErr)
          }
        }

        setStep('confirmed')
        queryClient.invalidateQueries({ queryKey: ['markets'] })
        navigate('/markets')
      } catch (e) {
        // Log the full error object so the raw revert bytes are visible in DevTools.
        console.error('[createMarket] revert — full error object:', e)
        // Also log individual fields viem puts on the error for easier inspection.
        if (e && typeof e === 'object') {
          const err = e as Record<string, unknown>
          console.error('[createMarket] shortMessage:', err.shortMessage)
          console.error('[createMarket] message:', err.message)
          console.error('[createMarket] details:', err.details)
          console.error('[createMarket] data:', err.data)
          if (err.cause) console.error('[createMarket] cause:', err.cause)
        }
        setError(e instanceof Error ? e : new Error('Transaction failed'))
        setStep('error')
      }
    },
    [address, writeContractAsync, publicClient, queryClient, navigate],
  )

  const reset = useCallback(() => {
    setStep('idle')
    setTxHash(undefined)
    setError(undefined)
  }, [])

  return { step, create, reset, txHash, error }
}
