import { useState } from 'react'
import { useAccount } from 'wagmi'
import { StrikeSlider } from './StrikeSlider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePriceSocket } from '@/hooks/usePriceSocket'
import { useTrade } from '@/hooks/useTrade'
import { usdcDisplayToRaw } from '@/lib/math'
import { formatTxError, isUserRejection } from '@/lib/errors'
import type { Market } from '@/lib/api'

interface StakerPanelProps {
  market: Market
  onStrikeChange?: (x: number) => void
}

export function StakerPanel({ market, onStrikeChange }: StakerPanelProps) {
  const { address } = useAccount()
  const mu = market.currentMu
  const sigma = market.currentSigma

  const [strikeX, setStrikeX] = useState(mu)
  const [direction, setDirection] = useState<'yes' | 'no'>('yes')
  const [stakeAmount, setStakeAmount] = useState('')

  const { pYes, pNo, isLoading: priceLoading } = usePriceSocket({
    marketId: market.marketId,
    x: strikeX,
    direction,
    mu,
    sigma,
  })

  const { step, execute, reset, txHash, error } = useTrade({
    marketId: market.marketId,
    routerAddress: market.routerAddress,
  })

  const stake = parseFloat(stakeAmount) || 0
  const prob = direction === 'yes' ? pYes : pNo
  // Contract semantics: the user pays the full `stake`; a 1% fee is carved out,
  // and tokens are minted from the net (99%) at the current curve price.
  const feeCost = stake * 0.01
  const netStake = stake - feeCost
  const tokensOut = prob > 0 ? netStake / prob : 0

  const handleStrikeChange = (v: number) => {
    setStrikeX(v)
    onStrikeChange?.(v)
  }

  const handleExecute = async () => {
    if (!address || stake <= 0) return
    // Pass the full stake as raw USDC (6 decimals); the contract derives tokens.
    await execute({
      direction,
      strikeX,
      stakeUsdc: usdcDisplayToRaw(stake),
    })
  }

  const isConfirmed = step === 'confirmed'
  const isWorking = step === 'approving' || step === 'buying'

  if (market.isResolved) {
    return (
      <div className="p-6 text-center">
        <p className="font-mono text-sm text-[rgba(226,221,212,0.4)]">
          Market resolved — trading closed.
        </p>
        {market.winningTokenId && (
          <p className="mt-2 font-mono text-base text-[#22D3A3]">
            {market.winningTokenId === 1 ? 'YES' : 'NO'} Won
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5 p-5">
      {/* Strike slider */}
      <StrikeSlider
        value={strikeX}
        min={mu - 3 * sigma}
        max={mu + 3 * sigma}
        mu={mu}
        sigma={sigma}
        onChange={handleStrikeChange}
      />

      {/* Direction toggle */}
      <div>
        <p className="text-xs font-display tracking-wider text-[rgba(226,221,212,0.45)] uppercase mb-2">
          Direction
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDirection('yes')}
            className={`py-2.5 rounded border text-sm font-mono transition-all ${
              direction === 'yes'
                ? 'bg-[rgba(34,211,163,0.12)] border-[rgba(34,211,163,0.4)] text-[#22D3A3]'
                : 'border-[rgba(255,255,255,0.08)] text-[rgba(226,221,212,0.4)] hover:border-[rgba(34,211,163,0.2)]'
            }`}
          >
            YES ↑
          </button>
          <button
            onClick={() => setDirection('no')}
            className={`py-2.5 rounded border text-sm font-mono transition-all ${
              direction === 'no'
                ? 'bg-[rgba(255,69,96,0.12)] border-[rgba(255,69,96,0.4)] text-[#FF4560]'
                : 'border-[rgba(255,255,255,0.08)] text-[rgba(226,221,212,0.4)] hover:border-[rgba(255,69,96,0.2)]'
            }`}
          >
            NO ↓
          </button>
        </div>
      </div>

      {/* Amount */}
      <Input
        label="Amount"
        type="number"
        placeholder="0.00"
        suffix="USDC"
        value={stakeAmount}
        onChange={(e) => setStakeAmount(e.target.value)}
        min="0"
        step="1"
      />

      {/* Price preview */}
      {stake > 0 && (
        <div className="rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-1">
                P(YES)
              </p>
              <p className={`font-mono text-sm ${priceLoading ? 'opacity-50' : ''} text-[#22D3A3]`}>
                {(pYes * 100).toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-1">
                P(NO)
              </p>
              <p className={`font-mono text-sm ${priceLoading ? 'opacity-50' : ''} text-[#FF4560]`}>
                {(pNo * 100).toFixed(2)}%
              </p>
            </div>
          </div>
          <div className="border-t border-[rgba(255,255,255,0.05)] pt-3 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[rgba(226,221,212,0.45)]">Total cost</span>
              <span className="text-[#FFB800]">${stake.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[rgba(226,221,212,0.45)]">Fee (1%)</span>
              <span className="text-[rgba(226,221,212,0.4)]">${feeCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[rgba(255,255,255,0.05)]">
              <span className="text-[rgba(226,221,212,0.45)]">Tokens out</span>
              <span className="text-[#E2DDD4]">{tokensOut.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error — wallet rejections render neutrally, real failures in red */}
      {error && (
        <p
          className={`text-xs font-mono rounded p-3 border ${
            isUserRejection(error)
              ? 'text-[rgba(226,221,212,0.6)] bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.1)]'
              : 'text-[#FF4560] bg-[rgba(255,69,96,0.08)] border-[rgba(255,69,96,0.2)]'
          }`}
        >
          {formatTxError(error)}
        </p>
      )}

      {/* CTA */}
      {!address ? (
        <p className="text-xs font-mono text-center text-[rgba(226,221,212,0.35)]">
          Connect wallet to trade
        </p>
      ) : isConfirmed ? (
        <div className="text-center space-y-2">
          <p className="text-sm font-mono text-[#22D3A3]">Trade confirmed!</p>
          {txHash && (
            <a
              href={`https://sepolia.arbiscan.io/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-[rgba(226,221,212,0.4)] hover:text-[#FFB800]"
            >
              View on Arbiscan ↗
            </a>
          )}
          <Button variant="muted" size="sm" onClick={reset} className="w-full">
            New Trade
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Step indicator */}
          {isWorking && (
            <div className="flex items-center justify-center gap-3 text-xs font-mono text-[rgba(226,221,212,0.4)] py-1">
              <span className={step === 'approving' ? 'text-[#FFB800]' : 'opacity-40'}>Approve</span>
              <span className="opacity-20">→</span>
              <span className={step === 'buying' ? 'text-[#FFB800]' : 'opacity-40'}>Confirm</span>
              <span className="opacity-20">→</span>
              <span className="opacity-40">Done</span>
            </div>
          )}
          <Button
            variant={direction === 'yes' ? 'ghost' : 'danger'}
            className={`w-full ${direction === 'yes' ? 'border-[#22D3A3] text-[#22D3A3] hover:bg-[rgba(34,211,163,0.08)]' : ''}`}
            loading={isWorking}
            disabled={!stake || isWorking}
            onClick={handleExecute}
          >
            {step === 'approving'
              ? 'Approving USDC...'
              : step === 'buying'
                ? 'Confirming...'
                : `Buy ${direction.toUpperCase()}`}
          </Button>
        </div>
      )}
    </div>
  )
}
