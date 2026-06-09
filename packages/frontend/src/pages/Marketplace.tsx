import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { useMarkets } from '@/hooks/useMarkets'
import { MarketCard } from '@/components/market/MarketCard'
import { CreateMarketModal } from '@/components/market/CreateMarketModal'
import { Button } from '@/components/ui/Button'

const CATEGORIES = ['All', 'Crypto', 'Macro', 'Sports', 'Other']

export default function Marketplace() {
  const { address } = useAccount()
  const [category, setCategory] = useState('All')
  const [showResolved, setShowResolved] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data: markets, isLoading, error } = useMarkets()

  const filtered = (markets ?? []).filter((m) => {
    if (category !== 'All' && m.category !== category) return false
    if (!showResolved && m.isResolved) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display font-800 text-3xl text-[#E2DDD4] tracking-tight">
            Markets
          </h1>
          <p className="text-sm font-serif italic text-[rgba(226,221,212,0.4)] mt-1">
            Continuous distribution prediction markets on Arbitrum
          </p>
        </div>
        {address && (
          <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
            + Create Market
          </Button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(226,221,212,0.3)]" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#E2DDD4] text-sm rounded placeholder:text-[rgba(226,221,212,0.25)] focus:outline-none focus:border-[rgba(255,184,0,0.4)]"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className={`px-3 py-2 text-xs font-mono rounded border transition-colors ${
              showResolved
                ? 'border-[rgba(255,184,0,0.3)] text-[#FFB800] bg-[rgba(255,184,0,0.08)]'
                : 'border-[rgba(255,255,255,0.08)] text-[rgba(226,221,212,0.4)] hover:border-[rgba(255,255,255,0.15)]'
            }`}
          >
            {showResolved ? '✓' : ''} Resolved
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 mb-8 border-b border-[rgba(255,255,255,0.06)] pb-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`relative px-4 py-2.5 text-xs font-display tracking-wider uppercase transition-colors ${
              category === cat
                ? 'text-[#E2DDD4]'
                : 'text-[rgba(226,221,212,0.35)] hover:text-[rgba(226,221,212,0.6)]'
            }`}
          >
            {cat}
            {category === cat && (
              <motion.div
                layoutId="market-tab"
                className="absolute bottom-0 left-0 right-0 h-px bg-[#FFB800]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[240px] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="font-mono text-sm text-[#FF4560]">Failed to load markets</p>
          <p className="font-mono text-xs text-[rgba(226,221,212,0.35)] mt-2">
            Make sure the backend is running on port 3001
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-mono text-sm text-[rgba(226,221,212,0.4)]">No markets found</p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {filtered.map((market) => (
            <motion.div
              key={market.marketId}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.3 }}
            >
              <MarketCard market={market} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <CreateMarketModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
