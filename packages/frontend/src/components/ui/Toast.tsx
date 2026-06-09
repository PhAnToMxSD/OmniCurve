import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

type ToastType = 'success' | 'error' | 'pending'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.type === 'pending') return
    const t = setTimeout(() => onDismiss(toast.id), 5000)
    return () => clearTimeout(t)
  }, [toast.id, toast.type, onDismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.92 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-3 p-4 rounded border backdrop-blur-sm max-w-sm shadow-2xl cursor-pointer`}
      style={{
        background: '#0d1020',
        borderColor:
          toast.type === 'success'
            ? 'rgba(34,211,163,0.3)'
            : toast.type === 'error'
              ? 'rgba(255,69,96,0.3)'
              : 'rgba(255,184,0,0.3)',
      }}
      onClick={() => onDismiss(toast.id)}
    >
      <div className="mt-0.5 flex-shrink-0">
        {toast.type === 'success' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#22D3A3" strokeWidth="1.5" />
            <path d="M5 8l2 2 4-4" stroke="#22D3A3" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        {toast.type === 'error' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#FF4560" strokeWidth="1.5" />
            <path d="M6 6l4 4M10 6l-4 4" stroke="#FF4560" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        {toast.type === 'pending' && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="animate-spin"
          >
            <circle cx="8" cy="8" r="6" stroke="rgba(255,184,0,0.25)" strokeWidth="2" />
            <path
              d="M8 2a6 6 0 016 6"
              stroke="#FFB800"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <p className="text-sm text-[#E2DDD4] leading-relaxed font-mono">{toast.message}</p>
    </motion.div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
