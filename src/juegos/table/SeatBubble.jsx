import { useCallback, useSyncExternalStore } from 'react'
import './seat-bubble.css'

const KEY = 'juegos.globos'
const EVENT = 'juegos:globos'

function read() {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

function subscribe(listener) {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

// Preferencia «mostrar globos de chat» (por defecto sí), guardada en el navegador y compartida por toda la página.
export function useBubblesEnabled() {
  const enabled = useSyncExternalStore(subscribe, read, () => true)
  const setEnabled = useCallback((next) => {
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // Sin almacenamiento: el cambio solo vale para esta carga.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [enabled, setEnabled]
}

// Globo con el último mensaje de un jugador, pegado a su asiento (el padre debe ser position: relative/absolute).
// `side` es dónde queda respecto al avatar; la cola apunta hacia él. Caduca en el hook, no aquí.
export default function SeatBubble({ bubble, side = 'top' }) {
  const [enabled] = useBubblesEnabled()
  if (!bubble || !enabled) return null
  return (
    <div key={bubble.id} className={`gbubble gbubble--${side}`} aria-hidden="true">
      <span className="gbubble__text">{bubble.text}</span>
    </div>
  )
}
