import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from '../comun/Avatar.jsx'
import { buzz, playChip } from '../comun/sound.js'
import './cuerda.css'

// La cuerda del Tira y Afloja, compartida por el juego suelto (rojo contra azul) y por los duelos de la Feria.
// pos: de -1 (gana el de la izquierda) a 1 (gana el de la derecha). left / right: { name, color, faces, score }.
export function Cuerda({ pos, left, right, pulling = false, winner = null }) {
  const shift = Math.max(-1, Math.min(1, pos)) * 34
  const side = (team, which) => (
    <div className={`cu-side cu-side--${which} ${winner === which ? 'is-win' : winner ? 'is-lose' : ''}`} style={{ '--team': team.color }}>
      <span className="cu-faces">
        {team.faces.slice(0, 4).map((p, i) => (
          <Avatar key={`${p.name}-${i}`} name={p.name} src={p.avatar} size={34} />
        ))}
        {team.faces.length > 4 && <i>+{team.faces.length - 4}</i>}
      </span>
      <b>{team.name}</b>
      <em>{team.score}</em>
    </div>
  )
  return (
    <div className={`cu ${pulling ? 'is-pulling' : ''}`} role="img" aria-label={`${left.name} ${left.score}, ${right.name} ${right.score}`}>
      {side(left, 'left')}
      <div className="cu-track" style={{ '--left': left.color, '--right': right.color }}>
        <i className="cu-goal cu-goal--left" />
        <i className="cu-mid" />
        <i className="cu-goal cu-goal--right" />
        <span className="cu-rope" style={{ translate: `${shift}% 0` }}>
          <i className="cu-flag" />
        </span>
      </div>
      {side(right, 'right')}
    </div>
  )
}

// Tirones: cuenta las pulsaciones (ratón, dedo o barra espaciadora) mientras active, sin pasar nunca de lo que da tiempo
// a tirar (cap(ms): lo mismo que comprueba el servidor). Devuelve [n, tap].
export function useTaps(active, startAt, clock, cap) {
  const [n, setN] = useState(0)
  const count = useRef(0)
  const key = `${startAt}`
  useEffect(() => {
    count.current = 0
    setN(0)
  }, [key])
  const tap = useCallback(() => {
    if (!active) return
    const max = cap(clock() - startAt)
    if (count.current >= max) return
    count.current++
    setN(count.current)
    if (count.current % 3 === 0) playChip()
    buzz(6)
  }, [active, startAt, clock, cap])
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return
      e.preventDefault()
      if (!e.repeat) tap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, tap])
  return [n, tap, count]
}

// El botón de tirar: grande, para aporrearlo.
export function TapPad({ active, onTap, n, idle = 'Prepárate…' }) {
  return (
    <button
      type="button"
      className={`cu-pad ${active ? 'is-live' : ''}`}
      disabled={!active}
      onPointerDown={(e) => {
        e.preventDefault()
        onTap()
      }}
      // El teclado ya tira con la barra espaciadora (useTaps): que el clic sintético no cuente doble.
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.preventDefault()}
    >
      <b key={n} className="cu-pad__n">
        {active ? n : idle}
      </b>
      <small>{active ? '¡TIRA! Pulsa sin parar' : 'Pulsa aquí o la barra espaciadora'}</small>
    </button>
  )
}
