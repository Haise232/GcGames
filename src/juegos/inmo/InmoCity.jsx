import { memo, useEffect, useRef, useState } from 'react'
import Avatar from '../comun/Avatar.jsx'
import { BOARD, GROUPS, PROPERTIES } from './inmo.js'
import { eur } from '../comun/money.js'

// La ciudad del centro del tablero, en perspectiva isométrica: una isla con calles, playa y mar donde cada propiedad
// tiene su solar. Libre se ve un cartel de «Se vende»; con dueño, lo que haya construido (de casa canaria a hotel), y
// las estaciones y compañías con su propio edificio. Va a la hora de Canarias (de día, al atardecer o de noche con las
// ventanas encendidas). Todo es un SVG dibujado de atrás hacia delante, y encima, en HTML, las fotos de los dueños.

// Tono estable por nombre: el mismo que tiñe las casillas del tablero.
export const hueOf = (name = '') => [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360

// Rejilla de 10 × 10 [fila, columna]: calles en las filas y columnas 3 y 7, paseo marítimo en la 8 y playa en la 9.
// Cada color forma su barrio; el puerto, los aeropuertos y la desaladora van junto al mar.
const LOTS = {
  1: [5, 0], 3: [6, 1], 5: [6, 2], 6: [4, 1], 8: [4, 2], 9: [5, 2],
  11: [6, 4], 13: [5, 5], 14: [4, 4], 37: [4, 6], 39: [6, 6],
  16: [0, 1], 18: [1, 0], 19: [2, 1], 28: [0, 2],
  21: [0, 5], 23: [1, 4], 24: [2, 6],
  31: [0, 8], 32: [1, 9], 34: [2, 8],
  26: [4, 8], 27: [5, 9], 29: [6, 8],
  25: [8, 1], 15: [8, 5], 12: [8, 6], 35: [8, 8],
}
const LOT_AT = new Map(Object.entries(LOTS).map(([i, [r, c]]) => [`${r},${c}`, Number(i)]))
const ROADS = [3, 7]
const RUNWAY = { 25: [-0.4, 2.4], 35: [6.6, 9.4] }

// Proyección: el centro de la casilla (r, c) a z de altura, en unidades del viewBox.
const pt = (r, c, z = 0) => [(c - r) * 32, (c + r) * 16 + 16 - z]
const f1 = (n) => Math.round(n * 10) / 10
const poly = (...ps) => ps.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')
const rhomb = (r, c, s = 1, z = 0) => {
  const [x, y] = pt(r, c, z)
  return poly([x, y - 16 * s], [x + 32 * s, y], [x, y + 16 * s], [x - 32 * s, y])
}
// Franjas a lo largo de una fila (de la columna c0 a la c1) o de una columna.
const stripC = (r, c0, c1, half) => poly(pt(r - half, c0), pt(r - half, c1), pt(r + half, c1), pt(r + half, c0))
const stripR = (c, r0, r1, half) => poly(pt(r0, c - half), pt(r1, c - half), pt(r1, c + half), pt(r0, c + half))
// En porcentaje del cuadro (el viewBox es cuadrado), para colocar el HTML encima.
const VB = { x: -330, y: -282, size: 660 }
const pct = ([x, y]) => ({ left: `${((x - VB.x) / VB.size) * 100}%`, top: `${((y - VB.y) / VB.size) * 100}%` })

function groundOf(r, c) {
  if (r === 9) return 'sand'
  if (r === 8) return 'paseo'
  if (LOT_AT.has(`${r},${c}`)) return 'lot'
  const row = ROADS.includes(r)
  const col = ROADS.includes(c)
  return row && col ? 'cross' : row ? 'road' : col ? 'road' : 'grass'
}

// Un prisma de base ac × ar (medias casillas) y altura h: las dos caras de delante y el techo. Las ventanas son un
// patrón sobre cada cara, inclinado con la misma matriz que la cara.
function Box({ r, c, ac, ar = ac, h, z = 0, color, top, win }) {
  const at = (dc, dr, up) => pt(r + dr, c + dc, z + up)
  const [W, S, E] = [at(-ac, ar, 0), at(ac, ar, 0), at(ac, -ar, 0)]
  const [Nt, Wt, St, Et] = [at(-ac, -ar, h), at(-ac, ar, h), at(ac, ar, h), at(ac, -ar, h)]
  return (
    <g style={{ '--c': color }}>
      <polygon className="im-f im-f--l" points={poly(W, S, St, Wt)} />
      <polygon className="im-f im-f--r" points={poly(S, E, Et, St)} />
      {win && h > 8 && (
        <>
          <rect className="im-wins" transform={`matrix(1 .5 0 1 ${f1(Wt[0])} ${f1(Wt[1])})`} x="1" y="3" width={64 * ac - 2} height={h - 5} fill={`url(#im-w-${win})`} />
          <rect className="im-wins im-wins--r" transform={`matrix(1 -.5 0 1 ${f1(St[0])} ${f1(St[1])})`} x="1" y="3" width={64 * ar - 2} height={h - 5} fill={`url(#im-w-${win})`} />
        </>
      )}
      <polygon className="im-f im-f--t" points={poly(Nt, Et, St, Wt)} style={top ? { '--c': top } : undefined} />
    </g>
  )
}

// Tejado a cuatro aguas sobre una base ac × ar a la altura z.
function Roof({ r, c, ac, ar = ac, z, h, color }) {
  const at = (dc, dr) => pt(r + dr, c + dc, z)
  const [N, E, S, W] = [at(-ac, -ar), at(ac, -ar), at(ac, ar), at(-ac, ar)]
  const A = pt(r, c, z + h)
  return (
    <g style={{ '--c': color }}>
      <polygon className="im-f im-f--t" points={poly(N, E, A)} />
      <polygon className="im-f im-f--t" points={poly(W, N, A)} />
      <polygon className="im-f im-f--l" points={poly(W, S, A)} />
      <polygon className="im-f im-f--r" points={poly(S, E, A)} />
    </g>
  )
}

const line = (a, b, cls, w) => <line className={cls} x1={f1(a[0])} y1={f1(a[1])} x2={f1(b[0])} y2={f1(b[1])} strokeWidth={w} />

function Tree({ r, c, s = 1 }) {
  const [x, y] = pt(r, c)
  return (
    <g className="im-tree" style={{ '--sw': `${(r * 7 + c * 3) % 5}` }}>
      <ellipse className="im-shadow" cx={x + 2} cy={y + 1} rx={7 * s} ry={3.5 * s} />
      <rect x={x - 1} y={y - 7 * s} width="2" height={7 * s} fill="#6b4a2e" />
      <g className="im-sway">
        <circle className="im-f im-f--l" style={{ '--c': '#3d8a3a' }} cx={x} cy={y - 11 * s} r={6.5 * s} />
        <circle className="im-f im-f--t" style={{ '--c': '#5fb04f' }} cx={x - 1.8 * s} cy={y - 13 * s} r={3.4 * s} />
      </g>
    </g>
  )
}

function Palm({ r, c }) {
  const [x, y] = pt(r, c)
  const top = [x + 3, y - 20]
  return (
    <g className="im-palm">
      <ellipse className="im-shadow" cx={x + 3} cy={y + 1} rx="6" ry="2.5" />
      <path d={`M${x} ${y} Q${x - 1} ${y - 12} ${top[0]} ${top[1]}`} stroke="#8a6440" strokeWidth="2" fill="none" />
      <g className="im-sway" style={{ '--sw': `${(r + c) % 4}` }}>
        {[-150, -110, -60, -20, 20].map((a) => {
          const rad = (a * Math.PI) / 180
          const end = [top[0] + Math.cos(rad) * 10, top[1] + Math.sin(rad) * 6 + 5]
          return <path key={a} className="im-leaf" d={`M${top[0]} ${top[1]} Q${f1((top[0] + end[0]) / 2)} ${f1(top[1] - 4)} ${f1(end[0])} ${f1(end[1])}`} />
        })}
      </g>
    </g>
  )
}

function Umbrella({ r, c, color }) {
  const [x, y] = pt(r, c)
  return (
    <g>
      <polygon points={poly([x - 6, y + 2], [x + 2, y - 1], [x + 7, y + 2], [x - 1, y + 5])} fill="#fff" opacity=".8" />
      {line([x, y], [x, y - 12], 'im-pole', 1)}
      <path d={`M${x - 8} ${y - 11} Q${x} ${y - 19} ${x + 8} ${y - 11} Z`} fill={color} />
    </g>
  )
}

function Lamp({ r, c }) {
  const [x, y] = pt(r, c)
  return (
    <g>
      <circle className="im-lamp-glow" cx={x} cy={y - 13} r="9" />
      {line([x, y], [x, y - 13], 'im-pole', 1)}
      <circle className="im-lamp" cx={x} cy={y - 13} r="1.8" />
    </g>
  )
}

// Cartel de «Se vende» sobre un solar sin dueño.
function ForSale({ r, c }) {
  const [x, y] = pt(r + 0.18, c - 0.18)
  return (
    <g className="im-s">
      <polygon className="im-f im-f--t" style={{ '--c': '#b8946a' }} points={rhomb(r, c, 0.72)} />
      <g transform={`matrix(1 .5 0 1 ${f1(x - 9)} ${f1(y - 22)})`}>
        <rect width="20" height="10" rx="1" fill="#fff" stroke="#d8261e" strokeWidth="1.4" />
        <text x="10" y="6.9" textAnchor="middle" className="im-sign">SE VENDE</text>
      </g>
      {line([x + 1, y - 12], [x + 1, y + 0.5], 'im-pole', 1.4)}
    </g>
  )
}

// Solar comprado sin construir: vallado y con la bandera del dueño.
function Plot({ r, c, hue }) {
  const [x, y] = pt(r, c)
  return (
    <g className="im-s">
      <polygon className="im-f im-f--t" style={{ '--c': '#a8865d' }} points={rhomb(r, c, 0.72)} />
      <polygon className="im-fence" points={rhomb(r, c, 0.74, 4)} />
      {line([x, y], [x, y - 22], 'im-pole', 1.2)}
      <path className="im-flag" d={`M${x} ${y - 22} l12 3 l-12 4 z`} fill={`hsl(${hue} 70% 50%)`} />
    </g>
  )
}

// Las calles según lo construido: casa canaria (1), casa de dos plantas (2), bloque (3), torre (4) y hotel (5).
function Street({ r, c, level, band }) {
  const pastel = `color-mix(in srgb, ${band} 38%, #fbf5e8)`
  const cream = '#efe6d2'
  if (level === 1)
    return (
      <g className="im-s">
        <Box r={r} c={c} ac={0.27} h={12} color={pastel} win="res" />
        <Roof r={r} c={c} ac={0.3} z={12} h={9} color="#c4573a" />
      </g>
    )
  if (level === 2)
    return (
      <g className="im-s">
        <Box r={r} c={c} ac={0.3} h={24} color={pastel} win="res" />
        <Box r={r} c={c} ac={0.31} h={2} z={11} color={band} />
        <Roof r={r} c={c} ac={0.33} z={24} h={10} color="#b54a33" />
      </g>
    )
  if (level === 3)
    return (
      <g className="im-s">
        <Box r={r} c={c} ac={0.34} ar={0.3} h={40} color={cream} win="res" />
        <Box r={r} c={c} ac={0.35} ar={0.31} h={3} z={40} color={band} />
        <Box r={r - 0.1} c={c + 0.1} ac={0.08} h={6} z={43} color="#9aa3ad" />
      </g>
    )
  if (level === 4)
    return (
      <g className="im-s">
        <Box r={r} c={c} ac={0.36} h={64} color="#e6e1d6" win="tower" />
        <Box r={r} c={c} ac={0.37} h={4} z={64} color={band} />
        {line(pt(r, c, 68), pt(r, c, 80), 'im-pole', 1)}
        <circle className="im-beacon" cx={pt(r, c)[0]} cy={pt(r, c, 80)[1]} r="1.8" />
      </g>
    )
  const [x, y] = pt(r, c, 146)
  return (
    <g className="im-s">
      <Box r={r} c={c} ac={0.42} h={10} color={band} win="glass" />
      <Box r={r} c={c} ac={0.32} h={120} z={10} color="#5f86ad" win="hotel" />
      <Box r={r} c={c} ac={0.34} h={8} z={130} color={band} />
      <Box r={r} c={c} ac={0.2} h={8} z={138} color="#d9dfe6" />
      {line([x, y + 8], [x, y - 4], 'im-pole', 1.2)}
      <circle className="im-beacon" cx={x} cy={y - 4} r="2.2" />
    </g>
  )
}

function BusStation({ r, c }) {
  return (
    <g className="im-s">
      <Box r={r - 0.08} c={c} ac={0.44} ar={0.28} h={10} color="#e9e4da" win="glass" />
      <Box r={r - 0.08} c={c} ac={0.47} ar={0.32} h={2.5} z={10} color="#2b2f36" />
      <g className="im-bus">
        <Box r={r + 0.36} c={c - 0.05} ac={0.22} ar={0.07} h={7} color="#1f86d1" win="glass" />
      </g>
    </g>
  )
}

function Port({ r, c }) {
  const legs = [pt(r + 0.2, c - 0.22), pt(r + 0.2, c + 0.22)]
  return (
    <g className="im-s">
      <Box r={r + 1.5} c={c} ac={0.13} ar={1} h={2} z={-3} color="#8a6a45" />
      <Box r={r - 0.22} c={c - 0.2} ac={0.14} ar={0.09} h={6} color="#d23b2e" />
      <Box r={r - 0.22} c={c - 0.2} ac={0.14} ar={0.09} h={6} z={6} color="#2b6cc4" />
      <Box r={r - 0.22} c={c + 0.12} ac={0.14} ar={0.09} h={6} color="#f0a020" />
      {legs.map((p, k) => (
        <g key={k}>{line(p, [p[0], p[1] - 42], 'im-crane-steel', 2.2)}</g>
      ))}
      {line(pt(r - 0.3, c, 42), pt(r + 1.6, c, 42), 'im-crane-steel', 2.4)}
      <g className="im-hook">{line(pt(r + 1.1, c, 42), pt(r + 1.1, c, 22), 'im-pole', 0.8)}</g>
    </g>
  )
}

function Airport({ r, c }) {
  const [x, y] = pt(r + 0.18, c + 0.3, 32)
  return (
    <g className="im-s">
      <Box r={r - 0.12} c={c} ac={0.42} ar={0.2} h={9} color="#eef1f4" win="glass" />
      <Box r={r - 0.12} c={c} ac={0.44} ar={0.22} h={2} z={9} color="#9aa7b4" />
      <Box r={r + 0.18} c={c + 0.3} ac={0.05} h={26} color="#d9dde2" />
      <Box r={r + 0.18} c={c + 0.3} ac={0.1} h={6} z={26} color="#3f9fc9" />
      <circle className="im-beacon" cx={x} cy={y - 1} r="1.6" />
    </g>
  )
}

function Tank({ x, y, rx, h }) {
  return (
    <g>
      <path className="im-f im-f--l" style={{ '--c': '#e9eef2' }} d={`M${x - rx} ${y - h} V${y} A${rx} ${rx / 2} 0 0 0 ${x + rx} ${y} V${y - h} Z`} />
      <ellipse className="im-water" cx={x} cy={y - h} rx={rx} ry={rx / 2} />
    </g>
  )
}

function Desal({ r, c }) {
  const a = pt(r - 0.15, c - 0.18)
  const b = pt(r + 0.15, c + 0.2)
  return (
    <g className="im-s">
      <Box r={r - 0.2} c={c + 0.25} ac={0.15} h={10} color="#cdd6de" win="glass" />
      <Tank x={a[0]} y={a[1]} rx={10} h={14} />
      <Tank x={b[0]} y={b[1]} rx={9} h={11} />
      <circle className="im-drop" cx={b[0]} cy={b[1] - 11} r="1.6" />
    </g>
  )
}

function Turbine({ r, c, h }) {
  const [x, y] = pt(r, c)
  return (
    <g>
      <ellipse className="im-shadow" cx={x + 3} cy={y + 1} rx="4" ry="2" />
      {line([x, y], [x, y - h], 'im-turbine', 1.8)}
      <g className="im-blades" style={{ '--sp': `${2.4 + ((r * 10 + c * 10) % 3) * 0.6}s` }}>
        <circle cx={x} cy={y - h} r="13" fill="transparent" />
        {[0, 120, 240].map((a) => {
          const rad = (a * Math.PI) / 180
          return <g key={a}>{line([x, y - h], [x + Math.cos(rad) * 13, y - h + Math.sin(rad) * 13], 'im-turbine', 1.3)}</g>
        })}
      </g>
      <circle cx={x} cy={y - h} r="1.6" fill="#fff" />
    </g>
  )
}

function Wind({ r, c }) {
  return (
    <g className="im-s">
      <Turbine r={r - 0.25} c={c - 0.2} h={34} />
      <Turbine r={r - 0.05} c={c + 0.25} h={30} />
      <Turbine r={r + 0.25} c={c - 0.1} h={26} />
    </g>
  )
}

// Lo que hay en el solar de cada propiedad, y a qué altura queda la foto del dueño.
function Structure({ cell, own, r, c }) {
  if (!own) return <ForSale r={r} c={c} />
  if (cell.kind === 'calle') return own.level === 0 ? <Plot r={r} c={c} hue={hueOf(own.owner.name)} /> : <Street r={r} c={c} level={own.level} band={GROUPS[cell.group].color} />
  if (cell.i === 5) return <BusStation r={r} c={c} />
  if (cell.i === 15) return <Port r={r} c={c} />
  if (cell.i === 12) return <Desal r={r} c={c} />
  if (cell.i === 28) return <Wind r={r} c={c} />
  return <Airport r={r} c={c} />
}
const heightOf = (cell, own) =>
  !own ? 22 : cell.kind === 'calle' ? [24, 22, 35, 50, 82, 152][own.level] : ({ 5: 14, 15: 46, 12: 18, 28: 48 }[cell.i] ?? 34)

// La Catedral de Santa Ana, de adorno junto a Vegueta.
function Cathedral({ r, c }) {
  return (
    <g>
      <Box r={r - 0.05} c={c} ac={0.2} ar={0.3} h={18} color="#e4d6bb" win="res" />
      <Roof r={r - 0.05} c={c} ac={0.2} ar={0.3} z={18} h={8} color="#6d6a66" />
      {[-0.17, 0.17].map((dc) => (
        <g key={dc}>
          <Box r={r + 0.3} c={c + dc} ac={0.07} h={30} color="#e4d6bb" />
          <Roof r={r + 0.3} c={c + dc} ac={0.08} z={30} h={9} color="#4b4845" />
        </g>
      ))}
    </g>
  )
}

function Fountain({ r, c }) {
  const [x, y] = pt(r, c)
  return (
    <g>
      <polygon className="im-f im-f--t" style={{ '--c': '#d9d2c1' }} points={rhomb(r, c, 0.8)} />
      <ellipse cx={x} cy={y} rx="13" ry="6.5" fill="#b9b2a2" />
      <ellipse className="im-water" cx={x} cy={y - 1} rx="11" ry="5" />
      <ellipse className="im-jet" cx={x} cy={y - 6} rx="2" ry="6" />
    </g>
  )
}

// Adornos de las casillas sin propiedad, siempre los mismos en cada sitio.
function decorOf(r, c) {
  if (r === 5 && c === 1) return <Cathedral r={r} c={c} />
  if (r === 1 && c === 5) return <Fountain r={r} c={c} />
  const g = groundOf(r, c)
  const k = (r * 31 + c * 17) % 5
  if (g === 'grass') {
    if (k === 0) return [<Tree key="a" r={r - 0.2} c={c - 0.15} />, <Tree key="b" r={r + 0.18} c={c + 0.2} s={0.8} />]
    if (k === 1) return <Tree r={r} c={c} s={1.25} />
    if (k === 2) return [<Palm key="a" r={r - 0.1} c={c} />, <Tree key="b" r={r + 0.25} c={c - 0.2} s={0.7} />]
    if (k === 3) return [<Tree key="a" r={r - 0.25} c={c + 0.2} s={0.8} />, <Tree key="b" r={r + 0.05} c={c - 0.22} />, <Tree key="c" r={r + 0.28} c={c + 0.22} s={0.7} />]
    return <Palm r={r} c={c} />
  }
  if (g === 'paseo') return k % 2 ? <Palm r={r} c={c} /> : <Lamp r={r + 0.3} c={c} />
  if (g === 'cross') return <Lamp r={r - 0.42} c={c - 0.42} />
  return null
}

const UMBRELLAS = [
  [9, 3.2, '#e8443a'],
  [9.1, 4.2, '#f2b632'],
  [8.9, 6.3, '#2f8fd8'],
  [9.2, 5.6, '#e8443a'],
  [9, 3.9, '#2f8fd8'],
]

// Coches por las cuatro calles, en los dos sentidos.
const CARS = [
  { row: 3, from: -0.4, to: 9.4, lane: 0.17, dur: 11, delay: 0, color: '#e8443a' },
  { row: 3, from: 9.4, to: -0.4, lane: -0.17, dur: 13, delay: -6, color: '#f2f2f2' },
  { row: 7, from: -0.4, to: 9.4, lane: 0.17, dur: 12, delay: -3, color: '#f2b632' },
  { row: 7, from: 9.4, to: -0.4, lane: -0.17, dur: 10, delay: -8, color: '#2f8fd8' },
  { col: 3, from: -0.4, to: 7.4, lane: 0.17, dur: 9, delay: -2, color: '#1f2a36' },
  { col: 3, from: 7.4, to: -0.4, lane: -0.17, dur: 11, delay: -5, color: '#3fae5a' },
  { col: 7, from: -0.4, to: 7.4, lane: 0.17, dur: 10, delay: -7, color: '#f2f2f2' },
  { col: 7, from: 7.4, to: -0.4, lane: -0.17, dur: 12, delay: -1, color: '#d9479a' },
]

function Car({ car }) {
  const along = car.row !== undefined
  const a = along ? pt(car.row + car.lane, car.from) : pt(car.from, car.col - car.lane)
  const b = along ? pt(car.row + car.lane, car.to) : pt(car.to, car.col - car.lane)
  const [ac, ar] = along ? [0.17, 0.08] : [0.08, 0.17]
  const begin = `${car.delay}s`
  return (
    <g>
      <animateMotion path={`M${f1(a[0])} ${f1(a[1])} L${f1(b[0])} ${f1(b[1])}`} dur={`${car.dur}s`} begin={begin} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.06;.94;1" dur={`${car.dur}s`} begin={begin} repeatCount="indefinite" />
      <g transform="translate(0 -16)">
        <Box r={0} c={0} ac={ac} ar={ar} h={4} color={car.color} />
        <Box r={0} c={0} ac={ac * 0.55} ar={ar * 0.85} h={3} z={4} color="#8fb6d4" />
      </g>
    </g>
  )
}

// Un avión que despega de cada aeropuerto con dueño.
function Takeoff({ i }) {
  const [c0, c1] = RUNWAY[i]
  const a = pt(9, c0 + 0.3)
  const b = pt(9, c1)
  const sky = pt(9, c1 + 5, 170)
  return (
    <g className="im-plane">
      <animateMotion
        path={`M${f1(a[0])} ${f1(a[1])} L${f1(b[0])} ${f1(b[1])} L${f1(sky[0])} ${f1(sky[1])}`}
        dur="16s"
        begin={i === 25 ? '0s' : '-8s'}
        repeatCount="indefinite"
        rotate="auto"
        keyPoints="0;0;.35;1;1"
        keyTimes="0;.25;.5;.8;1"
        calcMode="linear"
      />
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.24;.26;.74;.8;1" dur="16s" begin={i === 25 ? '0s' : '-8s'} repeatCount="indefinite" />
      <PlaneShape />
    </g>
  )
}
const PlaneShape = () => (
  <g>
    <path d="M-9 0 L7 -1.2 Q10 0 7 1.2 Z" fill="#f4f6f8" />
    <path d="M-1 0 L-5 -7 L-2 -7 L3 0 L-2 7 L-5 7 Z" fill="#dfe5ea" />
    <path d="M-9 0 L-11 -3.5 L-8.5 -3.5 L-6 0 Z" fill="#d8261e" />
  </g>
)

// La hora de Canarias, para pintar el cielo y encender las ventanas.
function canaryHour(t = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Atlantic/Canary', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t))
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') + get('minute') / 60
}
const phaseOf = (h) => (h < 7 || h >= 20 ? 'night' : h < 8.5 ? 'dawn' : h < 18.5 ? 'day' : 'dusk')
const sunAt = (h) => {
  // De día el sol y de noche la luna, cada uno por su arco de un lado al otro del cielo.
  const day = h >= 7 && h < 20
  const f = day ? (h - 7) / 13 : ((h - 20 + 24) % 24) / 11
  return { day, x: -300 + 600 * f, y: 50 - Math.sin(Math.PI * f) * 270 }
}

const STARS = Array.from({ length: 40 }, (_, k) => ({ x: ((k * 137) % 680) - 340, y: -320 + ((k * 89) % 360), r: 0.6 + (k % 3) * 0.4, d: (k % 7) * 0.4 }))

// El cielo, las montañas del horizonte (el Teide al fondo) y el mar alrededor de la isla.
const Backdrop = memo(function Backdrop({ hour }) {
  const sun = sunAt(hour)
  return (
    <g>
      <g className="im-stars">
        {STARS.map((s, k) => (
          <circle key={k} cx={s.x} cy={s.y} r={s.r} style={{ animationDelay: `${s.d}s` }} />
        ))}
      </g>
      <g transform={`translate(${f1(sun.x)} ${f1(sun.y)})`}>
        <circle className={sun.day ? 'im-sun-glow' : 'im-moon-glow'} r="34" />
        <circle className={sun.day ? 'im-sun' : 'im-moon'} r="15" />
      </g>
      {[
        [-260, -250, 1, 70, 0],
        [40, -200, 0.8, 90, -40],
        [-120, -140, 0.65, 110, -70],
        [200, -280, 1.1, 80, -20],
      ].map(([x, y, s, t, d], k) => (
        <g key={k} className="im-cloud" style={{ '--t': `${t}s`, animationDelay: `${d}s` }}>
          <g transform={`translate(${x} ${y}) scale(${s})`}>
            <ellipse cx="0" cy="0" rx="30" ry="11" />
            <ellipse cx="-16" cy="4" rx="18" ry="8" />
            <ellipse cx="18" cy="3" rx="20" ry="9" />
            <ellipse cx="4" cy="-7" rx="16" ry="10" />
          </g>
        </g>
      ))}
      <path className="im-mount" d="M-340 62 L-300 52 L-235 18 L-205 -6 L-190 -12 L-176 -5 L-140 22 L-80 50 L-30 62 Z" />
      <path className="im-snow" d="M-205 -6 L-190 -12 L-176 -5 L-183 -2 L-190 -6 L-197 -1 Z" />
      <path className="im-mount im-mount--far" d="M150 62 Q210 36 260 44 T340 50 L340 62 Z" />
      <rect className="im-sea" x="-340" y="60" width="680" height="300" />
      <g className="im-waves">
        {Array.from({ length: 16 }, (_, k) => {
          const x = ((k * 173) % 640) - 320
          const y = 74 + ((k * 61) % 270)
          return <path key={k} d={`M${x} ${y} q4 -3 8 0 q4 3 8 0`} style={{ animationDelay: `${(k % 5) * 0.7}s` }} />
        })}
      </g>
      <g className="im-ferry">
        <animateMotion path="M-380 104 L380 92" dur="70s" begin="-20s" repeatCount="indefinite" />
        <path d="M-16 0 L16 0 L12 5 L-13 5 Z" fill="#f4f4f4" />
        <rect x="-9" y="-6" width="16" height="6" fill="#fff" />
        <rect x="-4" y="-10" width="6" height="4" fill="#d8261e" />
      </g>
    </g>
  )
})

// El suelo de la isla: césped, calles, paseo, playa, los cantos de la isla y los solares con su acera y su color.
const Ground = memo(function Ground({ owned, runways }) {
  const tiles = []
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const g = groundOf(r, c)
      const alt = (r + c) % 2 ? ' is-alt' : ''
      tiles.push(<polygon key={`g${r}-${c}`} className={`im-f im-f--t im-g im-g--${g}${alt}`} points={rhomb(r, c, 1.02)} />)
      if (g === 'lot') {
        const i = LOT_AT.get(`${r},${c}`)
        const own = owned.get(i)
        const lv = own?.level ?? -1
        const pad = !own ? 'dirt' : BOARD[i].kind === 'calle' && lv > 0 && lv <= 2 ? 'garden' : BOARD[i].kind === 'calle' && lv === 0 ? 'dirt' : 'plaza'
        tiles.push(<polygon key={`p${i}`} className={`im-f im-f--t im-pad im-pad--${pad}`} points={rhomb(r, c, 0.8)} style={{ '--band': GROUPS[BOARD[i].group].color }} />)
      }
    }
  }
  const D = 14
  const edges = []
  for (let k = 0; k < 10; k++) {
    const W = pt(9.5, k - 0.5)
    const S = pt(9.5, k + 0.5)
    edges.push(<polygon key={`el${k}`} className="im-f im-f--l im-edge im-edge--sand" points={poly(W, S, [S[0], S[1] + D], [W[0], W[1] + D])} />)
    const S2 = pt(k + 0.5, 9.5)
    const E2 = pt(k - 0.5, 9.5)
    edges.push(
      <polygon key={`er${k}`} className={`im-f im-f--r im-edge ${k === 9 ? 'im-edge--sand' : ''}`} points={poly(S2, E2, [E2[0], E2[1] + D], [S2[0], S2[1] + D])} />,
    )
  }
  const shore = poly(pt(-1, -1, -D), pt(-1, 10, -D), pt(10.2, 10.2, -D), pt(10, -1, -D))
  return (
    <g>
      <polygon className="im-shallow" points={shore} />
      <polygon className="im-foam" points={poly(pt(-0.62, -0.62, -D), pt(-0.62, 9.62, -D), pt(9.62, 9.62, -D), pt(9.62, -0.62, -D))} />
      {edges}
      {tiles}
      {ROADS.map((k) => (
        <g key={k}>
          {line(pt(k, -0.5), pt(k, 9.5), 'im-dash', 1)}
          {line(pt(-0.5, k), pt(7.5, k), 'im-dash', 1)}
        </g>
      ))}
      {ROADS.flatMap((r) => ROADS.map((c) => <polygon key={`x${r}-${c}`} className="im-zebra" points={rhomb(r, c, 0.5)} />))}
      {runways.map((i) => (
        <g key={i}>
          <polygon className="im-runway" points={stripC(9, RUNWAY[i][0], RUNWAY[i][1], 0.24)} />
          {line(pt(9, RUNWAY[i][0] + 0.2), pt(9, RUNWAY[i][1] - 0.2), 'im-runway-line', 1)}
        </g>
      ))}
    </g>
  )
})

// Cada casilla con sus cosas, ordenadas de atrás hacia delante para que lo de delante tape a lo de detrás.
function scene({ owned, selected, fx, intro, onSelect }) {
  const items = []
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const i = LOT_AT.get(`${r},${c}`)
      if (i === undefined) {
        const d = decorOf(r, c)
        if (d) items.push({ depth: r + c, key: `d${r}-${c}`, node: d })
        continue
      }
      const cell = BOARD[i]
      const own = owned.get(i)
      const effect = fx[i]
      const press = (e) => {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(i)
        }
      }
      items.push({
        depth: r + c,
        key: `l${i}`,
        node: (
          <g
            className={`im-lot ${selected === i ? 'is-selected' : ''} ${own?.owner.me ? 'is-mine' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${cell.name}: ${own ? `de ${own.owner.me ? 'ti' : own.owner.name}` : 'se vende'}`}
            onClick={press}
            onKeyDown={press}
          >
            <title>{cell.name}</title>
            <polygon className="im-hit" points={rhomb(r, c, 1)} />
            {selected === i && <polygon className="im-ring" points={rhomb(r, c, 0.92)} />}
            {effect?.type === 'fall' && (
              <g className="im-ghost">
                <Structure cell={cell} own={effect.ghost} r={r} c={c} />
              </g>
            )}
            <g className="im-lift">
              <g key={own ? `${own.level}` : 'free'} className={`im-grow ${effect?.type === 'fall' ? 'is-late' : ''}`} style={{ '--d': intro ? `${(r + c) * 50}ms` : '0ms' }}>
                <Structure cell={cell} own={own} r={r} c={c} />
              </g>
            </g>
            {effect && <Dust r={r} c={c} key={effect.key} />}
            {effect?.type === 'rise' && <Crane r={r} c={c} h={heightOf(cell, own)} key={`k${effect.key}`} />}
          </g>
        ),
      })
    }
  }
  UMBRELLAS.forEach(([r, c, color], k) => items.push({ depth: r + c, key: `u${k}`, node: <Umbrella r={r} c={c} color={color} /> }))
  // El barco del puerto, delante de todo lo de la playa.
  items.push({ depth: 16.5, key: 'ship', node: <Ship big={owned.has(15)} /> })
  return items.sort((a, b) => a.depth - b.depth)
}

function Ship({ big }) {
  const [x, y] = pt(10.9, 5.55)
  return (
    <g className="im-ship" transform={`translate(${f1(x)} ${f1(y)})`}>
      <g className="im-bob">
        {big ? (
          <>
            <path d="M-26 -14 L22 10 L14 14 L-30 -8 Z" fill="#20354f" />
            <path d="M-22 -14 L18 6 L18 2 L-22 -18 Z" fill="#b8352b" />
            <polygon points="-12,-16 -2,-11 -2,-19 -12,-24" fill="#f4f4f4" />
            <polygon points="0,-10 12,-4 12,-9 0,-15" fill="#f0a020" />
            <polygon points="-24,-21 -16,-17 -16,-27 -24,-31" fill="#fff" />
          </>
        ) : (
          <>
            <path d="M-10 -5 L10 5 L5 8 L-12 0 Z" fill="#2f6fb2" />
            {line([-1, 0], [-1, -18], 'im-pole', 1)}
            <path d="M-1 -18 L-1 -2 L9 1 Z" fill="#fff" />
          </>
        )}
      </g>
    </g>
  )
}

// Polvo al construir o al derribar.
function Dust({ r, c }) {
  const [x, y] = pt(r, c)
  return (
    <g className="im-dust">
      {[-14, -6, 4, 12, 0].map((dx, k) => (
        <circle key={k} cx={x + dx} cy={y + (k % 2) * 4 - 2} r="5" style={{ animationDelay: `${k * 0.08}s` }} />
      ))}
    </g>
  )
}

// Una grúa torre que aparece mientras se levanta el edificio.
function Crane({ r, c, h }) {
  const top = h + 22
  const base = pt(r - 0.35, c + 0.35)
  const head = [base[0], base[1] - top]
  const tip = pt(r - 0.35 + 0.9, c + 0.35 - 0.9, top)
  const back = pt(r - 0.35 - 0.35, c + 0.35 + 0.35, top)
  return (
    <g className="im-crane">
      {line(base, head, 'im-crane-yellow', 2.2)}
      {line(back, tip, 'im-crane-yellow', 1.8)}
      <rect x={back[0] - 3} y={back[1]} width="6" height="5" fill="#5a5f66" />
      <g className="im-hook">{line(pt(r - 0.35 + 0.55, c + 0.35 - 0.55, top), pt(r - 0.35 + 0.55, c + 0.35 - 0.55, top - 26), 'im-pole', 0.8)}</g>
    </g>
  )
}

const RISE_MS = 2600
const LABEL = { compra: 'Comprada', venta: 'Vendida', 1: '1 casa', 2: '2 casas', 3: '3 casas', 4: '4 casas', 5: 'Hotel' }

function InmoCity({ cells, selected, onSelect, ready = '', burst = 0 }) {
  const [hour, setHour] = useState(() => canaryHour())
  useEffect(() => {
    const timer = setInterval(() => setHour(canaryHour()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Lo que cambia mientras miras: lo nuevo o mejorado se levanta con grúa y polvo; lo vendido se derrumba.
  const prev = useRef(null)
  const timers = useRef(new Set())
  const [fx, setFx] = useState({})
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const before = prev.current
    const now = new Map(cells.map((c) => [c.casilla, c]))
    if (cells.length || before) prev.current = now
    if (!before) {
      if (cells.length) {
        const timer = setTimeout(() => setIntro(false), 2200)
        timers.current.add(timer)
      }
      return
    }
    const next = {}
    const key = Date.now()
    for (const c of cells) {
      const was = before.get(c.casilla)
      if (!was || was.level < c.level) next[c.casilla] = { type: 'rise', key, label: was ? LABEL[c.level] : LABEL.compra }
    }
    for (const [k, was] of before) if (!now.has(k)) next[k] = { type: 'fall', key, ghost: was, label: LABEL.venta }
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
  const runways = Object.keys(RUNWAY).map(Number).filter((i) => owned.has(i))
  const readySet = new Set(ready.split(',').filter(Boolean).map(Number))
  const worth = cells.reduce((sum, c) => sum + c.invested, 0)
  const phase = phaseOf(hour)

  return (
    <div className={`im-city is-${phase}`}>
      <svg className="im-city__svg" viewBox={`${VB.x} ${VB.y} ${VB.size} ${VB.size}`} preserveAspectRatio="xMidYMid meet" aria-label="La ciudad">
        <defs>
          <linearGradient id="im-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="im-sea-a" />
            <stop offset="1" className="im-sea-b" />
          </linearGradient>
          <pattern id="im-w-res" width="8" height="10" patternUnits="userSpaceOnUse">
            <rect className="im-win" x="2.5" y="2" width="3.2" height="4.6" />
          </pattern>
          <pattern id="im-w-tower" width="6" height="8" patternUnits="userSpaceOnUse">
            <rect className="im-win" x="1.2" y="1.5" width="3.6" height="4.6" />
          </pattern>
          <pattern id="im-w-hotel" width="5" height="6" patternUnits="userSpaceOnUse">
            <rect className="im-win" x="0.5" y="1" width="4" height="4" />
          </pattern>
          <pattern id="im-w-glass" width="6" height="12" patternUnits="userSpaceOnUse">
            <rect className="im-win" x="0.5" y="0" width="5" height="12" />
          </pattern>
        </defs>
        <Backdrop hour={hour} />
        <Ground owned={owned} runways={runways} />
        <g className="im-cars">
          {CARS.map((car, k) => (
            <Car key={k} car={car} />
          ))}
        </g>
        {scene({ owned, selected, fx, intro, onSelect }).map((it) => (
          <g key={it.key}>{it.node}</g>
        ))}
        {runways.map((i) => (
          <Takeoff key={i} i={i} />
        ))}
        <g className="im-plane im-plane--high">
          <animateMotion path="M400 -150 L-400 -230" dur="34s" begin="-12s" repeatCount="indefinite" rotate="auto" />
          <g transform="scale(.8)">
            <PlaneShape />
          </g>
        </g>
      </svg>

      <div className="im-city__title">
        <span>Inmobiliaria</span>
        <small>La ciudad de todos</small>
      </div>
      <p className="im-city__stats">
        <b>{cells.length}</b> de {PROPERTIES.length} con dueño · la ciudad vale <b>{eur(worth)}</b>
      </p>

      {/* Las fotos de los dueños sobre lo suyo, en HTML para usar las mismas fotos que el resto. */}
      {cells.map((own) => {
        const [r, c] = LOTS[own.casilla]
        const cell = BOARD[own.casilla]
        const pos = pct(pt(r, c, heightOf(cell, own) + 6))
        return (
          <button
            key={own.casilla}
            type="button"
            className={`im-pin ${own.owner.me ? 'is-mine' : ''} ${selected === own.casilla ? 'is-selected' : ''}`}
            style={{ ...pos, '--oh': hueOf(own.owner.name), '--d': `${(r + c) * 0.17}s` }}
            onClick={() => onSelect(own.casilla)}
            tabIndex={-1}
            aria-hidden="true"
            title={`${cell.name} · ${own.owner.name}`}
          >
            <Avatar name={own.owner.name} src={own.owner.avatar} size={16} />
            {readySet.has(own.casilla) && <i className="im-pin__coin" />}
            {own.owner.me && burst > 0 && (
              <span className="im-coins" key={burst}>
                <i />
                <i />
                <i />
              </span>
            )}
          </button>
        )
      })}
      {Object.entries(fx).map(([i, e]) => {
        const [r, c] = LOTS[i]
        return (
          <span key={`${i}-${e.key}`} className={`im-float ${e.type === 'fall' ? 'is-fall' : ''}`} style={pct(pt(r, c, heightOf(BOARD[i], owned.get(Number(i)) ?? e.ghost) + 26))}>
            {e.label}
          </span>
        )
      })}
      {cells.length === 0 && <p className="im-city__empty">Todavía no hay nada construido. ¡Compra el primer solar!</p>}
    </div>
  )
}

export default memo(InmoCity)
