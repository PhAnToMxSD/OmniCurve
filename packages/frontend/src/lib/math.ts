// Abramowitz & Stegun 5-coefficient erf approximation — mirrors math_core.rs on-chain
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return sign * y
}

export function gaussianCDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return x < mu ? 0 : 1
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)))
}

export function gaussianPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0
  const z = (x - mu) / sigma
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
}

export function pYes(x: number, mu: number, sigma: number): number {
  return 1 - gaussianCDF(x, mu, sigma)
}

export function pNo(x: number, mu: number, sigma: number): number {
  return gaussianCDF(x, mu, sigma)
}

// WAD = 1e18 fixed-point
export function floatToWad(n: number): bigint {
  return BigInt(Math.round(n * 1e9)) * BigInt(1e9)
}

export function wadToFloat(w: bigint): number {
  return Number(w) / 1e18
}

// USDC has 6 decimals; WAD has 18
export function usdcToWad(usdc: bigint): bigint {
  return usdc * 1_000_000_000_000n
}

export function wadToUsdc(wad: bigint): bigint {
  return wad / 1_000_000_000_000n
}

// User-typed "$100.50" → 100_500_000n (raw USDC, 6 decimals)
export function usdcDisplayToRaw(n: number): bigint {
  return BigInt(Math.round(n * 1_000_000))
}

// Format USDC raw → display string "$1,234.56"
export function formatUsdc(raw: bigint, decimals = 2): string {
  const val = Number(raw) / 1e6
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)
}

// Format WAD as display number
export function formatWad(wad: bigint, decimals = 4): string {
  return wadToFloat(wad).toFixed(decimals)
}

// Short address display
export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
