import { useState } from 'react'
import { formatEther } from 'viem'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { Tabs } from '@/components/ui/Tabs'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useLP } from '@/hooks/useLP'
import { api } from '@/lib/api'
import { floatToWad, wadToFloat } from '@/lib/math'
import { formatTxError, isUserRejection } from '@/lib/errors'
import { LP_TOKEN_ABI, AMM_ABI } from '@/config/contracts'
import type { Market } from '@/lib/api'

const TABS = [
  { label: 'Deposit', value: 'deposit' },
  { label: 'Withdraw', value: 'withdraw' },
  { label: 'Claim', value: 'claim' },
]

interface LPPanelProps {
  market: Market
}

export function LPPanel({ market }: LPPanelProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [tab, setTab] = useState('deposit')
  const [depositAmount, setDepositAmount] = useState('')
  const sigmaDefault = market.currentSigma > market.minVarianceBound ? market.currentSigma : ''
  const [targetMu, setTargetMu] = useState(market.currentMu > 0 ? String(market.currentMu) : '')
  const [targetSigma, setTargetSigma] = useState(sigmaDefault ? String(sigmaDefault) : '')
  const [withdrawAmount, setWithdrawAmount] = useState('')

  const { step, add, remove, claim, reset, txHash, error } = useLP({
    marketId: market.marketId,
    ammAddress: market.ammAddress,
  })

  const { data: totalSupply } = useReadContract({
    address: market.lpTokenAddress as `0x${string}`,
    abi: LP_TOKEN_ABI,
    functionName: 'totalSupply',
  })

  const { data: lpStats } = useQuery({
    queryKey: ['lp-stats', market.marketId, address],
    queryFn: () => api.getLpStats(market.marketId, address!),
    enabled: !!address,
    staleTime: 30_000,
  })

  const totalSupplyFloat = totalSupply ? wadToFloat(totalSupply) : 0
  // totalLiquidity is stored as a WAD float (e.g. 100.0 = 100 USDC) — no further division
  const totalLiqFloat = market.totalLiquidity

  const depositAmt = parseFloat(depositAmount) || 0
  const estimatedShares =
    totalSupplyFloat > 0 && totalLiqFloat > 0
      ? (depositAmt / totalLiqFloat) * totalSupplyFloat
      : depositAmt

  const lpBalance = lpStats?.lpTokenBalance ?? 0
  const withdrawAmt = parseFloat(withdrawAmount) || 0
  const estimatedUsdc =
    totalSupplyFloat > 0 ? (withdrawAmt / totalSupplyFloat) * totalLiqFloat : 0
  const exceedsBalance = withdrawAmt > lpBalance

  // Estimate the gas cost (in ETH) of the removeLiquidity transaction.
  const { data: withdrawGas } = useQuery({
    queryKey: ['withdraw-gas', market.marketId, address, withdrawAmt],
    enabled:
      !!address && !!publicClient && tab === 'withdraw' && withdrawAmt > 0 && !exceedsBalance,
    staleTime: 15_000,
    queryFn: async () => {
      const sharesWad = floatToWad(withdrawAmt)
      const [gasUnits, gasPrice] = await Promise.all([
        publicClient!.estimateContractGas({
          address: market.ammAddress as `0x${string}`,
          abi: AMM_ABI,
          functionName: 'removeLiquidity',
          args: [sharesWad],
          account: address!,
        }),
        publicClient!.getGasPrice(),
      ])
      return gasUnits * gasPrice
    },
  })

  const isWorking = step === 'approving' || step === 'submitting'
  const isConfirmed = step === 'confirmed'

  const parsedMu = parseFloat(targetMu)
  const parsedSigma = parseFloat(targetSigma)
  const sigmaError =
    !market.tradesStarted && targetSigma !== '' && parsedSigma <= market.minVarianceBound
      ? `σ must be > ${market.minVarianceBound} (contract minimum)`
      : undefined

  // For a fresh pool (tradesStarted=false), mu and sigma must both be set —
  // passing 0 for either causes an on-chain revert in the Gaussian math.
  const needsDistribution = !market.tradesStarted && (!(parsedMu > 0) || !(parsedSigma > 0))

  const handleDeposit = () => {
    if (!depositAmt || sigmaError || needsDistribution) return
    add(depositAmt, parsedMu, parsedSigma)
  }

  const handleWithdraw = () => {
    if (!withdrawAmt) return
    remove(floatToWad(withdrawAmt))
  }

  if (!address) {
    return (
      <div className="p-6 text-center">
        <p className="text-xs font-mono text-[rgba(226,221,212,0.35)]">
          Connect wallet to provide liquidity
        </p>
      </div>
    )
  }

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={(v) => { setTab(v); reset() }} />

      <div className="p-5 space-y-4">
        {/* LP Stats Bar */}
        {lpStats && (
          <div className="grid grid-cols-3 gap-3 text-center p-3 bg-[rgba(255,255,255,0.03)] rounded border border-[rgba(255,255,255,0.05)]">
            <div>
              <p className="text-[9px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-0.5">LP Balance</p>
              <p className="font-mono text-xs text-[#FFB800]">{lpStats.lpTokenBalance.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[9px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-0.5">Pending Fees</p>
              <p className="font-mono text-xs text-[#22D3A3]">${lpStats.pendingRewards.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[9px] font-display tracking-widest text-[rgba(226,221,212,0.35)] uppercase mb-0.5">Pool TVL</p>
              <p className="font-mono text-xs text-[rgba(226,221,212,0.6)]">${totalLiqFloat.toFixed(2)}</p>
            </div>
          </div>
        )}

        {tab === 'deposit' && (
          <>
            <Input
              label="Amount"
              type="number"
              placeholder="0.00"
              suffix="USDC"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            {!market.tradesStarted ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Target μ (required)"
                    type="number"
                    placeholder="e.g. 95000"
                    value={targetMu}
                    onChange={(e) => setTargetMu(e.target.value)}
                  />
                  <Input
                    label={`Target σ (min: ${market.minVarianceBound})`}
                    type="number"
                    placeholder={`> ${market.minVarianceBound}`}
                    value={targetSigma}
                    error={sigmaError}
                    onChange={(e) => setTargetSigma(e.target.value)}
                  />
                </div>
                {needsDistribution && depositAmt > 0 && (
                  <p className="text-xs font-mono text-[#FFB800] bg-[rgba(255,184,0,0.06)] border border-[rgba(255,184,0,0.2)] rounded p-2">
                    Set μ and σ above to initialize the pool distribution.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs font-mono text-[rgba(226,221,212,0.35)] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded p-3">
                Curve is locked after first trade — distribution parameters are ignored.
              </p>
            )}
            {depositAmt > 0 && (
              <div className="text-xs font-mono flex justify-between text-[rgba(226,221,212,0.4)]">
                <span>Est. LP tokens</span>
                <span className="text-[#E2DDD4]">{estimatedShares.toFixed(4)}</span>
              </div>
            )}
            <Button
              variant="primary"
              className="w-full"
              loading={isWorking}
              disabled={!depositAmt || isWorking || !!sigmaError || needsDistribution}
              onClick={handleDeposit}
            >
              {step === 'approving' ? 'Approving...' : 'Add Liquidity'}
            </Button>
          </>
        )}

        {tab === 'withdraw' && (
          <>
            <div className="flex items-center justify-between text-xs font-mono text-[rgba(226,221,212,0.4)]">
              <span>Your LP balance</span>
              <button
                type="button"
                className="font-mono text-[#FFB800] hover:underline disabled:no-underline disabled:opacity-50"
                disabled={lpBalance <= 0}
                onClick={() => setWithdrawAmount(String(lpBalance))}
              >
                {lpBalance.toFixed(4)} OCLP · Max
              </button>
            </div>
            <Input
              label="LP Token Amount"
              type="number"
              placeholder="0.00"
              value={withdrawAmount}
              error={exceedsBalance ? 'Amount exceeds your LP balance' : undefined}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            {withdrawAmt > 0 && !exceedsBalance && (
              <div className="space-y-1.5">
                <div className="text-xs font-mono flex justify-between text-[rgba(226,221,212,0.4)]">
                  <span>Est. USDC received</span>
                  <span className="text-[#FFB800]">${estimatedUsdc.toFixed(4)}</span>
                </div>
                <div className="text-xs font-mono flex justify-between text-[rgba(226,221,212,0.4)]">
                  <span>Est. network fee</span>
                  <span className="text-[rgba(226,221,212,0.6)]">
                    {withdrawGas ? `~${Number(formatEther(withdrawGas)).toFixed(6)} ETH` : '—'}
                  </span>
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full"
              loading={isWorking}
              disabled={!withdrawAmt || isWorking || exceedsBalance}
              onClick={handleWithdraw}
            >
              Remove Liquidity
            </Button>
          </>
        )}

        {tab === 'claim' && (
          <>
            <div className="p-4 rounded border border-[rgba(34,211,163,0.15)] bg-[rgba(34,211,163,0.04)]">
              <p className="text-xs font-display tracking-wider text-[rgba(226,221,212,0.45)] uppercase mb-1">
                Pending Fees
              </p>
              <p className="font-mono text-xl text-[#22D3A3]">
                ${lpStats?.pendingRewards.toFixed(6) ?? '0.000000'}
              </p>
              <p className="text-xs font-mono text-[rgba(226,221,212,0.35)] mt-1">
                USDC earned from trading fees
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full border-[#22D3A3] text-[#22D3A3] hover:bg-[rgba(34,211,163,0.08)]"
              loading={isWorking}
              disabled={isWorking}
              onClick={claim}
            >
              Claim Fees
            </Button>
          </>
        )}

        {error && (
          <p
            className={`text-xs font-mono rounded p-3 border ${
              isUserRejection(error)
                ? 'text-[rgba(226,221,212,0.6)] bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.1)]'
                : 'text-[#FF4560] bg-[rgba(255,69,96,0.08)] border-[rgba(255,69,96,0.2)]'
            }`}
          >
            {formatTxError(error)}
          </p>
        )}

        {isConfirmed && (
          <div className="text-center space-y-2">
            <p className="text-sm font-mono text-[#22D3A3]">Transaction confirmed!</p>
            {txHash && (
              <a
                href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-[rgba(226,221,212,0.4)] hover:text-[#FFB800] block"
              >
                View on Arbiscan ↗
              </a>
            )}
            <Button variant="muted" size="sm" onClick={reset} className="w-full">
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
