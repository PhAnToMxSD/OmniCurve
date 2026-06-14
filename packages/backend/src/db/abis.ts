/**
 * Minimal ABI fragments for on-chain reads via viem.
 * Only includes the view/pure functions needed by the seed script and chain service.
 */

export const factoryAbi = [
  {
    type: 'function',
    name: 'getMarketCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarketAmm',
    inputs: [{ name: 'market_id', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarketRouter',
    inputs: [{ name: 'market_id', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarketLpToken',
    inputs: [{ name: 'market_id', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarketTitle',
    inputs: [{ name: 'market_id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'market_id', type: 'uint256', indexed: true },
      { name: 'amm', type: 'address', indexed: false },
      { name: 'router', type: 'address', indexed: false },
      { name: 'lp_token', type: 'address', indexed: false },
      { name: 'title', type: 'string', indexed: false },
    ],
  },
] as const;

export const ammAbi = [
  {
    type: 'function',
    name: 'globalMu',
    inputs: [],
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'globalSigma',
    inputs: [],
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'sigmaMin',
    inputs: [],
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isResolved',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'winningTokenId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'availableLiquidity',
    inputs: [],
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
  },
  // ─── Additional view functions (Section 3) ───
  {
    type: 'function',
    name: 'accFeePerShare',
    inputs: [],
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'rewardDebt',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lpToken',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  // ─── Events ───
  {
    type: 'event',
    name: 'CurveUpdated',
    inputs: [
      { name: 'new_mu', type: 'uint256', indexed: true },
      { name: 'new_sigma', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityAdded',
    inputs: [
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount_wad', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityRemoved',
    inputs: [
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount_wad', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'winning_id', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'FeeDistributed',
    inputs: [
      { name: 'amount_wad', type: 'uint256', indexed: false },
    ],
  },
] as const;

/**
 * Minimal ABI for the BinaryRouter proxy — events only.
 */
export const routerAbi = [
  {
    type: 'event',
    name: 'TradeExecuted',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'token_id', type: 'uint256', indexed: false },
      { name: 'target_price', type: 'int256', indexed: false },
      { name: 'is_yes', type: 'bool', indexed: false },
      { name: 'tokens_minted', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'final_price', type: 'int256', indexed: false },
    ],
  },
] as const;

/**
 * Minimal ABI for the LP Token (ERC-20) — balance and supply reads.
 */
export const lpTokenAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
