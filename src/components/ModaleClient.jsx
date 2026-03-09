import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { X, Plus, Edit2, Trash2, Archive, Mail, Phone, Check, Clock, MessageSquare, Send, Euro, CreditCard, ChevronDown, AlertTriangle } from 'lucide-react'
import FormProjet from './FormProjet'
import FormAbonnement from './FormAbonnement'
import ModaleProjet from './ModaleProjet'
import ModaleConfirm from './ModaleConfirm'
import UndoToast from './UndoToast'
import {
  PHASE_LABELS, PHASE_COLORS, PHASE_COLORS_HEADER,
  PHASE_PRODUCTION_LABELS,
  FORMULE_LABELS, FORMULE_COLORS,
  PRIORITE_COLORS, PRIORITE_LABELS, scoreTache
} from '../lib/constants'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { useUsers } from '../contexts/UsersContext'

export default function ModaleClient({ entreprise, onClose, onUpdate, defaultOnglet, defaultTacheId }) {
  const { userName } = useAuth()
  const { notify } = useNotification()
  const { utilisateurs: UTILISATEURS } = useUsers()
  const [onglet, setOnglet] = useState(defaultOnglet || 'projets')
  const [taches, setTaches] = useState([])
  const [historique, setHistorique] = useState([])
  const [showFormTache, setShowFormTache] = useState(false)
  const [tacheEnCours, setTacheEnCours] = useState(null)
  const [tacheVue, setTacheVue] = useState(null)

  useEffect(() => {
    if (defaultOnglet) setOnglet(defaultOnglet)
  }, [defaultOnglet])
  useEffect(() => {
    if (defaultTacheId) {
      supabase
        .from('taches')
        .select('*')
        .eq('id', defaultTacheId)
        .single()
        .then(({ data }) => {
          if (data) setTacheVue(data)
        })
    }
  }, [defaultTacheId])
  const [headerDeplie, setHeaderDeplie] = useState(false)
  const [animatingTacheId, setAnimatingTacheId] = useState(null)
  const [animTacheType, setAnimTacheType] = useState(null)
  const [undoToast, setUndoToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modeEdition, setModeEdition] = useState(false)
  const [entrepriseData, setEntrepriseData] = useState({
    secteur_activite: entreprise.secteur_activite || '',
    siret: entreprise.siret || '',
    adresse: entreprise.adresse || ''
  })

  const [contacts, setContacts] = useState(entreprise.contacts || [])
  const [showFormContact, setShowFormContact] = useState(false)
  const [contactEnCours, setContactEnCours] = useState(null)
  const [formContact, setFormContact] = useState({ prenom: '', nom: '', email: '', tel: '', contact_principal: false })

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

  const [showFormProjet, setShowFormProjet] = useState(false)
  const [projetEnCours, setProjetEnCours] = useState(null)
  const [projetSelectionne, setProjetSelectionne] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [formProjet, setFormProjet] = useState({
    nom_projet: '',
    type_projet: 'site_vitrine',
    type_projet_autre: '',
    montant_devis: '',
    numero_devis: '',
    date_signature: '',
    statut: 'en_attente',
    modalite_paiement: 'total_direct',
    acompte_pourcentage: 30,
    acompte_montant: '',
    date_acompte: '',
    solde_montant: '',
    date_solde: '',
    lissage_mois: 12,
    montant_lissage_mensuel: '',
    avec_abonnement: false,
    formule_abonnement: 'essentiel',
    tarif_abonnement: '',
    date_debut_abonnement: '',
    description: ''
  })

  const [showFormAbonnement, setShowFormAbonnement] = useState(false)
  const [abonnementEnCours, setAbonnementEnCours] = useState(null)

  const [showFormPaiement, setShowFormPaiement] = useState(false)
  const [projetEnCoursPaiement, setProjetEnCoursPaiement] = useState(null)
  const [formPaiement, setFormPaiement] = useState({
    montant: '',
    date_paiement: new Date().toISOString().slice(0, 10)
  })
  const [formAbonnement, setFormAbonnement] = useState({
    formule: 'essentiel',
    tarif_mensuel: '',
    date_debut: '',
    actif: true,
    description: ''
  })

  const [notes, setNotes] = useState([])
  const [noteEnEdition, setNoteEnEdition] = useState(null)
  const [formNote, setFormNote] = useState({
    type_interaction: 'appel',
    contenu: '',
    date_interaction: new Date().toISOString().slice(0, 10),
    projet_id: ''
  })
  const [showProposeTache, setShowProposeTache] = useState(false)
  const [formTacheSuiteNote, setFormTacheSuiteNote] = useState({
    titre: '',
    priorite: 'moyenne',
    assigne_a: null,
    date_limite: '',
    projet_id: ''
  })

  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    priorite: 'moyenne',
    assigne_a: null,
    date_limite: '',
    projet_id: null
  })

  useEffect(() => {
    if (entreprise) {
      fetchTaches()
      fetchHistorique()
      fetchNotes()
    }
  }, [entreprise])

  async function fetchTaches() {
    setLoading(true)
    const { data, error } = await supabase
      .from('taches')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTaches(data)
    }
    setLoading(false)
  }

  async function fetchHistorique() {
    const { data, error } = await supabase
      .from('historique')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) {
      setHistorique(data)
    }
  }

  async function fetchNotes() {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setNotes(data)
    }
  }

  function resetFormNote() {
    setFormNote({ type_interaction: 'appel', contenu: '', date_interaction: new Date().toISOString().slice(0, 10), projet_id: '' })
    setNoteEnEdition(null)
  }

  async function handleCreateNote() {
    if (!formNote.contenu.trim()) return

    const noteData = {
      entreprise_id: entreprise.id,
      type_interaction: formNote.type_interaction,
      contenu: formNote.contenu.trim(),
      date_interaction: formNote.date_interaction || null,
      projet_id: formNote.projet_id || null,
      utilisateur: userName
    }

    const { error } = await supabase
      .from('notes')
      .insert(noteData)

    if (error) {
      console.error('Erreur création note:', error)
      notify(`Erreur : ${error.message}`, 'error')
      return
    }

    const typeInteraction = formNote.type_interaction
    const projetId = formNote.projet_id
    const contenu = formNote.contenu

    resetFormNote()
    fetchNotes()

    await supabase.from('historique').insert({
      entreprise_id: entreprise.id,
      projet_id: projetId || null,
      type_action: 'creation',
      entite: 'note',
      description: `Note ajoutée : ${typeInteraction}`,
      utilisateur: userName
    })
    fetchHistorique()
    notify(`Note ajoutée — ${entreprise.nom_entreprise}`)

    // Proposer de créer une tâche suite à cette note
    setFormTacheSuiteNote({
      titre: contenu.slice(0, 80) + (contenu.length > 80 ? '...' : ''),
      priorite: 'moyenne',
      assigne_a: null,
      date_limite: '',
      projet_id: projetId || ''
    })
    setShowProposeTache(true)
  }

  async function handleCreateTacheSuiteNote() {
    if (!formTacheSuiteNote.titre.trim()) return

    const { data: newTache, error } = await supabase
      .from('taches')
      .insert({
        entreprise_id: entreprise.id,
        projet_id: formTacheSuiteNote.projet_id || null,
        titre: formTacheSuiteNote.titre.trim(),
        priorite: formTacheSuiteNote.priorite,
        assigne_a: formTacheSuiteNote.assigne_a || null,
        date_limite: formTacheSuiteNote.date_limite || null,
        statut: 'a_faire'
      })
      .select()
      .single()

    if (error) {
      notify(`Erreur : ${error.message}`, 'error')
      return
    }

    await supabase.from('historique').insert({
      entreprise_id: entreprise.id,
      projet_id: formTacheSuiteNote.projet_id || null,
      tache_id: newTache.id,
      type_action: 'creation',
      entite: 'tache',
      description: `Tâche créée suite à une note : "${formTacheSuiteNote.titre.slice(0, 60)}"`,
      utilisateur: userName
    })

    setShowProposeTache(false)
    fetchTaches()
    fetchHistorique()
    notify(`Tâche créée — ${entreprise.nom_entreprise}`)
    if (onUpdate) onUpdate()
  }

  async function handleUpdateNote() {
    if (!formNote.contenu.trim() || !noteEnEdition) return

    const { error } = await supabase
      .from('notes')
      .update({
        type_interaction: formNote.type_interaction,
        contenu: formNote.contenu,
        date_interaction: formNote.date_interaction || null,
        projet_id: formNote.projet_id || null
      })
      .eq('id', noteEnEdition.id)

    if (error) {
      notify(`Erreur : ${error.message}`, 'error')
      return
    }

    const contenu = formNote.contenu
    const projetId = formNote.projet_id

    resetFormNote()
    fetchNotes()
    notify(`Note modifiée — ${entreprise.nom_entreprise}`)

    // Proposer de créer une tâche suite à cette modification
    setFormTacheSuiteNote({
      titre: contenu.slice(0, 80) + (contenu.length > 80 ? '...' : ''),
      priorite: 'moyenne',
      assigne_a: null,
      date_limite: '',
      projet_id: projetId || ''
    })
    setShowProposeTache(true)
  }

  function openEditNote(note) {
    setNoteEnEdition(note)
    setFormNote({
      type_interaction: note.type_interaction || 'appel',
      contenu: note.contenu || '',
      date_interaction: note.date_interaction || '',
      projet_id: note.projet_id || ''
    })
  }

  async function handleDeleteNote(id) {
    setConfirmDialog({
      message: 'Supprimer cette note ?',
      onConfirm: async () => {
        await supabase.from('notes').delete().eq('id', id)
        await supabase.from('historique').insert({
          entreprise_id: entreprise.id,
          type_action: 'suppression',
          entite: 'note',
          description: 'Suppression d\'une note',
          utilisateur: userName
        })
        notify('Note supprimée', 'error')
        fetchNotes()
        setConfirmDialog(null)
      }
    })
  }


  async function handleCreateTache() {
    if (!formData.titre.trim()) {
      notify('Le titre est obligatoire', 'error')
      return
    }

    const insertData = {
      titre: formData.titre.trim(),
      description: formData.description || null,
      priorite: formData.priorite || 'moyenne',
      assigne_a: formData.assigne_a || null,
      date_limite: formData.date_limite || null,
      projet_id: formData.projet_id || null,
      entreprise_id: entreprise.id,
      statut: 'a_faire'
    }
    const { error } = await supabase
      .from('taches')
      .insert(insertData)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        type_action: 'creation',
        entite: 'tache',
        description: `Nouvelle tâche : "${insertData.titre}"`,
        utilisateur: userName
      })
      notify(`Tâche "${insertData.titre}" créée — ${entreprise.nom_entreprise}`)
      fetchTaches()
      resetForm()
      if (onUpdate) onUpdate()
    } else {
      notify('Erreur lors de la création : ' + error.message, 'error')
    }
  }

  async function handleUpdateTache() {
    if (!formData.titre.trim()) {
      notify('Le titre est obligatoire', 'error')
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
        date_limite: formData.date_limite || null,
        projet_id: formData.projet_id || null
      })
      .eq('id', tacheEnCours.id)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        tache_id: tacheEnCours.id,
        type_action: 'modification',
        entite: 'tache',
        description: `Tâche modifiée : "${formData.titre}"`,
        utilisateur: userName
      })
      fetchTaches()
      resetForm()
      if (onUpdate) onUpdate()
      notify(`Tâche modifiée — ${entreprise.nom_entreprise}`)
    } else {
      console.error('Erreur modification tâche:', error)
      notify('Erreur lors de la modification', 'error')
    }
  }

  async function handleSaveEntreprise() {
    const { error } = await supabase
      .from('entreprises')
      .update(entrepriseData)
      .eq('id', entreprise.id)

    if (!error) {
      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        type_action: 'modification',
        entite: 'entreprise',
        description: `Modification des informations de ${entreprise.nom_entreprise}`,
        utilisateur: userName,
        ancien_valeur: {
          secteur_activite: entreprise.secteur_activite,
          siret: entreprise.siret,
          adresse: entreprise.adresse
        },
        nouvelle_valeur: entrepriseData
      })

      setModeEdition(false)
      if (onUpdate) onUpdate()
      notify(`${entreprise.nom_entreprise} — infos mises à jour`)
    } else {
      console.error('Erreur:', error)
      notify('Erreur lors de la mise à jour', 'error')
    }
  }

  async function handleDeleteEntreprise() {
    setConfirmDialog({
      message: `Supprimer définitivement "${entreprise.nom_entreprise}" et toutes ses données (contacts, projets, tâches, abonnements, notes, historique) ?`,
      onConfirm: async () => {
        setConfirmDialog(null)
        // Supprimer les données liées dans l'ordre
        await supabase.from('historique').delete().eq('entreprise_id', entreprise.id)
        await supabase.from('notes').delete().eq('entreprise_id', entreprise.id)
        await supabase.from('taches').delete().eq('entreprise_id', entreprise.id)
        await supabase.from('abonnements').delete().eq('entreprise_id', entreprise.id)
        await supabase.from('projets').delete().eq('entreprise_id', entreprise.id)
        await supabase.from('contacts').delete().eq('entreprise_id', entreprise.id)
        const { error } = await supabase.from('entreprises').delete().eq('id', entreprise.id)

        if (!error) {
          notify(`"${entreprise.nom_entreprise}" supprimé`, 'error')
          onClose()
          if (onUpdate) onUpdate()
        } else {
          notify('Erreur lors de la suppression', 'error')
        }
      }
    })
  }

  function openEditContact(contact) {
    setContactEnCours(contact)
    setFormContact({ prenom: contact.prenom || '', nom: contact.nom || '', email: contact.email || '', tel: contact.tel || '', contact_principal: contact.contact_principal || false })
    setShowFormContact(true)
  }

  function openNewContact() {
    setContactEnCours(null)
    setFormContact({ prenom: '', nom: '', email: '', tel: '', contact_principal: false })
    setShowFormContact(true)
  }

  async function handleSaveContact() {
    if (!formContact.prenom.trim() && !formContact.nom.trim()) return
    if (contactEnCours) {
      const { error } = await supabase.from('contacts').update(formContact).eq('id', contactEnCours.id)
      if (!error) {
        setContacts(prev => prev.map(c => c.id === contactEnCours.id ? { ...c, ...formContact } : c))
        await supabase.from('historique').insert({ entreprise_id: entreprise.id, type_action: 'modification', entite: 'contact', description: `Contact "${formContact.prenom} ${formContact.nom}" modifié`, utilisateur: userName })
        notify(`Contact "${formContact.prenom} ${formContact.nom}" modifié`)
        if (onUpdate) onUpdate()
      }
    } else {
      const { data, error } = await supabase.from('contacts').insert({ ...formContact, entreprise_id: entreprise.id }).select().single()
      if (!error && data) {
        setContacts(prev => [...prev, data])
        await supabase.from('historique').insert({ entreprise_id: entreprise.id, type_action: 'creation', entite: 'contact', description: `Nouveau contact : "${formContact.prenom} ${formContact.nom}"`, utilisateur: userName })
        notify(`Contact "${formContact.prenom} ${formContact.nom}" ajouté`)
        if (onUpdate) onUpdate()
      }
    }
    setShowFormContact(false)
    setContactEnCours(null)
  }

  async function handleDeleteContact(contact) {
    setConfirmDialog({
      message: `Supprimer le contact ${contact.prenom} ${contact.nom} ?`,
      onConfirm: async () => {
        const { error } = await supabase.from('contacts').delete().eq('id', contact.id)
        if (!error) {
          setContacts(prev => prev.filter(c => c.id !== contact.id))
          await supabase.from('historique').insert({ entreprise_id: entreprise.id, type_action: 'suppression', entite: 'contact', description: `Contact "${contact.prenom} ${contact.nom}" supprimé`, utilisateur: userName })
          notify(`Contact "${contact.prenom} ${contact.nom}" supprimé`, 'error')
          if (onUpdate) onUpdate()
        }
        setConfirmDialog(null)
      }
    })
  }

  async function handleSaveProjet(projetData) {
    if (projetData.id) {
      const { error } = await supabase
        .from('projets')
        .update(projetData)
        .eq('id', projetData.id)

      if (!error) {
        await supabase.from('historique').insert({
          entreprise_id: entreprise.id,
          projet_id: projetData.id,
          type_action: 'modification',
          entite: 'projet',
          description: `Modification du projet ${projetData.nom_projet}`,
          utilisateur: userName
        })

        setShowFormProjet(false)
        setProjetEnCours(null)
        if (onUpdate) onUpdate()
        notify(`Projet "${projetData.nom_projet}" mis à jour — ${entreprise.nom_entreprise}`)
      } else {
        console.error('Erreur:', error)
        notify('Erreur lors de la mise à jour', 'error')
      }
    } else {
      const { data: newProjet, error: errorProjet } = await supabase
        .from('projets')
        .insert(projetData)
        .select()
        .single()

      if (!errorProjet && newProjet) {
        await supabase.from('historique').insert({
          entreprise_id: entreprise.id,
          projet_id: newProjet.id,
          type_action: 'creation',
          entite: 'projet',
          description: `Création du projet ${projetData.nom_projet}`,
          utilisateur: userName
        })

        if (projetData.avec_abonnement) {
          const { data: newAbo, error: errorAbo } = await supabase
            .from('abonnements')
            .insert({
              entreprise_id: entreprise.id,
              projet_id: newProjet.id,
              formule: projetData.formule_abonnement,
              tarif_mensuel: projetData.tarif_abonnement,
              date_debut: projetData.date_debut_abonnement,
              actif: true
            })
            .select()
            .single()

          if (!errorAbo && newAbo) {
            await supabase.from('historique').insert({
              entreprise_id: entreprise.id,
              projet_id: newProjet.id,
              abonnement_id: newAbo.id,
              type_action: 'creation',
              entite: 'abonnement',
              description: `Création de l'abonnement ${FORMULE_LABELS[projetData.formule_abonnement]} (${projetData.tarif_abonnement}€/mois)`,
              utilisateur: userName
            })
          }
        }

        setShowFormProjet(false)
        if (onUpdate) onUpdate()
        notify(`Projet "${projetData.nom_projet}" créé — ${entreprise.nom_entreprise}`)
      } else {
        console.error('Erreur:', errorProjet)
        notify('Erreur lors de la création', 'error')
      }
    }
  }

  async function handleSaveAbonnement(aboData) {
    if (aboData.id) {
      const ancienAbo = entreprise.abonnements?.find(a => a.id === aboData.id)

      const cleanData = {
        formule: aboData.formule,
        tarif_mensuel: parseFloat(aboData.tarif_mensuel) || 0,
        actif: aboData.actif,
        date_debut: aboData.date_debut || null
      }

      const { error } = await supabase
        .from('abonnements')
        .update(cleanData)
        .eq('id', aboData.id)

      if (!error) {
        const changements = []
        if (ancienAbo?.tarif_mensuel !== cleanData.tarif_mensuel) {
          changements.push(`tarif ${ancienAbo?.tarif_mensuel}€ → ${cleanData.tarif_mensuel}€`)
        }
        if (ancienAbo?.actif !== cleanData.actif) {
          changements.push(cleanData.actif ? 'réactivé' : 'suspendu')
        }

        await supabase.from('historique').insert({
          entreprise_id: entreprise.id,
          abonnement_id: aboData.id,
          type_action: 'modification',
          entite: 'abonnement',
          description: `Modification de l'abonnement ${FORMULE_LABELS[cleanData.formule]} (${changements.join(', ')})`,
          utilisateur: userName,
          ancien_valeur: ancienAbo,
          nouvelle_valeur: cleanData
        })

        setShowFormAbonnement(false)
        setAbonnementEnCours(null)
        if (onUpdate) onUpdate()
        notify(`Abonnement mis à jour — ${entreprise.nom_entreprise}`)
      } else {
        console.error('Erreur Supabase:', error)
        notify(`Erreur : ${error.message}`, 'error')
      }
    } else {
      const cleanData = {
        entreprise_id: aboData.entreprise_id,
        formule: aboData.formule,
        tarif_mensuel: parseFloat(aboData.tarif_mensuel) || 0,
        actif: aboData.actif !== false,
        date_debut: aboData.date_debut || null
      }

      const { data: newAbo, error } = await supabase
        .from('abonnements')
        .insert(cleanData)
        .select()
        .single()

      if (!error && newAbo) {
        await supabase.from('historique').insert({
          entreprise_id: entreprise.id,
          abonnement_id: newAbo.id,
          type_action: 'creation',
          entite: 'abonnement',
          description: `Création de l'abonnement ${FORMULE_LABELS[cleanData.formule]} (${cleanData.tarif_mensuel}€/mois)`,
          utilisateur: userName
        })

        setShowFormAbonnement(false)
        if (onUpdate) onUpdate()
        notify(`Abonnement créé — ${entreprise.nom_entreprise}`)
      } else {
        console.error('Erreur Supabase:', error)
        notify(`Erreur : ${error.message}`, 'error')
      }
    }
  }

  async function handleEnregistrerPaiement() {
    if (!formPaiement.montant || parseFloat(formPaiement.montant) <= 0) {
      notify('Le montant est obligatoire', 'error')
      return
    }

    const nouveauMontantPaye = (parseFloat(projetEnCoursPaiement.montant_paye) || 0) + parseFloat(formPaiement.montant)

    const { error } = await supabase
      .from('projets')
      .update({ montant_paye: nouveauMontantPaye })
      .eq('id', projetEnCoursPaiement.id)

    if (!error) {
      const datePaiementFormatted = new Date(formPaiement.date_paiement).toLocaleDateString('fr-FR')
      await supabase.from('historique').insert({
        entreprise_id: entreprise.id,
        projet_id: projetEnCoursPaiement.id,
        type_action: 'paiement',
        entite: 'projet',
        description: `Paiement de ${formPaiement.montant} € le ${datePaiementFormatted} pour "${projetEnCoursPaiement.nom_projet}"`,
        utilisateur: userName
      })

      setShowFormPaiement(false)
      setProjetEnCoursPaiement(null)
      setFormPaiement({ montant: '', date_paiement: new Date().toISOString().slice(0, 10) })
      fetchHistorique()
      if (onUpdate) onUpdate()
      notify(`Paiement de ${formPaiement.montant} € enregistré — ${entreprise.nom_entreprise} / ${projetEnCoursPaiement.nom_projet}`)
    } else {
      console.error('Erreur:', error)
      notify('Erreur lors de l\'enregistrement', 'error')
    }
  }

  async function handleDeleteProjet(id) {
    const projet = entreprise.projets?.find(p => p.id === id)
    setConfirmDialog({
      message: `Supprimer le projet "${projet?.nom_projet}" ? Les abonnements associés seront conservés.`,
      onConfirm: async () => {
        const { error } = await supabase
          .from('projets')
          .delete()
          .eq('id', id)

        if (!error) {
          await supabase.from('historique').insert({
            entreprise_id: entreprise.id,
            type_action: 'suppression',
            entite: 'projet',
            description: `Suppression du projet ${projet?.nom_projet}`,
            utilisateur: userName
          })

          if (onUpdate) onUpdate()
          notify(`Projet "${projet?.nom_projet}" supprimé — ${entreprise.nom_entreprise}`)
        } else {
          console.error('Erreur:', error)
          notify('Erreur lors de la suppression', 'error')
        }
        setConfirmDialog(null)
      }
    })
  }

  async function handleDeleteAbonnement(id) {
    const abo = entreprise.abonnements?.find(a => a.id === id)
    setConfirmDialog({
      message: `Supprimer l'abonnement ${FORMULE_LABELS[abo?.formule]} ?`,
      onConfirm: async () => {
        const { error } = await supabase
          .from('abonnements')
          .delete()
          .eq('id', id)

        if (!error) {
          await supabase.from('historique').insert({
            entreprise_id: entreprise.id,
            type_action: 'suppression',
            entite: 'abonnement',
            description: `Suppression de l'abonnement ${FORMULE_LABELS[abo?.formule]}`,
            utilisateur: userName
          })

          if (onUpdate) onUpdate()
          notify(`Abonnement supprimé — ${entreprise.nom_entreprise}`)
        } else {
          console.error('Erreur:', error)
          notify('Erreur lors de la suppression', 'error')
        }
        setConfirmDialog(null)
      }
    })
  }

  async function handleToggleTache(tache) {
    if (animatingTacheId) return
    const newStatut = tache.statut === 'termine' ? 'a_faire' : 'termine'
    const type = newStatut === 'termine' ? 'complete' : 'reopen'
    const updateData = { statut: newStatut }
    if (newStatut === 'termine') {
      updateData.termine_par = userName
      updateData.date_completion = new Date().toISOString()
    } else {
      updateData.termine_par = null
      updateData.date_completion = null
    }

    setAnimatingTacheId(tache.id)
    setAnimTacheType(type)

    const { error } = await supabase
      .from('taches')
      .update(updateData)
      .eq('id', tache.id)

    if (!error) {
      supabase.from('historique').insert({
        entreprise_id: tache.entreprise_id,
        projet_id: tache.projet_id,
        tache_id: tache.id,
        type_action: newStatut === 'termine' ? 'completion' : 'modification',
        entite: 'tache',
        description: newStatut === 'termine'
          ? `Tâche "${tache.titre}" terminée`
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
        if (onUpdate) onUpdate()
      }, type === 'complete' ? 1000 : 500)

      if (type === 'complete') {
        notify(`"${tache.titre}" terminée`)
        setUndoToast({ key: Date.now(), message: `"${tache.titre}" terminée`, tacheId: tache.id })
      }
    } else {
      setAnimatingTacheId(null)
      setAnimTacheType(null)
    }
  }

  async function handleDeleteTache(id) {
    const tache = taches.find(t => t.id === id)
    setConfirmDialog({
      message: `Supprimer la tâche "${tache?.titre}" ?`,
      onConfirm: () => {
        setConfirmDialog(null)
        setAnimatingTacheId(id)
        setAnimTacheType('delete')

        setTimeout(() => {
          setTaches(prev => prev.filter(t => t.id !== id))
          setAnimatingTacheId(null)
          setAnimTacheType(null)

          setUndoToast({
            key: Date.now(),
            message: `"${tache?.titre}" supprimée`,
            tacheId: id,
            isDelete: true,
            tacheData: tache
          })
        }, 1000)
      }
    })
  }

  async function commitDeleteTache(tacheId, tacheData) {
    await supabase.from('taches').delete().eq('id', tacheId)
    await supabase.from('historique').insert({
      entreprise_id: entreprise.id,
      tache_id: tacheId,
      type_action: 'suppression',
      entite: 'tache',
      description: `Suppression de la tâche "${tacheData?.titre}"`,
      utilisateur: userName
    })
    notify(`Tâche "${tacheData?.titre}" supprimée`, 'error')
    if (onUpdate) onUpdate()
  }

  async function undoDeleteTache(tacheData) {
    setTaches(prev => [...prev, tacheData])
  }

  function resetForm() {
    setFormData({
      titre: '',
      description: '',
      priorite: 'moyenne',
      assigne_a: null,
      date_limite: '',
      projet_id: null
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
      projet_id: tache.projet_id
    })
    setShowFormTache(true)
  }

  const contactPrincipal = entreprise.contacts?.find(c => c.contact_principal)
  const abonnementsActifs = entreprise.abonnements?.filter(a => a.actif) || []

  const calculerCATotal = () => {
    let caTotal = entreprise.ca_total_genere || 0

    abonnementsActifs.forEach(abo => {
      if (abo.date_debut) {
        const dateDebut = new Date(abo.date_debut)
        const aujourdhui = new Date()
        const diffMois = (aujourdhui.getFullYear() - dateDebut.getFullYear()) * 12 + (aujourdhui.getMonth() - dateDebut.getMonth())

        if (diffMois > 0) {
          const caAbonnement = diffMois * (abo.tarif_mensuel || 0)
          caTotal += caAbonnement
        }
      }
    })

    return caTotal
  }

  const caTotal = calculerCATotal()

  const tachesAFaire = taches.filter(t => t.statut !== 'termine').sort((a, b) => scoreTache(b) - scoreTache(a))
  const tachesTerminees = taches.filter(t => t.statut === 'termine')

  return (
    <>
    <div
      className="fixed inset-0 glass-overlay z-[60] flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full h-[95vh] sm:h-[88vh] max-w-[1400px] overflow-hidden flex flex-col shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-kano-blue text-white p-3 sm:p-5 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="sm:hidden" /><X size={24} className="hidden sm:block" />
          </button>

          {/* Mobile : header compact */}
          <div className="sm:hidden pr-10">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{entreprise.nom_entreprise}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-white/60 uppercase">{entreprise.statut_commercial}</span>
                  <span className="text-[11px] text-white/40">{PHASE_LABELS[entreprise.phase_vie]}</span>
                  {entreprise.phase_production && (
                    <span className="text-[11px] text-white/40">· {PHASE_PRODUCTION_LABELS[entreprise.phase_production]}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setModeEdition(true); setHeaderDeplie(true) }}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                >
                  <Edit2 size={14} className="text-white/50" />
                </button>
                <button
                  onClick={handleDeleteEntreprise}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                >
                  <Trash2 size={14} className="text-red-300/60" />
                </button>
                <button
                  onClick={() => setHeaderDeplie(!headerDeplie)}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                >
                  <ChevronDown size={14} className={`text-white/50 transition-transform duration-200 ${headerDeplie ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Contenu déplié en mobile */}
            {headerDeplie && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-3 text-sm">
                {modeEdition && (
                  <div className="space-y-2">
                    <div>
                      <div className="text-white/40 text-[10px] uppercase mb-1">Secteur</div>
                      <input type="text" value={entrepriseData.secteur_activite} onChange={(e) => setEntrepriseData({...entrepriseData, secteur_activite: e.target.value})} className="w-full px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" placeholder="Secteur" />
                    </div>
                    <div>
                      <div className="text-white/40 text-[10px] uppercase mb-1">SIRET</div>
                      <input type="text" value={entrepriseData.siret} onChange={(e) => setEntrepriseData({...entrepriseData, siret: e.target.value})} className="w-full px-2 py-1 bg-white/20 border border-white/30 rounded text-sm font-mono" placeholder="SIRET" />
                    </div>
                    <div>
                      <div className="text-white/40 text-[10px] uppercase mb-1">Adresse</div>
                      <input type="text" value={entrepriseData.adresse} onChange={(e) => setEntrepriseData({...entrepriseData, adresse: e.target.value})} className="w-full px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" placeholder="Adresse" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setModeEdition(false); setEntrepriseData({ secteur_activite: entreprise.secteur_activite || '', siret: entreprise.siret || '', adresse: entreprise.adresse || '' }) }} className="px-3 py-1 text-white/50 hover:text-white/70 text-sm">Annuler</button>
                      <button onClick={handleSaveEntreprise} className="px-3 py-1 bg-white/20 text-white rounded text-sm font-medium hover:bg-white/30">Enregistrer</button>
                    </div>
                  </div>
                )}
                {!modeEdition && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-white/40 text-[10px] uppercase mb-0.5">Secteur</div>
                        <div className="font-medium text-xs">{entreprise.secteur_activite || '-'}</div>
                      </div>
                      <div>
                        <div className="text-white/40 text-[10px] uppercase mb-0.5">SIRET</div>
                        <div className="font-medium font-mono text-xs">{entreprise.siret || '-'}</div>
                      </div>
                    </div>
                    {entreprise.adresse && (
                      <div>
                        <div className="text-white/40 text-[10px] uppercase mb-0.5">Adresse</div>
                        <div className="font-medium text-xs">{entreprise.adresse}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                      <div>
                        <div className="text-white/40 text-[10px] uppercase mb-0.5">Abonnement</div>
                        {abonnementsActifs.length > 0 ? abonnementsActifs.map(abo => (
                          <div key={abo.id} className="text-xs">{FORMULE_LABELS[abo.formule]} — {abo.tarif_mensuel}€/mois</div>
                        )) : <span className="text-white/50 text-xs">Aucun</span>}
                      </div>
                      <div>
                        <div className="text-white/40 text-[10px] uppercase mb-0.5">CA total</div>
                        <div className="font-medium">{caTotal.toFixed(0)}€</div>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-white/40 text-[10px] uppercase">Contacts ({contacts.length})</div>
                        <button onClick={openNewContact} className="text-white/40 hover:text-white/70"><Plus size={12} /></button>
                      </div>
                      {contacts.length > 0 ? contacts.map(contact => (
                        <div key={contact.id} className="text-xs mb-1 flex items-center gap-2">
                          <span className="font-medium">{contact.prenom} {contact.nom}</span>
                          {contact.email && <span className="text-white/60">{contact.email}</span>}
                          <button onClick={() => openEditContact(contact)} className="p-0.5"><Edit2 size={10} className="text-white/40" /></button>
                          <button onClick={() => handleDeleteContact(contact)} className="p-0.5"><Trash2 size={10} className="text-white/40" /></button>
                        </div>
                      )) : <span className="text-white/50 text-xs">Aucun contact</span>}
                      {showFormContact && (
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={formContact.prenom} onChange={e => setFormContact({...formContact, prenom: e.target.value})} placeholder="Prénom" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                            <input type="text" value={formContact.nom} onChange={e => setFormContact({...formContact, nom: e.target.value})} placeholder="Nom" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="email" value={formContact.email} onChange={e => setFormContact({...formContact, email: e.target.value})} placeholder="Email" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                            <input type="text" value={formContact.tel} onChange={e => setFormContact({...formContact, tel: e.target.value})} placeholder="Téléphone" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                          </div>
                          <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                            <input type="checkbox" checked={formContact.contact_principal} onChange={e => setFormContact({...formContact, contact_principal: e.target.checked})} className="rounded" />
                            Contact principal
                          </label>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setShowFormContact(false); setContactEnCours(null) }} className="px-2 py-1 text-white/50 text-xs">Annuler</button>
                            <button onClick={handleSaveContact} disabled={!formContact.prenom.trim() && !formContact.nom.trim()} className="px-2 py-1 bg-white/20 text-white rounded text-xs disabled:opacity-40">{contactEnCours ? 'Modifier' : 'Ajouter'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Desktop : header complet (inchangé) */}
          <div className="hidden sm:block pr-12">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold">{entreprise.nom_entreprise}</h2>
              <span className="text-xs text-white/60 uppercase tracking-wider">
                {entreprise.statut_commercial?.toUpperCase()}
              </span>
              <span className="text-xs text-white/50">
                {PHASE_LABELS[entreprise.phase_vie]}
              </span>

              {!modeEdition ? (
                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => setModeEdition(true)}
                    className="text-xs text-white/50 hover:text-white/70 transition-colors"
                  >
                    Modifier les infos
                  </button>
                  <button
                    onClick={handleDeleteEntreprise}
                    className="text-xs text-red-300/60 hover:text-red-300 transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              ) : (
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={handleSaveEntreprise}
                    className="px-3 py-1 bg-gray-800 text-white rounded text-sm font-medium transition-colors hover:bg-gray-700"
                  >
                    Enregistrer
                  </button>
                  <button
                    onClick={() => {
                      setModeEdition(false)
                      setEntrepriseData({
                        secteur_activite: entreprise.secteur_activite || '',
                        siret: entreprise.siret || '',
                        adresse: entreprise.adresse || ''
                      })
                    }}
                    className="px-3 py-1 text-white/50 hover:text-white/70 rounded text-sm transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-white/40 text-[10px] uppercase mb-1">Secteur</div>
                {modeEdition ? (
                  <input
                    type="text"
                    value={entrepriseData.secteur_activite}
                    onChange={(e) => setEntrepriseData({...entrepriseData, secteur_activite: e.target.value})}
                    className="w-full px-2 py-1 bg-white/20 border border-white/30 rounded text-sm"
                    placeholder="Ex: Bâtiment"
                  />
                ) : (
                  <div className="text-sm">{entreprise.secteur_activite || '-'}</div>
                )}
              </div>

              <div>
                <div className="text-white/40 text-[10px] uppercase mb-1">SIRET</div>
                {modeEdition ? (
                  <input
                    type="text"
                    value={entrepriseData.siret}
                    onChange={(e) => setEntrepriseData({...entrepriseData, siret: e.target.value})}
                    className="w-full px-2 py-1 bg-white/20 border border-white/30 rounded text-sm"
                    placeholder="Ex: 12345678901234"
                  />
                ) : (
                  <div className="text-sm">{entreprise.siret || '-'}</div>
                )}
              </div>

              <div className="md:col-span-2">
                <div className="text-white/40 text-[10px] uppercase mb-1">Adresse</div>
                {modeEdition ? (
                  <input
                    type="text"
                    value={entrepriseData.adresse}
                    onChange={(e) => setEntrepriseData({...entrepriseData, adresse: e.target.value})}
                    className="w-full px-2 py-1 bg-white/20 border border-white/30 rounded text-sm"
                    placeholder="Ex: 1 rue de la Paix, 75001 Paris"
                  />
                ) : (
                  <div className="text-sm">{entreprise.adresse || '-'}</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-white/10">
              <div>
                <div className="text-white/40 text-[10px] uppercase mb-1">Abonnement actif</div>
                {abonnementsActifs.length > 0 ? (
                  abonnementsActifs.map(abo => {
                    const dateDebut = abo.date_debut ? new Date(abo.date_debut) : null
                    return (
                      <div key={abo.id}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-white/60">
                            {FORMULE_LABELS[abo.formule]}
                          </span>
                          <span className="font-medium text-white">{abo.tarif_mensuel}€/mois</span>
                        </div>
                        {dateDebut && (
                          <div className="text-xs text-white/40">
                            Depuis le {dateDebut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <span className="text-white/50 text-sm">Aucun</span>
                )}
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-white/40 text-[10px] uppercase">Contacts ({contacts.length})</div>
                  <button onClick={openNewContact} className="text-white/40 hover:text-white/70 transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                {contacts.length > 0 ? (
                  <div className="space-y-2">
                    {contacts.map(contact => (
                      <div key={contact.id} className="text-xs group flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            {contact.prenom} {contact.nom}
                            {contact.contact_principal && (
                              <span className="text-[9px] text-white/50 uppercase">PRINCIPAL</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1 text-white/70">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="hover:text-white hover:underline flex items-center gap-1">
                                <Mail size={10} /> {contact.email}
                              </a>
                            )}
                            {contact.tel && (
                              <a href={`tel:${contact.tel}`} className="hover:text-white hover:underline flex items-center gap-1">
                                <Phone size={10} /> {contact.tel}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => openEditContact(contact)} className="p-1 hover:bg-white/10 rounded">
                            <Edit2 size={11} className="text-white/50" />
                          </button>
                          <button onClick={() => handleDeleteContact(contact)} className="p-1 hover:bg-white/10 rounded">
                            <Trash2 size={11} className="text-white/50" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-white/50 text-sm">Aucun contact</span>
                )}

                {/* Formulaire contact */}
                {showFormContact && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={formContact.prenom} onChange={e => setFormContact({...formContact, prenom: e.target.value})} placeholder="Prénom" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                      <input type="text" value={formContact.nom} onChange={e => setFormContact({...formContact, nom: e.target.value})} placeholder="Nom" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="email" value={formContact.email} onChange={e => setFormContact({...formContact, email: e.target.value})} placeholder="Email" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                      <input type="text" value={formContact.tel} onChange={e => setFormContact({...formContact, tel: e.target.value})} placeholder="Téléphone" className="px-2 py-1 bg-white/20 border border-white/30 rounded text-sm" />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                      <input type="checkbox" checked={formContact.contact_principal} onChange={e => setFormContact({...formContact, contact_principal: e.target.checked})} className="rounded" />
                      Contact principal
                    </label>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setShowFormContact(false); setContactEnCours(null) }} className="px-3 py-1 text-white/50 hover:text-white/70 text-sm">Annuler</button>
                      <button onClick={handleSaveContact} disabled={!formContact.prenom.trim() && !formContact.nom.trim()} className="px-3 py-1 bg-white/20 text-white rounded text-sm font-medium hover:bg-white/30 disabled:opacity-40">{contactEnCours ? 'Modifier' : 'Ajouter'}</button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-white/40 text-[10px] uppercase mb-1">CA total généré</div>
                <div className="text-xl font-medium text-white">{caTotal.toFixed(0)}€</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-gray-200 px-4 sm:px-6 overflow-x-auto scrollbar-thin">
            <div className="flex items-center gap-1 sm:gap-2 min-w-max">
              <button
                onClick={() => setOnglet('projets')}
                className={`px-2.5 sm:px-4 py-3 text-sm sm:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${
                  onglet === 'projets'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Projets ({entreprise.projets?.length || 0})
              </button>
              <button
                onClick={() => setOnglet('taches')}
                className={`px-2.5 sm:px-4 py-3 text-sm sm:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${
                  onglet === 'taches'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Tâches ({tachesAFaire.length})
              </button>
              <button
                onClick={() => setOnglet('finances')}
                className={`px-2.5 sm:px-4 py-3 text-sm sm:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${
                  onglet === 'finances'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Finances
              </button>
              <button
                onClick={() => setOnglet('journal')}
                className={`px-2.5 sm:px-4 py-3 text-sm sm:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${
                  onglet === 'journal'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Journal
              </button>
              <button
                onClick={() => setOnglet('historique')}
                className={`px-2.5 sm:px-4 py-3 text-sm sm:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${
                  onglet === 'historique'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Historique
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {onglet === 'projets' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-700">Gestion des projets</h3>
                  <button
                    onClick={() => {
                      setProjetEnCours(null)
                      setShowFormProjet(true)
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-kano-blue text-white rounded-lg hover:bg-kano-blue/90 text-sm font-medium"
                  >
                    <Plus size={16} />
                    Nouveau projet
                  </button>
                </div>

                {entreprise.projets?.length > 0 ? (
                  <div className="space-y-3">
                    {entreprise.projets.map(projet => {
                      const tachesProjet = taches.filter(t => t.projet_id === projet.id)
                      const tachesAFaire = tachesProjet.filter(t => t.statut !== 'termine')
                      const tachesTerminees = tachesProjet.filter(t => t.statut === 'termine')

                      const parPrio = {
                        urgente: tachesAFaire.filter(t => getPrioriteEffective(t) === 'urgente'),
                        haute: tachesAFaire.filter(t => getPrioriteEffective(t) === 'haute'),
                        moyenne: tachesAFaire.filter(t => getPrioriteEffective(t) === 'moyenne'),
                        basse: tachesAFaire.filter(t => getPrioriteEffective(t) === 'basse')
                      }

                      return (
                        <div
                          key={projet.id}
                          onClick={() => setProjetSelectionne(projet)}
                          className="p-4 border border-gray-200/60 shadow-sm rounded-lg hover-card cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <h4 className="font-medium text-kano-blue">{projet.nom_projet}</h4>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setProjetEnCours(projet); setShowFormProjet(true) }}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                  title="Modifier le projet"
                                >
                                  <Edit2 size={15} />
                                </button>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {[
                                  { key: 'urgente', label: 'urgente', labelPlural: 'urgentes', dot: 'bg-red-500' },
                                  { key: 'haute', label: 'haute', labelPlural: 'hautes', dot: 'bg-orange-500' },
                                  { key: 'moyenne', label: 'moyenne', labelPlural: 'moyennes', dot: 'bg-yellow-500' },
                                  { key: 'basse', label: 'basse', labelPlural: 'basses', dot: 'bg-gray-400' }
                                ].map(({ key, label, labelPlural, dot }) => {
                                  const liste = parPrio[key]
                                  if (liste.length === 0) return null
                                  const enRetard = liste.filter(t => getJoursRetard(t) > 0)
                                  const maxRetard = enRetard.length > 0 ? Math.max(...enRetard.map(t => getJoursRetard(t))) : 0
                                  return (
                                    <span key={key} className="text-xs text-gray-500 flex items-center gap-1">
                                      <span className={`w-[6px] h-[6px] ${dot} rounded-full`}></span>
                                      {liste.length} {liste.length === 1 ? label : labelPlural}
                                      {enRetard.length > 0 && (
                                        <span className="text-red-500 font-medium">
                                          dont {enRetard.length} en retard ({maxRetard}j)
                                        </span>
                                      )}
                                    </span>
                                  )
                                })}

                                {tachesAFaire.length === 0 && tachesTerminees.length === 0 && (
                                  <span className="text-xs text-gray-400">
                                    Aucune tâche
                                  </span>
                                )}

                                {tachesTerminees.length > 0 && (
                                  <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Check size={12} />
                                    {tachesTerminees.length} {tachesTerminees.length === 1 ? 'terminée' : 'terminées'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                    Aucun projet. Créez-en un pour commencer !
                  </div>
                )}
              </div>
            )}

            {onglet === 'taches' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-700">Tâches</h3>
                  <button
                    onClick={() => { resetForm(); setShowFormTache(true) }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-kano-blue text-white rounded-lg hover:bg-kano-blue/90 text-sm font-medium"
                  >
                    <Plus size={16} />
                    Nouvelle tâche
                  </button>
                </div>

                {showFormTache && !tacheEnCours && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <input
                      type="text"
                      placeholder="Titre de la tâche"
                      value={formData.titre}
                      onChange={e => setFormData({ ...formData, titre: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      autoFocus
                    />
                    <textarea
                      placeholder="Description (optionnel)"
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      rows={2}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Priorité</label>
                        <select
                          value={formData.priorite}
                          onChange={e => setFormData({ ...formData, priorite: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                          {Object.entries(PRIORITE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Assigné à</label>
                        <select
                          value={formData.assigne_a || ''}
                          onChange={e => setFormData({ ...formData, assigne_a: e.target.value || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                          <option value="">Non assigné</option>
                          {UTILISATEURS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Date limite</label>
                        <input
                          type="date"
                          value={formData.date_limite}
                          onChange={e => setFormData({ ...formData, date_limite: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                        />
                      </div>
                    </div>
                    {entreprise.projets?.length > 0 && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Projet (optionnel)</label>
                        <select
                          value={formData.projet_id || ''}
                          onChange={e => setFormData({ ...formData, projet_id: e.target.value || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                          <option value="">Aucun projet</option>
                          {entreprise.projets.map(p => (
                            <option key={p.id} value={p.id}>{p.nom_projet}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button onClick={resetForm} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                      <button
                        onClick={handleCreateTache}
                        className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700"
                      >
                        Créer
                      </button>
                    </div>
                  </div>
                )}

                {tachesAFaire.length === 0 && tachesTerminees.length === 0 && !showFormTache && (
                  <p className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                    Aucune tâche. Créez-en une !
                  </p>
                )}

                {tachesAFaire.length > 0 && (
                  <div className="space-y-2">
                    {tachesAFaire.map(tache => {
                      const isEditing = tacheEnCours?.id === tache.id
                      const aujourdhuiStr = new Date().toISOString().slice(0, 10)
                      const enRetard = tache.date_limite && tache.date_limite < aujourdhuiStr
                      const joursRetard = enRetard
                        ? Math.floor((new Date(aujourdhuiStr + 'T00:00:00') - new Date(tache.date_limite + 'T00:00:00')) / 86400000)
                        : 0

                      if (isEditing) {
                        return (
                          <div key={tache.id} className="bg-gray-50 rounded-lg p-4 space-y-3">
                            <input
                              type="text"
                              value={formData.titre}
                              onChange={e => setFormData({ ...formData, titre: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-300"
                              autoFocus
                            />
                            <textarea
                              placeholder="Description (optionnel)"
                              value={formData.description}
                              onChange={e => setFormData({ ...formData, description: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                              rows={2}
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Priorité</label>
                                <select
                                  value={formData.priorite}
                                  onChange={e => setFormData({ ...formData, priorite: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                                >
                                  {Object.entries(PRIORITE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Assigné à</label>
                                <select
                                  value={formData.assigne_a || ''}
                                  onChange={e => setFormData({ ...formData, assigne_a: e.target.value || null })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                                >
                                  <option value="">Non assigné</option>
                                  {UTILISATEURS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Date limite</label>
                                <input
                                  type="date"
                                  value={formData.date_limite}
                                  onChange={e => setFormData({ ...formData, date_limite: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                                />
                              </div>
                            </div>
                            {entreprise.projets?.length > 0 && (
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Projet (optionnel)</label>
                                <select
                                  value={formData.projet_id || ''}
                                  onChange={e => setFormData({ ...formData, projet_id: e.target.value || null })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                                >
                                  <option value="">Aucun projet</option>
                                  {entreprise.projets.map(p => (
                                    <option key={p.id} value={p.id}>{p.nom_projet}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div className="flex gap-2 justify-end">
                              <button onClick={resetForm} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                              <button
                                onClick={handleUpdateTache}
                                className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700"
                              >
                                Enregistrer
                              </button>
                            </div>
                          </div>
                        )
                      }

                      const isAnimating = animatingTacheId === tache.id
                      const isCompleting = isAnimating && animTacheType === 'complete'
                      const isReopening = isAnimating && animTacheType === 'reopen'
                      const isDeleting = isAnimating && animTacheType === 'delete'

                      const currentSwipe = swipeOffset[tache.id] || 0
                      const isSwiping = swipeRef.current.tacheId === tache.id && swipeRef.current.swiping

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
                                <Check size={14} strokeWidth={3} />
                                Terminée
                              </div>
                            </div>
                          )}
                          {isDeleting && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                              <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500 text-white rounded-full text-sm font-medium shadow-md"
                                style={{ animation: 'popIn 0.3s ease-out 0.15s both' }}>
                                <Trash2 size={14} strokeWidth={3} />
                                Supprimée
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
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                              isCompleting ? 'border-green-500 bg-green-500 scale-125' : 'border-gray-300 hover:border-green-500 hover:bg-green-50'
                            }`}
                          >
                            {isCompleting && <Check size={14} className="text-white" style={{ animation: 'popIn 0.2s ease-out' }} />}
                          </button>
                          <div className="flex-1 min-w-0" onClick={() => setTacheVue(tache)}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-kano-blue truncate">{tache.titre}</span>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITE_COLORS[tache.priorite]}`} />
                              {tache.assigne_a && (() => { const u = UTILISATEURS.find(u => u.value === tache.assigne_a); return <span className={`text-xs flex-shrink-0 ml-auto hidden sm:inline ${u?.color || 'text-gray-500'}`}>{u?.label || tache.assigne_a}</span> })()}
                            </div>
                            {tache.projet_id && (() => { const p = entreprise.projets?.find(p => p.id === tache.projet_id); return p ? <p className="text-xs text-gray-400 truncate mt-0.5">{p.nom_projet}</p> : null })()}
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
                    })}
                  </div>
                )}

                {tachesTerminees.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">{tachesTerminees.length} terminée{tachesTerminees.length > 1 ? 's' : ''}</p>
                    <div className="space-y-0">
                      {tachesTerminees.map(tache => {
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
                                <span className="text-sm text-gray-500 line-through flex-1 cursor-pointer" onClick={() => setTacheVue(tache)}>{tache.titre}</span>
                                <button onClick={() => handleDeleteTache(tache.id)} className="hidden sm:block p-2 hover:bg-red-50 rounded flex-shrink-0">
                                  <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
                                </button>
                              </div>
                              <div className="ml-9 mt-1 flex items-center gap-2">
                                <span className="text-[11px] text-gray-400">
                                  Terminée le {new Date(tache.date_completion || tache.updated_at).toLocaleDateString('fr-FR')} à {new Date(tache.date_completion || tache.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  {tache.termine_par && <> par {tache.termine_par.charAt(0).toUpperCase() + tache.termine_par.slice(1)}</>}
                                </span>
                                {tache.projet_id && (() => { const p = entreprise.projets?.find(p => p.id === tache.projet_id); return p ? <span className="text-[11px] text-gray-400">{p.nom_projet}</span> : null })()}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Vue lecture d'une tâche */}
                {tacheVue && !tacheEnCours && (
                  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70]" onClick={() => setTacheVue(null)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <h3 className="text-lg font-semibold text-kano-blue">{tacheVue.titre}</h3>
                        <button onClick={() => setTacheVue(null)} className="p-1 hover:bg-gray-100 rounded">
                          <X size={18} className="text-gray-400" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        {tacheVue.description && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Description</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{tacheVue.description}</p>
                          </div>
                        )}
                        {!tacheVue.description && (
                          <p className="text-sm text-gray-300 italic">Aucune description</p>
                        )}

                        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-gray-100">
                          <div>
                            <p className="text-[11px] text-gray-400">Priorité</p>
                            <span className="flex items-center gap-1.5 mt-0.5">
                              <span className={`w-2 h-2 rounded-full ${PRIORITE_COLORS[tacheVue.priorite]}`} />
                              <span className="text-sm text-gray-700">{PRIORITE_LABELS[tacheVue.priorite]}</span>
                            </span>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400">Assigné à</p>
                            <p className="text-sm text-gray-700 mt-0.5">
                              {(() => { const u = UTILISATEURS.find(u => u.value === tacheVue.assigne_a); return u ? u.label : 'Non assigné' })()}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400">Date limite</p>
                            <p className="text-sm text-gray-700 mt-0.5">
                              {tacheVue.date_limite ? new Date(tacheVue.date_limite).toLocaleDateString('fr-FR') : 'Pas de date limite'}
                            </p>
                          </div>
                          {tacheVue.created_at && (
                            <div>
                              <p className="text-[11px] text-gray-400">Créée le</p>
                              <p className="text-sm text-gray-700 mt-0.5">{new Date(tacheVue.created_at).toLocaleDateString('fr-FR')}</p>
                            </div>
                          )}
                        </div>

                        {tacheVue.statut === 'termine' && (
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-sm text-green-600">
                              Terminée le {new Date(tacheVue.date_completion || tacheVue.updated_at).toLocaleDateString('fr-FR')} à {new Date(tacheVue.date_completion || tacheVue.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              {tacheVue.termine_par && <> par {tacheVue.termine_par.charAt(0).toUpperCase() + tacheVue.termine_par.slice(1)}</>}
                            </p>
                          </div>
                        )}

                        {tacheVue.projet_id && entreprise.projets && (() => {
                          const p = entreprise.projets.find(p => p.id === tacheVue.projet_id)
                          return p ? (
                            <div className="pt-2 border-t border-gray-100">
                              <p className="text-[11px] text-gray-400">Projet</p>
                              <p className="text-sm text-gray-700 mt-0.5">{p.nom_projet}</p>
                            </div>
                          ) : null
                        })()}
                      </div>

                      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => setTacheVue(null)}
                          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Fermer
                        </button>
                        <button
                          onClick={() => { openEditTache(tacheVue); setTacheVue(null) }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700"
                        >
                          <Edit2 size={14} />
                          Modifier
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {onglet === 'finances' && (() => {
                  // Calcul du montant encaissé : pour les projets en lissage,
                  // on calcule automatiquement acompte + mensualités échues
                  function calculerEncaisse(projet) {
                    const devis = parseFloat(projet.montant_devis) || 0
                    const payeManuel = parseFloat(projet.montant_paye) || 0

                    if (projet.modalite_paiement === 'acompte_lissage' && projet.date_acompte && projet.lissage_mois && projet.montant_lissage_mensuel) {
                      const acompte = parseFloat(projet.acompte_montant) || 0
                      const mensualite = parseFloat(projet.montant_lissage_mensuel) || 0
                      const dateAcompte = new Date(projet.date_acompte)
                      const now = new Date()
                      now.setHours(0, 0, 0, 0)
                      // Nombre de mois écoulés depuis l'acompte
                      const moisEcoules = Math.max(0,
                        (now.getFullYear() - dateAcompte.getFullYear()) * 12 +
                        (now.getMonth() - dateAcompte.getMonth())
                      )
                      const mensualitesPasses = Math.min(moisEcoules, projet.lissage_mois)
                      const encaisseAuto = acompte + (mensualitesPasses * mensualite)
                      // Prendre le max entre le calcul auto et le montant saisi manuellement
                      return Math.min(devis, Math.max(payeManuel, encaisseAuto))
                    }

                    if (projet.modalite_paiement === 'acompte_solde' && projet.date_acompte && projet.acompte_montant) {
                      const acompte = parseFloat(projet.acompte_montant) || 0
                      // Si montant_paye < acompte mais la date est passée, considérer l'acompte encaissé
                      const dateAcompte = new Date(projet.date_acompte)
                      if (dateAcompte <= new Date() && payeManuel < acompte) {
                        return Math.min(devis, acompte)
                      }
                    }

                    return payeManuel
                  }

                  const totalDevis = entreprise.projets?.reduce((s, p) => s + (parseFloat(p.montant_devis) || 0), 0) || 0
                  const totalPaye = entreprise.projets?.reduce((s, p) => s + calculerEncaisse(p), 0) || 0
                  const totalRestant = Math.max(0, totalDevis - totalPaye)
                  const mrrAbonnements = abonnementsActifs.reduce((s, a) => s + (parseFloat(a.tarif_mensuel) || 0), 0)
                  const mrrLissage = entreprise.projets?.reduce((s, p) => {
                    if (p.modalite_paiement === 'acompte_lissage' && p.lissage_mois && p.montant_lissage_mensuel) {
                      const reste = (parseFloat(p.montant_devis) || 0) - calculerEncaisse(p)
                      if (reste > 0) return s + (parseFloat(p.montant_lissage_mensuel) || 0)
                    }
                    return s
                  }, 0) || 0

                  const MODALITE_LABELS = {
                    total_direct: 'Paiement intégral',
                    acompte_solde: 'Acompte + Solde',
                    acompte_lissage: 'Acompte + Mensualités'
                  }

                  return (
                  <div className="space-y-6">
                    {/* Récap financier en haut */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-gray-50/80 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400">Total devis</div>
                        <div className="text-lg font-medium text-kano-blue mt-1">{totalDevis.toLocaleString('fr-FR')} €</div>
                      </div>
                      <div className="bg-gray-50/80 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400">Encaissé</div>
                        <div className="text-lg font-medium text-kano-blue mt-1">{totalPaye.toLocaleString('fr-FR')} €</div>
                      </div>
                      <div className="bg-gray-50/80 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400">Reste à encaisser</div>
                        <div className="text-lg font-medium text-kano-blue mt-1">{totalRestant.toLocaleString('fr-FR')} €</div>
                      </div>
                      <div className="bg-gray-50/80 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400">MRR client</div>
                        <div className="text-lg font-medium text-kano-blue mt-1">{(mrrAbonnements + mrrLissage).toLocaleString('fr-FR')} €</div>
                      </div>
                    </div>

                    {/* Projets */}
                    <div>
                      <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2 mb-3">
                        <Euro size={18} />
                        Projets
                      </h3>

                      {entreprise.projets?.length > 0 ? (
                        <div className="space-y-3">
                          {entreprise.projets.map(projet => {
                            const devis = parseFloat(projet.montant_devis) || 0
                            const paye = calculerEncaisse(projet)
                            const reste = Math.max(0, devis - paye)
                            const pourcentPaye = devis > 0 ? Math.min(100, (paye / devis) * 100) : 0
                            const estSolde = reste === 0 && devis > 0

                            return (
                              <div key={projet.id} className="rounded-lg border border-gray-200/60 shadow-sm overflow-hidden hover-card">
                                {/* Header projet */}
                                <div className="px-4 py-3 flex items-center justify-between bg-gray-50">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <h4 className="font-medium text-kano-blue truncate">{projet.nom_projet}</h4>
                                    {projet.numero_devis && (
                                      <span className="text-xs text-gray-400">#{projet.numero_devis}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => { setProjetEnCours(projet); setShowFormProjet(true) }}
                                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded transition-colors"
                                      title="Modifier"
                                    >
                                      <Edit2 size={15} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteProjet(projet.id)}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Supprimer"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </div>

                                {/* Corps */}
                                <div className="px-4 py-4 bg-transparent">
                                  {/* Montant : encaissé à gauche, total devis à droite */}
                                  <div className="flex items-end justify-between mb-2">
                                    <div>
                                      <div className="text-lg font-medium text-kano-blue">{paye.toLocaleString('fr-FR')} €</div>
                                      <div className="text-[11px] text-gray-400">encaissé</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-lg font-medium text-kano-blue">{devis.toLocaleString('fr-FR')} €</div>
                                      <div className="text-[11px] text-gray-400">{pourcentPaye.toFixed(0)}% du devis</div>
                                    </div>
                                  </div>

                                  {/* Barre */}
                                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                                    <div
                                      className="h-2.5 rounded-full transition-all duration-500 bg-kano-gold"
                                      style={{ width: `${pourcentPaye}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[11px] text-gray-400 mb-4">
                                    {reste > 0 && <span>{reste.toLocaleString('fr-FR')} € restant</span>}
                                    {estSolde && <span className="text-gray-600 font-medium">Soldé</span>}
                                  </div>

                                  {/* Échéancier visuel — seulement si paiement en plusieurs fois */}
                                  {projet.modalite_paiement && projet.modalite_paiement !== 'total_direct' && (
                                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                                      <div className="text-[11px] text-gray-400 font-medium uppercase mb-1">{MODALITE_LABELS[projet.modalite_paiement]}</div>
                                      {projet.acompte_montant > 0 && (
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${paye >= parseFloat(projet.acompte_montant) ? 'bg-gray-700' : 'bg-gray-300'}`} />
                                            <span className="text-gray-700">Acompte ({projet.acompte_pourcentage}%)</span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span className="font-semibold">{parseFloat(projet.acompte_montant).toLocaleString('fr-FR')} €</span>
                                            {projet.date_acompte && (
                                              <span className="text-xs text-gray-400">{new Date(projet.date_acompte).toLocaleDateString('fr-FR')}</span>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      {projet.modalite_paiement === 'acompte_solde' && projet.solde_montant > 0 && (() => {
                                        const nbPaiements = projet.solde_nb_paiements || 1
                                        const montantParPaiement = parseFloat(projet.solde_montant) / nbPaiements
                                        const dates = projet.solde_dates || [projet.date_solde]

                                        return Array.from({ length: nbPaiements }, (_, i) => {
                                          const dateStr = dates[i]
                                          const dateEch = dateStr ? new Date(dateStr) : null
                                          const montantPayeAvantSolde = parseFloat(projet.acompte_montant) || 0
                                          const paiementsCumules = montantPayeAvantSolde + montantParPaiement * (i + 1)
                                          const estPaye = paye >= paiementsCumules - 0.01

                                          return (
                                            <div key={`solde-${i}`} className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${estPaye ? 'bg-gray-700' : 'bg-gray-300'}`} />
                                                <span className="text-gray-700">
                                                  {nbPaiements === 1 ? 'Solde' : `Solde ${i + 1}/${nbPaiements}`}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-3">
                                                <span className="font-semibold">{montantParPaiement.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</span>
                                                {dateEch && (
                                                  <span className="text-xs text-gray-400">{dateEch.toLocaleDateString('fr-FR')}</span>
                                                )}
                                              </div>
                                            </div>
                                          )
                                        })
                                      })()}
                                      {projet.modalite_paiement === 'acompte_lissage' && projet.lissage_mois > 0 && (() => {
                                        const dateAcompte = projet.date_acompte ? new Date(projet.date_acompte) : null
                                        const now = new Date()
                                        now.setHours(0, 0, 0, 0)
                                        const moisEcoules = dateAcompte ? Math.max(0,
                                          (now.getFullYear() - dateAcompte.getFullYear()) * 12 +
                                          (now.getMonth() - dateAcompte.getMonth())
                                        ) : 0
                                        const mensualitesPasses = Math.min(moisEcoules, projet.lissage_mois)
                                        return (
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <div className={`w-2 h-2 rounded-full ${estSolde ? 'bg-gray-700' : mensualitesPasses > 0 ? 'bg-gray-500' : 'bg-gray-300'}`} />
                                              <span className="text-gray-700">{mensualitesPasses}/{projet.lissage_mois} mensualités</span>
                                            </div>
                                            <span className="font-semibold">{parseFloat(projet.montant_lissage_mensuel).toLocaleString('fr-FR')} €/mois</span>
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  )}

                                  {/* Historique des paiements */}
                                  {(() => {
                                    const paiements = historique.filter(h => h.projet_id === projet.id && h.type_action === 'paiement')
                                    if (paiements.length === 0) return null
                                    return (
                                      <div className="mt-2 space-y-1">
                                        <div className="text-[11px] text-gray-400 font-medium uppercase">Paiements enregistrés</div>
                                        {paiements.map(p => (
                                          <div key={p.id} className="flex items-center justify-between text-xs text-gray-500">
                                            <span>{p.description.replace(` pour "${projet.nom_projet}"`, '')}</span>
                                            <span className="text-gray-300">{p.utilisateur}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  })()}

                                  {/* Bouton paiement */}
                                  {reste > 0 && (
                                    <div className="flex justify-end mt-3">
                                      <button
                                        onClick={() => {
                                          setProjetEnCoursPaiement(projet)
                                          setFormPaiement({ montant: '', date_paiement: new Date().toISOString().slice(0, 10) })
                                          setShowFormPaiement(true)
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-kano-blue text-white rounded-lg hover:bg-kano-blue/90 transition-colors text-xs font-medium"
                                      >
                                        <Euro size={13} />
                                        Enregistrer un paiement
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                          Aucun projet
                        </div>
                      )}
                    </div>

                    {/* Abonnements */}
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
                          <CreditCard size={18} />
                          Abonnements
                        </h3>
                        <button
                          onClick={() => { setAbonnementEnCours(null); setShowFormAbonnement(true) }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-kano-blue text-white rounded-lg hover:bg-kano-blue/90 text-sm font-medium"
                        >
                          <Plus size={14} />
                          Nouvel abonnement
                        </button>
                      </div>

                      {entreprise.abonnements?.length > 0 ? (
                        <div className="space-y-2">
                          {entreprise.abonnements.map(abo => {
                            const dateDebut = abo.date_debut ? new Date(abo.date_debut) : null
                            const aujourdhui = new Date()
                            const diffMois = dateDebut ? Math.max(0, (aujourdhui.getFullYear() - dateDebut.getFullYear()) * 12 + (aujourdhui.getMonth() - dateDebut.getMonth())) : 0
                            const caCumule = diffMois * (parseFloat(abo.tarif_mensuel) || 0)

                            return (
                              <div key={abo.id} className="flex items-center gap-4 border border-gray-200/60 shadow-sm rounded-lg p-3 hover-card">
                                <span className="shrink-0 text-xs text-gray-500">
                                  {FORMULE_LABELS[abo.formule]}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-kano-blue">{abo.tarif_mensuel} €/mois</span>
                                    {abo.actif ? (
                                      <span className="w-2 h-2 rounded-full bg-green-500" title="Actif" />
                                    ) : (
                                      <span className="text-[10px] text-gray-400 font-medium">INACTIF</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {dateDebut ? `Depuis le ${dateDebut.toLocaleDateString('fr-FR')}` : 'Pas de date'}
                                    {diffMois > 0 && ` · ${diffMois} mois · ${caCumule.toLocaleString('fr-FR')} € cumulé`}
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button
                                    onClick={() => { setAbonnementEnCours(abo); setShowFormAbonnement(true) }}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAbonnement(abo.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-gray-400 border border-dashed border-gray-200 rounded-lg text-sm">
                          Aucun abonnement
                        </div>
                      )}
                    </div>
                  </div>
                  )
                })()}

                {onglet === 'journal' && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-700 mb-4">Journal d'interactions</h3>

                    {/* Formulaire de création */}
                    <div className="rounded-lg p-4 border border-gray-200/60 bg-gray-50">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="text-gray-600" size={16} />
                        <span className="text-sm font-medium text-gray-700">Nouvelle note</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-[11px] text-gray-500 mb-0.5">Type</label>
                            <select
                              value={formNote.type_interaction}
                              onChange={(e) => setFormNote({ ...formNote, type_interaction: e.target.value })}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300"
                            >
                              <option value="appel">Appel</option>
                              <option value="email">Email</option>
                              <option value="rdv">RDV</option>
                              <option value="message">Message</option>
                              <option value="autre">Autre</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-500 mb-0.5">Date</label>
                            <input
                              type="date"
                              value={formNote.date_interaction}
                              onChange={(e) => setFormNote({ ...formNote, date_interaction: e.target.value })}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-500 mb-0.5">Lié à</label>
                            <select
                              value={formNote.projet_id}
                              onChange={(e) => setFormNote({ ...formNote, projet_id: e.target.value })}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300"
                            >
                              <option value="">Client (général)</option>
                              {entreprise.projets?.map(p => (
                                <option key={p.id} value={p.id}>{p.nom_projet}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <textarea
                            value={formNote.contenu}
                            onChange={(e) => setFormNote({ ...formNote, contenu: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300 resize-none"
                            rows="2"
                            placeholder="Ex: Appelé le client, il est intéressé par un e-commerce."
                          />
                          <button
                            onClick={handleCreateNote}
                            disabled={!formNote.contenu.trim()}
                            className="px-4 py-2 bg-gray-800 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700"
                            title="Envoyer"
                          >
                            <Send size={18} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Liste des notes */}
                    {notes.length > 0 ? (
                      <div className="space-y-2">
                        {notes.map(note => {
                          const typeIcons = {
                            appel: '📞',
                            email: '📧',
                            rdv: '🤝',
                            message: '💬',
                            autre: '📝'
                          }
                          const isEditing = noteEnEdition?.id === note.id

                          if (isEditing) {
                            return (
                              <div key={note.id} className="bg-gray-50 rounded-lg p-4 space-y-3">
                                <div className="flex flex-wrap items-end gap-3">
                                  <div>
                                    <label className="block text-[11px] text-gray-500 mb-0.5">Type</label>
                                    <select
                                      value={formNote.type_interaction}
                                      onChange={(e) => setFormNote({ ...formNote, type_interaction: e.target.value })}
                                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300"
                                    >
                                      <option value="appel">Appel</option>
                                      <option value="email">Email</option>
                                      <option value="rdv">RDV</option>
                                      <option value="message">Message</option>
                                      <option value="autre">Autre</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-gray-500 mb-0.5">Date</label>
                                    <input
                                      type="date"
                                      value={formNote.date_interaction}
                                      onChange={(e) => setFormNote({ ...formNote, date_interaction: e.target.value })}
                                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-gray-500 mb-0.5">Lié à</label>
                                    <select
                                      value={formNote.projet_id}
                                      onChange={(e) => setFormNote({ ...formNote, projet_id: e.target.value })}
                                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300"
                                    >
                                      <option value="">Client (général)</option>
                                      {entreprise.projets?.map(p => (
                                        <option key={p.id} value={p.id}>{p.nom_projet}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <textarea
                                  value={formNote.contenu}
                                  onChange={(e) => setFormNote({ ...formNote, contenu: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-300 resize-none"
                                  rows="3"
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                  <button onClick={resetFormNote} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                                  <button
                                    onClick={handleUpdateNote}
                                    disabled={!formNote.contenu.trim()}
                                    className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
                                  >
                                    Enregistrer
                                  </button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={note.id} className="border border-gray-200/60 shadow-sm rounded-lg p-3 hover-card cursor-pointer">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1" onClick={() => openEditNote(note)}>
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span>{typeIcons[note.type_interaction] || '📝'}</span>
                                    <span className="text-xs font-medium text-gray-500 capitalize">{note.type_interaction}</span>
                                    {note.date_interaction && (
                                      <span className="text-xs text-gray-500">
                                        le {new Date(note.date_interaction).toLocaleDateString('fr-FR')}
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-400">
                                      (note du {new Date(note.created_at).toLocaleDateString('fr-FR', {
                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                      })})
                                    </span>
                                    {note.utilisateur && (() => { const usr = UTILISATEURS.find(u => u.value === note.utilisateur); return (
                                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${usr?.color || 'bg-gray-100 text-gray-700'}`}>
                                        {usr?.label || note.utilisateur}
                                      </span>
                                    ) })()}
                                  </div>
                                  <p className="text-sm text-gray-800 whitespace-pre-line">{note.contenu}</p>
                                  {note.projet_id && entreprise.projets && (
                                    <span className="inline-block mt-1.5 text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
                                      {entreprise.projets.find(p => p.id === note.projet_id)?.nom_projet || 'Projet'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={() => openEditNote(note)}
                                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Modifier"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Supprimer"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                        Aucune note pour ce client
                      </div>
                    )}
                  </div>
                )}

                {onglet === 'historique' && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-700 mb-4">Historique global</h3>

                    {historique.length > 0 ? (
                      <div className="space-y-0">
                        {historique.map((event) => {
                          return (
                            <div key={event.id} className="border-b border-gray-200/40 py-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                                    <span>
                                      {new Date(event.created_at).toLocaleDateString('fr-FR', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                    {event.utilisateur && (() => { const usr = UTILISATEURS.find(u => u.value === event.utilisateur); return (
                                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${usr?.color || 'bg-gray-100 text-gray-700'}`}>
                                        {usr?.label || event.utilisateur}
                                      </span>
                                    ) })()}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    {event.description}
                                  </div>

                                  {(event.ancien_valeur || event.nouvelle_valeur) && (
                                    <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                                      {event.ancien_valeur && (
                                        <div>Ancien : {JSON.stringify(event.ancien_valeur, null, 2)}</div>
                                      )}
                                      {event.nouvelle_valeur && (
                                        <div>Nouveau : {JSON.stringify(event.nouvelle_valeur, null, 2)}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400 capitalize">
                                  {event.entite}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                        Aucun événement dans l'historique
                      </div>
                    )}
                  </div>
                )}
          </div>
        </div>
      </div>
    </div>

    {showFormProjet && (
      <FormProjet
        projet={projetEnCours}
        entrepriseId={entreprise.id}
        onSave={handleSaveProjet}
        onCancel={() => {
          setShowFormProjet(false)
          setProjetEnCours(null)
        }}
      />
    )}

    {showFormAbonnement && (
      <FormAbonnement
        abonnement={abonnementEnCours}
        entrepriseId={entreprise.id}
        projets={entreprise.projets}
        onSave={handleSaveAbonnement}
        onCancel={() => {
          setShowFormAbonnement(false)
          setAbonnementEnCours(null)
        }}
      />
    )}

    {showFormPaiement && projetEnCoursPaiement && (
      <div
        className="fixed inset-0 glass-overlay flex items-center justify-center z-[70] p-4"
        onClick={() => setShowFormPaiement(false)}
      >
        <div
          className="bg-white rounded-xl w-full max-w-md shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-kano-blue text-white p-4 flex justify-between items-center rounded-t-xl">
            <h3 className="text-lg font-medium">Enregistrer un paiement</h3>
            <button onClick={() => setShowFormPaiement(false)} className="p-1 hover:bg-white/10 rounded">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600">Projet</div>
              <div className="text-lg font-medium text-gray-800">{projetEnCoursPaiement.nom_projet}</div>
              <div className="text-sm text-gray-600 mt-2">
                Total: {projetEnCoursPaiement.montant_devis}€ |
                Payé: {projetEnCoursPaiement.montant_paye || 0}€ |
                Reste: {Math.max(0, (projetEnCoursPaiement.montant_devis || 0) - (projetEnCoursPaiement.montant_paye || 0))}€
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant du paiement (€) *</label>
              <input
                type="number"
                value={formPaiement.montant}
                onChange={(e) => setFormPaiement({...formPaiement, montant: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300"
                placeholder="700"
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date du paiement</label>
              <input
                type="date"
                value={formPaiement.date_paiement}
                onChange={(e) => setFormPaiement({...formPaiement, date_paiement: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>

          <div className="bg-gray-50 p-4 flex gap-3 justify-end border-t border-gray-200/60 rounded-b-xl">
            <button
              onClick={() => setShowFormPaiement(false)}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
            >
              Annuler
            </button>
            <button
              onClick={handleEnregistrerPaiement}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-medium"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    )}

    {projetSelectionne && (
      <ModaleProjet
        projet={projetSelectionne}
        entreprise={entreprise}
        onClose={() => setProjetSelectionne(null)}
        onUpdate={() => {
          fetchTaches()
          fetchHistorique()
        }}
      />
    )}

    {confirmDialog && (
      <ModaleConfirm
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(null)}
      />
    )}

    {showProposeTache && (
      <div className="fixed inset-0 glass-overlay flex items-center justify-center z-[70] p-4" onClick={() => setShowProposeTache(false)}>
        <div className="bg-white rounded-xl w-full max-w-md shadow-lg p-6" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-medium text-gray-700 mb-1">Créer une tâche suite à cette note ?</h3>
          <p className="text-sm text-gray-500 mb-4">Vous pouvez créer une tâche en conséquence ou ignorer.</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Titre de la tâche</label>
              <input
                type="text"
                value={formTacheSuiteNote.titre}
                onChange={e => setFormTacheSuiteNote({ ...formTacheSuiteNote, titre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Priorité</label>
                <select
                  value={formTacheSuiteNote.priorite}
                  onChange={e => setFormTacheSuiteNote({ ...formTacheSuiteNote, priorite: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {Object.entries(PRIORITE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Assigné à</label>
                <select
                  value={formTacheSuiteNote.assigne_a || ''}
                  onChange={e => setFormTacheSuiteNote({ ...formTacheSuiteNote, assigne_a: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  <option value="">Non assigné</option>
                  {UTILISATEURS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Date limite</label>
                <input
                  type="date"
                  value={formTacheSuiteNote.date_limite}
                  onChange={e => setFormTacheSuiteNote({ ...formTacheSuiteNote, date_limite: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Projet</label>
                <select
                  value={formTacheSuiteNote.projet_id}
                  onChange={e => setFormTacheSuiteNote({ ...formTacheSuiteNote, projet_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  <option value="">Client (général)</option>
                  {entreprise.projets?.map(p => (
                    <option key={p.id} value={p.id}>{p.nom_projet}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreateTacheSuiteNote}
                disabled={!formTacheSuiteNote.titre.trim()}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm font-medium disabled:opacity-40"
              >
                Créer la tâche
              </button>
              <button
                onClick={() => setShowProposeTache(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
              >
                Non merci
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
          if (undoToast.isDelete) {
            undoDeleteTache(undoToast.tacheData)
          } else {
            await supabase
              .from('taches')
              .update({ statut: 'a_faire', date_completion: null, termine_par: null })
              .eq('id', undoToast.tacheId)
            setTaches(prev => prev.map(t =>
              t.id === undoToast.tacheId
                ? { ...t, statut: 'a_faire', date_completion: null, termine_par: null }
                : t
            ))
          }
          setUndoToast(null)
        }}
        onExpire={() => {
          if (undoToast.isDelete) {
            commitDeleteTache(undoToast.tacheId, undoToast.tacheData)
          }
          setUndoToast(null)
        }}
      />
    )}
    </>
  )
}
