import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { usePortfolio } from '@/hooks/usePortfolio'
import { Badge } from '@/components/ui/Badge'

export default function UserDashboard() {
  const { address } = useAccount()
  const navigate = useNavigate()
  const { data: portfolio, isLoading } = usePortfolio(address)

  useEffect(() => {
    if (!address) navigate('/')
  }, [address, navigate])

  if (!address) return null

  const positions = portfolio?.positions ?? []
  const lpPositions = portfolio?.lpPositions ?? []
  const totalValue = portfolio?.totalValue ?? 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      {/* Wallet card */}
      <div className="flex items-center justify-between p-6 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded">
        <div>
          <p className="text-xs font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-1">
            Wallet
          </p>
          <p className="font-mono text-sm text-[#E2DDD4]">{address}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-1">
            Portfolio Value
          </p>
          <p className="font-mono text-2xl text-[#FFB800]">
            ${totalValue.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Positions table */}
      <section>
        <h2 className="font-display font-700 text-lg text-[#E2DDD4] mb-4">Open Positions</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-[rgba(255,255,255,0.03)] rounded animate-pulse" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-12 border border-[rgba(255,255,255,0.06)] rounded">
            <p className="font-mono text-sm text-[rgba(226,221,212,0.35)]">No open positions</p>
            <Link
              to="/markets"
              className="inline-block mt-3 text-xs font-mono text-[#FFB800] hover:underline"
            >
              Explore Markets →
            </Link>
          </div>
        ) : (
          <div className="border border-[rgba(255,255,255,0.06)] rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                  {['Market', 'Direction', 'Strike', 'Tokens', 'Value', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr
                    key={pos.positionId}
                    className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/markets/${pos.marketId}`}
                        className="font-display text-xs text-[#E2DDD4] hover:text-[#FFB800] line-clamp-1 transition-colors"
                      >
                        {pos.market?.title ?? `#${pos.marketId}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={pos.direction === 'ABOVE' ? 'yes' : 'no'}>
                        {pos.direction === 'ABOVE' ? 'YES' : 'NO'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[rgba(226,221,212,0.6)]">
                      {pos.targetValueX.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[rgba(226,221,212,0.6)]">
                      {pos.tokensMinted.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#FFB800]">
                      ${(pos.stakeAmount / 1e6).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {pos.market?.isResolved ? (
                        <Badge variant="resolved">Resolved</Badge>
                      ) : (
                        <Badge variant="live">Active</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* LP Positions table */}
      <section>
        <h2 className="font-display font-700 text-lg text-[#E2DDD4] mb-4">Liquidity Positions</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-14 bg-[rgba(255,255,255,0.03)] rounded animate-pulse" />
            ))}
          </div>
        ) : lpPositions.length === 0 ? (
          <div className="text-center py-12 border border-[rgba(255,255,255,0.06)] rounded">
            <p className="font-mono text-sm text-[rgba(226,221,212,0.35)]">No liquidity positions</p>
          </div>
        ) : (
          <div className="border border-[rgba(255,255,255,0.06)] rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                  {['Market', 'LP Balance', 'Pending Fees', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lpPositions.map((lp) => (
                  <tr
                    key={lp.marketId}
                    className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/markets/${lp.marketId}`}
                        className="font-display text-xs text-[#E2DDD4] hover:text-[#FFB800] line-clamp-1 transition-colors"
                      >
                        {lp.marketTitle ?? `#${lp.marketId}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[rgba(226,221,212,0.6)]">
                      {lp.lpBalance.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#FFB800]">
                      ${lp.pendingRewards.toFixed(4)}
                    </td>
                    <td className="px-4 py-3">
                      {lp.market?.isResolved ? (
                        <Badge variant="resolved">Resolved</Badge>
                      ) : (
                        <Badge variant="live">Active</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
