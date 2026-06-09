import { NavLink, Link } from 'react-router-dom'
import { ConnectButton } from '@/components/wallet/ConnectButton'

const navLinks = [
  { to: '/markets', label: 'Markets' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/docs', label: 'Docs' },
]

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(6,8,16,0.85)] backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="4" fill="rgba(255,184,0,0.08)" />
            <path
              d="M4 24 Q8 8 16 8 Q24 8 28 24"
              stroke="#22D3A3"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="16" cy="8" r="2" fill="#FFB800" />
            <line x1="16" y1="8" x2="16" y2="24" stroke="rgba(255,184,0,0.3)" strokeWidth="1" strokeDasharray="2 2" />
          </svg>
          <span className="font-display font-800 text-[#E2DDD4] text-sm tracking-wider group-hover:text-[#FFB800] transition-colors">
            OMNI<span className="text-[#FFB800]">CURVE</span>
          </span>
        </Link>

        {/* Nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `px-4 py-2 text-xs font-display tracking-wider uppercase transition-colors rounded ${
                  isActive
                    ? 'text-[#FFB800]'
                    : 'text-[rgba(226,221,212,0.45)] hover:text-[#E2DDD4]'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <ConnectButton />
      </div>
    </header>
  )
}
