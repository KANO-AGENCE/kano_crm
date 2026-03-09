import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Mail, LayoutGrid, List, CheckSquare, Plus, X } from 'lucide-react'
import ModaleClient from '../components/ModaleClient'
import {
  PHASE_LABELS, PHASE_COLORS, FORMULE_LABELS, FORMULE_COLORS,
  PHASE_PRODUCTION_LABELS,
  STATUT_ORDER, PHASE_ORDER_CLIENT, PHASE_ORDER_PROSPECT, PHASE_ORDER_SUSPECT,
  PRIORITE_POIDS
} from '../lib/constants'
import { useNotification } from '../contexts/NotificationContext'

export default function Clients() {
  const { notify } = useNotification()
  const [entreprises, setEntreprises] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('liste')
  const [selectedEntreprise, setSelectedEntreprise] = useState(null)
  const [entrepriseDetails, setEntrepriseDetails] = useState(null)
  const [filtre, setFiltre] = useState('tous')
  const [tri, setTri] = useState('urgentes_desc')
  const [defaultOnglet, setDefaultOnglet] = useState(null)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientData, setNewClientData] = useState({ nom_entreprise: '', statut_commercial: 'suspect', secteur_activite: '', contact_prenom: '', contact_nom: '', contact_email: '', contact_tel: '' })

  const fetchEntreprises = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('entreprises')
      .select(`
        *,
        contacts (*),
        abonnements (*),
        projets (
          *,
          taches (*)
        ),
        taches (*)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erreur:', error)
    } else {
      setEntreprises(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEntreprises()
  }, [fetchEntreprises])

  useEffect(() => {
    window.addEventListener('kano:data-updated', fetchEntreprises)
    return () => window.removeEventListener('kano:data-updated', fetchEntreprises)
  }, [fetchEntreprises])

  async function handleCreateClient() {
    if (!newClientData.nom_entreprise.trim()) return
    const { data: newEntreprise, error } = await supabase
      .from('entreprises')
      .insert({
        nom_entreprise: newClientData.nom_entreprise.trim(),
        statut_commercial: newClientData.statut_commercial,
        secteur_activite: newClientData.secteur_activite || null,
        phase_vie: 'v0'
      })
      .select()
      .single()

    if (!error && newEntreprise) {
      // Créer le contact si renseigné
      if (newClientData.contact_prenom.trim() || newClientData.contact_nom.trim()) {
        await supabase.from('contacts').insert({
          entreprise_id: newEntreprise.id,
          prenom: newClientData.contact_prenom.trim(),
          nom: newClientData.contact_nom.trim(),
          email: newClientData.contact_email || null,
          tel: newClientData.contact_tel || null,
          contact_principal: true
        })
      }
      fetchEntreprises()
      setShowNewClient(false)
      setNewClientData({ nom_entreprise: '', statut_commercial: 'suspect', secteur_activite: '', contact_prenom: '', contact_nom: '', contact_email: '', contact_tel: '' })
      notify(`${newEntreprise.nom_entreprise} ajouté`)
    }
  }

  const aujourdhuiLocal = new Date()
  aujourdhuiLocal.setHours(0, 0, 0, 0)

  const PRIO_RANK = { basse: 0, moyenne: 1, haute: 2, urgente: 3 }
  const PRIO_FROM_RANK = ['basse', 'moyenne', 'haute', 'urgente']

  function getJoursRetard(tache) {
    if (!tache.date_limite || tache.statut === 'termine') return 0
    const dateLimite = new Date(tache.date_limite + 'T00:00:00')
    const diff = Math.floor((aujourdhuiLocal - dateLimite) / 86400000)
    return Math.max(0, diff)
  }

  function getPrioriteEffective(tache) {
    const retard = getJoursRetard(tache)
    const baseRank = PRIO_RANK[tache.priorite] ?? 1
    let effectiveRank = baseRank
    if (retard >= 3) effectiveRank = Math.max(effectiveRank, 3)
    else if (retard >= 1) effectiveRank = Math.max(effectiveRank, 2)
    return PRIO_FROM_RANK[effectiveRank]
  }

  function getTachesAFaire(entreprise) {
    const tachesProjet = entreprise.projets?.flatMap(p => p.taches || []) || []
    const tachesEntreprise = entreprise.taches || []
    const tachesMap = new Map()
    ;[...tachesProjet, ...tachesEntreprise].forEach(t => tachesMap.set(t.id, t))
    return [...tachesMap.values()].filter(t => t.statut !== 'termine')
  }

  async function fetchEntrepriseDetails(id) {
    const { data, error } = await supabase
      .from('entreprises')
      .select(`
        *,
        contacts (*),
        abonnements (*),
        projets (
          *,
          taches (*)
        ),
        taches (*)
      `)
      .eq('id', id)
      .single()

    if (!error && data) {
      setEntrepriseDetails(data)
    }
  }

  const filteredEntreprises = entreprises.filter(entreprise => {
    const searchLower = searchTerm.toLowerCase()
    const contactPrincipal = entreprise.contacts?.find(c => c.contact_principal)

    const matchSearch = (
      entreprise.nom_entreprise?.toLowerCase().includes(searchLower) ||
      entreprise.siret?.includes(searchLower) ||
      entreprise.secteur_activite?.toLowerCase().includes(searchLower) ||
      contactPrincipal?.nom?.toLowerCase().includes(searchLower) ||
      contactPrincipal?.email?.toLowerCase().includes(searchLower)
    )

    if (!matchSearch) return false

    const tachesAFaire = getTachesAFaire(entreprise)
    const tachesUrgentes = tachesAFaire.filter(t => getPrioriteEffective(t) === 'urgente')

    switch(filtre) {
      case 'urgentes':
        return tachesUrgentes.length > 0
      case 'toutes_taches':
        return tachesAFaire.length > 0
      case 'tous':
        return true
      case 'client':
      case 'prospect':
      case 'suspect':
      case 'dead':
        return entreprise.statut_commercial === filtre
      default:
        return true
    }
  })

  const sortedEntreprises = [...filteredEntreprises].sort((a, b) => {
    const tachesA = getTachesAFaire(a)
    const tachesB = getTachesAFaire(b)
    const scoreA = tachesA.reduce((s, t) => s + (PRIORITE_POIDS[getPrioriteEffective(t)] || 0), 0)
    const scoreB = tachesB.reduce((s, t) => s + (PRIORITE_POIDS[getPrioriteEffective(t)] || 0), 0)

    switch(tri) {
      case 'urgentes_desc':
        return scoreB - scoreA
      case 'taches_desc':
        return tachesB.length - tachesA.length
      case 'ca_desc':
        return (b.ca_total_genere || 0) - (a.ca_total_genere || 0)
      case 'nom_asc':
        return a.nom_entreprise?.localeCompare(b.nom_entreprise || '') || 0
      case 'date_desc':
        return new Date(b.created_at) - new Date(a.created_at)
      default:
        return 0
    }
  })

  const groupedEntreprises = sortedEntreprises.reduce((acc, entreprise) => {
    const statut = entreprise.statut_commercial
    if (!acc[statut]) acc[statut] = []
    acc[statut].push(entreprise)
    return acc
  }, {})

  const PROD_ORDER = { v0_prod: 0, en_cours_prod: 1, en_ligne: 2 }
  Object.keys(groupedEntreprises).forEach(statut => {
    groupedEntreprises[statut].sort((a, b) => {
      const orderA = PROD_ORDER[a.phase_production] ?? 0
      const orderB = PROD_ORDER[b.phase_production] ?? 0
      return orderA - orderB
    })
  })

  const sortedStatuts = Object.keys(groupedEntreprises).sort((a, b) => STATUT_ORDER[a] - STATUT_ORDER[b])

  function openModal(entreprise, onglet = null) {
    setDefaultOnglet(onglet)
    setSelectedEntreprise(entreprise)
    fetchEntrepriseDetails(entreprise.id)
  }

  function closeModal() {
    setSelectedEntreprise(null)
    setEntrepriseDetails(null)
    setDefaultOnglet(null)
  }

  const entreprisesByStatus = {
    client: filteredEntreprises.filter(e => e.statut_commercial === 'client'),
    prospect: filteredEntreprises.filter(e => e.statut_commercial === 'prospect'),
    suspect: filteredEntreprises.filter(e => e.statut_commercial === 'suspect'),
    dead: filteredEntreprises.filter(e => e.statut_commercial === 'dead')
  }

  const renderEntrepriseCard = (entreprise) => {
    const contactPrincipal = entreprise.contacts?.find(c => c.contact_principal)
    const abonnementsActifs = entreprise.abonnements?.filter(a => a.actif) || []

    return (
      <div key={entreprise.id} className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden hover-card cursor-pointer" onClick={() => openModal(entreprise)}>
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <h3 className="font-medium text-kano-blue text-sm hover:underline">
                {entreprise.nom_entreprise}
              </h3>
              {entreprise.secteur_activite && (
                <p className="text-xs text-gray-500 mt-1">{entreprise.secteur_activite}</p>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {PHASE_PRODUCTION_LABELS[entreprise.phase_production] || 'V0'}
            </span>
          </div>

          {contactPrincipal && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mb-2">
              <Mail size={12} />
              {contactPrincipal.prenom} {contactPrincipal.nom}
            </p>
          )}

          {abonnementsActifs.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {abonnementsActifs.map(abo => (
                <span key={abo.id} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                  {FORMULE_LABELS[abo.formule]}
                </span>
              ))}
            </div>
          )}

          <div className="text-sm font-medium text-gray-700">
            {entreprise.statut_commercial === 'client' ? (
              `CA total: ${entreprise.ca_total_genere?.toFixed(0) || 0}€`
            ) : (
              entreprise.potentiel_estime ? `~${entreprise.potentiel_estime}€` : 'Non estimé'
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderEntrepriseLigne = (entreprise) => {
    const contactPrincipal = entreprise.contacts?.find(c => c.contact_principal)
    const abonnementsActifs = entreprise.abonnements?.filter(a => a.actif) || []

    const tachesAFaire = getTachesAFaire(entreprise)

    const tachesParPriorite = {
      urgente: tachesAFaire.filter(t => getPrioriteEffective(t) === 'urgente'),
      haute: tachesAFaire.filter(t => getPrioriteEffective(t) === 'haute'),
      moyenne: tachesAFaire.filter(t => getPrioriteEffective(t) === 'moyenne'),
      basse: tachesAFaire.filter(t => getPrioriteEffective(t) === 'basse')
    }

    return (
      <div key={entreprise.id}>
        <div
          className="bg-white rounded-lg border border-gray-200/60 shadow-sm p-4 hover-card cursor-pointer"
          onClick={() => openModal(entreprise)}
        >
          <div className="md:grid md:grid-cols-[minmax(200px,1fr)_minmax(180px,0.8fr)_minmax(120px,0.6fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)] md:gap-4 md:items-center">

            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-kano-blue hover:underline truncate">
                  {entreprise.nom_entreprise}
                </span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider flex-shrink-0">
                  {entreprise.statut_commercial === 'client' ? 'CLIENT' :
                   entreprise.statut_commercial === 'prospect' ? 'PROSPECT' :
                   entreprise.statut_commercial === 'suspect' ? 'SUSPECT' : 'DEAD'}
                </span>
              </div>
              <div className="md:hidden flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-gray-400">
                <span>{PHASE_PRODUCTION_LABELS[entreprise.phase_production] || 'V0'}</span>
                {contactPrincipal && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} />
                    {contactPrincipal.prenom} {contactPrincipal.nom}
                  </span>
                )}
                {abonnementsActifs.map(abo => (
                  <span key={abo.id} className="text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                    {FORMULE_LABELS[abo.formule]} <span className="font-medium">{abo.tarif_mensuel}€</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="hidden md:flex gap-1 flex-wrap">
              {abonnementsActifs.length > 0 ? (
                abonnementsActifs.map(abo => (
                  <span key={abo.id} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                    {FORMULE_LABELS[abo.formule]}
                    <span className="font-medium ml-1">{abo.tarif_mensuel}€</span>
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-400">-</span>
              )}
            </div>

            <div className="hidden md:block">
              <span className="text-xs text-gray-400">
                {PHASE_PRODUCTION_LABELS[entreprise.phase_production] || 'V0'}
              </span>
            </div>

            <div className="hidden md:block text-sm text-gray-600 truncate">
              {contactPrincipal ? (
                `${contactPrincipal.prenom || ''} ${contactPrincipal.nom || ''}`.trim()
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>

            <div className="mt-2 md:mt-0 md:flex md:gap-2 md:items-center md:flex-wrap">
              {tachesAFaire.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: 'urgente', label: 'urgente', labelPlural: 'urgentes', dot: 'bg-red-500' },
                    { key: 'haute', label: 'haute', labelPlural: 'hautes', dot: 'bg-orange-500' },
                    { key: 'moyenne', label: 'moyenne', labelPlural: 'moyennes', dot: 'bg-yellow-500' },
                    { key: 'basse', label: 'basse', labelPlural: 'basses', dot: 'bg-gray-400' }
                  ].map(({ key, label, labelPlural, dot }) => {
                    const liste = tachesParPriorite[key]
                    if (liste.length === 0) return null
                    const enRetard = liste.filter(t => getJoursRetard(t) > 0)
                    const maxRetard = enRetard.length > 0 ? Math.max(...enRetard.map(t => getJoursRetard(t))) : 0
                    return (
                      <button
                        key={key}
                        onClick={(e) => { e.stopPropagation(); openModal(entreprise, 'taches') }}
                        className="group relative inline-flex items-center gap-1 text-xs text-gray-500 cursor-pointer"
                      >
                        <span className={`w-2 h-2 rounded-full ${dot}`}></span>
                        <span>{liste.length} {liste.length > 1 ? labelPlural : label}</span>
                        {enRetard.length > 0 && (
                          <span className="text-red-500 font-medium">
                            dont {enRetard.length} en retard ({maxRetard}j)
                          </span>
                        )}

                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 z-50">
                          <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap max-w-[260px]">
                            {liste.slice(0, 5).map(t => (
                              <div key={t.id} className="truncate py-0.5">{t.titre}</div>
                            ))}
                            {liste.length > 5 && (
                              <div className="text-gray-400 pt-0.5">+{liste.length - 5} autre{liste.length - 5 > 1 ? 's' : ''}</div>
                            )}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-800"></div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span className="text-sm text-gray-400">Aucune tâche</span>
              )}
            </div>

          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-kano-blue">Base clients</h1>
        <button
          onClick={() => setShowNewClient(!showNewClient)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-kano-blue text-white rounded-lg hover:bg-kano-blue/90 text-sm font-medium"
        >
          {showNewClient ? <X size={16} /> : <Plus size={16} />}
          {showNewClient ? 'Fermer' : 'Nouveau client'}
        </button>
      </div>

      {showNewClient && (
        <div className="bg-white rounded-xl border border-kano-blue/20 p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Nom de l'entreprise *</label>
              <input type="text" value={newClientData.nom_entreprise} onChange={e => setNewClientData({...newClientData, nom_entreprise: e.target.value})} placeholder="Ex: KANO Agency" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Statut</label>
              <select value={newClientData.statut_commercial} onChange={e => setNewClientData({...newClientData, statut_commercial: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20">
                <option value="suspect">Suspect</option>
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Secteur d'activité</label>
              <input type="text" value={newClientData.secteur_activite} onChange={e => setNewClientData({...newClientData, secteur_activite: e.target.value})} placeholder="Ex: Bâtiment" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 mb-3">Contact principal (optionnel)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <input type="text" value={newClientData.contact_prenom} onChange={e => setNewClientData({...newClientData, contact_prenom: e.target.value})} placeholder="Prénom" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20" />
              </div>
              <div>
                <input type="text" value={newClientData.contact_nom} onChange={e => setNewClientData({...newClientData, contact_nom: e.target.value})} placeholder="Nom" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20" />
              </div>
              <div>
                <input type="email" value={newClientData.contact_email} onChange={e => setNewClientData({...newClientData, contact_email: e.target.value})} placeholder="Email" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20" />
              </div>
              <div>
                <input type="text" value={newClientData.contact_tel} onChange={e => setNewClientData({...newClientData, contact_tel: e.target.value})} placeholder="Téléphone" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowNewClient(false); setNewClientData({ nom_entreprise: '', statut_commercial: 'suspect', secteur_activite: '', contact_prenom: '', contact_nom: '', contact_email: '', contact_tel: '' }) }} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button onClick={handleCreateClient} disabled={!newClientData.nom_entreprise.trim()} className="px-4 py-1.5 bg-kano-blue text-white rounded-lg text-sm font-medium hover:bg-kano-blue/90 disabled:opacity-40">Créer</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 space-y-5">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1.5 block">Filtre</label>
            <select
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
            >
              <option value="tous">Tous (par défaut)</option>
              <option value="urgentes">Seulement avec tâches urgentes</option>
              <option value="toutes_taches">Seulement avec des tâches</option>
              <option value="client">Clients uniquement</option>
              <option value="prospect">Prospects uniquement</option>
              <option value="suspect">Suspects uniquement</option>
              <option value="dead">Dead uniquement</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1.5 block">Trier par</label>
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
            >
              <option value="urgentes_desc">Nb tâches urgentes (décroissant)</option>
              <option value="taches_desc">Nb tâches total (décroissant)</option>
              <option value="ca_desc">CA généré (décroissant)</option>
              <option value="nom_asc">Nom (A-Z)</option>
              <option value="date_desc">Date création (récent)</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par nom, SIRET, contact..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedEntreprises.length > 0 ? (
            <>
              <div className="hidden md:block bg-gray-50 rounded-lg px-4 py-2.5 mb-3">
                <div className="grid grid-cols-[minmax(200px,1fr)_minmax(180px,0.8fr)_minmax(120px,0.6fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)] gap-3 md:gap-4 items-center text-[11px] text-gray-400 uppercase tracking-wider font-medium">
                  <div>Nom du client</div>
                  <div>Abonnement</div>
                  <div>Production</div>
                  <div>Contact principal</div>
                  <div>Tâches à faire</div>
                </div>
              </div>
              {sortedEntreprises.map(renderEntrepriseLigne)}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
              <p className="text-gray-500">Aucun résultat</p>
            </div>
          )}
        </div>
      )}

    </div>

    {selectedEntreprise && (
      <ModaleClient
        entreprise={selectedEntreprise}
        onClose={closeModal}
        onUpdate={fetchEntreprises}
        defaultOnglet={defaultOnglet}
      />
    )}
    </>
  )
}