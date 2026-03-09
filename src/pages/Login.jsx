import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mode, setMode] = useState('login') // login | forgot | reset
  const navigate = useNavigate()

  // Détecter si l'utilisateur arrive via un lien de reset password
  useEffect(() => {
    const hash = window.location.hash

    // Vérifier les erreurs dans l'URL (lien expiré, invalide, etc.)
    if (hash && hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const errorCode = params.get('error_code')
      if (errorCode === 'otp_expired') {
        setError('Le lien a expiré. Demandez-en un nouveau ci-dessous.')
        setMode('forgot')
      } else {
        const desc = params.get('error_description')
        if (desc) setError(desc.replace(/\+/g, ' '))
      }
      // Nettoyer l'URL
      window.history.replaceState(null, '', '/login')
      return
    }

    // Détecter le token de recovery
    if (hash && hash.includes('type=recovery')) {
      setMode('reset')
    }

    // Écouter l'événement PASSWORD_RECOVERY de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
    } else {
      navigate('/')
      window.location.reload()
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login',
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('rate limit')) {
        setError('Trop de tentatives. Réessayez dans quelques minutes.')
      } else {
        setError(msg || 'Impossible d\'envoyer le lien.')
      }
    } else {
      setSuccess('Un lien de réinitialisation a été envoyé à votre adresse email.')
    }
    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('Impossible de mettre à jour le mot de passe. Le lien a peut-être expiré.')
    } else {
      setSuccess('Mot de passe mis à jour ! Redirection...')
      setTimeout(() => {
        navigate('/')
        window.location.reload()
      }, 1500)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-kano-blue to-kano-ink flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-kano-blue mb-2">KANO CRM</h1>
          <p className="text-gray-600">
            {mode === 'login' && 'Connectez-vous pour continuer'}
            {mode === 'forgot' && 'Réinitialiser votre mot de passe'}
            {mode === 'reset' && 'Choisissez un nouveau mot de passe'}
          </p>
        </div>

        {/* LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-kano-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-kano-blue"
              />
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

            <button type="submit" disabled={loading} className="w-full bg-kano-blue text-white py-3 rounded-lg font-semibold hover:bg-kano-blue/90 transition-all disabled:opacity-50">
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
              className="w-full text-sm text-gray-400 hover:text-kano-blue transition-colors"
            >
              Mot de passe oublié ?
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-kano-blue"
              />
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
            {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

            <button type="submit" disabled={loading} className="w-full bg-kano-blue text-white py-3 rounded-lg font-semibold hover:bg-kano-blue/90 transition-all disabled:opacity-50">
              {loading ? 'Envoi...' : 'Envoyer le lien'}
            </button>

            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccess('') }}
              className="w-full text-sm text-gray-400 hover:text-kano-blue transition-colors"
            >
              Retour à la connexion
            </button>
          </form>
        )}

        {/* RESET PASSWORD */}
        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nouveau mot de passe</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-kano-blue"
              />
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
            {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

            <button type="submit" disabled={loading} className="w-full bg-kano-blue text-white py-3 rounded-lg font-semibold hover:bg-kano-blue/90 transition-all disabled:opacity-50">
              {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
