import { Link } from 'react-router-dom'
import { GaussianChart } from './GaussianChart'
import { Badge } from '@/components/ui/Badge'
import type { Market } from '@/lib/api'

interface MarketCardProps {
  market: Market
}

export function MarketCard({ market }: MarketCardProps) {
  const mu = market.currentMu
  const sigma = market.currentSigma

  return (
    <Link
      to={`/markets/${market.marketId}`}
      className="group block bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded hover:border-[rgba(255,184,0,0.25)] hover:bg-[rgba(255,184,0,0.02)] transition-all duration-200"
    >
      {/* Mini chart */}
      <div className="h-[90px] overflow-hidden px-2 pt-2 opacity-80 group-hover:opacity-100 transition-opacity">
        <GaussianChart mu={mu} sigma={sigma} height={90} mini />
      </div>

      <div className="px-4 pb-4 pt-3">
        {/* Title + badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-display font-600 text-[#E2DDD4] text-sm leading-snug line-clamp-2 group-hover:text-white transition-colors">
            {market.title}
          </h3>
          {market.isResolved ? (
            <Badge variant="resolved">Resolved</Badge>
          ) : (
            <Badge variant="live">Live</Badge>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-0.5">
              μ
            </p>
            <p className="font-mono text-xs text-[#FFB800]">{mu.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-0.5">
              σ
            </p>
            <p className="font-mono text-xs text-[rgba(226,221,212,0.6)]">{sigma.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-0.5">
              TVL
            </p>
            <p className="font-mono text-xs text-[rgba(226,221,212,0.6)]">
              ${market.totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Category */}
        <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between">
          <span className="text-[10px] font-mono text-[rgba(226,221,212,0.3)] uppercase tracking-widest">
            {market.category}
          </span>
          <span className="text-[10px] font-mono text-[rgba(226,221,212,0.3)]">
            #{market.marketId}
          </span>
        </div>
      </div>
    </Link>
  )
}
