import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { useMarkets } from '@/hooks/useMarkets'
import { useTheme } from '@/hooks/useTheme'
import { MarketCard } from '@/components/market/MarketCard'
import { CreateMarketModal } from '@/components/market/CreateMarketModal'
import { Button } from '@/components/ui/Button'

const CATEGORIES = ['All', 'Crypto', 'Macro', 'Sports', 'Other']

const DARK = {
  heading:      'text-[#F2F2F2]',
  subheading:   'text-[rgba(242,242,242,0.60)]',
  searchBg:     'bg-[#1C1C1C] border-[rgba(255,255,255,0.18)] text-[#F2F2F2] placeholder:text-[rgba(242,242,242,0.40)] focus:border-[rgba(200,16,46,0.55)]',
  searchIcon:   'text-[rgba(242,242,242,0.50)]',
  resolvedOn:   'border-[rgba(200,16,46,0.50)] text-[#C8102E] bg-[rgba(200,16,46,0.12)]',
  resolvedOff:  'border-[rgba(255,255,255,0.18)] text-[rgba(242,242,242,0.60)] hover:border-[rgba(255,255,255,0.30)]',
  tabBorder:    'border-[rgba(255,255,255,0.15)]',
  tabActive:    'text-[#F2F2F2]',
  tabInactive:  'text-[rgba(242,242,242,0.50)] hover:text-[rgba(242,242,242,0.80)]',
  tabIndicator: 'bg-[#C8102E]',
  skeleton:     'bg-[#1C1C1C] border-[rgba(255,255,255,0.15)]',
  errorText:    'text-[#B42318]',
  errorSub:     'text-[rgba(242,242,242,0.55)]',
  emptyText:    'text-[rgba(242,242,242,0.55)]',
} as const

const LIGHT = {
  heading:      'text-[#231812]',
  subheading:   'text-[rgba(35,24,18,0.60)]',
  searchBg:     'bg-[#FDF8EE] border-[rgba(62,44,30,0.20)] text-[#231812] placeholder:text-[rgba(35,24,18,0.40)] focus:border-[rgba(200,16,46,0.50)]',
  searchIcon:   'text-[rgba(35,24,18,0.45)]',
  resolvedOn:   'border-[rgba(200,16,46,0.45)] text-[#C8102E] bg-[rgba(200,16,46,0.10)]',
  resolvedOff:  'border-[rgba(62,44,30,0.20)] text-[rgba(35,24,18,0.60)] hover:border-[rgba(62,44,30,0.30)]',
  tabBorder:    'border-[rgba(62,44,30,0.18)]',
  tabActive:    'text-[#231812]',
  tabInactive:  'text-[rgba(35,24,18,0.50)] hover:text-[rgba(35,24,18,0.80)]',
  tabIndicator: 'bg-[#C8102E]',
  skeleton:     'bg-white border-[rgba(62,44,30,0.14)]',
  errorText:    'text-[#B42318]',
  errorSub:     'text-[rgba(35,24,18,0.55)]',
  emptyText:    'text-[rgba(35,24,18,0.55)]',
} as const

export default function Marketplace() {
  const { address } = useAccount()
  const { isDark } = useTheme()
  const T = isDark ? DARK : LIGHT

  const [category, setCategory] = useState('All')
  const [showResolved, setShowResolved] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data: markets, isLoading, error } = useMarkets()

  // market.title is served by the backend, which reads it from the on-chain
  // Factory — so it is the immutable title without any per-card RPC call here.
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
          <h1 className={`font-display font-800 text-3xl tracking-tight transition-colors duration-300 ${T.heading}`}>
            Markets
          </h1>
          <p className={`text-sm font-serif italic mt-1 transition-colors duration-300 ${T.subheading}`}>
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
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-300 ${T.searchIcon}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-9 pr-4 py-2.5 border text-sm rounded transition-colors duration-300 focus:outline-none ${T.searchBg}`}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className={`px-3 py-2 text-xs font-mono rounded border transition-colors duration-200 ${
              showResolved ? T.resolvedOn : T.resolvedOff
            }`}
          >
            {showResolved ? '✓' : ''} Resolved
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className={`flex gap-1 mb-8 border-b pb-0 transition-colors duration-300 ${T.tabBorder}`}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`relative px-4 py-2.5 text-xs font-display tracking-wider uppercase transition-colors duration-200 ${
              category === cat ? T.tabActive : T.tabInactive
            }`}
          >
            {cat}
            {category === cat && (
              <motion.div
                layoutId="market-tab"
                className={`absolute bottom-0 left-0 right-0 h-px transition-colors duration-300 ${T.tabIndicator}`}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`h-[240px] border rounded animate-pulse transition-colors duration-300 ${T.skeleton}`} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className={`font-mono text-sm transition-colors duration-300 ${T.errorText}`}>Failed to load markets</p>
          <p className={`font-mono text-xs mt-2 transition-colors duration-300 ${T.errorSub}`}>
            Make sure the backend is running on port 3001
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className={`font-mono text-sm transition-colors duration-300 ${T.emptyText}`}>No markets found</p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
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
