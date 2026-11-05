// Las 7 islas de la Inmobiliaria (reglas en inmo.js, ISLANDS): arriba, el mapa del archipiélago, con cuánto de cada isla
// tiene dueño; debajo, las doce propiedades de la isla elegida en fichas (icono, precio, dueño, mejoras y lo que rinden).
// Al tocar una ficha se abre su título de propiedad en el panel de al lado, como en la ciudad.
import { memo, useMemo } from 'react'
import Avatar from '../comun/Avatar.jsx'
import { eur } from '../comun/money.js'
import { GROUPS, ISLANDS, ISLA_TIERS, MAX_ISLA_LEVEL, groupSize, levelName } from './inmo.js'
import { hueOf } from './InmoCity.jsx'

// Las islas de oeste a este, con su silueta (aproximada) en un mapa de 1000 × 440 y dónde va su nombre.
export const ISLAS = [
  { id: 'elhierro', label: [70, 405], d: 'M40 372 L72 352 L104 360 L118 384 L96 398 L74 392 L56 404 L38 392 Z' },
  { id: 'lapalma', label: [118, 70], d: 'M104 96 L132 92 L142 120 L138 168 L128 214 L116 236 L104 208 L98 160 L96 120 Z' },
  { id: 'lagomera', label: [222, 268], d: 'M196 300 L214 284 L240 282 L258 294 L254 318 L232 328 L208 324 Z' },
  { id: 'tenerife', label: [356, 190], d: 'M286 284 L300 250 L336 216 L390 196 L438 176 L452 186 L432 210 L404 236 L372 262 L340 292 L308 306 Z' },
  { id: 'grancanaria', label: [560, 238], d: 'M516 290 L512 252 L530 222 L566 210 L600 220 L616 252 L608 288 L582 310 L546 314 Z' },
  { id: 'fuerteventura', label: [790, 200], d: 'M708 330 L736 318 L760 292 L782 252 L800 214 L816 178 L838 146 L852 156 L836 196 L818 238 L800 282 L778 316 L748 338 L720 346 Z' },
  { id: 'lanzarote', label: [900, 70], d: 'M852 132 L870 108 L894 92 L922 76 L948 66 L958 80 L940 100 L916 120 L888 136 L864 144 Z' },
]

function InmoIslas({ island, onIsland, cells, selected, onSelect }) {
  const byCell = useMemo(() => new Map(cells.map((c) => [c.casilla, c])), [cells])
  const owned = useMemo(() => {
    const out = {}
    for (const c of cells) {
      const g = ISLANDS.find((p) => p.i === c.casilla)?.group
      if (g) out[g] = (out[g] ?? 0) + 1
    }
    return out
  }, [cells])
  const list = ISLANDS.filter((c) => c.group === island)
  const mineHere = list.filter((c) => byCell.get(c.i)?.owner.me).length
  const tier = mineHere >= groupSize[island] ? 2 : ISLA_TIERS.reduce((m, [n, k]) => (mineHere >= n ? k : m), 1)
  const next = ISLA_TIERS.find(([n]) => mineHere < n) ?? (mineHere < groupSize[island] ? [groupSize[island], 2] : null)
  return (
    <section className="is-islands" aria-label="Las 7 islas">
      <div className="is-map">
        <svg viewBox="0 0 1000 440" role="group" aria-label="Mapa de Canarias">
          <defs>
            <radialGradient id="is-sea" cx="0.5" cy="0.4" r="0.8">
              <stop offset="0" stopColor="#1b8fb0" />
              <stop offset="1" stopColor="#0a3a5c" />
            </radialGradient>
          </defs>
          <rect width="1000" height="440" fill="url(#is-sea)" />
          <g className="is-waves" stroke="#c8f6ff" strokeOpacity="0.18" fill="none" strokeWidth="2">
            {Array.from({ length: 16 }, (_, k) => (
              <path key={k} d={`M${(k * 173) % 980} ${30 + ((k * 97) % 380)} q12 -6 24 0 t24 0`} />
            ))}
          </g>
          {ISLAS.map((is) => {
            const g = GROUPS[is.id]
            const n = owned[is.id] ?? 0
            const on = island === is.id
            return (
              <g
                key={is.id}
                className={`is-island ${on ? 'is-on' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${g.name}: ${n} de ${groupSize[is.id]} con dueño`}
                onClick={() => onIsland(is.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onIsland(is.id))}
                style={{ '--c': g.color }}
              >
                <path className="is-island__shore" d={is.d} />
                <path className="is-island__land" d={is.d} />
                <text x={is.label[0]} y={is.label[1]} textAnchor="middle" className="is-island__name">
                  {g.name}
                </text>
                <text x={is.label[0]} y={is.label[1] + 20} textAnchor="middle" className="is-island__count">
                  {n}/{groupSize[is.id]}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <header className="is-head" style={{ '--c': GROUPS[island].color }}>
        <h2>{GROUPS[island].name}</h2>
        <p>
          Tienes <b>{mineHere}</b> de {groupSize[island]}
          {tier > 1 && (
            <>
              {' '}
              · alquiler <b>×{tier.toLocaleString('es-ES')}</b>
            </>
          )}
          {next && <> · con {next[0]}, ×{next[1].toLocaleString('es-ES')}</>}
        </p>
      </header>

      <ul className="is-grid">
        {list.map((c) => {
          const own = byCell.get(c.i)
          return (
            <li key={c.i}>
              <button
                type="button"
                className={`is-card ${own ? 'is-owned' : ''} ${own?.owner.me ? 'is-mine' : ''} ${selected === c.i ? 'is-selected' : ''}`}
                style={{ '--c': GROUPS[c.group].color, '--oh': own ? hueOf(own.owner.name) : 0 }}
                onClick={() => onSelect(c.i)}
                aria-pressed={selected === c.i}
              >
                <span className="is-card__icon" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="is-card__name">{c.name}</span>
                {own ? (
                  <span className="is-card__own">
                    <Avatar name={own.owner.name} src={own.owner.avatar} size={20} />
                    <span>
                      {own.owner.me ? 'Tuya' : own.owner.name}
                      <small>
                        {eur(own.perHour)}/h · {levelName(own.level, c.i)}
                      </small>
                    </span>
                  </span>
                ) : (
                  <span className="is-card__price">{eur(c.price)}</span>
                )}
                {own && own.level > 0 && (
                  <span className="is-card__stars" aria-label={`${own.level} de ${MAX_ISLA_LEVEL} mejoras`}>
                    {'★'.repeat(own.level)}
                    {'☆'.repeat(MAX_ISLA_LEVEL - own.level)}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default memo(InmoIslas)
