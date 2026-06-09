import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { ToastProvider } from '@/components/ui/Toast'

export default function PageWrapper() {
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="border-t border-[rgba(255,255,255,0.06)] py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs font-mono text-[rgba(226,221,212,0.3)]">
              OmniCurve — Arbitrum Sepolia Testnet
            </p>
            <div className="flex items-center gap-4 text-xs font-mono text-[rgba(226,221,212,0.3)]">
              <a
                href="https://sepolia.arbiscan.io/address/0x1bbdb700863309ab2588c9d64786bd0ac376d150"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#FFB800] transition-colors"
              >
                Factory ↗
              </a>
              <span>·</span>
              <span>v0.1.0</span>
            </div>
          </div>
        </footer>
      </div>
    </ToastProvider>
  )
}
