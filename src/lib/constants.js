// === FORMULES D'ABONNEMENT ===

export const FORMULES = {
  essentiel: { label: 'Essentiel', prix: 30 },
  serenite: { label: 'Sérénité', prix: 60 },
  kano_plus: { label: 'KANO+', prix: 100 },
  ecom_fondations: { label: 'E-com Fondations', prix: 60 },
  ecom_conquete: { label: 'E-com Conquête', prix: 120 },
  ecom_performances: { label: 'E-com Performances', prix: 200 }
}

export const FORMULE_LABELS = Object.fromEntries(
  Object.entries(FORMULES).map(([k, v]) => [k, v.label])
)

export const FORMULE_COLORS = {
  essentiel: 'bg-gray-100 text-gray-600',
  serenite: 'bg-gray-100 text-gray-600',
  kano_plus: 'bg-gray-100 text-gray-600',
  ecom_fondations: 'bg-gray-100 text-gray-600',
  ecom_conquete: 'bg-gray-100 text-gray-600',
  ecom_performances: 'bg-gray-100 text-gray-600'
}

// === PHASES DE VIE ===

export const PHASE_LABELS = {
  v0: 'V0',
  rdv: 'RDV',
  devis_envoye: 'Devis envoyé',
  negociation: 'Négociation',
  signe: 'Signé',
  refus: 'Refusé',
  prod: 'En ligne'
}

export const PHASE_COLORS = {
  v0: 'text-gray-500',
  rdv: 'text-gray-500',
  devis_envoye: 'text-gray-500',
  negociation: 'text-gray-500',
  signe: 'text-gray-700',
  refus: 'text-gray-400',
  prod: 'text-gray-700'
}

export const PHASE_COLORS_HEADER = {
  v0: 'bg-gray-100 text-gray-700',
  rdv: 'bg-gray-100 text-gray-700',
  devis_envoye: 'bg-gray-100 text-gray-700',
  negociation: 'bg-gray-100 text-gray-700',
  signe: 'bg-gray-100 text-gray-800',
  refus: 'bg-gray-100 text-gray-500',
  prod: 'bg-gray-100 text-gray-800'
}

// === STATUTS COMMERCIAUX ===

export const STATUT_ORDER = {
  client: 1,
  prospect: 2,
  suspect: 3,
  dead: 4
}

export const PHASE_ORDER_CLIENT = {
  prod: 1,
  signe: 2
}

export const PHASE_ORDER_PROSPECT = {
  v0: 1,
  devis_envoye: 2
}

export const PHASE_ORDER_SUSPECT = {
  v0: 1,
  rdv: 2
}

// === PIPELINE COMMERCIALE ===

export const COMMERCIAL_PHASE_GROUPS = {
  suspect: ['v0'],
  prospect: ['rdv', 'devis_envoye', 'negociation'],
  client: ['signe', 'prod'],
  archive: ['refus']
}

export const COMMERCIAL_DROP_STATUT = {
  suspect: 'suspect',
  prospect: 'prospect',
  client: 'client',
  archive: 'dead'
}

export const PIPELINE_COMMERCIAL = {
  colonnes: ['suspect', 'prospect', 'client'],
  labels: {
    suspect: 'Suspect',
    prospect: 'Prospect',
    client: 'Client',
    archive: 'Refusé / Archivé'
  },
  colors: {
    suspect: { header: 'bg-[#B0D0F0]/60 text-[#20416A] backdrop-blur-sm', border: 'border-[#B0D0F0]/60' },
    prospect: { header: 'bg-[#5A8ABF]/70 text-white backdrop-blur-sm', border: 'border-[#5A8ABF]/50' },
    client: { header: 'bg-[#20416A]/85 text-white backdrop-blur-sm', border: 'border-[#20416A]/40' },
    archive: { header: 'bg-gray-100/60 text-gray-400 backdrop-blur-sm', border: 'border-gray-200 border-dashed' }
  }
}

// === PIPELINE PRODUCTION ===

export const PHASE_PRODUCTION_LABELS = {
  v0_prod: 'V0',
  en_cours_prod: 'En cours de production',
  en_ligne: 'En ligne'
}

export const PIPELINE_PRODUCTION = {
  colonnes: ['v0_prod', 'en_cours_prod', 'en_ligne'],
  labels: PHASE_PRODUCTION_LABELS,
  colors: {
    v0_prod: { header: 'bg-[#F5E08A]/60 text-[#8B7A2B] backdrop-blur-sm', border: 'border-[#F5E08A]/60' },
    en_cours_prod: { header: 'bg-[#F0D060]/70 text-[#7A6820] backdrop-blur-sm', border: 'border-[#F0D060]/50' },
    en_ligne: { header: 'bg-[#B8962E]/85 text-white backdrop-blur-sm', border: 'border-[#B8962E]/40' }
  },
  field: 'phase_production'
}

// === PRIORITES DES TACHES ===

export const PRIORITE_LABELS = {
  urgente: 'Urgente',
  haute: 'Haute',
  moyenne: 'Moyenne',
  basse: 'Basse'
}

export const PRIORITE_COLORS = {
  urgente: 'bg-red-400',
  haute: 'bg-orange-400',
  moyenne: 'bg-gray-300',
  basse: 'bg-gray-200'
}

export const PRIORITE_POIDS = { urgente: 100, haute: 30, moyenne: 5, basse: 1 }

// Score de pertinence pour trier les tâches intelligemment
export function scoreTache(tache) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  let score = (PRIORITE_POIDS[tache.priorite] || 5) * 10

  if (tache.created_at) {
    const joursDepuisCreation = Math.floor((now - new Date(tache.created_at)) / 86400000)
    score += Math.min(joursDepuisCreation, 60)
  }

  if (tache.date_limite && tache.statut !== 'termine') {
    const joursRestants = Math.floor((new Date(tache.date_limite) - now) / 86400000)
    if (joursRestants < 0) {
      score += 200
    } else if (joursRestants <= 2) {
      score += 80
    } else if (joursRestants <= 7) {
      score += 40
    }
  }

  return score
}

// Seuils d'ancienneté pour les alertes visuelles (en jours)
export function ancienneteTache(tache) {
  if (!tache.created_at) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const jours = Math.floor((now - new Date(tache.created_at)) / 86400000)
  if (jours >= 14) return { label: `${jours}j`, classe: 'text-gray-400' }
  if (jours >= 7) return { label: `${jours}j`, classe: 'text-gray-400' }
  return null
}
