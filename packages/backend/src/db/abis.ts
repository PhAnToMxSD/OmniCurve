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
] as const;
