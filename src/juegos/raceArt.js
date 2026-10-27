// Arte procedural de la Carrera de coches (canvas 2D, sin imágenes): circuito, fondo nocturno, sprites de los coches y partículas.
// Todo se precalcula una sola vez (circuito, fondo, sprites) y la escena solo dibuja copias, para mantener 60 fps.
import { CAR_INFO, CIRCUITS } from './race.js'

export const TRACK_W = 230
export const CAR_L = 60
export const LANE_GAP = 34
const TAU = Math.PI * 2

// ---------- utilidades ----------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasOf(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function rr(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function rrPath(g, x, y, w, h, r) {
  rr(g, x, y, w, h, r)
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Mezcla un color con negro (amt<0) o blanco (amt>0).
export function shade(hex, amt) {
  const [r, gg, b] = hexRgb(hex)
  const t = amt < 0 ? 0 : 255
  const k = Math.abs(amt)
  return `rgb(${Math.round(r + (t - r) * k)},${Math.round(gg + (t - gg) * k)},${Math.round(b + (t - b) * k)})`
}

export function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

// ---------- los circuitos ----------
// Dos clases de pista (race.CIRCUITS dice cuál es cuál):
// - Circuitos: una spline cerrada por puntos de control en un mundo de 2700 × 1650. Todos se recorren en sentido antihorario
//   en pantalla, con la recta de meta abajo hacia la derecha, para que la parrilla, los boxes (dentro) y las gradas (fuera)
//   caben igual en todos. Las vueltas miden parecido (6000-6700) para que la velocidad de los coches sea la misma.
// - Rectas de aceleración: una recta larga, de la salida (u = 0) a la meta (u = 1), con zona de frenada detrás. El fondo es
//   un tramo de DRAG_TILE que se repite, porque un lienzo de toda la recta sería enorme.
// El tema decide los colores del suelo, el decorado de fuera, los árboles, el lago y la valla de neón.
const CIRCUIT_WORLD = [2700, 1650]
export const DRAG_LEN = 16000 // de la salida a la meta: lo mismo que tres vueltas, para que los coches vayan igual de rápido
export const DRAG_TILE = 2400 // ancho del tramo de fondo que se repite (múltiplo de 48 y de la separación de las farolas)
const DRAG_X0 = 1400 // x de la salida: detrás caben la parrilla y la espera de los coches
const DRAG_H = 1100
const DRAG_Y = 520
const DRAG_POLE = 400

const THEMES = {
  city: {
    ground: ['#0d2a1d', '#0b2418'], base: '#071219', speck: '160,255,190', outside: 'city', trees: 'round', leaf: ['#2f7d4a', '#0f3a24'],
    water: ['#0f4a63', '#082a3a', '120,230,255'], neon: '60,210,255', neonHi: '120,240,255',
    kerb: ['#c42f35', '#f4f1ea'], runoff: '#0d1a20', asphalt: '#2a2f36', wet: true, lamp: '255,236,190',
  },
  desert: {
    ground: ['#4a3016', '#432a12'], base: '#2a1a0c', speck: '255,214,150', outside: 'dunes', trees: 'cactus', leaf: ['#6f9a45', '#2f4f1c'],
    water: ['#1f8a8a', '#0d4d55', '140,255,235'], neon: '255,140,60', neonHi: '255,200,120',
    kerb: ['#d9541e', '#fbe7c6'], runoff: '#3a2614', asphalt: '#34302d', wet: false, lamp: '255,210,150',
  },
  snow: {
    ground: ['#8fa3b5', '#869aac'], base: '#6f8396', speck: '255,255,255', outside: 'snow', trees: 'pine', leaf: ['#3f6b5c', '#173a33'],
    water: ['#bfe9ff', '#7cc4e8', '255,255,255'], neon: '120,170,255', neonHi: '200,225,255',
    kerb: ['#2f62d9', '#ffffff'], runoff: '#5d6e7e', asphalt: '#30363e', wet: true, lamp: '220,235,255',
  },
  jungle: {
    ground: ['#123b1c', '#0f3318'], base: '#06150a', speck: '190,255,160', outside: 'jungle', trees: 'palm', leaf: ['#3fae4f', '#0e4a1f'],
    water: ['#0f6b5a', '#073a33', '150,255,210'], neon: '170,255,90', neonHi: '220,255,160',
    kerb: ['#e0b51f', '#1d6b2c'], runoff: '#0c2412', asphalt: '#2b2f2c', wet: true, lamp: '230,255,200',
  },
}

// En el mismo orden que race.CIRCUITS.
export const LAYOUTS = [
  {
    // Neón City: circuito urbano de rectas y curvas en escalera entre los edificios.
    ctrl: [
      [1500, 1400], [2150, 1395], [2400, 1330], [2470, 1150], [2440, 950], [2300, 830], [2050, 800], [1900, 700], [1860, 500], [1800, 320],
      [1620, 240], [1300, 240], [1000, 250], [860, 360], [860, 560], [760, 680], [540, 680], [360, 720], [280, 900], [290, 1150], [400, 1340],
      [700, 1400],
    ],
    lake: [1330, 1010, 230, 100, -0.05],
    theme: THEMES.city,
  },
  {
    // Desierto Dorado: rectas larguísimas, una curva rápida enorme y una horquilla en medio.
    ctrl: [
      [1400, 1420], [2050, 1420], [2400, 1360], [2500, 1180], [2450, 950], [2300, 700], [2200, 450], [2050, 280], [1820, 250], [1650, 380],
      [1600, 600], [1500, 780], [1300, 820], [1100, 700], [950, 480], [800, 300], [560, 250], [340, 330], [260, 560], [300, 820], [260, 1080],
      [380, 1330], [700, 1420],
    ],
    lake: [1950, 1100, 200, 90, 0.1],
    theme: THEMES.desert,
  },
  {
    // Glaciar Polar: un triángulo rápido con una horquilla profunda que se mete en el campo de hielo.
    ctrl: [
      [1400, 1420], [2050, 1420], [2350, 1350], [2470, 1150], [2380, 900], [2150, 720], [1950, 520], [1800, 300], [1580, 230], [1420, 360],
      [1420, 600], [1300, 830], [1060, 830], [940, 600], [880, 350], [680, 240], [440, 300], [300, 500], [300, 800], [260, 1080], [380, 1330],
      [700, 1420],
    ],
    lake: [1950, 1060, 200, 90, 0.1],
    theme: THEMES.snow,
  },
  {
    // Selva Esmeralda: eses enlazadas por toda la jungla.
    ctrl: [
      [1400, 1420], [2000, 1420], [2320, 1350], [2400, 1170], [2260, 1010], [2270, 830], [2450, 700], [2480, 480], [2300, 300], [2050, 330],
      [1900, 520], [1700, 620], [1500, 500], [1400, 300], [1180, 240], [930, 300], [800, 500], [640, 620], [440, 560], [300, 640], [280, 900],
      [300, 1150], [420, 1350], [700, 1420],
    ],
    lake: [1250, 960, 220, 100, 0.15],
    theme: THEMES.jungle,
  },
  // Rectas de aceleración.
  { drag: true, theme: THEMES.city },
  { drag: true, theme: THEMES.snow },
]

export function buildTrack(ctrl) {
  const n = ctrl.length
  const raw = []
  const STEPS = 24
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n]
    const p1 = ctrl[i]
    const p2 = ctrl[(i + 1) % n]
    const p3 = ctrl[(i + 2) % n]
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS
      const t2 = t * t
      const t3 = t2 * t
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  const m0 = raw.length
  const cum = new Float64Array(m0 + 1)
  for (let i = 0; i < m0; i++) {
    const a = raw[i]
    const b = raw[(i + 1) % m0]
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  const L = cum[m0]
  const M = Math.round(L / 8)
  const px = new Float32Array(M)
  const py = new Float32Array(M)
  let j = 0
  for (let i = 0; i < M; i++) {
    const d = (i / M) * L
    while (cum[j + 1] < d) j++
    const a = raw[j]
    const b = raw[(j + 1) % m0]
    const f = (d - cum[j]) / (cum[j + 1] - cum[j] || 1)
    px[i] = a[0] + (b[0] - a[0]) * f
    py[i] = a[1] + (b[1] - a[1]) * f
  }
  const tx = new Float32Array(M)
  const ty = new Float32Array(M)
  for (let i = 0; i < M; i++) {
    const a = (i - 1 + M) % M
    const b = (i + 1) % M
    const dx = px[b] - px[a]
    const dy = py[b] - py[a]
    const l = Math.hypot(dx, dy) || 1
    tx[i] = dx / l
    ty[i] = dy / l
  }
  const ds = L / M
  const kr = new Float32Array(M)
  for (let i = 0; i < M; i++) {
    const a = (i - 1 + M) % M
    const b = (i + 1) % M
    let d = Math.atan2(ty[b], tx[b]) - Math.atan2(ty[a], tx[a])
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    kr[i] = d / (2 * ds)
  }
  const k = new Float32Array(M)
  for (let i = 0; i < M; i++) {
    let s = 0
    for (let w = -8; w <= 8; w++) s += kr[(i + w + M) % M]
    k[i] = s / 17
  }
  return { M, L, ds, px, py, tx, ty, k, W: CIRCUIT_WORLD[0], H: CIRCUIT_WORLD[1] }
}

// Una recta de aceleración: no hace falta muestrear nada, at() la calcula directamente.
const dragTrack = () => ({ open: true, L: DRAG_LEN, x0: DRAG_X0, y0: DRAG_Y, W: Math.round(DRAG_X0 + DRAG_LEN * 1.32 + 600), H: DRAG_H })

const tracks = []
export const trackOf = (i) => (tracks[i] ??= LAYOUTS[i].drag ? dragTrack() : buildTrack(LAYOUTS[i].ctrl))

// El circuito que se dibuja ahora (los módulos que lo importan ven el cambio al momento: son enlaces vivos).
export let circuit = -1
export let track = null
export let LEN = 0
export let laps = 3
export let WORLD_W = CIRCUIT_WORLD[0]
export let WORLD_H = CIRCUIT_WORLD[1]
export let theme = null
export let centerPath = null
export let neonInner = null
export let neonOuter = null
export let poles = []

// Punto del circuito a `u` vueltas (0 = línea de meta) y desplazamiento lateral `lat` (positivo = hacia el exterior).
// En una recta de aceleración, `u` va de 0 (salida) a 1 (meta) sin dar la vuelta.
export function at(u, lat, out) {
  if (track.open) {
    out.x = track.x0 + u * track.L
    out.y = track.y0 + lat
    out.tx = 1
    out.ty = 0
    out.k = 0
    return out
  }
  const { M, px, py, tx, ty, k } = track
  const f = (u - Math.floor(u)) * M
  const i0 = Math.floor(f)
  const i = i0 % M
  const j = (i + 1) % M
  const a = f - i0
  let dx = tx[i] + (tx[j] - tx[i]) * a
  let dy = ty[i] + (ty[j] - ty[i]) * a
  const l = Math.hypot(dx, dy) || 1
  dx /= l
  dy /= l
  const x = px[i] + (px[j] - px[i]) * a
  const y = py[i] + (py[j] - py[i]) * a
  out.x = x - dy * lat
  out.y = y + dx * lat
  out.tx = dx
  out.ty = dy
  out.k = k[i] + (k[j] - k[i]) * a
  return out
}

function pathOf(lat, close = true) {
  const p = new Path2D()
  const o = { x: 0, y: 0 }
  if (track.open) {
    p.moveTo(0, track.y0 + lat)
    p.lineTo(track.W, track.y0 + lat)
    return p
  }
  const n = track.M
  for (let i = 0; i < n; i++) {
    at(i / n, lat, o)
    if (i === 0) p.moveTo(o.x, o.y)
    else p.lineTo(o.x, o.y)
  }
  if (close) p.closePath()
  return p
}

// Farolas: posición de la cabeza y del pie junto a la pista.
function polesOf() {
  const list = []
  const o = { x: 0, y: 0 }
  if (track.open) {
    // A distancia fija y alternando lado, para que coincidan con los charcos de luz del tramo de fondo que se repite.
    for (let k = 0; k * DRAG_POLE < track.W; k++) {
      const side = k % 2 ? 1 : -1
      list.push({ x: k * DRAG_POLE + DRAG_POLE / 2, y: track.y0 + side * (TRACK_W / 2 + 56), tx: 1, ty: 0, side })
    }
    return list
  }
  const n = 34
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1
    at(i / n + 0.004, side * (TRACK_W / 2 + 56), o)
    list.push({ x: o.x, y: o.y, tx: o.tx, ty: o.ty, side })
  }
  return list
}

// Cambia el circuito que se dibuja (índice de LAYOUTS). Los trazados se calculan una vez y se guardan.
export function setCircuit(i) {
  if (i === circuit) return
  circuit = i
  track = trackOf(i)
  LEN = track.L
  laps = CIRCUITS[i].laps
  WORLD_W = track.W
  WORLD_H = track.H
  theme = LAYOUTS[i].theme
  centerPath = pathOf(0)
  neonInner = pathOf(-(TRACK_W / 2 + 34))
  neonOuter = pathOf(TRACK_W / 2 + 34)
  poles = polesOf()
}

// Silueta de un circuito para enseñarlo pequeño (SVG en un viewBox de 2700 × 1650): `n` puntos de la línea central.
// Las rectas de aceleración se dibujan como una recta de lado a lado.
export const OUTLINE_BOX = CIRCUIT_WORLD
export function outlineOf(i, n = 90) {
  if (LAYOUTS[i].drag) return `M200,${CIRCUIT_WORLD[1] / 2}L${CIRCUIT_WORLD[0] - 200},${CIRCUIT_WORLD[1] / 2}`
  const { M, px, py } = trackOf(i)
  const pts = []
  for (let k = 0; k < n; k++) {
    const j = Math.floor((k / n) * M)
    pts.push(`${Math.round(px[j])},${Math.round(py[j])}`)
  }
  return `M${pts.join('L')}Z`
}

function insidePoly(x, y) {
  if (track.open) return false
  const { px, py, M } = track
  let inside = false
  for (let i = 0, j = M - 1; i < M; j = i++) {
    if (py[i] > y !== py[j] > y && x < ((px[j] - px[i]) * (y - py[i])) / (py[j] - py[i]) + px[i]) inside = !inside
  }
  return inside
}

function distToTrack(x, y) {
  if (track.open) return Math.abs(y - track.y0)
  const { px, py, M } = track
  let best = 1e9
  for (let i = 0; i < M; i += 3) {
    const d = (px[i] - x) ** 2 + (py[i] - y) ** 2
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

// El lienzo que se está decorando (el mundo entero de un circuito, o el tramo que se repite de una recta), cuánto decorado
// lleva (proporcional a su área) y dónde hay sitio libre para el decorado de fuera.
let decoW = 1
let decoH = 1
let dens = 1
let outside = () => false
const many = (n) => Math.round(n * dens)

// Ciudad nocturna: manzanas de edificios con ventanas encendidas y alguna luz de neón.
function city(g, R) {
  const lights = []
  for (let gy = 0; gy < decoH; gy += 44) {
    for (let gx = 0; gx < decoW; gx += 44) {
      const x = gx + R() * 6
      const y = gy + R() * 6
      if (!outside(x + 20, y + 20)) continue
      if (R() < 0.12) continue
      g.fillStyle = '#05090d'
      g.fillRect(gx - 4, gy - 4, 52, 52)
      const w = 28 + R() * 12
      const h = 28 + R() * 12
      const tone = 18 + R() * 20
      g.fillStyle = `rgb(${tone},${tone + 8},${tone + 18})`
      g.fillRect(x, y, w, h)
      g.fillStyle = 'rgba(255,255,255,0.05)'
      g.fillRect(x, y, w, 2)
      g.fillStyle = 'rgba(0,0,0,0.3)'
      g.fillRect(x + w - 3, y, 3, h)
      for (let wy = y + 4; wy < y + h - 3; wy += 6) {
        for (let wx = x + 4; wx < x + w - 5; wx += 6) {
          if (R() < 0.42) {
            g.fillStyle = R() < 0.8 ? 'rgba(255,214,120,0.75)' : 'rgba(120,225,255,0.75)'
            g.fillRect(wx, wy, 3, 2)
          }
        }
      }
      if (R() < 0.18) lights.push([x + w / 2, y + h / 2, R() < 0.5 ? '255,60,90' : '70,200,255'])
    }
  }
  glows(g, lights, 40)
}

// Halos de luz sumados (ventanas, hogueras, luciérnagas).
function glows(g, list, r) {
  g.globalCompositeOperation = 'lighter'
  for (const [x, y, col, a = 0.5] of list) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(${col},${a})`)
    gr.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  g.globalCompositeOperation = 'source-over'
}

// Desierto: dunas con su cara en sombra, rocas y alguna hoguera de campamento.
function dunes(g, R) {
  for (let i = 0; i < many(260); i++) {
    const x = R() * decoW
    const y = R() * decoH
    if (!outside(x, y)) continue
    const w = 70 + R() * 120
    const h = 18 + R() * 26
    g.save()
    g.translate(x, y)
    g.rotate(-0.35 + (R() - 0.5) * 0.3)
    g.fillStyle = 'rgba(30,16,6,0.45)'
    g.beginPath()
    g.ellipse(0, h * 0.35, w, h, 0, 0, TAU)
    g.fill()
    const gr = g.createLinearGradient(0, -h, 0, h)
    gr.addColorStop(0, '#9a6a34')
    gr.addColorStop(0.55, '#6e4720')
    gr.addColorStop(1, '#4a2f14')
    g.fillStyle = gr
    g.beginPath()
    g.ellipse(0, 0, w, h, 0, 0, TAU)
    g.fill()
    g.strokeStyle = 'rgba(255,220,160,0.18)'
    g.lineWidth = 2
    g.beginPath()
    g.ellipse(0, -h * 0.1, w * 0.9, h * 0.75, 0, Math.PI * 1.1, Math.PI * 1.9)
    g.stroke()
    g.restore()
  }
  const fires = []
  for (let i = 0; i < many(140); i++) {
    const x = R() * decoW
    const y = R() * decoH
    if (!outside(x, y)) continue
    rock(g, x, y, 6 + R() * 14, R, '#3b2617', '#5e4027')
    if (R() < 0.08) fires.push([x + 14, y + 10, '255,140,50', 0.7])
  }
  for (const [x, y] of fires) {
    g.fillStyle = '#ffcf6a'
    g.beginPath()
    g.arc(x, y, 3, 0, TAU)
    g.fill()
  }
  glows(g, fires, 46)
}

// Una roca vista desde arriba: polígono irregular con su sombra y un borde iluminado.
function rock(g, x, y, r, R, dark, light) {
  const n = 6 + Math.floor(R() * 3)
  const pts = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU
    const rr0 = r * (0.7 + R() * 0.45)
    pts.push([x + Math.cos(a) * rr0, y + Math.sin(a) * rr0 * 0.8])
  }
  const poly = (dx, dy) => {
    g.beginPath()
    pts.forEach(([px, py], k) => (k ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)))
    g.closePath()
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'
  poly(4, 5)
  g.fill()
  g.fillStyle = dark
  poly(0, 0)
  g.fill()
  g.fillStyle = light
  g.beginPath()
  g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.45, r * 0.3, -0.5, 0, TAU)
  g.fill()
}

// Glaciar: ventisqueros con sombra azulada, bloques de hielo y cabañas con la luz encendida.
function snowfield(g, R) {
  for (let i = 0; i < many(300); i++) {
    const x = R() * decoW
    const y = R() * decoH
    if (!outside(x, y)) continue
    const w = 40 + R() * 90
    const h = 16 + R() * 22
    g.save()
    g.translate(x, y)
    g.rotate((R() - 0.5) * 0.6)
    g.fillStyle = 'rgba(40,70,110,0.28)'
    g.beginPath()
    g.ellipse(6, h * 0.4, w, h, 0, 0, TAU)
    g.fill()
    const gr = g.createRadialGradient(-w * 0.3, -h * 0.4, 2, 0, 0, w)
    gr.addColorStop(0, '#eef6ff')
    gr.addColorStop(1, '#a9bdd0')
    g.fillStyle = gr
    g.beginPath()
    g.ellipse(0, 0, w, h, 0, 0, TAU)
    g.fill()
    g.restore()
  }
  const lights = []
  for (let i = 0; i < many(90); i++) {
    const x = R() * decoW
    const y = R() * decoH
    if (!outside(x, y)) continue
    if (R() < 0.22) {
      // cabaña: tejado nevado a dos aguas y una ventana cálida
      const w = 34 + R() * 16
      const h = 26 + R() * 10
      g.fillStyle = 'rgba(20,40,70,0.4)'
      g.fillRect(x + 4, y + 5, w, h)
      g.fillStyle = '#5b3b26'
      g.fillRect(x, y, w, h)
      g.fillStyle = '#f4f8ff'
      g.fillRect(x - 3, y - 3, w + 6, h / 2 + 3)
      g.fillStyle = '#dfe9f5'
      g.fillRect(x - 3, y + h / 2, w + 6, h / 2 - 4)
      g.fillStyle = '#ffd27a'
      g.fillRect(x + w * 0.4, y + h - 5, 8, 4)
      lights.push([x + w * 0.4 + 4, y + h + 2, '255,190,90', 0.55])
    } else rock(g, x, y, 8 + R() * 14, R, '#7d93a8', '#d8e6f2')
  }
  glows(g, lights, 44)
}

// Selva: copas de árboles muy juntas, flores y luciérnagas.
function jungle(g, R) {
  for (let i = 0; i < many(2600); i++) {
    const x = R() * decoW
    const y = R() * decoH
    if (!outside(x, y)) continue
    const r = 14 + R() * 22
    g.fillStyle = 'rgba(0,0,0,0.4)'
    g.beginPath()
    g.arc(x + 5, y + 6, r, 0, TAU)
    g.fill()
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r)
    const tone = R()
    gr.addColorStop(0, tone < 0.5 ? '#2f8a3e' : tone < 0.85 ? '#3c9a36' : '#5a8f2a')
    gr.addColorStop(1, '#082a12')
    g.fillStyle = gr
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.fill()
    if (R() < 0.06) {
      g.fillStyle = ['#ff5aa8', '#ffd24a', '#ff7a3a'][Math.floor(R() * 3)]
      g.beginPath()
      g.arc(x + (R() - 0.5) * r, y + (R() - 0.5) * r, 2.5, 0, TAU)
      g.fill()
    }
  }
  const flies = []
  for (let i = 0; i < many(160); i++) {
    const x = R() * decoW
    const y = R() * decoH
    if (distToTrack(x, y) > TRACK_W / 2 + 60) flies.push([x, y, '200,255,120', 0.35])
  }
  glows(g, flies, 12)
}

// Un árbol (o cactus) visto desde arriba, según el tema.
function tree(g, kind, x, y, r, R, leaf) {
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.beginPath()
  g.arc(x + 4, y + 5, r, 0, TAU)
  g.fill()
  if (kind === 'cactus') {
    // saguaro: tronco con costillas y dos brazos
    const arms = [[r * 0.9, -r * 0.2, r * 0.5], [-r * 0.8, r * 0.3, r * 0.45]]
    for (const [dx, dy, ar] of [[0, 0, r * 0.62], ...arms]) {
      const gr = g.createRadialGradient(x + dx - ar * 0.3, y + dy - ar * 0.3, 1, x + dx, y + dy, ar)
      gr.addColorStop(0, leaf[0])
      gr.addColorStop(1, leaf[1])
      g.fillStyle = gr
      g.beginPath()
      g.arc(x + dx, y + dy, ar, 0, TAU)
      g.fill()
    }
    g.strokeStyle = 'rgba(220,255,180,0.25)'
    g.lineWidth = 1
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6)
      g.stroke()
    }
    return
  }
  if (kind === 'pine') {
    // pino: estrella de ramas en capas, con nieve en las puntas
    for (let layer = 0; layer < 3; layer++) {
      const lr = r * (1 - layer * 0.28)
      const n = 9
      g.beginPath()
      for (let k = 0; k < n * 2; k++) {
        const a = (k / (n * 2)) * TAU + layer * 0.3
        const d = k & 1 ? lr * 0.55 : lr
        k ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
      }
      g.closePath()
      g.fillStyle = layer === 0 ? leaf[1] : layer === 1 ? leaf[0] : '#e9f3ff'
      g.fill()
    }
    return
  }
  if (kind === 'palm') {
    // palmera: hojas largas en abanico alrededor del tronco
    const n = 7
    const a0 = R() * TAU
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU
      g.save()
      g.translate(x, y)
      g.rotate(a)
      const gr = g.createLinearGradient(0, 0, r * 1.3, 0)
      gr.addColorStop(0, leaf[1])
      gr.addColorStop(1, leaf[0])
      g.fillStyle = gr
      g.beginPath()
      g.ellipse(r * 0.65, 0, r * 0.7, r * 0.2, 0, 0, TAU)
      g.fill()
      g.restore()
    }
    g.fillStyle = '#6b4a22'
    g.beginPath()
    g.arc(x, y, r * 0.16, 0, TAU)
    g.fill()
    return
  }
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r)
  gr.addColorStop(0, leaf[0])
  gr.addColorStop(1, leaf[1])
  g.fillStyle = gr
  g.beginPath()
  g.arc(x, y, r, 0, TAU)
  g.fill()
}

// Suelo a franjas diagonales (periodo 48: cabe justo en el tramo de las rectas, así que se repite sin costura) y motas.
function ground(g, R, T) {
  g.fillStyle = T.base
  g.fillRect(0, 0, decoW, decoH)
  for (let i = -decoH - 48; i < decoW + 48; i += 48) {
    g.fillStyle = T.ground[(i / 48) & 1]
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + 24, 0)
    g.lineTo(i + 24 + decoH, decoH)
    g.lineTo(i + decoH, decoH)
    g.fill()
  }
  for (let i = 0; i < many(5200); i++) {
    g.fillStyle = `rgba(${R() < 0.5 ? T.speck : '0,0,0'},${0.03 + R() * 0.04})`
    g.fillRect(R() * decoW, R() * decoH, 1 + R() * 2, 1 + R() * 2)
  }
}

const OUTSIDE = { city, dunes, snow: snowfield, jungle }
const CROWD = ['#ff5a5a', '#ffd35a', '#5ad2ff', '#f1e9d6', '#a97bff', '#ffffff']

// ---------- fondo: el decorado de la pista actual ----------
// Circuito: el mundo entero. Recta de aceleración: el tramo de DRAG_TILE que se repite a lo largo de la recta.
export const makeBackground = () => (track.open ? dragBackground() : circuitBackground())

// Recta de aceleración: suelo, gradas llenas a un lado (exterior, abajo), boxes y árboles al otro y el decorado del tema
// más allá. Todo se pinta tres veces desplazado un tramo (con la misma semilla), así que los bordes casan al repetirlo.
function dragBackground() {
  const T = theme
  const W = DRAG_TILE
  const H = track.H
  const y0 = track.y0
  const hw = TRACK_W / 2
  const c = canvasOf(W, H)
  const g = c.getContext('2d')
  decoW = W
  decoH = H
  dens = (W * H) / (1900 * 1160)
  outside = (x, y) => y < y0 - hw - 200 || y > y0 + hw + 330
  const wrap = (seed, paint) => {
    for (const off of [-W, 0, W]) {
      g.save()
      g.translate(off, 0)
      paint(rng(seed))
      g.restore()
    }
  }
  ground(g, rng(5), T)
  wrap(7 + circuit * 101, (R) => OUTSIDE[T.outside](g, R))
  // árboles entre la recta y el decorado del lado de dentro
  wrap(9, (R) => {
    for (let i = 0; i < 70; i++) {
      const x = R() * W
      const y = y0 - hw - 120 - R() * 90
      tree(g, T.trees, x, y, 9 + R() * 11, R, T.leaf)
    }
  })
  // boxes: un edificio corrido con sus puertas de colores
  g.fillStyle = '#1a232b'
  g.fillRect(0, y0 - hw - 62, W, 34)
  g.fillStyle = '#2a3640'
  g.fillRect(0, y0 - hw - 104, W, 42)
  for (let x = 0; x < W; x += 100) {
    g.fillStyle = CAR_INFO[(x / 100) % 6].color
    g.fillRect(x + 20, y0 - hw - 40, 60, 12)
    g.fillStyle = 'rgba(255,255,255,0.25)'
    g.fillRect(x + 20, y0 - hw - 72, 60, 8)
  }
  // gradas (fuera): siete filas de público
  g.fillStyle = '#121a22'
  g.fillRect(0, y0 + hw + 70, W, 120)
  wrap(13, (R) => {
    for (let r = 0; r < 7; r++) {
      const l0 = y0 + hw + 78 + r * 15
      g.fillStyle = r & 1 ? '#1d2832' : '#18222b'
      g.fillRect(-1, l0, W + 2, 9)
      for (let x = 0; x < W; x += 7) {
        if (R() < 0.18) continue
        g.fillStyle = CROWD[Math.floor(R() * 6)]
        g.globalAlpha = 0.55 + R() * 0.4
        g.beginPath()
        g.arc(x + 3.5, l0 + 4.5, 2.4, 0, TAU)
        g.fill()
        g.globalAlpha = 1
      }
    }
  })
  g.fillStyle = '#05090c'
  g.fillRect(0, y0 + hw + 188, W, 16)
  // letreros de neón en la valla de fuera
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 12; i++) {
    g.fillStyle = rgba(CAR_INFO[i % 6].color, 0.5)
    g.fillRect(i * 200 + 30, y0 + hw + 46, 140, 12)
  }
  g.globalCompositeOperation = 'source-over'
  // oscurecer arriba y abajo
  const vg = g.createLinearGradient(0, 0, 0, H)
  vg.addColorStop(0, 'rgba(0,0,0,0.5)')
  vg.addColorStop(0.3, 'rgba(0,0,0,0)')
  vg.addColorStop(0.75, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.5)')
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)
  return c
}

// Circuito: suelo, lo de fuera, árboles, lago, boxes y gradas.
function circuitBackground() {
  const T = theme
  const c = canvasOf(WORLD_W, WORLD_H)
  const g = c.getContext('2d')
  const R = rng(7 + circuit * 101)
  decoW = WORLD_W
  decoH = WORLD_H
  dens = (WORLD_W * WORLD_H) / (1900 * 1160)
  outside = (x, y) => distToTrack(x, y) >= 260 && !insidePoly(x, y)
  ground(g, R, T)

  // Lo de fuera de la pista.
  OUTSIDE[T.outside](g, R)

  // Árboles en el campo interior y alrededor.
  const [lx, ly, lrx, lry, lrot] = LAYOUTS[circuit].lake
  for (let i = 0; i < many(520); i++) {
    const x = R() * WORLD_W
    const y = R() * WORLD_H
    const d = distToTrack(x, y)
    if (d < TRACK_W / 2 + 120 || (d > 330 && !insidePoly(x, y))) continue
    if (((x - lx) / (lrx + 30)) ** 2 + ((y - ly) / (lry + 30)) ** 2 < 1) continue
    tree(g, T.trees, x, y, 9 + R() * 11, R, T.leaf)
  }

  // Un lago en el interior (reflejos de neón).
  const [w0, w1, glint] = T.water
  g.save()
  g.translate(lx, ly)
  g.rotate(lrot)
  const lake = g.createRadialGradient(0, 0, 10, 0, 0, Math.max(lrx, lry) * 0.8)
  lake.addColorStop(0, w0)
  lake.addColorStop(1, w1)
  g.fillStyle = lake
  g.beginPath()
  g.ellipse(0, 0, lrx, lry, 0, 0, TAU)
  g.fill()
  g.strokeStyle = `rgba(${glint},0.25)`
  g.lineWidth = 2
  for (let i = -3; i <= 3; i++) {
    g.beginPath()
    g.ellipse(i * 14, i * 4, Math.max(8, lrx * 0.47 - Math.abs(i) * 14), lry * 0.2, 0, 0, TAU)
    g.stroke()
  }
  g.restore()

  // Boxes (interior de la recta) y gradas (exterior), a lo largo de la recta de meta.
  const o = { x: 0, y: 0 }
  const strip = (u0, u1, l0, l1, fill, steps = 40) => {
    g.beginPath()
    for (let i = 0; i <= steps; i++) {
      at(u0 + ((u1 - u0) * i) / steps, l0, o)
      if (i === 0) g.moveTo(o.x, o.y)
      else g.lineTo(o.x, o.y)
    }
    for (let i = steps; i >= 0; i--) {
      at(u0 + ((u1 - u0) * i) / steps, l1, o)
      g.lineTo(o.x, o.y)
    }
    g.closePath()
    g.fillStyle = fill
    g.fill()
  }
  const hw = TRACK_W / 2
  // pit lane + edificio de boxes (interior)
  strip(-0.05, 0.07, -(hw + 28), -(hw + 62), '#1a232b')
  strip(-0.05, 0.07, -(hw + 62), -(hw + 104), '#2a3640')
  strip(-0.05, 0.07, -(hw + 66), -(hw + 100), '#34434f')
  for (let i = 0; i < 12; i++) {
    const u = -0.047 + i * 0.01
    strip(u, u + 0.0075, -(hw + 28), -(hw + 40), CAR_INFO[i % 6].color, 4)
    strip(u, u + 0.0075, -(hw + 64), -(hw + 72), 'rgba(255,255,255,0.25)', 4)
  }
  // gradas (exterior)
  strip(-0.065, 0.09, hw + 70, hw + 190, '#121a22')
  for (let r = 0; r < 7; r++) {
    const l0 = hw + 78 + r * 15
    strip(-0.063, 0.088, l0, l0 + 9, r & 1 ? '#1d2832' : '#18222b', 60)
    const steps = 150
    for (let i = 0; i < steps; i++) {
      if (R() < 0.18) continue
      at(-0.062 + (0.148 * i) / steps, l0 + 4.5, o)
      g.fillStyle = CROWD[Math.floor(R() * 6)]
      g.globalAlpha = 0.55 + R() * 0.4
      g.beginPath()
      g.arc(o.x, o.y, 2.4, 0, 7)
      g.fill()
      g.globalAlpha = 1
    }
  }
  strip(-0.065, 0.09, hw + 188, hw + 204, '#05090c')

  // Letreros publicitarios neón en la valla exterior de la recta.
  g.globalCompositeOperation = 'lighter'
  const names = ['TOPCODE', 'RAYO', 'TURBO', 'NITRO', 'BOLT']
  for (let i = 0; i < 9; i++) {
    const u = -0.05 + i * 0.0165
    strip(u, u + 0.012, hw + 46, hw + 58, rgba(CAR_INFO[i % 6].color, 0.5), 4)
  }
  g.globalCompositeOperation = 'source-over'
  void names

  // Oscurecer los bordes del mundo.
  const vg = g.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = vg
  g.fillRect(0, 0, WORLD_W, WORLD_H)
  return c
}

// ---------- sprites ----------
function glowSprite(size, stops) {
  const c = canvasOf(size, size)
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, col] of stops) gr.addColorStop(o, col)
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  return c
}

const K = 5 // píxeles del sprite por unidad de mundo
// Un F1 visto desde arriba, mirando hacia +x (las ruedas las pinta la escena para poder girarlas): alerón delantero de tres
// planos, morro largo, suspensiones, pontones con su toma de aire, halo y casco, toma del motor con aleta de tiburón,
// suelo, y alerón trasero con DRS y luz de lluvia. Unidades del mundo: el coche mide unos 63 de largo y 29 de ancho.
function carSprite(info, num) {
  const w = 70 * K
  const h = 40 * K
  const c = canvasOf(w, h)
  const g = c.getContext('2d')
  g.translate(w / 2, h / 2)
  g.scale(K, K)
  const col = info.color
  const acc = info.accent
  const dark = shade(col, -0.45)
  const mid = shade(col, -0.08)
  const light = shade(col, 0.5)
  const carbon = '#111419'
  const carbon2 = '#1d232b'
  const across = (y0, y1, stops) => {
    const gr = g.createLinearGradient(0, y0, 0, y1)
    stops.forEach(([o, cc]) => gr.addColorStop(o, cc))
    return gr
  }
  const shapeOf = (pts) => {
    const p = new Path2D()
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
    p.closePath()
    return p
  }
  // Una pieza simétrica respecto al eje: se dan los puntos del lado de arriba (y <= 0), de delante hacia atrás.
  const mirrored = (top) => {
    const p = new Path2D()
    top.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
    for (let i = top.length - 1; i >= 0; i--) p.lineTo(top[i][0], -top[i][1])
    p.closePath()
    return p
  }

  // suelo (fondo plano) con su borde, que asoma por los lados de los pontones
  g.fillStyle = '#07090c'
  g.fill(mirrored([[13, -4.5], [8, -10.4], [-13, -10.6], [-22, -7.5], [-24, -4]]))
  g.strokeStyle = 'rgba(255,255,255,0.12)'
  g.lineWidth = 0.35
  g.stroke(mirrored([[13, -4.5], [8, -10.4], [-13, -10.6], [-22, -7.5], [-24, -4]]))

  // suspensiones: brazos finos de la carrocería a los bujes
  g.strokeStyle = '#2a313a'
  g.lineWidth = 0.9
  for (const s of [-1, 1]) {
    for (const [x0, x1, y0, xh, yh] of [[22, 15, 2.2, 19, 9], [-12, -16, 3, -19, 9.5]]) {
      g.beginPath()
      g.moveTo(x0, s * y0)
      g.lineTo(xh, s * yh)
      g.lineTo(x1, s * y0)
      g.stroke()
    }
  }

  // alerón trasero: endplates del color del coche, plano principal y el DRS
  g.fillStyle = carbon
  g.fillRect(-31.2, -9, 6.4, 18)
  g.fillStyle = across(-9, 9, [[0, carbon2], [0.5, '#3a434e'], [1, carbon2]])
  g.fillRect(-30.6, -8.4, 2.6, 16.8)
  g.fillStyle = across(-9, 9, [[0, '#0c0f13'], [0.5, '#2b333d'], [1, '#0c0f13']])
  g.fillRect(-27.6, -8.4, 2.2, 16.8)
  g.fillStyle = acc
  g.globalAlpha = 0.8
  g.fillRect(-28.1, -8.4, 0.5, 16.8)
  g.globalAlpha = 1
  g.fillStyle = col
  rr(g, -31.6, -9.8, 7.4, 1.8, 0.6)
  g.fill()
  rr(g, -31.6, 8, 7.4, 1.8, 0.6)
  g.fill()
  // pilar del alerón y luz de lluvia
  g.fillStyle = carbon
  g.fillRect(-26, -0.8, 3, 1.6)

  // pontones: forma de botella de coca-cola, con la toma de aire delante
  for (const s of [-1, 1]) {
    const pod = shapeOf([[7, s * 3.5], [7.5, s * 9], [5, s * 9.8], [-6, s * 9.6], [-14, s * 7.6], [-21, s * 4.2], [-21, s * 3]])
    g.fillStyle = across(s * 3, s * 10, [[0, light], [0.45, col], [1, dark]])
    g.fill(pod)
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 0.4
    g.stroke(pod)
    // toma de aire
    g.fillStyle = '#04060a'
    rr(g, 5.2, s < 0 ? -9.2 : 4.4, 2.4, 4.8, 1)
    g.fill()
    // la franja de la decoración, a lo largo del pontón
    g.strokeStyle = acc
    g.lineWidth = 0.9
    g.globalAlpha = 0.85
    g.beginPath()
    g.moveTo(4, s * 8.2)
    g.bezierCurveTo(-4, s * 8.6, -10, s * 7.6, -19, s * 4.4)
    g.stroke()
    g.globalAlpha = 1
    // salidas de aire calientes
    g.fillStyle = 'rgba(0,0,0,0.45)'
    for (let k = 0; k < 4; k++) g.fillRect(-9 - k * 2, s * (5.4 - k * 0.25) - 0.3, 1.1, 0.6)
  }

  // carrocería central: morro largo y estrecho, monocasco y cubierta del motor que se estrecha hacia atrás
  const body = mirrored([[31.2, -0.9], [28, -1.3], [20, -2.2], [13, -3.4], [6, -4.3], [-2, -4.6], [-10, -4], [-18, -2.8], [-24.5, -1.8]])
  g.fillStyle = across(-5, 5, [[0, dark], [0.22, mid], [0.5, light], [0.78, mid], [1, dark]])
  g.fill(body)
  // morro de otro color (la punta) y la franja central
  g.save()
  g.clip(body)
  g.fillStyle = acc
  g.fillRect(24, -3, 8, 6)
  g.fillStyle = col
  g.globalAlpha = 0.9
  g.fillRect(-25, -0.55, 49, 1.1)
  g.globalAlpha = 1
  // brillo del barniz
  const sh = g.createLinearGradient(-24, -4, 30, 2)
  sh.addColorStop(0, 'rgba(255,255,255,0)')
  sh.addColorStop(0.4, 'rgba(255,255,255,0.32)')
  sh.addColorStop(0.65, 'rgba(255,255,255,0.05)')
  sh.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = sh
  g.fillRect(-26, -5, 58, 10)
  g.restore()
  g.strokeStyle = 'rgba(255,255,255,0.45)'
  g.lineWidth = 0.35
  g.stroke(body)

  // toma de aire del motor (encima del piloto) y aleta de tiburón
  g.fillStyle = '#05070a'
  g.beginPath()
  g.ellipse(-6.4, 0, 1.6, 2.1, 0, 0, TAU)
  g.fill()
  g.fillStyle = shade(col, -0.25)
  g.fillRect(-23, -0.35, 15, 0.7)
  // dorsal en la cubierta del motor
  g.fillStyle = '#fdfdf8'
  g.font = '800 5px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.save()
  g.translate(-14, 0)
  g.rotate(Math.PI / 2)
  g.fillText(String(num), 0, 0.3)
  g.restore()

  // cabina: hueco negro, casco del piloto con visera y el halo
  g.fillStyle = '#05070a'
  g.beginPath()
  g.ellipse(0.5, 0, 5, 3.3, 0, 0, TAU)
  g.fill()
  const helmet = g.createRadialGradient(-0.6, -0.8, 0.3, 0, 0, 2.8)
  helmet.addColorStop(0, '#ffffff')
  helmet.addColorStop(0.35, acc)
  helmet.addColorStop(1, shade(acc, -0.4))
  g.fillStyle = helmet
  g.beginPath()
  g.arc(-0.2, 0, 2.5, 0, TAU)
  g.fill()
  g.fillStyle = '#0b1722'
  g.beginPath()
  g.ellipse(1.5, 0, 0.9, 1.9, 0, 0, TAU)
  g.fill()
  g.fillStyle = 'rgba(150,225,255,0.6)'
  g.beginPath()
  g.ellipse(1.8, -0.7, 0.35, 0.7, 0, 0, TAU)
  g.fill()
  // halo: el aro de titanio alrededor de la cabeza y su pilar central
  g.strokeStyle = '#2b3139'
  g.lineWidth = 1.1
  g.beginPath()
  g.ellipse(-0.2, 0, 4.4, 3.4, 0, -2.3, 2.3)
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 0.35
  g.beginPath()
  g.ellipse(-0.2, 0, 4.4, 3.4, 0, -2.0, -0.6)
  g.stroke()
  g.fillStyle = '#2b3139'
  g.fillRect(3.8, -0.5, 3.4, 1)
  // retrovisores
  for (const s of [-1, 1]) {
    g.strokeStyle = carbon
    g.lineWidth = 0.5
    g.beginPath()
    g.moveTo(4.5, s * 4)
    g.lineTo(4.5, s * 6.4)
    g.stroke()
    g.fillStyle = col
    rr(g, 3.4, s < 0 ? -7.6 : 5.8, 2.2, 1.8, 0.6)
    g.fill()
  }

  // dorsal pequeño en el morro
  g.fillStyle = '#10161c'
  g.font = '800 2.6px system-ui, sans-serif'
  g.save()
  g.translate(22, 0)
  g.rotate(Math.PI / 2)
  g.fillText(String(num), 0, 0.2)
  g.restore()

  // alerón delantero: tres planos curvos de lado a lado, endplates y el pilón que lo une al morro
  g.fillStyle = carbon
  g.fillRect(27, -0.8, 3, 1.6)
  for (let k = 0; k < 3; k++) {
    const x = 26 + k * 1.9
    const flap = new Path2D()
    flap.moveTo(x + 1.4, -14)
    flap.quadraticCurveTo(x + 4.2 - k * 0.6, 0, x + 1.4, 14)
    flap.lineTo(x, 14)
    flap.quadraticCurveTo(x + 2.8 - k * 0.6, 0, x, -14)
    flap.closePath()
    g.fillStyle = k === 0 ? col : k === 1 ? '#202731' : shade(col, -0.2)
    g.fill(flap)
  }
  g.strokeStyle = acc
  g.globalAlpha = 0.7
  g.lineWidth = 0.4
  g.beginPath()
  g.moveTo(27.4, -13.6)
  g.quadraticCurveTo(30.2, 0, 27.4, 13.6)
  g.stroke()
  g.globalAlpha = 1
  g.fillStyle = col
  rr(g, 25.2, -14.8, 7, 1.8, 0.6)
  g.fill()
  rr(g, 25.2, 13, 7, 1.8, 0.6)
  g.fill()
  return c
}

function coneSprite() {
  const c = canvasOf(256, 128)
  const g = c.getContext('2d')
  for (const [spread, a] of [[1, 0.16], [0.66, 0.2], [0.34, 0.26]]) {
    const gr = g.createLinearGradient(0, 0, 256, 0)
    gr.addColorStop(0, `rgba(255,248,215,${a * 2.2})`)
    gr.addColorStop(1, 'rgba(255,248,215,0)')
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(0, 64 - 4)
    g.lineTo(256, 64 - 62 * spread)
    g.lineTo(256, 64 + 62 * spread)
    g.lineTo(0, 64 + 4)
    g.closePath()
    g.fill()
  }
  return c
}

function flameSprite() {
  const c = canvasOf(96, 32)
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 96, 0)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.2, 'rgba(160,210,255,0.95)')
  gr.addColorStop(0.5, 'rgba(255,150,40,0.7)')
  gr.addColorStop(1, 'rgba(255,60,0,0)')
  g.fillStyle = gr
  g.beginPath()
  g.moveTo(0, 12)
  g.quadraticCurveTo(40, 2, 96, 16)
  g.quadraticCurveTo(40, 30, 0, 20)
  g.closePath()
  g.fill()
  return c
}

function nitroSprite() {
  const c = canvasOf(160, 40)
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 160, 0)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.12, 'rgba(190,235,255,0.98)')
  gr.addColorStop(0.4, 'rgba(70,160,255,0.75)')
  gr.addColorStop(1, 'rgba(30,70,255,0)')
  g.fillStyle = gr
  g.beginPath()
  g.moveTo(0, 14)
  g.quadraticCurveTo(60, 0, 160, 20)
  g.quadraticCurveTo(60, 40, 0, 26)
  g.closePath()
  g.fill()
  // el núcleo
  const g2 = g.createLinearGradient(0, 0, 90, 0)
  g2.addColorStop(0, 'rgba(255,255,255,1)')
  g2.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = g2
  g.beginPath()
  g.moveTo(0, 17)
  g.quadraticCurveTo(40, 12, 90, 20)
  g.quadraticCurveTo(40, 28, 0, 23)
  g.closePath()
  g.fill()
  return c
}

function nitroTrailSprite() {
  const c = canvasOf(256, 32)
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 256, 0)
  gr.addColorStop(0, 'rgba(160,215,255,0.55)')
  gr.addColorStop(1, 'rgba(60,120,255,0)')
  g.fillStyle = gr
  g.beginPath()
  g.moveTo(0, 10)
  g.lineTo(256, 15)
  g.lineTo(256, 17)
  g.lineTo(0, 22)
  g.closePath()
  g.fill()
  return c
}

// Charcos y reflejos de asfalto mojado (se pinta una vez en la capa estática).
export function drawWet(g) {
  const R = rng(11)
  const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
  g.save()
  for (let i = 0; i < 60; i++) {
    at(R(), (R() - 0.5) * (TRACK_W - 40), o)
    const rx = 26 + R() * 70
    const ry = 8 + R() * 18
    const ang = Math.atan2(o.ty, o.tx) + (R() - 0.5) * 0.4
    g.save()
    g.translate(o.x, o.y)
    g.rotate(ang)
    const gr = g.createRadialGradient(0, 0, 1, 0, 0, rx)
    gr.addColorStop(0, 'rgba(8,16,30,0.38)')
    gr.addColorStop(0.7, 'rgba(10,22,38,0.2)')
    gr.addColorStop(1, 'rgba(10,22,38,0)')
    g.fillStyle = gr
    g.scale(1, ry / rx)
    g.beginPath()
    g.arc(0, 0, rx, 0, 7)
    g.fill()
    g.restore()
    // reflejo de neón en el charco
    g.save()
    g.globalCompositeOperation = 'lighter'
    g.translate(o.x, o.y)
    g.rotate(ang)
    g.fillStyle = ['rgba(60,200,255,0.06)', 'rgba(255,70,150,0.05)', 'rgba(255,200,110,0.06)'][i % 3]
    g.beginPath()
    g.ellipse(rx * 0.15, 0, rx * 0.5, ry * 0.35, 0, 0, 7)
    g.fill()
    g.restore()
  }
  g.restore()
}

function asphaltTile() {
  const c = canvasOf(160, 160)
  const g = c.getContext('2d')
  const R = rng(3)
  for (let i = 0; i < 2600; i++) {
    const v = R() < 0.5 ? 255 : 0
    g.fillStyle = `rgba(${v},${v},${v},${0.04 + R() * 0.08})`
    g.fillRect(R() * 160, R() * 160, 1 + R() * 1.5, 1 + R() * 1.5)
  }
  return c
}

function shadowSprite() {
  const c = canvasOf(180, 100)
  const g = c.getContext('2d')
  g.translate(90, 50)
  g.scale(1.9, 1)
  const gr = g.createRadialGradient(0, 0, 4, 0, 0, 48)
  gr.addColorStop(0, 'rgba(0,0,0,0.65)')
  gr.addColorStop(0.6, 'rgba(0,0,0,0.35)')
  gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr
  g.beginPath()
  g.arc(0, 0, 48, 0, 7)
  g.fill()
  return c
}

export function makeSprites() {
  return {
    cars: CAR_INFO.map((info, i) => carSprite(info, i + 1)),
    shadow: shadowSprite(),
    cone: coneSprite(),
    flame: flameSprite(),
    nitro: nitroSprite(),
    nitroTrail: nitroTrailSprite(),
    asphalt: asphaltTile(),
    smoke: glowSprite(64, [[0, 'rgba(225,230,238,0.9)'], [0.5, 'rgba(200,208,220,0.4)'], [1, 'rgba(190,200,215,0)']]),
    lamp: glowSprite(128, [[0, 'rgba(210,235,255,0.55)'], [0.35, 'rgba(120,180,255,0.2)'], [1, 'rgba(60,120,255,0)']]),
    warm: glowSprite(64, [[0, 'rgba(255,240,200,1)'], [0.3, 'rgba(255,200,110,0.5)'], [1, 'rgba(255,160,60,0)']]),
    red: glowSprite(64, [[0, 'rgba(255,90,70,1)'], [0.3, 'rgba(255,40,30,0.55)'], [1, 'rgba(255,0,0,0)']]),
    green: glowSprite(64, [[0, 'rgba(150,255,170,1)'], [0.3, 'rgba(60,230,110,0.55)'], [1, 'rgba(0,200,60,0)']]),
    car: CAR_INFO.map((info) => glowSprite(96, [[0, rgba(info.color, 0.55)], [0.5, rgba(info.color, 0.18)], [1, rgba(info.color, 0)]])),
  }
}
export const SPRITE_K = K

// ---------- partículas ----------
export const P_SMOKE = 0
export const P_SPARK = 1
export const P_CONFETTI = 2
export const P_FIRE = 3
export const P_FLAME = 4
export const P_STREAK = 5
export const P_FLASH = 6
export const P_NITRO = 7

export class Pool {
  constructor(n, palette) {
    this.n = n
    this.palette = palette
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.age = new Float32Array(n)
    this.max = new Float32Array(n)
    this.size = new Float32Array(n)
    this.rot = new Float32Array(n)
    this.vr = new Float32Array(n)
    this.kind = new Uint8Array(n)
    this.col = new Uint8Array(n)
    this.head = 0
    this.sprite = null
    this.sprite2 = null
    this.age.fill(9)
    this.max.fill(1)
  }

  spawn(kind, x, y, vx, vy, life, size, col = 0, rot = 0, vr = 0) {
    const i = this.head
    this.head = (i + 1) % this.n
    this.kind[i] = kind
    this.x[i] = x
    this.y[i] = y
    this.vx[i] = vx
    this.vy[i] = vy
    this.age[i] = 0
    this.max[i] = life
    this.size[i] = size
    this.col[i] = col
    this.rot[i] = rot
    this.vr[i] = vr
  }

  clear() {
    this.age.fill(9)
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.max[i]) continue
      this.age[i] += dt
      const k = this.kind[i]
      const drag = k === P_SMOKE ? 0.9 : k === P_CONFETTI ? 0.985 : k === P_FIRE ? 0.975 : 0.98
      this.vx[i] *= drag
      this.vy[i] *= drag
      if (k === P_CONFETTI) this.vy[i] += 120 * dt
      else if (k === P_FIRE) this.vy[i] += 90 * dt
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt
      this.rot[i] += this.vr[i] * dt
    }
  }

  // Dibuja un tipo de partículas con el contexto ya transformado.
  draw(g, kind) {
    const { n, age, max, kind: kd } = this
    if (kind === P_SMOKE) {
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = 0.3 * (1 - a) * (1 - a)
        const r = this.size[i] * (1.6 + a * 3.2)
        g.drawImage(this.sprite, this.x[i] - r, this.y[i] - r, r * 2, r * 2)
      }
    } else if (kind === P_SPARK) {
      g.lineCap = 'round'
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = 1 - a
        g.strokeStyle = a < 0.4 ? '#fff4c2' : '#ffa23a'
        g.lineWidth = this.size[i]
        g.beginPath()
        g.moveTo(this.x[i], this.y[i])
        g.lineTo(this.x[i] - this.vx[i] * 0.035, this.y[i] - this.vy[i] * 0.035)
        g.stroke()
      }
    } else if (kind === P_CONFETTI) {
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = a > 0.8 ? (1 - a) * 5 : 1
        g.fillStyle = this.palette[this.col[i]]
        g.save()
        g.translate(this.x[i], this.y[i])
        g.rotate(this.rot[i])
        g.scale(1, Math.sin(age[i] * 9 + i))
        g.fillRect(-this.size[i], -this.size[i] * 0.5, this.size[i] * 2, this.size[i])
        g.restore()
      }
    } else if (kind === P_FIRE) {
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = (1 - a) * (1 - a)
        g.fillStyle = this.palette[this.col[i]]
        g.beginPath()
        g.arc(this.x[i], this.y[i], this.size[i] * (1 - a * 0.5), 0, 7)
        g.fill()
      }
    } else if (kind === P_FLAME) {
      g.fillStyle = '#ff9a3c'
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = (1 - a) * 0.8
        g.beginPath()
        g.arc(this.x[i], this.y[i], this.size[i] * (1 - a * 0.6), 0, 7)
        g.fill()
      }
    } else if (kind === P_FLASH) {
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = a < 0.25 ? a * 4 : 1 - (a - 0.25) / 0.75
        const r = this.size[i] * (0.6 + a * 0.5)
        g.drawImage(this.sprite2, this.x[i] - r, this.y[i] - r, r * 2, r * 2)
      }
    } else if (kind === P_NITRO) {
      g.fillStyle = '#8fd8ff'
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = (1 - a) * 0.85
        g.beginPath()
        g.arc(this.x[i], this.y[i], this.size[i] * (1 - a * 0.7), 0, 7)
        g.fill()
      }
    } else if (kind === P_STREAK) {
      g.lineCap = 'round'
      g.strokeStyle = '#dff3ff'
      g.lineWidth = 1.5
      for (let i = 0; i < n; i++) {
        if (kd[i] !== kind || age[i] >= max[i]) continue
        const a = age[i] / max[i]
        g.globalAlpha = Math.sin(a * Math.PI) * 0.35
        g.beginPath()
        g.moveTo(this.x[i], this.y[i])
        g.lineTo(this.x[i] - this.vx[i] * this.size[i], this.y[i] - this.vy[i] * this.size[i])
        g.stroke()
      }
    }
    g.globalAlpha = 1
  }
}
