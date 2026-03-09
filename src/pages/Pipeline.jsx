import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  PIPELINE_COMMERCIAL,
  PIPELINE_PRODUCTION,
  COMMERCIAL_DROP_STATUT,
  PHASE_PRODUCTION_LABELS
} from '../lib/constants'
import { Eye, EyeOff } from 'lucide-react'
import { useClientModal } from '../contexts/ClientModalContext'
import { useNotification } from '../contexts/NotificationContext'

export default function Pipeline() {
  const { userName } = useAuth()
  const { openClientModal } = useClientModal()
  const { notify } = useNotification()
  const [entreprises, setEntreprises] = useState([])
  const [loading, setLoading] = useState(true)
  const [vue, setVue] = useState('commercial')
  const [showArchives, setShowArchives] = useState(false)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)

  const pipeline = vue === 'commercial' ? PIPELINE_COMMERCIAL : PIPELINE_PRODUCTION

  function handleDragStart(e, entreprise) {
    setDraggedId(entreprise.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggedId(null)
    setDragOverCol(null)
  }

  function handleDragOver(e, col) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(col)
  }

  function handleDragLeave() {
    setDragOverCol(null)
  }

  function handleDrop(e, col) {
    e.preventDefault()
    setDragOverCol(null)
    if (!draggedId) return
    const ent = entreprises.find(e => e.id === draggedId)
    if (ent) changeColonne(ent, col)
    setDraggedId(null)
  }

  async function fetchEntreprises() {
    setLoading(true)
    const { data, error } = await supabase
      .from('entreprises')
      .select('*, contacts(*), abonnements(*)')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setEntreprises(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEntreprises()
  }, [])

  async function changeColonne(entreprise, nouvelleCol) {
    if (vue === 'commercial') {
      const nouveauStatut = COMMERCIAL_DROP_STATUT[nouvelleCol]
      if (entreprise.statut_commercial === nouveauStatut) return

      const { error } = await supabase
        .from('entreprises')
        .update({ statut_commercial: nouveauStatut })
        .eq('id', entreprise.id)

      if (error) return

      const ancienneCol = getCommercialCol(entreprise.statut_commercial)
      const description = `Pipeline commerciale : "${pipeline.labels[ancienneCol]}" vers "${pipeline.labels[nouvelleCol]}"`

      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        type_action: 'modification',
        entite: 'entreprise',
        description,
        utilisateur: userName
      })

      setEntreprises(prev => prev.map(e =>
        e.id === entreprise.id ? { ...e, statut_commercial: nouveauStatut } : e
      ))
      notify(`${entreprise.nom_entreprise} déplacé vers ${pipeline.labels[nouvelleCol]}`)
    } else {
      const ancienne = entreprise.phase_production
      if (ancienne === nouvelleCol) return

      const { error } = await supabase
        .from('entreprises')
        .update({ phase_production: nouvelleCol })
        .eq('id', entreprise.id)

      if (error) return

      const description = `Pipeline production : "${pipeline.labels[ancienne] || ancienne}" vers "${pipeline.labels[nouvelleCol]}"`

      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        type_action: 'modification',
        entite: 'entreprise',
        description,
        utilisateur: userName
      })

      setEntreprises(prev => prev.map(e =>
        e.id === entreprise.id ? { ...e, phase_production: nouvelleCol } : e
      ))
      notify(`${entreprise.nom_entreprise} déplacé vers ${pipeline.labels[nouvelleCol]}`)
    }
  }

  function getCommercialCol(statut) {
    if (statut === 'dead') return 'archive'
    return statut || 'suspect'
  }

  // Colonnes visibles
  const allColonnes = [...pipeline.colonnes]
  if (vue === 'commercial' && showArchives) {
    allColonnes.push('archive')
  }

  // Construire les colonnes — toutes les entreprises dans les deux vues
  const colonnes = allColonnes.map(col => {
    let items
    if (vue === 'commercial') {
      if (col === 'archive') {
        items = entreprises.filter(e => e.statut_commercial === 'dead')
      } else {
        items = entreprises.filter(e => e.statut_commercial === col)
      }
    } else {
      // Production : toutes les entreprises, classées par phase_production
      // Celles sans phase_production vont dans v0_prod par défaut
      items = entreprises.filter(e => {
        const phase = e.phase_production || 'v0_prod'
        return phase === col
      })
    }
    return {
      id: col,
      label: pipeline.labels[col],
      color: pipeline.colors[col],
      entreprises: items
    }
  })

  const totalVisible = colonnes.reduce((sum, c) => sum + c.entreprises.length, 0)

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 sm:p-12 text-center">
        <div className="animate-pulse">
          <p className="text-gray-500">Chargement du pipeline...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-kano-blue">Pipeline</h1>
          <p className="text-sm text-gray-400 mt-1">
            {totalVisible} entreprise{totalVisible > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex flex-col items-start">
          {/* Switch toggle */}
          <div
            className="relative flex items-center bg-white rounded-lg p-0.5 cursor-pointer select-none w-56 border border-gray-200"
            onClick={() => setVue(vue === 'commercial' ? 'production' : 'commercial')}
          >
            <div
              className={`absolute top-0.5 bottom-0.5 w-1/2 bg-gray-100 rounded-md transition-all duration-300 ease-in-out ${
                vue === 'production' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            <span className={`relative z-10 flex-1 text-center text-[13px] font-medium py-1.5 transition-colors duration-300 ${
              vue === 'commercial' ? 'text-gray-800' : 'text-gray-400'
            }`}>
              Commerciale
            </span>
            <span className={`relative z-10 flex-1 text-center text-[13px] font-medium py-1.5 transition-colors duration-300 ${
              vue === 'production' ? 'text-gray-800' : 'text-gray-400'
            }`}>
              Production
            </span>
          </div>

          <div className="h-7 mt-1.5">
            {vue === 'commercial' && (
              <button
                onClick={() => setShowArchives(!showArchives)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium border transition-colors duration-200 ${
                  showArchives
                    ? 'bg-gray-100 border-gray-200 text-gray-600'
                    : 'bg-white border-gray-200 text-gray-400 hover:text-gray-500 hover:border-gray-300'
                }`}
              >
                {showArchives ? <EyeOff size={13} /> : <Eye size={13} />}
                {showArchives ? 'Masquer archivés' : 'Afficher archivés'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 scrollbar-thin">
        <div className="flex gap-3 h-full lg:justify-center">
          {colonnes.map(col => (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`w-80 flex-shrink-0 flex flex-col bg-white rounded-xl border transition-colors duration-200 ${
                dragOverCol === col.id
                  ? 'bg-gray-50 border-gray-300'
                  : col.color?.border || 'border-gray-200'
              }`}
            >
              <div className={`px-4 py-2.5 rounded-t-[11px] ${col.color?.header || 'bg-gray-50 text-gray-600'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] font-medium">{col.label}</span>
                  <span className="text-xs opacity-60">{col.entreprises.length}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                {col.entreprises.length === 0 ? (
                  <p className="text-[12px] text-gray-300 text-center py-8">Aucune entreprise</p>
                ) : (
                  col.entreprises.map(ent => (
                    <div
                      key={ent.id}
                      draggable="true"
                      onDragStart={(e) => handleDragStart(e, ent)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-lg border border-gray-200/60 shadow-sm p-3 hover-card cursor-grab active:cursor-grabbing ${
                        draggedId === ent.id ? 'opacity-30 scale-95' : ''
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <h4
                          onClick={() => openClientModal(ent)}
                          className="font-medium text-[13px] text-kano-blue cursor-pointer hover:underline leading-tight truncate"
                        >{ent.nom_entreprise}</h4>

                        {vue === 'commercial' && (() => {
                          const phase = ent.phase_production || 'v0_prod'
                          const label = PHASE_PRODUCTION_LABELS[phase]
                          if (!label) return null
                          return (
                            <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                              {label}
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}
