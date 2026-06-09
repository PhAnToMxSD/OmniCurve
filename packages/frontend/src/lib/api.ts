const BASE = ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error ?? res.statusText
    throw new ApiError(res.status, message)
  }
  const json = await res.json()
  // Unwrap the {success, data} envelope used by the backend
  if (json && typeof json === 'object' && 'success' in json) {
    if (!json.success) throw new ApiError(res.status, json.error ?? 'Request failed')
    return json.data as T
  }
  return json as T
}

export interface Market {
  marketId: string
  title: string
  category: string
  currentMu: number
  currentSigma: number
  totalLiquidity: number
  globalAccumulator: number
  minVarianceBound: number
  ammAddress: string
  routerAddress: string
  lpTokenAddress: string
  isResolved: boolean
  winningTokenId: number | null
  tradesStarted?: boolean
  ownerAddress?: string
}

export interface Position {
  positionId: string
  userAddress: string
  marketId: string
  targetValueX: number
  direction: 'ABOVE' | 'BELOW'
  tokensMinted: number
  stakeAmount: number
  market?: Market
}

export interface PricePreview {
  pYes: number
  pNo: number
  grossCostWad: number
  feeCostWad: number
}

export interface LpStats {
  lpTokenBalance: number
  accFeePerShare: number
  rewardDebt: number
  pendingRewards: number
}

export interface LpPosition {
  marketId: string
  marketTitle: string
  lpBalance: number
  pendingRewards: number
  market: Partial<Market>
}

export interface Portfolio {
  positions: (Position & { market: Market })[]
  lpPositions: LpPosition[]
  totalValue: number
}

export const api = {
  getMarkets(params?: { category?: string; active?: boolean }): Promise<Market[]> {
    const q = new URLSearchParams()
    if (params?.category) q.set('category', params.category)
    if (params?.active !== undefined) q.set('active', String(params.active))
    const qs = q.toString() ? `?${q}` : ''
    return request<Market[]>(`/api/markets${qs}`)
  },

  getMarket(id: string): Promise<Market & { positions: Position[] }> {
    return request(`/api/markets/${id}`)
  },

  getPricePreview(
    id: string,
    x: number,
    direction: 'yes' | 'no',
    stakeAmount?: number,
  ): Promise<PricePreview> {
    const q = new URLSearchParams({ x: String(x), direction })
    if (stakeAmount) q.set('stakeAmount', String(stakeAmount))
    return request(`/api/markets/${id}/price?${q}`)
  },

  getLpStats(id: string, address: string): Promise<LpStats> {
    return request(`/api/markets/${id}/lp-stats?address=${address}`)
  },

  getPortfolio(address: string): Promise<Portfolio> {
    return request(`/api/users/${address}/portfolio`)
  },
}
