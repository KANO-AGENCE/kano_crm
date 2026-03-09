import { X } from 'lucide-react'

export default function ModaleConfirm({ message, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-[100]"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-800 mb-1">Confirmation</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>

        <div className="px-6 pb-5 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}
