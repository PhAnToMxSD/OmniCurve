import { useState } from 'react'
import { GaussianChart } from '@/components/market/GaussianChart'
import { Slider } from '@/components/ui/Slider'
import { pYes, pNo, gaussianCDF } from '@/lib/math'

const SECTIONS = [
  { id: 'problem', label: 'The Problem' },
  { id: 'solution', label: 'The Solution' },
  { id: 'pricing', label: 'How Pricing Works' },
  { id: 'traders', label: 'For Traders' },
  { id: 'lps', label: 'For LPs' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'risks', label: 'Known Risks' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 mb-16">
      <h2 className="font-display font-700 text-2xl text-[#E2DDD4] mb-6 pb-3 border-b border-[rgba(255,255,255,0.06)]">
        {title}
      </h2>
      <div className="space-y-4 text-[rgba(226,221,212,0.7)] leading-relaxed font-serif">{children}</div>
    </section>
  )
}

function InteractivePricingChart() {
  const mu = 100
  const sigma = 15
  const [strike, setStrike] = useState(100)

  const py = pYes(strike, mu, sigma)
  const pn = pNo(strike, mu, sigma)

  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded p-5 space-y-4 not-italic">
      <GaussianChart mu={mu} sigma={sigma} strikeX={strike} height={200} />
      <Slider
        value={strike}
        min={mu - 3 * sigma}
        max={mu + 3 * sigma}
        step={0.5}
        onChange={setStrike}
        label={`Strike: ${strike.toFixed(1)}`}
      />
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="bg-[rgba(34,211,163,0.06)] border border-[rgba(34,211,163,0.15)] rounded p-3">
          <p className="text-[10px] font-display tracking-widest text-[rgba(34,211,163,0.6)] uppercase mb-1">P(YES)</p>
          <p className="font-mono text-xl text-[#22D3A3]">{(py * 100).toFixed(2)}%</p>
          <p className="text-xs font-mono text-[rgba(226,221,212,0.35)] mt-0.5">
            1 − CDF({strike.toFixed(0)}, μ, σ)
          </p>
        </div>
        <div className="bg-[rgba(255,69,96,0.06)] border border-[rgba(255,69,96,0.15)] rounded p-3">
          <p className="text-[10px] font-display tracking-widest text-[rgba(255,69,96,0.6)] uppercase mb-1">P(NO)</p>
          <p className="font-mono text-xl text-[#FF4560]">{(pn * 100).toFixed(2)}%</p>
          <p className="text-xs font-mono text-[rgba(226,221,212,0.35)] mt-0.5">
            CDF({strike.toFixed(0)}, μ, σ)
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Docs() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex gap-10">
      {/* Sticky sidebar */}
      <aside className="hidden lg:block w-52 flex-shrink-0">
        <div className="sticky top-24">
          <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.3)] uppercase mb-4">
            Contents
          </p>
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block px-3 py-2 text-xs font-display text-[rgba(226,221,212,0.45)] hover:text-[#E2DDD4] hover:bg-[rgba(255,255,255,0.03)] rounded transition-colors"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <div className="mb-12">
          <h1 className="font-display font-800 text-4xl text-[#E2DDD4] tracking-tight mb-3">
            Documentation
          </h1>
          <p className="font-serif italic text-[rgba(226,221,212,0.5)] text-lg">
            How OmniCurve works, from first principles to contract architecture.
          </p>
        </div>

        <Section id="problem" title="The Problem">
          <p>
            Traditional prediction markets create discrete binary pools: "Will BTC hit $100k? Yes/No." Each
            price point needs its own pool — fragmenting liquidity across hundreds of separate markets.
          </p>
          <p>
            A market-maker offering prices at $90k, $95k, $100k, $105k, and $110k needs five separate pools,
            each with its own liquidity providers and depth. This means capital is locked up inefficiently,
            and thin pools produce poor price discovery.
          </p>
        </Section>

        <Section id="solution" title="The Solution">
          <p>
            OmniCurve replaces N binary pools with a single pool governed by a{' '}
            <strong className="text-[#E2DDD4]">Gaussian probability distribution</strong>. One pool serves
            all strike prices simultaneously.
          </p>
          <div className="not-italic my-6">
            <GaussianChart mu={100} sigma={15} height={180} mini />
          </div>
          <p>
            Liquidity providers deposit once into the single pool and earn fees from all strikes. The
            distribution's mean (μ) represents the market's expected outcome, and sigma (σ) represents
            uncertainty. Both are set by LPs.
          </p>
        </Section>

        <Section id="pricing" title="How Pricing Works">
          <p>
            The probability of any outcome is derived from the cumulative distribution function (CDF) of
            the Gaussian distribution:
          </p>
          <div className="not-italic my-4 p-4 bg-[rgba(255,184,0,0.05)] border border-[rgba(255,184,0,0.15)] rounded font-mono text-sm">
            <p className="text-[#22D3A3]">P_YES(x) = 1 − CDF(x, μ, σ)</p>
            <p className="text-[#FF4560] mt-2">P_NO(x) = CDF(x, μ, σ)</p>
          </div>
          <p>
            Drag the slider below to see how the strike price changes the probability split between YES and NO:
          </p>
          <div className="my-6">
            <InteractivePricingChart />
          </div>
          <p>
            The CDF is computed entirely on-chain using an Abramowitz & Stegun 5-coefficient error function
            approximation, providing ~11 significant digits of precision with fixed-point (WAD, 1e18) arithmetic.
          </p>
        </Section>

        <Section id="traders" title="For Traders">
          <p>
            To trade on a market, choose a <strong className="text-[#E2DDD4]">strike price</strong> and a
            direction: <span className="text-[#22D3A3]">YES</span> (outcome exceeds strike) or{' '}
            <span className="text-[#FF4560]">NO</span> (outcome at or below strike).
          </p>
          <p>
            You pay USDC proportional to the probability. If the market resolves in your direction, you
            can redeem your tokens 1:1 for USDC. A 1% fee is deducted from each trade and distributed
            to liquidity providers.
          </p>
          <p>
            Settlement is currently manual — the market owner calls <code className="text-[#FFB800] font-mono text-sm">settleByPrice(finalPrice)</code>.
            A two-phase resolution with a 24-hour timelock provides a dispute window.
          </p>
        </Section>

        <Section id="lps" title="For Liquidity Providers">
          <p>
            Deposit USDC into a market's AMM contract to receive non-transferable LP tokens representing
            your share of the pool. Before the first trade, you can also set the distribution parameters
            (μ, σ) to shift the market's expected outcome.
          </p>
          <p>
            Fees from all trades are distributed to LPs using a{' '}
            <strong className="text-[#E2DDD4]">MasterChef-style accumulator</strong>: a global
            acc_fee_per_share value increases with each trade, and each LP's pending fees = their shares
            × acc_fee_per_share − their reward_debt.
          </p>
          <p>
            LP tokens are non-transferable by design — this simplifies fee accounting and prevents
            complex reward_debt migration logic.
          </p>
        </Section>

        <Section id="architecture" title="Architecture">
          <p>
            OmniCurve contracts are written in <strong className="text-[#E2DDD4]">Rust</strong> and
            compiled to <strong className="text-[#E2DDD4]">WASM</strong> using{' '}
            <strong className="text-[#E2DDD4]">Arbitrum Stylus SDK v0.10.7</strong>.
          </p>
          <p>
            Each market deploys three <strong className="text-[#E2DDD4]">EIP-1167 minimal proxy</strong>{' '}
            contracts via CREATE2: an AMM, a Router, and an LP Token. All proxies delegate to singleton
            implementation contracts, sharing code while maintaining independent storage.
          </p>
          <div className="not-italic my-4 p-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded font-mono text-xs text-[rgba(226,221,212,0.6)] space-y-1">
            <p>OmniCurveFactory</p>
            <p className="pl-4">├── AMM Implementation (singleton)</p>
            <p className="pl-4">├── Router Implementation (singleton)</p>
            <p className="pl-4">└── Market #N</p>
            <p className="pl-8">├── AMM Proxy ──DELEGATECALL──▶ AMM Impl</p>
            <p className="pl-8">└── Router Proxy ──DELEGATECALL──▶ Router Impl</p>
          </div>
        </Section>

        <Section id="risks" title="Known Risks">
          <div className="not-italic space-y-3">
            {[
              {
                level: 'High',
                color: '#FF4560',
                title: 'claim_fees WAD bug',
                desc: 'The claimFees function sends WAD amounts as USDC (missing /1e12 conversion). Trading fees may be permanently locked in the contract.',
              },
              {
                level: 'High',
                color: '#FF4560',
                title: 'Manual oracle',
                desc: 'Resolution is fully manual — the market owner calls settleByPrice(). There is no on-chain price oracle or automation.',
              },
              {
                level: 'Medium',
                color: '#FFB800',
                title: 'No slippage protection',
                desc: 'Trades have no maximum cost parameter. In theory, a price manipulation could result in overpayment.',
              },
              {
                level: 'Medium',
                color: '#FFB800',
                title: 'Non-upgradeable proxies',
                desc: 'EIP-1167 proxies cannot be upgraded. If a bug is found, a new market must be created and liquidity manually migrated.',
              },
            ].map((r) => (
              <div
                key={r.title}
                className="flex gap-3 p-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded"
              >
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded self-start flex-shrink-0 mt-0.5"
                  style={{ color: r.color, background: `${r.color}18`, border: `1px solid ${r.color}33` }}
                >
                  {r.level}
                </span>
                <div>
                  <p className="font-display font-600 text-sm text-[#E2DDD4] mb-1">{r.title}</p>
                  <p className="text-sm text-[rgba(226,221,212,0.55)]">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </main>
    </div>
  )
}
