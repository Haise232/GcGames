// La mesa de la Ruleta en 3D (three.js): la rueda y el paño en una sola escena, como en un casino. Se carga aparte
// (import dinámico desde Roulette.jsx); si no hay WebGL, la pantalla usa la mesa HTML y la rueda SVG de siempre.
//
// - La rueda: cuenco de madera con su pista, rombos de latón, rotor con las 37 casillas y torreta cromada. Gira con el
//   reloj del servidor (todos la ven igual); tras el «no va más» la bola corre, baja por los rombos, rebota y se queda.
// - El paño impreso: los números, columnas, docenas y apuestas sencillas, y debajo la pista de vecinos con sus sectores.
//   Se apuesta tocándolo (onPick recibe las casillas); las fichas son de verdad, apiladas por valor.
// - La cámara mira el paño mientras se apuesta, la rueda mientras gira, el número en primer plano al caer y vuelve al
//   paño con el marcador sobre el número ganador; las fichas perdedoras se retiran y las ganadoras brillan.
// - En vertical (móvil) el paño se ve de arriba a abajo, con los textos girados para que se lean.
//
// frame: { t, spin: { number, launch, land } | null, rest, lucky, totals: { id: € }, chip, disabled, erasing, focus, mode }
// Nada de lo que se ve decide nada: el número lo da el servidor y los tiempos salen de su reloj.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { CHIPS, SECTORS, SEGMENT, STRAIGHT_PAYS, WHEEL, colorOf, multiplier, neighbours, wins } from './roulette.js'
import { CELLS, TRACK_ORDER } from './layout.js'

const TAU = Math.PI * 2
const SEG = (SEGMENT * Math.PI) / 180
const WHEEL_TURN_MS = 9000 // la rueda nunca se para: una vuelta cada 9 s (igual que la SVG)
const BALL_REVS = 5
const BALL_R = 0.3
const POCKET_R = 7.6
const TRACK_R = 11.7
const CLOSEUP_MS = 1500 // primer plano del número en la rueda antes de volver al paño (la ronda deja ~2 s tras caer)
const COLORS = { red: '#c0262d', black: '#16171c', green: '#13804a' }
const NAMES = { red: 'Rojo', black: 'Negro', green: 'Verde' }
const FELT = '#0d4a36'
const FELT_Y = -0.7
const WHEEL_POS = new Vector3(-4, 0, -3)

// El paño (unidades del mundo): 14 columnas y 5 filas como la mesa HTML; debajo, la pista.
const U = 4.2
const ROW_H = [5, 5, 5, 4, 4]
const X0 = 19
const Z0 = -14
const LW = 14 * U
const LD = ROW_H.reduce((a, b) => a + b, 0)
const TX0 = X0 + 2
const TZ0 = Z0 + LD + 2.6
const TW = LW - 4
const TD = 11.5
const TPAD = 1.6
// Zona del paño impreso (con un margen) y su resolución.
const RX0 = X0 - 1
const RZ0 = Z0 - 1
const RW = LW + 2
const RD = TZ0 + TD + 1 - RZ0
const PX = 32

const CHIP_COLORS = {
  5: { base: '#ece5d2', stripe: '#a3232b', text: '#2a1a0a' },
  25: { base: '#1f8a5a', stripe: '#f4efe2', text: '#ffffff' },
  100: { base: '#1c1d22', stripe: '#f4efe2', text: '#ffffff' },
  500: { base: '#6a3fb5', stripe: '#f6d36b', text: '#ffffff' },
}
const DENOMS = [...CHIPS].sort((a, b) => b - a)
const CHIP_R = 1.45
const CHIP_H = 0.3
const MAX_STACK = 14
const MAX_CHIPS = 420

const clamp01 = (k) => Math.min(1, Math.max(0, k))
const mix = (a, b, k) => a + (b - a) * k
const smooth = (a, b, x) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const eur = (n) => `${n.toLocaleString('es-ES')} €`
// Punto a `a` radianes en el sentido de las agujas (visto desde arriba, 0 = al fondo) y radio r, respecto a la rueda.
const polar = (a, r, y = 0, out = new Vector3()) => out.set(Math.sin(a) * r, y, -Math.cos(a) * r)

// ---------- geometría del paño ----------
function cellRect(cell) {
  const z = Z0 + ROW_H.slice(0, cell.r - 1).reduce((a, b) => a + b, 0)
  const d = ROW_H.slice(cell.r - 1, cell.r - 1 + (cell.rs ?? 1)).reduce((a, b) => a + b, 0)
  return { x: X0 + (cell.c - 1) * U, z, w: (cell.cs ?? 1) * U, d }
}
const RECTS = new Map(CELLS.map((cell) => [cell.id, cellRect(cell)]))
const center = (r) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 })

// La pista: un estadio con los 37 números en el orden de la rueda y, dentro, los sectores.
const TR = TD / 2 - TPAD
function trackPoint(k) {
  const straight = TW - 2 * TPAD - 2 * TR
  const perimeter = 2 * straight + 2 * Math.PI * TR
  let s = (k / WHEEL.length) * perimeter
  const left = TX0 + TPAD + TR
  const right = TX0 + TW - TPAD - TR
  const cz = TZ0 + TD / 2
  if (s < straight) return { x: left + s, z: TZ0 + TPAD }
  s -= straight
  if (s < Math.PI * TR) {
    const a = s / TR
    return { x: right + TR * Math.sin(a), z: cz - TR * Math.cos(a) }
  }
  s -= Math.PI * TR
  if (s < straight) return { x: right - s, z: TZ0 + TD - TPAD }
  s -= straight
  const a = s / TR
  return { x: left - TR * Math.sin(a), z: cz + TR * Math.cos(a) }
}
const TRACK_POS = new Map(TRACK_ORDER.map((n, k) => [n, trackPoint(k)]))
const TRACK_DOT = 1.25
// Sectores dentro de la pista, de izquierda a derecha como en las mesas (el cero queda en la curva de la izquierda).
const SECTOR_ZONES = (() => {
  const x0 = TX0 + TPAD + TR * 0.55
  const x1 = TX0 + TW - TPAD - TR * 0.55
  const z0 = TZ0 + TPAD + TRACK_DOT + 0.35
  const z1 = TZ0 + TD - TPAD - TRACK_DOT - 0.35
  const order = [
    ['zero', 0.16, 'Juego cero'],
    ['voisins', 0.32, 'Vecinos del cero'],
    ['orphelins', 0.22, 'Huérfanos'],
    ['tiers', 0.3, 'Tercio'],
  ]
  let x = x0
  return order.map(([id, share, label]) => {
    const w = (x1 - x0) * share
    const zone = { id, label, x, z: z0, w, d: z1 - z0, numbers: SECTORS.find((s) => s.id === id).numbers }
    x += w
    return zone
  })
})()

// Qué hay bajo un punto del paño.
function pickAt(x, z) {
  for (const cell of CELLS) {
    const r = RECTS.get(cell.id)
    if (x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) return { kind: 'cell', id: cell.id, cell }
  }
  for (const [n, p] of TRACK_POS) if (Math.hypot(p.x - x, p.z - z) < TRACK_DOT + 0.2) return { kind: 'track', n }
  for (const zone of SECTOR_ZONES) if (x >= zone.x && x < zone.x + zone.w && z >= zone.z && z < zone.z + zone.d) return { kind: 'sector', zone }
  return null
}

// ---------- texturas ----------
function feltNoise(g, w, h) {
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (Math.random() - 0.5) * 16
    img.data[i] += k
    img.data[i + 1] += k
    img.data[i + 2] += k
  }
  g.putImageData(img, 0, 0)
}
function feltTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = FELT
  g.fillRect(0, 0, 256, 256)
  feltNoise(g, 256, 256)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  return tex
}

// El paño impreso. portrait: los textos girados un cuarto de vuelta (en vertical la cámara lo mira de lado).
function layoutTexture(portrait) {
  const W = Math.round(RW * PX)
  const H = Math.round(RD * PX)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const px = (x) => (x - RX0) * PX
  const pz = (z) => (z - RZ0) * PX
  g.fillStyle = FELT
  g.fillRect(0, 0, W, H)
  feltNoise(g, W, H)
  const gold = '#d9b45a'
  const text = (str, x, z, size, color = '#f6efdf', font = 'Georgia, serif') => {
    g.save()
    g.translate(px(x), pz(z))
    if (portrait) g.rotate(-Math.PI / 2)
    g.fillStyle = color
    g.font = `700 ${Math.round(size * PX)}px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(str, 0, 0)
    g.restore()
  }
  for (const cell of CELLS) {
    const r = RECTS.get(cell.id)
    const m = 0.14
    if (cell.tone) {
      g.fillStyle = COLORS[cell.tone]
      if (cell.n === 0) {
        g.beginPath()
        g.moveTo(px(r.x + 1.6), pz(r.z + m))
        g.lineTo(px(r.x + r.w - m), pz(r.z + m))
        g.lineTo(px(r.x + r.w - m), pz(r.z + r.d - m))
        g.lineTo(px(r.x + 1.6), pz(r.z + r.d - m))
        g.lineTo(px(r.x + m), pz(r.z + r.d / 2))
        g.closePath()
        g.fill()
      } else g.fillRect(px(r.x + m), pz(r.z + m), (r.w - 2 * m) * PX, (r.d - 2 * m) * PX)
    }
    g.strokeStyle = gold
    g.lineWidth = 0.09 * PX
    g.strokeRect(px(r.x), pz(r.z), r.w * PX, r.d * PX)
    const { x, z } = center(r)
    if (cell.diamond) {
      const s = Math.min(r.w, r.d) * 0.34 * PX
      g.save()
      g.translate(px(x), pz(z))
      if (portrait) g.rotate(-Math.PI / 2)
      g.fillStyle = COLORS[cell.diamond]
      g.strokeStyle = gold
      g.lineWidth = 0.08 * PX
      g.beginPath()
      g.moveTo(0, -s * 0.8)
      g.lineTo(s * 1.25, 0)
      g.lineTo(0, s * 0.8)
      g.lineTo(-s * 1.25, 0)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    } else if (cell.n !== undefined) text(String(cell.n), x, z, cell.n === 0 ? 2.6 : 2.2)
    else {
      const col = cell.id.startsWith('col:')
      const label = cell.id.startsWith('dozen:') ? `${cell.id.slice(6)}ª ${portrait ? '12' : 'docena'}` : col ? '2:1' : cell.label
      text(label, x, z, col ? 1.4 : 1.35, '#f6efdf', 'system-ui, sans-serif')
    }
  }
  // La pista y sus sectores.
  const left = TX0 + TPAD + TR
  const right = TX0 + TW - TPAD - TR
  const cz = TZ0 + TD / 2
  g.strokeStyle = gold
  g.lineWidth = 0.09 * PX
  for (const grow of [TRACK_DOT + 0.25, -(TRACK_DOT + 0.25)]) {
    const rr = TR + grow
    g.beginPath()
    g.moveTo(px(left), pz(cz - rr))
    g.lineTo(px(right), pz(cz - rr))
    g.arc(px(right), pz(cz), rr * PX, -Math.PI / 2, Math.PI / 2)
    g.lineTo(px(left), pz(cz + rr))
    g.arc(px(left), pz(cz), rr * PX, Math.PI / 2, (3 * Math.PI) / 2)
    g.closePath()
    g.stroke()
  }
  for (const [n, p] of TRACK_POS) {
    g.fillStyle = COLORS[colorOf(n)]
    g.beginPath()
    g.arc(px(p.x), pz(p.z), TRACK_DOT * PX, 0, TAU)
    g.fill()
    g.strokeStyle = gold
    g.lineWidth = 0.06 * PX
    g.stroke()
    text(String(n), p.x, p.z, 1.15)
  }
  SECTOR_ZONES.forEach((zone, i) => {
    if (i) {
      g.strokeStyle = gold
      g.lineWidth = 0.07 * PX
      g.beginPath()
      g.moveTo(px(zone.x), pz(zone.z))
      g.lineTo(px(zone.x), pz(zone.z + zone.d))
      g.stroke()
    }
    // Palabra a palabra, una debajo de otra (en vertical, «debajo» es hacia +x en el paño).
    const words = zone.label.split(' ')
    words.forEach((word, k) => {
      const off = (k - (words.length - 1) / 2) * 1.25
      text(word, zone.x + zone.w / 2 + (portrait ? off : 0), zone.z + zone.d / 2 + (portrait ? 0 : off), 1.05, '#e9cf86', 'system-ui, sans-serif')
    })
  })
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function pocketTexture() {
  const W = 4096
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const w = W / WHEEL.length
  WHEEL.forEach((n, i) => {
    const x = i * w
    g.fillStyle = COLORS[colorOf(n)]
    g.fillRect(x, 0, w + 1, H)
    g.fillStyle = 'rgba(0,0,0,0.38)'
    g.fillRect(x, H * 0.55, w + 1, H * 0.45)
    g.fillStyle = '#d9b45a'
    g.fillRect(x - 2, 0, 4, H * 0.5)
    g.fillStyle = '#f6efdf'
    g.font = `700 ${Math.round(w * 0.56)}px Georgia, 'Times New Roman', serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), x + w / 2, H * 0.25 + 4)
  })
  g.fillStyle = '#d9b45a'
  g.fillRect(0, H * 0.5 - 3, W, 6)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function chipTextures(value) {
  const { base, stripe, text } = CHIP_COLORS[value]
  const side = document.createElement('canvas')
  side.width = 256
  side.height = 16
  let g = side.getContext('2d')
  g.fillStyle = base
  g.fillRect(0, 0, 256, 16)
  g.fillStyle = stripe
  for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 8, 0, 12, 16)
  const top = document.createElement('canvas')
  top.width = top.height = 128
  g = top.getContext('2d')
  g.fillStyle = base
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = stripe
  g.lineWidth = 10
  g.setLineDash([14, 12])
  g.beginPath()
  g.arc(64, 64, 56, 0, TAU)
  g.stroke()
  g.setLineDash([])
  g.lineWidth = 2
  g.beginPath()
  g.arc(64, 64, 40, 0, TAU)
  g.stroke()
  g.fillStyle = text
  g.font = `800 ${value >= 100 ? 34 : 40}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(value), 64, 66)
  const toTex = (cv) => {
    const t = new CanvasTexture(cv)
    t.colorSpace = SRGBColorSpace
    return t
  }
  return { side: toTex(side), top: toTex(top) }
}

function labelTexture(str, { color = '#ffd34a', bg = 'rgba(20, 14, 2, 0.85)', border = '#ffd34a' } = {}) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = bg
  g.beginPath()
  g.roundRect(10, 14, 236, 68, 34)
  g.fill()
  if (border) {
    g.strokeStyle = border
    g.lineWidth = 5
    g.stroke()
  }
  g.fillStyle = color
  g.font = '800 46px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(str, 128, 50)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

// ---------- la rueda ----------
const BOWL = [
  [9.45, -0.12],
  [10.2, 0.12],
  [11.0, 0.36],
  [11.55, 0.5],
  [11.85, 0.62],
  [12.0, 0.95],
  [12.05, 1.4],
  [12.25, 1.55],
  [13.3, 1.5],
  [13.65, 1.15],
  [13.7, -0.7],
]
function surfaceY(r) {
  if (r < 8.3) return -0.12
  if (r < 9.45) return mix(0.12, -0.12, (r - 8.3) / 1.15)
  for (let i = 1; i < BOWL.length; i++) {
    if (r <= BOWL[i][0]) return mix(BOWL[i - 1][1], BOWL[i][1], (r - BOWL[i - 1][0]) / (BOWL[i][0] - BOWL[i - 1][0]))
  }
  return 1.5
}
// Recorrido de la bola según el avance del giro p (0 lanzada, 1 en su casilla): radio y salto.
function ballPath(p) {
  if (p < 0.6) return { r: TRACK_R, hop: 0 }
  if (p < 0.8) {
    const k = smooth(0.6, 0.8, p)
    const hop = Math.max(0, Math.sin(clamp01((p - 0.68) / 0.05) * Math.PI)) * 0.55
    return { r: mix(TRACK_R, 8.9, k), hop }
  }
  if (p < 0.93) {
    const k = (p - 0.8) / 0.13
    const r = mix(8.6, POCKET_R, k) + Math.sin(k * Math.PI * 3) * 0.35 * (1 - k)
    const hop = Math.abs(Math.sin(k * Math.PI * 4)) * 0.6 * (1 - k) ** 1.4
    return { r, hop }
  }
  return { r: POCKET_R, hop: 0 }
}
function ringGeometry(r0, r1, y0, y1, v0, v1, segs = 37 * 6) {
  const pos = []
  const uv = []
  const index = []
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * TAU - SEG / 2
    for (let k = 0; k <= 1; k++) {
      const r = k ? r1 : r0
      pos.push(Math.sin(a) * r, k ? y1 : y0, -Math.cos(a) * r)
      uv.push(j / segs, k ? v1 : v0)
    }
  }
  for (let j = 0; j < segs; j++) {
    const a = j * 2
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

function buildWheel(keep, { wood, trackMat, gold, chrome }) {
  const wheel = new Group()
  const lathe = (pts, mat) => {
    const m = new Mesh(keep(new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), 128)), mat)
    m.receiveShadow = true
    wheel.add(m)
  }
  lathe(BOWL.slice(0, 7), trackMat)
  lathe(BOWL.slice(6), wood)
  for (const [r, y, tube] of [[12.2, 1.52, 0.09], [13.62, 1.22, 0.07]]) {
    const m = new Mesh(keep(new TorusGeometry(r, tube, 8, 160).rotateX(Math.PI / 2)), gold)
    m.position.y = y
    wheel.add(m)
  }
  const diamondGeo = keep(new OctahedronGeometry(1, 0))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + SEG * 2
    const d = new Mesh(diamondGeo, gold)
    polar(a, 10.6, 0.36, d.position)
    d.scale.set(0.22, 0.16, 0.55)
    d.rotation.y = -a
    d.castShadow = true
    wheel.add(d)
  }
  const rotor = new Group()
  wheel.add(rotor)
  const pocketMat = keep(new MeshStandardMaterial({ map: keep(pocketTexture()), roughness: 0.4, metalness: 0.05, side: DoubleSide }))
  const pockets = new Mesh(keep(ringGeometry(6.9, 8.3, -0.14, -0.12, 0.02, 0.44)), pocketMat)
  const numbers = new Mesh(keep(ringGeometry(8.3, 9.45, 0.14, -0.12, 0.52, 0.98)), pocketMat)
  pockets.receiveShadow = true
  numbers.receiveShadow = true
  rotor.add(pockets, numbers)
  const fretGeo = keep(new BoxGeometry(0.07, 0.42, 1.45))
  for (let i = 0; i < WHEEL.length; i++) {
    const a = (i + 0.5) * SEG
    const f = new Mesh(fretGeo, gold)
    polar(a, 7.6, 0.07, f.position)
    f.rotation.y = -a
    f.castShadow = true
    rotor.add(f)
  }
  for (const [r, y, tube] of [[6.9, 0.05, 0.08], [8.3, 0.13, 0.06], [5.8, 0.36, 0.05], [3.6, 0.9, 0.05]]) {
    const m = new Mesh(keep(new TorusGeometry(r, tube, 8, 160).rotateX(Math.PI / 2)), gold)
    m.position.y = y
    rotor.add(m)
  }
  const cone = new Mesh(
    keep(new LatheGeometry([[6.9, -0.05], [6.2, 0.2], [4.6, 0.65], [2.8, 1.05], [1.3, 1.3], [0.9, 1.34]].map(([r, y]) => new Vector2(r, y)), 96)),
    wood,
  )
  cone.receiveShadow = true
  rotor.add(cone)
  const add = (geo, y) => {
    const m = new Mesh(keep(geo), chrome)
    m.position.y = y
    m.castShadow = true
    rotor.add(m)
    return m
  }
  add(new CylinderGeometry(1.0, 1.15, 0.4, 48), 1.5)
  add(new CylinderGeometry(0.28, 0.4, 1.9, 32), 2.6)
  add(new SphereGeometry(0.45, 32, 16), 3.65)
  add(new SphereGeometry(0.22, 16, 8), 4.15)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU
    const arm = add(new CylinderGeometry(0.11, 0.11, 3.6, 16), 2.15)
    arm.rotation.z = Math.PI / 2
    arm.rotation.y = a
    const tip = add(new SphereGeometry(0.28, 20, 12), 2.15)
    polar(a + Math.PI / 2, 1.8, 2.15, tip.position)
  }
  return { wheel, rotor }
}

export function createTable3D(host, { reduced = false, onFail, onPick, onRemove } = {}) {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const prCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const renderer = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance' })
  renderer.setPixelRatio(prCap)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  const canvas = renderer.domElement
  canvas.className = 'rt3d__gl'
  const onLost = (event) => {
    event.preventDefault()
    onFail?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  const root = document.createElement('div')
  root.className = 'rt3d'
  root.innerHTML = `
    <div class="rt3d__vig"></div>
    <div class="rt3d__flash"></div>
    <div class="rt3d__lucky"></div>
    <div class="rt3d__result"><b></b><span></span></div>
    <div class="rt3d__tip"></div>`
  root.prepend(canvas)
  host.appendChild(root)
  const el = {
    lucky: root.querySelector('.rt3d__lucky'),
    result: root.querySelector('.rt3d__result'),
    resultN: root.querySelector('.rt3d__result b'),
    resultName: root.querySelector('.rt3d__result span'),
    flash: root.querySelector('.rt3d__flash'),
    tip: root.querySelector('.rt3d__tip'),
  }

  const scene = new Scene()
  scene.background = new Color('#050807')
  const pmrem = new PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.4
  const camera = new PerspectiveCamera(34, 1.6, 0.5, 600)
  const disposables = [envTex, pmrem]
  const keep = (x) => {
    disposables.push(x)
    return x
  }

  // Luces: una principal cálida con sombras para toda la mesa, dos focos (rueda y paño) y relleno.
  const key = new DirectionalLight('#fff1d6', 1.5)
  key.position.set(26, 70, 34)
  key.target.position.set(28, 0, 4)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 40, bottom: -40, near: 10, far: 160 })
  key.shadow.bias = -0.0005
  key.shadow.radius = 3
  scene.add(key, key.target)
  const spotWheel = new SpotLight('#ffe7c2', 700, 90, 0.5, 0.6, 2)
  spotWheel.position.set(WHEEL_POS.x + 2, 38, WHEEL_POS.z + 8)
  spotWheel.target.position.copy(WHEEL_POS)
  const spotLayout = new SpotLight('#ffe7c2', 900, 110, 0.62, 0.7, 2)
  spotLayout.position.set(X0 + LW / 2, 48, 10)
  spotLayout.target.position.set(X0 + LW / 2, 0, 3)
  scene.add(spotWheel, spotWheel.target, spotLayout, spotLayout.target)
  scene.add(new HemisphereLight('#c9d6ff', '#1a120a', 0.3))
  const hitLight = new PointLight('#ffd34a', 0, 14, 2)
  scene.add(hitLight)

  // La mesa: tapete, baranda acolchada y canto de madera.
  const feltTex = keep(feltTexture())
  feltTex.repeat.set(10, 5)
  const felt = new Mesh(keep(new PlaneGeometry(140, 72).rotateX(-Math.PI / 2)), keep(new MeshStandardMaterial({ map: feltTex, roughness: 0.95 })))
  felt.position.set(30, FELT_Y, 6)
  felt.receiveShadow = true
  scene.add(felt)
  const wood = keep(new MeshPhysicalMaterial({ color: '#4a2412', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.18 }))
  const leather = keep(new MeshPhysicalMaterial({ color: '#2a140b', roughness: 0.55, sheen: 0.6, sheenColor: new Color('#7a4a2a'), clearcoat: 0.3 }))
  {
    const pts = []
    const [x0, x1, z0, z1, rr] = [-24, 84, -21, 33, 11]
    const corners = [
      [x1 - rr, z0 + rr, -Math.PI / 2],
      [x1 - rr, z1 - rr, 0],
      [x0 + rr, z1 - rr, Math.PI / 2],
      [x0 + rr, z0 + rr, Math.PI],
    ]
    for (const [cx, cz, a0] of corners) {
      for (let i = 0; i <= 10; i++) {
        const a = a0 + (i / 10) * (Math.PI / 2)
        pts.push(new Vector3(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr))
      }
    }
    const curve = new CatmullRomCurve3(pts, true, 'centripetal')
    const rail = new Mesh(keep(new TubeGeometry(curve, 240, 2.1, 20, true)), leather)
    rail.position.y = FELT_Y + 0.9
    rail.scale.y = 0.7
    rail.castShadow = true
    rail.receiveShadow = true
    scene.add(rail)
  }

  // El paño impreso (se rehace al pasar de horizontal a vertical).
  const layoutMat = keep(new MeshStandardMaterial({ roughness: 0.92 }))
  const layout = new Mesh(keep(new PlaneGeometry(RW, RD).rotateX(-Math.PI / 2)), layoutMat)
  layout.position.set(RX0 + RW / 2, FELT_Y + 0.01, RZ0 + RD / 2)
  layout.receiveShadow = true
  scene.add(layout)
  let portrait = null
  let layoutTex = null
  let first = true
  function setPortrait(next) {
    if (next === portrait) return
    portrait = next
    layoutTex?.dispose()
    layoutTex = layoutTexture(portrait)
    layoutMat.map = layoutTex
    layoutMat.needsUpdate = true
    first = true // la cámara salta al nuevo encuadre en vez de girar despacio
  }

  // La rueda.
  const gold = keep(new MeshStandardMaterial({ color: '#d4ab52', metalness: 1, roughness: 0.25 }))
  const trackMat = keep(new MeshPhysicalMaterial({ color: '#8a5a33', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }))
  const chrome = keep(new MeshStandardMaterial({ color: '#e8ecf2', metalness: 1, roughness: 0.08 }))
  const { wheel, rotor } = buildWheel(keep, { wood, trackMat, gold, chrome })
  wheel.position.copy(WHEEL_POS)
  scene.add(wheel)
  const ball = new Mesh(keep(new SphereGeometry(BALL_R, 32, 16)), keep(new MeshPhysicalMaterial({ color: '#fbfbf6', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })))
  ball.castShadow = true
  wheel.add(ball)
  const hitPocket = new Mesh(
    keep(new RingGeometry(6.95, 9.4, 6, 1, -SEG / 2, SEG).rotateX(-Math.PI / 2)),
    keep(new MeshBasicMaterial({ color: new Color(1.3, 1.0, 0.35), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })),
  )
  hitPocket.position.y = 0.2
  rotor.add(hitPocket)

  // Relámpagos: en la rueda un haz de luz con su etiqueta (y rayos al lanzar); en el paño la casilla brilla.
  const beamMat = keep(
    new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uOpacity; varying float vY;
        void main(){ float k = clamp(vY / 7.0, 0.0, 1.0); float a = (1.0 - k) * (1.0 - k) * smoothstep(0.0, 1.2, vY) * (0.75 + 0.25 * sin(uTime * 9.0 + vY * 3.0));
          gl_FragColor = vec4(vec3(1.5, 1.2, 0.45), a * uOpacity * 0.7); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    }),
  )
  const beamGeo = keep(new CylinderGeometry(0.18, 0.45, 7, 24, 1, true))
  beamGeo.translate(0, 3.5, 0)
  const luckyWheel = new Group()
  rotor.add(luckyWheel)
  const luckyLayout = new Group()
  scene.add(luckyLayout)
  const boltMat = keep(new MeshBasicMaterial({ color: new Color(2.2, 2, 1.1), transparent: true, blending: AdditiveBlending, depthWrite: false }))
  const flatGeo = keep(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
  let luckyKey = ''
  let luckySprites = []
  let luckyGlows = []
  let bolts = []

  function setLucky(lucky) {
    const next = Object.entries(lucky ?? {})
      .map(([n, x]) => `${n}:${x}`)
      .join(',')
    if (next === luckyKey) return
    luckyKey = next
    for (const s of luckySprites) {
      s.material.map.dispose()
      s.material.dispose()
    }
    for (const m of luckyGlows) m.material.dispose()
    luckySprites = []
    luckyGlows = []
    luckyWheel.clear()
    luckyLayout.clear()
    el.lucky.textContent = ''
    for (const [n, x] of Object.entries(lucky ?? {})) {
      const a = WHEEL.indexOf(Number(n)) * SEG
      const beam = new Mesh(beamGeo, beamMat)
      polar(a, 7.8, 0, beam.position)
      luckyWheel.add(beam)
      const label = new Sprite(new SpriteMaterial({ map: labelTexture(`⚡ ×${x}`), transparent: true, depthTest: false }))
      polar(a, 7.8, 5.2, label.position)
      label.scale.set(3.6, 1.35, 1)
      label.renderOrder = 5
      luckyWheel.add(label)
      luckySprites.push(label)
      const r = RECTS.get(`n:${n}`)
      const c = center(r)
      const glow = new Mesh(flatGeo, new MeshBasicMaterial({ color: new Color(1.4, 1.05, 0.3), transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }))
      glow.scale.set(r.w - 0.3, 1, r.d - 0.3)
      glow.position.set(c.x, FELT_Y + 0.03, c.z)
      luckyLayout.add(glow)
      luckyGlows.push(glow)
      const tag = new Sprite(new SpriteMaterial({ map: labelTexture(`⚡ ×${x}`), transparent: true, depthTest: false }))
      tag.position.set(c.x, FELT_Y + 3.4, c.z - r.d * 0.3)
      tag.scale.set(4.2, 1.58, 1)
      tag.renderOrder = 6
      luckyLayout.add(tag)
      luckySprites.push(tag)
      const chip = document.createElement('span')
      chip.className = `rt3d__chip rt3d__chip--${colorOf(Number(n))}`
      chip.innerHTML = `<b>${n}</b>×${x}`
      el.lucky.appendChild(chip)
    }
  }
  function clearBolts() {
    for (const b of bolts) {
      wheel.remove(b)
      b.geometry.dispose()
    }
    bolts = []
  }
  function makeBolts(lucky, disc) {
    clearBolts()
    for (const n of Object.keys(lucky ?? {})) {
      const a = WHEEL.indexOf(Number(n)) * SEG + disc
      const end = polar(a, 7.8, 0.2)
      const start = end.clone().add(new Vector3((Math.random() - 0.5) * 6, 16, (Math.random() - 0.5) * 6))
      const pts = []
      for (let i = 0; i <= 9; i++) {
        const p = start.clone().lerp(end, i / 9)
        if (i > 0 && i < 9) p.add(new Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6))
        pts.push(p)
      }
      const bolt = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 40, 0.045, 5), boltMat)
      wheel.add(bolt)
      bolts.push(bolt)
    }
  }

  // Fichas: una malla instanciada por valor (canto con rayas, cara con el valor).
  const chipGeo = keep(new CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 40, 1))
  const chipMeshes = {}
  for (const value of CHIPS) {
    const tex = chipTextures(value)
    keep(tex.side)
    keep(tex.top)
    tex.side.wrapS = RepeatWrapping
    const side = keep(new MeshStandardMaterial({ map: tex.side, roughness: 0.45, metalness: 0.05 }))
    const face = keep(new MeshStandardMaterial({ map: tex.top, roughness: 0.4, metalness: 0.05 }))
    const mesh = new InstancedMesh(chipGeo, [side, face, face], MAX_CHIPS)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.count = 0
    mesh.frustumCulled = false
    scene.add(mesh)
    chipMeshes[value] = mesh
  }
  const stacks = new Map() // id → { chips: [valor], born: [s], amount, label, x, z }
  let totalsKey = ''
  const winRingGeo = keep(new RingGeometry(CHIP_R + 0.15, CHIP_R + 0.55, 40).rotateX(-Math.PI / 2))
  const winRingMat = keep(new MeshBasicMaterial({ color: new Color(1.6, 1.25, 0.4), transparent: true, blending: AdditiveBlending, depthWrite: false }))
  const winRings = []

  // Las fichas de una cantidad, de la más alta a la más baja (la de abajo es la mayor).
  function breakdown(amount) {
    const out = []
    let left = amount
    for (const d of DENOMS) {
      while (left >= d && out.length < MAX_STACK) {
        out.push(d)
        left -= d
      }
    }
    return out
  }
  function setTotals(totals) {
    const next = JSON.stringify(totals)
    if (next === totalsKey) return
    totalsKey = next
    for (const [id, stack] of stacks) {
      if (!totals[id]) {
        stack.label.material.map?.dispose()
        stack.label.material.dispose()
        scene.remove(stack.label)
        stacks.delete(id)
      }
    }
    for (const [id, amount] of Object.entries(totals)) {
      const r = RECTS.get(id)
      if (!r) continue
      const chips = breakdown(amount)
      let stack = stacks.get(id)
      if (!stack) {
        const c = center(r)
        const label = new Sprite(new SpriteMaterial({ transparent: true, depthTest: false }))
        label.scale.set(4.4, 1.65, 1)
        label.renderOrder = 4
        scene.add(label)
        stack = { chips: [], born: [], amount: 0, label, x: c.x, z: c.z }
        stacks.set(id, stack)
      }
      stack.born = chips.map((v, i) => (stack.chips[i] === v ? stack.born[i] : elapsed + i * 0.03))
      stack.chips = chips
      if (stack.amount !== amount) {
        stack.amount = amount
        stack.label.material.map?.dispose()
        stack.label.material.map = labelTexture(eur(amount), { color: '#1b1405', bg: 'rgba(233, 207, 134, 0.95)', border: null })
        stack.label.material.needsUpdate = true
      }
    }
  }

  // Marcador del número ganador (como el que pone el crupier).
  const dolly = new Group()
  {
    const base = new Mesh(keep(new CylinderGeometry(0.85, 0.95, 0.35, 32)), gold)
    base.position.y = 0.17
    const glass = new Mesh(keep(new SphereGeometry(0.75, 32, 16)), keep(new MeshPhysicalMaterial({ color: '#e9f3ff', roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1 })))
    glass.position.y = 1.0
    const cap = new Mesh(keep(new SphereGeometry(0.25, 16, 8)), gold)
    cap.position.y = 1.85
    for (const m of [base, glass, cap]) {
      m.castShadow = true
      dolly.add(m)
    }
  }
  dolly.visible = false
  scene.add(dolly)
  const cellHit = new Mesh(flatGeo, keep(new MeshBasicMaterial({ color: new Color(1.5, 1.25, 0.55), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })))
  cellHit.visible = false
  scene.add(cellHit)

  // Resaltado bajo el puntero (o con el foco del teclado).
  const hoverMat = keep(new MeshBasicMaterial({ color: new Color(1, 1, 1), transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }))
  const dotGeo = keep(new RingGeometry(0.2, TRACK_DOT + 0.18, 32).rotateX(-Math.PI / 2))
  const hovers = Array.from({ length: 40 }, () => {
    const m = new Mesh(flatGeo, hoverMat)
    m.visible = false
    scene.add(m)
    return m
  })
  function showHover(target, erasing) {
    hovers.forEach((m) => (m.visible = false))
    if (!target) return
    hoverMat.color.set(erasing ? '#ff6b5e' : '#ffffff')
    const shapes = []
    if (target.kind === 'cell') shapes.push(RECTS.get(target.id))
    else if (target.kind === 'sector') {
      shapes.push(target.zone)
      for (const n of target.zone.numbers) shapes.push(RECTS.get(`n:${n}`), { dot: TRACK_POS.get(n) })
    } else for (const n of neighbours(target.n)) shapes.push(RECTS.get(`n:${n}`), { dot: TRACK_POS.get(n) })
    shapes.slice(0, hovers.length).forEach((s, i) => {
      const m = hovers[i]
      m.visible = true
      if (s.dot) {
        m.geometry = dotGeo
        m.scale.set(1, 1, 1)
        m.position.set(s.dot.x, FELT_Y + 0.04, s.dot.z)
      } else {
        m.geometry = flatGeo
        m.scale.set(s.w - 0.2, 1, s.d - 0.2)
        m.position.set(s.x + s.w / 2, FELT_Y + 0.04, s.z + s.d / 2)
      }
    })
  }

  // ---------- puntero ----------
  const ndc = new Vector2()
  const ray = new Vector3()
  let pointerXY = null
  let shownTarget = null
  let lastFrame = { disabled: true, erasing: false, chip: 25, totals: {}, mode: 'betting' }
  function targetAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    ray.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize()
    if (Math.abs(ray.y) < 1e-4) return null
    const k = (FELT_Y - camera.position.y) / ray.y
    if (k < 0) return null
    return pickAt(camera.position.x + ray.x * k, camera.position.z + ray.z * k)
  }
  const idsOf = (target) =>
    target.kind === 'cell' ? [target.id] : target.kind === 'track' ? neighbours(target.n).map((v) => `n:${v}`) : target.zone.numbers.map((n) => `n:${n}`)
  function tipText(target) {
    const { chip, totals } = lastFrame
    if (target.kind === 'cell') {
      const cell = target.cell
      const name = cell.n !== undefined ? `Pleno al ${cell.n}` : cell.name ?? (cell.diamond ? NAMES[cell.diamond] : cell.id.startsWith('dozen:') ? `${cell.id.slice(6)}ª docena` : cell.label)
      const pays = cell.n !== undefined ? STRAIGHT_PAYS : multiplier(cell.id)
      const on = totals[cell.id] ? ` · llevas ${eur(totals[cell.id])}` : ''
      return `${name} · paga ${pays} a 1${on}`
    }
    if (target.kind === 'track') return `${target.n} y sus vecinos · 5 fichas = ${eur(chip * 5)}`
    return `${target.zone.label} · ${target.zone.numbers.length} fichas = ${eur(chip * target.zone.numbers.length)}`
  }
  const canBet = () => !lastFrame.disabled && lastFrame.mode === 'betting'
  const onMove = (event) => {
    pointerXY = event.pointerType === 'mouse' ? [event.clientX, event.clientY] : null
  }
  const onLeave = () => {
    pointerXY = null
  }
  const onClick = (event) => {
    if (!canBet()) return
    const target = targetAt(event.clientX, event.clientY)
    if (!target) return
    if (lastFrame.erasing) {
      if (target.kind === 'cell') onRemove?.(target.id)
      return
    }
    onPick?.(idsOf(target))
  }
  const onContext = (event) => {
    event.preventDefault()
    if (!canBet()) return
    const target = targetAt(event.clientX, event.clientY)
    if (target?.kind === 'cell') onRemove?.(target.id)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('contextmenu', onContext)

  // ---------- postproceso ----------
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(prCap)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.45, 0.45, 0.98)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  function resize() {
    const rect = host.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    setPortrait(w / h < 0.9)
  }
  resize()

  // ---------- cámara ----------
  // Encaja un rectángulo del suelo (centro cx, cz; medio ancho hw en x y medio fondo hd en z), inclinada `elev`.
  // En vertical se mira de lado (con «arriba» hacia -x), así el paño largo cabe de arriba a abajo.
  function frameView(out, look, up, cx, cz, hw, hd, elev, margin = 1.06) {
    const tv = Math.tan(((camera.fov / 2) * Math.PI) / 180)
    const th = tv * camera.aspect
    const se = Math.sin(elev)
    const ce = Math.cos(elev)
    look.set(cx, FELT_Y, cz)
    if (!portrait) {
      const dist = Math.max(hw / th, (hd * se) / tv) * margin + hd * ce
      out.set(cx, FELT_Y + dist * se, cz + dist * ce)
      up.set(0, 1, 0)
    } else {
      const dist = Math.max(hd / th, (hw * se) / tv) * margin + hw * ce
      out.set(cx + dist * ce, FELT_Y + dist * se, cz)
      up.set(-1, 0, 0)
    }
  }

  // ---------- animación ----------
  let lastReal = performance.now()
  let elapsed = 0
  let lastSpinKey = null
  let boltUntil = 0
  let boltNext = 0
  let shownResult = null
  let dollyAt = null
  const camPos = new Vector3()
  const camLook = new Vector3()
  const camUp = new Vector3(0, 1, 0)
  const wantPos = new Vector3()
  const wantLook = new Vector3()
  const wantUp = new Vector3()
  const ballLocal = new Vector3()
  const ballWorld = new Vector3()
  const tmp = new Vector3()
  const axisY = new Vector3(0, 1, 0)
  const mat = new Matrix4()
  const quat = new Quaternion()
  const scl = new Vector3()
  const posV = new Vector3()

  function draw(fr) {
    const { t, spin, rest, lucky, totals, mode } = fr
    lastFrame = fr
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastReal) / 1000))
    lastReal = now
    elapsed += dt

    // Rueda y bola.
    const disc = reduced ? 0 : ((t % WHEEL_TURN_MS) / WHEEL_TURN_MS) * TAU
    rotor.rotation.y = -disc
    let ballAngle = null
    let p = 1
    let r = POCKET_R
    let hop = 0
    const launched = Boolean(spin) && t >= spin.launch
    if (launched) {
      const pocket = disc + WHEEL.indexOf(spin.number) * SEG
      const u = reduced ? 0 : Math.max(0, (spin.land - t) / Math.max(1, spin.land - spin.launch))
      // Respecto a la rueda la bola va al revés y frena hasta quedarse en su casilla.
      ballAngle = pocket + BALL_REVS * TAU * u * u
      p = 1 - u
      ;({ r, hop } = ballPath(p))
    } else if (rest !== null && rest !== undefined) ballAngle = disc + WHEEL.indexOf(rest) * SEG
    ball.visible = ballAngle !== null
    if (ball.visible) {
      polar(ballAngle, r, surfaceY(r) + BALL_R + hop, ballLocal)
      ball.position.copy(ballLocal)
      ball.rotation.x += dt * (launched && p < 0.93 ? 14 : 0)
    }
    ballWorld.copy(ballLocal).add(WHEEL_POS)
    const landed = launched && t >= spin.land
    const sinceLand = landed ? t - spin.land : 0
    const result = landed ? spin.number : null
    const back = landed && sinceLand > CLOSEUP_MS // ya de vuelta en el paño

    // Relámpagos.
    const shownLucky = launched ? lucky : {}
    setLucky(shownLucky)
    const anyLucky = Object.keys(shownLucky ?? {}).length > 0
    beamMat.uniforms.uTime.value = elapsed
    beamMat.uniforms.uOpacity.value = anyLucky && !landed ? 1 : 0
    for (const g of luckyGlows) g.material.opacity = 0.35 + 0.2 * Math.sin(elapsed * 5)
    for (const l of luckyWheel.children) if (l.isSprite) l.visible = !landed
    const spinKey = spin ? `${spin.launch}` : null
    if (launched && spinKey !== lastSpinKey) {
      lastSpinKey = spinKey
      if (anyLucky && !reduced && t - spin.launch < 1500) {
        boltUntil = elapsed + 1.1
        el.flash.classList.remove('rt3d__flash--on')
        void el.flash.offsetWidth
        el.flash.classList.add('rt3d__flash--on')
      }
    }
    if (!launched) lastSpinKey = null
    if (elapsed < boltUntil) {
      if (elapsed >= boltNext) {
        makeBolts(shownLucky, disc)
        boltNext = elapsed + 0.09
      }
      boltMat.opacity = 0.6 + Math.random() * 0.4
    } else if (bolts.length) clearBolts()

    // Número ganador: su casilla en la rueda, su casilla en el paño y el marcador.
    const pulse = reduced ? 0.7 : 0.55 + 0.3 * Math.sin(elapsed * 4)
    hitPocket.visible = landed
    cellHit.visible = landed
    if (landed) {
      hitPocket.rotation.y = -WHEEL.indexOf(spin.number) * SEG
      hitPocket.material.opacity = pulse * smooth(0, 500, sinceLand)
      hitLight.position.copy(ballWorld).add(tmp.set(0, 1.4, 0))
      hitLight.intensity = 3 * pulse
      const rr = RECTS.get(`n:${spin.number}`)
      const c = center(rr)
      cellHit.scale.set(rr.w - 0.2, 1, rr.d - 0.2)
      cellHit.position.set(c.x, FELT_Y + 0.035, c.z)
      cellHit.material.opacity = pulse * 0.7 * smooth(CLOSEUP_MS - 400, CLOSEUP_MS + 400, sinceLand)
      if (dollyAt === null && sinceLand > CLOSEUP_MS - 200) dollyAt = elapsed - (sinceLand > CLOSEUP_MS + 1000 ? 1 : 0)
      if (dollyAt !== null) {
        const k = clamp01((elapsed - dollyAt) / 0.45)
        dolly.visible = true
        dolly.position.set(c.x + rr.w * 0.27, FELT_Y + (1 - k * k) * 9, c.z - rr.d * 0.27)
      }
    } else {
      hitLight.intensity = 0
      dollyAt = null
      // Como en la mesa de verdad, el marcador se queda en el último número mientras se apuesta la siguiente.
      dolly.visible = rest !== null && rest !== undefined
      if (dolly.visible) {
        const rr = RECTS.get(`n:${rest}`)
        const c = center(rr)
        dolly.position.set(c.x + rr.w * 0.27, FELT_Y, c.z - rr.d * 0.27)
      }
    }
    if (result !== shownResult) {
      shownResult = result
      if (result === null) el.result.classList.remove('rt3d__result--on')
      else {
        const tone = colorOf(result)
        el.result.dataset.tone = tone
        el.resultN.textContent = String(result)
        el.resultName.textContent = NAMES[tone]
        el.result.classList.add('rt3d__result--on')
      }
    }

    // Fichas: caen al ponerlas; con el resultado, las perdedoras se retiran y las ganadoras brillan.
    setTotals(totals ?? {})
    for (const value of CHIPS) chipMeshes[value].count = 0
    let rings = 0
    for (const [id, stack] of stacks) {
      const won = result !== null && wins(id, result)
      const away = result !== null && !won ? smooth(CLOSEUP_MS + 150, CLOSEUP_MS + 700, sinceLand) : 0
      const s = 1 - away
      if (s > 0.001) {
        stack.chips.forEach((value, i) => {
          const mesh = chipMeshes[value]
          if (mesh.count >= MAX_CHIPS) return
          const age = elapsed - stack.born[i]
          const drop = reduced ? 0 : Math.max(0, 1 - age / 0.28) ** 2 * 7
          posV.set(stack.x + Math.sin(i * 2.4) * 0.05, FELT_Y + 0.02 + (CHIP_H / 2 + i * CHIP_H) * s + drop, stack.z + Math.cos(i * 1.7) * 0.05)
          quat.setFromAxisAngle(axisY, i * 0.7)
          mat.compose(posV, quat, scl.set(s, s, s))
          mesh.setMatrixAt(mesh.count++, mat)
        })
      }
      stack.label.visible = s > 0.2 && mode === 'betting'
      stack.label.position.set(stack.x, FELT_Y + stack.chips.length * CHIP_H + 1.9, stack.z)
      if (won && back) {
        let ring = winRings[rings]
        if (!ring) {
          ring = new Mesh(winRingGeo, winRingMat)
          scene.add(ring)
          winRings.push(ring)
        }
        ring.visible = true
        ring.position.set(stack.x, FELT_Y + 0.05, stack.z)
        rings++
      }
    }
    winRingMat.opacity = pulse
    for (let i = rings; i < winRings.length; i++) winRings[i].visible = false
    for (const value of CHIPS) chipMeshes[value].instanceMatrix.needsUpdate = true

    // Puntero (o foco del teclado) sobre el paño.
    const betting = !fr.disabled && mode === 'betting'
    const pointed = betting && pointerXY ? targetAt(pointerXY[0], pointerXY[1]) : null
    const focused = !pointed && betting && fr.focus ? { kind: 'cell', id: fr.focus, cell: CELLS.find((c) => c.id === fr.focus) } : null
    const target = pointed ?? focused
    const same =
      target?.kind === shownTarget?.kind && target?.id === shownTarget?.id && target?.n === shownTarget?.n && target?.zone === shownTarget?.zone && fr.erasing === shownTarget?.erasing
    if (!same) {
      shownTarget = target ? { ...target, erasing: fr.erasing } : null
      showHover(target, fr.erasing)
      canvas.style.cursor = pointed ? 'pointer' : 'default'
      if (pointed) {
        el.tip.textContent = fr.erasing
          ? pointed.kind === 'cell' && fr.totals[pointed.id]
            ? 'Quitar una ficha de aquí'
            : 'Aquí no tienes fichas'
          : tipText(pointed)
        el.tip.classList.add('rt3d__tip--on')
      } else el.tip.classList.remove('rt3d__tip--on')
    }
    if (pointed) {
      const rect = canvas.getBoundingClientRect()
      el.tip.style.transform = `translate(${pointerXY[0] - rect.left}px, ${pointerXY[1] - rect.top}px)`
    }

    // Cámara: el paño para apostar; la rueda mientras gira; primer plano del número (desde fuera, casi desde arriba y
    // con «arriba» hacia fuera para leerlo derecho) y de vuelta al paño con el marcador.
    let followK = back ? 5 : 2.4
    if (mode === 'betting' || back) {
      // En horizontal ancho se ve la mesa entera (rueda incluida); si no, solo el paño. Arriba queda sitio para los rótulos.
      const whole = !portrait && camera.aspect >= 1.45
      const x0 = whole ? WHEEL_POS.x - 14.5 : RX0
      const x1 = RX0 + RW + 0.6
      const z0 = RZ0 - (portrait ? 0.6 : 5)
      const xTop = portrait ? 12 : 0 // en vertical, sitio arriba (hacia -x) para el crupier
      const z1 = RZ0 + RD + 0.6
      if (portrait) frameView(wantPos, wantLook, wantUp, (x0 - xTop + x1) / 2, (z0 + z1) / 2, (x1 - x0 + xTop) / 2, (z1 - z0) / 2, 1.25)
      else frameView(wantPos, wantLook, wantUp, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 1.12)
    } else {
      frameView(wantPos, wantLook, wantUp, WHEEL_POS.x, WHEEL_POS.z, 14.5, 14.5, 1.0)
      if (landed) {
        const k = smooth(0, 1100, sinceLand)
        polar(ballAngle, POCKET_R + 3.2, 9.5, tmp).add(WHEEL_POS)
        wantPos.lerp(tmp, k)
        wantLook.lerp(ballWorld, k)
        polar(ballAngle, 1, 0, tmp)
        wantUp.lerp(tmp, k).normalize()
        followK = 2.6 + 9 * k
      } else if (launched) wantLook.lerp(ballWorld, smooth(0.5, 0.95, p) * 0.3)
    }
    if (first) {
      camPos.copy(wantPos)
      camLook.copy(wantLook)
      camUp.copy(wantUp)
      first = false
    }
    const follow = 1 - Math.exp(-dt * followK)
    camPos.lerp(wantPos, follow)
    camLook.lerp(wantLook, follow)
    camUp.lerp(wantUp, 1 - Math.exp(-dt * Math.max(8, followK))).normalize() // el giro, antes que el viaje
    camera.position.copy(camPos)
    camera.up.copy(camUp)
    camera.lookAt(camLook)

    composer.render(dt)
    return { landed }
  }

  function destroy() {
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('click', onClick)
    canvas.removeEventListener('contextmenu', onContext)
    clearBolts()
    layoutTex?.dispose()
    for (const s of luckySprites) s.material.map?.dispose()
    for (const stack of stacks.values()) stack.label.material.map?.dispose()
    scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m?.dispose?.()
    })
    disposables.forEach((x) => x.dispose?.())
    composer.dispose?.()
    bloom.dispose?.()
    renderer.dispose()
    root.remove()
  }

  return { draw, resize, destroy }
}
