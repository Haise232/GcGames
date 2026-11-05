// Las 7 islas de la Inmobiliaria (reglas en inmo.js, ISLANDS): arriba, el mapa del archipiélago, con cuánto de cada isla
// tiene dueño; debajo, la isla elegida (cuántas tienes y el bonus) y sus doce propiedades en fichas (icono, tipo, precio,
// dueño, mejoras y lo que rinden). Al tocar una ficha se abre su título de propiedad en el panel de al lado.
import { memo, useMemo } from 'react'
import Avatar from '../comun/Avatar.jsx'
import { eur } from '../comun/money.js'
import { GROUPS, ISLANDS, ISLA_TIERS, MAX_ISLA_LEVEL, groupSize, levelName, rentPerHour } from './inmo.js'
import { hueOf } from './InmoCity.jsx'

// Las islas de oeste a este en un mapa de 1000 × 400. Las siluetas salen de las costas reales (longitud y latitud,
// simplificadas y suavizadas) y cada isla va un 30 % más grande que en la realidad para que se puedan tocar bien.
// label: dónde va su cartel y hacia qué lado del punto (l: a la derecha, r: a la izquierda, t: debajo, b: encima).
export const ISLAS = [
  { id: 'elhierro', label: [100, 358, 'l'], d: 'M18.9 363.8C17.6 360.1 24.9 352.2 29.3 349C33.6 345.8 40.1 344.1 44.9 344.6C49.6 345.1 54 352.5 57.9 352C61.8 351.5 64.6 345.6 68.3 341.6C72 337.7 76.3 328.9 80 328.4C83.7 327.9 89.5 334 90.4 338.7C91.2 343.4 88.2 350.5 85.2 356.4C82.1 362.3 75.6 368.6 72.2 374.1C68.7 379.6 67.6 388.7 64.4 389.5C61.1 390.2 57.2 381.6 52.7 378.6C48.1 375.5 42.7 373.6 37.1 371.2C31.4 368.7 20.2 367.5 18.9 363.8Z' },
  { id: 'lapalma', label: [134, 112, 'l'], d: 'M85.4 93.3C92.8 93.3 102.5 92.8 108.8 97.7C115.1 102.7 121.8 114.2 123.1 122.8C124.4 131.4 119 140.1 116.6 149.4C114.2 158.8 112.7 168.4 108.8 178.9C104.9 189.5 97.6 211.4 93.2 212.9C88.9 214.4 86.5 196.4 82.8 187.8C79.1 179.2 75 169.1 71.1 161.2C67.2 153.4 62.5 147.9 59.4 140.6C56.4 133.2 52.1 124.1 52.9 116.9C53.8 109.8 59.2 101.7 64.6 97.7C70 93.8 78.1 93.3 85.4 93.3Z' },
  { id: 'lagomera', label: [176, 268, 'r'], d: 'M208.7 244.1C216.1 243.2 228 245.9 234.7 251.5C241.4 257.2 249.9 270 249 278.1C248.1 286.2 237.1 296.3 229.5 300.2C221.9 304.2 211.1 304.4 203.5 301.7C195.9 299 186.2 291.4 184 284C181.8 276.6 186.4 264.1 190.5 257.4C194.6 250.8 201.3 245.1 208.7 244.1Z' },
  { id: 'tenerife', label: [318, 190, 'b'], d: 'M254.6 216.9C257.6 212.7 268.5 213.4 278 211C287.5 208.5 299.7 204.3 311.8 202.1C323.9 199.9 338.7 201.9 350.8 197.7C362.9 193.5 374.6 183.4 384.6 177C394.6 170.6 398 164 410.6 159.3C423.2 154.6 454.4 147.5 460 149C465.6 150.5 449.6 162 444.4 168.2C439.2 174.3 436.6 178 428.8 185.9C421 193.8 405.8 202.6 397.6 215.4C389.4 228.2 385.9 248.4 379.4 262.7C372.9 276.9 368.1 291.2 358.6 301.1C349.1 310.9 331.3 320.2 322.2 321.7C313.1 323.2 310.1 315.8 304 309.9C297.9 304 290.8 295.1 285.8 286.3C280.8 277.4 278.4 265.1 274.1 256.8C269.8 248.4 263 242.7 259.8 236.1C256.5 229.4 251.6 221.1 254.6 216.9Z' },
  { id: 'grancanaria', label: [607, 330, 'l'], d: 'M512.5 251.6C523.3 248.6 540.9 253 551.5 254.5C562.1 256 571 261.9 576.2 260.4C581.4 259 580.3 245.7 582.7 245.7C585.1 245.7 588.1 251.6 590.5 260.4C592.9 269.3 597 286.5 597 298.8C597 311.1 595.5 323.4 590.5 334.3C585.5 345.1 574.9 356.9 567.1 363.8C559.3 370.7 551.9 374.9 543.7 375.6C535.4 376.3 526.3 373.1 517.7 368.2C509 363.3 498.2 355.7 491.7 346.1C485.2 336.5 479.5 322.9 478.7 310.6C477.8 298.3 480.8 282.1 486.5 272.2C492.1 262.4 501.6 254.5 512.5 251.6Z' },
  { id: 'fuerteventura', label: [806, 196, 'r'], d: 'M899.9 105.2C904.3 111.6 909.7 130 910.3 142.1C911 154.1 906.9 166.7 903.8 177.5C900.8 188.3 896.2 197.2 892.1 207C888 216.9 884.8 227.5 879.1 236.6C873.5 245.7 867 255.5 858.3 261.7C849.7 267.8 836.7 270.3 827.1 273.5C817.6 276.7 810.2 276.9 801.1 280.9C792 284.8 783.4 292.9 772.5 297.1C761.7 301.3 740 307.2 736.1 306C732.2 304.7 740.5 296.4 749.1 289.7C757.8 283.1 777.3 275.4 788.1 266.1C799 256.7 805.9 244.4 814.1 233.6C822.4 222.8 831 213.4 837.5 201.1C844 188.8 848.4 173.1 853.1 159.8C857.9 146.5 860.9 130.7 866.1 121.4C871.3 112 878.7 106.4 884.3 103.7C890 101 895.6 98.8 899.9 105.2Z' },
  { id: 'lanzarote', label: [922, 46, 'r'], d: 'M974.4 5.9C980.2 8.4 988.5 21.9 987.4 31C986.3 40.1 973.7 51.2 967.9 60.5C962 69.9 961 77.8 952.3 87.1C943.6 96.5 928.7 111.7 915.9 116.7C903.1 121.6 881.2 121.1 875.6 116.7C870 112.2 877.5 98 882.1 90.1C886.6 82.2 895.5 76.8 902.9 69.4C910.3 62 918.1 54.6 926.3 45.8C934.5 36.9 944.3 22.9 952.3 16.3C960.3 9.6 968.5 3.5 974.4 5.9Z' },
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
const TYPE_NAME = { casa: 'Vivienda', hotel: 'Hotel', comida: 'Restauración', campo: 'Campo', negocio: 'Negocio', ocio: 'Ocio', barco: 'Barco' }
// Rutas de ferry que se pintan a rayas entre islas (del puerto de una al de otra).
const FERRIES = [
  [114, 146, 307, 307],
  [245, 281, 307, 307],
  [89, 345, 307, 307],
  [429, 183, 510, 269],
  [585, 260, 773, 310],
  [585, 260, 903, 178],
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
  const size = groupSize[island]
  const mineHere = list.filter((c) => byCell.get(c.i)?.owner.me).length
  const tier = mineHere >= size ? 2 : ISLA_TIERS.reduce((m, [n, k]) => (mineHere >= n ? k : m), 1)
  const steps = [...ISLA_TIERS, [size, 2]]
  const next = steps.find(([n]) => mineHere < n)
  const g = GROUPS[island]
  const info = ISLA_INFO[island]
  const pick = (id) => onIsland(id)
  return (
    <section className="is-islands" aria-label="Las 7 islas">
      <div className="is-map">
        <svg viewBox="0 0 1000 400" role="group" aria-label="Mapa de Canarias">
          <defs>
            <radialGradient id="is-sea" cx="0.45" cy="0.45" r="0.85">
              <stop offset="0" stopColor="#1fa3c4" />
              <stop offset="0.6" stopColor="#11698f" />
              <stop offset="1" stopColor="#08395a" />
            </radialGradient>
            <linearGradient id="is-relief" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.28" />
            </linearGradient>
            <filter id="is-blur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            <pattern id="is-grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M100 0H0V100" fill="none" stroke="#bff3ff" strokeOpacity="0.07" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1000" height="400" fill="url(#is-sea)" />
          <rect width="1000" height="400" fill="url(#is-grid)" />
          <g className="is-waves" stroke="#d6f8ff" strokeOpacity="0.2" fill="none" strokeWidth="2" strokeLinecap="round">
            {Array.from({ length: 18 }, (_, k) => (
              <path key={k} d={`M${(k * 173 + 40) % 960} ${20 + ((k * 89) % 370)} q10 -6 20 0 t20 0`} />
            ))}
          </g>
          <g className="is-ferries" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" fill="none">
            {FERRIES.map(([x1, y1, x2, y2], k) => (
              <path key={k} d={`M${x1} ${y1} Q${(x1 + x2) / 2} ${(y1 + y2) / 2 + 18} ${x2} ${y2}`} />
            ))}
          </g>
          <text x="470" y="62" textAnchor="middle" className="is-ocean">Océano Atlántico</text>
          <g className="is-compass" transform="translate(948 340)">
            <circle r="24" />
            <path d="M0 -30 L6 0 L0 30 L-6 0 Z M-30 0 L0 -5 L30 0 L0 5 Z" />
            <path d="M0 -30 L6 0 L-6 0 Z" className="is-compass__n" />
            <text y="-36" textAnchor="middle">N</text>
          </g>
          {ISLAS.map((is) => {
            const on = island === is.id
            return (
              <g
                key={is.id}
                className={`is-island ${on ? 'is-on' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${GROUPS[is.id].name}: ${owned[is.id] ?? 0} de ${groupSize[is.id]} con dueño`}
                onClick={() => pick(is.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(is.id))}
                style={{ '--c': GROUPS[is.id].color }}
              >
                <path className="is-island__shallow" d={is.d} filter="url(#is-blur)" />
                <path className="is-island__sand" d={is.d} />
                <path className="is-island__land" d={is.d} />
                <path className="is-island__relief" d={is.d} fill="url(#is-relief)" />
                {is.id === 'tenerife' && (
                  <g className="is-teide" transform="translate(327 242)">
                    <path d="M-20 10 L0 -16 L20 10 Z" />
                    <path d="M-7 -7 L0 -16 L7 -7 L3 -5 L0 -8 L-3 -5 Z" className="is-teide__snow" />
                  </g>
                )}
              </g>
            )
          })}
          {ISLAS.map((is) => {
            const n = owned[is.id] ?? 0
            const total = groupSize[is.id]
            const name = GROUPS[is.id].name
            const w = Math.max(110, name.length * 13 + 30)
            const [x, y, side] = is.label
            const left = side === 'l' ? x : side === 'r' ? x - w : x - w / 2
            const top = side === 'b' ? y - 52 : side === 't' ? y : y - 26
            return (
              <g
                key={`t-${is.id}`}
                className={`is-tag ${island === is.id ? 'is-on' : ''}`}
                transform={`translate(${left} ${top})`}
                style={{ '--c': GROUPS[is.id].color }}
                onClick={() => pick(is.id)}
                aria-hidden="true"
              >
                <rect className="is-tag__bg" width={w} height="52" rx="11" />
                <rect className="is-tag__band" width="5" height="52" rx="2.5" />
                <text x="15" y="23" className="is-tag__name">
                  {name}
                </text>
                <rect x="15" y="33" width={w - 62} height="7" rx="3" className="is-tag__track" />
                <rect x="15" y="33" width={((w - 62) * n) / total} height="7" rx="3" className="is-tag__fill" />
                <text x={w - 10} y="41" textAnchor="end" className="is-tag__count">
                  {n}/{total}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="is-chips" role="tablist" aria-label="Elige isla">
        {ISLAS.map((is) => (
          <button
            key={is.id}
            type="button"
            role="tab"
            aria-selected={island === is.id}
            className={island === is.id ? 'is-on' : ''}
            style={{ '--c': GROUPS[is.id].color }}
            onClick={() => pick(is.id)}
          >
            {GROUPS[is.id].name}
          </button>
        ))}
      </div>

      <header className="is-head" style={{ '--c': g.color }} key={island}>
        <span className="is-head__icon" aria-hidden="true">
          {info.icon}
        </span>
        <div className="is-head__title">
          <h2>{g.name}</h2>
          <p>{info.motto}</p>
        </div>
        <div className="is-head__bonus">
          <small>Bonus de alquiler</small>
          <b>×{tier.toLocaleString('es-ES')}</b>
        </div>
        <div className="is-track" aria-label={`Tienes ${mineHere} de ${size}`}>
          <div className="is-track__cells">
            {list.map((c, k) => {
              const own = byCell.get(c.i)
              return <i key={c.i} className={own?.owner.me ? 'is-mine' : own ? 'is-taken' : undefined} style={{ '--k': k }} />
            })}
          </div>
          <div className="is-track__marks">
            {steps.map(([n, k]) => (
              <span key={n} className={mineHere >= n ? 'is-done' : undefined} style={{ left: `${(n / size) * 100}%` }}>
                {n} · ×{k.toLocaleString('es-ES')}
              </span>
            ))}
          </div>
          <p>
            Tienes <b>{mineHere}</b> de {size}
            {next ? (
              <>
                {' '}
                · te faltan {next[0] - mineHere} para <b>×{next[1].toLocaleString('es-ES')}</b>
              </>
            ) : (
              <> · ¡la isla entera es tuya!</>
            )}
          </p>
        </div>
      </header>

      <ul className="is-grid" key={`g-${island}`}>
        {list.map((c, k) => {
          const own = byCell.get(c.i)
          return (
            <li key={c.i} style={{ '--k': k }}>
              <button
                type="button"
                className={`is-card ${own ? 'is-owned' : ''} ${own?.owner.me ? 'is-mine' : ''} ${selected === c.i ? 'is-selected' : ''}`}
                style={{ '--c': g.color, '--oh': own ? hueOf(own.owner.name) : 0 }}
                onClick={() => onSelect(c.i)}
                aria-pressed={selected === c.i}
              >
                <span className="is-card__top">
                  <span className="is-card__icon" aria-hidden="true">
                    {c.icon}
                  </span>
                  {own && own.level > 0 ? (
                    <span className="is-card__stars" aria-label={`${own.level} de ${MAX_ISLA_LEVEL} mejoras`}>
                      {'★'.repeat(own.level)}
                      <span>{'★'.repeat(MAX_ISLA_LEVEL - own.level)}</span>
                    </span>
                  ) : (
                    <span className="is-card__type">{TYPE_NAME[c.type]}</span>
                  )}
                </span>
                <span className="is-card__name">{c.name}</span>
                {own ? (
                  <span className="is-card__own">
                    <Avatar name={own.owner.name} src={own.owner.avatar} size={24} />
                    <span>
                      <b>{own.owner.me ? 'Tuya' : own.owner.name}</b>
                      <small>
                        {eur(own.perHour)}/h · {levelName(own.level, c.i)}
                      </small>
                    </span>
                  </span>
                ) : (
                  <span className="is-card__buy">
                    <b>{eur(c.price)}</b>
                    <small>{eur(rentPerHour(c.price, c.group, 1))}/h</small>
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
