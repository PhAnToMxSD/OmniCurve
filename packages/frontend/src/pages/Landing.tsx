import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useMarkets } from '@/hooks/useMarkets'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import ShaderBackground from '@/components/ui/ShaderBackground'
import { GooeyIntro } from '@/components/ui/GooeyIntro'

// Module-level flag: the gooey greeting plays once per page load — every time
// the user opens/reloads the landing page, but not on SPA navigations back to it.
let introPlayedThisLoad = false

const fadeUp = (delay: number, duration = 0.7) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration, ease: [0.22, 1, 0.36, 1] },
})

export default function Landing() {
  const { data: markets } = useMarkets()
  const [showIntro, setShowIntro] = useState(() => !introPlayedThisLoad)

  const totalLiquidity = markets?.reduce((s, m) => s + Math.max(0, m.totalLiquidity), 0) ?? 0
  const resolvedCount  = markets?.filter(m => m.isResolved).length ?? 0

  useEffect(() => {
    document.body.classList.add('shader-bg')
    return () => document.body.classList.remove('shader-bg')
  }, [])

  const dismissIntro = () => {
    introPlayedThisLoad = true
    setShowIntro(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {showIntro && <GooeyIntro onDone={dismissIntro} />}

      <ShaderBackground darkMode={false} />

      {/* ── Nav ── */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-40 px-6 h-14 flex items-center justify-between border-b backdrop-blur-md bg-[rgba(250,244,232,0.85)] border-[rgba(62,44,30,0.16)]"
        {...fadeUp(showIntro ? 0 : 3.2, 1)}
      >
        <span className="font-display font-800 text-sm tracking-wider text-[#231812]">
          OMNI<span className="text-[#C8102E]">CURVE</span>
        </span>

        <div className="flex items-center gap-3">
          <Link
            to="/docs"
            className="text-xs font-display tracking-widest uppercase text-[rgba(35,24,18,0.62)] hover:text-[#231812] transition-colors duration-200"
          >
            Docs
          </Link>

          <ConnectButton />
        </div>
      </motion.header>

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center pt-14 px-6 relative">

        {/* Scrim — keeps ink text crisp over the red shader lines */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(247,240,227,0.85) 0%, rgba(247,240,227,0.40) 60%, transparent 100%)',
          }}
        />

        <div className="w-full text-center relative z-10 flex flex-col items-center gap-8 py-24">

          <motion.h1
            className="font-display font-800 tracking-tight leading-none whitespace-nowrap text-[#231812]"
            style={{
              fontSize: 'clamp(2.4rem, 6.5vw, 5.5rem)',
              textShadow: '0 2px 28px rgba(247,240,227,0.95), 0 0 56px rgba(247,240,227,0.85)',
            }}
            {...fadeUp(0.4, 1)}
          >
            Every Outcome, <span className="text-[#C8102E]">One Curve</span>
          </motion.h1>

          <motion.p
            className="font-serif italic text-base sm:text-lg max-w-md mx-auto leading-relaxed text-[rgba(35,24,18,0.78)]"
            style={{ textShadow: '0 1px 14px rgba(247,240,227,0.95)' }}
            {...fadeUp(1.2, 1)}
          >
            One pool. Every strike price. Priced continuously by the Gaussian curve.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-3 justify-center"
            {...fadeUp(2.0, 1)}
          >
            <Link
              to="/markets"
              className="inline-flex items-center justify-center gap-2 px-9 py-4 bg-[#c8102e] text-white font-display font-700 text-sm tracking-wider rounded hover:bg-[#a5001b] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
              style={{ boxShadow: '0 10px 32px rgba(200,16,46,0.30)' }}
            >
              Enter Markets →
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center justify-center gap-2 px-9 py-4 border font-display font-600 text-sm tracking-wider rounded transition-all duration-200 border-[rgba(62,44,30,0.40)] text-[rgba(35,24,18,0.82)] hover:border-[#C8102E] hover:text-[#C8102E] hover:-translate-y-0.5 bg-[rgba(253,248,238,0.55)]"
              style={{ backdropFilter: 'blur(8px)' }}
            >
              How It Works
            </Link>
          </motion.div>

          <motion.div
            className="grid grid-cols-3 gap-8 max-w-xs mx-auto pt-8 border-t border-[rgba(62,44,30,0.22)]"
            {...fadeUp(2.0, 1)}
          >
            {[
              { value: markets?.length ?? 0,                    label: 'Markets'  },
              { value: `$${totalLiquidity.toFixed(2)}`,           label: 'TVL'      },
              { value: resolvedCount,                            label: 'Resolved' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p
                  className="font-mono text-xl text-[#C8102E]"
                  style={{ textShadow: '0 1px 14px rgba(247,240,227,0.95)' }}
                >
                  {value}
                </p>
                <p className="text-[9px] font-display tracking-widest uppercase mt-1 text-[rgba(35,24,18,0.55)]">
                  {label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </main>

      {/* ── Tech strip ── */}
      <motion.div
        className="border-t py-4 px-6 border-[rgba(62,44,30,0.16)] bg-[rgba(250,244,232,0.70)] backdrop-blur-sm"
        {...fadeUp(showIntro ? 0.3 : 3.2, 1)}
      >
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-6 text-[10px] font-mono tracking-wider uppercase text-[rgba(35,24,18,0.48)]">
          <span>Arbitrum Stylus</span>
          <span className="text-[#C8102E]">·</span>
          <span>Rust → WASM On-chain Math</span>
          <span className="text-[#C8102E]">·</span>
          <span>Gaussian CDF Pricing</span>
          <span className="text-[#C8102E]">·</span>
          <span>EIP-1167 Proxy Factory</span>
          <span className="text-[#C8102E]">·</span>
          <span>Non-Custodial</span>
        </div>
      </motion.div>
    </div>
  )
}
