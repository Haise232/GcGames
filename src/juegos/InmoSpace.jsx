import { memo, useEffect, useRef, useState } from 'react'
import Avatar from './Avatar.jsx'
import { hueOf } from './InmoCity.jsx'
import { REQUIRES, SPACE } from './inmo.js'
import { eur } from './money.js'

// El espacio de la Inmobiliaria (reglas en inmo.js): el Sistema Solar con los planetas girando alrededor del Sol, cuatro
// estrellas en los bordes y cuatro galaxias en las esquinas. Al pasar el ratón por encima todo se para, para poder
// tocar lo que se mueve. La Tierra no se vende: al tocarla se vuelve al mundo.

// Órbitas de dentro hacia fuera: radio (en % del cuadro), cuánto tarda una vuelta y tamaño del planeta (en cqw).
const ORBITS = [
  { i: 100, r: 10, t: 40, size: 2.4, cls: 'mercurio' },
  { i: 101, r: 14, t: 60, size: 3.2, cls: 'venus' },
  { i: null, r: 18, t: 80, size: 3.4, cls: 'tierra' },
  { i: 103, r: 22, t: 105, size: 2.9, cls: 'marte' },
  { i: 104, r: 26.5, t: 150, size: 6.2, cls: 'jupiter' },
  { i: 105, r: 31, t: 190, size: 5.2, cls: 'saturno' },
  { i: 106, r: 34.5, t: 230, size: 3.8, cls: 'urano' },
  { i: 107, r: 38, t: 270, size: 3.7, cls: 'neptuno' },
  { i: 108, r: 41.5, t: 320, size: 1.9, cls: 'pluton' },
]
// Las estrellas en el centro de cada borde (el Sol, en medio) y las galaxias en las esquinas.
const SPOTS = {
  120: { x: 50, y: 50, cls: 'sol' },
  121: { x: 50, y: 4.5, cls: 'sirio' },
  122: { x: 93, y: 50, cls: 'vega' },
  123: { x: 50, y: 95.5, cls: 'betelgeuse' },
  124: { x: 7.5, y: 50, cls: 'polar' },
  140: { x: 10, y: 10, cls: 'triangulo' },
  141: { x: 90, y: 10, cls: 'sombrero' },
  142: { x: 10, y: 90, cls: 'remolino' },
  143: { x: 90, y: 90, cls: 'andromeda' },
}
const STARFIELD = Array.from({ length: 90 }, (_, k) => ({ x: (k * 61) % 100, y: (k * 37 + (k % 7) * 13) % 100, s: k % 9 === 0 ? 2 : 1, d: (k % 11) * 0.4 }))
const BODY = Object.fromEntries(SPACE.map((c) => [c.i, c]))

// ¿Puede comprarlo? Las estrellas piden un planeta tuyo y las galaxias, una estrella.
export function lockedFor(i, mine) {
  const need = REQUIRES[BODY[i]?.kind]
  return Boolean(need) && !mine.some((c) => BODY[c.casilla]?.kind === need)
}

function Owner({ own }) {
  if (!own) return null
  return (
    <span className={`sp-owner ${own.owner.me ? 'is-mine' : ''}`} style={{ '--oh': hueOf(own.owner.name) }}>
      <Avatar name={own.owner.name} src={own.owner.avatar} size={16} />
    </span>
  )
}

function Body({ i, own, selected, locked, fresh, onSelect, children, className = '', style }) {
  const cell = BODY[i]
  return (
    <button
      type="button"
      className={`sp-body sp-body--${cell.kind} ${className} ${own ? 'is-owned' : ''} ${own?.owner.me ? 'is-mine' : ''} ${selected ? 'is-selected' : ''} ${locked && !own ? 'is-locked' : ''} ${fresh ? 'is-fresh' : ''}`}
      style={own ? { ...style, '--oh': hueOf(own.owner.name) } : style}
      onClick={() => onSelect(i)}
      aria-pressed={selected}
      aria-label={`${cell.name}: ${own ? `de ${own.owner.me ? 'ti' : own.owner.name}` : `se vende, ${eur(cell.price)}`}`}
      title={cell.name}
    >
      {children}
      <span className="sp-name">{cell.name}</span>
      <Owner own={own} />
    </button>
  )
}

function InmoSpace({ cells, selected, onSelect, mine, onEarth }) {
  const owned = new Map(cells.map((c) => [c.casilla, c]))
  const worth = cells.reduce((sum, c) => sum + c.invested, 0)

  // Lo recién comprado brilla un momento (no al entrar: solo lo que cambia mientras miras).
  const prev = useRef(null)
  const [fresh, setFresh] = useState(new Set())
  useEffect(() => {
    const ids = new Set(cells.map((c) => c.casilla))
    const before = prev.current
    prev.current = ids
    if (!before) return
    const added = [...ids].filter((i) => !before.has(i))
    if (!added.length) return
    setFresh(new Set(added))
    const timer = setTimeout(() => setFresh(new Set()), 2400)
    return () => clearTimeout(timer)
  }, [cells])

  const props = (i) => ({ i, own: owned.get(i), selected: selected === i, locked: lockedFor(i, mine), fresh: fresh.has(i), onSelect })

  return (
    <section className="sp-space" aria-label="El espacio">
      <div className="sp-stars" aria-hidden="true">
        {STARFIELD.map((s, k) => (
          <i key={k} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
        ))}
      </div>
      <i className="sp-nebula sp-nebula--a" aria-hidden="true" />
      <i className="sp-nebula sp-nebula--b" aria-hidden="true" />
      <i className="sp-shooting" aria-hidden="true" />
      <i className="sp-rocket" aria-hidden="true">🚀</i>

      <div className="sp-system">
        {ORBITS.map((o, k) => (
          <div
            key={o.cls}
            className="sp-orbit"
            style={{ '--r': `${o.r}%`, '--t': `${o.t}s`, animationDelay: `${-((k * 0.37) % 1) * o.t}s` }}
          >
            <div className="sp-carrier" style={{ '--t': `${o.t}s`, animationDelay: `${-((k * 0.37) % 1) * o.t}s` }}>
              {o.i === null ? (
                <button type="button" className="sp-body sp-body--tierra" onClick={onEarth} title="La Tierra: vuelve al mundo">
                  <i className="sp-planet sp-planet--tierra" style={{ '--size': `${o.size}cqw` }} />
                  <span className="sp-name">La Tierra</span>
                </button>
              ) : (
                <Body {...props(o.i)}>
                  <i className={`sp-planet sp-planet--${o.cls}`} style={{ '--size': `${o.size}cqw` }} />
                </Body>
              )}
            </div>
          </div>
        ))}
      </div>

      {Object.entries(SPOTS).map(([id, spot]) => {
        const i = Number(id)
        const isStar = BODY[i].kind === 'estrella'
        return (
          <div key={id} className={`sp-spot ${i === 120 ? 'sp-spot--sun' : ''}`} style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
            <Body {...props(i)}>
              <i className={`${isStar ? 'sp-star' : 'sp-galaxy'} sp-${isStar ? 'star' : 'galaxy'}--${spot.cls}`} />
            </Body>
          </div>
        )
      })}

      <div className="sp-title" aria-hidden="true">
        <span>El espacio</span>
        <small>para los que ya no saben dónde meter el dinero</small>
      </div>
      <p className="sp-stats">
        <b>{cells.length}</b> de {SPACE.length} con dueño · el universo vale <b>{eur(worth)}</b>
      </p>
    </section>
  )
}

export default memo(InmoSpace)
