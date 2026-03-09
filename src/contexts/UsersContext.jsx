import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const UsersContext = createContext(null)

const COULEURS_CYCLE = [
  'text-kano-blue',
  'text-kano-gold',
  'text-emerald-600',
  'text-violet-600',
  'text-rose-600',
  'text-amber-600',
]

export function UsersProvider({ children }) {
  const [utilisateurs, setUtilisateurs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProfils()
  }, [])

  async function fetchProfils() {
    const { data, error } = await supabase
      .from('profils')
      .select('id, prenom, couleur')
      .order('created_at', { ascending: true })

    if (!error && data) {
      setUtilisateurs(data.map((p, i) => ({
        value: p.prenom.toLowerCase(),
        label: p.prenom.charAt(0).toUpperCase() + p.prenom.slice(1),
        color: p.couleur || COULEURS_CYCLE[i % COULEURS_CYCLE.length],
        id: p.id,
      })))
    }
    setLoading(false)
  }

  return (
    <UsersContext.Provider value={{ utilisateurs, loading, refetch: fetchProfils }}>
      {children}
    </UsersContext.Provider>
  )
}

export function useUsers() {
  const context = useContext(UsersContext)
  if (!context) {
    throw new Error('useUsers must be used within a UsersProvider')
  }
  return context
}
