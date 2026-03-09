import { useState } from 'react'
import { X } from 'lucide-react'
import { FORMULES } from '../lib/constants'

export default function FormAbonnement({ abonnement, entrepriseId, projets, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    formule: abonnement?.formule || 'essentiel',
    tarif_mensuel: abonnement?.tarif_mensuel || FORMULES.essentiel.prix,
    date_debut: abonnement?.date_debut || '',
    actif: abonnement?.actif !== undefined ? abonnement.actif : true,
    projet_id: abonnement?.projet_id || null,
    description: abonnement?.description || ''
  })

  function handleFormuleChange(formule) {
    setFormData({
      ...formData,
      formule,
      tarif_mensuel: FORMULES[formule].prix
    })
  }

  function handleSubmit() {
    if (!formData.tarif_mensuel) {
      alert('Le tarif mensuel est obligatoire')
      return
    }
    if (!formData.date_debut) {
      alert('La date de début est obligatoire')
      return
    }

    onSave({
      ...formData,
      entreprise_id: entrepriseId,
      id: abonnement?.id
    })
  }

  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-[60] p-4"
      onClick={(e) => {
        e.stopPropagation()
        onCancel()
      }}
    >
      <div
        className="bg-white rounded-xl w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200/60 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-800">
            {abonnement ? 'Modifier l\'abonnement' : 'Nouvel abonnement'}
          </h2>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs text-gray-400 mb-2">Formule</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FORMULES).slice(0, 3).map(([key, val]) => (
                  <label
                    key={key}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.formule === key
                        ? 'border-gray-800 bg-gray-50'
                        : 'border-gray-200/60 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="formule"
                      value={key}
                      checked={formData.formule === key}
                      onChange={(e) => handleFormuleChange(e.target.value)}
                      className="sr-only"
                    />
                    <div className="font-medium text-gray-700 text-sm">{val.label}</div>
                    <div className="text-xs text-gray-400">{val.prix}€/mois</div>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(FORMULES).slice(3, 6).map(([key, val]) => (
                  <label
                    key={key}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.formule === key
                        ? 'border-gray-800 bg-gray-50'
                        : 'border-gray-200/60 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="formule"
                      value={key}
                      checked={formData.formule === key}
                      onChange={(e) => handleFormuleChange(e.target.value)}
                      className="sr-only"
                    />
                    <div className="font-medium text-gray-700 text-sm">{val.label}</div>
                    <div className="text-xs text-gray-400">{val.prix}€/mois</div>
                  </label>
                ))}
              </div>

              {projets && projets.length > 0 && (
                <div className="mt-4">
                  <label className="block text-xs text-gray-400 mb-1">
                    Associer à un projet (optionnel)
                  </label>
                  <select
                    value={formData.projet_id || ''}
                    onChange={(e) => setFormData({...formData, projet_id: e.target.value || null})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">Aucun projet associé</option>
                    {projets.map(projet => (
                      <option key={projet.id} value={projet.id}>{projet.nom_projet}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Tarif personnalisé (€/mois)
                </label>
                <input
                  type="number"
                  value={formData.tarif_mensuel}
                  onChange={(e) => setFormData({...formData, tarif_mensuel: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="100"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Date de début</label>
                <input
                  type="date"
                  value={formData.date_debut}
                  onChange={(e) => setFormData({...formData, date_debut: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Statut</label>
                <label className="flex items-center p-3 border border-gray-200/60 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.actif}
                    onChange={(e) => setFormData({...formData, actif: e.target.checked})}
                    className="mr-3 w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="text-sm text-gray-700">Abonnement actif</div>
                    <div className="text-xs text-gray-400">Décochez pour suspendre</div>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  rows="3"
                  placeholder="Remarques..."
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-gray-200/60">
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm font-medium transition-colors"
            >
              {abonnement ? 'Enregistrer' : 'Créer l\'abonnement'}
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
