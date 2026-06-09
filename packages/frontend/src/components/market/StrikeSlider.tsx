import { Slider } from '@/components/ui/Slider'
import { Input } from '@/components/ui/Input'
import { pYes, pNo } from '@/lib/math'

interface StrikeSliderProps {
  value: number
  min: number
  max: number
  mu: number
  sigma: number
  onChange: (v: number) => void
}

export function StrikeSlider({ value, min, max, mu, sigma, onChange }: StrikeSliderProps) {
  const py = pYes(value, mu, sigma)
  const pn = pNo(value, mu, sigma)

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Input
            label="Strike Price"
            type="number"
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
            }}
            step={sigma / 10}
          />
        </div>
        <div className="flex gap-3 pb-2.5 text-xs font-mono">
          <span>
            <span className="text-[rgba(34,211,163,0.6)] text-[10px] uppercase tracking-wider">YES </span>
            <span className="text-[#22D3A3]">{(py * 100).toFixed(1)}%</span>
          </span>
          <span>
            <span className="text-[rgba(255,69,96,0.6)] text-[10px] uppercase tracking-wider">NO </span>
            <span className="text-[#FF4560]">{(pn * 100).toFixed(1)}%</span>
          </span>
        </div>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={(max - min) / 500}
        onChange={onChange}
      />
      <div className="flex justify-between text-[10px] font-mono text-[rgba(226,221,212,0.25)]">
        <span>{min.toLocaleString()}</span>
        <span>μ = {mu.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  )
}
