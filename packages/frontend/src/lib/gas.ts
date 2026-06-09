import type { PublicClient } from 'viem'

/**
 * Explicit EIP-1559 fee override for Arbitrum Sepolia.
 *
 * Sepolia base fees fluctuate rapidly and wagmi's default multiplier frequently
 * produces a `maxFeePerGas` just below the next block's base fee — which makes the
 * transaction silently fail to be mined. We pin an explicit 2x buffer plus a flat
 * priority tip so every write goes out with a safe ceiling. Mirrors the logic the
 * useTrade / useLP / useCreateMarket hooks already use, so all txs are consistent.
 *
 * Returns `{}` on any failure so callers can spread it safely and fall back to
 * wagmi's estimation rather than blocking the transaction.
 */
export async function getGasFees(
  publicClient: PublicClient | undefined,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | Record<string, never>> {
  if (!publicClient) return {}
  try {
    const block = await publicClient.getBlock()
    const baseFee = block.baseFeePerGas ?? 0n
    return {
      maxFeePerGas: baseFee * 2n + 1_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
    }
  } catch {
    return {}
  }
}

interface GasEstimateRequest {
  address: `0x${string}`
  // Loosely typed: our JSON-imported ABIs aren't narrowed to viem's `Abi`, and we
  // cast to `any` for the estimate call below regardless.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any
  functionName: string
  args: readonly unknown[]
  account: `0x${string}`
}

/**
 * Estimate a gas LIMIT for a contract call, with a 1.5x buffer and a safe fallback.
 *
 * Why this matters: MetaMask estimates gas against its own RPC, which frequently
 * **fails for Arbitrum Stylus (WASM) contracts** — the wallet then shows
 * "Network fee — Unavailable" and refuses to send. Passing an explicit `gas` limit
 * sidesteps the wallet's estimation entirely, so the transaction goes through.
 *
 * We estimate via our own provider (which handles Stylus fine); if even that fails,
 * we fall back to a generous fixed limit. On Arbitrum the limit is only a ceiling —
 * you pay for gas actually used — so over-estimating is safe and cheap.
 */
export async function estimateGasLimit(
  publicClient: PublicClient | undefined,
  request: GasEstimateRequest,
  fallback = 3_000_000n,
): Promise<bigint> {
  if (!publicClient) return fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const est = await publicClient.estimateContractGas(request as any)
    return (est * 3n) / 2n
  } catch {
    return fallback
  }
}
