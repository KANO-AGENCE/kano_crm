import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { FORMULES } from '../lib/constants'

export default function FormProjet({ projet, entrepriseId, onSave, onCancel }) {
  const isEditing = !!projet
  const [etape, setEtape] = useState(1)
  const [lastAcompteEdit, setLastAcompteEdit] = useState('pourcentage')
  const [errors, setErrors] = useState({})
  const [formData, setFormData] = useState({
    nom_projet: projet?.nom_projet || '',
    type_projet: projet?.type_projet || 'site_vitrine',
    type_projet_autre: projet?.type_projet_autre || '',
    montant_devis: projet?.montant_devis || '',
    numero_devis: projet?.numero_devis || '',
    date_signature: projet?.date_signature || '',
    statut: projet?.statut || 'en_attente',
    modalite_paiement: projet?.modalite_paiement || 'total_direct',
    acompte_pourcentage: projet?.acompte_pourcentage || 30,
    acompte_montant: projet?.acompte_montant || '',
    date_acompte: projet?.date_acompte || '',
    solde_montant: projet?.solde_montant || '',
    solde_nb_paiements: projet?.solde_nb_paiements || 1,
    solde_dates: projet?.solde_dates || [projet?.date_solde || ''],
    lissage_mois: projet?.lissage_mois || 12,
    montant_lissage_mensuel: projet?.montant_lissage_mensuel || '',
    avec_abonnement: projet?.avec_abonnement || false,
    formule_abonnement: projet?.formule_abonnement || 'essentiel',
    tarif_abonnement: projet?.tarif_abonnement || '',
    date_debut_abonnement: projet?.date_debut_abonnement || '',
    description: projet?.description || '',
    montant_facture: projet?.montant_facture || 0,
    montant_paye: projet?.montant_paye || 0
  })

  useEffect(() => {
    if (formData.modalite_paiement === 'acompte_solde' || formData.modalite_paiement === 'acompte_lissage') {
      const montantDevis = parseFloat(formData.montant_devis) || 0

      let acompte = 0
      if (lastAcompteEdit === 'pourcentage') {
        const pourcentage = parseFloat(formData.acompte_pourcentage) || 0
        acompte = (montantDevis * pourcentage / 100)
        const solde = montantDevis - acompte
        setFormData(prev => ({
          ...prev,
          acompte_montant: acompte.toFixed(2),
          solde_montant: solde.toFixed(2)
        }))
      } else {
        acompte = parseFloat(formData.acompte_montant) || 0
        const solde = montantDevis - acompte
        const pourcentage = montantDevis ? ((acompte / montantDevis) * 100) : 0
        setFormData(prev => ({
          ...prev,
          acompte_pourcentage: pourcentage ? parseFloat(pourcentage.toFixed(1)) : 0,
          solde_montant: solde.toFixed(2)
        }))
      }

      if (formData.modalite_paiement === 'acompte_lissage') {
        const solde = montantDevis - acompte
        const mensualite = (solde / (formData.lissage_mois || 1)).toFixed(2)
        setFormData(prev => ({
          ...prev,
          montant_lissage_mensuel: mensualite
        }))
      }
    }
  }, [formData.montant_devis, formData.acompte_pourcentage, formData.acompte_montant, formData.lissage_mois, formData.modalite_paiement, lastAcompteEdit])

  useEffect(() => {
    if (formData.avec_abonnement && formData.formule_abonnement) {
      const prixSuggere = FORMULES[formData.formule_abonnement]?.prix || ''
      if (!formData.tarif_abonnement) {
        setFormData(prev => ({ ...prev, tarif_abonnement: prixSuggere }))
      }
    }
  }, [formData.avec_abonnement, formData.formule_abonnement])

  function validateEtape(etapeNum) {
    const newErrors = {}
    
    if (etapeNum === 1) {
      if (!formData.nom_projet.trim()) newErrors.nom_projet = 'Le nom du projet est obligatoire'
      if (!formData.montant_devis) newErrors.montant_devis = 'Le montant du devis est obligatoire'
    }
    
    if (etapeNum === 2) {
      if (formData.modalite_paiement === 'acompte_solde' || formData.modalite_paiement === 'acompte_lissage') {
        if (!formData.date_acompte) newErrors.date_acompte = 'La date d\'encaissement de l\'acompte est obligatoire'
      }
      if (formData.modalite_paiement === 'acompte_solde' && !formData.solde_dates?.[0]) {
        newErrors.date_solde = 'La date du premier paiement du solde est obligatoire'
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleNextEtape() {
    if (validateEtape(etape)) {
      setEtape(etape + 1)
    }
  }

  function handleSubmit() {
    if (!formData.nom_projet.trim()) {
      alert('Le nom du projet est obligatoire')
      return
    }
    if (!formData.montant_devis) {
      alert('Le montant du devis est obligatoire')
      return
    }

    const cleanData = {
      nom_projet: formData.nom_projet,
      type_projet: formData.type_projet || null,
      type_projet_autre: formData.type_projet === 'autre' ? formData.type_projet_autre : null,
      montant_devis: parseFloat(formData.montant_devis) || 0,
      numero_devis: formData.numero_devis || null,
      date_signature: formData.date_signature || null,
      statut: formData.statut,
      modalite_paiement: formData.modalite_paiement,
      acompte_pourcentage: formData.acompte_pourcentage ? parseFloat(formData.acompte_pourcentage) : null,
      acompte_montant: formData.acompte_montant ? parseFloat(formData.acompte_montant) : null,
      date_acompte: formData.date_acompte || null,
      solde_montant: formData.solde_montant ? parseFloat(formData.solde_montant) : null,
      solde_nb_paiements: formData.modalite_paiement === 'acompte_solde' ? parseInt(formData.solde_nb_paiements) || 1 : null,
      solde_dates: formData.modalite_paiement === 'acompte_solde' ? formData.solde_dates.map(d => d || null) : null,
      date_solde: formData.solde_dates?.[0] || null,
      lissage_mois: formData.lissage_mois ? parseInt(formData.lissage_mois) : null,
      montant_lissage_mensuel: formData.montant_lissage_mensuel ? parseFloat(formData.montant_lissage_mensuel) : null,
      avec_abonnement: formData.avec_abonnement,
      formule_abonnement: formData.avec_abonnement ? formData.formule_abonnement : null,
      tarif_abonnement: formData.avec_abonnement && formData.tarif_abonnement ? parseFloat(formData.tarif_abonnement) : null,
      date_debut_abonnement: formData.avec_abonnement && formData.date_debut_abonnement ? formData.date_debut_abonnement : null,
      description: formData.description || null,
      montant_facture: parseFloat(formData.montant_facture) || 0,
      montant_paye: parseFloat(formData.montant_paye) || 0,
      entreprise_id: entrepriseId,
      id: projet?.id
    }

    onSave(cleanData)
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
        <div className="sticky top-0 bg-white border-b border-gray-200/60 p-5 flex justify-between items-center z-10">
          <h2 className="text-lg font-medium text-gray-800">
            {projet ? 'Modifier le projet' : 'Nouveau projet'}
          </h2>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!isEditing && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setEtape(1)}
                className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
                  etape === 1 ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-500'
                }`}
              >
                1. Infos générales
              </button>
              <button
                onClick={() => setEtape(2)}
                className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
                  etape === 2 ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-500'
                }`}
              >
                2. Paiement
              </button>
              <button
                onClick={() => setEtape(3)}
                className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
                  etape === 3 ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-500'
                }`}
              >
                3. Abonnement
              </button>
            </div>
          )}

          {(isEditing || etape === 1) && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nom du projet *</label>
                <input
                  type="text"
                  value={formData.nom_projet}
                  onChange={(e) => setFormData({...formData, nom_projet: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                  placeholder="Ex: Site web entreprise.fr"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Type de projet</label>
                  <select
                    value={formData.type_projet}
                    onChange={(e) => setFormData({...formData, type_projet: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                  >
                    <option value="site_vitrine">Site vitrine</option>
                    <option value="ecommerce">E-commerce</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>

                {formData.type_projet === 'autre' && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Préciser</label>
                    <input
                      type="text"
                      value={formData.type_projet_autre}
                      onChange={(e) => setFormData({...formData, type_projet_autre: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                      placeholder="Type de projet"
                    />
                  </div>
                )}

              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Montant du devis *</label>
                  <input
                    type="number"
                    value={formData.montant_devis}
                    onChange={(e) => setFormData({...formData, montant_devis: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                    placeholder="2500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Numéro de devis</label>
                  <input
                    type="text"
                    value={formData.numero_devis}
                    onChange={(e) => setFormData({...formData, numero_devis: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                    placeholder="202601-15"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date signature</label>
                  <input
                    type="date"
                    value={formData.date_signature}
                    onChange={(e) => setFormData({...formData, date_signature: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                  rows="3"
                  placeholder="Notes sur le projet..."
                />
              </div>
            </div>
          )}

          {(isEditing || etape === 2) && (
            <div className="space-y-4">
              {isEditing && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Modalité de paiement</h3>
                </div>
              )}
              <div>
                {!isEditing && <label className="block text-xs text-gray-400 mb-2">Modalité de paiement</label>}
                <div className="space-y-2">
                  <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="modalite"
                      value="total_direct"
                      checked={formData.modalite_paiement === 'total_direct'}
                      onChange={(e) => setFormData({...formData, modalite_paiement: e.target.value})}
                      className="mr-3"
                    />
                    <span className="font-medium">Total direct (paiement en 1 fois)</span>
                  </label>

                  <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="modalite"
                      value="acompte_solde"
                      checked={formData.modalite_paiement === 'acompte_solde'}
                      onChange={(e) => setFormData({...formData, modalite_paiement: e.target.value})}
                      className="mr-3"
                    />
                    <span className="font-medium">Acompte + Solde</span>
                  </label>

                  <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="modalite"
                      value="acompte_lissage"
                      checked={formData.modalite_paiement === 'acompte_lissage'}
                      onChange={(e) => setFormData({...formData, modalite_paiement: e.target.value})}
                      className="mr-3"
                    />
                    <span className="font-medium">Acompte + Lissage sur X mois</span>
                  </label>
                </div>
              </div>

              {formData.modalite_paiement === 'total_direct' && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <label className="block text-xs text-gray-400 mb-1">Date de paiement</label>
                  <input
                    type="date"
                    value={formData.date_acompte}
                    onChange={(e) => setFormData({...formData, date_acompte: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              )}

              {formData.modalite_paiement === 'acompte_solde' && (
                <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Acompte (%)</label>
                      <input
                        type="number"
                        value={formData.acompte_pourcentage}
                        onFocus={() => setLastAcompteEdit('pourcentage')}
                        onChange={(e) => { setLastAcompteEdit('pourcentage'); setFormData({...formData, acompte_pourcentage: e.target.value}) }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                        placeholder="30"
                        min="0"
                        max="100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Montant acompte (€)</label>
                      <input
                        type="number"
                        value={formData.acompte_montant}
                        onFocus={() => setLastAcompteEdit('montant')}
                        onChange={(e) => { setLastAcompteEdit('montant'); setFormData({...formData, acompte_montant: e.target.value}) }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                        placeholder="750"
                        min="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Date encaissement acompte</label>
                    <input
                      type="date"
                      value={formData.date_acompte}
                      onChange={(e) => setFormData({...formData, date_acompte: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Montant solde</label>
                      <input
                        type="number"
                        value={formData.solde_montant}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Solde payé en</label>
                      <select
                        value={formData.solde_nb_paiements}
                        onChange={(e) => {
                          const nb = parseInt(e.target.value)
                          const dates = [...(formData.solde_dates || [''])]
                          while (dates.length < nb) dates.push('')
                          setFormData({...formData, solde_nb_paiements: nb, solde_dates: dates.slice(0, nb)})
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                      >
                        {[1, 2, 3, 4, 5].map(n => (
                          <option key={n} value={n}>{n === 1 ? '1 fois' : `${n} fois`}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formData.solde_nb_paiements > 1 && formData.solde_montant && (
                    <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200 mb-1">
                      {formData.solde_nb_paiements} paiements de {(parseFloat(formData.solde_montant) / formData.solde_nb_paiements).toFixed(0)} €
                    </div>
                  )}

                  <div className={`grid gap-3 ${
                    { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' }[Math.min(formData.solde_nb_paiements, 3)] || 'grid-cols-3'
                  }`}>
                    {Array.from({ length: formData.solde_nb_paiements }, (_, i) => (
                      <div key={i}>
                        <label className="block text-xs text-gray-400 mb-1">
                          {formData.solde_nb_paiements === 1 ? 'Date échéance solde' : `Date paiement ${i + 1}`}
                        </label>
                        <input
                          type="date"
                          value={formData.solde_dates?.[i] || ''}
                          onChange={(e) => {
                            const newDates = [...(formData.solde_dates || [])]
                            newDates[i] = e.target.value
                            setFormData({...formData, solde_dates: newDates})
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formData.modalite_paiement === 'acompte_lissage' && (
                <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Acompte (%)</label>
                      <input
                        type="number"
                        value={formData.acompte_pourcentage}
                        onFocus={() => setLastAcompteEdit('pourcentage')}
                        onChange={(e) => { setLastAcompteEdit('pourcentage'); setFormData({...formData, acompte_pourcentage: e.target.value}) }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                        placeholder="30"
                        min="0"
                        max="100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Montant acompte (€)</label>
                      <input
                        type="number"
                        value={formData.acompte_montant}
                        onFocus={() => setLastAcompteEdit('montant')}
                        onChange={(e) => { setLastAcompteEdit('montant'); setFormData({...formData, acompte_montant: e.target.value}) }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                        placeholder="750"
                        min="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Date encaissement acompte</label>
                    <input
                      type="date"
                      value={formData.date_acompte}
                      onChange={(e) => setFormData({...formData, date_acompte: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Solde à lisser</label>
                      <input
                        type="number"
                        value={formData.solde_montant}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Nombre de mois</label>
                      <input
                        type="number"
                        value={formData.lissage_mois}
                        onChange={(e) => setFormData({...formData, lissage_mois: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300"
                        placeholder="12"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Mensualité</label>
                      <input
                        type="number"
                        value={formData.montant_lissage_mensuel}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700 font-medium"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
                    💡 Les mensualités démarrent le mois suivant l'encaissement de l'acompte
                  </div>
                </div>
              )}
            </div>
          )}

          {!isEditing && etape === 3 && (
            <div className="space-y-4">
              <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={formData.avec_abonnement}
                  onChange={(e) => setFormData({...formData, avec_abonnement: e.target.checked})}
                  className="mr-3 w-5 h-5"
                />
                <span className="font-medium text-lg">Inclure un abonnement</span>
              </label>

              {formData.avec_abonnement && (
                <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Formule</label>
                    <select
                      value={formData.formule_abonnement}
                      onChange={(e) => {
                        const formule = e.target.value
                        const prixSuggere = FORMULES[formule]?.prix || ''
                        setFormData({
                          ...formData, 
                          formule_abonnement: formule,
                          tarif_abonnement: prixSuggere
                        })
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    >
                      {Object.entries(FORMULES).map(([key, val]) => (
                        <option key={key} value={key}>{val.label} ({val.prix}€/mois)</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Tarif personnalisé (€/mois)</label>
                      <input
                        type="number"
                        value={formData.tarif_abonnement}
                        onChange={(e) => setFormData({...formData, tarif_abonnement: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                        placeholder="100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Date de début</label>
                      <input
                        type="date"
                        value={formData.date_debut_abonnement}
                        onChange={(e) => setFormData({...formData, date_debut_abonnement: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    💡 Par défaut, l'abonnement démarre le mois suivant l'encaissement de l'acompte
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            {isEditing ? (
              <>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-medium"
                >
                  Enregistrer les modifications
                </button>
                <button
                  onClick={onCancel}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                {etape > 1 && (
                  <button
                    onClick={() => setEtape(etape - 1)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                  >
                    Précédent
                  </button>
                )}

                {etape < 3 ? (
                  <button
                    onClick={handleNextEtape}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-medium"
                  >
                    Suivant
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-medium"
                  >
                    Créer le projet
                  </button>
                )}

                <button
                  onClick={onCancel}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}