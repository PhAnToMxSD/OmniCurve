import { useRef, useCallback, InputHTMLAttributes } from 'react'

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label?: string
  displayValue?: string
}

export function Slider({ value, min, max, step = 0.01, onChange, label, displayValue, ...props }: SliderProps) {
  const ref = useRef<HTMLInputElement>(null)

  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value))
    },
    [onChange],
  )

  return (
    <div className="flex flex-col gap-2">
      {(label || displayValue) && (
        <div className="flex justify-between items-center">
          {label && (
            <span className="text-xs font-display tracking-wider text-[rgba(226,221,212,0.45)] uppercase">
              {label}
            </span>
          )}
          {displayValue && (
            <span className="text-sm font-mono text-[#FFB800]">{displayValue}</span>
          )}
        </div>
      )}
      <div className="relative h-5 flex items-center">
        <div className="w-full h-px bg-[rgba(255,255,255,0.08)] rounded-full relative">
          {/* YES (right) fill */}
          <div
            className="absolute right-0 top-0 h-full rounded-full"
            style={{
              width: `${100 - pct}%`,
              background: 'rgba(34,211,163,0.35)',
            }}
          />
          {/* NO (left) fill */}
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: 'rgba(255,69,96,0.35)',
            }}
          />
        </div>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-5"
          style={{ WebkitAppearance: 'none' }}
          {...props}
        />
        {/* Thumb */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-[#FFB800] bg-[#060810] pointer-events-none"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
    </div>
  )
}
