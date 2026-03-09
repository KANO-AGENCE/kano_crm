import { createContext, useContext, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ModaleClient from '../components/ModaleClient'

const ClientModalContext = createContext()

export function useClientModal() {
  return useContext(ClientModalContext)
}

export function ClientModalProvider({ children }) {
  const [entreprise, setEntreprise] = useState(null)
  const [defaultOnglet, setDefaultOnglet] = useState(null)
  const [defaultTacheId, setDefaultTacheId] = useState(null)

  const openClientModal = useCallback(async (entrepriseOrId, options) => {
    setDefaultOnglet(options?.onglet || null)
    setDefaultTacheId(options?.tacheId || null)
    if (typeof entrepriseOrId === 'object' && entrepriseOrId !== null) {
      if (entrepriseOrId.contacts) {
        setEntreprise(entrepriseOrId)
      } else {
        const { data } = await supabase
          .from('entreprises')
          .select('*, contacts(*), abonnements(*), projets(*, taches(*)), taches(*)')
          .eq('id', entrepriseOrId.id)
          .single()
        if (data) setEntreprise(data)
      }
    } else {
      const { data } = await supabase
        .from('entreprises')
        .select('*, contacts(*), abonnements(*), projets(*, taches(*)), taches(*)')
        .eq('id', entrepriseOrId)
        .single()
      if (data) setEntreprise(data)
    }
  }, [])

  function closeModal() {
    setEntreprise(null)
    setDefaultOnglet(null)
    setDefaultTacheId(null)
  }

  function handleUpdate() {
    // Re-fetch to get fresh data after modifications
    if (entreprise) {
      supabase
        .from('entreprises')
        .select('*, contacts(*), abonnements(*), projets(*, taches(*)), taches(*)')
        .eq('id', entreprise.id)
        .single()
        .then(({ data }) => {
          if (data) setEntreprise(data)
        })
    }
    window.dispatchEvent(new CustomEvent('kano:data-updated'))
  }

  return (
    <ClientModalContext.Provider value={{ openClientModal }}>
      {children}
      {entreprise && (
        <ModaleClient
          entreprise={entreprise}
          onClose={closeModal}
          onUpdate={handleUpdate}
          defaultOnglet={defaultOnglet}
          defaultTacheId={defaultTacheId}
        />
      )}
    </ClientModalContext.Provider>
  )
}
