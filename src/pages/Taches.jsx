import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { PRIORITE_LABELS, PRIORITE_COLORS, scoreTache } from '../lib/constants'
import { useUsers } from '../contexts/UsersContext'
import { Check, Clock, Plus, X, AlertTriangle } from 'lucide-react'
import { useClientModal } from '../contexts/ClientModalContext'
import UndoToast from '../components/UndoToast'
import { useNotification } from '../contexts/NotificationContext'

export default function Taches() {
  const { userName } = useAuth()
  const { openClientModal } = useClientModal()
  const { notify } = useNotification()
  const { utilisateurs: UTILISATEURS } = useUsers()
  const [taches, setTaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtreAssigne, setFiltreAssigne] = useState('tous')
  const [filtrePriorite, setFiltrePriorite] = useState('tous')
  const [filtreStatut, setFiltreStatut] = useState('a_faire')
  const [tri, setTri] = useState('pertinence')
  const [animatingId, setAnimatingId] = useState(null)
  const [animationType, setAnimationType] = useState(null) // 'complete' | 'reopen'
  const rowRefs = useRef({})
  const [undoToast, setUndoToast] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [entreprises, setEntreprises] = useState([])
  const [projetsClient, setProjetsClient] = useState([])
  const [formData, setFormData] = useState({
    titre: '', description: '', priorite: 'moyenne', assigne_a: '', entreprise_id: '', projet_id: '', date_limite: ''
  })
  const [seenTaches, setSeenTaches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kano_seen_taches') || '[]') } catch { return [] }
  })

  function markAsSeen(id) {
    setSeenTaches(prev => {
      const updated = [...new Set([...prev, id])]
      localStorage.setItem('kano_seen_taches', JSON.stringify(updated))
      return updated
    })
  }

  function isNouvelle(tache) {
    if (seenTaches.includes(tache.id)) return false
    if (!tache.created_at) return false
    const heures = (Date.now() - new Date(tache.created_at).getTime()) / 3600000
    return heures < 48
  }

  async function fetchTaches() {
    setLoading(true)
    const { data, error } = await supabase
      .from('taches')
      .select(`
        *,
        entreprises ( id, nom_entreprise ),
        projets ( id, nom_projet )
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTaches(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTaches()
    fetchEntreprises()
    const onUpdate = () => fetchTaches()
    window.addEventListener('kano:data-updated', onUpdate)
    return () => window.removeEventListener('kano:data-updated', onUpdate)
  }, [])

  async function fetchEntreprises() {
    const { data } = await supabase
      .from('entreprises')
      .select('id, nom_entreprise')
      .order('nom_entreprise')
    if (data) setEntreprises(data)
  }

  async function fetchProjetsClient(entrepriseId) {
    if (!entrepriseId) { setProjetsClient([]); return }
    const { data } = await supabase
      .from('projets')
      .select('id, nom_projet')
      .eq('entreprise_id', entrepriseId)
      .order('nom_projet')
    setProjetsClient(data || [])
  }

  async function handleCreateTache() {
    if (!formData.titre.trim() || !formData.entreprise_id) return

    const insertData = {
      titre: formData.titre.trim(),
      description: formData.description || null,
      priorite: formData.priorite || 'moyenne',
      assigne_a: formData.assigne_a || null,
      date_limite: formData.date_limite || null,
      entreprise_id: formData.entreprise_id,
      projet_id: formData.projet_id || null,
      statut: 'a_faire'
    }

    const { error } = await supabase.from('taches').insert(insertData)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: formData.entreprise_id,
        projet_id: formData.projet_id || null,
        type_action: 'creation',
        entite: 'tache',
        description: `Nouvelle tâche : "${insertData.titre}"`,
        utilisateur: userName
      })
      fetchTaches()
      setFormData({ titre: '', description: '', priorite: 'moyenne', assigne_a: '', entreprise_id: '', projet_id: '', date_limite: '' })
      setProjetsClient([])
      setShowForm(false)
      const clientNom = entreprises.find(e => e.id === formData.entreprise_id)?.nom_entreprise
      notify(`Tâche "${insertData.titre}" créée — ${clientNom}`)
    }
  }

  const handleToggle = useCallback(async (tache) => {
    if (animatingId) return
    const newStatut = tache.statut === 'termine' ? 'a_faire' : 'termine'
    const type = newStatut === 'termine' ? 'complete' : 'reopen'
    const ancienStatut = tache.statut

    setAnimatingId(tache.id)
    setAnimationType(type)

    const { error } = await supabase
      .from('taches')
      .update({
        statut: newStatut,
        ...(newStatut === 'termine' ? { date_completion: new Date().toISOString(), termine_par: userName } : { date_completion: null, termine_par: null })
      })
      .eq('id', tache.id)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: tache.entreprise_id,
        projet_id: tache.projet_id,
        tache_id: tache.id,
        type_action: newStatut === 'termine' ? 'completion' : 'modification',
        entite: 'tache',
        description: newStatut === 'termine'
          ? `Tâche "${tache.titre}" marquée comme terminée`
          : `Tâche "${tache.titre}" réouverte`,
        utilisateur: userName
      })

      // Animation puis mise à jour locale (sans refetch)
      setTimeout(() => {
        const row = rowRefs.current[tache.id]
        if (row && type === 'complete') {
          row.style.maxHeight = row.scrollHeight + 'px'
          row.style.transition = 'max-height 0.4s ease, opacity 0.4s ease, margin 0.4s ease, padding 0.4s ease'
          requestAnimationFrame(() => {
            row.style.maxHeight = '0px'
            row.style.opacity = '0'
            row.style.marginTop = '0px'
            row.style.marginBottom = '0px'
            row.style.paddingTop = '0px'
            row.style.paddingBottom = '0px'
            row.style.overflow = 'hidden'
          })
        }
        setTimeout(() => {
          setTaches(prev => prev.map(t =>
            t.id === tache.id
              ? { ...t, statut: newStatut, ...(newStatut === 'termine' ? { date_completion: new Date().toISOString(), termine_par: userName } : { date_completion: null, termine_par: null }) }
              : t
          ))
          setAnimatingId(null)
          setAnimationType(null)
        }, type === 'complete' ? 400 : 200)
      }, type === 'complete' ? 800 : 500)

      // Notification + toast d'annulation
      if (type === 'complete') {
        notify(`"${tache.titre}" terminée`)
        setUndoToast({
          key: Date.now(),
          message: `"${tache.titre}" terminée`,
          tacheId: tache.id,
          ancienStatut
        })
      }
    } else {
      setAnimatingId(null)
      setAnimationType(null)
    }
  }, [animatingId, userName])

  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)

  function getJoursRetard(tache) {
    if (!tache.date_limite || tache.statut === 'termine') return 0
    const dateLimite = new Date(tache.date_limite + 'T00:00:00')
    const diff = Math.floor((aujourdhui - dateLimite) / 86400000)
    return Math.max(0, diff)
  }

  function isEnRetard(tache) {
    return getJoursRetard(tache) > 0
  }

  const PRIO_RANK = { basse: 0, moyenne: 1, haute: 2, urgente: 3 }
  const PRIO_FROM_RANK = ['basse', 'moyenne', 'haute', 'urgente']

  function getPrioriteEffective(tache) {
    const retard = getJoursRetard(tache)
    const baseRank = PRIO_RANK[tache.priorite] ?? 1
    let effectiveRank = baseRank
    if (retard >= 3) effectiveRank = Math.max(effectiveRank, 3) // urgente
    else if (retard >= 1) effectiveRank = Math.max(effectiveRank, 2) // haute
    return PRIO_FROM_RANK[effectiveRank]
  }

  const filtered = taches.filter(t => {
    if (filtreStatut === 'a_faire' && t.statut === 'termine') return false
    if (filtreStatut === 'termine' && t.statut !== 'termine') return false
    if (filtreStatut === 'en_retard' && !isEnRetard(t)) return false
    if (filtreAssigne !== 'tous' && t.assigne_a !== filtreAssigne) return false
    if (filtrePriorite !== 'tous' && t.priorite !== filtrePriorite) return false
    return true
  })

  function comparePrioRetard(a, b) {
    // 1. Priorité effective (urgente > haute > moyenne > basse)
    const prioA = PRIO_RANK[getPrioriteEffective(a)] ?? 0
    const prioB = PRIO_RANK[getPrioriteEffective(b)] ?? 0
    if (prioA !== prioB) return prioB - prioA

    // 2. À priorité égale : en retard avant non en retard
    const retA = getJoursRetard(a)
    const retB = getJoursRetard(b)
    if (retA > 0 && retB === 0) return -1
    if (retA === 0 && retB > 0) return 1

    // 3. Entre tâches en retard : plus en retard d'abord
    if (retA > 0 && retB > 0) return retB - retA

    // 4. Entre tâches non en retard : date limite la plus proche d'abord
    if (a.date_limite && b.date_limite) return new Date(a.date_limite) - new Date(b.date_limite)
    if (a.date_limite) return -1
    if (b.date_limite) return 1
    return 0
  }

  const sorted = [...filtered].sort((a, b) => {
    switch (tri) {
      case 'pertinence':
        return comparePrioRetard(a, b)
      case 'date_limite_asc': {
        if (!a.date_limite && !b.date_limite) return 0
        if (!a.date_limite) return 1
        if (!b.date_limite) return -1
        return new Date(a.date_limite) - new Date(b.date_limite)
      }
      case 'priorite_desc':
        return comparePrioRetard(a, b)
      case 'client_asc':
        return (a.entreprises?.nom_entreprise || '').localeCompare(b.entreprises?.nom_entreprise || '')
      case 'date_creation_desc':
        return new Date(b.created_at) - new Date(a.created_at)
      default:
        return 0
    }
  })

  const nbEnRetard = taches.filter(isEnRetard).length
  const nbAFaire = taches.filter(t => t.statut !== 'termine').length
  const nbTerminées = taches.filter(t => t.statut === 'termine').length

  return (
    <>
    <div>
      {/* Mobile header */}
      <div className="sm:hidden flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-kano-blue">Tâches</h1>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2 whitespace-nowrap">
            <span>{nbAFaire} à faire</span>
            {nbEnRetard > 0 && (<><span>·</span><span>{nbEnRetard} en retard</span></>)}
            <span>·</span>
            <span>{nbTerminées} terminées</span>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2 py-1 mt-1 bg-kano-blue text-white rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Fermer' : 'Nouvelle tâche'}
        </button>
      </div>
      {/* Desktop header */}
      <div className="hidden sm:flex justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-kano-blue">Tâches</h1>
          <p className="text-sm text-gray-400 mt-1">Vue globale de toutes les tâches</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>{nbAFaire} à faire</span>
            {nbEnRetard > 0 && (<><span>·</span><span>{nbEnRetard} en retard</span></>)}
            <span>·</span>
            <span>{nbTerminées} terminées</span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-kano-blue text-white rounded-lg hover:bg-kano-blue/90 text-sm font-medium"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Fermer' : 'Nouvelle tâche'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <div className="text-xs text-gray-400 mb-3">
          Filtres
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Statut</label>
            <select
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
            >
              <option value="a_faire">À faire</option>
              <option value="en_retard">En retard</option>
              <option value="termine">Terminées</option>
              <option value="tous">Toutes</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Assigné à</label>
            <select
              value={filtreAssigne}
              onChange={(e) => setFiltreAssigne(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
            >
              <option value="tous">Tous</option>
              {UTILISATEURS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Priorité</label>
            <select
              value={filtrePriorite}
              onChange={(e) => setFiltrePriorite(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
            >
              <option value="tous">Toutes</option>
              {Object.entries(PRIORITE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Trier par</label>
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
            >
              <option value="pertinence">Pertinence</option>
              <option value="date_limite_asc">Date limite (proche d'abord)</option>
              <option value="priorite_desc">Priorité (urgente d'abord)</option>
              <option value="client_asc">Client (A-Z)</option>
              <option value="date_creation_desc">Date création (récent)</option>
            </select>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-kano-blue/20 p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1.5">Titre *</label>
              <input
                type="text"
                value={formData.titre}
                onChange={e => setFormData({ ...formData, titre: e.target.value })}
                placeholder="Titre de la tâche"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1.5">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description (optionnel)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Client *</label>
              <select
                value={formData.entreprise_id}
                onChange={e => {
                  const id = e.target.value
                  setFormData({ ...formData, entreprise_id: id, projet_id: '' })
                  fetchProjetsClient(id)
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
              >
                <option value="">Sélectionner un client</option>
                {entreprises.map(e => (
                  <option key={e.id} value={e.id}>{e.nom_entreprise}</option>
                ))}
              </select>
            </div>
            {formData.entreprise_id && (
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Projet</label>
                <select
                  value={formData.projet_id}
                  onChange={e => setFormData({ ...formData, projet_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
                >
                  <option value="">Aucun projet</option>
                  {projetsClient.map(p => (
                    <option key={p.id} value={p.id}>{p.nom_projet}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Priorité</label>
              <select
                value={formData.priorite}
                onChange={e => setFormData({ ...formData, priorite: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
              >
                {Object.entries(PRIORITE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Assigné à</label>
              <select
                value={formData.assigne_a}
                onChange={e => setFormData({ ...formData, assigne_a: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
              >
                <option value="">Non assigné</option>
                {UTILISATEURS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Date limite</label>
              <input
                type="date"
                value={formData.date_limite}
                onChange={e => setFormData({ ...formData, date_limite: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kano-blue/20"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setFormData({ titre: '', description: '', priorite: 'moyenne', assigne_a: '', entreprise_id: '', projet_id: '', date_limite: '' }); setProjetsClient([]) }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              onClick={handleCreateTache}
              disabled={!formData.titre.trim() || !formData.entreprise_id}
              className="px-4 py-1.5 bg-kano-blue text-white rounded-lg text-sm font-medium hover:bg-kano-blue/90 disabled:opacity-40"
            >
              Créer la tâche
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          <div className="animate-pulse">
            <p className="text-gray-400">Chargement des tâches...</p>
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          <p className="text-gray-400">Aucune tâche trouvée avec ces filtres</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-2 lg:gap-0">
          {/* Rendu d'une carte tâche */}
          {(() => {
            const mid = Math.ceil(sorted.length / 2)
            const leftTasks = sorted.slice(0, mid)
            const rightTasks = sorted.slice(mid)

            function renderCard(tache, index) {
              const enRetard = isEnRetard(tache)
              const termine = tache.statut === 'termine'
              const isAnimating = animatingId === tache.id
              const isCompleting = isAnimating && animationType === 'complete'
              const isReopening = isAnimating && animationType === 'reopen'
              const nouvelle = !termine && isNouvelle(tache)
              const usr = tache.assigne_a ? UTILISATEURS.find(u => u.value === tache.assigne_a) : null

              const joursRetard = getJoursRetard(tache)
              const prioEff = getPrioriteEffective(tache)
              const escalated = prioEff !== tache.priorite

              return (
                <div
                  key={tache.id}
                  ref={el => { rowRefs.current[tache.id] = el }}
                  onClick={() => {
                    if (nouvelle) markAsSeen(tache.id)
                    if (tache.entreprises?.id) openClientModal(tache.entreprises.id, { onglet: 'taches', tacheId: tache.id })
                  }}
                  className={`relative rounded-lg border shadow-sm pl-3 pr-4 py-3 hover-card cursor-pointer ${
                    isCompleting ? 'border-green-300 bg-green-50/40' :
                    isReopening ? 'border-kano-blue/30 bg-blue-50/40' :
                    nouvelle ? 'border-gray-400 bg-gray-50/60' : 'border-gray-200/60 bg-white'
                  } ${termine && !isAnimating ? 'opacity-50' : ''}`}
                >
                  {/* Badge NOUVEAU sur la bordure */}
                  {nouvelle && !isAnimating && (
                    <span className="absolute top-0 left-4 -translate-y-1/2 px-1.5 bg-gray-50 text-gray-400 text-[9px] font-semibold tracking-wider uppercase leading-[16px] z-10">
                      Nouveau
                    </span>
                  )}

                  {/* Barre de progression animée */}
                  {isCompleting && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                      <div
                        className="absolute top-0 left-0 h-full bg-green-400/10"
                        style={{ animation: 'slideRight 0.6s ease-out forwards' }}
                      />
                    </div>
                  )}
                  {isReopening && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                      <div
                        className="absolute top-0 left-0 h-full bg-blue-400/10"
                        style={{ animation: 'slideRight 0.4s ease-out forwards' }}
                      />
                    </div>
                  )}

                  {/* Numéro d'ordre — coin haut gauche */}
                  <span className="absolute top-1.5 left-2 text-[10px] text-gray-300 font-medium leading-none">{index + 1}</span>

                  {/* Assigné — coin haut droit */}
                  {usr && (
                    <span className={`absolute top-3 right-4 text-[11px] font-semibold ${usr.color}`}>
                      {usr.label}
                    </span>
                  )}

                  {/* Priorité + délai + date — coin bas droit */}
                  <div className="absolute bottom-3 right-4 flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${PRIORITE_COLORS[prioEff]}`} />
                        <span className="text-[11px] text-gray-400">
                          {PRIORITE_LABELS[prioEff]}
                        </span>
                      </span>
                      {joursRetard > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
                          <AlertTriangle size={11} />
                          {joursRetard}j
                        </span>
                      )}
                    </div>
                    <span className={`flex items-center gap-1 text-[11px] ${tache.date_limite ? 'text-gray-400' : 'text-gray-300 italic'}`}>
                      <Clock size={11} />
                      {tache.date_limite
                        ? new Date(tache.date_limite).toLocaleDateString('fr-FR')
                        : 'Pas de date limite'}
                    </span>
                  </div>

                  {/* Badge flottant — centré */}
                  {isCompleting && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-green-500 text-white rounded-full text-sm font-medium shadow-md"
                        style={{ animation: 'popIn 0.3s ease-out 0.15s both' }}>
                        <Check size={14} strokeWidth={3} />
                        Terminée
                      </div>
                    </div>
                  )}
                  {isReopening && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-kano-blue text-white rounded-full text-sm font-medium shadow-md"
                        style={{ animation: 'popIn 0.3s ease-out 0.1s both' }}>
                        Réouverte
                      </div>
                    </div>
                  )}

                  {/* Contenu centré verticalement */}
                  <div className="min-h-[72px] flex items-center gap-2.5 pr-14">
                    {/* Checkbox */}
                    <div className="flex items-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggle(tache) }}
                        disabled={!!animatingId}
                        className={`w-[22px] h-[22px] rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                          isCompleting
                            ? 'border-green-500 bg-green-500 scale-125'
                            : termine
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300 hover:border-kano-blue'
                        }`}
                      >
                        {(termine || isCompleting) && (
                          <Check size={14} className="text-white" style={isCompleting ? { animation: 'popIn 0.2s ease-out' } : undefined} />
                        )}
                      </button>
                    </div>

                    {/* Titre + client + projet — centré verticalement en PC */}
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium leading-snug truncate ${termine ? 'line-through text-gray-400' : 'text-kano-blue'}`}>
                        {tache.titre}
                      </h3>
                      {tache.entreprises && (
                        <p className="text-xs text-gray-600 font-medium truncate mt-0.5">
                          {tache.entreprises.nom_entreprise}
                        </p>
                      )}
                      {tache.projets && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {tache.projets.nom_projet}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <>
                {/* Colonne gauche */}
                <div className="flex-1 space-y-2 min-w-0">
                  {leftTasks.map((t, i) => renderCard(t, i))}
                </div>

                {/* Séparateur vertical (desktop) */}
                <div className="hidden lg:flex flex-col items-center mx-3 flex-shrink-0">
                  <div className="w-px flex-1 bg-gray-200/80" />
                </div>

                {/* Colonne droite */}
                <div className="flex-1 space-y-2 min-w-0">
                  {rightTasks.map((t, i) => renderCard(t, mid + i))}
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>

    {undoToast && (
      <UndoToast
        key={undoToast.key}
        message={undoToast.message}
        onUndo={async () => {
          await supabase
            .from('taches')
            .update({ statut: undoToast.ancienStatut, date_completion: null, termine_par: null })
            .eq('id', undoToast.tacheId)
          setTaches(prev => prev.map(t =>
            t.id === undoToast.tacheId
              ? { ...t, statut: undoToast.ancienStatut, date_completion: null, termine_par: null }
              : t
          ))
          setUndoToast(null)
        }}
        onExpire={() => setUndoToast(null)}
      />
    )}
    </>
  )
}
