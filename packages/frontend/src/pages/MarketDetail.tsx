import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { useMarket } from '@/hooks/useMarket'
import { useMarketSocket } from '@/hooks/useMarketSocket'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useEthPrice } from '@/hooks/useEthPrice'
import { GaussianChart } from '@/components/market/GaussianChart'
import { StakerPanel } from '@/components/market/StakerPanel'
import { LPPanel } from '@/components/market/LPPanel'
import { Tabs } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { shortAddr, floatToWad } from '@/lib/math'
import { getGasFees, estimateGasLimit } from '@/lib/gas'
import { AMM_ABI, ROUTER_ABI } from '@/config/contracts'

const TRADE_TABS = [
  { label: 'Trade', value: 'trade' },
  { label: 'Provide Liquidity', value: 'lp' },
]

export default function MarketDetail() {
  const { marketId } = useParams<{ marketId: string }>()
  const { address } = useAccount()
  const { data: market, isLoading, error } = useMarket(marketId)
  const { liveState, isResolved: socketResolved, winningTokenId } = useMarketSocket(marketId)
  const { data: portfolio } = usePortfolio(address)
  const { ethUsd } = useEthPrice()
  const [activeTab, setActiveTab] = useState('trade')
  const [strikeX, setStrikeX] = useState<number | undefined>()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-[rgba(255,255,255,0.03)] rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !market) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="font-mono text-[#FF4560]">Market not found</p>
      </div>
    )
  }

  const mu = liveState?.currentMu ?? market.currentMu
  const sigma = liveState?.currentSigma ?? market.currentSigma
  const liquidity = Math.max(0, liveState?.totalLiquidity ?? market.totalLiquidity)
  const resolved = socketResolved || market.isResolved
  const winId = winningTokenId ?? (market.winningTokenId ? String(market.winningTokenId) : null)
  const isOwner = !!address && !!market.ownerAddress &&
    address.toLowerCase() === market.ownerAddress.toLowerCase()

  const handleProposeResolution = async (winningId: number) => {
    const gasFees = await getGasFees(publicClient)
    const gas = address
      ? await estimateGasLimit(publicClient, {
          address: market.ammAddress as `0x${string}`,
          abi: AMM_ABI,
          functionName: 'proposeResolution',
          args: [BigInt(winningId)],
          account: address,
        })
      : undefined
    await writeContractAsync({
      address: market.ammAddress as `0x${string}`,
      abi: AMM_ABI,
      functionName: 'proposeResolution',
      args: [BigInt(winningId)],
      ...gasFees,
      ...(gas ? { gas } : {}),
    })
  }

  const handleExecuteResolution = async () => {
    const gasFees = await getGasFees(publicClient)
    const gas = address
      ? await estimateGasLimit(publicClient, {
          address: market.ammAddress as `0x${string}`,
          abi: AMM_ABI,
          functionName: 'executeResolution',
          args: [],
          account: address,
        })
      : undefined
    await writeContractAsync({
      address: market.ammAddress as `0x${string}`,
      abi: AMM_ABI,
      functionName: 'executeResolution',
      args: [],
      ...gasFees,
      ...(gas ? { gas } : {}),
    })
  }

  // Pull-based claim: the contract recreates the token_id from (target_x, is_yes),
  // verifies the position won against the final price, and pays out.
  const handleClaimWinnings = async (targetX: number, isYes: boolean) => {
    const gasFees = await getGasFees(publicClient)
    const claimArgs = [floatToWad(targetX), isYes] as const
    const gas = address
      ? await estimateGasLimit(publicClient, {
          address: market.routerAddress as `0x${string}`,
          abi: ROUTER_ABI,
          functionName: 'claimWinnings',
          args: claimArgs,
          account: address,
        })
      : undefined
    await writeContractAsync({
      address: market.routerAddress as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'claimWinnings',
      args: claimArgs,
      ...gasFees,
      ...(gas ? { gas } : {}),
    })
  }

  // The user's positions in this market on the winning side.
  const claimablePositions = (portfolio?.positions ?? []).filter(
    (p) =>
      String(p.marketId) === String(market.marketId) &&
      ((winId === '1' && p.direction === 'ABOVE') ||
        (winId === '2' && p.direction === 'BELOW')),
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            {resolved ? (
              <Badge variant="resolved">Resolved</Badge>
            ) : (
              <Badge variant="live">Live</Badge>
            )}
            <span className="text-xs font-mono text-[rgba(226,221,212,0.3)]">#{market.marketId}</span>
            <span className="text-xs font-mono text-[rgba(226,221,212,0.3)] uppercase">{market.category}</span>
          </div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-[#E2DDD4] tracking-tight leading-tight">
            {market.title}
          </h1>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap gap-6 py-3 border-y border-[rgba(255,255,255,0.06)]">
        <div>
          <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase">μ</p>
          <p className="font-mono text-lg text-[#FFB800]">{mu.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase">σ</p>
          <p className="font-mono text-lg text-[rgba(226,221,212,0.7)]">{sigma.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase">Liquidity</p>
          <p className="font-mono text-lg text-[rgba(226,221,212,0.7)]">
            ${liquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        {liveState && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3A3] animate-pulse" />
            <span className="text-xs font-mono text-[#22D3A3]">Live</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded p-4">
        <GaussianChart
          mu={mu}
          sigma={sigma}
          strikeX={strikeX}
          liquidity={liquidity}
          height={300}
          {...(String(market.marketId) === '0'
            ? { spotX: ethUsd, spotLabel: `ETH $${ethUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` }
            : {})}
        />
      </div>

      {/* Resolution banner */}
      {resolved && winId && (
        <div className={`rounded border p-4 flex items-center justify-between flex-wrap gap-3 ${
          winId === '1'
            ? 'bg-[rgba(34,211,163,0.06)] border-[rgba(34,211,163,0.2)]'
            : 'bg-[rgba(255,69,96,0.06)] border-[rgba(255,69,96,0.2)]'
        }`}>
          <div>
            <p className={`font-display font-600 text-sm ${winId === '1' ? 'text-[#22D3A3]' : 'text-[#FF4560]'}`}>
              Market Resolved — {winId === '1' ? 'YES' : 'NO'} Won
            </p>
            <p className="text-xs font-mono text-[rgba(226,221,212,0.4)] mt-0.5">
              Winning token holders can claim USDC
            </p>
          </div>
          {address && (
            claimablePositions.length > 0 ? (
              <div className="flex flex-col gap-2 items-end">
                {claimablePositions.map((p) => (
                  <Button
                    key={p.positionId}
                    variant={winId === '1' ? 'ghost' : 'danger'}
                    size="sm"
                    className={winId === '1' ? 'border-[#22D3A3] text-[#22D3A3]' : ''}
                    onClick={() => handleClaimWinnings(p.targetValueX, p.direction === 'ABOVE')}
                  >
                    Claim @ {p.targetValueX.toLocaleString()} ({p.tokensMinted.toFixed(2)} tokens)
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs font-mono text-[rgba(226,221,212,0.35)]">
                No winning positions to claim
              </p>
            )
          )}
        </div>
      )}

      {/* Owner controls */}
      {isOwner && !resolved && (
        <div className="border border-[rgba(255,184,0,0.15)] bg-[rgba(255,184,0,0.03)] rounded p-4">
          <p className="text-xs font-display tracking-widest text-[#FFB800] uppercase mb-3">
            Owner Controls
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => handleProposeResolution(1)}>
              Propose YES Win
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleProposeResolution(2)}>
              Propose NO Win
            </Button>
            <Button variant="muted" size="sm" onClick={handleExecuteResolution}>
              Execute Resolution
            </Button>
          </div>
        </div>
      )}

      {/* Trade / LP panels */}
      {!resolved && (
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded overflow-hidden">
          <Tabs tabs={TRADE_TABS} active={activeTab} onChange={setActiveTab} />
          {activeTab === 'trade' ? (
            <StakerPanel market={{ ...market, currentMu: mu, currentSigma: sigma }} onStrikeChange={setStrikeX} />
          ) : (
            <LPPanel market={{ ...market, currentMu: mu, currentSigma: sigma, totalLiquidity: liquidity }} />
          )}
        </div>
      )}

      {/* Market info */}
      <div className="border border-[rgba(255,255,255,0.06)] rounded p-5 space-y-3">
        <h3 className="font-display font-600 text-xs tracking-widest text-[rgba(226,221,212,0.4)] uppercase">
          Contract Addresses
        </h3>
        {[
          { label: 'AMM', addr: market.ammAddress },
          { label: 'Router', addr: market.routerAddress },
          { label: 'LP Token', addr: market.lpTokenAddress },
        ].map(({ label, addr }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-xs font-display text-[rgba(226,221,212,0.4)] uppercase tracking-wider">{label}</span>
            <a
              href={`https://sepolia.arbiscan.io/address/${addr}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-[rgba(226,221,212,0.6)] hover:text-[#FFB800] transition-colors"
            >
              {shortAddr(addr)} ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
