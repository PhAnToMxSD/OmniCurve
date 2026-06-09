import { useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import * as d3 from 'd3'
import { useMarkets } from '@/hooks/useMarkets'
import { gaussianPDF } from '@/lib/math'
import { ConnectButton } from '@/components/wallet/ConnectButton'

// Animated hero Gaussian SVG
function HeroCurve() {
  const svgRef = useRef<SVGSVGElement>(null)
  const sigmaRef = useRef(1)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const svg = d3.select(svgRef.current!)
    const W = 800, H = 200
    const mu = 0
    const margin = { top: 16, right: 40, bottom: 16, left: 40 }
    const iW = W - margin.left - margin.right
    const iH = H - margin.top - margin.bottom

    svg.attr('viewBox', `0 0 ${W} ${H}`)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3.scaleLinear().domain([-4, 4]).range([0, iW])

    const lineGen = d3.line<{ x: number; y: number }>()
      .x(d => xScale(d.x))
      .y(d => d.y)
      .curve(d3.curveBasis)

    const areaGen = d3.area<{ x: number; y: number }>()
      .x(d => xScale(d.x))
      .y0(iH)
      .y1(d => d.y)
      .curve(d3.curveBasis)

    const defs = svg.append('defs')
    const grad = defs.append('linearGradient').attr('id', 'hero-grad').attr('x1','0%').attr('y1','0%').attr('x2','0%').attr('y2','100%')
    grad.append('stop').attr('offset','0%').attr('stop-color','#22D3A3').attr('stop-opacity', 0.15)
    grad.append('stop').attr('offset','100%').attr('stop-color','#22D3A3').attr('stop-opacity', 0)

    const filter = defs.append('filter').attr('id', 'hero-glow')
    filter.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'blur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    const areaPath = g.append('path').attr('fill', 'url(#hero-grad)')
    const linePath = g.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#22D3A3')
      .attr('stroke-width', 2)
      .attr('filter', 'url(#hero-glow)')

    // μ line
    g.append('line')
      .attr('x1', xScale(0)).attr('x2', xScale(0))
      .attr('y1', 0).attr('y2', iH)
      .attr('stroke', 'rgba(255,184,0,0.35)')
      .attr('stroke-dasharray', '4 3')
      .attr('stroke-width', 1)

    let t = 0
    const animate = () => {
      t += 0.008
      const sigma = 1 + 0.2 * Math.sin(t)
      sigmaRef.current = sigma
      const pts = d3.range(300).map(i => {
        const x = -4 + (8 * i) / 299
        const pdf = gaussianPDF(x, mu, sigma)
        const yMax = gaussianPDF(0, 0, 1) * 1.5
        return { x, y: iH - (pdf / yMax) * iH }
      })
      areaPath.attr('d', areaGen(pts) ?? '')
      linePath.attr('d', lineGen(pts) ?? '')
      frameRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      svg.selectAll('*').remove()
    }
  }, [])

  return <svg ref={svgRef} className="w-full" style={{ height: 200 }} />
}

const HEADLINE = 'Every Outcome, One Curve'.split('')

export default function Landing() {
  const { data: markets } = useMarkets()

  const totalLiquidity = markets?.reduce((s, m) => s + m.totalLiquidity, 0) ?? 0
  const resolvedCount = markets?.filter(m => m.isResolved).length ?? 0

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav strip */}
      <header className="fixed top-0 left-0 right-0 z-40 px-6 h-14 flex items-center justify-between border-b border-[rgba(255,255,255,0.05)] bg-[rgba(6,8,16,0.8)] backdrop-blur-md">
        <span className="font-display font-800 text-[#E2DDD4] text-sm tracking-wider">
          OMNI<span className="text-[#FFB800]">CURVE</span>
        </span>
        <div className="flex items-center gap-4">
          <Link to="/docs" className="text-xs font-display tracking-widest uppercase text-[rgba(226,221,212,0.45)] hover:text-[#E2DDD4] transition-colors">Docs</Link>
          <ConnectButton />
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center pt-14 px-6">
        <div className="max-w-4xl w-full text-center space-y-8 py-24">
          {/* Animated curve */}
          <motion.div
            className="w-full max-w-2xl mx-auto opacity-80"
            initial={{ opacity: 0, scaleX: 0.9 }}
            animate={{ opacity: 0.8, scaleX: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            <HeroCurve />
          </motion.div>

          {/* Headline */}
          <div className="overflow-hidden">
            <h1 className="font-display font-800 text-5xl sm:text-7xl text-[#E2DDD4] tracking-tight leading-none">
              {HEADLINE.map((char, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    delay: 0.4 + i * 0.025,
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ whiteSpace: char === ' ' ? 'pre' : 'normal' }}
                >
                  {char}
                </motion.span>
              ))}
            </h1>
          </div>

          {/* Sub */}
          <motion.p
            className="font-serif italic text-lg sm:text-xl text-[rgba(226,221,212,0.55)] max-w-lg mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            OmniCurve collapses prediction markets into a single continuous liquidity curve — one pool, infinite strikes.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.5 }}
          >
            <Link
              to="/markets"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-[#FFB800] text-[#060810] font-display font-700 text-sm tracking-wide rounded hover:bg-[#ffc933] active:scale-[0.98] transition-all"
            >
              Enter Markets →
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-[rgba(255,255,255,0.12)] text-[rgba(226,221,212,0.7)] font-display font-600 text-sm tracking-wide rounded hover:border-[rgba(255,184,0,0.3)] hover:text-[#E2DDD4] transition-all"
            >
              Read the Docs
            </Link>
          </motion.div>

          {/* Stats bar */}
          <motion.div
            className="grid grid-cols-3 gap-6 max-w-sm mx-auto pt-8 border-t border-[rgba(255,255,255,0.06)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2, duration: 0.6 }}
          >
            <div className="text-center">
              <p className="font-mono text-2xl text-[#FFB800]">{markets?.length ?? 0}</p>
              <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.3)] uppercase mt-1">Markets</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-2xl text-[#FFB800]">
                ${(totalLiquidity / 1e6).toFixed(0)}
              </p>
              <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.3)] uppercase mt-1">TVL</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-2xl text-[#FFB800]">{resolvedCount}</p>
              <p className="text-[10px] font-display tracking-widest text-[rgba(226,221,212,0.3)] uppercase mt-1">Resolved</p>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Tech strip */}
      <div className="border-t border-[rgba(255,255,255,0.05)] py-4 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-6 text-[10px] font-mono text-[rgba(226,221,212,0.2)] tracking-wider uppercase">
          <span>Arbitrum Sepolia</span>
          <span>·</span>
          <span>Gaussian CDF Pricing</span>
          <span>·</span>
          <span>EIP-1167 Proxies</span>
          <span>·</span>
          <span>Rust/WASM</span>
          <span>·</span>
          <span>Non-custodial</span>
        </div>
      </div>
    </div>
  )
}
