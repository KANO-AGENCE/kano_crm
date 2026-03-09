import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { X, Plus, Edit2, Trash2, Check, Clock, AlertTriangle } from 'lucide-react'
import ModaleConfirm from './ModaleConfirm'
import UndoToast from './UndoToast'
import { PRIORITE_COLORS, PRIORITE_LABELS } from '../lib/constants'
import { useUsers } from '../contexts/UsersContext'
import { useAuth } from '../contexts/AuthContext'

export default function ModaleProjet({ projet, entreprise, onClose, onUpdate }) {
  const { userName } = useAuth()
  const { utilisateurs: UTILISATEURS } = useUsers()
  const [onglet, setOnglet] = useState('a_faire')
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [taches, setTaches] = useState([])
  const [showFormTache, setShowFormTache] = useState(false)
  const [tacheEnCours, setTacheEnCours] = useState(null)
  const [loading, setLoading] = useState(true)
  const [animatingTacheId, setAnimatingTacheId] = useState(null)
  const [animTacheType, setAnimTacheType] = useState(null)
  const [undoToast, setUndoToast] = useState(null)

  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    priorite: 'moyenne',
    assigne_a: null,
    date_limite: '',
    projet_id: projet.id
  })

  // Swipe-to-delete mobile
  const swipeRef = useRef({ startX: 0, startY: 0, tacheId: null, swiping: false })
  const [swipeOffset, setSwipeOffset] = useState({})

  const handleSwipeStart = useCallback((e, tacheId) => {
    swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, tacheId, swiping: false }
  }, [])

  const handleSwipeMove = useCallback((e, tacheId) => {
    const ref = swipeRef.current
    if (ref.tacheId !== tacheId) return
    const diffX = ref.startX - e.touches[0].clientX
    const diffY = Math.abs(e.touches[0].clientY - ref.startY)
    if (!ref.swiping && diffY > 10 && diffX < 10) { ref.tacheId = null; return }
    if (diffX > 10) ref.swiping = true
    if (ref.swiping && diffX > 0) {
      e.preventDefault()
      setSwipeOffset(prev => ({ ...prev, [tacheId]: Math.min(diffX, 100) }))
    }
  }, [])

  const handleSwipeEnd = useCallback((tacheId) => {
    const offset = swipeOffset[tacheId] || 0
    if (offset > 70) {
      setSwipeOffset(prev => ({ ...prev, [tacheId]: 100 }))
      setTimeout(() => {
        setSwipeOffset(prev => ({ ...prev, [tacheId]: 0 }))
        handleDeleteTache(tacheId)
      }, 150)
    } else {
      setSwipeOffset(prev => ({ ...prev, [tacheId]: 0 }))
    }
    swipeRef.current = { startX: 0, startY: 0, tacheId: null, swiping: false }
  }, [swipeOffset])

  // Priority escalation
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

  useEffect(() => {
    fetchTaches()
  }, [projet.id])

  async function fetchTaches() {
    setLoading(true)
    const { data, error } = await supabase
      .from('taches')
      .select('*')
      .eq('projet_id', projet.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTaches(data)
    }
    setLoading(false)
  }

  async function handleCreateTache() {
    if (!formData.titre.trim()) {
      alert('Le titre est obligatoire')
      return
    }

    const { data: newTache, error } = await supabase
      .from('taches')
      .insert({
        titre: formData.titre.trim(),
        description: formData.description || null,
        priorite: formData.priorite || 'moyenne',
        assigne_a: formData.assigne_a || null,
        date_limite: formData.date_limite || null,
        projet_id: formData.projet_id || null,
        entreprise_id: entreprise.id,
        statut: 'a_faire'
      })
      .select()
      .single()

    if (!error && newTache) {
      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        projet_id: projet.id,
        tache_id: newTache.id,
        type_action: 'creation',
        entite: 'tache',
        description: `Création de la tâche "${formData.titre}" (${formData.priorite})${formData.assigne_a ? ` assignée à ${UTILISATEURS.find(u => u.value === formData.assigne_a)?.label || formData.assigne_a}` : ''}`,
        utilisateur: userName
      })

      fetchTaches()
      resetForm()
      if (onUpdate) onUpdate()
    } else {
      console.error('Erreur création tâche:', error)
      alert('Erreur lors de la création')
    }
  }

  async function handleUpdateTache() {
    if (!formData.titre.trim()) {
      alert('Le titre est obligatoire')
      return
    }

    if (!tacheEnCours || !tacheEnCours.id) {
      console.error('Pas de tâche en cours')
      return
    }

    const { error } = await supabase
      .from('taches')
      .update({
        titre: formData.titre,
        description: formData.description,
        priorite: formData.priorite,
        assigne_a: formData.assigne_a,
        date_limite: formData.date_limite || null
      })
      .eq('id', tacheEnCours.id)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        projet_id: projet.id,
        tache_id: tacheEnCours.id,
        type_action: 'modification',
        entite: 'tache',
        description: `Modification de la tâche "${formData.titre}"`,
        utilisateur: userName
      })

      fetchTaches()
      resetForm()
      if (onUpdate) onUpdate()
    } else {
      console.error('Erreur modification tâche:', error)
      alert('Erreur lors de la modification')
    }
  }

  async function handleToggleTache(tache) {
    if (animatingTacheId) return
    const newStatut = tache.statut === 'termine' ? 'a_faire' : 'termine'
    const type = newStatut === 'termine' ? 'complete' : 'reopen'
    const ancienStatut = tache.statut

    setAnimatingTacheId(tache.id)
    setAnimTacheType(type)

    const { error } = await supabase
      .from('taches')
      .update({
        statut: newStatut,
        ...(newStatut === 'termine' ? { date_completion: new Date().toISOString(), termine_par: userName } : { date_completion: null, termine_par: null })
      })
      .eq('id', tache.id)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        projet_id: projet.id,
        tache_id: tache.id,
        type_action: newStatut === 'termine' ? 'completion' : 'modification',
        entite: 'tache',
        description: newStatut === 'termine'
          ? `Tâche "${tache.titre}" marquée comme terminée`
          : `Tâche "${tache.titre}" réouverte`,
        utilisateur: userName
      })

      setTimeout(() => {
        setTaches(prev => prev.map(t =>
          t.id === tache.id
            ? { ...t, statut: newStatut, ...(newStatut === 'termine' ? { date_completion: new Date().toISOString(), termine_par: userName } : { date_completion: null, termine_par: null }) }
            : t
        ))
        setAnimatingTacheId(null)
        setAnimTacheType(null)
      }, type === 'complete' ? 800 : 400)

      if (type === 'complete') {
        setUndoToast({ key: Date.now(), message: `"${tache.titre}" terminée`, tacheId: tache.id, ancienStatut })
      }

      if (onUpdate) onUpdate()
    } else {
      setAnimatingTacheId(null)
      setAnimTacheType(null)
    }
  }

  async function handleDeleteTache(id) {
    const tache = taches.find(t => t.id === id)
    setConfirmDialog({
      message: `Supprimer la tâche "${tache?.titre}" ?`,
      onConfirm: async () => {
        setConfirmDialog(null)
        setAnimatingTacheId(id)
        setAnimTacheType('delete')

        const { error } = await supabase.from('taches').delete().eq('id', id)

        if (!error) {
          await supabase.from('historique').insert({
            entreprise_id: entreprise.id,
            projet_id: projet.id,
            type_action: 'suppression',
            entite: 'tache',
            description: `Suppression de la tâche "${tache?.titre}"`,
            utilisateur: userName
          })

          setTimeout(() => {
            setTaches(prev => prev.filter(t => t.id !== id))
            setAnimatingTacheId(null)
            setAnimTacheType(null)
            setUndoToast(null)
          }, 600)

          if (onUpdate) onUpdate()
        } else {
          setAnimatingTacheId(null)
          setAnimTacheType(null)
        }
      }
    })
  }

  function resetForm() {
    setFormData({
      titre: '',
      description: '',
      priorite: 'moyenne',
      assigne_a: null,
      date_limite: '',
      projet_id: projet.id
    })
    setTacheEnCours(null)
    setShowFormTache(false)
  }

  function openEditTache(tache) {
    setTacheEnCours(tache)
    setFormData({
      titre: tache.titre,
      description: tache.description || '',
      priorite: tache.priorite,
      assigne_a: tache.assigne_a,
      date_limite: tache.date_limite || '',
      projet_id: projet.id
    })
    setShowFormTache(true)
  }

  const tachesAFaire = taches.filter(t => t.statut !== 'termine')
  const tachesTerminees = taches.filter(t => t.statut === 'termine')

  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full h-[88vh] max-w-5xl overflow-hidden flex flex-col shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-kano-blue text-white p-5 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-white/50 hover:text-white/80 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>

          <div className="pr-12">
            <h2 className="text-lg font-medium">{projet.nom_projet}</h2>
            <span className="text-xs text-white/50">{entreprise.nom_entreprise}</span>
          </div>
        </div>

        <div className="border-b border-gray-200/60 px-5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFormTache(true)}
              className="p-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              title="Créer une tâche"
            >
              <Plus size={16} />
            </button>

            {['a_faire', 'effectuees', 'historique'].map(tab => (
              <button
                key={tab}
                onClick={() => setOnglet(tab)}
                className={`px-3 py-2.5 text-sm border-b-2 transition-colors ${
                  onglet === tab
                    ? 'border-gray-800 text-gray-800 font-medium'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab === 'a_faire' && `Tâches à faire (${tachesAFaire.length})`}
                {tab === 'effectuees' && `Effectuées (${tachesTerminees.length})`}
                {tab === 'historique' && 'Historique'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
          ) : (
            <>
              {onglet === 'a_faire' && (
                <div className="space-y-2">
                  {tachesAFaire.length > 0 ? (
                    tachesAFaire.map(tache => {
                      const joursRetard = getJoursRetard(tache)
                      const prioEff = getPrioriteEffective(tache)
                      const enRetard = joursRetard > 0
                      const isEditing = tacheEnCours?.id === tache.id
                      const isAnimating = animatingTacheId === tache.id
                      const isCompleting = isAnimating && animTacheType === 'complete'
                      const isReopening = isAnimating && animTacheType === 'reopen'
                      const isDeleting = isAnimating && animTacheType === 'delete'
                      const currentSwipe = swipeOffset[tache.id] || 0
                      const isSwiping = swipeRef.current.tacheId === tache.id && swipeRef.current.swiping

                      if (isEditing) {
                        return (
                          <div key={tache.id} className="bg-gray-50 rounded-lg p-4 space-y-3">
                            <input type="text" value={formData.titre} onChange={e => setFormData({ ...formData, titre: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-300" autoFocus />
                            <textarea placeholder="Description (optionnel)" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" rows={2} />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Priorité</label>
                                <select value={formData.priorite} onChange={e => setFormData({ ...formData, priorite: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                                  {Object.entries(PRIORITE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Assigné à</label>
                                <select value={formData.assigne_a || ''} onChange={e => setFormData({ ...formData, assigne_a: e.target.value || null })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                                  <option value="">Non assigné</option>
                                  {UTILISATEURS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Date limite</label>
                                <input type="date" value={formData.date_limite} onChange={e => setFormData({ ...formData, date_limite: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={resetForm} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                              <button onClick={handleUpdateTache} className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700">Enregistrer</button>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={tache.id} className="relative rounded-lg overflow-hidden">
                          {/* Fond rouge swipe mobile */}
                          <div className="sm:hidden absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 rounded-r-lg"
                            style={{ width: Math.max(currentSwipe, 0), transition: isSwiping ? 'none' : 'width 0.3s ease' }}>
                            <Trash2 size={20} className="text-white" style={{ opacity: Math.min(currentSwipe / 60, 1) }} />
                          </div>
                          <div
                            onTouchStart={e => handleSwipeStart(e, tache.id)}
                            onTouchMove={e => handleSwipeMove(e, tache.id)}
                            onTouchEnd={() => handleSwipeEnd(tache.id)}
                            style={{ transform: `translateX(-${currentSwipe}px)`, transition: isSwiping ? 'none' : 'transform 0.3s ease' }}
                            className={`relative flex items-center gap-3 border shadow-sm rounded-lg p-3 hover-card cursor-pointer overflow-hidden bg-white ${
                              isCompleting ? 'border-green-300 bg-green-50/40' :
                              isReopening ? 'border-kano-blue/30 bg-blue-50/40' :
                              isDeleting ? 'border-red-300 bg-red-50/40' :
                              'border-gray-200/60'
                            }`}
                          >
                            {/* Barre de progression */}
                            {(isCompleting || isDeleting) && (
                              <div className="absolute inset-0 pointer-events-none">
                                <div className={`absolute top-0 left-0 h-full ${isDeleting ? 'bg-red-400/10' : 'bg-green-400/10'}`} style={{ animation: 'slideRight 0.6s ease-out forwards' }} />
                              </div>
                            )}
                            {/* Badge centré */}
                            {isCompleting && (
                              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                <div className="flex items-center gap-2 px-4 py-1.5 bg-green-500 text-white rounded-full text-sm font-medium shadow-md"
                                  style={{ animation: 'popIn 0.3s ease-out 0.15s both' }}>
                                  <Check size={14} strokeWidth={3} /> Terminée
                                </div>
                              </div>
                            )}
                            {isDeleting && (
                              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500 text-white rounded-full text-sm font-medium shadow-md"
                                  style={{ animation: 'popIn 0.3s ease-out 0.15s both' }}>
                                  <Trash2 size={14} strokeWidth={3} /> Supprimée
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
                            {/* Assigné — mobile: coin haut droit */}
                            {tache.assigne_a && (() => { const u = UTILISATEURS.find(u => u.value === tache.assigne_a); return <span className={`absolute top-2 right-3 text-[11px] font-semibold sm:hidden ${u?.color || 'text-gray-500'}`}>{u?.label || tache.assigne_a}</span> })()}
                            {/* Warning retard — bas droite */}
                            {joursRetard > 0 && (
                              <span className="absolute bottom-2 right-3 flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                                <AlertTriangle size={10} />
                                {joursRetard}j
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleTache(tache) }}
                              disabled={!!animatingTacheId}
                              className={`w-5 h-5 sm:w-6 sm:h-6 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                                isCompleting ? 'border-green-500 bg-green-500 scale-125' : 'border-gray-300 hover:border-green-500 hover:bg-green-50'
                              }`}
                            >
                              {isCompleting && <Check size={12} className="text-white sm:w-3.5 sm:h-3.5" style={{ animation: 'popIn 0.2s ease-out' }} />}
                            </button>
                            <div className="flex-1 min-w-0" onClick={() => openEditTache(tache)}>
                              <div className="flex items-center gap-2 min-w-0 pr-12 sm:pr-0">
                                <span className="font-medium text-sm text-kano-blue truncate flex-1 min-w-0">{tache.titre}</span>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITE_COLORS[prioEff]}`} />
                                {tache.assigne_a && (() => { const u = UTILISATEURS.find(u => u.value === tache.assigne_a); return <span className={`text-xs flex-shrink-0 ml-auto hidden sm:inline ${u?.color || 'text-gray-500'}`}>{u?.label || tache.assigne_a}</span> })()}
                              </div>
                              {tache.description && <p className="hidden sm:block text-xs text-gray-500 mt-0.5">{tache.description}</p>}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 mt-1.5 text-xs text-gray-400">
                                <span>Créée le {new Date(tache.created_at).toLocaleDateString('fr-FR')}</span>
                                {tache.date_limite && (
                                  <span className={`flex items-center gap-1 font-medium ${enRetard ? 'text-red-600' : 'text-gray-600'}`}>
                                    <Clock size={12} />
                                    Pour le {new Date(tache.date_limite).toLocaleDateString('fr-FR')}
                                  </span>
                                )}
                                {!tache.date_limite && (
                                  <span className="italic">Pas de date limite</span>
                                )}
                              </div>
                            </div>
                            {/* Poubelle desktop only */}
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteTache(tache.id) }} className="hidden sm:block p-2 hover:bg-red-50 rounded flex-shrink-0">
                              <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      Aucune tâche à faire
                    </div>
                  )}
                </div>
              )}

              {onglet === 'effectuees' && (
                <div className="space-y-0">
                  {tachesTerminees.length > 0 ? (
                    tachesTerminees.map(tache => {
                      const cSwipe = swipeOffset[tache.id] || 0
                      const cSwiping = swipeRef.current.tacheId === tache.id && swipeRef.current.swiping
                      return (
                        <div key={tache.id} className="relative overflow-hidden">
                          <div className="sm:hidden absolute inset-y-0 right-0 flex items-center justify-center bg-red-500"
                            style={{ width: Math.max(cSwipe, 0), transition: cSwiping ? 'none' : 'width 0.3s ease' }}>
                            <Trash2 size={20} className="text-white" style={{ opacity: Math.min(cSwipe / 60, 1) }} />
                          </div>
                          <div
                            onTouchStart={e => handleSwipeStart(e, tache.id)}
                            onTouchMove={e => handleSwipeMove(e, tache.id)}
                            onTouchEnd={() => handleSwipeEnd(tache.id)}
                            style={{ transform: `translateX(-${cSwipe}px)`, transition: cSwiping ? 'none' : 'transform 0.3s ease' }}
                            className="border-b border-gray-200/40 py-3 bg-white"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleToggleTache(tache)}
                                className="w-6 h-6 rounded border-2 border-green-500 bg-green-500 flex items-center justify-center flex-shrink-0"
                              >
                                <Check size={14} className="text-white" />
                              </button>
                              <span className="text-sm text-gray-500 line-through flex-1">{tache.titre}</span>
                              <button onClick={() => handleDeleteTache(tache.id)} className="hidden sm:block p-2 hover:bg-red-50 rounded flex-shrink-0">
                                <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
                              </button>
                            </div>
                            <div className="ml-9 mt-1">
                              <span className="text-[11px] text-gray-400">
                                Terminée le {new Date(tache.date_completion || tache.updated_at).toLocaleDateString('fr-FR')} à {new Date(tache.date_completion || tache.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                {tache.termine_par && <> par {tache.termine_par.charAt(0).toUpperCase() + tache.termine_par.slice(1)}</>}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      Aucune tâche effectuée
                    </div>
                  )}
                </div>
              )}

              {onglet === 'historique' && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Historique du projet en cours de développement
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showFormTache && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-[80] p-4" onClick={resetForm}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-gray-700 mb-4">
              {tacheEnCours ? 'Modifier la tâche' : 'Nouvelle tâche'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={formData.titre}
                onChange={(e) => setFormData({...formData, titre: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Titre de la tâche"
              />

              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                rows="2"
                placeholder="Description..."
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Priorité</label>
                  <select
                    value={formData.priorite}
                    onChange={(e) => setFormData({...formData, priorite: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="urgente">Urgente</option>
                    <option value="haute">Haute</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="basse">Basse</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Assigné à</label>
                  <select
                    value={formData.assigne_a || ''}
                    onChange={(e) => setFormData({...formData, assigne_a: e.target.value || null})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">Non assigné</option>
                    {UTILISATEURS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date limite</label>
                  <input
                    type="date"
                    value={formData.date_limite}
                    onChange={(e) => setFormData({...formData, date_limite: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={tacheEnCours ? handleUpdateTache : handleCreateTache}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  {tacheEnCours ? 'Enregistrer' : 'Créer'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {undoToast && (
        <UndoToast
          key={undoToast.key}
          message={undoToast.message}
          onUndo={async () => {
            await supabase
              .from('taches')
              .update({ statut: undoToast.ancienStatut, date_completion: null, termine_par: null })
              .eq('id', undoToast.tacheId)
            fetchTaches()
            setUndoToast(null)
          }}
          onExpire={() => setUndoToast(null)}
        />
      )}

      {confirmDialog && (
        <ModaleConfirm
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
