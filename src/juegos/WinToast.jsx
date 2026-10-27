import { useEffect, useState } from 'react'
import { eur } from './money.js'
import './celebrate.css'

const SHOW_MS = 5500
const MAX = 3

// Avisos de las mesas en vivo cuando gana otro jugador: «Ana ha ganado 300 €. ¡Felicidades!».
// wins: [{ key, name, amount, detail? }] · cada `key` se anuncia una sola vez.
function WinToast({ wins }) {
  const [shown, setShown] = useState([])

  useEffect(() => {
    if (!wins.length) return
    setShown((list) => {
      const known = new Set(list.map((w) => w.key))
      const fresh = wins.filter((w) => !known.has(w.key))
      return fresh.length ? [...fresh, ...list].slice(0, MAX) : list
    })
  }, [wins])

  useEffect(() => {
    if (!shown.length) return
    const timer = setTimeout(() => setShown((list) => list.slice(0, -1)), SHOW_MS)
    return () => clearTimeout(timer)
  }, [shown])

  if (!shown.length) return null
  return (
    <ol className="wtoast" aria-live="polite">
      {shown.map((w) => (
        <li key={w.key} className="wtoast__item">
          <span className="wtoast__cup" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} style={{ '--a': `${i * 60}deg` }} />
            ))}
          </span>
          <span className="wtoast__text">
            <b>{w.name}</b> ha ganado <strong>{eur(w.amount)}</strong>
            {w.detail ? ` ${w.detail}` : ''}. ¡Felicidades!
          </span>
        </li>
      ))}
    </ol>
  )
}

export default WinToast
