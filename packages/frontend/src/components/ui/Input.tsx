import { forwardRef, InputHTMLAttributes } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args))

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  suffix?: string
  prefix?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, suffix, prefix, className, type, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-display tracking-wider text-[rgba(226,221,212,0.45)] uppercase">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-[rgba(226,221,212,0.45)] text-sm font-mono select-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              'w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]',
              'text-[#E2DDD4] text-sm rounded py-2.5 px-3',
              'placeholder:text-[rgba(226,221,212,0.25)]',
              'focus:outline-none focus:border-[rgba(255,184,0,0.5)] focus:bg-[rgba(255,184,0,0.03)]',
              'transition-colors duration-150',
              type === 'number' && 'font-mono',
              prefix && 'pl-7',
              suffix && 'pr-14',
              error && 'border-[rgba(255,69,96,0.6)] focus:border-[#FF4560]',
              className,
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-[rgba(226,221,212,0.45)] text-xs font-mono select-none">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-[#FF4560] font-mono">{error}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'
