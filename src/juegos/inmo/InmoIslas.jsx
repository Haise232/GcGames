// Las 7 islas de la Inmobiliaria (reglas en inmo.js, ISLANDS). Primero, el mapa del archipiélago (una imagen de relieve
// real) con cada isla tocable y, debajo, una ficha por isla. Al tocar una isla se abre su tablero: sus 24 propiedades
// alrededor, de la más barata a la más cara, y en el centro la ciudad de la isla (InmoIslaCity.jsx), que se va
// construyendo con lo que compra cada uno. Al tocar una propiedad se abre su título en el panel de al lado.
import { memo, useMemo } from 'react'
import Avatar from '../comun/Avatar.jsx'
import { eur } from '../comun/money.js'
import { GROUPS, ISLANDS, ISLA_TIERS, MAX_ISLA_LEVEL, groupSize, levelName } from './inmo.js'
import { hueOf } from './InmoCity.jsx'
import InmoIslaCity from './InmoIslaCity.jsx'

// Mapa: «Relief map of Spain Canary Islands» de Tschubby (Wikimedia Commons, CC BY-SA 3.0), en public/inmo.
// Cada isla, en % de la imagen: el centro y el tamaño de la zona que se toca, y dónde va su cartel.
export const ISLAS = [
  { id: 'lapalma', at: [10.4, 39.8], size: [6.5, 21], tag: [10.4, 22] },
  { id: 'elhierro', at: [7.6, 83.6], size: [6.5, 11], tag: [7.6, 72] },
  { id: 'lagomera', at: [22.7, 65.8], size: [5.5, 10.5], tag: [22.7, 78] },
  { id: 'tenerife', at: [35.2, 57], size: [16, 29], tag: [36, 38] },
  { id: 'grancanaria', at: [53.9, 74.4], size: [9.5, 22], tag: [53.9, 57] },
  { id: 'fuerteventura', at: [82.5, 52], size: [13.5, 35], tag: [74, 36] },
  { id: 'lanzarote', at: [91.5, 22.8], size: [9.5, 19], tag: [83, 12] },
]
export const ISLA_INFO = {
  grancanaria: { motto: 'Un continente en miniatura', icon: '🌴' },
  tenerife: { motto: 'La isla del Teide', icon: '🌋' },
  lanzarote: { motto: 'La isla de los volcanes', icon: '🔥' },
  fuerteventura: { motto: 'Playas sin fin y mucho viento', icon: '🏖️' },
  lapalma: { motto: 'La isla bonita', icon: '🌲' },
  lagomera: { motto: 'La isla del silbo', icon: '🎶' },
  elhierro: { motto: 'La isla del meridiano', icon: '🦎' },
}
const ORDER = ISLAS.map((is) => is.id)

// Las propiedades de cada isla, de la más barata a la más cara (así van en el tablero y en la ciudad).
const LISTS = Object.fromEntries(ORDER.map((id) => [id, ISLANDS.filter((c) => c.group === id).sort((a, b) => a.price - b.price || a.i - b.i)]))
export const islaList = (id) => LISTS[id]

// Fila y columna (rejilla de 7 × 7) de la casilla k del tablero de una isla: la primera abajo a la derecha y en
// sentido horario, como la ciudad.
function place(k) {
  if (k <= 6) return { row: 7, col: 7 - k, side: 'bottom' }
  if (k <= 12) return { row: 13 - k, col: 1, side: 'left' }
  if (k <= 18) return { row: 1, col: k - 11, side: 'top' }
  return { row: k - 17, col: 7, side: 'right' }
}

const tierOf = (n, size) => (n >= size ? 2 : ISLA_TIERS.reduce((m, [k, x]) => (n >= k ? x : m), 1))
const fmtX = (x) => `×${x.toLocaleString('es-ES')}`

function Archipelago({ count, mineCount, onIsland }) {
  return (
    <section className="is-islands" aria-label="Las 7 islas">
      <div className="is-map">
        <img src="/inmo/canarias.webp" alt="Mapa de relieve de las Islas Canarias" width="1920" height="875" draggable="false" />
        {ISLAS.map((is) => (
          <button
            key={is.id}
            type="button"
            className="is-spot"
            style={{ left: `${is.at[0]}%`, top: `${is.at[1]}%`, width: `${is.size[0]}%`, height: `${is.size[1]}%`, '--c': GROUPS[is.id].color }}
            onClick={() => onIsland(is.id)}
            aria-label={`Abrir ${GROUPS[is.id].name}`}
          />
        ))}
        {ISLAS.map((is) => {
          const n = count[is.id] ?? 0
          const total = groupSize[is.id]
          return (
            <button
              key={`t-${is.id}`}
              type="button"
              className="is-tag"
              style={{ left: `${is.tag[0]}%`, top: `${is.tag[1]}%`, '--c': GROUPS[is.id].color }}
              onClick={() => onIsland(is.id)}
              tabIndex={-1}
              aria-hidden="true"
            >
              <b>{GROUPS[is.id].name}</b>
              <span className="is-tag__bar">
                <i style={{ width: `${(n / total) * 100}%` }} />
              </span>
              <small>
                {n}/{total}
                {mineCount[is.id] ? ` · ${mineCount[is.id]} tuyas` : ''}
              </small>
            </button>
          )
        })}
        <small className="is-credit">
          Mapa:{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Relief_map_of_Spain_Canary_Islands.png" target="_blank" rel="noreferrer">
            Tschubby
          </a>
          , CC BY-SA 3.0
        </small>
      </div>

      <p className="is-hint">Toca una isla para entrar en su ciudad y ver todo lo que se puede comprar.</p>

      <ul className="is-list">
        {ORDER.map((id) => {
          const list = LISTS[id]
          const n = count[id] ?? 0
          const mine = mineCount[id] ?? 0
          return (
            <li key={id}>
              <button type="button" className="is-island-card" style={{ '--c': GROUPS[id].color }} onClick={() => onIsland(id)}>
                <span className="is-island-card__icon" aria-hidden="true">
                  {ISLA_INFO[id].icon}
                </span>
                <span className="is-island-card__text">
                  <b>{GROUPS[id].name}</b>
                  <small>{ISLA_INFO[id].motto}</small>
                  <small>
                    {list.length} propiedades · de {eur(list[0].price)} a {eur(list[list.length - 1].price)}
                  </small>
                </span>
                <span className="is-island-card__count">
                  <span className="is-tag__bar">
                    <i style={{ width: `${(n / list.length) * 100}%` }} />
                  </span>
                  <small>
                    {n}/{list.length} con dueño
                  </small>
                  {mine > 0 && <small className="is-gold">Tuyas: {mine} · {fmtX(tierOf(mine, list.length))}</small>}
                </span>
                <span className="is-island-card__go" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Board({ island, cells, selected, onSelect, onIsland }) {
  const list = LISTS[island]
  const byCell = useMemo(() => new Map(cells.map((c) => [c.casilla, c])), [cells])
  const here = useMemo(() => cells.filter((c) => list.some((p) => p.i === c.casilla)), [cells, list])
  const size = list.length
  const mine = here.filter((c) => c.owner.me).length
  const tier = tierOf(mine, size)
  const next = [...ISLA_TIERS, [size, 2]].find(([n]) => mine < n)
  const k = ORDER.indexOf(island)
  const go = (d) => onIsland(ORDER[(k + d + ORDER.length) % ORDER.length])
  return (
    <section className="is-board-wrap" aria-label={GROUPS[island].name} style={{ '--c': GROUPS[island].color }}>
      <div className="is-bar">
        <button type="button" className="is-bar__back" onClick={() => onIsland(null)}>
          ‹ Mapa
        </button>
        <button type="button" className="is-bar__arrow" onClick={() => go(-1)} aria-label="Isla anterior">
          ◀
        </button>
        <div className="is-bar__title">
          <b>
            {ISLA_INFO[island].icon} {GROUPS[island].name}
          </b>
          <small>
            Tienes <em>{mine}</em> de {size} · alquiler <em>{fmtX(tier)}</em>
            {next ? ` · con ${next[0]}, ${fmtX(next[1])}` : ' · ¡la isla entera!'}
          </small>
        </div>
        <button type="button" className="is-bar__arrow" onClick={() => go(1)} aria-label="Isla siguiente">
          ▶
        </button>
      </div>

      <div className="im-board im-board--isla" key={island}>
        {list.map((cell, n) => {
          const { row, col, side } = place(n)
          const own = byCell.get(cell.i)
          return (
            <button
              key={cell.i}
              type="button"
              className={`im-cell im-cell--${side} im-cell--isla ${own ? 'is-owned' : ''} ${own?.owner.me ? 'is-mine' : ''} ${selected === cell.i ? 'is-selected' : ''}`}
              style={{ gridRow: row, gridColumn: col, '--band': GROUPS[island].color, '--oh': own ? hueOf(own.owner.name) : 0, '--k': n }}
              onClick={() => onSelect(cell.i)}
              aria-pressed={selected === cell.i}
              aria-label={`${cell.name}: ${own ? `de ${own.owner.me ? 'ti' : own.owner.name}, ${levelName(own.level, cell.i)}` : `libre, ${eur(cell.price)}`}`}
              title={cell.name}
            >
              {/* Como las calles de la ciudad: la franja del color de la isla, con su icono y una casita por mejora. */}
              <span className="im-cell__band">
                <span className="im-cell__emblem" aria-hidden="true">
                  {cell.icon}
                </span>
                {own?.level > 0 && (
                  <span className="im-houses" aria-hidden="true">
                    {Array.from({ length: own.level }, (_, h) => (
                      <i key={h} className={own.level >= MAX_ISLA_LEVEL ? 'is-full' : undefined} />
                    ))}
                  </span>
                )}
              </span>
              <span className="im-cell__name">{cell.name}</span>
              {own ? (
                <span className="im-cell__owner">
                  <Avatar name={own.owner.name} src={own.owner.avatar} size={20} />
                </span>
              ) : (
                <span className="im-cell__price">{eur(cell.price)}</span>
              )}
            </button>
          )
        })}
        <InmoIslaCity island={island} list={list} motto={ISLA_INFO[island].motto} cells={here} selected={selected} onSelect={onSelect} />
      </div>
    </section>
  )
}

function InmoIslas({ island, onIsland, cells, selected, onSelect }) {
  const { count, mineCount } = useMemo(() => {
    const count = {}
    const mineCount = {}
    for (const c of cells) {
      const g = ISLANDS.find((p) => p.i === c.casilla)?.group
      if (!g) continue
      count[g] = (count[g] ?? 0) + 1
      if (c.owner.me) mineCount[g] = (mineCount[g] ?? 0) + 1
    }
    return { count, mineCount }
  }, [cells])
  if (!island) return <Archipelago count={count} mineCount={mineCount} onIsland={onIsland} />
  return <Board island={island} cells={cells} selected={selected} onSelect={onSelect} onIsland={onIsland} />
}

export default memo(InmoIslas)
