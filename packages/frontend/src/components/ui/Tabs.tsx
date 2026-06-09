import { motion } from 'framer-motion'

interface Tab {
  label: string
  value: string
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (value: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex gap-0 border-b border-[rgba(255,255,255,0.06)] ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`relative px-5 py-3 text-sm font-display tracking-wide transition-colors duration-150 ${
            active === tab.value
              ? 'text-[#E2DDD4]'
              : 'text-[rgba(226,221,212,0.4)] hover:text-[rgba(226,221,212,0.7)]'
          }`}
        >
          {tab.label}
          {active === tab.value && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-px bg-[#FFB800]"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
        </button>
      ))}
    </div>
  )
}
