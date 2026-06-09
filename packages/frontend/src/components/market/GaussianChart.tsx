import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { pYes as calcPYes } from '@/lib/math'

interface GaussianChartProps {
  mu: number
  sigma: number
  strikeX?: number
  direction?: 'yes' | 'no'
  height?: number
  mini?: boolean
  /** Total pool liquidity (USDC). Drives the peak height — higher liquidity = taller curve. */
  liquidity?: number
  /** Real-world spot value (e.g. live ETH price). Drawn as a vertical reference line.
   *  Settlement is against this real value, NOT μ — so it's a reference, not the curve. */
  spotX?: number
  /** Label for the spot line, e.g. "ETH $3,512". */
  spotLabel?: string
}

const MARGIN = { top: 24, right: 20, bottom: 36, left: 12 }

// USDC liquidity that maps to a full-height curve. sqrt compression keeps small
// testnet amounts visible while larger pools still grow toward the top.
const LIQUIDITY_FULL_SCALE = 100

// Unnormalized Gaussian: peaks at exactly 1 when x === mu, regardless of sigma.
// This lets sigma control visible width (under a fixed domain) and liquidity
// control height — instead of the PDF self-normalizing both away.
function bellShape(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma
  return Math.exp(-0.5 * z * z)
}

export function GaussianChart({
  mu,
  sigma,
  strikeX,
  direction,
  height = 260,
  mini = false,
  liquidity,
  spotX,
  spotLabel,
}: GaussianChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // Sticky x-domain: anchored once on the first valid curve, then expand-only.
  // A fixed domain is what makes a moving mean visibly translate the bell.
  const domainRef = useRef<[number, number] | null>(null)
  const [width, setWidth] = useState(600)

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || sigma <= 0) return

    const innerW = width - MARGIN.left - MARGIN.right
    const innerH = height - MARGIN.top - MARGIN.bottom

    // Establish the sticky domain on first valid render, then only widen it so a
    // shifting mean stays on-screen without re-centering (which would hide motion).
    if (domainRef.current === null) {
      domainRef.current = [mu - 4 * sigma, mu + 4 * sigma]
    }
    let needLo = mu - 4 * sigma
    let needHi = mu + 4 * sigma
    // Keep the spot line on-screen: widen the domain (with a little padding) so the
    // real-world value is always visible alongside the belief curve.
    if (spotX !== undefined && Number.isFinite(spotX)) {
      const pad = Math.max(sigma * 0.5, Math.abs(spotX - mu) * 0.08)
      needLo = Math.min(needLo, spotX - pad)
      needHi = Math.max(needHi, spotX + pad)
    }
    if (needLo < domainRef.current[0]) domainRef.current[0] = needLo
    if (needHi > domainRef.current[1]) domainRef.current[1] = needHi
    const xDomain: [number, number] = mini ? [mu - 4 * sigma, mu + 4 * sigma] : domainRef.current

    // Peak height as a fraction of the plot: encodes liquidity. When no liquidity
    // is supplied (mini cards, docs), fall back to a fixed pleasant height.
    const peakFrac =
      liquidity === undefined
        ? 0.9
        : Math.max(0.08, Math.min(1, Math.sqrt(Math.max(0, liquidity) / LIQUIDITY_FULL_SCALE)))

    const nPoints = 300
    const points = d3.range(nPoints).map((i) => {
      const x = xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / (nPoints - 1)
      return { x, y: bellShape(x, mu, sigma) }
    })

    const xScale = d3.scaleLinear().domain(xDomain).range([0, innerW])
    // Shape peaks at 1; map [0,1] so the peak sits `peakFrac` up from the baseline.
    const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, innerH * (1 - peakFrac)])

    const areaGen = d3
      .area<{ x: number; y: number }>()
      .x((d) => xScale(d.x))
      .y0(innerH)
      .y1((d) => yScale(d.y))
      .curve(d3.curveBasis)

    const lineGen = d3
      .line<{ x: number; y: number }>()
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y))
      .curve(d3.curveBasis)

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Defs for filters
    const defs = svg.append('defs')
    defs
      .append('filter')
      .attr('id', 'glow')
      .append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur')
    const glowMerge = svg.select('#glow').append('feMerge')
    glowMerge.append('feMergeNode').attr('in', 'coloredBlur')
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Strike-based fills
    if (strikeX !== undefined) {
      // NO fill (left of strike)
      const noPoints = points.filter((p) => p.x <= strikeX)
      if (noPoints.length > 1) {
        g.append('path')
          .datum(noPoints)
          .attr('d', areaGen as unknown as string)
          .attr('fill', 'rgba(255,69,96,0.12)')
          .attr('stroke', 'none')
      }

      // YES fill (right of strike)
      const yesPoints = points.filter((p) => p.x >= strikeX)
      if (yesPoints.length > 1) {
        g.append('path')
          .datum(yesPoints)
          .attr('d', areaGen as unknown as string)
          .attr('fill', 'rgba(34,211,163,0.12)')
          .attr('stroke', 'none')
      }
    } else {
      // Default full fill
      g.append('path')
        .datum(points)
        .attr('d', areaGen as unknown as string)
        .attr('fill', 'rgba(34,211,163,0.06)')
        .attr('stroke', 'none')
    }

    // Curve line with glow
    g.append('path')
      .datum(points)
      .attr('d', lineGen as unknown as string)
      .attr('fill', 'none')
      .attr('stroke', '#E2DDD4')
      .attr('stroke-width', mini ? 1.5 : 2)
      .attr('filter', 'url(#glow)')
      .attr('opacity', 0.9)

    // μ dashed line
    const muPos = xScale(mu)
    g.append('line')
      .attr('x1', muPos)
      .attr('x2', muPos)
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', 'rgba(255,184,0,0.4)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')

    if (!mini) {
      g.append('text')
        .attr('x', muPos + 4)
        .attr('y', 10)
        .attr('fill', '#FFB800')
        .attr('font-size', 11)
        .attr('font-family', 'JetBrains Mono, monospace')
        .text('μ')
    }

    // Strike line (if set)
    if (strikeX !== undefined && !mini) {
      const sPos = xScale(Math.max(xDomain[0], Math.min(xDomain[1], strikeX)))
      g.append('line')
        .attr('x1', sPos)
        .attr('x2', sPos)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', '#FFB800')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.8)

      // P(YES) and P(NO) labels
      const pY = calcPYes(strikeX, mu, sigma)
      const pN = 1 - pY

      // P(NO) label — left side
      if (sPos > 50) {
        g.append('text')
          .attr('x', sPos - 8)
          .attr('y', 18)
          .attr('fill', '#FF4560')
          .attr('font-size', 10)
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('text-anchor', 'end')
          .text(`P(NO) ${(pN * 100).toFixed(1)}%`)
      }

      // P(YES) label — right side
      if (sPos < innerW - 50) {
        g.append('text')
          .attr('x', sPos + 8)
          .attr('y', 18)
          .attr('fill', '#22D3A3')
          .attr('font-size', 10)
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('text-anchor', 'start')
          .text(`P(YES) ${(pY * 100).toFixed(1)}%`)
      }
    }

    // Real-world spot line (e.g. live ETH price). Settlement resolves against THIS
    // value, not μ — so it's drawn distinctly (cyan, dashed) as a reference marker.
    if (spotX !== undefined && Number.isFinite(spotX) && !mini) {
      const clamped = Math.max(xDomain[0], Math.min(xDomain[1], spotX))
      const spPos = xScale(clamped)
      g.append('line')
        .attr('x1', spPos)
        .attr('x2', spPos)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', '#38BDF8')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '2 3')
        .attr('opacity', 0.9)

      const label = spotLabel ?? `spot ${spotX.toLocaleString()}`
      const anchor = spPos > innerW - 70 ? 'end' : 'start'
      g.append('text')
        .attr('x', spPos + (anchor === 'end' ? -5 : 5))
        .attr('y', innerH - 6)
        .attr('fill', '#38BDF8')
        .attr('font-size', 10)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('text-anchor', anchor)
        .text(label)
    }

    // X axis
    const xAxis = d3.axisBottom(xScale).ticks(mini ? 3 : 5)
    g.append('g')
      .attr('transform', `translate(0, ${innerH})`)
      .call(xAxis)
      .call((g) => {
        g.select('.domain').attr('stroke', 'rgba(255,255,255,0.08)')
        g.selectAll('.tick line').attr('stroke', 'rgba(255,255,255,0.08)').attr('y2', 4)
        g.selectAll('.tick text')
          .attr('fill', 'rgba(226,221,212,0.4)')
          .attr('font-size', mini ? 9 : 10)
          .attr('font-family', 'JetBrains Mono, monospace')
      })
  }, [mu, sigma, strikeX, width, height, direction, mini, liquidity, spotX, spotLabel])

  if (sigma <= 0) {
    return (
      <div
        ref={containerRef}
        className="w-full flex items-center justify-center"
        style={{ height }}
      >
        {!mini && (
          <p className="font-mono text-xs text-[rgba(226,221,212,0.25)]">
            Curve not yet configured — add liquidity to set μ and σ
          </p>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" style={{ height }} />
    </div>
  )
}
