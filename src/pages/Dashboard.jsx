import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Clock, ChevronDown, Check, AlertTriangle } from 'lucide-react'
import { useClientModal } from '../contexts/ClientModalContext'
import { useAuth } from '../contexts/AuthContext'
import { PRIORITE_LABELS, PRIORITE_COLORS } from '../lib/constants'
import { useUsers } from '../contexts/UsersContext'
import UndoToast from '../components/UndoToast'
import { useNotification } from '../contexts/NotificationContext'

function getGreeting() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Bonjour'
  if (h >= 12 && h < 18) return 'Bon après-midi'
  return 'Bonne soirée'
}

export default function Dashboard() {
  const { userName } = useAuth()
  const { notify } = useNotification()
  const { greetingActive } = useOutletContext() || {}
  const { utilisateurs: UTILISATEURS } = useUsers()
  const [tachesUrgentes, setTachesUrgentes] = useState([])
  const [showPrevisions, setShowPrevisions] = useState(false)
  const [showAllActivite, setShowAllActivite] = useState(false)
  const [activiteRecente, setActiviteRecente] = useState([])
  const [stats, setStats] = useState({
    mrr_lissage: 0,
    mrr_hebergement: 0,
    mrr_total: 0,
    clients_abonnes: 0,
    abonnements: {
      essentiel: 0,
      serenite: 0,
      kano_plus: 0,
      ecom_fondations: 0,
      ecom_conquete: 0,
      ecom_performances: 0
    }
  })
  const { openClientModal } = useClientModal()
  const [lissagesActifs, setLissagesActifs] = useState([])
  const [loading, setLoading] = useState(true)
  const [undoToast, setUndoToast] = useState(null)
  const [animatingId, setAnimatingId] = useState(null)
  const [animationType, setAnimationType] = useState(null)
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
  const aujourdhui = new Date()
  const [moisSelectionne, setMoisSelectionne] = useState(aujourdhui.toISOString().slice(0, 7))
  const [mrrPrevisionnels, setMrrPrevisionnels] = useState([])

  useEffect(() => {
    fetchDashboardData()
    fetchTachesUrgentes()
    fetchActiviteRecente()
  }, [moisSelectionne])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTachesUrgentes()
      fetchActiviteRecente()
    }, 15000)
    const onUpdate = () => { fetchTachesUrgentes(); fetchActiviteRecente() }
    window.addEventListener('kano:data-updated', onUpdate)
    return () => { clearInterval(interval); window.removeEventListener('kano:data-updated', onUpdate) }
  }, [])

  async function fetchTachesUrgentes() {
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('taches')
      .select('*, entreprises ( id, nom_entreprise )')
      .neq('statut', 'termine')
      .order('date_limite', { ascending: true, nullsFirst: false })

    if (data) {
      const PRIO_RANK_FETCH = { urgente: 3, haute: 2, moyenne: 1, basse: 0 }
      const urgentes = data.filter(t => {
        const isUser = !t.assigne_a || t.assigne_a === userName
        const isUrgent = t.priorite === 'urgente' || t.priorite === 'haute' || (t.date_limite && t.date_limite <= aujourdhui)
        return isUser && isUrgent
      }).sort((a, b) => {
        // 1. Priorité décroissante
        const pa = PRIO_RANK_FETCH[a.priorite] ?? 1
        const pb = PRIO_RANK_FETCH[b.priorite] ?? 1
        if (pa !== pb) return pb - pa
        // 2. Date limite croissante (proches d'abord, null à la fin)
        if (a.date_limite && b.date_limite) return a.date_limite.localeCompare(b.date_limite)
        if (a.date_limite) return -1
        if (b.date_limite) return 1
        // 3. Date de création décroissante (récent d'abord)
        return (b.created_at || '').localeCompare(a.created_at || '')
      })
      setTachesUrgentes(urgentes.slice(0, 8))
    }
  }

  async function handleToggleTache(tache) {
    if (animatingId) return

    setAnimatingId(tache.id)
    setAnimationType('complete')

    const { error } = await supabase
      .from('taches')
      .update({ statut: 'termine', date_completion: new Date().toISOString(), termine_par: userName })
      .eq('id', tache.id)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: tache.entreprise_id,
        projet_id: tache.projet_id,
        tache_id: tache.id,
        type_action: 'completion',
        entite: 'tache',
        description: `Tâche "${tache.titre}" marquée comme terminée`,
        utilisateur: userName
      })

      notify(`"${tache.titre}" terminée`)

      // Animation puis retrait
      setTimeout(() => {
        setTachesUrgentes(prev => prev.filter(t => t.id !== tache.id))
        setAnimatingId(null)
        setAnimationType(null)
        fetchActiviteRecente()
      }, 1200)

      setUndoToast({
        message: `"${tache.titre}" terminée`,
        tache
      })
    } else {
      setAnimatingId(null)
      setAnimationType(null)
    }
  }

  async function handleUndoTache(tache) {
    const { error } = await supabase
      .from('taches')
      .update({ statut: 'a_faire', date_completion: null, termine_par: null })
      .eq('id', tache.id)

    if (!error) {
      fetchTachesUrgentes()
      fetchActiviteRecente()
    }
    setUndoToast(null)
  }

  async function fetchActiviteRecente() {
    const { data } = await supabase
      .from('historique')
      .select('*, entreprises ( id, nom_entreprise )')
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) setActiviteRecente(data)
  }

  async function fetchDashboardData() {
    try {
      setLoading(true)

      const { data: entreprises, error } = await supabase
        .from('entreprises')
        .select('*, abonnements(*), projets(*)')
        .in('statut_commercial', ['client', 'prospect'])

      if (error) {
        console.error('Erreur Supabase:', error)
        setLoading(false)
        return
      }

      const [annee, mois] = moisSelectionne.split('-').map(Number)
      const debutMois = new Date(annee, mois - 1, 1)
      const finMois = new Date(annee, mois, 0)

      const abonnementsActifs = entreprises?.flatMap(e =>
        e.abonnements?.filter(a => {
          if (!a.actif || !a.date_debut) return false
          const dateDebut = new Date(a.date_debut)
          return dateDebut <= finMois
        }) || []
      ) || []

      const mrrHebergement = abonnementsActifs.reduce((sum, abo) => sum + parseFloat(abo.tarif_mensuel || 0), 0)

      const abonnementsParFormule = {
        essentiel: abonnementsActifs.filter(a => a.formule === 'essentiel').length,
        serenite: abonnementsActifs.filter(a => a.formule === 'serenite').length,
        kano_plus: abonnementsActifs.filter(a => a.formule === 'kano_plus').length,
        ecom_fondations: abonnementsActifs.filter(a => a.formule === 'ecom_fondations').length,
        ecom_conquete: abonnementsActifs.filter(a => a.formule === 'ecom_conquete').length,
        ecom_performances: abonnementsActifs.filter(a => a.formule === 'ecom_performances').length
      }

      const clientsAbonnes = entreprises?.filter(e =>
        e.abonnements?.some(a => {
          if (!a.actif || !a.date_debut) return false
          const dateDebut = new Date(a.date_debut)
          return dateDebut <= finMois
        })
      ).length || 0

      const projetsAvecLissage = []
      entreprises?.forEach(entreprise => {
        entreprise.projets?.forEach(projet => {
          if (projet.modalite_paiement === 'acompte_lissage' && projet.lissage_mois && projet.date_acompte) {
            const dateAcompte = new Date(projet.date_acompte)
            const dateDebutLissage = new Date(dateAcompte)
            dateDebutLissage.setMonth(dateDebutLissage.getMonth() + 1)

            if (dateDebutLissage <= finMois) {
              const moisEcoules = (annee - dateDebutLissage.getFullYear()) * 12 +
                                  (mois - 1 - dateDebutLissage.getMonth())
              const moisRestants = Math.max(0, projet.lissage_mois - moisEcoules)

              if (moisRestants > 0) {
                projetsAvecLissage.push({
                  id: projet.id,
                  entreprise: entreprise.nom_entreprise,
                  entreprise_id: entreprise.id,
                  montant_lissage_mensuel: projet.montant_lissage_mensuel,
                  mois_restants: moisRestants
                })
              }
            }
          }
        })
      })

      const mrrLissage = projetsAvecLissage.reduce((sum, p) => sum + parseFloat(p.montant_lissage_mensuel || 0), 0)

      setStats({
        mrr_lissage: mrrLissage,
        mrr_hebergement: mrrHebergement,
        mrr_total: mrrLissage + mrrHebergement,
        clients_abonnes: clientsAbonnes,
        abonnements: abonnementsParFormule
      })

      setLissagesActifs(projetsAvecLissage)

      calculerMrrPrevisionnels(entreprises)

      setLoading(false)
    } catch (error) {
      console.error('Erreur:', error)
      setLoading(false)
    }
  }

  function calculerMrrPrevisionnels(entreprises) {
    const previsionnels = []
    const aujourdhui = new Date()

    for (let i = 0; i < 6; i++) {
      const dateCible = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + i, 1)
      const anneeCible = dateCible.getFullYear()
      const moisCible = dateCible.getMonth()
      const debutMois = new Date(anneeCible, moisCible, 1)

      const abonnementsActifs = entreprises?.flatMap(e =>
        e.abonnements?.filter(a => {
          if (!a.actif || !a.date_debut) return false
          const dateDebut = new Date(a.date_debut)
          return dateDebut <= debutMois
        }) || []
      ) || []

      const mrrHeberg = abonnementsActifs.reduce((sum, abo) => sum + parseFloat(abo.tarif_mensuel || 0), 0)

      const projetsAvecLissage = []
      entreprises?.forEach(entreprise => {
        entreprise.projets?.forEach(projet => {
          if (projet.modalite_paiement === 'acompte_lissage' && projet.lissage_mois && projet.date_acompte) {
            const dateAcompte = new Date(projet.date_acompte)
            const dateDebutLissage = new Date(dateAcompte)
            dateDebutLissage.setMonth(dateDebutLissage.getMonth() + 1)

            if (dateDebutLissage <= debutMois) {
              const moisEcoules = (anneeCible - dateDebutLissage.getFullYear()) * 12 +
                                  (moisCible - dateDebutLissage.getMonth())
              const moisRestants = Math.max(0, projet.lissage_mois - moisEcoules)

              if (moisRestants > 0) {
                projetsAvecLissage.push(projet)
              }
            }
          }
        })
      })

      const mrrLiss = projetsAvecLissage.reduce((sum, p) => sum + parseFloat(p.montant_lissage_mensuel || 0), 0)

      previsionnels.push({
        mois: dateCible,
        mrr: mrrLiss + mrrHeberg
      })
    }

    setMrrPrevisionnels(previsionnels)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 sm:p-12 text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-100 rounded w-48 mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm font-normal">Chargement du dashboard...</p>
        </div>
      </div>
    )
  }

  const aujourdhuiStr = new Date().toISOString().slice(0, 10)

  const aujourdhuiLocal = new Date()
  aujourdhuiLocal.setHours(0, 0, 0, 0)

  function getJoursRetard(tache) {
    if (!tache.date_limite || tache.statut === 'termine') return 0
    const dateLimite = new Date(tache.date_limite + 'T00:00:00')
    const diff = Math.floor((aujourdhuiLocal - dateLimite) / 86400000)
    return Math.max(0, diff)
  }

  const PRIO_RANK = { basse: 0, moyenne: 1, haute: 2, urgente: 3 }
  const PRIO_FROM_RANK = ['basse', 'moyenne', 'haute', 'urgente']

  function getPrioriteEffective(tache) {
    const retard = getJoursRetard(tache)
    const baseRank = PRIO_RANK[tache.priorite] ?? 1
    let effectiveRank = baseRank
    if (retard >= 3) effectiveRank = Math.max(effectiveRank, 3)
    else if (retard >= 1) effectiveRank = Math.max(effectiveRank, 2)
    return PRIO_FROM_RANK[effectiveRank]
  }

  function formatTempsRelatif(dateStr) {
    const raw = dateStr?.endsWith('Z') || dateStr?.includes('+') ? dateStr : dateStr + 'Z'
    const date = new Date(raw)
    const maintenant = new Date()
    const diffMs = maintenant - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffH = Math.floor(diffMin / 60)
    const diffJ = Math.floor(diffH / 24)
    if (diffSec < 30) return 'à l\'instant'
    if (diffMin < 1) return 'il y a quelques secondes'
    if (diffMin === 1) return 'il y a 1 minute'
    if (diffMin < 60) return `il y a ${diffMin} minutes`
    if (diffH === 1) return 'il y a 1 heure'
    if (diffH < 24) return `il y a ${diffH} heures`
    if (diffJ === 1) return 'il y a 1 jour'
    if (diffJ < 7) return `il y a ${diffJ} jours`
    if (diffJ < 30) return `il y a ${Math.floor(diffJ / 7)} semaine${Math.floor(diffJ / 7) > 1 ? 's' : ''}`
    return date.toLocaleDateString('fr-FR')
  }

  function formatActivitePhrase(event) {
    const qui = event.utilisateur
      ? event.utilisateur.charAt(0).toUpperCase() + event.utilisateur.slice(1)
      : 'Quelqu\'un'
    const desc = event.description || ''
    const descLower = desc.charAt(0).toLowerCase() + desc.slice(1)

    if (event.type_action === 'creation') return `${qui} a créé : ${descLower}`
    if (event.type_action === 'completion') return `${qui} a terminé : ${descLower}`
    if (event.type_action === 'suppression') return `${qui} a supprimé : ${descLower}`
    if (event.type_action === 'modification') return `${qui} a modifié : ${descLower}`
    if (event.type_action === 'paiement') return `${qui} a enregistré un ${descLower}`
    return `${qui} : ${descLower}`
  }

  return (
    <>
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <h1
          id="dashboard-greeting"
          className="text-2xl font-semibold text-kano-blue"
          style={greetingActive ? { visibility: 'hidden' } : undefined}
        >
          {getGreeting()} {userName.charAt(0).toUpperCase() + userName.slice(1)}
        </h1>
        <p className="text-xs text-gray-400 mt-2 font-normal">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Colonne gauche : Tâches urgentes */}
      <div className="flex flex-col">
        <div className="bg-white rounded-xl border border-gray-100 p-5 flex-1 flex flex-col">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-gray-500">Ce que tu as d'urgent à faire</h2>
          </div>

          {tachesUrgentes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center flex-1 flex items-center justify-center font-normal">Aucune tâche urgente, tout est en ordre !</p>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin space-y-2 py-1 px-3 -mx-3">
              {tachesUrgentes.map(tache => {
                const joursRetard = getJoursRetard(tache)
                const prioEff = getPrioriteEffective(tache)
                const nouvelle = isNouvelle(tache)
                const usr = tache.assigne_a ? UTILISATEURS.find(u => u.value === tache.assigne_a) : null
                const isAnimating = animatingId === tache.id
                const isCompleting = isAnimating && animationType === 'complete'
                return (
                  <div
                    key={tache.id}
                    onClick={() => {
                      if (nouvelle) markAsSeen(tache.id)
                      if (tache.entreprises?.id) openClientModal(tache.entreprises.id, { onglet: 'taches', tacheId: tache.id })
                    }}
                    className={`relative rounded-lg border shadow-sm pl-3 pr-4 py-3 hover-card cursor-pointer ${
                      isCompleting ? 'border-green-300 bg-green-50/40' :
                      nouvelle ? 'border-gray-300 bg-white' : 'border-gray-200/60 bg-white'
                    }`}
                  >
                    {nouvelle && !isCompleting && (
                      <span className="absolute top-0 left-3 -translate-y-1/2 px-1.5 bg-white text-gray-400 text-[9px] font-semibold tracking-wider uppercase leading-none">Nouveau</span>
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

                    {/* Assigné — coin haut droit */}
                    {usr && (
                      <span className={`absolute top-3 right-4 text-[11px] font-semibold ${usr.color}`}>
                        {usr.label}
                      </span>
                    )}

                    {/* Priorité + retard + date — coin bas droit */}
                    <div className="absolute bottom-3 right-4 flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${PRIORITE_COLORS[prioEff]}`} />
                          <span className="text-[11px] text-gray-400">{PRIORITE_LABELS[prioEff]}</span>
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

                    {/* Contenu centré verticalement */}
                    <div className="min-h-[60px] flex items-center gap-2.5 pr-14">
                      {/* Checkbox */}
                      <div className="flex items-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleTache(tache) }}
                          disabled={!!animatingId}
                          className={`w-[20px] h-[20px] rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                            isCompleting
                              ? 'border-green-500 bg-green-500 scale-125'
                              : 'border-gray-300 hover:border-kano-blue'
                          }`}
                          title="Marquer comme terminée"
                        >
                          {isCompleting && (
                            <Check size={14} className="text-white" style={{ animation: 'popIn 0.2s ease-out' }} />
                          )}
                        </button>
                      </div>

                      {/* Titre + client + projet — 3 lignes tronquées */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium leading-snug text-kano-blue truncate">{tache.titre}</h3>
                        {tache.entreprises && (
                          <p className="text-xs text-gray-600 font-medium truncate mt-0.5">
                            {tache.entreprises.nom_entreprise}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Colonne droite : MRR + Activité */}
      <div className="flex flex-col gap-8">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-500">MRR</h2>
            <select
              value={moisSelectionne}
              onChange={(e) => setMoisSelectionne(e.target.value)}
              className="px-2 py-1 border border-gray-100 rounded-lg font-normal text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-200 cursor-pointer text-xs"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const date = new Date()
                date.setMonth(date.getMonth() + i)
                const value = date.toISOString().slice(0, 7)
                const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                return (
                  <option key={value} value={value}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="space-y-3">
            <div className="pb-3 border-b border-gray-200/40">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-normal text-gray-600">Échelonnage des sites</span>
                <span className="font-medium text-kano-blue">{stats.mrr_lissage.toFixed(0)} €</span>
              </div>
              {lissagesActifs.length > 0 ? (
                <div className="pl-4 space-y-1 mt-2">
                  {lissagesActifs.map((lissage) => (
                    <div key={lissage.id} className="flex justify-between items-center text-xs text-gray-500">
                      <span className="cursor-pointer hover:underline" onClick={() => openClientModal(lissage.entreprise_id)}>• {lissage.entreprise} ({lissage.mois_restants} mois restants)</span>
                      <span className="font-normal">{parseFloat(lissage.montant_lissage_mensuel).toFixed(0)}€/mois</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 pl-4 mt-1 font-normal">Aucun lissage actif</p>
              )}
            </div>

            <div className="pb-3 border-b border-gray-200/40">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-normal text-gray-600">Abonnements hébergement</span>
                <span className="font-medium text-kano-blue">{stats.mrr_hebergement.toFixed(0)} €</span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500 font-normal">Clients abonnés</span>
                <span className="font-medium text-kano-blue">{stats.clients_abonnes}</span>
              </div>

              <div className="pl-4 space-y-1 mt-2">
                {stats.abonnements.essentiel > 0 && (
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>• Essentiel (30€)</span>
                    <span className="font-normal">{stats.abonnements.essentiel} clients</span>
                  </div>
                )}
                {stats.abonnements.serenite > 0 && (
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>• Sérénité (60€)</span>
                    <span className="font-normal">{stats.abonnements.serenite} clients</span>
                  </div>
                )}
                {stats.abonnements.kano_plus > 0 && (
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>• KANO+ (100€)</span>
                    <span className="font-normal">{stats.abonnements.kano_plus} clients</span>
                  </div>
                )}
                {stats.abonnements.ecom_fondations > 0 && (
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>• E-com Fondations (60€)</span>
                    <span className="font-normal">{stats.abonnements.ecom_fondations} clients</span>
                  </div>
                )}
                {stats.abonnements.ecom_conquete > 0 && (
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>• E-com Conquête (120€)</span>
                    <span className="font-normal">{stats.abonnements.ecom_conquete} clients</span>
                  </div>
                )}
                {stats.abonnements.ecom_performances > 0 && (
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>• E-com Performances (200€)</span>
                    <span className="font-normal">{stats.abonnements.ecom_performances} clients</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center py-3 mt-3">
              <span className="font-medium text-gray-600">Total MRR</span>
              <span className="text-2xl font-medium text-kano-blue">{stats.mrr_total.toFixed(0)} €<span className="text-xs text-gray-400 font-normal ml-1">/mois</span></span>
            </div>

            {mrrPrevisionnels.length > 0 && (
              <div className="border-t border-gray-200/40 pt-3">
                <button
                  onClick={() => setShowPrevisions(!showPrevisions)}
                  className="flex items-center gap-2 text-sm font-normal text-gray-500 hover:text-gray-700 transition-colors w-full"
                >
                  <ChevronDown size={16} className={`transition-transform ${showPrevisions ? 'rotate-180' : ''}`} />
                  Prévisions MRR des prochains mois
                </button>

                {showPrevisions && (
                  <div className="mt-3">
                    {mrrPrevisionnels.slice(1, 6).map((prev, index) => {
                      const moisActuel = mrrPrevisionnels[0].mrr
                      const evolution = prev.mrr - moisActuel

                      return (
                        <div key={index} className="flex justify-between items-center text-sm text-gray-600 border-b border-gray-200/40 py-2.5 last:border-0">
                          <span>
                            {prev.mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).charAt(0).toUpperCase() + prev.mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).slice(1)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-kano-blue">{prev.mrr.toFixed(0)} €</span>
                            {evolution !== 0 && (
                              <span className="text-xs text-gray-400 font-normal">
                                {evolution > 0 ? '+' : ''}{evolution.toFixed(0)}€
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-500">Activité récente</h2>
            {activiteRecente.length > 3 && (
              <button
                onClick={() => setShowAllActivite(true)}
                className="text-xs text-gray-400 hover:underline font-normal"
              >
                Voir tout
              </button>
            )}
          </div>

          {activiteRecente.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center font-normal">Aucune activité</p>
          ) : (
            <div>
              {activiteRecente.slice(0, 3).map(event => (
                <div key={event.id} className="border-b border-gray-200/40 py-3 last:border-0">
                  <p className="text-sm text-gray-600 leading-snug font-normal">
                    {formatActivitePhrase(event)}
                    {event.entreprises && (
                      <> — <span
                        onClick={() => openClientModal(event.entreprises.id)}
                        className="text-gray-800 cursor-pointer hover:underline"
                      >{event.entreprises.nom_entreprise}</span></>
                    )}
                  </p>
                  <span className="text-xs text-gray-400 font-normal">{formatTempsRelatif(event.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      </div>
    </div>

    {showAllActivite && (
      <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4" onClick={() => setShowAllActivite(false)}>
        <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-lg" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-gray-200/40">
            <h3 className="font-medium text-gray-800">Toute l'activité</h3>
            <button onClick={() => setShowAllActivite(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <div>
              {activiteRecente.map(event => (
                <div key={event.id} className="border-b border-gray-200/40 py-3 last:border-0">
                  <p className="text-sm text-gray-600 leading-snug font-normal">
                    {formatActivitePhrase(event)}
                    {event.entreprises && (
                      <> — <span
                        onClick={() => { openClientModal(event.entreprises.id); setShowAllActivite(false) }}
                        className="text-gray-800 cursor-pointer hover:underline"
                      >{event.entreprises.nom_entreprise}</span></>
                    )}
                  </p>
                  <span className="text-xs text-gray-400 font-normal">{formatTempsRelatif(event.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {undoToast && (
      <UndoToast
        message={undoToast.message}
        onUndo={() => handleUndoTache(undoToast.tache)}
        onExpire={() => setUndoToast(null)}
      />
    )}
    </>
  )
}