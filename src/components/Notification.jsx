import { useEffect } from 'react'
import { CheckCircle, X, AlertCircle } from 'lucide-react'

export default function Notification({ type = 'success', message, onClose, duration = 3000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const isError = type === 'error'

  return (
    <div className="fixed top-4 right-4 z-[100] animate-fade-in-up">
      <div className={`bg-white border rounded-lg shadow-lg p-4 pr-12 max-w-md ${isError ? 'border-red-200' : 'border-gray-200'}`}>
        <div className="flex items-start gap-3">
          {isError ? (
            <AlertCircle className="text-red-500" size={20} />
          ) : (
            <CheckCircle className="text-gray-400" size={20} />
          )}
          <p className="text-sm text-gray-700">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-300 hover:text-gray-500 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
