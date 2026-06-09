/**
 * Turn a raw wallet/viem error into a short, human message.
 *
 * Two problems this solves:
 *  1. A user clicking "reject" in their wallet is NOT an error — it dumps a giant
 *     "User rejected the request. Request Arguments: …" blob. We detect it and show
 *     a calm one-liner (and callers can style it neutrally via `isUserRejection`).
 *  2. Contract reverts surface as opaque viem messages. We map the known revert
 *     strings from the OmniCurve contracts to plain English.
 */

// Revert reason strings emitted by the contracts → friendly copy.
const KNOWN_REVERTS: Record<string, string> = {
  InsufficientLiquidity: 'Not enough liquidity in the pool to back this trade.',
  VarianceTooLow: 'Sigma is below the market minimum.',
  TradesAlreadyStarted: 'The curve is locked — trading has already started.',
  'Price is zero': 'Price rounds to zero at this strike — pick a strike closer to μ.',
  'Zero tokens': 'Stake is too small to mint any tokens.',
  ZeroAmount: 'Enter an amount greater than zero.',
  Reentrancy: 'Another transaction is still in progress — try again in a moment.',
  Unauthorized: 'Your wallet is not authorized to perform this action.',
  MarketNotResolved: 'This market has not been resolved yet.',
  PositionDidNotWin: 'This position did not win.',
  NoWinningTokens: 'You have no winning tokens to claim here.',
  UsdcTransferFailed: 'USDC transfer failed — check your balance and approval.',
  InsufficientBalance: 'Insufficient balance.',
  'Already resolved': 'This market is already resolved.',
  'transfer amount exceeds balance': 'Insufficient USDC balance.',
  'transfer amount exceeds allowance': 'USDC approval is too low — approve again.',
}

/** True when the failure is the user declining the signature in their wallet. */
export function isUserRejection(error: unknown): boolean {
  if (!error) return false
  const e = error as { code?: number; name?: string; shortMessage?: string; message?: string }
  if (e.code === 4001) return true
  if (e.name === 'UserRejectedRequestError') return true
  const msg = `${e.shortMessage ?? ''} ${e.message ?? ''}`
  return /user rejected|user denied|denied transaction signature|rejected the request/i.test(msg)
}

/** Concise, user-facing message for any wallet/contract error. */
export function formatTxError(error: unknown): string {
  if (!error) return 'Transaction failed.'
  if (isUserRejection(error)) return 'Transaction rejected in your wallet.'

  const e = error as { shortMessage?: string; message?: string; details?: string }
  const haystack = `${e.shortMessage ?? ''} ${e.details ?? ''} ${e.message ?? ''}`

  for (const [key, friendly] of Object.entries(KNOWN_REVERTS)) {
    if (haystack.includes(key)) return friendly
  }

  // Prefer viem's shortMessage; otherwise the first line of the raw message,
  // trimmed so we never render the multi-line "Request Arguments" dump.
  const concise = (e.shortMessage ?? e.message ?? 'Transaction failed.').split('\n')[0].trim()
  return concise.length > 160 ? `${concise.slice(0, 157)}…` : concise
}
