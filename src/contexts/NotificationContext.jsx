import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

const NotificationContext = createContext()

export function useNotification() {
  return useContext(NotificationContext)
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [historique, setHistorique] = useState([])
  const idCounter = useRef(0)

  const notify = useCallback((message, type = 'success') => {
    const id = ++idCounter.current
    const timestamp = new Date()
    const toast = { id, message, type, timestamp }

    setToasts(prev => [...prev, toast])
    setHistorique(prev => [toast, ...prev])

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearHistorique = useCallback(() => {
    setHistorique([])
  }, [])

  return (
    <NotificationContext.Provider value={{ notify, historique, clearHistorique }}>
      {children}

      {/* Toasts empilés en haut à droite */}
      <div className="fixed top-4 left-4 right-4 z-[200] flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto animate-toast-in max-w-sm w-full sm:w-auto"
          >
            <div className={`bg-white border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 ${
              toast.type === 'error' ? 'border-red-200' : 'border-gray-200'
            }`}>
              {toast.type === 'error' ? (
                <AlertCircle className="text-red-500 flex-shrink-0" size={18} />
              ) : (
                <CheckCircle className="text-emerald-500 flex-shrink-0" size={18} />
              )}
              <p className="text-sm text-gray-700 flex-1">{toast.message}</p>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}
