import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': '#060810',
        'bg-surface': 'rgba(255,255,255,0.04)',
        'bg-surface-2': 'rgba(255,255,255,0.07)',
        border: 'rgba(255,255,255,0.08)',
        'text-primary': '#E2DDD4',
        'text-muted': 'rgba(226,221,212,0.45)',
        'accent-yes': '#22D3A3',
        'accent-no': '#FF4560',
        'accent-data': '#FFB800',
        'accent-data-dim': 'rgba(255,184,0,0.15)',
        'grid-line': 'rgba(255,255,255,0.04)',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        serif: ['"DM Serif Text"', 'serif'],
      },
      backgroundImage: {
        'grid-paper':
          'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-40': '40px 40px',
      },
    },
  },
  plugins: [],
}

export default config
