import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

function getPeriode() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'matin'
  if (h >= 12 && h < 18) return 'apresmidi'
  return 'soir'
}

function getGreeting(periode) {
  if (periode === 'matin') return 'Bonjour'
  if (periode === 'apresmidi') return 'Bon après-midi'
  return 'Bonne soirée'
}

export function greetingShouldShow() {
  const periode = getPeriode()
  const today = new Date().toISOString().slice(0, 10)
  try {
    const stored = JSON.parse(localStorage.getItem('kano_greeting_shown') || '{}')
    if (stored[periode] === today) return false
  } catch { /* noop */ }
  return true
}

function markShown() {
  const periode = getPeriode()
  const today = new Date().toISOString().slice(0, 10)
  let stored = {}
  try { stored = JSON.parse(localStorage.getItem('kano_greeting_shown') || '{}') } catch { /* noop */ }
  for (const key of Object.keys(stored)) {
    if (stored[key] !== today) delete stored[key]
  }
  stored[periode] = today
  localStorage.setItem('kano_greeting_shown', JSON.stringify(stored))
}

export default function GreetingOverlay({ onDone }) {
  const { userName } = useAuth()
  const [phase, setPhase] = useState('enter')
  const textRef = useRef(null)

  const periode = getPeriode()
  const greeting = getGreeting(periode)
  const displayName = userName.charAt(0).toUpperCase() + userName.slice(1)

  const startFly = useCallback(() => {
    const source = textRef.current
    const target = document.getElementById('dashboard-greeting')

    if (source && target) {
      const from = source.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      const targetStyles = window.getComputedStyle(target)
      const sourceStyles = window.getComputedStyle(source)

      const dx = to.left - from.left
      const dy = to.top - from.top

      // Étape 1 : figer le texte en position fixe à son emplacement actuel (centre)
      source.style.transition = 'none'
      source.style.position = 'fixed'
      source.style.left = from.left + 'px'
      source.style.top = from.top + 'px'
      source.style.margin = '0'
      source.style.fontSize = sourceStyles.fontSize
      source.style.lineHeight = sourceStyles.lineHeight
      source.style.transform = 'translate(0, 0)'
      source.style.willChange = 'transform, font-size'
      source.style.opacity = '1'

      // Forcer le recalcul du layout
      source.getBoundingClientRect()

      // Étape 2 : animer — transform pour le mouvement (GPU), font-size pour la taille (natif)
      const ease = '0.8s cubic-bezier(.22,1,.36,1)'
      source.style.transition = [
        `transform ${ease}`,
        `font-size ${ease}`, `line-height ${ease}`,
        `letter-spacing ${ease}`, `font-weight ${ease}`,
        `color 0.6s ease`,
      ].join(', ')
      source.style.transform = `translate(${dx}px, ${dy}px)`
      source.style.fontSize = targetStyles.fontSize
      source.style.lineHeight = targetStyles.lineHeight
      source.style.letterSpacing = targetStyles.letterSpacing
      source.style.fontWeight = targetStyles.fontWeight
      source.style.color = targetStyles.color

      const handler = (e) => {
        if (e.propertyName === 'transform') {
          source.removeEventListener('transitionend', handler)
          // Swap instantané — même bloc sync = même paint
          source.style.visibility = 'hidden'
          target.style.visibility = 'visible'
          onDone()
        }
      }
      source.addEventListener('transitionend', handler)
    } else {
      setTimeout(() => onDone(), 900)
    }

    setPhase('fly')
  }, [onDone])

  useEffect(() => {
    markShown()

    const timers = [
      setTimeout(() => setPhase('visible'), 50),
      setTimeout(() => startFly(), 2400),
    ]

    return () => timers.forEach(clearTimeout)
  }, [startFly])

  return (
    <>
      <div className={`greeting-backdrop ${phase === 'fly' ? 'greeting-backdrop-out' : ''}`} />

      <div className="greeting-content">
        <div className={`greeting-date ${phase === 'visible' ? 'greeting-date-in' : ''} ${phase === 'fly' ? 'greeting-date-out' : ''}`}>
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          })}
        </div>

        <h1
          ref={textRef}
          className={`greeting-text ${phase === 'visible' ? 'greeting-text-in' : ''}`}
        >
          {greeting} {displayName}
        </h1>

        <div className={`greeting-line ${phase === 'visible' ? 'greeting-line-in' : ''} ${phase === 'fly' ? 'greeting-line-out' : ''}`} />
      </div>
    </>
  )
}
