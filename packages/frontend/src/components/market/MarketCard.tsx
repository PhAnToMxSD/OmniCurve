import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
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
    <motion.div
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
      whileTap={{ scale: 0.98 }}
    >
      <Link
        to={`/markets/${market.marketId}`}
        className="group block rounded border transition-all duration-200"
        style={{
          background: '#FFFFFF',
          borderColor: 'rgba(62,44,30,0.14)',
          boxShadow: '0 8px 28px rgba(62,44,30,0.10)',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'rgba(200,16,46,0.55)'
          el.style.boxShadow = '0 12px 36px rgba(200,16,46,0.20)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'rgba(62,44,30,0.14)'
          el.style.boxShadow = '0 8px 28px rgba(62,44,30,0.10)'
        }}
      >
        {/* Mini chart */}
        <div className="h-[90px] overflow-hidden px-2 pt-2 opacity-80 group-hover:opacity-100 transition-opacity">
          <GaussianChart mu={mu} sigma={sigma} height={90} mini />
        </div>

        <div className="px-4 pb-4 pt-3">
          {/* Title + badge */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3
              className="font-display font-600 text-sm leading-snug line-clamp-2 transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
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
              <p
                className="text-[9px] font-display tracking-widest uppercase mb-0.5"
                style={{ color: 'var(--text-subtle)' }}
              >
                μ
              </p>
              <p className="font-mono text-xs text-[#C8102E]">{mu.toLocaleString()}</p>
            </div>
            <div>
              <p
                className="text-[9px] font-display tracking-widest uppercase mb-0.5"
                style={{ color: 'var(--text-subtle)' }}
              >
                σ
              </p>
              <p
                className="font-mono text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                {sigma.toLocaleString()}
              </p>
            </div>
            <div>
              <p
                className="text-[9px] font-display tracking-widest uppercase mb-0.5"
                style={{ color: 'var(--text-subtle)' }}
              >
                TVL
              </p>
              <p
                className="font-mono text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                ${Math.max(0, market.totalLiquidity).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Category */}
          <div
            className="mt-3 pt-3 flex items-center"
            style={{ borderTop: '1px solid var(--border-dim)' }}
          >
            <span
              className="text-[10px] font-mono uppercase tracking-widest"
              style={{ color: 'var(--text-subtle)' }}
            >
              {market.category}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
