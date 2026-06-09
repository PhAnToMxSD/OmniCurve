import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args))

interface BadgeProps {
  variant?: 'yes' | 'no' | 'live' | 'resolved' | 'muted' | 'amber'
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'muted', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono rounded-sm tracking-wide',
        {
          'bg-[rgba(34,211,163,0.12)] text-[#22D3A3] border border-[rgba(34,211,163,0.2)]':
            variant === 'yes' || variant === 'live',
          'bg-[rgba(255,69,96,0.12)] text-[#FF4560] border border-[rgba(255,69,96,0.2)]':
            variant === 'no' || variant === 'resolved',
          'bg-[rgba(255,255,255,0.06)] text-[rgba(226,221,212,0.5)] border border-[rgba(255,255,255,0.08)]':
            variant === 'muted',
          'bg-[rgba(255,184,0,0.12)] text-[#FFB800] border border-[rgba(255,184,0,0.2)]':
            variant === 'amber',
        },
        className,
      )}
    >
      {(variant === 'live') && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#22D3A3] animate-pulse" />
      )}
      {children}
    </span>
  )
}
