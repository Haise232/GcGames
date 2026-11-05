// Avisos del pase, estés en el juego que estés: misión completada, bonus del día, nivel nuevo, cofre abierto y premios
// reclamados. La XP suelta de cada jugada se junta en una pastilla pequeña («+10 XP») para no tapar el juego.
// Escucha el evento «juegos:pase» que lanza useJuegos con cada respuesta que trae paseEvent.
import { useEffect, useRef, useState } from 'react'
import { eur } from '../comun/money.js'
import { playWin } from '../comun/sound.js'

const TOAST_MS = 4200
const BIG_MS = 5200
const XP_MS = 1600

let nextId = 1

function toastsOf(ev) {
  const out = []
  for (const m of ev.done ?? []) out.push({ kind: 'mission', icon: '✓', title: '¡Misión completada!', text: m.text, extra: `+${m.xp} XP` })
  if (ev.bonus) out.push({ kind: 'bonus', icon: '★', title: '¡Las tres misiones del día!', text: `Bonus: +${eur(ev.bonus.eur)}`, extra: `+${ev.bonus.xp} XP` })
  if (ev.chest) out.push({ kind: 'chest', icon: '🧰', title: `Cofre del día ${ev.chest.day}`, text: `+${eur(ev.chest.eur)} a tu saldo`, extra: `+${ev.gained} XP` })
  if (ev.claimed) {
    const n = ev.claimed.levels.length
    out.push({ kind: 'claim', icon: '🎁', title: n === 1 ? `Premio del nivel ${ev.claimed.levels[0]}` : `${n} premios reclamados`, text: `+${eur(ev.claimed.eur)} a tu saldo` })
  }
  if (ev.levelUp) {
    out.push({
      kind: 'level',
      big: true,
      icon: ev.levelUp.level,
      title: `¡Nivel ${ev.levelUp.level}!`,
      text: ev.levelUp.newTitle ? `Nuevo título: «${ev.levelUp.title}»` : 'Tienes un premio esperando en el pase',
    })
  }
  return out
}

export default function PaseToasts() {
  const [toasts, setToasts] = useState([])
  const [xp, setXp] = useState(null)
  const xpTimer = useRef(null)

  useEffect(() => {
    const onEvent = (e) => {
      const ev = e.detail
      if (!ev) return
      const list = toastsOf(ev)
      if (list.length) {
        const stamped = list.map((t) => ({ ...t, id: nextId++ }))
        setToasts((cur) => [...cur, ...stamped].slice(-4))
        for (const t of stamped) setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), t.big ? BIG_MS : TOAST_MS)
        playWin(stamped.some((t) => t.big))
      } else if (ev.gained > 0) {
        setXp((cur) => ({ n: (cur?.n ?? 0) + ev.gained, key: nextId++ }))
        clearTimeout(xpTimer.current)
        xpTimer.current = setTimeout(() => setXp(null), XP_MS)
      }
    }
    window.addEventListener('juegos:pase', onEvent)
    return () => {
      window.removeEventListener('juegos:pase', onEvent)
      clearTimeout(xpTimer.current)
    }
  }, [])

  return (
    <div className="s4-toasts" aria-live="polite">
      {xp && (
        <span key={xp.key} className="s4-xppop">
          +{xp.n} XP
        </span>
      )}
      {toasts.map((t) => (
        <div key={t.id} className={`s4-toast s4-toast--${t.kind} ${t.big ? 's4-toast--big' : ''}`} role="status">
          {t.big && (
            <span className="s4-toast__confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} style={{ '--k': i }} />
              ))}
            </span>
          )}
          <span className="s4-toast__icon" aria-hidden="true">
            {t.icon}
          </span>
          <span className="s4-toast__body">
            <b>{t.title}</b>
            <span>{t.text}</span>
          </span>
          {t.extra && <em className="s4-toast__xp">{t.extra}</em>}
        </div>
      ))}
    </div>
  )
}
