import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useClientModal } from '../contexts/ClientModalContext'

export default function Financier() {
  const { openClientModal } = useClientModal()
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('projets')

  async function fetchProjets() {
    setLoading(true)
    const { data, error } = await supabase
      .from('projets')
      .select(`
        *,
        entreprises ( id, nom_entreprise )
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setProjets(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProjets()

    const handleDataUpdated = () => fetchProjets()
    window.addEventListener('kano:data-updated', handleDataUpdated)
    return () => window.removeEventListener('kano:data-updated', handleDataUpdated)
  }, [])

  // --- Calculs globaux ---

  const totalDevis = projets.reduce((s, p) => s + (parseFloat(p.montant_devis) || 0), 0)
  const totalPayé = projets.reduce((s, p) => s + (parseFloat(p.montant_paye) || 0), 0)
  const resteAEncaisser = totalDevis - totalPayé

  // --- Échéances à venir (soldes + lissages) ---

  function getÉchéances() {
    const échéances = []
    const aujourdhui = new Date()
    aujourdhui.setHours(0, 0, 0, 0)
    const dans6Mois = new Date()
    dans6Mois.setMonth(dans6Mois.getMonth() + 6)

    projets.forEach(p => {
      const client = p.entreprises?.nom_entreprise || '—'
      const clientId = p.entreprises?.id

      // Solde à payer (potentiellement en plusieurs fois)
      if (p.modalite_paiement === 'acompte_solde' && p.solde_montant) {
        const nbPaiements = p.solde_nb_paiements || 1
        const montantParPaiement = (parseFloat(p.solde_montant) || 0) / nbPaiements
        const dates = p.solde_dates || [p.date_solde]

        for (let i = 0; i < nbPaiements; i++) {
          const dateStr = dates[i]
          if (!dateStr) continue
          const dateEch = new Date(dateStr)
          if (dateEch >= aujourdhui && dateEch <= dans6Mois) {
            échéances.push({
              id: `solde-${p.id}-${i}`,
              type: nbPaiements === 1 ? 'Solde' : `Solde ${i + 1}/${nbPaiements}`,
              client,
              clientId,
              projet: p.nom_projet,
              montant: montantParPaiement,
              date: dateEch
            })
          }
        }
      }

      // Mensualités lissage (seulement futures, dans les 6 prochains mois)
      if (p.modalite_paiement === 'acompte_lissage' && p.date_acompte && p.lissage_mois && p.montant_lissage_mensuel) {
        const dateAcompte = new Date(p.date_acompte)
        const mensualite = parseFloat(p.montant_lissage_mensuel) || 0

        for (let i = 1; i <= p.lissage_mois; i++) {
          const dateEch = new Date(dateAcompte)
          dateEch.setMonth(dateEch.getMonth() + i)
          if (dateEch >= aujourdhui && dateEch <= dans6Mois) {
            échéances.push({
              id: `lissage-${p.id}-${i}`,
              type: `Lissage ${i}/${p.lissage_mois}`,
              client,
              clientId,
              projet: p.nom_projet,
              montant: mensualite,
              date: dateEch
            })
          }
        }
      }
    })

    return échéances.sort((a, b) => a.date - b.date)
  }

  const échéances = getÉchéances()

  // --- CA par mois (base: date_signature ou created_at) ---

  function getCaParMois() {
    const moisMap = {}

    projets.forEach(p => {
      const dateRef = p.date_signature || p.created_at
      if (!dateRef) return
      const moisKey = dateRef.slice(0, 7)
      if (!moisMap[moisKey]) {
        moisMap[moisKey] = { devis: 0, paye: 0 }
      }
      moisMap[moisKey].devis += parseFloat(p.montant_devis) || 0
      moisMap[moisKey].paye += parseFloat(p.montant_paye) || 0
    })

    return Object.entries(moisMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([mois, vals]) => ({
        mois,
        label: new Date(mois + '-01').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
        ...vals
      }))
  }

  const caParMois = getCaParMois()

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 sm:p-12 text-center">
        <div className="animate-pulse">
          <p className="text-gray-500">Chargement des données financières...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-semibold text-kano-blue">Vue financière</h1>
        <p className="text-sm text-gray-400 mt-1">Projets, échéances et chiffre d'affaires</p>
      </div>

      {/* Cartes résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
          <div className="text-xs text-gray-400 mb-2">Total devis</div>
          <div className="text-xl font-medium text-kano-blue">{totalDevis.toFixed(0)} €</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
          <div className="text-xs text-gray-400 mb-2">Total payé</div>
          <div className="text-xl font-medium text-kano-blue">{totalPayé.toFixed(0)} €</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
          <div className="text-xs text-gray-400 mb-2">Reste à encaisser</div>
          <div className="text-xl font-medium text-kano-blue">
            {resteAEncaisser.toFixed(0)} €
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-1 inline-flex gap-1">
        {[
          { id: 'projets', label: 'Projets' },
          { id: 'échéances', label: `Échéances (${échéances.length})` },
          { id: 'ca', label: 'CA par mois' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setOnglet(tab.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              onglet === tab.id
                ? 'bg-gray-100 text-gray-800'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Onglet Projets */}
      {onglet === 'projets' && (
        <div className="space-y-3">
          <div className="hidden md:grid grid-cols-[1fr_1fr_100px_100px_100px_120px] gap-3 bg-gray-50 rounded-lg px-4 py-2.5 text-[11px] text-gray-400 uppercase tracking-wider font-medium">
            <div>Client</div>
            <div>Projet</div>
            <div className="text-right">Devis</div>
            <div className="text-right">Payé</div>
            <div className="text-right">Reste</div>
            <div className="text-center">Modalité</div>
          </div>

          {projets.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-16 text-center text-gray-500">Aucun projet</div>
          ) : (
            projets.map(p => {
              const devis = parseFloat(p.montant_devis) || 0
              const paye = parseFloat(p.montant_paye) || 0
              const reste = devis - paye
              const modaliteLabel = p.modalite_paiement === 'total_direct' ? 'Direct'
                : p.modalite_paiement === 'acompte_solde' ? 'Acompte+Solde'
                : p.modalite_paiement === 'acompte_lissage' ? 'Lissage'
                : p.modalite_paiement || '—'

              return (
                <div key={p.id} className="bg-white rounded-lg border border-gray-200/60 shadow-sm p-4 hover-card">
                  {/* Mobile */}
                  <div className="md:hidden">
                    <div className="flex justify-between items-center">
                      <div onClick={() => p.entreprises?.id && openClientModal(p.entreprises.id)} className="font-medium text-kano-blue cursor-pointer hover:underline">{p.entreprises?.nom_entreprise || '—'}</div>
                      <span className="font-medium text-sm text-gray-700">{devis.toFixed(0)} €</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-gray-500">{p.nom_projet}</span>
                      <span className="text-xs text-gray-400">{modaliteLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>Payé <span className="text-gray-600 font-medium">{paye.toFixed(0)} €</span></span>
                      <span>Reste <span className="text-gray-600 font-medium">{reste.toFixed(0)} €</span></span>
                    </div>
                  </div>

                  {/* Desktop */}
                  <div className="hidden md:grid grid-cols-[1fr_1fr_100px_100px_100px_120px] gap-3 items-center">
                    <div onClick={() => p.entreprises?.id && openClientModal(p.entreprises.id)} className="font-medium text-kano-blue truncate cursor-pointer hover:underline">{p.entreprises?.nom_entreprise || '—'}</div>
                    <div className="text-sm text-gray-700 truncate">{p.nom_projet}</div>
                    <div className="text-right text-sm text-gray-700">{devis.toFixed(0)} €</div>
                    <div className="text-right text-sm text-gray-700">{paye.toFixed(0)} €</div>
                    <div className="text-right text-sm text-gray-700">
                      {reste.toFixed(0)} €
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-gray-400">{modaliteLabel}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Onglet Échéances */}
      {onglet === 'échéances' && (
        <div className="space-y-3">
          {échéances.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-16 text-center text-gray-500">Aucune échéance à venir</div>
          ) : (
            échéances.map(e => (
              <div key={e.id} className="bg-white rounded-lg border border-gray-200/60 shadow-sm p-4 hover-card">
                {/* Mobile */}
                <div className="md:hidden">
                  <div className="flex justify-between items-center">
                    <span onClick={() => e.clientId && openClientModal(e.clientId)} className="font-medium text-kano-blue cursor-pointer hover:underline">{e.client}</span>
                    <span className="font-medium text-gray-700">{e.montant.toFixed(0)} €</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>{e.projet}</span>
                    <span className="text-gray-300">·</span>
                    <span>{e.type}</span>
                    <span className="text-gray-300">·</span>
                    <span>{e.date.toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
                {/* Desktop */}
                <div className="hidden md:flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div>
                      <span onClick={() => e.clientId && openClientModal(e.clientId)} className="font-medium text-kano-blue cursor-pointer hover:underline">{e.client}</span>
                      <span className="text-gray-300 mx-2">—</span>
                      <span className="text-gray-600">{e.projet}</span>
                    </div>
                    <span className="text-xs text-gray-400">{e.type}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">
                      {e.date.toLocaleDateString('fr-FR')}
                    </span>
                    <span className="font-medium text-gray-700">{e.montant.toFixed(0)} €</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Onglet CA par mois */}
      {onglet === 'ca' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 sm:p-8">
          {caParMois.length === 0 ? (
            <p className="text-center text-gray-500 py-12">Pas encore de données</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_100px_100px] gap-3 bg-gray-50 rounded-lg px-4 py-2.5 text-[11px] text-gray-400 uppercase tracking-wider font-medium">
                <div>Mois</div>
                <div className="text-right">Devis signé</div>
                <div className="text-right">Encaissé</div>
              </div>
              {caParMois.map(m => (
                <div key={m.mois} className="grid grid-cols-[1fr_100px_100px] gap-3 px-4 py-3 items-center rounded-lg hover:bg-gray-50 transition-colors border-b border-gray-200/40">
                  <div className="text-sm font-medium text-gray-800 capitalize">{m.label}</div>
                  <div className="text-right text-sm text-gray-700">{m.devis.toFixed(0)} €</div>
                  <div className="text-right text-sm text-gray-700">{m.paye.toFixed(0)} €</div>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_100px_100px] gap-3 px-4 py-4 items-center border-t border-gray-200 mt-3">
                <div className="font-medium text-gray-700">Total</div>
                <div className="text-right font-medium text-gray-700">
                  {caParMois.reduce((s, m) => s + m.devis, 0).toFixed(0)} €
                </div>
                <div className="text-right font-medium text-gray-700">
                  {caParMois.reduce((s, m) => s + m.paye, 0).toFixed(0)} €
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
