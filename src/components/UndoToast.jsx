import { useState, useEffect, useRef } from 'react'
import { Undo2 } from 'lucide-react'

export default function UndoToast({ message, duration = 5000, onUndo, onExpire }) {
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      dismiss(false)
    }, duration)

    return () => clearTimeout(timerRef.current)
  }, [duration])

  function dismiss(undone) {
    setExiting(true)
    clearTimeout(timerRef.current)
    setTimeout(() => {
      setVisible(false)
      if (undone) {
        onUndo?.()
      } else {
        onExpire?.()
      }
    }, 250)
  }

  if (!visible) return null

  return (
    <div className={`fixed bottom-6 inset-x-0 flex justify-center pointer-events-none z-[9999] ${exiting ? 'animate-slide-out-bottom' : 'animate-slide-in-bottom'}`}>
      <div className="relative pointer-events-auto bg-white border border-gray-200 rounded-lg flex items-center gap-3 pl-4 pr-2 py-2.5 min-w-[280px] max-w-[420px] shadow-lg">
        <span className="text-sm text-gray-700 flex-1">{message}</span>
        <button
          onClick={() => dismiss(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-md text-xs font-medium hover:bg-gray-700 transition-colors shrink-0"
        >
          <Undo2 size={12} />
          Annuler
        </button>
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gray-100 rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-gray-400"
            style={{
              width: '100%',
              animation: `progressShrink ${duration}ms linear forwards`
            }}
          />
        </div>
      </div>
    </div>
  )
}
