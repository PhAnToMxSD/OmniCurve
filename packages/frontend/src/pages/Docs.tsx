import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useSpring, useTransform, MotionValue } from 'framer-motion'
import { GaussianChart } from '@/components/market/GaussianChart'
import { Slider } from '@/components/ui/Slider'
import { pYes, pNo } from '@/lib/math'

/* ════════════════════════════════════════════════════════════════════════
   Stage geometry — fixed viewBox, ETH-price domain matching Market #0
   (prior μ=3500 σ=800; the verified on-chain trade: 2 USDC YES @ 3000
   moved μ 3500 → 3358 and σ 800 → 714).
   ════════════════════════════════════════════════════════════════════════ */

const VB_W = 1000
const VB_H = 560
const PLOT = { left: 70, right: 70, top: 70, bottom: 90 }
const PW = VB_W - PLOT.left - PLOT.right
const PH = VB_H - PLOT.top - PLOT.bottom
const BASE_Y = VB_H - PLOT.bottom
const DOMAIN: [number, number] = [600, 6400]
const PEAK = 0.86

const BET_X = 3000
const FINAL_X = 3200
const PRIOR_MU = 3500
const PRIOR_SIGMA = 800

const xToPx = (x: number) => PLOT.left + ((x - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * PW
const yToPx = (v: number) => BASE_Y - v * PH

const bell = (x: number, mu: number, sigma: number) => {
  const z = (x - mu) / sigma
  return Math.exp(-0.5 * z * z)
}

function linePath(mu: number, sigma: number, peak: number): string {
  const n = 120
  let d = ''
  for (let i = 0; i <= n; i++) {
    const x = DOMAIN[0] + ((DOMAIN[1] - DOMAIN[0]) * i) / n
    d += `${i === 0 ? 'M' : 'L'}${xToPx(x).toFixed(1)},${yToPx(bell(x, mu, sigma) * peak).toFixed(1)}`
  }
  return d
}

function areaPath(mu: number, sigma: number, peak: number, from: number, to: number): string {
  const lo = Math.max(DOMAIN[0], Math.min(from, to))
  const hi = Math.min(DOMAIN[1], Math.max(from, to))
  if (hi - lo < 1) return ''
  const n = 80
  let d = `M${xToPx(lo).toFixed(1)},${BASE_Y}`
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n
    d += `L${xToPx(x).toFixed(1)},${yToPx(bell(x, mu, sigma) * peak).toFixed(1)}`
  }
  return d + `L${xToPx(hi).toFixed(1)},${BASE_Y}Z`
}

const X_TICKS = [1000, 2000, 3000, 4000, 5000, 6000]

/* ── Fragmented binary pools (chapter 01) ───────────────────────────────── */

const FRAGMENTS = [
  { x: 2300, h: 0.3 },
  { x: 2900, h: 0.48 },
  { x: 3500, h: 0.58 },
  { x: 4100, h: 0.46 },
  { x: 4700, h: 0.34 },
  { x: 5300, h: 0.24 },
  { x: 5900, h: 0.18 },
]

function FragmentBar({ t, x, h, i }: { t: MotionValue<number>; x: number; h: number; i: number }) {
  const inS = 0.02 + i * 0.013
  const opacity = useTransform(t, [inS, inS + 0.035, 0.115, 0.165], [0, 1, 1, 0])
  const y = useTransform(t, [inS, inS + 0.05], [18, 0])
  const py = pYes(x, PRIOR_MU, PRIOR_SIGMA)
  const total = h * PH
  const noH = total * (1 - py)
  const yesH = total * py
  const bx = xToPx(x) - 18

  return (
    <motion.g style={{ opacity, y }}>
      <rect
        x={bx} y={BASE_Y - noH} width={36} height={noH}
        fill="rgba(180,35,24,0.25)" stroke="rgba(180,35,24,0.55)" strokeWidth={1}
      />
      <rect
        x={bx} y={BASE_Y - noH - 3 - yesH} width={36} height={yesH}
        fill="rgba(11,122,82,0.25)" stroke="rgba(11,122,82,0.55)" strokeWidth={1}
      />
      <text
        x={bx + 18} y={BASE_Y - noH - yesH - 12} textAnchor="middle"
        fontSize={10} fontFamily="'JetBrains Mono', monospace" fill="var(--chart-tick-text)"
      >
        Y/N
      </text>
    </motion.g>
  )
}

/* ── Crossfading caption (one per chapter) ──────────────────────────────── */

function Caption({
  t, win, num, title, children, foot,
}: {
  t: MotionValue<number>
  win: [number, number, number, number]
  num: string
  title: string
  children: React.ReactNode
  foot?: string
}) {
  const opacity = useTransform(t, win, [0, 1, 1, 0])
  const y = useTransform(t, win, [28, 0, 0, -18])

  return (
    <motion.div
      style={{ opacity, y, background: '#FDF8EE', boxShadow: '0 10px 32px rgba(62,44,30,0.14)' }}
      className="absolute left-4 right-4 bottom-6 sm:left-10 sm:right-auto sm:bottom-10 sm:max-w-md border border-[rgba(62,44,30,0.18)] rounded p-5 sm:p-6 pointer-events-none"
    >
      <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#C8102E] mb-2">
        {num}
      </p>
      <h3 className="font-display font-700 text-lg sm:text-xl mb-2 text-[#231812]">
        {title}
      </h3>
      <p className="font-serif text-sm sm:text-[15px] leading-relaxed text-[rgba(35,24,18,0.85)]">
        {children}
      </p>
      {foot && (
        <p className="font-mono text-[10px] leading-relaxed mt-3 pt-3 border-t border-[rgba(62,44,30,0.14)] text-[rgba(35,24,18,0.62)]">
          {foot}
        </p>
      )}
    </motion.div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   The pinned scroll story — six chapters on one morphing Gaussian stage
   ════════════════════════════════════════════════════════════════════════ */

function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  // Wheel/trackpad scrolling arrives in discrete steps; driving the whole
  // stage straight from it makes every chapter jump a frame at a time. A
  // critically-damped spring turns those steps into a continuous glide —
  // every transform below inherits the smoothing for free.
  const t = useSpring(scrollYProgress, { stiffness: 110, damping: 28, restDelta: 0.0001 })

  /* — curve state, scroll-driven — */
  const mu = useTransform(t, [0, 0.66, 0.745, 1], [PRIOR_MU, PRIOR_MU, 3358, 3358])
  const sigma = useTransform(
    t,
    [0, 0.24, 0.3, 0.36, 0.41, 0.66, 0.745, 1],
    [PRIOR_SIGMA, PRIOR_SIGMA, 1150, 580, PRIOR_SIGMA, PRIOR_SIGMA, 714, 714],
  )
  const peak = useTransform(t, [0.115, 0.2], [0, PEAK])
  const curveOpacity = useTransform(t, [0.115, 0.19], [0, 1])

  const strike = useTransform(t, [0.43, 0.545, 0.565, 0.615], [1300, 5300, 5300, BET_X])
  const strikeOpacity = useTransform(t, [0.4, 0.44], [0, 1])

  /* — derived SVG paths — */
  const curveD = useTransform([mu, sigma, peak], (v: number[]) => linePath(v[0], v[1], v[2]))
  const noAreaD = useTransform([mu, sigma, peak, strike], (v: number[]) =>
    areaPath(v[0], v[1], v[2], DOMAIN[0], v[3]),
  )
  const yesAreaD = useTransform([mu, sigma, peak, strike], (v: number[]) =>
    areaPath(v[0], v[1], v[2], v[3], DOMAIN[1]),
  )

  /* — markers — */
  const muPx = useTransform(mu, xToPx)
  const strikePx = useTransform(strike, xToPx)
  const muLineO = useTransform(t, [0.19, 0.23], [0, 1])
  const sigmaIndO = useTransform(t, [0.24, 0.27, 0.385, 0.415], [0, 1, 1, 0])
  const sigmaX1 = useTransform([mu, sigma], (v: number[]) => xToPx(v[0] - v[1]))
  const sigmaX2 = useTransform([mu, sigma], (v: number[]) => xToPx(v[0] + v[1]))

  /* — the bet (chapter 05) — */
  const betR = useTransform(t, [0.625, 0.655], [0, 7])
  const ringR = useTransform(t, [0.625, 0.7], [4, 30])
  const ringO = useTransform(t, [0.62, 0.632, 0.7], [0, 0.7, 0])
  const betLabelO = useTransform(t, [0.63, 0.665], [0, 1])
  const betCy = useTransform([mu, sigma], (v: number[]) => yToPx(bell(BET_X, v[0], v[1]) * PEAK))
  const curveChipO = useTransform(t, [0.7, 0.755, 0.8, 0.84], [0, 1, 1, 0])

  /* — settlement (chapter 06) — */
  const finalO = useTransform(t, [0.8, 0.85], [0, 1])
  const verdictO = useTransform(t, [0.86, 0.92], [0, 1])
  const verdictY = useTransform(t, [0.86, 0.92], [12, 0])

  /* — HUD readouts — */
  const hudO = useTransform(t, [0.19, 0.23], [0, 1])
  const muText = useTransform(mu, (v) => Math.round(v).toLocaleString())
  const sigmaText = useTransform(sigma, (v) => Math.round(v).toLocaleString())
  const strikeText = useTransform(strike, (v) => Math.round(v).toLocaleString())
  const pYesText = useTransform([strike, mu, sigma], (v: number[]) =>
    `${(pYes(v[0], v[1], v[2]) * 100).toFixed(1)}%`,
  )
  const pNoText = useTransform([strike, mu, sigma], (v: number[]) =>
    `${(pNo(v[0], v[1], v[2]) * 100).toFixed(1)}%`,
  )

  const phaseText = useTransform(t, (v): string => {
    if (v < 0.15) return '01 — FRAGMENTATION'
    if (v < 0.24) return '02 — THE COLLAPSE'
    if (v < 0.4) return '03 — BELIEF, DRAWN'
    if (v < 0.62) return '04 — PRICE = AREA'
    if (v < 0.79) return '05 — SKIN IN THE GAME'
    return '06 — REALITY SETTLES'
  })

  return (
    <div ref={ref} className="relative h-[620vh]">
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-hidden flex items-start justify-center lg:justify-end px-1 lg:pr-12">
        {/* the stage — top-aligned and right-shifted on desktop so the
            caption card (bottom-left) never covers the curve */}
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full max-w-6xl h-[78%] mt-4 px-2"
        >
          {/* baseline + ticks */}
          <line x1={PLOT.left} x2={VB_W - PLOT.right} y1={BASE_Y} y2={BASE_Y} stroke="var(--chart-axis)" strokeWidth={1} />
          {X_TICKS.map((v) => (
            <g key={v}>
              <line x1={xToPx(v)} x2={xToPx(v)} y1={BASE_Y} y2={BASE_Y + 5} stroke="var(--chart-axis)" strokeWidth={1} />
              <text
                x={xToPx(v)} y={BASE_Y + 22} textAnchor="middle"
                fontSize={11} fontFamily="'JetBrains Mono', monospace" fill="var(--chart-tick-text)"
              >
                ${v / 1000}k
              </text>
            </g>
          ))}

          {/* chapter 01 — fragmented binary pools */}
          {FRAGMENTS.map((f, i) => (
            <FragmentBar key={f.x} t={t} x={f.x} h={f.h} i={i} />
          ))}

          {/* YES / NO areas (appear with the strike) */}
          <motion.path d={noAreaD} style={{ opacity: strikeOpacity }} fill="rgba(180,35,24,0.13)" />
          <motion.path d={yesAreaD} style={{ opacity: strikeOpacity }} fill="rgba(11,122,82,0.13)" />

          {/* the omni-curve */}
          <motion.path
            d={curveD}
            style={{ opacity: curveOpacity, filter: 'drop-shadow(0 0 7px rgba(200,16,46,0.45))' }}
            fill="none"
            stroke="var(--chart-curve)"
            strokeWidth={2.5}
          />

          {/* μ marker */}
          <motion.line
            x1={muPx} x2={muPx} y1={92} y2={BASE_Y}
            style={{ opacity: muLineO }}
            stroke="rgba(200,16,46,0.55)" strokeWidth={1} strokeDasharray="4 3"
          />
          <motion.text
            x={muPx} dx={7} y={104}
            style={{ opacity: muLineO }}
            fontSize={13} fontFamily="'JetBrains Mono', monospace" fill="#C8102E"
          >
            μ
          </motion.text>

          {/* ±σ ruler (chapter 03) */}
          <motion.g style={{ opacity: sigmaIndO }}>
            <motion.line x1={sigmaX1} x2={sigmaX2} y1={300} y2={300} stroke="#C8102E" strokeWidth={1} strokeDasharray="2 3" />
            <motion.line x1={sigmaX1} x2={sigmaX1} y1={293} y2={307} stroke="#C8102E" strokeWidth={1} />
            <motion.line x1={sigmaX2} x2={sigmaX2} y1={293} y2={307} stroke="#C8102E" strokeWidth={1} />
            <motion.text
              x={muPx} y={290} textAnchor="middle"
              fontSize={11} fontFamily="'JetBrains Mono', monospace" fill="#C8102E"
            >
              ±σ
            </motion.text>
          </motion.g>

          {/* strike line (chapter 04 onward) */}
          <motion.line
            x1={strikePx} x2={strikePx} y1={90} y2={BASE_Y}
            style={{ opacity: strikeOpacity }}
            stroke="#C8102E" strokeWidth={1.5}
          />
          <motion.text
            x={strikePx} dx={-8} y={120} textAnchor="end"
            style={{ opacity: strikeOpacity }}
            fontSize={11} fontFamily="'JetBrains Mono', monospace" fill="var(--accent-no)"
          >
            NO ←
          </motion.text>
          <motion.text
            x={strikePx} dx={8} y={120}
            style={{ opacity: strikeOpacity }}
            fontSize={11} fontFamily="'JetBrains Mono', monospace" fill="var(--accent-yes)"
          >
            → YES
          </motion.text>

          {/* the bet lands (chapter 05) — dot glued to the curve at its strike */}
          <motion.circle
            cx={xToPx(BET_X)} cy={betCy} r={ringR}
            style={{ opacity: ringO }}
            fill="none" stroke="var(--accent-yes)" strokeWidth={1.5}
          />
          <motion.circle
            cx={xToPx(BET_X)} cy={betCy} r={betR}
            style={{ opacity: betLabelO }}
            fill="var(--accent-yes)"
          />
          <motion.text
            x={xToPx(BET_X)} dx={-10} y={170} textAnchor="end"
            style={{ opacity: betLabelO }}
            fontSize={11} fontFamily="'JetBrains Mono', monospace" fill="var(--accent-yes)"
          >
            +2 USDC · YES @ $3,000
          </motion.text>

          {/* settlement — observed final price, not μ (chapter 06) */}
          <motion.g style={{ opacity: finalO }}>
            <line
              x1={xToPx(FINAL_X)} x2={xToPx(FINAL_X)} y1={80} y2={BASE_Y}
              stroke="#0E7490" strokeWidth={1.5} strokeDasharray="2 3"
            />
            <text
              x={xToPx(FINAL_X)} dx={6} y={92}
              fontSize={11} fontFamily="'JetBrains Mono', monospace" fill="#0E7490"
            >
              final_price $3,200
            </text>
          </motion.g>
        </svg>

        {/* phase indicator — top left */}
        <div
          className="absolute top-5 left-4 sm:left-10 pointer-events-none rounded px-3.5 py-2.5 border border-[rgba(62,44,30,0.16)]"
          style={{ background: 'rgba(253,248,238,0.94)', boxShadow: '0 6px 20px rgba(62,44,30,0.10)' }}
        >
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[rgba(35,24,18,0.60)]">
            How it works
          </p>
          <motion.p className="font-mono text-xs tracking-[0.2em] uppercase text-[#C8102E] mt-1.5">
            {phaseText}
          </motion.p>
        </div>

        {/* live HUD — top right */}
        <motion.div
          style={{ opacity: hudO, background: '#FDF8EE', boxShadow: '0 6px 20px rgba(62,44,30,0.10)' }}
          className="absolute top-5 right-4 sm:right-10 hidden sm:block border border-[rgba(62,44,30,0.18)] rounded px-4 py-3 font-mono text-xs pointer-events-none"
        >
          <div className="flex items-center gap-3 justify-between">
            <span className="text-[color:var(--text-subtle)]">μ</span>
            <motion.span className="text-[#C8102E]">{muText}</motion.span>
          </div>
          <div className="flex items-center gap-3 justify-between mt-1">
            <span className="text-[color:var(--text-subtle)]">σ</span>
            <motion.span className="text-[#C8102E]">{sigmaText}</motion.span>
          </div>
          <motion.div style={{ opacity: strikeOpacity }}>
            <div className="flex items-center gap-3 justify-between mt-2 pt-2 border-t border-[color:var(--border-dim)]">
              <span className="text-[color:var(--text-subtle)]">strike</span>
              <motion.span className="text-[color:var(--text-primary)]">{strikeText}</motion.span>
            </div>
            <div className="flex items-center gap-3 justify-between mt-1">
              <span className="text-[color:var(--text-subtle)]">P(YES)</span>
              <motion.span className="text-[color:var(--accent-yes)]">{pYesText}</motion.span>
            </div>
            <div className="flex items-center gap-3 justify-between mt-1">
              <span className="text-[color:var(--text-subtle)]">P(NO)</span>
              <motion.span className="text-[color:var(--accent-no)]">{pNoText}</motion.span>
            </div>
          </motion.div>
        </motion.div>

        {/* event chips — top center */}
        <motion.div
          style={{ opacity: curveChipO }}
          className="absolute top-16 sm:top-5 left-1/2 -translate-x-1/2 border border-[rgba(200,16,46,0.45)] bg-[rgba(200,16,46,0.10)] rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] uppercase text-[#C8102E] whitespace-nowrap pointer-events-none"
        >
          CurveUpdated · μ 3,500→3,358 · σ 800→714
        </motion.div>
        <motion.div
          style={{ opacity: verdictO, y: verdictY }}
          className="absolute top-16 sm:top-5 left-1/2 -translate-x-1/2 border border-[rgba(11,122,82,0.45)] bg-[rgba(11,122,82,0.10)] rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] uppercase text-[color:var(--accent-yes)] whitespace-nowrap pointer-events-none"
        >
          final 3,200 ≥ strike 3,000 → YES pays $1/token
        </motion.div>

        {/* scroll progress rail */}
        <div className="absolute right-1.5 sm:right-3 top-[12%] bottom-[12%] w-px bg-[color:var(--border-dim)]">
          <motion.div
            style={{ scaleY: t, transformOrigin: 'top' }}
            className="absolute inset-0 bg-[#C8102E]"
          />
        </div>

        {/* captions */}
        <Caption t={t} win={[0.02, 0.05, 0.115, 0.145]} num="01 / 06" title="Fragmentation">
          Today's prediction markets ask the same question over and over. Will ETH clear $2k?
          $3k? $4k? Every strike is its own yes/no pool — its own order book, its own thin
          slice of capital.
        </Caption>
        <Caption t={t} win={[0.15, 0.18, 0.21, 0.24]} num="02 / 06" title="The collapse">
          OmniCurve collapses every strike into one pool, governed by a single Gaussian
          curve. Liquidity is never fragmented again: one curve prices every outcome at once.
        </Caption>
        <Caption t={t} win={[0.25, 0.28, 0.37, 0.4]} num="03 / 06" title="Belief, drawn">
          The bell is the market's belief about one continuous outcome. μ is the consensus;
          σ is its uncertainty — wide when the market is unsure, tight as conviction builds.
        </Caption>
        <Caption t={t} win={[0.43, 0.46, 0.59, 0.62]} num="04 / 06" title="Price = area">
          Choose any strike x — not just a listed one. YES costs the area under the curve to
          the right of x; NO costs the area to the left. P(YES) = 1 − Φ((x−μ)/σ), computed
          entirely on-chain.
        </Caption>
        <Caption
          t={t}
          win={[0.645, 0.675, 0.765, 0.79]}
          num="05 / 06"
          title="Skin in the game"
          foot="Verified on-chain: this exact 2 USDC trade moved Market #0 on Arbitrum Sepolia."
        >
          Every bet folds its stake into the curve — a stake-weighted average of all strikes.
          Bettors move μ and σ; liquidity providers never can. Moving the market always costs
          capital at risk: manipulation-resistant by construction.
        </Caption>
        <Caption t={t} win={[0.815, 0.845, 0.96, 0.995]} num="06 / 06" title="Reality settles">
          μ is belief, never the verdict. The market settles against the observed final
          price: a YES at strike x pays $1 per token iff final ≥ x. Dragging the curve
          around can't change who wins.
        </Caption>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   Hero — self-drawing curve + invitation to scroll
   ════════════════════════════════════════════════════════════════════════ */

const HERO_CURVE = (() => {
  let d = ''
  for (let i = 0; i <= 100; i++) {
    const x = 20 + (680 * i) / 100
    const z = (x - 360) / 100
    const y = 198 - 168 * Math.exp(-0.5 * z * z)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }
  return d
})()

function Hero() {
  return (
    <section className="relative min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 overflow-hidden">
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="font-mono text-[10px] sm:text-xs tracking-[0.4em] uppercase text-[#C8102E] mb-6"
      >
        Protocol Documentation
      </motion.p>

      {/* Editorial headline — each line unmasks with a stagger. Lines stay
          centered so the hero keeps its symmetric composition with the
          curve and scroll cue below. */}
      <h1
        className="font-display font-800 tracking-tight leading-[0.98] text-center text-[color:var(--text-primary)]"
        style={{ fontSize: 'clamp(2.8rem, 7.5vw, 5.6rem)' }}
      >
        <MaskLines
          delay={0.15}
          lines={[
            'The market',
            'is a',
            <span key="l3" className="text-[#C8102E]">curve.</span>,
          ]}
        />
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="font-serif italic text-base sm:text-lg max-w-lg text-center leading-relaxed mt-6 text-[color:var(--text-muted)]"
      >
        One Gaussian replaces a thousand binary pools. Scroll — and the protocol
        will explain itself.
      </motion.p>

      <svg viewBox="0 0 720 220" className="w-full max-w-2xl mt-10" fill="none">
        <motion.path
          d={HERO_CURVE}
          stroke="var(--chart-curve)"
          strokeWidth={2.5}
          style={{ filter: 'drop-shadow(0 0 7px rgba(200,16,46,0.45))' }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.5, duration: 1.8, ease: 'easeInOut' }}
        />
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.1, duration: 0.6 }}
        >
          <line x1={360} x2={360} y1={34} y2={198} stroke="rgba(200,16,46,0.5)" strokeWidth={1} strokeDasharray="4 3" />
          <text x={368} y={46} fontSize={13} fontFamily="'JetBrains Mono', monospace" fill="#C8102E">μ</text>
          <line x1={20} x2={700} y1={198} y2={198} stroke="var(--chart-axis)" strokeWidth={1} />
        </motion.g>
      </svg>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4, duration: 0.8 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="font-mono text-[10px] tracking-[0.35em] uppercase text-[color:var(--text-subtle)]">
          Scroll
        </span>
        <motion.span
          animate={{ y: [0, 7, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          className="block w-px h-8 bg-[#C8102E]"
        />
      </motion.div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   Below the story — reveal-on-scroll reference sections
   ════════════════════════════════════════════════════════════════════════ */

function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* Editorial line-mask reveal: each line rises out of an overflow-hidden
   wrapper, staggered — type appears to be unmasked rather than faded in.
   The in-view trigger MUST live on the (unclipped) container: the lines
   start fully clipped by the mask, so observing them directly would never
   report an intersection and the reveal would never fire. */
const maskLineVariant = {
  hidden: { y: '112%' },
  show: { y: '0%', transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const } },
}

function MaskLines({ lines, className = '', lineClassName = '', delay = 0 }: {
  lines: React.ReactNode[]
  className?: string
  lineClassName?: string
  delay?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-70px' }}
      custom={delay}
      variants={{
        hidden: {},
        show: (d: number) => ({ transition: { staggerChildren: 0.09, delayChildren: d } }),
      }}
    >
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden">
          <motion.span variants={maskLineVariant} className={`block ${lineClassName}`}>
            {l}
          </motion.span>
        </span>
      ))}
    </motion.div>
  )
}

function SectionHead({ num, title, sub }: { num: string; title: string; sub?: string }) {
  return (
    <div className="mb-10">
      <Reveal>
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#C8102E] mb-3">{num}</p>
      </Reveal>
      <MaskLines
        lines={[title]}
        delay={0.05}
        className="font-display font-800 text-3xl sm:text-4xl tracking-tight text-[color:var(--text-primary)]"
      />
      {sub && (
        <Reveal delay={0.18}>
          <p className="font-serif italic text-base mt-3 max-w-xl text-[color:var(--text-muted)]">{sub}</p>
        </Reveal>
      )}
    </div>
  )
}

/* ── Stats wall — giant serif numerals in columns that drift at different
      speeds while the section scrolls through the viewport. ─────────────── */

const STAT_COLUMNS: { v: string; label: string }[][] = [
  [
    { v: '1', label: 'curve per market — every strike priced from one pool' },
    { v: '∞', label: 'strikes — any continuous x, not a listed menu' },
  ],
  [
    { v: '1%', label: 'fee on every trade, streamed pro-rata to LPs' },
    { v: '$1', label: 'per winning token, redeemed at settlement' },
  ],
  [
    { v: '24h', label: 'timelock between resolution proposal and finality' },
    { v: '10⁻⁷', label: 'max error of the on-chain erf approximation' },
  ],
]

function StatCell({ v, label }: { v: string; label: string }) {
  return (
    <div className="border-t border-[rgba(62,44,30,0.18)] pt-5 pb-14">
      <p
        className="font-serif text-[#C8102E] leading-none"
        style={{ fontSize: 'clamp(4rem, 8.5vw, 7.5rem)' }}
      >
        {v}
      </p>
      <p className="font-mono text-[11px] leading-relaxed mt-5 max-w-[26ch] text-[rgba(35,24,18,0.62)]">
        {label}
      </p>
    </div>
  )
}

function StatsWall() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  // three columns, three speeds — the multi-rate drift is the whole effect.
  // Offsets stay modest so the section never opens with a hollow band that
  // reads as broken padding.
  const y0 = useTransform(scrollYProgress, [0, 1], [30, -40])
  const y1 = useTransform(scrollYProgress, [0, 1], [80, -90])
  const y2 = useTransform(scrollYProgress, [0, 1], [130, -60])

  return (
    <section ref={ref} className="max-w-6xl mx-auto px-4 sm:px-6 pt-32 pb-16 overflow-visible">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 items-start">
        <motion.div style={{ y: y0 }}>
          <Reveal>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#C8102E] mb-3">
              06½ / The protocol, in numbers
            </p>
            <p className="font-serif text-[15px] leading-relaxed text-[rgba(35,24,18,0.8)] max-w-[30ch] mb-14">
              A single Gaussian carries the whole market. Everything else the protocol does
              reduces to a handful of constants.
            </p>
          </Reveal>
          {STAT_COLUMNS[0].map((s) => <StatCell key={s.v} {...s} />)}
        </motion.div>
        <motion.div style={{ y: y1 }} className="md:pt-24">
          {STAT_COLUMNS[1].map((s) => <StatCell key={s.v} {...s} />)}
        </motion.div>
        <motion.div style={{ y: y2 }} className="md:pt-48">
          {STAT_COLUMNS[2].map((s) => <StatCell key={s.v} {...s} />)}
        </motion.div>
      </div>
    </section>
  )
}

/* ── Lifecycle fan — the four resolution steps spread into a tilted arc as
      the section scrolls into view. ──────────────────────────────────────── */

const FAN_ANGLES = [-9, -3, 3, 9]

function LifecycleFan() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.9', 'start 0.35'] })
  const spread = useSpring(scrollYProgress, { stiffness: 90, damping: 24 })

  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {LIFECYCLE.map((s, i) => (
        <FanCard key={s.fn} step={s} i={i} spread={spread} />
      ))}
    </div>
  )
}

function FanCard({ step, i, spread }: {
  step: (typeof LIFECYCLE)[number]
  i: number
  spread: MotionValue<number>
}) {
  const angle = FAN_ANGLES[i] ?? 0
  // edges of the fan sit lower, like cards splayed in a hand
  const arcDrop = Math.abs(angle) * 2.4
  const rotate = useTransform(spread, [0, 1], [0, angle])
  const y = useTransform(spread, [0, 1], [70, arcDrop])
  const opacity = useTransform(spread, [0, 0.25 + i * 0.12, 0.55 + i * 0.12], [0, 0, 1])

  return (
    <motion.div style={{ rotate, y, opacity, transformOrigin: 'bottom center' }}>
      <div
        className="border border-[color:var(--border-dim)] rounded p-5 h-full relative"
        style={{ background: 'var(--bg-surface)', boxShadow: '0 14px 36px rgba(62,44,30,0.12)' }}
      >
        <span className="font-mono text-[10px] text-[color:var(--text-subtle)]">
          STEP 0{i + 1}
        </span>
        <p className="font-mono text-[13px] text-[#C8102E] mt-2 break-all">{step.fn}()</p>
        <p className="font-display font-600 text-sm mt-2 text-[color:var(--text-primary)]">
          {step.title}
        </p>
        <p className="font-serif text-[13px] leading-relaxed mt-2 text-[color:var(--text-muted)]">
          {step.desc}
        </p>
      </div>
    </motion.div>
  )
}

/* ── 07 — interactive playground ────────────────────────────────────────── */

function Playground() {
  const mu = PRIOR_MU
  const sigma = PRIOR_SIGMA
  const [strike, setStrike] = useState(BET_X)

  const py = pYes(strike, mu, sigma)
  const pn = pNo(strike, mu, sigma)
  const stake = 100
  const yesTokens = py > 0.001 ? (stake * 0.99) / py : 0

  return (
    <Reveal>
      <div
        className="border border-[color:var(--border-dim)] rounded p-5 sm:p-7 space-y-5"
        style={{ background: 'var(--bg-surface)' }}
      >
        <GaussianChart mu={mu} sigma={sigma} strikeX={strike} height={230} />
        <Slider
          value={strike}
          min={mu - 3 * sigma}
          max={mu + 3 * sigma}
          step={10}
          onChange={setStrike}
          label="Strike price"
          displayValue={`$${strike.toLocaleString()}`}
        />
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="border border-[rgba(11,122,82,0.3)] bg-[rgba(11,122,82,0.07)] rounded p-4">
            <p className="text-[10px] font-mono tracking-[0.25em] uppercase mb-1 text-[color:var(--accent-yes)] opacity-70">
              P(YES)
            </p>
            <p className="font-mono text-2xl text-[color:var(--accent-yes)]">{(py * 100).toFixed(2)}%</p>
            <p className="text-[11px] font-mono mt-1 text-[color:var(--text-subtle)]">
              1 − Φ((x−μ)/σ)
            </p>
          </div>
          <div className="border border-[rgba(180,35,24,0.3)] bg-[rgba(180,35,24,0.07)] rounded p-4">
            <p className="text-[10px] font-mono tracking-[0.25em] uppercase mb-1 text-[color:var(--accent-no)] opacity-70">
              P(NO)
            </p>
            <p className="font-mono text-2xl text-[color:var(--accent-no)]">{(pn * 100).toFixed(2)}%</p>
            <p className="text-[11px] font-mono mt-1 text-[color:var(--text-subtle)]">
              Φ((x−μ)/σ)
            </p>
          </div>
        </div>
        <p className="font-mono text-xs text-center pt-1 text-[color:var(--text-subtle)]">
          $100 on YES @ ${strike.toLocaleString()} → ~{yesTokens.toFixed(1)} tokens (after 1% fee)
          → pays <span className="text-[color:var(--accent-yes)]">${yesTokens.toFixed(2)}</span> if
          final ≥ strike
        </p>
      </div>
    </Reveal>
  )
}

/* ── 08 — the math ──────────────────────────────────────────────────────── */

const MATH_PLATES = [
  {
    label: 'Pricing',
    lines: ['P_YES(x) = 1 − Φ((x − μ) / σ)', 'P_NO(x)  =     Φ((x − μ) / σ)'],
    note: 'Probability is area under the Gaussian. Any continuous strike gets an instant, mathematically derived price.',
  },
  {
    label: 'The curve',
    lines: ['μ = Σ wᵢ·xᵢ / Σ wᵢ', 'σ = √( Σ wᵢ·xᵢ² / Σ wᵢ − μ² )'],
    note: 'Each bet contributes weight wᵢ (its net stake) at strike xᵢ. The owner’s seed is just a prior with virtual weight that dilutes as real bets arrive.',
  },
  {
    label: 'On-chain stack',
    lines: ['erf ≈ Abramowitz–Stegun (err < 1.5e−7)', 'eˣ = 18-term Taylor · √ = Newton'],
    note: 'All of it in WAD (1e18) fixed-point I256 — ~11 significant digits, computed in Rust compiled to WASM on Arbitrum Stylus. No oracle does the math for us.',
  },
  {
    label: 'Fees',
    lines: ['pending = shares × accFeePerShare', '          − rewardDebt'],
    note: '1% of every trade flows to LPs through a MasterChef-style accumulator — O(1) distribution no matter how many providers.',
  },
]

/* ── 09 — display heading: huge type overlapping a red chevron that drifts
      on scroll, after the reference site's "Private Equity" slides ───────── */

function RolesHead() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const shapeY = useTransform(scrollYProgress, [0, 1], [50, -50])
  const shapeX = useTransform(scrollYProgress, [0, 1], [30, -30])

  return (
    <div ref={ref} className="relative mb-14 py-6">
      {/* the red chevron — parallaxes against the type above it */}
      <motion.div
        aria-hidden
        style={{ y: shapeY, x: shapeX }}
        className="absolute right-[2%] top-[2%] w-[44%] h-[78%] bg-[#C8102E] opacity-90 skew-x-[-16deg] pointer-events-none"
      />
      <div className="relative">
        <Reveal>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#C8102E] mb-4">
            09 / Two roles
          </p>
        </Reveal>
        <h2
          className="font-display font-800 tracking-tight leading-[1.02] text-[color:var(--text-primary)]"
          style={{ fontSize: 'clamp(2.4rem, 6vw, 4.6rem)' }}
        >
          <MaskLines
            lines={[
              'Bettors steer.',
              <span key="l2" className="pl-[16%]">LPs underwrite.</span>,
            ]}
          />
        </h2>
        <Reveal delay={0.2}>
          <p className="font-serif italic text-base mt-5 max-w-xl text-[color:var(--text-muted)]">
            The separation is the security model: only capital at risk on a position can move
            the curve.
          </p>
        </Reveal>
      </div>
    </div>
  )
}

/* ── 10 — resolution lifecycle ──────────────────────────────────────────── */

const LIFECYCLE = [
  {
    fn: 'set_final_price',
    title: 'Record reality',
    desc: 'The owner records the externally observed outcome. μ never settles anything — the real number does.',
  },
  {
    fn: 'propose_resolution',
    title: 'Open the window',
    desc: 'A resolution proposal starts a 24-hour timelock — a dispute window anyone can inspect.',
  },
  {
    fn: 'execute_resolution',
    title: 'Finalize',
    desc: 'After the timelock, the market resolves. Trading and liquidity operations stop.',
  },
  {
    fn: 'claim_winnings',
    title: 'Redeem',
    desc: 'Winners pull $1 per token. release_losing_collateral frees the LP capital locked behind losing bets.',
  },
]

/* ════════════════════════════════════════════════════════════════════════
   12 — Future: a multi-agent AI oracle for resolution
   A second pinned scroll story. The same morphing-stage technique as the
   protocol story above, but here the stage is the resolution *pipeline* from
   Kota, "Design and Evaluation of Multi-Agent AI Oracle Systems for
   Prediction Market Resolution" (arXiv:2605.30802): question → evidence →
   debate → consensus → confidence threshold → set_final_price.
   ════════════════════════════════════════════════════════════════════════ */

const ORACLE_AGENTS = [
  { x: 215, label: 'model α', verdict: 'YES · 0.91', tone: 'yes' as const },
  { x: 405, label: 'model β', verdict: 'YES · 0.88', tone: 'yes' as const },
  { x: 595, label: 'model γ', verdict: 'ABSTAIN', tone: 'mute' as const },
  { x: 785, label: 'model δ', verdict: 'YES · 0.95', tone: 'yes' as const },
]

const O_AGENT_Y = 255
const O_AGENT_W = 132
const O_AGENT_H = 58
const O_Q_CY = 78
const O_CONS_CX = 500
const O_CONS_CY = 418
const O_CONS_W = 232
const O_CONS_H = 64
const O_BAR_X = 360
const O_BAR_W = 280
const O_BAR_Y = 496
const O_TAU = 0.75

const oAgentTop = O_AGENT_Y - O_AGENT_H / 2
const oAgentBot = O_AGENT_Y + O_AGENT_H / 2
const oConsTop = O_CONS_CY - O_CONS_H / 2

/* one agent: a labelled verdict card that rises in, its verdict revealed
   only once the debate phase resolves */
function OracleAgent({
  t, agent, i,
}: {
  t: MotionValue<number>
  agent: (typeof ORACLE_AGENTS)[number]
  i: number
}) {
  const inS = 0.33 + i * 0.025
  const opacity = useTransform(t, [inS, inS + 0.05], [0, 1])
  const y = useTransform(t, [inS, inS + 0.06], [16, 0])
  const verdictO = useTransform(t, [0.45, 0.51], [0, 1])
  const tone = agent.tone === 'yes' ? 'var(--accent-yes)' : 'var(--text-subtle)'
  const left = agent.x - O_AGENT_W / 2

  return (
    <motion.g style={{ opacity, y }}>
      <rect
        x={left} y={oAgentTop} width={O_AGENT_W} height={O_AGENT_H} rx={4}
        fill="var(--bg-surface)" stroke="rgba(62,44,30,0.30)" strokeWidth={1}
      />
      <text
        x={agent.x} y={oAgentTop + 23} textAnchor="middle"
        fontSize={12} fontFamily="'JetBrains Mono', monospace" fill="var(--text-primary)"
      >
        {agent.label}
      </text>
      <motion.text
        x={agent.x} y={oAgentTop + 43} textAnchor="middle"
        style={{ opacity: verdictO }}
        fontSize={12} fontFamily="'JetBrains Mono', monospace" fill={tone}
      >
        {agent.verdict}
      </motion.text>
    </motion.g>
  )
}

function OracleScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const t = useSpring(scrollYProgress, { stiffness: 110, damping: 28, restDelta: 0.0001 })

  /* — phase reveals — */
  const qO = useTransform(t, [0.02, 0.08], [0, 1])
  const qY = useTransform(t, [0.02, 0.09], [14, 0])
  const evO = useTransform(t, [0.17, 0.27, 0.5, 0.56], [0, 1, 1, 0])
  const debO = useTransform(t, [0.34, 0.4, 0.52, 0.57], [0, 1, 1, 0])
  const consEdgeO = useTransform(t, [0.54, 0.63], [0, 1])
  const consNodeO = useTransform(t, [0.6, 0.66], [0, 1])
  const consNodeY = useTransform(t, [0.6, 0.66], [14, 0])
  const consValO = useTransform(t, [0.62, 0.68], [0, 1])
  const barO = useTransform(t, [0.68, 0.72], [0, 1])
  const fillW = useTransform(t, [0.7, 0.82], [0, 0.92 * O_BAR_W])
  const resolveO = useTransform(t, [0.8, 0.85], [0, 1])
  const outO = useTransform(t, [0.86, 0.92], [0, 1])
  const outY = useTransform(t, [0.86, 0.92], [12, 0])

  const phaseText = useTransform(t, (v): string => {
    if (v < 0.15) return 'A — QUESTION INTAKE'
    if (v < 0.32) return 'B — EVIDENCE GATHERING'
    if (v < 0.52) return 'C — MULTI-AGENT DELIBERATION'
    if (v < 0.68) return 'D — CONSENSUS AGGREGATION'
    if (v < 0.84) return 'E — CONFIDENCE THRESHOLD'
    return 'F — RESOLUTION OUTPUT'
  })

  const tauX = O_BAR_X + O_TAU * O_BAR_W

  return (
    <div ref={ref} className="relative h-[560vh]">
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-hidden flex items-start justify-center lg:justify-end px-1 lg:pr-12">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full max-w-6xl h-[82%] mt-4 px-2"
        >
          {/* evidence — fan of retrieval lines from the question to each agent */}
          <motion.g style={{ opacity: evO }}>
            {ORACLE_AGENTS.map((a) => (
              <line
                key={a.x}
                x1={O_CONS_CX} y1={O_Q_CY + 26} x2={a.x} y2={oAgentTop - 4}
                stroke="rgba(62,44,30,0.30)" strokeWidth={1} strokeDasharray="3 4"
              />
            ))}
            <text
              x={O_CONS_CX} y={O_Q_CY + 52} textAnchor="middle"
              fontSize={10} fontFamily="'JetBrains Mono', monospace" fill="var(--text-subtle)"
            >
              retrieve · fact-check
            </text>
          </motion.g>

          {/* debate — agents argue with one another */}
          <motion.g style={{ opacity: debO }}>
            {[[0, 1], [1, 2], [2, 3], [0, 2], [1, 3]].map(([a, b]) => (
              <line
                key={`${a}-${b}`}
                x1={ORACLE_AGENTS[a].x} y1={O_AGENT_Y}
                x2={ORACLE_AGENTS[b].x} y2={O_AGENT_Y}
                stroke="#C8102E" strokeWidth={1} strokeDasharray="2 4" opacity={0.55}
              />
            ))}
          </motion.g>

          {/* consensus edges — agent verdicts flow into the aggregator */}
          <motion.g style={{ opacity: consEdgeO }}>
            {ORACLE_AGENTS.map((a) => (
              <line
                key={a.x}
                x1={a.x} y1={oAgentBot} x2={O_CONS_CX} y2={oConsTop - 4}
                stroke="rgba(62,44,30,0.30)" strokeWidth={1}
              />
            ))}
          </motion.g>

          {/* question node */}
          <motion.g style={{ opacity: qO, y: qY }}>
            <rect
              x={O_CONS_CX - 195} y={O_Q_CY - 26} width={390} height={52} rx={4}
              fill="#FDF8EE" stroke="rgba(200,16,46,0.45)" strokeWidth={1}
            />
            <text
              x={O_CONS_CX} y={O_Q_CY - 4} textAnchor="middle"
              fontSize={10} fontFamily="'JetBrains Mono', monospace" fill="#C8102E"
            >
              QUESTION
            </text>
            <text
              x={O_CONS_CX} y={O_Q_CY + 14} textAnchor="middle"
              fontSize={13} fontFamily="'JetBrains Mono', monospace" fill="var(--text-primary)"
            >
              Did ETH close ≥ $3,000 on 2026-12-31?
            </text>
          </motion.g>

          {/* agents */}
          {ORACLE_AGENTS.map((a, i) => (
            <OracleAgent key={a.x} t={t} agent={a} i={i} />
          ))}

          {/* consensus node */}
          <motion.g style={{ opacity: consNodeO, y: consNodeY }}>
            <rect
              x={O_CONS_CX - O_CONS_W / 2} y={oConsTop} width={O_CONS_W} height={O_CONS_H} rx={4}
              fill="var(--bg-surface)" stroke="rgba(200,16,46,0.5)" strokeWidth={1.5}
            />
            <text
              x={O_CONS_CX} y={oConsTop + 22} textAnchor="middle"
              fontSize={10} fontFamily="'JetBrains Mono', monospace" fill="#C8102E"
            >
              WEIGHTED CONSENSUS
            </text>
            <motion.text
              x={O_CONS_CX} y={oConsTop + 46} textAnchor="middle"
              style={{ opacity: consValO }}
              fontSize={14} fontFamily="'JetBrains Mono', monospace" fill="var(--text-primary)"
            >
              final_price ≈ $3,200
            </motion.text>
          </motion.g>

          {/* confidence bar + threshold */}
          <motion.g style={{ opacity: barO }}>
            <text
              x={O_BAR_X} y={O_BAR_Y - 10}
              fontSize={10} fontFamily="'JetBrains Mono', monospace" fill="var(--text-subtle)"
            >
              aggregate confidence
            </text>
            <rect x={O_BAR_X} y={O_BAR_Y} width={O_BAR_W} height={8} rx={4} fill="rgba(62,44,30,0.14)" />
            <motion.rect
              x={O_BAR_X} y={O_BAR_Y} width={fillW} height={8} rx={4}
              fill="var(--accent-yes)"
            />
            <line x1={tauX} x2={tauX} y1={O_BAR_Y - 6} y2={O_BAR_Y + 14} stroke="#C8102E" strokeWidth={1.5} />
            <text
              x={tauX} y={O_BAR_Y - 10} textAnchor="middle"
              fontSize={10} fontFamily="'JetBrains Mono', monospace" fill="#C8102E"
            >
              τ
            </text>
            <motion.text
              x={O_BAR_X + O_BAR_W} y={O_BAR_Y + 28} textAnchor="end"
              style={{ opacity: resolveO }}
              fontSize={11} fontFamily="'JetBrains Mono', monospace" fill="var(--accent-yes)"
            >
              0.92 ≥ τ 0.75 → RESOLVE  (else ABSTAIN)
            </motion.text>
          </motion.g>

          {/* resolution output — hands the one number to the Router */}
          <motion.g style={{ opacity: outO, y: outY }}>
            <text
              x={O_CONS_CX} y={552} textAnchor="middle"
              fontSize={12} fontFamily="'JetBrains Mono', monospace" fill="#0E7490"
            >
              Router.set_final_price($3,200) → YES pays $1 / token
            </text>
          </motion.g>
        </svg>

        {/* phase indicator — top left */}
        <div
          className="absolute top-5 left-4 sm:left-10 pointer-events-none rounded px-3.5 py-2.5 border border-[rgba(62,44,30,0.16)]"
          style={{ background: 'rgba(253,248,238,0.94)', boxShadow: '0 6px 20px rgba(62,44,30,0.10)' }}
        >
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[rgba(35,24,18,0.60)]">
            Planned · AI oracle
          </p>
          <motion.p className="font-mono text-xs tracking-[0.2em] uppercase text-[#C8102E] mt-1.5">
            {phaseText}
          </motion.p>
        </div>

        {/* scroll progress rail */}
        <div className="absolute right-1.5 sm:right-3 top-[12%] bottom-[12%] w-px bg-[color:var(--border-dim)]">
          <motion.div
            style={{ scaleY: t, transformOrigin: 'top' }}
            className="absolute inset-0 bg-[#C8102E]"
          />
        </div>

        {/* captions — crux on top, a verbatim line from the paper underneath */}
        <Caption
          t={t} win={[0.02, 0.05, 0.12, 0.15]} num="A / 06" title="Why not one model"
          foot="“Single AI models are prone to hallucinations, sycophancy, and systematic biases that undermine oracle reliability.”"
        >
          Resolution is the last manual step in OmniCurve — today the owner types the final
          price by hand. The fix isn't a single price feed or a single LLM; it's a panel of
          diverse models, because a lone oracle fails in correlated, invisible ways.
        </Caption>
        <Caption t={t} win={[0.17, 0.2, 0.29, 0.32]} num="B / 06" title="Evidence, gathered">
          The market's question and resolution criteria become one normalized prompt. Each
          agent independently retrieves sources and fact-checks them — no single source can
          decide the outcome on its own.
        </Caption>
        <Caption
          t={t} win={[0.34, 0.37, 0.49, 0.52]} num="C / 06" title="Agents deliberate"
          foot="“Multiple AI agents debate competing resolutions, exposing errors through adversarial discussion.”"
        >
          Architecturally diverse models (α, β, γ, δ) argue competing resolutions and surface
          each other's mistakes. Disagreement is the feature — monoculture is the risk being
          defended against.
        </Caption>
        <Caption
          t={t} win={[0.54, 0.57, 0.65, 0.68]} num="D / 06" title="Consensus, weighted"
          foot="“Agent predictions are aggregated using weighted voting schemes that account for confidence calibration.”"
        >
          A confidence-weighted vote collapses every agent's verdict into exactly one
          candidate number — the single `final_price` settlement actually needs.
        </Caption>
        <Caption
          t={t} win={[0.7, 0.73, 0.81, 0.84]} num="E / 06" title="Know when to abstain"
          foot="“Confidence thresholds enable oracles to abstain when uncertainty exceeds acceptable bounds.”"
        >
          If aggregate confidence clears the threshold τ, the price resolves. If it doesn't,
          the oracle writes nothing — degrading gracefully to the 24-hour timelock and human
          dispute path rather than guessing.
        </Caption>
        <Caption
          t={t} win={[0.86, 0.89, 0.97, 0.995]} num="F / 06" title="One number, on-chain"
          foot="Plugs into propose_resolution → execute_resolution; settlement math (Section 1.4) is untouched."
        >
          The accepted price is written via `set_final_price`, and the existing per-position
          rule pays $1 per winning token. The AI never touches μ, σ, or pricing — belief and
          settlement stay cleanly separated.
        </Caption>
      </div>
    </div>
  )
}

const ORACLE_TENETS = [
  {
    label: 'Redundancy',
    quote: '“Multiple independent models reduce single-point failures.”',
    note: 'A panel, not a feed — no single model can mis-resolve a market on its own.',
  },
  {
    label: 'Adversarial debate',
    quote: '“Agents present arguments and counterarguments to improve collective accuracy.”',
    note: "Agents challenge each other's reasoning before any price is written on-chain.",
  },
  {
    label: 'Calibrated voting',
    quote: '“Aggregated using weighted voting schemes that account for confidence calibration.”',
    note: 'Well-calibrated, confident agents carry more weight in the final number.',
  },
  {
    label: 'Selective abstention',
    quote: '“Oracles abstain when uncertainty exceeds acceptable bounds.”',
    note: 'Below τ the oracle stays silent and the 24h dispute window keeps control.',
  },
]

export default function Docs() {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <ScrollStory />

      {/* ── the protocol in numbers — multi-speed parallax columns ── */}
      <StatsWall />

      {/* ── 07 / TRY IT ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-8">
        <SectionHead
          num="07 / Try it"
          title="Run your own strike"
          sub="The same CDF the contracts compute on-chain, live under your cursor. Drag the strike across Market #0's curve."
        />
        <Playground />
      </section>

      {/* ── 08 / THE MATH ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-8">
        <SectionHead
          num="08 / The math"
          title="Four formulas, no oracle"
          sub="Everything the protocol believes and charges reduces to these."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MATH_PLATES.map((p, i) => (
            <Reveal key={p.label} delay={i * 0.08}>
              <div
                className="border border-[color:var(--border-dim)] rounded p-5 h-full"
                style={{ background: 'var(--bg-surface)' }}
              >
                <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#C8102E] mb-3">
                  {p.label}
                </p>
                <div className="font-mono text-[13px] leading-relaxed whitespace-pre text-[color:var(--text-primary)] overflow-x-auto">
                  {p.lines.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </div>
                <p className="font-serif text-sm leading-relaxed mt-4 text-[color:var(--text-muted)]">
                  {p.note}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 09 / TWO ROLES ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-8">
        <RolesHead />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Reveal>
            <div
              className="border rounded p-6 h-full border-[rgba(11,122,82,0.3)]"
              style={{ background: 'var(--bg-surface)' }}
            >
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[color:var(--accent-yes)] mb-4">
                Traders
              </p>
              <ol className="space-y-3.5">
                {[
                  'Pick any strike and a side — YES (final ≥ x) or NO (final < x).',
                  'Stake USDC. You pay the probability: cheap when the curve disagrees with you.',
                  'Your stake folds into the curve — your conviction moves μ and σ.',
                  'If reality lands your side of the strike, redeem $1.00 per token.',
                ].map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="font-mono text-xs text-[color:var(--accent-yes)] mt-0.5 flex-shrink-0">
                      0{i + 1}
                    </span>
                    <span className="font-serif text-sm leading-relaxed text-[color:var(--text-muted)]">
                      {s}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div
              className="border rounded p-6 h-full border-[rgba(200,16,46,0.35)]"
              style={{ background: 'var(--bg-surface)' }}
            >
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#C8102E] mb-4">
                Liquidity providers
              </p>
              <ol className="space-y-3.5">
                {[
                  'Deposit USDC into the single pool; receive non-transferable LP tokens.',
                  'Pure collateral underwriting — deposits never shift μ or σ, by construction.',
                  'Earn 1% of every trade across all strikes, pro-rata, claimable anytime.',
                  'After resolution, collateral locked behind losing bets returns to the pool.',
                ].map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="font-mono text-xs text-[#C8102E] mt-0.5 flex-shrink-0">
                      0{i + 1}
                    </span>
                    <span className="font-serif text-sm leading-relaxed text-[color:var(--text-muted)]">
                      {s}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 10 / RESOLUTION ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-8">
        <SectionHead
          num="10 / Resolution"
          title="Settling against reality"
          sub="Pull-based claiming, with a timelock between proposal and finality."
        />
        <LifecycleFan />
      </section>

      {/* ── 11 / ARCHITECTURE ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-8">
        <SectionHead
          num="11 / Architecture"
          title="Rust on Stylus, cloned per market"
          sub="The Gaussian engine would be prohibitively expensive in Solidity. Stylus runs it as WASM for near-zero gas."
        />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
          <Reveal className="md:col-span-2">
            <div className="h-full flex flex-col justify-center space-y-4">
              <p className="font-serif text-[15px] leading-relaxed text-[color:var(--text-muted)]">
                Contracts are written in <strong className="text-[color:var(--text-primary)]">Rust</strong>,
                compiled to <strong className="text-[color:var(--text-primary)]">WASM</strong> with the
                Arbitrum Stylus SDK. Implementations deploy once as singletons; the Factory clones an
                AMM, a Router, and an LP Token per market via{' '}
                <strong className="text-[color:var(--text-primary)]">EIP-1167 minimal proxies</strong> and
                CREATE2 — shared code, independent storage.
              </p>
              <p className="font-serif text-[15px] leading-relaxed text-[color:var(--text-muted)]">
                The Router prices and executes trades, the AMM holds collateral and recomputes the
                curve, and the LP Token receipts the underwriters.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.12} className="md:col-span-3">
            <div
              className="border border-[color:var(--border-dim)] rounded p-5 font-mono text-xs leading-loose text-[color:var(--text-muted)] overflow-x-auto"
              style={{ background: 'var(--bg-surface)' }}
            >
              <p className="text-[#C8102E]">OmniCurveFactory.create_market()</p>
              <p className="pl-3">├─ AMM Proxy ──DELEGATECALL──▶ AMM Impl</p>
              <p className="pl-3">├─ Router Proxy ──DELEGATECALL──▶ Router Impl</p>
              <p className="pl-3">├─ LP Token Proxy ──DELEGATECALL──▶ LP Impl</p>
              <p className="pl-3">├─ wires AMM ↔ Router ↔ LP Token ↔ USDC</p>
              <p className="pl-3">└─ ownership → market creator (two-step)</p>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.2}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-8 font-mono text-[10px] tracking-[0.15em] uppercase text-[color:var(--text-subtle)]">
            <span>Arbitrum Stylus</span>
            <span className="text-[#C8102E]">·</span>
            <span>Rust → WASM</span>
            <span className="text-[#C8102E]">·</span>
            <span>EIP-1167 + CREATE2</span>
            <span className="text-[#C8102E]">·</span>
            <span>WAD fixed-point</span>
            <span className="text-[#C8102E]">·</span>
            <span>MasterChef fees</span>
            <span className="text-[#C8102E]">·</span>
            <span>Non-custodial</span>
          </div>
        </Reveal>
      </section>

      {/* ── 12 / FUTURE — multi-agent AI oracle ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-4">
        <SectionHead
          num="12 / The road ahead"
          title="An AI oracle for resolution"
          sub="Today the owner sets the final price by hand. Next: a multi-agent AI oracle that debates, votes with calibrated weights, and knows when to abstain — after Kota, arXiv:2605.30802. Scroll the pipeline."
        />
      </section>
      <OracleScroll />

      {/* ── 12½ / FROM THE PAPER ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-8">
        <SectionHead
          num="12½ / From the paper"
          title="Why a panel, not a feed"
          sub="The design principles behind the planned oracle — each a one-line claim from the paper, mapped to what it buys OmniCurve."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ORACLE_TENETS.map((tn, i) => (
            <Reveal key={tn.label} delay={i * 0.08}>
              <div
                className="border border-[color:var(--border-dim)] rounded p-5 h-full"
                style={{ background: 'var(--bg-surface)' }}
              >
                <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#C8102E] mb-3">
                  {tn.label}
                </p>
                <p className="font-serif italic text-[15px] leading-relaxed text-[color:var(--text-primary)]">
                  {tn.quote}
                </p>
                <p className="font-serif text-sm leading-relaxed mt-3 text-[color:var(--text-muted)]">
                  {tn.note}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2}>
          <p className="font-mono text-[11px] mt-8 text-[color:var(--text-subtle)]">
            Source —{' '}
            <a
              href="https://arxiv.org/pdf/2605.30802"
              target="_blank"
              rel="noreferrer"
              className="text-[#C8102E] hover:underline"
            >
              Kota, “Design and Evaluation of Multi-Agent AI Oracle Systems for Prediction
              Market Resolution” (arXiv:2605.30802)
            </a>
            . Resolution math (Section 1.4) is unchanged — the oracle only ever supplies a
            single <span className="text-[color:var(--text-primary)]">final_price</span>, or
            abstains.
          </p>
        </Reveal>
      </section>

      {/* ── closing CTA ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        <Reveal>
          <div
            className="border border-[color:var(--border-dim)] rounded px-6 py-14 sm:py-16 text-center relative overflow-hidden"
            style={{ background: 'var(--bg-surface)' }}
          >
            <svg
              viewBox="0 0 720 220"
              className="absolute inset-x-0 bottom-0 w-full opacity-[0.15] pointer-events-none"
              preserveAspectRatio="xMidYMax slice"
              fill="none"
            >
              <path d={HERO_CURVE} stroke="#C8102E" strokeWidth={2} />
            </svg>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#C8102E] mb-4 relative">
              End of transmission
            </p>
            <h2 className="font-display font-800 text-3xl sm:text-4xl tracking-tight text-[color:var(--text-primary)] relative">
              Ready to price the future?
            </h2>
            <p className="font-serif italic text-base mt-4 max-w-md mx-auto text-[color:var(--text-muted)] relative">
              Market #0 is live on Arbitrum Sepolia: “What will ETH price be by the end of 2026?”
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8 relative">
              <Link
                to="/markets"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-[#c8102e] text-white font-display font-700 text-sm tracking-wider rounded hover:bg-[#a5001b] active:scale-[0.98] transition-all"
                style={{ boxShadow: '0 0 28px rgba(200,16,46,0.35)' }}
              >
                Enter Markets →
              </Link>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center justify-center px-8 py-3.5 border border-[color:var(--border)] font-display font-600 text-sm tracking-wider rounded text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:border-[#C8102E] transition-all"
              >
                Replay the story ↑
              </button>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
