import { memo, useEffect, useRef, useState } from 'react'
import Avatar from '../comun/Avatar.jsx'
import { eur } from '../comun/money.js'
import { GROUPS } from './inmo.js'
import { Backdrop, Box, CityDefs, Crane, Dust, ForSale, Lamp, Palm, PlaneShape, Roof, Tree, Umbrella, canaryHour, f1, hueOf, line, phaseOf, poly, pt, rhomb } from './InmoCity.jsx'

// La ciudad de cada isla, en el centro de su tablero (InmoIslaBoard.jsx): la misma isla isométrica que la ciudad
// (InmoCity.jsx, de donde salen las piezas), más de cerca y con 24 solares, uno por propiedad. Las baratas quedan al fondo, junto a la
// montaña, y las caras delante, junto a la playa. Libre se ve el cartel de «Se vende»; con dueño, su edificio según lo
// que es (casa, hotel, restaurante, finca, negocio, ocio o transporte) y más grande con cada mejora. Los barcos de los
// dueños navegan delante. Cada isla tiene su montaña al fondo, su suelo (verde, majorero o de picón) y su vegetación.

// Rejilla de 8 × 8 [fila, columna] (más pequeña que la de la ciudad, para verla más de cerca): calle en la fila 3 y en
// la columna 3, paseo en la 6 y playa en la 7. Los solares, de atrás hacia delante (la propiedad k más barata va en el
// solar k; las más caras, junto al paseo).
const N = 8
export const ISLA_LOTS = [
  [0, 0], [0, 1], [0, 2], [0, 4], [0, 6], [0, 7],
  [1, 1], [1, 5], [1, 7],
  [2, 0], [2, 2], [2, 4], [2, 6], [2, 7],
  [4, 0], [4, 2], [4, 4], [4, 6], [4, 7],
  [5, 0], [5, 2], [5, 4], [5, 5], [5, 7],
]
const LOT_AT = new Map(ISLA_LOTS.map(([r, c], k) => [`${r},${c}`, k]))
const groundOf = (r, c) => (r === 7 ? 'sand' : r === 6 ? 'paseo' : LOT_AT.has(`${r},${c}`) ? 'lot' : r === 3 && c === 3 ? 'cross' : r === 3 || (c === 3 && r < 6) ? 'road' : 'grass')
// El encuadre: la isla de 8 × 8 entera y el cielo justo para la montaña.
const VB = { x: -272, y: -172, size: 544 }
const pct = ([x, y]) => ({ left: `${((x - VB.x) / VB.size) * 100}%`, top: `${((y - VB.y) / VB.size) * 100}%` })

// Cómo es cada isla: suelo (seco: palmeras y tuneras; verde: árboles) y la montaña del fondo.
const DRY = new Set(['lanzarote', 'fuerteventura'])
const MOUNTS = {
  grancanaria: (
    <>
      <path className="im-mount" d="M-340 62 L-290 40 Q-220 -4 -160 -10 Q-100 -6 -40 34 L10 62 Z" />
      <path className="im-mount" d="M-176 -8 L-174 -34 L-168 -40 L-162 -34 L-161 -9 Z" />
      <path className="im-mount im-mount--far" d="M90 62 Q180 20 260 30 T340 44 L340 62 Z" />
    </>
  ),
  tenerife: null,
  lanzarote: (
    <>
      {[
        [-300, 30, 50],
        [-210, 14, 66],
        [-120, 34, 46],
        [150, 26, 54],
        [250, 38, 42],
      ].map(([x, top, w], k) => (
        <g key={k}>
          <path className="im-mount im-mount--volcano" d={`M${x - w} 62 L${x - 9} ${top} L${x + 9} ${top} L${x + w} 62 Z`} />
          <path className="im-crater" d={`M${x - 9} ${top} Q${x} ${top + 5} ${x + 9} ${top} Z`} />
        </g>
      ))}
    </>
  ),
  fuerteventura: (
    <>
      <path className="im-mount im-mount--dry" d="M-340 62 Q-280 30 -220 36 Q-160 22 -100 40 Q-50 48 0 62 Z" />
      <path className="im-mount im-mount--dry im-mount--far" d="M60 62 Q140 34 210 42 Q280 30 340 46 L340 62 Z" />
    </>
  ),
  lapalma: (
    <>
      <path className="im-mount" d="M-340 62 L-320 20 Q-260 -40 -180 -46 Q-100 -40 -40 10 L0 62 Z" />
      <path className="im-mount im-mount--green" d="M-310 62 Q-240 34 -170 40 Q-110 44 -60 62 Z" />
      <path className="im-mount im-mount--far" d="M120 62 Q200 30 260 36 T340 40 L340 62 Z" />
    </>
  ),
  lagomera: (
    <>
      <path className="im-mount im-mount--green" d="M-340 62 Q-300 0 -220 -6 L-80 -6 Q-20 0 20 62 Z" />
      <path className="im-mount" d="M-150 -6 L-146 -24 L-138 -28 L-132 -22 L-130 -6 Z" />
      <path className="im-mount im-mount--far" d="M110 62 L170 30 L190 22 L205 30 L270 50 L340 62 Z" />
      <path className="im-snow" d="M178 26 L190 22 L200 27 L190 26 Z" />
    </>
  ),
  elhierro: (
    <>
      <path className="im-mount im-mount--green" d="M-340 62 L-300 -10 Q-230 -30 -150 -24 L-110 -16 L-60 62 Z" />
      <path className="im-mount im-mount--far" d="M80 62 Q160 40 240 46 T340 50 L340 62 Z" />
    </>
  ),
}

function Pool({ r, c, s = 0.3 }) {
  return (
    <g>
      <polygon className="im-f im-f--t" style={{ '--c': '#f2efe6' }} points={rhomb(r, c, s + 0.06)} />
      <polygon className="im-pool" points={rhomb(r, c, s)} />
    </g>
  )
}

function Cactus({ r, c }) {
  const [x, y] = pt(r, c)
  return (
    <g className="im-cactus">
      <ellipse className="im-shadow" cx={x + 2} cy={y + 1} rx="5" ry="2" />
      <path d={`M${x} ${y} V${y - 13} M${x} ${y - 7} H${x - 4} V${y - 11} M${x} ${y - 9} H${x + 4} V${y - 14}`} />
    </g>
  )
}

function Rock({ r, c }) {
  const [x, y] = pt(r, c)
  return <path className="im-rock" d={`M${x - 7} ${y + 2} L${x - 4} ${y - 4} L${x + 2} ${y - 6} L${x + 7} ${y + 1} Z`} />
}

// Una bandera en un mástil, del color de la isla.
function Flag({ r, c, z, color }) {
  const [x, y] = pt(r, c, z)
  return (
    <g>
      {line([x, y], [x, y - 14], 'im-pole', 1)}
      <path className="im-flag" d={`M${x} ${y - 14} l10 2.5 l-10 3.5 z`} fill={color} />
    </g>
  )
}

// Lo que hay en el solar, según el tipo de propiedad y las mejoras (0 a 3). h: hasta dónde llega (para la foto del dueño).
function build(cell, level, band) {
  const pastel = `color-mix(in srgb, ${band} 30%, #fbf5e8)`
  const lv = level
  switch (cell.type) {
    case 'casa': {
      if (lv === 3)
        return {
          h: 34,
          node: (r, c) => (
            <>
              <Pool r={r + 0.3} c={c + 0.26} s={0.2} />
              <Box r={r - 0.08} c={c - 0.08} ac={0.3} ar={0.24} h={14} color="#f6f3ec" win="glass" />
              <Box r={r - 0.14} c={c - 0.14} ac={0.22} ar={0.18} h={12} z={14} color="#f6f3ec" win="glass" />
              <Box r={r - 0.14} c={c - 0.14} ac={0.23} ar={0.19} h={2} z={26} color={band} />
            </>
          ),
        }
      const base = (r, c, s = 1) => (
        <>
          <Box r={r} c={c} ac={0.27 * s} h={lv ? 22 : 12} color={pastel} win="res" />
          {lv > 0 && <Box r={r} c={c} ac={0.28 * s} h={2} z={11} color={band} />}
          <Roof r={r} c={c} ac={0.3 * s} z={lv ? 22 : 12} h={9} color="#c4573a" />
        </>
      )
      if (lv === 2)
        return {
          h: 34,
          node: (r, c) => (
            <>
              {base(r - 0.14, c - 0.14, 0.9)}
              <Pool r={r + 0.28} c={c + 0.26} s={0.2} />
            </>
          ),
        }
      return { h: lv ? 34 : 24, node: (r, c) => base(r, c) }
    }
    case 'hotel': {
      const hs = [40, 40, 70, 110][lv]
      return {
        h: hs + (lv === 3 ? 26 : 8),
        node: (r, c) => (
          <>
            {lv >= 1 && <Pool r={r + 0.3} c={c + 0.18} s={0.18} />}
            {lv === 3 && <Box r={r} c={c} ac={0.42} h={10} color={band} win="glass" />}
            <Box r={r - 0.06} c={c - 0.06} ac={lv === 3 ? 0.3 : 0.32} ar={0.28} h={lv === 3 ? hs - 10 : hs} z={lv === 3 ? 10 : 0} color={lv >= 2 ? '#e6e1d6' : '#efe6d2'} win={lv >= 2 ? 'hotel' : 'res'} />
            <Box r={r - 0.06} c={c - 0.06} ac={0.33} ar={0.29} h={4} z={hs} color={band} />
            {lv === 3 && (
              <>
                {line(pt(r, c, hs + 4), pt(r, c, hs + 18), 'im-pole', 1.2)}
                <circle className="im-beacon" cx={pt(r, c)[0]} cy={pt(r, c, hs + 18)[1]} r="2.2" />
              </>
            )}
          </>
        ),
      }
    }
    case 'comida': {
      const h = lv >= 2 ? 18 : 11
      return {
        h: h + (lv === 3 ? 24 : 10),
        node: (r, c) => (
          <>
            <Box r={r - 0.12} c={c - 0.08} ac={0.26} ar={0.2} h={h} color="#f4e6c8" win="glass" />
            <Box r={r - 0.12} c={c - 0.08} ac={0.28} ar={0.22} h={3} z={h} color={band} />
            {lv === 3 && (
              <g>
                <circle className="im-star" cx={pt(r - 0.12, c - 0.08)[0]} cy={pt(r - 0.12, c - 0.08, h + 13)[1]} r="6" />
                <text className="im-star__t" x={pt(r - 0.12, c - 0.08)[0]} y={pt(r - 0.12, c - 0.08, h + 13)[1] + 2.6} textAnchor="middle">
                  ★
                </text>
              </g>
            )}
            <Umbrella r={r + 0.32} c={c + 0.25} color={band} />
            {lv >= 1 && <Umbrella r={r + 0.3} c={c - 0.2} color="#f2b632" />}
            {lv >= 1 && <Umbrella r={r + 0.05} c={c + 0.36} color="#e8443a" />}
          </>
        ),
      }
    }
    case 'campo': {
      return {
        h: lv >= 2 ? 22 : 14,
        node: (r, c) => (
          <>
            <polygon className="im-f im-f--t" style={{ '--c': DRY.has(cell.group) ? '#8a9a4a' : '#4f9a3f' }} points={rhomb(r, c, 0.84)} />
            {[-0.3, -0.1, 0.1, 0.3].map((d) => (
              <g key={d}>{line(pt(r + d, c - 0.38), pt(r + d, c + 0.38), lv >= 1 ? 'im-crop im-crop--wet' : 'im-crop', 2.6)}</g>
            ))}
            {lv < 2 ? (
              <Box r={r - 0.3} c={c + 0.3} ac={0.1} h={7} color="#c9a87a" />
            ) : (
              <>
                <Box r={r - 0.26} c={c + 0.24} ac={0.18} ar={0.14} h={10} color="#d8d2c4" />
                <Roof r={r - 0.26} c={c + 0.24} ac={0.19} ar={0.15} z={10} h={5} color="#8a9099" />
              </>
            )}
            {lv === 3 && (
              <>
                <Box r={r + 0.3} c={c + 0.3} ac={0.12} ar={0.06} h={6} color="#d23b2e" />
                <Box r={r + 0.3} c={c + 0.3} ac={0.12} ar={0.06} h={6} z={6} color="#2b6cc4" />
              </>
            )}
          </>
        ),
      }
    }
    case 'negocio': {
      const h = [14, 22, 32, 60][lv]
      return {
        h: h + 8,
        node: (r, c) => (
          <>
            <Box r={r} c={c} ac={lv === 3 ? 0.3 : 0.3} ar={0.26} h={h} color={lv === 3 ? '#9fc4dc' : '#f3f0ea'} win={lv === 3 ? 'glass' : 'res'} />
            <Box r={r} c={c} ac={0.31} ar={0.27} h={3} z={lv === 3 ? h : 10} color={band} />
            {lv >= 2 && (
              <g transform={`matrix(1 .5 0 1 ${f1(pt(r, c - 0.3, h)[0])} ${f1(pt(r, c - 0.3, h)[1] - 12)})`}>
                <rect width="18" height="9" rx="1" fill={band} stroke="#fff" strokeWidth="1" />
                <text x="9" y="7" textAnchor="middle" className="im-sign-emoji">
                  {cell.icon}
                </text>
              </g>
            )}
          </>
        ),
      }
    }
    case 'ocio': {
      const w = [0.28, 0.32, 0.34, 0.4][lv]
      const h = [8, 10, 12, 14][lv]
      return {
        h: h + 18 + lv * 4,
        node: (r, c) => {
          const top = pt(r, c, h)
          return (
            <>
              <Box r={r} c={c} ac={w} h={h} color="#ece4d2" win="glass" />
              {lv >= 1 && <path className="im-f im-f--t" style={{ '--c': band }} d={`M${f1(top[0] - w * 56)} ${f1(top[1])} A${w * 56} ${w * 46} 0 0 1 ${f1(top[0] + w * 56)} ${f1(top[1])} Z`} />}
              {lv >= 2 && (
                <g className="im-beams">
                  {line(pt(r + 0.3, c - 0.3, h), pt(r + 1, c - 1.6, 120), 'im-beam', 3)}
                  {line(pt(r - 0.3, c + 0.3, h), pt(r - 1.4, c + 1, 120), 'im-beam', 3)}
                </g>
              )}
              {lv === 3 && <circle className="im-beacon" cx={top[0]} cy={top[1] - w * 46} r="2.6" />}
              <text x={top[0]} y={top[1] - (lv >= 1 ? w * 46 + 6 : 6)} textAnchor="middle" className="im-landmark">
                {cell.icon}
              </text>
              {lv === 0 && <Flag r={r + 0.25} c={c + 0.25} z={0} color={band} />}
            </>
          )
        },
      }
    }
    default: {
      // Transporte (barcos, guaguas, teleférico…): la taquilla en el solar; el barco, en el mar.
      return {
        h: 24,
        node: (r, c) => (
          <>
            <Box r={r} c={c} ac={0.2} ar={0.16} h={9} color="#f3f0ea" win="glass" />
            <Roof r={r} c={c} ac={0.24} ar={0.2} z={9} h={6} color={band} />
            <text x={pt(r, c)[0]} y={pt(r, c, 22)[1]} textAnchor="middle" className="im-landmark im-landmark--sm">
              {cell.icon}
            </text>
          </>
        ),
      }
    }
  }
}

function decorOf(r, c, dry) {
  const g = groundOf(r, c)
  const k = (r * 31 + c * 17) % 5
  if (g === 'grass') {
    if (dry) {
      if (k === 0) return [<Palm key="a" r={r - 0.1} c={c} />, <Cactus key="b" r={r + 0.3} c={c - 0.25} />]
      if (k === 1) return <Rock r={r} c={c} />
      if (k === 2) return [<Cactus key="a" r={r - 0.2} c={c + 0.2} />, <Cactus key="b" r={r + 0.2} c={c - 0.15} />]
      if (k === 3) return <Palm r={r} c={c} />
      return null
    }
    if (k === 0) return [<Tree key="a" r={r - 0.2} c={c - 0.15} />, <Tree key="b" r={r + 0.18} c={c + 0.2} s={0.8} />]
    if (k === 1) return <Tree r={r} c={c} s={1.25} />
    if (k === 2) return [<Palm key="a" r={r - 0.1} c={c} />, <Tree key="b" r={r + 0.25} c={c - 0.2} s={0.7} />]
    if (k === 3) return [<Tree key="a" r={r - 0.25} c={c + 0.2} s={0.8} />, <Tree key="b" r={r + 0.05} c={c - 0.22} />]
    return <Palm r={r} c={c} />
  }
  if (g === 'paseo') return k % 2 ? <Palm r={r} c={c} /> : <Lamp r={r + 0.3} c={c} />
  if (g === 'cross') return <Lamp r={r - 0.42} c={c - 0.42} />
  return null
}

const Ground = memo(function Ground({ list, owned }) {
  const tiles = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const g = groundOf(r, c)
      const alt = (r + c) % 2 ? ' is-alt' : ''
      tiles.push(<polygon key={`g${r}-${c}`} className={`im-f im-f--t im-g im-g--${g}${alt}`} points={rhomb(r, c, 1.02)} />)
      if (g === 'lot') {
        const cell = list[LOT_AT.get(`${r},${c}`)]
        if (!cell) continue
        const own = owned.get(cell.i)
        const pad = !own ? 'dirt' : cell.type === 'casa' || cell.type === 'campo' ? 'garden' : 'plaza'
        tiles.push(<polygon key={`p${r}-${c}`} className={`im-f im-f--t im-pad im-pad--${pad}`} points={rhomb(r, c, 0.8)} style={{ '--band': GROUPS[cell.group].color }} />)
      }
    }
  }
  const D = 14
  const edges = []
  const E = N - 0.5
  for (let k = 0; k < N; k++) {
    const W = pt(E, k - 0.5)
    const S = pt(E, k + 0.5)
    edges.push(<polygon key={`el${k}`} className="im-f im-f--l im-edge im-edge--sand" points={poly(W, S, [S[0], S[1] + D], [W[0], W[1] + D])} />)
    const S2 = pt(k + 0.5, E)
    const E2 = pt(k - 0.5, E)
    edges.push(<polygon key={`er${k}`} className={`im-f im-f--r im-edge ${k === N - 1 ? 'im-edge--sand' : ''}`} points={poly(S2, E2, [E2[0], E2[1] + D], [S2[0], S2[1] + D])} />)
  }
  return (
    <g>
      <rect className="im-sea-deep" x="-340" y="359" width="680" height="300" />
      <polygon className="im-shallow" points={poly(pt(-1, -1, -D), pt(-1, N, -D), pt(N + 0.2, N + 0.2, -D), pt(N, -1, -D))} />
      <polygon className="im-foam" points={poly(pt(-0.62, -0.62, -D), pt(-0.62, N - 0.38, -D), pt(N - 0.38, N - 0.38, -D), pt(N - 0.38, -0.62, -D))} />
      {edges}
      {tiles}
      {line(pt(3, -0.5), pt(3, E), 'im-dash', 1)}
      {line(pt(-0.5, 3), pt(5.5, 3), 'im-dash', 1)}
      <polygon className="im-zebra" points={rhomb(3, 3, 0.5)} />
    </g>
  )
})

// Los barcos de los dueños de transporte, delante de la playa: más grandes con cada mejora.
const SEA = [
  [8.9, 1.2],
  [8.9, 3.6],
  [8.9, 6],
  [4, 8.9],
]
function Boat({ slot, level, color, k }) {
  const [r, c] = SEA[slot % SEA.length]
  const [x, y] = pt(r, c)
  const s = [0.8, 1, 1.25, 1.5][level]
  return (
    <g className="im-ship" transform={`translate(${f1(x)} ${f1(y)}) scale(${s})`}>
      <g className="im-bob" style={{ animationDelay: `${k * -0.7}s` }}>
        {level >= 2 ? (
          <>
            <path d="M-22 -10 L18 8 L11 12 L-25 -5 Z" fill="#f4f4f4" />
            <path d="M-18 -11 L14 4 L14 0 L-18 -15 Z" fill={color} />
            <polygon points="-10,-14 2,-8 2,-15 -10,-21" fill="#fff" />
            <polygon points="-6,-20 -2,-18 -2,-25 -6,-27" fill="#d8261e" />
          </>
        ) : (
          <>
            <path d="M-10 -5 L10 5 L5 8 L-12 0 Z" fill={color} />
            {line([-1, 0], [-1, -18], 'im-pole', 1)}
            <path d="M-1 -18 L-1 -2 L9 1 Z" fill="#fff" />
          </>
        )}
      </g>
    </g>
  )
}

const RISE_MS = 2600
const LABEL = { compra: 'Comprada', venta: 'Vendida', mejora: 'Mejorada' }

function InmoIslaCity({ island, list, motto, cells, selected, onSelect }) {
  const [hour, setHour] = useState(() => canaryHour())
  useEffect(() => {
    const timer = setInterval(() => setHour(canaryHour()), 60000)
    return () => clearInterval(timer)
  }, [])
  const band = GROUPS[island].color
  const dry = DRY.has(island)

  // Lo nuevo o mejorado se levanta con grúa y polvo; lo vendido, polvo. Al cambiar de isla se empieza de cero.
  const prev = useRef(null)
  const [fx, setFx] = useState({})
  const timers = useRef(new Set())
  useEffect(() => {
    prev.current = null
    setFx({})
  }, [island])
  useEffect(() => {
    const before = prev.current
    const now = new Map(cells.map((c) => [c.casilla, c]))
    prev.current = now
    if (!before) return
    const next = {}
    const key = Date.now()
    for (const c of cells) {
      const was = before.get(c.casilla)
      if (!was || was.level < c.level) next[c.casilla] = { type: 'rise', key, label: was ? LABEL.mejora : LABEL.compra }
    }
    for (const [k] of before) if (!now.has(k)) next[k] = { type: 'fall', key, label: LABEL.venta }
    if (!Object.keys(next).length) return
    setFx((f) => ({ ...f, ...next }))
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setFx((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v.key !== key)))
    }, RISE_MS)
    timers.current.add(timer)
  }, [cells])
  useEffect(() => {
    const all = timers.current
    return () => all.forEach(clearTimeout)
  }, [])

  const owned = new Map(cells.map((c) => [c.casilla, c]))
  const items = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const k = LOT_AT.get(`${r},${c}`)
      const cell = k === undefined ? null : list[k]
      if (!cell) {
        const d = decorOf(r, c, dry)
        if (d) items.push({ depth: r + c, key: `d${r}-${c}`, node: d })
        continue
      }
      const own = owned.get(cell.i)
      const effect = fx[cell.i]
      const press = (e) => {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(cell.i)
        }
      }
      items.push({
        depth: r + c,
        key: `l${cell.i}`,
        node: (
          <g
            className={`im-lot ${selected === cell.i ? 'is-selected' : ''} ${own?.owner.me ? 'is-mine' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${cell.name}: ${own ? `de ${own.owner.me ? 'ti' : own.owner.name}` : 'se vende'}`}
            onClick={press}
            onKeyDown={press}
          >
            <title>{cell.name}</title>
            <polygon className="im-hit" points={rhomb(r, c, 1)} />
            {selected === cell.i && <polygon className="im-ring" points={rhomb(r, c, 0.92)} />}
            <g className="im-lift">
              <g key={own ? `${own.level}` : 'free'} className="im-grow im-s" style={{ '--d': `${(r + c) * 40}ms` }}>
                {own ? build(cell, own.level, band).node(r, c) : <ForSale r={r} c={c} />}
              </g>
            </g>
            {effect && <Dust r={r} c={c} key={effect.key} />}
            {effect?.type === 'rise' && own && <Crane r={r} c={c} h={build(cell, own.level, band).h} key={`k${effect.key}`} />}
          </g>
        ),
      })
    }
  }
  items.push({ depth: 7.1 + 1.4, key: 'u1', node: <Umbrella r={7.1} c={1.4} color="#e8443a" /> })
  items.push({ depth: 7 + 4.2, key: 'u2', node: <Umbrella r={7} c={4.2} color={band} /> })
  items.push({ depth: 7.2 + 6.3, key: 'u3', node: <Umbrella r={7.2} c={6.3} color="#f2b632" /> })
  const boats = list.filter((c) => c.type === 'barco' && owned.has(c.i))
  boats.forEach((c, k) => items.push({ depth: 30 + k, key: `b${c.i}`, node: <Boat slot={k} level={owned.get(c.i).level} color={band} k={k} /> }))
  items.sort((a, b) => a.depth - b.depth)

  const mine = list.filter((c) => owned.get(c.i)?.owner.me).length
  const worth = cells.reduce((sum, c) => sum + c.invested, 0)
  const pos = new Map(list.map((c, k) => [c.i, ISLA_LOTS[k]]))

  return (
    <div className={`im-city im-isla im-isla--${island} ${dry ? 'is-dry' : ''} is-${phaseOf(hour)}`}>
      <svg className="im-city__svg" viewBox={`${VB.x} ${VB.y} ${VB.size} ${VB.size}`} preserveAspectRatio="xMidYMid meet" aria-label={`La ciudad de ${GROUPS[island].name}`}>
        <CityDefs />
        <Backdrop hour={hour} mount={MOUNTS[island]} />
        <Ground list={list} owned={owned} />
        {items.map((it) => (
          <g key={it.key}>{it.node}</g>
        ))}
        <g className="im-plane im-plane--high">
          <animateMotion path="M400 -150 L-400 -230" dur="34s" begin="-12s" repeatCount="indefinite" rotate="auto" />
          <g transform="scale(.8)">
            <PlaneShape />
          </g>
        </g>
      </svg>

      <div className="im-city__title im-isla__title" style={{ '--c': band }}>
        <span>{GROUPS[island].name}</span>
        <small>{motto}</small>
      </div>
      <p className="im-city__stats">
        <b>{cells.length}</b> de {list.length} con dueño · <b>{mine}</b> tuyas · la isla vale <b>{eur(worth)}</b>
      </p>

      {cells.map((own) => {
        const at = pos.get(own.casilla)
        if (!at) return null
        const [r, c] = at
        const cell = list.find((x) => x.i === own.casilla)
        return (
          <button
            key={own.casilla}
            type="button"
            className={`im-pin ${own.owner.me ? 'is-mine' : ''} ${selected === own.casilla ? 'is-selected' : ''}`}
            style={{ ...pct(pt(r, c, build(cell, own.level, band).h + 6)), '--oh': hueOf(own.owner.name), '--d': `${(r + c) * 0.17}s` }}
            onClick={() => onSelect(own.casilla)}
            tabIndex={-1}
            aria-hidden="true"
            title={`${cell.name} · ${own.owner.name}`}
          >
            <Avatar name={own.owner.name} src={own.owner.avatar} size={16} />
          </button>
        )
      })}
      {Object.entries(fx).map(([i, e]) => {
        const at = pos.get(Number(i))
        if (!at) return null
        return (
          <span key={`${i}-${e.key}`} className={`im-float ${e.type === 'fall' ? 'is-fall' : ''}`} style={pct(pt(at[0], at[1], 60))}>
            {e.label}
          </span>
        )
      })}
    </div>
  )
}

export default memo(InmoIslaCity)
