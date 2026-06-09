import { forwardRef, ButtonHTMLAttributes } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args))

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'muted'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
)

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-display font-600 tracking-wide transition-all duration-150 cursor-pointer select-none',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          {
            'bg-[#FFB800] text-[#060810] hover:bg-[#ffc933] active:scale-[0.98]':
              variant === 'primary',
            'border border-[#FFB800] text-[#FFB800] hover:bg-[rgba(255,184,0,0.08)] active:scale-[0.98]':
              variant === 'ghost',
            'border border-[#FF4560] text-[#FF4560] hover:bg-[rgba(255,69,96,0.08)] active:scale-[0.98]':
              variant === 'danger',
            'border border-[rgba(255,255,255,0.08)] text-[rgba(226,221,212,0.45)] hover:border-[rgba(255,255,255,0.15)] hover:text-[#E2DDD4]':
              variant === 'muted',
          },
          {
            'px-3 py-1.5 text-xs rounded': size === 'sm',
            'px-5 py-2.5 text-sm rounded': size === 'md',
            'px-7 py-3.5 text-base rounded': size === 'lg',
          },
          className,
        )}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
