import { memo, useEffect, useRef, useState } from 'react'
import Avatar from './Avatar.jsx'
import { hueOf } from './InmoCity.jsx'
import { GROUPS, WORLD } from './inmo.js'
import { eur } from './money.js'

// El mundo de la Inmobiliaria (reglas en inmo.js): entre la ciudad y el espacio, un mapa con los países en venta.
// Es un SVG en proyección de Mercator (como los mapas de pared, algo estirada en vertical para llenar el cuadro) con
// los continentes dibujados a mano y suavizados, desiertos, selvas, montañas y hielo. Europa, con seis países muy juntos,
// va ampliada en una lupa. La noche cae donde toca según la hora de verdad y allí se encienden las ciudades. Encima, en
// HTML, cada país con su bandera, el halo del dueño y su foto.

const VB = { x: -172, y: -166, size: 352 }
const pct = ([x, y]) => ({ left: `${((x - VB.x) / VB.size) * 100}%`, top: `${((y - VB.y) / VB.size) * 100}%` })
const STRETCH = 1.3
const RAD = Math.PI / 180
// Grados a unidades del mapa: x es la longitud; y, la latitud de Mercator (en grados) estirada.
const proj = (lon, lat) => [lon, -(Math.log(Math.tan(Math.PI / 4 + (Math.max(-80, Math.min(80, lat)) * RAD) / 2)) / RAD) * STRETCH]
const f1 = (n) => Math.round(n * 10) / 10

// Un contorno suavizado (Catmull-Rom pasado a curvas de Bézier) a partir de puntos [longitud, latitud].
function smooth(points, closed = true) {
  const p = points.map(([lon, lat]) => proj(lon, lat))
  const n = p.length
  const at = (k) => (closed ? p[(k + n) % n] : p[Math.max(0, Math.min(n - 1, k))])
  let d = `M${f1(p[0][0])} ${f1(p[0][1])}`
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const [p0, p1, p2, p3] = [at(k - 1), at(k), at(k + 1), at(k + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`
  }
  return closed ? `${d} Z` : d
}

// La lupa de Europa: qué amplía (en grados), dónde va (en unidades del mapa) y cuánto aumenta.
const LENS = { lon: 3, lat: 46, x: -104, y: 125, r: 48, k: 2.6 }
const LENS_C = proj(LENS.lon, LENS.lat)
const inLens = ([x, y]) => [LENS.x + (x - LENS_C[0]) * LENS.k, LENS.y + (y - LENS_C[1]) * LENS.k]
const CANARIAS = { lon: -15.6, lat: 28.2 }
// Desplazamientos (en grados) de los que quedan muy juntos, para que no se pisen.
const NUDGE = { 74: [-4, -6], 75: [7, 3], 80: [-13, 0], 77: [3, -2], 60: [-2.5, -2.5], 61: [1.5, 0.5] }

// Contornos de los continentes, a ojo: [longitud, latitud].
const LAND = [
  [[-168, 65], [-156, 71], [-140, 70], [-120, 70], [-95, 72], [-80, 70], [-65, 62], [-56, 52], [-60, 47], [-66, 44], [-70, 42], [-74, 40], [-76, 36], [-80, 32], [-80, 26], [-82, 26], [-83, 29], [-89, 30], [-95, 29], [-97, 26], [-97, 21], [-91, 19], [-87, 21], [-88, 16], [-84, 11], [-78, 8], [-80, 7], [-86, 12], [-92, 15], [-96, 16], [-105, 20], [-110, 24], [-113, 31], [-117, 32], [-121, 35], [-124, 40], [-124, 47], [-128, 51], [-134, 57], [-141, 60], [-150, 61], [-158, 58], [-164, 60], [-166, 62]],
  [[-55, 60], [-42, 60], [-22, 70], [-18, 77], [-30, 83], [-55, 82], [-70, 78], [-58, 70]],
  [[-78, 8], [-72, 12], [-62, 11], [-52, 5], [-44, -2], [-35, -6], [-39, -14], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-63, -41], [-66, -47], [-68, -53], [-74, -52], [-73, -42], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-77, 4]],
  [[-10, 36], [-9, 43], [-2, 43.5], [-4, 48], [2, 51], [5, 53], [8, 54], [8, 57], [5, 58], [5, 62], [14, 67], [20, 70], [30, 70], [40, 67], [42, 62], [50, 60], [55, 50], [48, 46], [40, 46], [36, 45], [29, 41], [26, 40], [23, 38], [20, 40], [19, 42], [14, 45], [12, 44], [16, 41], [16, 38], [12, 38], [10, 44], [7, 44], [3, 43], [0, 39], [-2, 37]],
  [[-5, 50], [1, 51], [2, 53], [-1, 55], [-2, 57], [-5, 58.5], [-6, 56], [-3, 54], [-5, 52]],
  [[-10, 52], [-6, 52], [-6, 55], [-8, 55]],
  [[-17, 21], [-16, 15], [-17, 13], [-12, 8], [-8, 4.5], [-2, 5], [4, 6], [9, 4], [10, -1], [13, -6], [12, -15], [15, -27], [18, -34.5], [25, -34], [32, -29], [35, -24], [40, -15], [40, -10], [39, -5], [43, 0], [51, 11], [44, 11], [42, 15], [38, 18], [34, 27], [33, 31], [25, 32], [20, 32], [15, 32.5], [10, 33], [10, 37], [3, 37], [-2, 35], [-6, 36], [-9, 32], [-10, 29], [-13, 27]],
  [[26, 40], [36, 36], [35, 33], [34, 28], [38, 22], [43, 13], [52, 16], [57, 22], [56, 26], [50, 30], [48, 30], [57, 25], [62, 25], [67, 25], [72, 21], [73, 17], [77, 8], [80, 13], [80, 16], [87, 22], [92, 22], [94, 17], [98, 16], [98, 8], [103, 1.5], [104, 10], [109, 12], [109, 20], [117, 23], [122, 30], [121, 37], [118, 39], [122, 40], [126, 38], [129, 35], [130, 43], [140, 48], [142, 54], [135, 55], [141, 59], [155, 60], [162, 62], [170, 60], [180, 65], [180, 70], [160, 71], [140, 73], [120, 74], [110, 77], [90, 76], [75, 73], [65, 70], [55, 70], [45, 68], [40, 67], [42, 62], [50, 60], [55, 50], [48, 46], [40, 46], [36, 45], [29, 41]],
  [[130, 31], [132, 34], [135, 34], [140, 35], [141, 38], [142, 42], [145, 44], [141, 45], [140, 41], [137, 37], [133, 35.5]],
  [[114, -22], [114, -34], [118, -35], [124, -33], [131, -31.5], [135, -35], [138, -35], [141, -38], [147, -38.5], [150, -37], [153, -31], [153, -25], [146, -19], [143, -11], [141, -13], [136, -12], [131, -11], [127, -14], [122, -17]],
  [[172, -34.5], [174, -37], [178, -38], [175, -41.5], [172, -41], [171, -44], [167, -46], [170, -46.5], [174, -41.6]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -16]],
  [[109, 2], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[95, 5], [98, 4], [106, -6], [103, -5]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [137, -5]],
]

const GREENLAND = 1
const landPath = LAND.map((poly) => smooth(poly)).join(' ')
const icePath = smooth(LAND[GREENLAND])

// Desiertos, selvas y cordilleras, para que no sea todo del mismo verde.
const DESERTS = [
  [[-15, 27], [-5, 31], [10, 31], [25, 30], [32, 24], [30, 17], [15, 15], [0, 16], [-14, 19]],
  [[37, 29], [47, 28], [55, 23], [52, 16], [44, 16], [39, 21]],
  [[119, -22], [130, -19], [140, -24], [138, -30], [126, -30], [118, -27]],
  [[88, 45], [108, 45], [117, 42], [104, 38], [90, 40]],
  [[-117, 36], [-108, 36], [-104, 31], [-112, 30]],
  [[56, 40], [65, 44], [70, 40], [62, 36]],
]
const FORESTS = [
  [[-75, -1], [-62, 3], [-50, -1], [-54, -11], [-68, -11]],
  [[10, 3], [27, 3], [29, -5], [16, -6]],
  [[60, 62], [100, 64], [130, 62], [110, 56], [70, 56]],
  [[-120, 58], [-90, 58], [-70, 52], [-95, 52]],
]
const RIDGES = [
  [[-130, 58], [-116, 50], [-109, 41], [-106, 32]],
  [[-77, 6], [-78, -6], [-71, -20], [-70, -35], [-72, -50]],
  [[68, 36], [80, 32], [90, 28.5], [98, 28]],
  [[5.5, 45.5], [10, 46.5], [15, 47]],
]
// Grandes ciudades: de noche se encienden.
const CITIES = [
  [-74, 40.7], [-118, 34], [-87.6, 41.9], [-99.1, 19.4], [-79.4, 43.7], [-46.6, -23.5], [-58.4, -34.6], [-66.9, 10.5], [-82.4, 23.1],
  [-0.1, 51.5], [2.3, 48.8], [-3.7, 40.4], [12.5, 41.9], [13.4, 52.5], [37.6, 55.7], [-15.4, 28.1], [-7.6, 33.6], [31.2, 30],
  [3.4, 6.5], [28, -26.2], [36.8, -1.3], [55.3, 25.2], [72.9, 19.1], [77.2, 28.6], [88.4, 22.6], [100.5, 13.7], [103.8, 1.3],
  [116.4, 39.9], [121.5, 31.2], [114.2, 22.3], [127, 37.6], [139.7, 35.7], [135.5, 34.7], [151.2, -33.9], [145, -37.8], [174.8, -36.8],
]

// Rutas de avión (de dónde a dónde, en grados, y cuánto tardan) y de barco.
const FLIGHTS = [
  [[-15.6, 28.2], [-74, 40.7], 16],
  [[-0.1, 51.5], [139.7, 35.7], 22],
  [[-118, 34], [151, -33.8], 24],
  [[2.3, 48.8], [-46.6, -23.5], 18],
  [[-3.7, 40.4], [-15.6, 28.2], 9],
  [[55.3, 25.2], [103.8, 1.3], 14],
]
const arc = ([a, b]) => {
  const [x1, y1] = proj(...a)
  const [x2, y2] = proj(...b)
  const lift = Math.hypot(x2 - x1, y2 - y1) * 0.22
  return `M${f1(x1)} ${f1(y1)} Q${f1((x1 + x2) / 2)} ${f1((y1 + y2) / 2 - lift)} ${f1(x2)} ${f1(y2)}`
}
const line = (a, b) => {
  const [x1, y1] = proj(...a)
  const [x2, y2] = proj(...b)
  return `M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)}`
}
const SHIPS = [
  [line([-40, 10], [-20, 38]), 40],
  [line([-150, 20], [-130, -10]), 50],
  [line([70, -10], [95, 5]), 45],
  [line([-30, -30], [5, -10]), 55],
]
const CLOUDS = [
  [-120, -60, 1, 90],
  [20, -10, 0.8, 120],
  [110, 30, 1.2, 100],
  [-60, 40, 0.9, 110],
  [160, -80, 1, 130],
]

// Dónde es de noche: la longitud opuesta al sol, según la hora UTC (el sol está sobre la longitud 0 a las 12:00 UTC).
function nightAt(t = Date.now()) {
  const d = new Date(t)
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60
  const sun = (12 - hours) * 15
  return ((sun + 180 + 540) % 360) - 180
}
const isNight = (lon, center) => Math.abs(((lon - center + 540) % 360) - 180) < 80

// La rosa de los vientos, de adorno.
function Compass({ x, y, r }) {
  const pts = (a, long) => {
    const t = (a * Math.PI) / 180
    const tip = [x + Math.sin(t) * long, y - Math.cos(t) * long]
    const l = [x + Math.sin(t - Math.PI / 2) * r * 0.18, y - Math.cos(t - Math.PI / 2) * r * 0.18]
    const rr = [x + Math.sin(t + Math.PI / 2) * r * 0.18, y - Math.cos(t + Math.PI / 2) * r * 0.18]
    return [`${f1(tip[0])},${f1(tip[1])} ${f1(l[0])},${f1(l[1])} ${x},${y}`, `${f1(tip[0])},${f1(tip[1])} ${f1(rr[0])},${f1(rr[1])} ${x},${y}`]
  }
  return (
    <g className="wd-compass">
      <circle cx={x} cy={y} r={r * 0.78} />
      {[45, 135, 225, 315].map((a) => pts(a, r * 0.62).map((p, k) => <polygon key={`${a}-${k}`} points={p} className={k ? 'is-dark' : undefined} />))}
      {[0, 90, 180, 270].map((a) => pts(a, r).map((p, k) => <polygon key={`${a}-${k}`} points={p} className={k ? 'is-dark' : 'is-gold'} />))}
      <text x={x} y={y - r - 2.5} textAnchor="middle">
        N
      </text>
    </g>
  )
}

function Country({ cell, own, selected, fresh, onSelect, style }) {
  return (
    <button
      type="button"
      className={`wd-country ${own ? 'is-owned' : ''} ${own?.owner.me ? 'is-mine' : ''} ${selected ? 'is-selected' : ''} ${fresh ? 'is-fresh' : ''}`}
      style={{ ...style, '--band': GROUPS[cell.group].color, ...(own ? { '--oh': hueOf(own.owner.name) } : {}) }}
      onClick={() => onSelect(cell.i)}
      aria-pressed={selected}
      aria-label={`${cell.name}: ${own ? `de ${own.owner.me ? 'ti' : own.owner.name}` : `se vende, ${eur(cell.price)}`}`}
      title={`${cell.name} · ${eur(cell.price)}`}
    >
      <span className="wd-pin">
        <span className="wd-flag">{cell.flag}</span>
      </span>
      <span className="wd-name">
        {cell.name}
        {!own && <small>{eur(cell.price)}</small>}
      </span>
      {own && (
        <span className={`wd-owner ${own.owner.me ? 'is-mine' : ''}`}>
          <Avatar name={own.owner.name} src={own.owner.avatar} size={16} />
        </span>
      )}
    </button>
  )
}

// El mapa (todo lo que no cambia con las compras), aparte para no redibujarlo.
const Map_ = memo(function Map_({ night }) {
  const nx = night
  const nightRects = [-360, 0, 360].map((off) => nx + off - 120)
  return (
    <svg className="wd-map" viewBox={`${VB.x} ${VB.y} ${VB.size} ${VB.size}`} aria-hidden="true">
      <defs>
        <radialGradient id="wd-ocean" cx="50%" cy="45%" r="75%">
          <stop offset="0" stopColor="#2a86c4" />
          <stop offset="0.6" stopColor="#15588f" />
          <stop offset="1" stopColor="#0a2f55" />
        </radialGradient>
        <linearGradient id="wd-landfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8cc96a" />
          <stop offset="1" stopColor="#5f9f4b" />
        </linearGradient>
        <linearGradient id="wd-night" x1="0" x2="1">
          <stop offset="0" stopColor="#020617" stopOpacity="0" />
          <stop offset="0.3" stopColor="#020617" stopOpacity="0.5" />
          <stop offset="0.7" stopColor="#020617" stopOpacity="0.5" />
          <stop offset="1" stopColor="#020617" stopOpacity="0" />
        </linearGradient>
        <pattern id="wd-waves" width="14" height="9" patternUnits="userSpaceOnUse">
          <path d="M0 6 q3.5 -3 7 0 t7 0" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth=".5" />
        </pattern>
        <filter id="wd-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <clipPath id="wd-lens">
          <circle cx={LENS.x} cy={LENS.y} r={LENS.r} />
        </clipPath>
        <clipPath id="wd-landclip">
          <path d={landPath} />
        </clipPath>
      </defs>
      <rect x={VB.x} y={VB.y} width={VB.size} height={VB.size} fill="url(#wd-ocean)" />
      <rect className="wd-waves" x={VB.x - 14} y={VB.y} width={VB.size + 28} height={VB.size} fill="url(#wd-waves)" />
      <g className="wd-grid">
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => (
          <line key={lon} x1={lon} y1={VB.y} x2={lon} y2={VB.y + VB.size} />
        ))}
        {[-60, -40, -20, 0, 20, 40, 60].map((lat) => {
          const y = proj(0, lat)[1]
          return <line key={lat} x1={VB.x} y1={y} x2={VB.x + VB.size} y2={y} className={lat === 0 ? 'is-eq' : undefined} />
        })}
      </g>
      {/* La Antártida, al fondo. */}
      <path className="wd-antarctica" d={`M${VB.x} 162 Q-120 150 -60 158 T60 154 T180 160 V${VB.y + VB.size} H${VB.x} Z`} />
      <path className="wd-shallow" d={landPath} filter="url(#wd-soft)" />
      <path className="wd-land" d={landPath} />
      <g clipPath="url(#wd-landclip)">
        {FORESTS.map((p, k) => (
          <path key={k} className="wd-forest" d={smooth(p)} filter="url(#wd-soft)" />
        ))}
        {DESERTS.map((p, k) => (
          <path key={k} className="wd-desert" d={smooth(p)} filter="url(#wd-soft)" />
        ))}
        <path className="wd-ice" d={icePath} />
        {RIDGES.map((p, k) => (
          <path key={k} className="wd-ridge" d={smooth(p, false)} />
        ))}
      </g>
      <path className="wd-coast" d={landPath} />
      <circle className="wd-home" cx={proj(CANARIAS.lon, CANARIAS.lat)[0]} cy={proj(CANARIAS.lon, CANARIAS.lat)[1]} r="1.6" />

      {nightRects.map((x) => (
        <rect key={x} x={x} y={VB.y} width="240" height={VB.size} fill="url(#wd-night)" />
      ))}
      <g className="wd-lights">
        {CITIES.filter(([lon]) => isNight(lon, nx)).map(([lon, lat]) => {
          const [x, y] = proj(lon, lat)
          return <circle key={`${lon},${lat}`} cx={x} cy={y} r="1.1" style={{ animationDelay: `${(lon * 7) % 3}s` }} />
        })}
      </g>

      {SHIPS.map(([d, t], k) => (
        <g key={k} className="wd-ship">
          <animateMotion path={d} dur={`${t}s`} begin={`${-k * 9}s`} repeatCount="indefinite" />
          <path d="M-2.4 0 L2.4 0 L1.6 1.2 L-1.6 1.2 Z M-0.3 0 L-0.3 -2.6 L1.4 -0.4 Z" />
          <path className="wd-wake" d="M-2.4 .8 l-5 1.6 M-2.4 .8 l-5 -0.6" />
        </g>
      ))}
      {CLOUDS.map(([x, y, s, t], k) => (
        <g key={k} className="wd-cloud" style={{ '--t': `${t}s`, animationDelay: `${-k * 23}s` }}>
          <g transform={`translate(${x} ${y}) scale(${s})`}>
            <ellipse rx="9" ry="3" />
            <ellipse cx="-5" cy="1" rx="5" ry="2.4" />
            <ellipse cx="5" cy="1" rx="6" ry="2.6" />
          </g>
        </g>
      ))}
      {FLIGHTS.map((f, k) => (
        <g key={k}>
          <path className="wd-route" d={arc(f)} />
          <g className="wd-plane">
            <animateMotion path={arc(f)} dur={`${f[2]}s`} begin={`${-k * 3.7}s`} repeatCount="indefinite" rotate="auto" />
            <path d="M-3 0 L2.4 -0.4 Q3.4 0 2.4 0.4 Z M-0.4 0 L-1.8 -2.4 L-0.8 -2.4 L1 0 L-0.8 2.4 L-1.8 2.4 Z" />
          </g>
        </g>
      ))}

      {/* La lupa de Europa, con su mango, unida al trozo de mapa que amplía. */}
      <circle className="wd-lens-mark" cx={LENS_C[0]} cy={LENS_C[1]} r="16" />
      <line className="wd-lens-line" x1={LENS_C[0] - 12} y1={LENS_C[1] + 11} x2={LENS.x + LENS.r * 0.72} y2={LENS.y - LENS.r * 0.7} />
      <line className="wd-lens-handle" x1={LENS.x - LENS.r * 0.72} y1={LENS.y + LENS.r * 0.72} x2={LENS.x - LENS.r * 1.05} y2={LENS.y + LENS.r * 1.05} />
      <circle className="wd-lens-bg" cx={LENS.x} cy={LENS.y} r={LENS.r} />
      <g clipPath="url(#wd-lens)">
        <g transform={`translate(${LENS.x} ${LENS.y}) scale(${LENS.k}) translate(${-LENS_C[0]} ${-LENS_C[1]})`}>
          <path className="wd-shallow" d={landPath} />
          <path className="wd-land" d={landPath} />
          <path className="wd-ridge" d={smooth(RIDGES[3], false)} />
          <path className="wd-coast" d={landPath} />
        </g>
        <circle className="wd-lens-glare" cx={LENS.x - LENS.r * 0.35} cy={LENS.y - LENS.r * 0.45} r={LENS.r * 0.5} />
      </g>
      <circle className="wd-lens-ring" cx={LENS.x} cy={LENS.y} r={LENS.r} />
      <Compass x={-28} y={138} r={14} />
    </svg>
  )
})

function InmoWorld({ cells, selected, onSelect, onHome }) {
  const owned = new Map(cells.map((c) => [c.casilla, c]))
  const worth = cells.reduce((sum, c) => sum + c.invested, 0)

  // La noche va por donde va el sol: se recoloca cada minuto.
  const [night, setNight] = useState(() => nightAt())
  useEffect(() => {
    const timer = setInterval(() => setNight(nightAt()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Lo recién comprado brilla un momento (solo lo que cambia mientras miras).
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

  return (
    <section className="wd-world" aria-label="El mundo">
      <Map_ night={Math.round(night)} />

      {WORLD.map((cell) => {
        const [dx, dy] = NUDGE[cell.i] ?? [0, 0]
        const at = proj(cell.lon + dx, cell.lat + dy)
        return (
          <Country
            key={cell.i}
            cell={cell}
            own={owned.get(cell.i)}
            selected={selected === cell.i}
            fresh={fresh.has(cell.i)}
            onSelect={onSelect}
            style={pct(cell.group === 'europa' ? inLens(at) : at)}
          />
        )
      })}
      <button type="button" className="wd-canarias" style={pct(proj(CANARIAS.lon, CANARIAS.lat))} onClick={onHome} title="Canarias: aquí está la ciudad">
        🏝️ <span>Tu ciudad</span>
      </button>
      <span className="wd-lens-label" style={pct([LENS.x, LENS.y + LENS.r + 6])}>
        Europa
      </span>

      <div className="wd-cartouche">
        <span>El mundo</span>
        <small>países en venta: cuanto más rico, más caro</small>
        <p>
          <b>{cells.length}</b> de {WORLD.length} con dueño · vale <b>{eur(worth)}</b>
        </p>
      </div>
    </section>
  )
}

export default memo(InmoWorld)
