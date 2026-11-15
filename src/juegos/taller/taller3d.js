// El Taller de Papá Noel en 3D (three.js): el taller del Polo Norte en corte, como una casa de muñecas, de noche en la
// nieve. Se carga aparte (import dinámico desde Taller.jsx); sin WebGL, la pantalla usa la vista HTML de siempre.
//
// - Un sótano con el cabrestante del montacargas, una sala por planta (cada una con su papel pintado, su maquinaria y su
//   letrero según lo que fabrica), el almacén del ático y una terraza con la casita del trineo, la chimenea y los renos.
// - Salas paradas: en penumbra, con los elfos dormidos (💤); salas que trabajan: iluminadas, elfos martilleando, juguetes
//   que salen del banco, ruedan por la cinta y caen al montón junto al hueco del montacargas.
// - A la derecha, el hueco del montacargas: una jaula que sube cajas al almacén. En la terraza, el trineo con dos renos:
//   cuando reparte, despega, da una vuelta con estela mágica y vuelve soltando galletas.
// - Todo se toca: una sala la pone a trabajar (onTap('p', i)), el hueco al montacargas ('e') y el trineo ('s').
// - draw(frame) devuelve dónde cae cada parte en la pantalla, para alinear con ellas las fichas HTML.
//
// Solo dibuja: las cuentas las hace el servidor (taller.js). frame: { plantas: [nivel], boss: { p: [], e, s },
// working: { p: [], e, s }, neck: 'p'|'e'|'s', pile, store, flash }
//
// Rendimiento: lo estático de cada sala se funde en UNA malla con colores por vértice (una llamada de dibujo por sala),
// los elfos comparten geometría, los juguetes y las bombillas son instancias, las sombras son discos falsos.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Euler,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PLANTAS } from './taller.js'

const TAU = Math.PI * 2
const H = 3.6 // alto de una planta
const W = 10 // ancho de las salas
const D = 5.4 // fondo de las salas
const X0 = -W / 2
const SHAFT_X0 = 5.3
const SHAFT_W = 2.5
const SHAFT_CX = SHAFT_X0 + SHAFT_W / 2
const BASE = 1.7 // alto del sótano (bajo la planta 0)
const BULBS = ['#ff3b4a', '#ffd34a', '#3ddc84', '#4aa8ff', '#ff8ad8']
const PRESENTS = ['#d6303c', '#2f9e5a', '#2f6fd6', '#e8b83a', '#9b4fd1', '#f1f1f1']
const WOOD = '#7a4a28'
const WOODD = '#4a2a16'
const WOODL = '#b07a44'
const STEEL = '#aab4c2'
const STEELD = '#5c6675'
const GOLD = '#e8b93e'
const SKIN = '#f2c6a0'
const SNOW = '#f2f7ff'
// Papel pintado de cada planta: fondo, color de la raya y color de la luz.
const THEMES = [
  ['#8a2230', '#a52c3b', '#ffd9a8'],
  ['#6b4526', '#7d5430', '#ffe0b0'],
  ['#7a3a78', '#92488f', '#ffd1e8'],
  ['#2f6b52', '#3a7f62', '#e0ffd0'],
  ['#2f4a80', '#3a5a96', '#d6e6ff'],
  ['#7d5a22', '#92692a', '#ffe6a0'],
  ['#44505e', '#52606f', '#c8f0ff'],
  ['#552270', '#6a2c8c', '#f0c8ff'],
]

const clamp01 = (k) => Math.min(1, Math.max(0, k))
const smooth = (a, b, x) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt))
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}
function canvasTex(w, h, paint, repeat) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(...repeat)
  }
  return t
}

// ---------- texturas ----------
// Papel pintado de una sala: dibujo propio de cada planta y, abajo, el zócalo de madera con su moldura dorada.
function paintWall(g, w, h, i) {
  const [bg, acc] = THEMES[i]
  const zy = h * 0.68
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  g.save()
  g.beginPath()
  g.rect(0, 0, w, zy)
  g.clip()
  const R = rng(i + 7)
  if (i === 0) {
    for (let x = 0; x < w; x += 44) {
      g.fillStyle = acc
      g.fillRect(x, 0, 22, zy)
      g.fillStyle = 'rgba(255,240,210,0.35)'
      g.fillRect(x + 21, 0, 2, zy)
    }
    g.fillStyle = 'rgba(255, 215, 120, 0.5)'
    for (let y = 18; y < zy; y += 46) for (let x = 11; x < w; x += 44) g.fillRect(x, y, 5, 5)
  } else if (i === 1) {
    for (let x = 0; x < w; x += 52) {
      g.fillStyle = `rgba(${R() < 0.5 ? '255,200,140' : '40,20,8'},${0.08 + R() * 0.12})`
      g.fillRect(x, 0, 52, zy)
      g.fillStyle = 'rgba(30,14,4,0.55)'
      g.fillRect(x, 0, 3, zy)
      g.fillStyle = 'rgba(30,14,4,0.35)'
      g.beginPath()
      g.ellipse(x + 10 + R() * 30, R() * zy, 5, 9, 0, 0, TAU)
      g.fill()
    }
  } else if (i === 2) {
    for (let y = 16; y < zy + 20; y += 38) for (let x = 0; x < w + 40; x += 48) {
      g.fillStyle = 'rgba(255,230,245,0.55)'
      g.beginPath()
      g.arc(x + ((y / 38) % 2) * 24, y, 9, 0, TAU)
      g.fill()
      g.fillStyle = acc
      g.beginPath()
      g.arc(x + ((y / 38) % 2) * 24, y, 4, 0, TAU)
      g.fill()
    }
  } else if (i === 3) {
    g.font = '30px sans-serif'
    g.textAlign = 'center'
    for (let y = 26; y < zy + 20; y += 46) for (let x = 0; x < w + 50; x += 60) {
      g.fillStyle = 'rgba(255,255,230,0.5)'
      g.fillText('★', x + ((y / 46) % 2) * 30, y)
    }
    g.fillStyle = acc
    for (let x = 0; x < w; x += 120) g.fillRect(x, 0, 6, zy)
  } else if (i === 4) {
    g.strokeStyle = 'rgba(190,215,255,0.5)'
    g.lineWidth = 3
    for (let y = 0; y < zy + 50; y += 50) for (let x = 0; x < w + 50; x += 50) {
      g.beginPath()
      g.moveTo(x, y - 25)
      g.lineTo(x + 25, y)
      g.lineTo(x, y + 25)
      g.lineTo(x - 25, y)
      g.closePath()
      g.stroke()
    }
  } else if (i === 5) {
    g.strokeStyle = 'rgba(255,225,150,0.45)'
    g.lineWidth = 5
    for (let y = 0; y < zy + 30; y += 30) {
      g.beginPath()
      for (let x = 0; x <= w; x += 30) g.lineTo(x, y + (x / 30 % 2 ? 14 : 0))
      g.stroke()
    }
  } else if (i === 6) {
    g.strokeStyle = 'rgba(20,28,40,0.7)'
    g.lineWidth = 3
    for (let x = 0; x < w; x += 96) g.strokeRect(x + 2, 4, 92, zy - 8)
    g.fillStyle = 'rgba(210,225,240,0.6)'
    for (let x = 0; x < w; x += 96) for (const [dx, dy] of [[10, 12], [82, 12], [10, zy - 16], [82, zy - 16]]) g.fillRect(x + dx, dy, 5, 5)
    g.fillStyle = 'rgba(70,230,255,0.75)'
    for (let x = 0; x < w; x += 96) g.fillRect(x + 20, zy * 0.5, 56, 4)
  } else {
    g.strokeStyle = 'rgba(255,70,220,0.55)'
    g.lineWidth = 2
    for (let x = 0; x < w; x += 48) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, zy)
      g.stroke()
    }
    g.strokeStyle = 'rgba(70,230,255,0.5)'
    for (let y = 0; y < zy; y += 40) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(w, y)
      g.stroke()
    }
  }
  g.restore()
  // Remate de arriba, zócalo y moldura dorada.
  g.fillStyle = 'rgba(0,0,0,0.28)'
  g.fillRect(0, 0, w, 10)
  g.fillStyle = '#5b3a20'
  g.fillRect(0, zy, w, h - zy)
  for (let x = 0; x < w; x += 64) {
    g.fillStyle = 'rgba(0,0,0,0.3)'
    g.fillRect(x, zy + 6, 3, h - zy)
    g.fillStyle = 'rgba(255,210,150,0.12)'
    g.fillRect(x + 3, zy + 6, 4, h - zy)
  }
  g.fillStyle = '#e0b54e'
  g.fillRect(0, zy - 4, w, 6)
  g.fillStyle = '#3a2212'
  g.fillRect(0, zy + 2, w, 5)
}
function paintSign(g, w, h, icon) {
  g.fillStyle = '#e0b54e'
  g.beginPath()
  g.roundRect(4, 4, w - 8, h - 8, 26)
  g.fill()
  g.fillStyle = '#3a2212'
  g.beginPath()
  g.roundRect(14, 14, w - 28, h - 28, 18)
  g.fill()
  const r = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w * 0.55)
  r.addColorStop(0, '#7a4a28')
  r.addColorStop(1, '#4a2a16')
  g.fillStyle = r
  g.beginPath()
  g.roundRect(14, 14, w - 28, h - 28, 18)
  g.fill()
  g.font = `${Math.round(h * 0.56)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(icon, w / 2, h / 2 + h * 0.04)
}
const planks = () =>
  canvasTex(256, 256, (g, w, h) => {
    const R = rng(3)
    for (let i = 0; i < 8; i++) {
      const tone = 100 + Math.floor(R() * 36)
      g.fillStyle = `rgb(${tone + 38}, ${tone - 6}, ${tone - 46})`
      g.fillRect(0, i * 32, w, 32)
      g.fillStyle = 'rgba(0,0,0,0.4)'
      g.fillRect(0, i * 32, w, 2)
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(Math.floor(R() * w), i * 32, 2, 32)
    }
  })
const glowTex = () =>
  canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.35, 'rgba(255,255,255,0.4)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  })
// Ventana: noche nevada con luna, copos y colinas (arco redondeado arriba).
const windowTex = () =>
  canvasTex(128, 192, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#101a48')
    sky.addColorStop(1, '#3a5a9a')
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    const R = rng(5)
    g.fillStyle = '#fff'
    for (let k = 0; k < 28; k++) {
      g.globalAlpha = 0.4 + R() * 0.6
      g.fillRect(R() * w, R() * h * 0.7, 2, 2)
    }
    g.globalAlpha = 1
    g.fillStyle = '#fff6d0'
    g.beginPath()
    g.arc(w * 0.7, h * 0.22, 14, 0, TAU)
    g.fill()
    g.fillStyle = '#c9d8f2'
    g.beginPath()
    g.moveTo(0, h)
    g.lineTo(0, h * 0.78)
    g.quadraticCurveTo(w * 0.35, h * 0.62, w * 0.6, h * 0.8)
    g.quadraticCurveTo(w * 0.85, h * 0.7, w, h * 0.82)
    g.lineTo(w, h)
    g.fill()
    g.fillStyle = '#1d4d34'
    for (const x of [0.2, 0.42, 0.8]) {
      g.beginPath()
      g.moveTo(w * x, h * 0.68)
      g.lineTo(w * x + 11, h * 0.9)
      g.lineTo(w * x - 11, h * 0.9)
      g.fill()
    }
  })
const emojiTexOf = (emoji, ring) =>
  canvasTex(128, 128, (g) => {
    if (ring) {
      g.fillStyle = 'rgba(20, 10, 4, 0.78)'
      g.beginPath()
      g.arc(64, 64, 60, 0, TAU)
      g.fill()
      g.strokeStyle = ring
      g.lineWidth = 6
      g.stroke()
    }
    g.font = '76px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(emoji, 64, 70)
  })
const beltTexture = () =>
  canvasTex(64, 32, (g, w, h) => {
    g.fillStyle = '#2b2d33'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#4a4e58'
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h)
    g.fillStyle = 'rgba(255,255,255,0.12)'
    g.fillRect(0, 0, w, 3)
  })

// ---------- geometría horneada: muchas piezas en una sola malla con colores por vértice ----------
const U = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 10),
  cyl6: new CylinderGeometry(1, 1, 1, 6),
  sph: new SphereGeometry(1, 10, 7),
  cone: new ConeGeometry(1, 1, 10),
  cone4: new ConeGeometry(1, 1, 4),
}
const ringCache = new Map()
const ringGeo = (t) => {
  if (!ringCache.has(t)) ringCache.set(t, new TorusGeometry(1, t, 6, 16))
  return ringCache.get(t)
}
function makeBaker() {
  const parts = []
  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const p = new Vector3()
  const s = new Vector3()
  const c = new Color()
  const up = new Vector3(0, 1, 0)
  const dir = new Vector3()
  let ox = 0
  let oy = 0
  let oz = 0
  let os = 1
  const add = (geo, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const g = geo.clone()
    m.compose(p.set(ox + x * os, oy + y * os, oz + z * os), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx * os, sy * os, sz * os))
    g.applyMatrix4(m)
    c.set(color)
    const n = g.attributes.position.count
    const a = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) {
      a[k * 3] = c.r
      a[k * 3 + 1] = c.g
      a[k * 3 + 2] = c.b
    }
    g.setAttribute('color', new BufferAttribute(a, 3))
    parts.push(g)
  }
  const api = {
    box: (x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0) => add(U.box, color, x, y, z, w, h, d, rx, ry, rz),
    cyl: (x, y, z, r, h, color, rx = 0, ry = 0, rz = 0) => add(U.cyl, color, x, y, z, r, h, r, rx, ry, rz),
    cyl6: (x, y, z, r, h, color, rx = 0, ry = 0, rz = 0) => add(U.cyl6, color, x, y, z, r, h, r, rx, ry, rz),
    sph: (x, y, z, a, b, d, color) => add(U.sph, color, x, y, z, a, b, d),
    cone: (x, y, z, r, h, color, rx = 0, ry = 0, rz = 0) => add(U.cone, color, x, y, z, r, h, r, rx, ry, rz),
    pyr: (x, y, z, r, h, color, ry = Math.PI / 4) => add(U.cone4, color, x, y, z, r, h, r, 0, ry, 0),
    ring: (x, y, z, r, t, color, rx = 0, ry = 0, rz = 0, depth = 1) => add(ringGeo(t), color, x, y, z, r, r, r * depth, rx, ry, rz),
    // Barra entre dos puntos.
    bar: (x1, y1, z1, x2, y2, z2, r, color) => {
      dir.set(x2 - x1, y2 - y1, z2 - z1)
      const len = dir.length()
      q.setFromUnitVectors(up, dir.normalize())
      e.setFromQuaternion(q)
      add(U.cyl6, color, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, r, len, r, e.x, e.y, e.z)
    },
    // Dibuja lo que haga fn desplazado a (x, y, z) y a escala k (para colocar juguetes y peluches donde se quiera).
    at(x, y, z, k, fn) {
      ;[ox, oy, oz, os] = [x, y, z, k]
      fn()
      ;[ox, oy, oz, os] = [0, 0, 0, 1]
    },
    build() {
      const g = mergeGeometries(parts, false)
      parts.forEach((x) => x.dispose())
      parts.length = 0
      return g
    },
  }
  return api
}
// Formas sueltas reutilizables.
function teddy(b, x, y, z, s, col, light = '#e8c89a') {
  b.sph(x, y + 0.42 * s, z, 0.4 * s, 0.44 * s, 0.34 * s, col)
  b.sph(x, y + 0.42 * s, z + 0.1 * s, 0.26 * s, 0.3 * s, 0.26 * s, light)
  b.sph(x, y + 0.98 * s, z + 0.04 * s, 0.3 * s, 0.28 * s, 0.28 * s, col)
  for (const sd of [-1, 1]) {
    b.sph(x + sd * 0.23 * s, y + 1.2 * s, z, 0.11 * s, 0.11 * s, 0.08 * s, col)
    b.sph(x + sd * 0.15 * s, y + 1.04 * s, z + 0.27 * s, 0.035 * s, 0.035 * s, 0.03 * s, '#1a1010')
    b.sph(x + sd * 0.44 * s, y + 0.5 * s, z + 0.08 * s, 0.13 * s, 0.17 * s, 0.13 * s, col)
    b.sph(x + sd * 0.24 * s, y + 0.1 * s, z + 0.18 * s, 0.16 * s, 0.13 * s, 0.2 * s, col)
  }
  b.sph(x, y + 0.9 * s, z + 0.27 * s, 0.13 * s, 0.1 * s, 0.1 * s, light)
  b.sph(x, y + 0.94 * s, z + 0.35 * s, 0.045 * s, 0.035 * s, 0.03 * s, '#1a1010')
}
function bike(b, x, y, z, s, col) {
  for (const dx of [-0.6, 0.6]) {
    b.ring(x + dx * s, y + 0.38 * s, z, 0.38 * s, 0.07, '#22252b', 0, 0, 0, 1.2)
    b.ring(x + dx * s, y + 0.38 * s, z, 0.3 * s, 0.025, STEEL)
    b.cyl(x + dx * s, y + 0.38 * s, z, 0.05 * s, 0.1 * s, STEELD, Math.PI / 2)
  }
  b.bar(x - 0.6 * s, y + 0.38 * s, z, x - 0.1 * s, y + 0.8 * s, z, 0.03 * s, col)
  b.bar(x - 0.1 * s, y + 0.8 * s, z, x + 0.45 * s, y + 0.8 * s, z, 0.03 * s, col)
  b.bar(x - 0.6 * s, y + 0.38 * s, z, x, y + 0.38 * s, z, 0.03 * s, col)
  b.bar(x, y + 0.38 * s, z, x - 0.1 * s, y + 0.8 * s, z, 0.03 * s, col)
  b.bar(x, y + 0.38 * s, z, x + 0.45 * s, y + 0.8 * s, z, 0.03 * s, col)
  b.bar(x + 0.45 * s, y + 0.8 * s, z, x + 0.6 * s, y + 0.38 * s, z, 0.03 * s, col)
  b.bar(x + 0.45 * s, y + 0.8 * s, z, x + 0.5 * s, y + 0.98 * s, z, 0.03 * s, STEELD)
  b.box(x + 0.5 * s, y + 1.0 * s, z, 0.04 * s, 0.04 * s, 0.4 * s, STEELD)
  b.box(x - 0.14 * s, y + 0.88 * s, z, 0.32 * s, 0.07 * s, 0.14 * s, '#22252b')
}
function matryoshka(b, x, y, z, s, col) {
  b.sph(x, y + 0.55 * s, z, 0.42 * s, 0.6 * s, 0.42 * s, col)
  b.sph(x, y + 1.12 * s, z, 0.3 * s, 0.32 * s, 0.3 * s, '#f6d9b8')
  b.sph(x, y + 1.2 * s, z - 0.02 * s, 0.33 * s, 0.3 * s, 0.32 * s, col)
  b.sph(x, y + 0.65 * s, z + 0.3 * s, 0.22 * s, 0.26 * s, 0.1 * s, '#f6d9b8')
  b.sph(x, y + 0.65 * s, z + 0.34 * s, 0.12 * s, 0.14 * s, 0.06 * s, GOLD)
  for (const sd of [-1, 1]) b.sph(x + sd * 0.1 * s, y + 1.12 * s, z + 0.27 * s, 0.03 * s, 0.03 * s, 0.03 * s, '#2a1a12')
}
// Juguete de cada planta (para la cinta y los montones): ~0.45 de alto.
const TOYS = [
  (b) => {
    b.box(0, 0.2, 0, 0.4, 0.4, 0.4, '#d6303c')
    b.box(0, 0.2, 0, 0.42, 0.42, 0.08, '#ffd34a')
    b.box(0, 0.2, 0, 0.08, 0.42, 0.42, '#ffd34a')
    b.sph(0, 0.44, 0, 0.1, 0.07, 0.1, '#ffd34a')
  },
  (b) => {
    b.box(0, 0.15, 0, 0.36, 0.3, 0.36, '#c98a4a')
    b.box(0, 0.4, 0, 0.26, 0.2, 0.26, '#2f6fd6')
    b.box(0, 0.15, 0.185, 0.14, 0.14, 0.02, '#fff6d0')
  },
  (b) => {
    b.cone(0, 0.2, 0, 0.22, 0.4, '#f08cb4')
    b.sph(0, 0.47, 0, 0.12, 0.12, 0.12, SKIN)
    b.sph(0, 0.52, -0.02, 0.13, 0.09, 0.13, '#e8b83a')
  },
  (b) => teddy(b, 0, 0, 0, 0.36, '#b07a44'),
  (b) => bike(b, 0, 0, 0, 0.42, '#d6303c'),
  (b) => {
    b.box(0.05, 0.22, 0, 0.5, 0.2, 0.22, '#2f6fd6')
    b.cyl(0.14, 0.34, 0, 0.1, 0.24, '#d6303c', 0, 0, Math.PI / 2)
    b.cyl(0.2, 0.46, 0, 0.04, 0.12, '#22252b')
    b.box(-0.16, 0.38, 0, 0.18, 0.22, 0.22, '#e8b83a')
    for (const dx of [-0.16, 0.04, 0.2]) b.cyl(dx, 0.1, 0, 0.07, 0.24, '#22252b', Math.PI / 2)
  },
  (b) => {
    b.box(0, 0.2, 0, 0.3, 0.3, 0.22, '#aab4c2')
    b.box(0, 0.42, 0, 0.22, 0.18, 0.2, '#c9d2de')
    b.box(0, 0.42, 0.105, 0.14, 0.05, 0.02, '#46e6ff')
    b.cyl(0, 0.56, 0, 0.012, 0.12, STEELD)
    b.sph(0, 0.62, 0, 0.03, 0.03, 0.03, '#ff4a4a')
    for (const sd of [-1, 1]) b.box(sd * 0.2, 0.22, 0, 0.07, 0.24, 0.07, STEELD)
  },
  (b) => {
    b.box(0, 0.12, 0, 0.5, 0.22, 0.3, '#2a2c38')
    b.box(0, 0.14, 0.152, 0.34, 0.12, 0.01, '#46e6ff')
    b.cyl(-0.18, 0.12, 0.16, 0.035, 0.02, '#ff4a8a', Math.PI / 2)
    b.cyl(0.18, 0.12, 0.16, 0.035, 0.02, '#4aff8a', Math.PI / 2)
  },
]

// ---------- elfos: dos mallas por elfo (cuerpo y brazo), geometría compartida por variante ----------
const elfCache = new Map()
function elfGeometry(suit, hat, kind) {
  const key = `${suit}${hat}${kind}`
  if (elfCache.has(key)) return elfCache.get(key)
  const b = makeBaker()
  for (const sd of [-1, 1]) {
    b.cyl(sd * 0.1, 0.1, 0, 0.075, 0.22, '#2a1a12')
    b.box(sd * 0.1, 0.03, 0.06, 0.13, 0.07, 0.24, '#3a2212')
  }
  b.cyl(0, 0.46, 0, 0.3, 0.6, suit)
  b.cyl(0, 0.78, 0, 0.2, 0.1, suit)
  b.cyl(0, 0.38, 0, 0.31, 0.08, '#2a1a12')
  b.box(0, 0.38, 0.3, 0.13, 0.1, 0.03, GOLD)
  b.cyl(0, 0.85, 0, 0.24, 0.08, '#f6f6f2')
  b.sph(0, 1.04, 0, 0.27, 0.26, 0.26, SKIN)
  for (const sd of [-1, 1]) {
    b.cone(sd * 0.3, 1.1, 0, 0.07, 0.24, SKIN, 0, 0, -sd * 1.25)
    b.sph(sd * 0.09, 1.08, 0.24, 0.045, 0.05, 0.03, '#1a1010')
    b.sph(sd * 0.16, 0.99, 0.22, 0.06, 0.04, 0.03, '#f0948a')
    if (kind === 'carry') b.bar(sd * 0.26, 0.7, 0.04, sd * 0.2, 0.6, 0.42, 0.055, suit)
  }
  b.sph(0, 1.01, 0.26, 0.045, 0.035, 0.035, '#e8a888')
  b.box(0, 0.93, 0.245, 0.1, 0.02, 0.02, '#8a3a2a')
  b.cone(0, 1.5, -0.06, 0.26, 0.6, hat, -0.3)
  b.ring(0, 1.2, 0.0, 0.24, 0.06, '#f6f6f2', Math.PI / 2 - 0.1, 0, 0)
  b.sph(0, 1.8, -0.2, 0.09, 0.09, 0.09, '#f6f6f2')
  if (kind !== 'carry') {
    b.box(-0.3, 0.55, 0.04, 0.1, 0.34, 0.1, suit, 0, 0, 0.25)
    b.sph(-0.35, 0.37, 0.04, 0.06, 0.06, 0.06, SKIN)
  }
  if (kind === 'boss') {
    // El encargado: brazo en el portapapeles y una estrella dorada en el gorro.
    b.bar(0.28, 0.7, 0.04, 0.2, 0.55, 0.3, 0.055, suit)
    b.box(0.14, 0.58, 0.36, 0.3, 0.38, 0.04, '#f1ead8', -0.3)
    b.box(0.14, 0.7, 0.34, 0.22, 0.04, 0.05, '#3a2212', -0.3)
    b.sph(0, 1.86, -0.2, 0.12, 0.12, 0.12, GOLD)
  }
  const body = b.build()
  let arm = null
  if (kind === 'work') {
    const a = makeBaker()
    a.box(0, -0.17, 0, 0.1, 0.36, 0.1, suit)
    a.sph(0, -0.37, 0, 0.065, 0.065, 0.065, SKIN)
    a.cyl(0, -0.37, 0.22, 0.03, 0.46, WOODL, Math.PI / 2)
    a.box(0, -0.37, 0.46, 0.16, 0.13, 0.13, STEEL)
    arm = a.build()
  }
  const out = { body, arm }
  elfCache.set(key, out)
  return out
}

// Partículas sencillas (chispas, estela del trineo, humo).
function makeParticles(cap, additive) {
  const S = 12
  const data = new Float32Array(cap * S)
  const pos = new Float32Array(cap * 3)
  const col = new Float32Array(cap * 3)
  const size = new Float32Array(cap)
  const alpha = new Float32Array(cap)
  const geo = new BufferGeometry()
  for (const [name, arr, n] of [['position', pos, 3], ['aColor', col, 3], ['aSize', size, 1], ['aAlpha', alpha, 1]]) {
    geo.setAttribute(name, new BufferAttribute(arr, n).setUsage(DynamicDrawUsage))
  }
  geo.setDrawRange(0, 0)
  const material = new ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uScale / -mv.z); vC = aColor; vA = aAlpha; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
      gl_FragColor = vec4(vC, ${additive ? '(1.0 - d) * (1.0 - d)' : 'smoothstep(1.0, 0.1, d) * 0.5'} * vA); }`,
    transparent: true,
    depthWrite: false,
    ...(additive ? { blending: AdditiveBlending } : {}),
  })
  const points = new Points(geo, material)
  points.frustumCulled = false
  let n = 0
  return {
    points,
    spawn(x, y, z, vx, vy, vz, life, s, c, drag = 0) {
      if (n >= cap) return
      data.set([x, y, z, vx, vy, vz, 0, life, s, c[0], c[1], c[2]], n * S)
      void drag
      n++
    },
    update(dt) {
      let i = 0
      while (i < n) {
        const o = i * S
        data[o + 6] += dt
        if (data[o + 6] >= data[o + 7]) {
          n--
          if (i !== n) data.copyWithin(o, n * S, n * S + S)
          continue
        }
        data[o] += data[o + 3] * dt
        data[o + 1] += data[o + 4] * dt
        data[o + 2] += data[o + 5] * dt
        const k = data[o + 6] / data[o + 7]
        pos[i * 3] = data[o]
        pos[i * 3 + 1] = data[o + 1]
        pos[i * 3 + 2] = data[o + 2]
        col[i * 3] = data[o + 9]
        col[i * 3 + 1] = data[o + 10]
        col[i * 3 + 2] = data[o + 11]
        size[i] = data[o + 8] * (additive ? 1 - k * 0.6 : 0.6 + k * 1.4)
        alpha[i] = additive ? 1 - k : Math.min(1, k * 5) * (1 - k)
        i++
      }
      geo.setDrawRange(0, n)
      for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[name].needsUpdate = true
    },
  }
}

export function createTaller3D(host, { reduced = false, onFail, onTap } = {}) {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const prCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(prCap)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  const canvas = renderer.domElement
  canvas.className = 'ta3d__gl'
  const onLost = (event) => {
    event.preventDefault()
    onFail?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  host.prepend(canvas)

  const scene = new Scene()
  scene.background = new Color('#070c20')
  scene.fog = new Fog('#1a2552', 120, 400)
  const camera = new PerspectiveCamera(26, 1.4, 1, 900)
  const disposables = []
  const keep = (x) => {
    disposables.push(x)
    return x
  }
  // Cosas que se rehacen con el edificio (se liberan al reconstruirlo).
  let owned = []
  const own = (x) => {
    owned.push(x)
    return x
  }

  // Luces: luna fría de lado, luz cálida de frente (como si saliera de las salas) y cielo/suelo.
  const moon = new DirectionalLight('#9db4ff', 0.9)
  moon.position.set(-30, 50, 20)
  const warm = new DirectionalLight('#ffe2b8', 2.0)
  warm.position.set(6, 10, 30)
  scene.add(moon, warm, new HemisphereLight('#8ea4e8', '#5a4030', 1.5), new AmbientLight('#8896c8', 0.55))

  // Cielo: degradado nocturno, estrellas que titilan, luna, montañas lejanas y aurora boreal (todo según la dirección de la
  // mirada, así siempre se ve en lo alto de la pantalla).
  const skyMat = keep(
    new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      side: BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec3 d = normalize(vW - cameraPosition);
          float y = d.y;
          float u = d.x / max(0.25, -d.z);
          vec3 c = mix(vec3(0.20, 0.25, 0.50), vec3(0.05, 0.09, 0.26), smoothstep(0.0, 0.14, y));
          c = mix(c, vec3(0.015, 0.025, 0.09), smoothstep(0.1, 0.5, y));
          for (int l = 0; l < 2; l++) {
            float fl = float(l);
            float base = 0.09 + fl * 0.035 + 0.05 * noise(vec2(u * 2.5 + uTime * 0.03, fl * 3.0)) + 0.02 * sin(u * 6.0 + uTime * 0.25 + fl);
            float h = y - base;
            float rays = noise(vec2(u * 38.0 + fl * 7.0, uTime * 0.15)) * 0.65 + 0.35;
            float band = smoothstep(0.0, 0.012, h) * exp(-h * 9.0);
            vec3 col = mix(vec3(0.12, 1.0, 0.55), vec3(0.7, 0.28, 0.95), smoothstep(0.02, 0.2, h));
            c += col * band * rays * (0.62 - fl * 0.24);
          }
          vec3 md = normalize(vec3(-0.55, 0.2, -1.0));
          float mm = dot(d, md);
          c += vec3(1.0, 0.96, 0.82) * smoothstep(0.9995, 0.9997, mm) * 1.4 + vec3(0.45, 0.55, 1.0) * pow(max(mm, 0.0), 300.0) * 0.25;
          vec3 g = floor(d * 420.0);
          float sh = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          c += vec3(step(0.9965, sh) * (0.6 + 0.4 * sin(uTime * 2.0 + sh * 50.0))) * smoothstep(0.03, 0.22, y);
          float r1 = 0.03 + 0.05 * noise(vec2(u * 3.0 + 2.0, 0.3)) + 0.02 * noise(vec2(u * 9.0, 1.7));
          float r2 = 0.008 + 0.035 * noise(vec2(u * 4.5 + 7.0, 2.3)) + 0.012 * noise(vec2(u * 14.0, 5.7));
          if (y < r1) c = mix(vec3(0.08, 0.12, 0.28), vec3(0.32, 0.4, 0.66), smoothstep(r1 - 0.012, r1, y));
          if (y < r2) c = mix(vec3(0.05, 0.08, 0.2), vec3(0.22, 0.3, 0.5), smoothstep(r2 - 0.008, r2, y));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  )
  const sky = new Mesh(keep(new SphereGeometry(500, 24, 12)), skyMat)
  sky.frustumCulled = false
  scene.add(sky)

  // ---------- materiales y texturas compartidas ----------
  const solidMat = keep(new MeshLambertMaterial({ vertexColors: true }))
  const snowMat = keep(new MeshLambertMaterial({ color: '#bccbe8' }))
  const floorTex = keep(planks())
  floorTex.wrapS = floorTex.wrapT = RepeatWrapping
  floorTex.repeat.set(4, 2)
  const floorMat = keep(new MeshLambertMaterial({ map: floorTex }))
  const glow = keep(glowTex())
  const winTex = keep(windowTex())
  const winMat = keep(new MeshBasicMaterial({ map: winTex, fog: false }))
  const cookieTex = keep(emojiTexOf('🍪'))
  const glowMats = new Map()
  // Material que brilla (se pasa del 1 para que el bloom lo recoja).
  const glowMat = (color, k) => {
    const key = `${color}${k}`
    if (!glowMats.has(key)) glowMats.set(key, keep(new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), fog: false })))
    return glowMats.get(key)
  }
  const textures = new Map()
  const texOnce = (key, make) => {
    if (!textures.has(key)) textures.set(key, keep(make()))
    return textures.get(key)
  }
  const wallTexOf = (i) =>
    texOnce(`w${i}`, () => {
      const t = canvasTex(768, 256, (g, w, h) => paintWall(g, w, h, i))
      return t
    })
  const signTexOf = (i) => texOnce(`s${i}`, () => canvasTex(160, 160, (g, w, h) => paintSign(g, w, h, PLANTAS[i].icon)))
  const emojiOnce = (e, ring) => texOnce(`e${e}${ring ?? ''}`, () => emojiTexOf(e, ring))
  const spriteOf = (tex, size, x, y, z, parent, order = 0) => {
    const s = new Sprite(own(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false })))
    s.scale.setScalar(size)
    s.position.set(x, y, z)
    s.renderOrder = order
    parent.add(s)
    return s
  }
  const haloOf = (color, size, opacity, x, y, z, parent) => {
    const s = new Sprite(own(new SpriteMaterial({ map: glow, color: new Color(color), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false })))
    s.scale.setScalar(size)
    s.position.set(x, y, z)
    parent.add(s)
    return s
  }
  const toyGeos = TOYS.map((fn) => {
    const bb = makeBaker()
    fn(bb)
    return keep(bb.build())
  })
  const boxGeo = keep(new BoxGeometry(1, 1, 1))
  const hitMat = keep(new MeshBasicMaterial({ visible: false }))

  // ---------- el mundo: suelo nevado, colinas, abetos, casitas, farolas, muñeco de nieve ----------
  const bulbsStatic = [] // bombillas del mundo (abetos)
  const ground = new Mesh(keep(new PlaneGeometry(900, 900).rotateX(-Math.PI / 2)), snowMat)
  ground.position.y = -BASE - 0.02
  scene.add(ground)
  {
    const R = rng(12)
    // Colinas nevadas al fondo, que enmarcan el valle.
    const hills = [
      [-64, -58, 46, 26], [70, -64, 52, 30], [-20, -120, 80, 36], [30, -110, 70, 28], [-110, -80, 50, 22], [120, -85, 55, 24],
    ]
    for (const [x, z, r, hh] of hills) {
      const hill = new Mesh(U.sph, snowMat)
      hill.scale.set(r, hh, r * 0.8)
      hill.position.set(x, -BASE - hh * 0.45, z)
      scene.add(hill)
    }
    // Abetos: una sola malla fundida e instanciada.
    const tb = makeBaker()
    tb.cyl(0, 0.5, 0, 0.26, 1.0, '#4a2f1c')
    for (let k = 0; k < 4; k++) {
      const r = 1.5 - k * 0.3
      tb.cone(0, 1.5 + k * 1.0, 0, r, 1.8, '#1f5a3a')
      tb.cone(0, 1.95 + k * 1.0, 0, r * 0.62, 0.95, '#e6eefb')
    }
    tb.cone(0, 5.5, 0, 0.35, 0.8, '#e6eefb')
    const treeGeo = keep(tb.build())
    const spots = []
    for (let k = 0; k < 90; k++) {
      const side = k % 2 ? 1 : -1
      {
        const z = -48 + R() * 52
        spots.push([side * (14 + R() * 70), z, z > -22 ? 0.5 + R() * 0.6 : 0.9 + R() * 1.0])
      }
    }
    for (let k = 0; k < 18; k++) spots.push([(R() - 0.35) * 30, -48 + R() * 20, 2.4 + R() * 1.8])
    const trees = new InstancedMesh(treeGeo, keep(new MeshLambertMaterial({ vertexColors: true })), spots.length)
    const dm = new Object3D()
    spots.forEach(([x, z, s], k) => {
      dm.position.set(x, -BASE, z)
      dm.rotation.set(0, R() * TAU, 0)
      dm.scale.set(s, s * (0.9 + R() * 0.3), s)
      dm.updateMatrix()
      trees.setMatrixAt(k, dm.matrix)
      trees.setColorAt(k, new Color().setScalar(0.75 + R() * 0.45))
      // Los abetos cercanos van con luces de Navidad.
      if (k < 8 && Math.abs(x) < 40) {
        for (let n = 0; n < 16; n++) {
          const a = n * 2.4
          const f = n / 16
          const rr = (1.5 - f * 1.3) * s * 0.95
          bulbsStatic.push(new Vector3(x + Math.cos(a) * rr, -BASE + (1.6 + f * 3.6 * 0.95) * s, z + Math.sin(a) * rr + 0.3))
        }
      }
    })
    scene.add(trees)
    // Casitas del pueblo en las colinas con sus ventanas encendidas.
    const hb = makeBaker()
    const winPos = []
    ;[[-52, -52], [-44, -56], [58, -58], [66, -54], [-14, -96], [22, -92], [92, -70]].forEach(([x, z], k) => {
      const w = 3 + (k % 3)
      hb.box(x, -BASE + 8 + (k % 2) * 3 + 1.2, z, w, 2.4, w * 0.8, '#5a4a52')
      hb.pyr(x, -BASE + 8 + (k % 2) * 3 + 3.1, z, w * 0.85, 1.8, '#dfe8f8')
      winPos.push([x, -BASE + 8 + (k % 2) * 3 + 1.2, z + w * 0.41])
    })
    const village = new Mesh(keep(hb.build()), solidMat)
    scene.add(village)
    const windows = new InstancedMesh(keep(new PlaneGeometry(0.8, 0.9)), keep(new MeshBasicMaterial({ color: new Color('#ffcf70').multiplyScalar(2), fog: false })), winPos.length)
    winPos.forEach(([x, y, z], k) => {
      dm.position.set(x, y, z)
      dm.rotation.set(0, 0, 0)
      dm.scale.setScalar(1)
      dm.updateMatrix()
      windows.setMatrixAt(k, dm.matrix)
    })
    scene.add(windows)
    // Muñeco de nieve y farolas junto al edificio, montones de nieve en la base.
    const sb = makeBaker()
    sb.sph(0, 0.8, 0, 0.85, 0.8, 0.85, SNOW)
    sb.sph(0, 2.0, 0, 0.62, 0.58, 0.62, SNOW)
    sb.sph(0, 2.92, 0, 0.44, 0.42, 0.44, SNOW)
    sb.cone(0, 2.92, 0.5, 0.07, 0.5, '#ff7a1a', Math.PI / 2)
    sb.cyl(0, 3.5, 0, 0.4, 0.5, '#202024')
    sb.cyl(0, 3.27, 0, 0.62, 0.06, '#202024')
    sb.cyl(0, 2.55, 0, 0.5, 0.18, '#d6303c')
    sb.box(0.3, 2.2, 0.35, 0.16, 0.7, 0.1, '#d6303c')
    for (const sd of [-1, 1]) {
      sb.sph(sd * 0.15, 3.0, 0.38, 0.05, 0.05, 0.04, '#111')
      sb.bar(sd * 0.55, 2.1, 0, sd * 1.5, 2.8, 0.2, 0.045, '#4a2f1c')
    }
    const snowman = new Mesh(keep(sb.build()), solidMat)
    snowman.position.set(-11.5, -BASE, 3.5)
    snowman.rotation.y = 0.5
    scene.add(snowman)
    const eb = makeBaker()
    for (const [x, z] of [[-9.5, 2.2], [11.6, 2.4]]) {
      eb.cyl(x, 1.9 - BASE, z, 0.1, 3.8, '#2a2c38')
      eb.sph(x, 3.9 - BASE, z, 0.28, 0.28, 0.28, '#fff0b8')
    }
    for (const [x, z, r] of [[-3, 1.4, 1.9], [4.5, 1.6, 2.4], [-8.5, 0.5, 2.2], [11, 0.5, 2.6], [0, -6.2, 3]]) eb.sph(x, -BASE, z, r, r * 0.38, r * 0.8, '#d9e4f8')
    const env = new Mesh(keep(eb.build()), solidMat)
    scene.add(env)
    for (const [x, z] of [[-9.5, 2.2], [11.6, 2.4]]) {
      const lamp = new Mesh(keep(new SphereGeometry(0.3, 10, 8)), glowMat('#ffd28a', 3.2))
      lamp.position.set(x, 3.9 - BASE, z)
      scene.add(lamp)
      const hl = new Sprite(keep(new SpriteMaterial({ map: glow, color: new Color('#ffbe66'), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false })))
      hl.scale.setScalar(6)
      hl.position.copy(lamp.position)
      scene.add(hl)
    }
    // Luz cálida de las salas sobre la nieve de delante.
    const pool = new Mesh(keep(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), keep(new MeshBasicMaterial({ map: glow, color: new Color('#ff9c4a'), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, fog: false })))
    pool.scale.set(34, 1, 12)
    pool.position.set(1, -BASE + 0.04, 3.5)
    scene.add(pool)
    const shade = new Mesh(keep(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), keep(new MeshBasicMaterial({ map: glow, color: new Color('#02040c'), transparent: true, opacity: 0.55, depthWrite: false, fog: false })))
    shade.scale.set(24, 1, 10)
    shade.position.set(1, -BASE + 0.03, -2)
    scene.add(shade)
  }

  // ---------- el edificio (se rehace cuando se abre una planta) ----------
  const building = new Group()
  scene.add(building)
  const wallGeo = keep(new PlaneGeometry(W, H))
  const sideGeo = keep(new PlaneGeometry(D, H).rotateY(Math.PI / 2))
  const floorGeo = keep(new PlaneGeometry(W, D).rotateX(-Math.PI / 2))
  const quadGeo = keep(new PlaneGeometry(1, 1))
  const baseBelt = keep(beltTexture())
  const ELF_COLORS = [['#2a8a4a', '#c8302a'], ['#c8302a', '#2a8a4a'], ['#2a6ab0', '#e8b83a'], ['#8a3a9a', '#2a8a4a']]
  const makeElf = (ci, kind, scale = 1.3) => {
    const [suit, hat] = kind === 'boss' ? ['#a8262a', '#ffd34a'] : ELF_COLORS[ci % ELF_COLORS.length]
    const geo = elfGeometry(suit, hat, kind)
    const el = new Group()
    el.add(new Mesh(geo.body, solidMat))
    let arm = null
    if (geo.arm) {
      arm = new Group()
      arm.position.set(0.3, 0.72, 0.04)
      arm.add(new Mesh(geo.arm, solidMat))
      el.add(arm)
    }
    el.scale.setScalar(scale)
    el.userData.arm = arm
    return el
  }
  // Huecos del montón de juguetes (en la caja junto al hueco del montacargas), de abajo arriba.
  const PILE_SLOTS = [
    [4.35, 0.1, -1.7], [4.75, 0.1, -1.7], [4.35, 0.1, -1.3], [4.75, 0.1, -1.3], [4.35, 0.1, -0.9], [4.75, 0.1, -0.9],
    [4.55, 0.42, -1.5], [4.55, 0.42, -1.1], [4.3, 0.42, -1.3], [4.8, 0.42, -1.3],
    [4.55, 0.74, -1.3], [4.4, 0.74, -1.5], [4.7, 0.74, -1.1],
  ]
  const BELT_TOYS = 6

  // Utilería de cada planta, según lo que fabrica. c = { b (horneado), g, anim, part, glowAt }.
  const PROPS = [
    // 0 Envoltorio: rollos de papel, regalos y el gran rollo girando sobre la mesa de envolver.
    (c) => {
      const { b } = c
      ;['#d6303c', '#2f9e5a', '#2f6fd6', '#e8b83a', '#9b4fd1'].forEach((col, k) => {
        b.cyl(-4.5 + k * 0.4, 0.8, -4.7, 0.18, 1.6, col)
        b.cyl(-4.5 + k * 0.4, 1.61, -4.7, 0.09, 0.04, '#efe3c0')
      })
      b.box(-4.1, 0.3, -3.4, 1.0, 0.6, 0.8, '#2f9e5a')
      b.box(-4.1, 0.3, -3.4, 1.02, 0.62, 0.12, '#ffd34a')
      b.box(-4.1, 0.3, -3.4, 0.12, 0.62, 0.82, '#ffd34a')
      b.box(-4.2, 0.85, -3.4, 0.62, 0.5, 0.56, '#d6303c')
      b.box(-4.2, 0.85, -3.4, 0.64, 0.52, 0.1, '#f6f6f2')
      b.sph(-4.2, 1.16, -3.4, 0.16, 0.08, 0.16, '#f6f6f2')
      b.box(-2.5, 1.2, -3.6, 0.1, 2.4, 0.1, WOODD)
      b.box(-0.7, 1.2, -3.6, 0.1, 2.4, 0.1, WOODD)
      b.box(-1.6, 1.55, -3.6, 1.6, 1.3, 0.03, '#e8b83a')
      for (let k = 0; k < 6; k++) b.box(-2.25 + k * 0.28, 1.55, -3.58, 0.1, 1.3, 0.02, '#d6303c')
      b.box(-1.6, 0.76, -1.9, 1.5, 0.03, 0.8, '#2f9e5a')
      b.box(-1.1, 0.92, -1.9, 0.42, 0.28, 0.42, '#2f6fd6')
      b.box(-1.1, 0.92, -1.9, 0.44, 0.3, 0.07, '#ffd34a')
      const roll = c.part((bb) => {
        bb.cyl(0, 0, 0, 0.34, 1.5, '#f3ead6', 0, 0, Math.PI / 2)
        for (let k = 0; k < 6; k++) bb.box(0, Math.cos(k * 1.047) * 0.34, Math.sin(k * 1.047) * 0.34, 1.52, 0.05, 0.14, k % 2 ? '#d6303c' : '#2f9e5a', k * 1.047)
      }, -1.6, 2.45, -3.6)
      c.anim.push((t, on, dt) => {
        if (on) roll.rotation.x += dt * 1.6
      })
    },
    // 1 Carpintería: tablones, troncos, sierra circular y el panel de herramientas.
    (c) => {
      const { b } = c
      for (let k = 0; k < 6; k++) b.box(-4.6 + k * 0.17, 1.0, -4.95, 0.14, 2.0, 0.45, k % 2 ? WOODL : '#9a6a38', 0, 0, 0.07)
      ;[[-3.7, 0.3], [-3.15, 0.3], [-3.42, 0.8], [-4.2, 0.28]].forEach(([x, y]) => {
        b.cyl(x, y, -4.3, 0.28, 0.9, '#6a4426', Math.PI / 2)
        b.cyl(x, y, -3.84, 0.24, 0.02, '#e0b27a', Math.PI / 2)
      })
      b.box(0.5, 0.5, -4.2, 1.5, 0.12, 0.9, WOOD)
      for (const [dx, dz] of [[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]]) b.box(0.5 + dx, 0.25, -4.2 + dz, 0.1, 0.5, 0.1, WOODD)
      b.box(0.5, 0.58, -4.55, 1.5, 0.05, 0.06, STEELD)
      b.box(-1.5, 2.85, -5.34, 3.0, 1.1, 0.05, '#8a5a30')
      b.box(-2.4, 2.9, -5.28, 0.9, 0.2, 0.03, STEEL)
      for (let k = 0; k < 5; k++) b.box(-2.82 + k * 0.1, 2.72, -5.27, 0.04, 0.12, 0.03, STEELD)
      b.box(-2.78, 2.62, -5.28, 0.28, 0.14, 0.04, WOODL)
      b.bar(-1.4, 3.2, -5.28, -1.4, 2.5, -5.28, 0.04, WOODL)
      b.box(-1.4, 3.26, -5.28, 0.32, 0.14, 0.12, STEEL)
      b.bar(-0.6, 3.2, -5.28, -0.6, 2.5, -5.28, 0.04, WOODL)
      b.box(-0.6, 3.26, -5.28, 0.32, 0.14, 0.12, STEEL)
      b.box(-0.05, 2.7, -5.28, 0.12, 0.7, 0.03, '#f1d98a')
      b.box(-1.6, 0.76, -1.9, 1.7, 0.1, 0.55, WOODL)
      b.box(-2.2, 0.85, -1.9, 0.5, 0.08, 0.14, STEEL)
      const disk = c.part((bb) => {
        bb.cyl(0, 0, 0, 0.42, 0.04, '#c9d2de', Math.PI / 2)
        bb.cyl(0, 0, 0, 0.08, 0.07, '#e8b93e', Math.PI / 2)
        for (let k = 0; k < 14; k++) bb.box(Math.cos(k * 0.449) * 0.43, Math.sin(k * 0.449) * 0.43, 0, 0.1, 0.07, 0.04, '#9aa6b6', 0, 0, k * 0.449)
      }, 0.5, 1.0, -3.95)
      c.anim.push((t, on, dt) => {
        if (on) disk.rotation.z -= dt * 14
      })
    },
    // 2 Muñecas: estantes de muñecas, casa de muñecas y matrioshkas.
    (c) => {
      const { b } = c
      const cols = ['#f08cb4', '#6ab0f0', '#f0d04a', '#8ae08a', '#d68af0', '#ff8a6a']
      ;[2.2, 2.95].forEach((y, row) => {
        b.box(-1.4, y, -5.1, 3.6, 0.08, 0.6, '#f6e6d6')
        for (let k = 0; k < 7; k++) {
          const x = -2.95 + k * 0.5
          b.cone(x, y + 0.27, -5.05, 0.17, 0.46, cols[(k + row * 2) % 6])
          b.sph(x, y + 0.57, -5.05, 0.1, 0.1, 0.1, SKIN)
          b.sph(x, y + 0.6, -5.07, 0.115, 0.08, 0.115, ['#e8b83a', '#5a3a22', '#2a1a12', '#d6603c'][(k + row) % 4])
        }
      })
      b.box(-4.2, 0.55, -4.3, 1.5, 1.1, 1.0, '#f4e8d0')
      b.pyr(-4.2, 1.45, -4.3, 1.25, 0.8, '#e0679a')
      b.box(-4.2, 0.7, -3.79, 0.3, 0.5, 0.02, '#8a5a30')
      for (const dx of [-0.5, 0.5]) b.box(-4.2 + dx, 0.8, -3.79, 0.28, 0.3, 0.02, '#6ab0f0')
      matryoshka(b, -3.2, 0, -4.4, 1.0, '#d6303c')
      matryoshka(b, -2.7, 0, -4.2, 0.72, '#2f6fd6')
      matryoshka(b, 0.7, 0, -4.4, 0.6, '#9b4fd1')
      b.box(-1.6, 0.76, -1.9, 1.6, 0.04, 0.7, '#f6e6d6')
      b.cone(-1.9, 0.98, -1.9, 0.14, 0.4, '#f08cb4')
      b.sph(-1.9, 1.24, -1.9, 0.09, 0.09, 0.09, SKIN)
      b.sph(-1.3, 0.9, -1.9, 0.09, 0.09, 0.09, SKIN)
      b.cyl(-1.3, 0.8, -1.9, 0.07, 0.12, '#6ab0f0')
    },
    // 3 Peluches: osos enormes, estante de ositos, rollos de tela y la máquina de coser.
    (c) => {
      const { b } = c
      teddy(b, -4.15, 0, -4.1, 1.35, '#b07a44')
      teddy(b, -3.0, 0, -4.5, 0.95, '#f08cb4', '#fbe0ec')
      b.box(-1.4, 2.3, -5.1, 3.4, 0.08, 0.6, '#f6e6d6')
      ;['#b07a44', '#f6e0c0', '#6ab0f0', '#d6a0f0', '#e8b83a', '#8ae08a'].forEach((col, k) => teddy(b, -2.8 + k * 0.55, 2.34, -5.05, 0.42, col))
      b.box(-1.4, 3.05, -5.1, 3.4, 0.08, 0.6, '#f6e6d6')
      for (let k = 0; k < 6; k++) b.cyl(-2.8 + k * 0.55, 3.25, -5.05, 0.16, 0.34, ['#d6303c', '#2f9e5a', '#2f6fd6', '#e8b83a', '#9b4fd1', '#f1f1f1'][k])
      for (let k = 0; k < 4; k++) b.cyl(1.0, 0.22 + k * 0.38, -4.6, 0.19, 1.3, ['#d6303c', '#e8b83a', '#2f9e5a', '#9b4fd1'][k], 0, 0, Math.PI / 2)
      b.cyl(-4.7, 0.3, -2.9, 0.4, 0.6, '#a07040')
      for (const [x, y, z] of [[-4.8, 0.7, -2.9], [-4.55, 0.78, -2.8], [-4.65, 0.68, -3.05], [-4.4, 0.62, -2.95]]) b.sph(x, y, z, 0.22, 0.2, 0.22, '#fffaf0')
      b.box(-1.6, 0.76, -1.9, 1.7, 0.04, 0.8, '#d68a4a')
      b.box(-0.55, 0.9, -1.95, 0.5, 0.26, 0.32, '#d6d6de')
      b.box(-0.45, 1.16, -1.95, 0.18, 0.12, 0.32, '#d6d6de', 0, 0, 0.15)
      const needle = c.part((bb) => bb.box(0, 0, 0, 0.025, 0.2, 0.025, STEEL), -0.62, 1.15, -1.8)
      c.anim.push((t, on) => {
        needle.position.y = 1.15 + (on ? Math.abs(Math.sin(t * 16)) * 0.08 : 0)
      })
    },
    // 4 Bicis: ruedas en la pared, bicis acabadas, montón de neumáticos y la rueda en el soporte.
    (c) => {
      const { b } = c
      ;[-2.9, -2.0, -1.1, -0.2].forEach((x, k) => {
        b.ring(x, 2.7, -5.3, 0.46, 0.09, '#22252b', 0, 0, 0, 1.2)
        b.ring(x, 2.7, -5.3, 0.36, 0.02, STEEL)
        b.cyl(x, 2.7, -5.3, 0.06, 0.1, k % 2 ? '#e8b83a' : '#d6303c', Math.PI / 2)
        for (let s = 0; s < 4; s++) b.box(x, 2.7, -5.3, 0.72, 0.012, 0.012, STEEL, 0, 0, s * 0.785)
      })
      bike(b, -3.6, 0, -4.5, 1.7, '#d6303c')
      bike(b, -1.9, 0, -4.8, 1.35, '#2f9e5a')
      for (let k = 0; k < 5; k++) b.ring(-4.55, 0.14 + k * 0.2, -3.2, 0.5, 0.12, '#22252b', Math.PI / 2, 0, 0, 1)
      b.box(0.2, 0.55, -4.1, 0.1, 1.1, 0.1, STEELD)
      b.box(1.2, 0.55, -4.1, 0.1, 1.1, 0.1, STEELD)
      b.box(0.7, 1.08, -4.1, 1.1, 0.08, 0.14, STEELD)
      b.box(-1.6, 0.76, -1.9, 1.7, 0.04, 0.8, '#3a4a6a')
      for (const [x, k] of [[-2.1, 0], [-1.3, 1]]) b.bar(x, 0.8, -1.9, x + 0.35, 1.0, -1.9, 0.02, k ? '#e8b83a' : STEEL)
      const wheel = c.part((bb) => {
        bb.ring(0, 0, 0, 0.5, 0.09, '#22252b', 0, 0, 0, 1.2)
        bb.ring(0, 0, 0, 0.4, 0.02, STEEL)
        bb.cyl(0, 0, 0, 0.07, 0.14, '#e8b83a', Math.PI / 2)
        for (let s = 0; s < 6; s++) bb.box(0, 0, 0, 0.8, 0.014, 0.014, STEEL, 0, 0, s * 0.5236)
        bb.box(0.4, 0, 0, 0.1, 0.1, 0.05, '#d6303c')
      }, 0.7, 0.62, -4.1)
      c.anim.push((t, on, dt) => {
        if (on) wheel.rotation.z -= dt * 7
      })
    },
    // 5 Trenes: vía con locomotora que va y viene, reloj de estación y mapa de montañas.
    (c) => {
      const { b } = c
      for (let k = 0; k < 17; k++) b.box(-4.8 + k * 0.3, 0.05, -4.3, 0.12, 0.07, 0.85, '#5a3a22')
      for (const z of [-4.55, -4.05]) b.box(-2.4, 0.13, z, 5.2, 0.07, 0.07, '#9aa6b6')
      b.box(-5.0, 0.4, -4.3, 0.25, 0.7, 1.0, '#d6303c')
      b.box(-1.5, 2.85, -5.34, 3.3, 1.2, 0.05, '#2a3a5a')
      b.cone(-2.4, 2.8, -5.28, 0.8, 0.8, '#4a6a9a')
      b.cone(-1.4, 2.7, -5.28, 1.0, 1.0, '#5a7aaa')
      b.cone(-2.4, 3.05, -5.27, 0.3, 0.3, SNOW)
      b.cone(-1.4, 3.0, -5.27, 0.35, 0.36, SNOW)
      b.sph(-0.6, 3.3, -5.27, 0.12, 0.12, 0.02, '#ffd34a')
      b.ring(0.6, 3.05, -5.3, 0.42, 0.06, GOLD)
      b.cyl(0.6, 3.05, -5.32, 0.4, 0.04, '#f6ecd0', Math.PI / 2)
      b.box(0.6, 3.17, -5.28, 0.03, 0.2, 0.02, '#222')
      b.box(0.7, 3.05, -5.28, 0.18, 0.03, 0.02, '#222')
      b.box(-3.4, 1.6, -5.2, 0.12, 3.2, 0.12, '#5a3a22')
      b.box(-3.4, 1.9, -5.12, 1.3, 0.34, 0.06, '#f1ead8')
      b.box(-3.4, 1.9, -5.08, 1.2, 0.04, 0.02, '#d6303c')
      for (const [dx, col] of [[0, '#d6303c'], [0.9, '#2f9e5a']]) {
        b.box(1.0 + dx, 0.24, -4.3, 0.8, 0.3, 0.42, '#2f6fd6')
        b.box(1.0 + dx, 0.5, -4.3, 0.84, 0.06, 0.46, col)
        for (const wx of [-0.25, 0.25]) b.cyl(1.0 + dx + wx, 0.12, -4.3, 0.1, 0.5, '#22252b', Math.PI / 2)
      }
      b.box(-1.6, 0.76, -1.9, 1.7, 0.05, 0.8, '#2f5a3a')
      for (let k = 0; k < 6; k++) b.box(-2.3 + k * 0.28, 0.82, -1.9, 0.05, 0.03, 0.3, '#5a3a22')
      const loco = c.part((bb) => TOYS[5](bb), -2.4, 0.17, -4.3)
      loco.scale.setScalar(1.9)
      c.anim.push((t, on) => {
        const s = on ? Math.sin(t * 0.7) : 0
        loco.position.x = -2.4 + s * 1.9
        loco.rotation.y = on && Math.cos(t * 0.7) < 0 ? Math.PI : 0
      })
    },
    // 6 Robots: brazo mecánico, pantallas, un robot a medio montar y tuberías.
    (c) => {
      const { b, g } = c
      b.cyl(-4.2, 0.28, -4.3, 0.55, 0.56, STEELD)
      b.cyl(-4.2, 0.6, -4.3, 0.34, 0.12, '#46e6ff')
      const s1 = new Group()
      s1.position.set(-4.2, 0.75, -4.3)
      g.add(s1)
      c.part((bb) => {
        bb.box(0, 0.65, 0, 0.26, 1.3, 0.26, '#d6dde8')
        bb.sph(0, 0, 0, 0.22, 0.22, 0.22, '#e8b93e')
      }, 0, 0, 0, s1)
      const s2 = new Group()
      s2.position.y = 1.3
      s1.add(s2)
      c.part((bb) => {
        bb.box(0, 0.5, 0, 0.2, 1.0, 0.2, '#c9d2de')
        bb.sph(0, 0, 0, 0.18, 0.18, 0.18, '#e8b93e')
        bb.box(-0.12, 1.05, 0, 0.06, 0.24, 0.1, '#e8b93e')
        bb.box(0.12, 1.05, 0, 0.06, 0.24, 0.1, '#e8b93e')
      }, 0, 0, 0, s2)
      const robo = (x, z, k) => {
        b.box(x, 0.7 * k, z, 0.8 * k, 0.9 * k, 0.5 * k, '#aab4c2')
        b.box(x, 1.4 * k, z, 0.55 * k, 0.45 * k, 0.45 * k, '#c9d2de')
        b.cyl(x, 1.75 * k, z, 0.02, 0.3 * k, STEELD)
        b.sph(x, 1.95 * k, z, 0.06 * k, 0.06 * k, 0.06 * k, '#ff4a4a')
        for (const sd of [-1, 1]) {
          b.box(x + sd * 0.55 * k, 0.75 * k, z, 0.18 * k, 0.8 * k, 0.18 * k, STEELD)
          b.box(x + sd * 0.22 * k, 0.12 * k, z, 0.22 * k, 0.3 * k, 0.26 * k, STEELD)
        }
      }
      robo(-2.9, -4.6, 1.15)
      b.cyl(0, 3.4, -5.1, 0.09, 10, '#7a8798', 0, 0, Math.PI / 2)
      for (const x of [-4, -1.5, 1, 3.5]) b.cyl(x, 3.4, -5.1, 0.14, 0.2, '#e8b93e', 0, 0, Math.PI / 2)
      b.box(-0.6, 0.76, -1.9, 0.8, 0.08, 0.5, '#2a2c38')
      const screens = []
      ;[[-1.7, 2.65], [-0.5, 2.65], [-1.1, 1.85]].forEach(([x, y], k) => {
        b.box(x, y, -5.3, 1.05, 0.7, 0.08, '#1a1d26')
        const m = c.glowAt(quadGeo, '#46e6ff', 1.6, x, y, -5.25, 0.92, 0.57, 1, true)
        screens.push({ m, k })
      })
      const bars = c.part((bb) => {
        for (let k = 0; k < 5; k++) bb.box(-0.4 + k * 0.2, 0, 0, 0.12, 0.1 + k * 0.06, 0.01, '#ffffff')
      }, -0.5, 2.5, -5.2)
      void bars
      c.anim.push((t, on, dt) => {
        s1.rotation.z = on ? -0.5 + Math.sin(t * 1.3) * 0.55 : -0.2
        s2.rotation.z = on ? 1.0 + Math.sin(t * 2.0 + 1) * 0.6 : 1.2
        screens.forEach(({ m, k }) => {
          const v = on ? 0.55 + 0.45 * Math.sin(t * (3 + k) + k * 2) : 0.5
          m.material.color.setRGB(0.1 * v, 0.9 * v + 0.2, 1.0 * v + 0.2).multiplyScalar(1.7)
        })
        void dt
      })
    },
    // 7 Consolas: neones, pared de pantallas, recreativa y pilas de consolas.
    (c) => {
      const { b } = c
      c.glowAt(boxGeo, '#ff3ad8', 3, -2.2, 3.38, -5.3, 5.2, 0.07, 0.05)
      c.glowAt(boxGeo, '#3ae6ff', 3, -4.85, 1.8, -5.3, 0.07, 3.2, 0.05)
      c.glowAt(boxGeo, '#3ae6ff', 3, 0.5, 3.38, -5.3, 0.07, 0.07, 0.05)
      const tvs = []
      for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
        const x = -2.9 + k * 1.05
        const y = 1.95 + r * 0.8
        b.box(x, y, -5.3, 0.95, 0.7, 0.1, '#14161e')
        tvs.push({ m: c.glowAt(quadGeo, '#ff3ad8', 1.5, x, y, -5.24, 0.82, 0.58, 1, true), k: k + r * 3 })
      }
      b.box(-4.15, 0.95, -4.4, 0.95, 1.9, 0.85, '#5a2a9a')
      b.box(-4.15, 1.45, -3.97, 0.78, 0.55, 0.05, '#14161e')
      b.box(-4.15, 1.88, -3.95, 0.9, 0.16, 0.1, '#ffd34a')
      b.box(-4.15, 0.95, -3.95, 0.8, 0.12, 0.2, '#14161e')
      b.cyl(-4.3, 1.08, -3.84, 0.03, 0.2, '#d6303c')
      b.sph(-4.3, 1.2, -3.84, 0.07, 0.07, 0.07, '#d6303c')
      b.cyl(-3.95, 1.0, -3.84, 0.05, 0.03, '#ffd34a', Math.PI / 2)
      const arcade = c.glowAt(quadGeo, '#4aff8a', 1.7, -4.15, 1.45, -3.915, 0.7, 0.46, 1, true)
      b.box(1.4, 0.2, -4.7, 1.3, 0.4, 0.7, '#2a2c38')
      for (let k = 0; k < 3; k++) {
        b.box(1.1 + k * 0.4, 0.5, -4.7, 0.34, 0.18, 0.5, k % 2 ? '#e8e8f0' : '#2a2c38')
        b.box(1.1 + k * 0.4, 0.68, -4.7, 0.26, 0.1, 0.4, ['#d6303c', '#2f6fd6', '#2f9e5a'][k])
      }
      for (const [x, col] of [[-2.2, '#d6303c'], [-1.6, '#2f6fd6']]) {
        b.box(x, 0.84, -1.95, 0.5, 0.12, 0.32, '#2a2c38')
        b.sph(x - 0.12, 0.92, -1.8, 0.05, 0.05, 0.05, col)
      }
      c.anim.push((t, on) => {
        tvs.forEach(({ m, k }) => m.material.color.setHSL((t * 0.08 + k * 0.17) % 1, 0.9, 0.55).multiplyScalar(on ? 1.9 : 1.1))
        arcade.material.color.setHSL((t * 0.3) % 1, 0.9, 0.55).multiplyScalar(1.7)
      })
    },
  ]

  function buildRoom(i, lvl) {
    const g = new Group()
    g.position.y = i * H
    const th = THEMES[i % THEMES.length]
    const b = makeBaker()
    const anim = []
    const part = (fn, x, y, z, parent = g) => {
      const bb = makeBaker()
      fn(bb)
      const m = new Mesh(own(bb.build()), solidMat)
      m.position.set(x, y, z)
      parent.add(m)
      return m
    }
    const glowAt = (geo, color, k, x, y, z, sx, sy, sz, ownMat = false) => {
      const m = new Mesh(geo, ownMat ? own(new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), fog: false })) : glowMat(color, k))
      m.position.set(x, y, z)
      m.scale.set(sx, sy, sz)
      g.add(m)
      return m
    }
    const c = { b, g, anim, part, glowAt }
    // Estructura: forjado, canto delantero con filete dorado, postes de caramelo.
    b.box(0, -0.16, -D / 2 + 0.05, W + 0.8, 0.32, D + 0.3, '#3b2213')
    b.box(0, -0.08, 0.14, W + 0.95, 0.4, 0.3, '#5b3319')
    b.box(0, 0.13, 0.3, W + 0.95, 0.05, 0.04, GOLD)
    for (const x of [X0 - 0.15, W / 2 + 0.1]) for (let s = 0; s < 8; s++) b.cyl(x, ((s + 0.5) * H) / 8, 0.12, 0.17, H / 8 + 0.005, s % 2 ? '#f4f1ea' : '#d6303c')
    // Ventana al exterior, con alféizar nevado.
    b.box(2.32, 2.15, -D + 0.08, 0.1, 1.9, 0.14, WOODD)
    b.box(3.68, 2.15, -D + 0.08, 0.1, 1.9, 0.14, WOODD)
    b.box(3.0, 3.1, -D + 0.08, 1.46, 0.1, 0.14, WOODD)
    b.box(3.0, 2.15, -D + 0.08, 1.26, 0.05, 0.1, WOODD)
    b.box(3.0, 2.15, -D + 0.08, 0.05, 1.8, 0.1, WOODD)
    b.box(3.0, 1.2, -D + 0.14, 1.7, 0.1, 0.34, WOODL)
    b.box(3.0, 1.29, -D + 0.14, 1.62, 0.1, 0.28, SNOW)
    // Banco de trabajo (bajo, para que los elfos asomen por encima).
    b.box(-1.6, 0.68, -1.9, 3.4, 0.14, 0.95, WOOD)
    b.box(-1.6, 0.46, -1.45, 3.3, 0.36, 0.06, WOODD)
    for (const dx of [-1.6, 1.6]) for (const dz of [-0.4, 0.4]) b.box(-1.6 + dx, 0.31, -1.9 + dz, 0.12, 0.62, 0.12, WOODD)
    // Cinta transportadora hasta el hueco del montacargas y caja del montón.
    b.box(2.25, 0.55, -1.3, 3.5, 0.1, 0.9, '#33363e')
    b.box(2.25, 0.69, -1.78, 3.5, 0.1, 0.06, STEEL)
    b.box(2.25, 0.69, -0.82, 3.5, 0.1, 0.06, STEEL)
    for (const x of [0.7, 2.25, 3.8]) b.box(x, 0.28, -1.3, 0.12, 0.56, 0.9, STEELD)
    for (const x of [0.52, 3.98]) b.cyl(x, 0.63, -1.3, 0.12, 0.92, STEEL, Math.PI / 2)
    b.box(4.57, 0.05, -1.3, 1.0, 0.1, 1.5, WOODD)
    b.box(4.57, 0.28, -0.52, 1.0, 0.4, 0.06, WOOD)
    b.box(4.57, 0.28, -2.08, 1.0, 0.4, 0.06, WOOD)
    b.box(5.06, 0.28, -1.3, 0.06, 0.4, 1.5, WOOD)
    // Lámpara del techo.
    b.box(-1.6, H - 0.3, -2.0, 0.03, 0.6, 0.03, '#1a1410')
    b.cone(-1.6, H - 0.62, -2.0, 0.5, 0.34, th[1])
    b.ring(-1.6, H - 0.78, -2.0, 0.5, 0.025, GOLD, Math.PI / 2)
    // Estantes con las mercancías de la planta, a la izquierda y a la derecha de la ventana.
    for (const [x, y, w] of [[1.4, 1.5, 1.5], [1.4, 2.45, 1.5], [4.4, 1.7, 1.0]]) {
      b.box(x, y, -D + 0.3, w, 0.07, 0.6, WOOD)
      b.box(x - w / 2 + 0.1, y - 0.14, -D + 0.12, 0.05, 0.2, 0.1, WOODD)
      b.box(x + w / 2 - 0.1, y - 0.14, -D + 0.12, 0.05, 0.2, 0.1, WOODD)
      const n = Math.floor(w / 0.42)
      for (let k = 0; k < n; k++) b.at(x - w / 2 + 0.28 + k * 0.42, y + 0.04, -D + 0.3, 0.85, () => TOYS[i % TOYS.length](b))
    }
    PROPS[i % PROPS.length](c)
    g.add(new Mesh(own(b.build()), solidMat))

    // Paredes, suelo, ventana, cartel.
    const wallMat = own(new MeshLambertMaterial({ map: wallTexOf(i), emissive: new Color(th[2]), emissiveIntensity: 0.05 }))
    const sideMat = own(new MeshLambertMaterial({ color: new Color(th[0]).multiplyScalar(0.8), emissive: new Color(th[2]), emissiveIntensity: 0.03 }))
    const back = new Mesh(wallGeo, wallMat)
    back.position.set(0, H / 2, -D)
    const left = new Mesh(sideGeo, sideMat)
    left.position.set(X0, H / 2, -D / 2)
    const floor = new Mesh(floorGeo, floorMat)
    floor.position.set(0, 0.012, -D / 2)
    const win = new Mesh(quadGeo, winMat)
    win.scale.set(1.28, 1.8, 1)
    win.position.set(3.0, 2.15, -D + 0.015)
    g.add(back, left, floor, win)
    const sign = new Mesh(quadGeo, own(new MeshBasicMaterial({ map: signTexOf(i % PLANTAS.length), fog: false })))
    sign.scale.setScalar(1.3)
    sign.position.set(-3.95, 2.62, -D + 0.04)
    g.add(sign)
    // Luz: bombilla, halo cálido y resplandor sobre la pared del fondo.
    const lampMat = own(new MeshBasicMaterial({ color: new Color(th[2]), fog: false }))
    const bulb = new Mesh(own(new SphereGeometry(0.16, 12, 8)), lampMat)
    bulb.position.set(-1.6, H - 0.78, -2.0)
    g.add(bulb)
    const halo = haloOf(th[2], 3.6, 0.5, -1.6, H - 0.85, -2.0, g)
    const wash = new Mesh(quadGeo, own(new MeshBasicMaterial({ map: glow, color: new Color(th[2]), transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, fog: false })))
    wash.scale.set(W * 1.1, H * 1.5, 1)
    wash.position.set(-1.0, H * 0.55, -D + 0.05)
    g.add(wash)

    // Elfos: martillean en el banco; el tercero lleva cajas a la cinta.
    const elves = []
    const nElves = lvl >= 20 ? 3 : lvl >= 5 ? 2 : 1
    for (let k = 0; k < 3; k++) {
      const el = makeElf(i + k, k === 2 ? 'carry' : 'work', 1.4)
      el.position.set(k === 2 ? 0.1 : -2.55 + k * 1.0, 0, k === 2 ? -0.95 : -2.75)
      el.userData.home = el.position.clone()
      el.visible = k < nElves
      g.add(el)
      elves.push(el)
    }
    const crate = new Mesh(toyGeos[i % TOYS.length], solidMat)
    crate.scale.setScalar(1.15)
    crate.position.set(0, 0.52, 0.46)
    elves[2].add(crate)
    const boss = makeElf(0, 'boss', 1.5)
    boss.position.set(-4.1, 0, -0.85)
    boss.rotation.y = 0.4
    boss.visible = false
    g.add(boss)
    // Juguete en el banco, la cinta con sus juguetes y el montón (una sola malla instanciada).
    const wip = new Mesh(toyGeos[i % TOYS.length], solidMat)
    wip.position.set(-1.6, 0.75, -1.9)
    wip.scale.setScalar(1.1)
    g.add(wip)
    const toys = new InstancedMesh(toyGeos[i % TOYS.length], solidMat, BELT_TOYS + PILE_SLOTS.length)
    toys.frustumCulled = false
    g.add(toys)
    const beltTex = own(baseBelt.clone())
    beltTex.needsUpdate = true
    beltTex.wrapS = beltTex.wrapT = RepeatWrapping
    beltTex.repeat.set(10, 1)
    const belt = new Mesh(floorGeo, own(new MeshBasicMaterial({ map: beltTex })))
    belt.scale.set(3.4 / W, 1, 0.78 / D)
    belt.position.set(2.25, 0.612, -1.3)
    g.add(belt)
    const zz = spriteOf(emojiOnce('💤'), 1.3, -2.9, 2.9, -2.0, g, 6)
    zz.material.depthTest = false

    // Penumbra de la sala parada (un velo delante) y caja para tocarla.
    const veil = new Mesh(quadGeo, own(new MeshBasicMaterial({ color: '#040820', transparent: true, opacity: 0.5, depthWrite: false, fog: false })))
    veil.scale.set(W + 0.9, H, 1)
    veil.position.set(0, H / 2, 0.06)
    g.add(veil)
    const hit = new Mesh(boxGeo, hitMat)
    hit.scale.set(W, H, D)
    hit.position.set(0, H / 2, -D / 2)
    hit.userData.part = ['p', i]
    g.add(hit)
    building.add(g)
    return { group: g, wallMat, sideMat, lampMat, halo, wash, veil, zz, elves, boss, wip, toys, belt: beltTex, hit, anim, th, i, beltT: 0, lvl: 0, crate }
  }

  // Planta sin abrir: tablones clavados y un candado grande; el juguete que fabricará, en silueta.
  function buildLocked(i) {
    const g = new Group()
    g.position.y = i * H
    const b = makeBaker()
    b.box(0, -0.16, -D / 2 + 0.05, W + 0.8, 0.32, D + 0.3, '#2a180e')
    b.box(0, -0.08, 0.14, W + 0.95, 0.4, 0.3, '#4a2a16')
    b.box(0, 0.13, 0.3, W + 0.95, 0.05, 0.04, '#8a6a2a')
    for (const x of [X0 - 0.15, W / 2 + 0.1]) for (let s = 0; s < 8; s++) b.cyl(x, ((s + 0.5) * H) / 8, 0.12, 0.17, H / 8 + 0.005, s % 2 ? '#b8b4a8' : '#8a2a2a')
    const R = rng(i + 30)
    for (let k = 0; k < 6; k++) b.box(0, 0.4 + k * 0.56, 0.3, W + 0.1, 0.4, 0.1, k % 2 ? WOOD : WOODD, 0, 0, (R() - 0.5) * 0.05)
    for (const x of [-3.4, 3.4]) b.box(x, H / 2, 0.38, 0.4, H - 0.3, 0.12, '#3a2212')
    for (const x of [-3.4, 3.4]) for (let k = 0; k < 5; k++) b.sph(x, 0.5 + k * 0.6, 0.46, 0.06, 0.06, 0.04, STEEL)
    // El candado.
    b.ring(0, H / 2 + 0.55, 0.62, 0.32, 0.09, '#c9d2de', 0, 0, 0, 1.2)
    b.box(0, H / 2 - 0.1, 0.62, 1.0, 0.85, 0.34, GOLD)
    b.cyl(0, H / 2 - 0.05, 0.8, 0.12, 0.05, '#3a2a10', Math.PI / 2)
    b.box(0, H / 2 - 0.28, 0.8, 0.07, 0.3, 0.05, '#3a2a10')
    for (const sd of [-1, 1]) b.bar(sd * 0.5, H / 2 - 0.1, 0.7, sd * 3.2, H / 2 + 0.7 * sd, 0.55, 0.05, '#8a8e98')
    g.add(new Mesh(own(b.build()), solidMat))
    const dark = new Mesh(wallGeo, own(new MeshLambertMaterial({ color: '#1c1612' })))
    dark.position.set(0, H / 2, -D)
    const dl = new Mesh(sideGeo, dark.material)
    dl.position.set(X0, H / 2, -D / 2)
    const df = new Mesh(floorGeo, own(new MeshLambertMaterial({ color: '#14100c' })))
    df.position.set(0, 0.012, -D / 2)
    g.add(dark, dl, df)
    const icon = spriteOf(emojiOnce(PLANTAS[i % PLANTAS.length].icon), 2.0, 2.6, H / 2, -2.0, g, 1)
    icon.material.opacity = 0.35
    const veil = new Mesh(quadGeo, own(new MeshBasicMaterial({ color: '#030614', transparent: true, opacity: 0.45, depthWrite: false, fog: false })))
    veil.scale.set(W + 0.9, H, 1)
    veil.position.set(0, H / 2, 0.02)
    g.add(veil)
    building.add(g)
    return { group: g }
  }

  // ---------- ático, terraza, hueco del montacargas, sótano ----------
  const plankWallTex = keep(planks())
  plankWallTex.wrapS = plankWallTex.wrapT = RepeatWrapping
  plankWallTex.repeat.set(2, 1.4)
  const plankWallMat = keep(new MeshLambertMaterial({ map: plankWallTex, color: '#d8b8a0', emissive: new Color('#ffcf90'), emissiveIntensity: 0.12 }))
  const storeSlots = []
  {
    const nx = [9, 8, 6, 4, 2]
    const nz = [4, 3, 3, 2, 1]
    for (let l = 0; l < 5; l++) for (let z = 0; z < nz[l]; z++) for (let x = 0; x < nx[l]; x++) storeSlots.push([-3.0 + (9 - nx[l]) * 0.26 + x * 0.52, 0.26 + l * 0.5, -2.1 - (z + (l > 2 ? 0.6 : 0)) * 0.55])
  }
  const STORE_MAX = storeSlots.length
  let atticY = 0
  let terraceY = 0
  let topExt = 0
  let atticInfo = null
  let terraceInfo = null
  let shaftInfo = null
  let chimneyTop = new Vector3()
  const bulbsList = []
  const rowFrame = (b, wood = '#3b2213', facade = '#5b3319', trim = GOLD, poles = true) => {
    b.box(0, -0.16, -D / 2 + 0.05, W + 0.8, 0.32, D + 0.3, wood)
    b.box(0, -0.08, 0.14, W + 0.95, 0.4, 0.3, facade)
    b.box(0, 0.13, 0.3, W + 0.95, 0.05, 0.04, trim)
    if (poles) for (const x of [X0 - 0.15, W / 2 + 0.1]) for (let s = 0; s < 8; s++) b.cyl(x, ((s + 0.5) * H) / 8, 0.12, 0.17, H / 8 + 0.005, s % 2 ? '#f4f1ea' : '#d6303c')
  }
  const firTree = (b, x, y, z, s) => {
    b.cyl(x, y + 0.2 * s, z, 0.14 * s, 0.4 * s, '#4a2f1c')
    for (let k = 0; k < 3; k++) {
      b.cone(x, y + (0.9 + k * 0.62) * s, z, (0.95 - k * 0.25) * s, 1.1 * s, '#1f6a3e')
      b.cone(x, y + (1.0 + k * 0.62) * s, z, (0.7 - k * 0.19) * s, 0.8 * s, '#e6eefb')
    }
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4
      const f = k / 9
      b.sph(x + Math.cos(a) * (0.75 - f * 0.55) * s, y + (0.7 + f * 1.5) * s, z + Math.sin(a) * (0.75 - f * 0.55) * s + 0.05, 0.07 * s, 0.07 * s, 0.07 * s, BULBS[k % 5])
    }
  }

  function buildAttic(A) {
    const g = new Group()
    g.position.y = A * H
    const b = makeBaker()
    rowFrame(b)
    // Estantes con cajas de regalo, barriles y sacos.
    const R = rng(77)
    for (const y of [1.0, 1.95, 2.9]) {
      b.box(-3.6, y, -D + 0.32, 2.6, 0.08, 0.64, WOOD)
      for (let k = 0; k < 6; k++) {
        const col = PRESENTS[Math.floor(R() * PRESENTS.length)]
        const sz = 0.34 + R() * 0.2
        b.box(-4.6 + k * 0.42, y + 0.04 + sz / 2, -D + 0.32, sz, sz, sz, col)
        b.box(-4.6 + k * 0.42, y + 0.04 + sz / 2, -D + 0.32, sz + 0.02, sz + 0.02, 0.07, GOLD)
      }
    }
    for (const [x, z] of [[4.5, -4.5], [3.7, -4.7]]) {
      b.cyl(x, 0.5, z, 0.4, 1.0, '#7a4a28')
      b.cyl(x, 0.3, z, 0.42, 0.06, STEELD)
      b.cyl(x, 0.75, z, 0.42, 0.06, STEELD)
    }
    for (const [x, z, s] of [[4.4, -3.2, 1], [3.6, -3.5, 0.8]]) {
      b.sph(x, 0.5 * s, z, 0.55 * s, 0.5 * s, 0.5 * s, '#9a7a4a')
      b.cone(x, 1.0 * s, z, 0.2 * s, 0.4 * s, '#9a7a4a')
      b.sph(x, 0.95 * s, z, 0.12 * s, 0.08 * s, 0.12 * s, '#d6303c')
    }
    b.box(0, 0.76, -D + 0.5, 0.1, 1.4, 0.1, WOODD)
    g.add(new Mesh(own(b.build()), solidMat))
    const back = new Mesh(wallGeo, plankWallMat)
    back.position.set(0, H / 2, -D)
    const left = new Mesh(sideGeo, plankWallMat)
    left.position.set(X0, H / 2, -D / 2)
    const floor = new Mesh(floorGeo, floorMat)
    floor.position.set(0, 0.012, -D / 2)
    g.add(back, left, floor)
    const sign = new Mesh(quadGeo, own(new MeshBasicMaterial({ map: emojiOnce('📦', '#e0b54e'), transparent: true, fog: false })))
    sign.scale.setScalar(1.2)
    sign.position.set(-0.3, 2.9, -D + 0.05)
    g.add(sign)
    haloOf('#ffd9a8', 7, 0.45, -0.5, H - 0.8, -2.4, g)
    const lamp = new Mesh(own(new SphereGeometry(0.16, 12, 8)), glowMat('#fff0c0', 3))
    lamp.position.set(-0.5, H - 0.75, -2.4)
    g.add(lamp)
    // El almacén: cajas apiladas según lo guardado (instancias).
    const store = new InstancedMesh(boxGeo, own(new MeshLambertMaterial({ color: '#ffffff' })), STORE_MAX)
    store.frustumCulled = false
    const dm = new Object3D()
    const RS = rng(5)
    storeSlots.forEach(([x, y, z], k) => {
      dm.position.set(x, y, z)
      dm.rotation.set(0, (RS() - 0.5) * 0.3, 0)
      dm.scale.setScalar(0.5)
      dm.updateMatrix()
      store.setMatrixAt(k, dm.matrix)
      store.setColorAt(k, new Color(PRESENTS[k % PRESENTS.length]))
    })
    store.count = 0
    g.add(store)
    const clerk = makeElf(3, 'carry', 1.3)
    clerk.position.set(-1.2, 0, -0.9)
    clerk.rotation.y = 0.3
    g.add(clerk)
    const hit = new Mesh(boxGeo, hitMat)
    hit.scale.set(W, H, D)
    hit.position.set(0, H / 2, -D / 2)
    g.add(hit)
    building.add(g)
    atticInfo = { group: g, store, clerk }
    // Guirnaldas bajo cada forjado.
  }

  function buildTerrace(row, A) {
    const g = new Group()
    g.position.y = row * H
    const b = makeBaker()
    rowFrame(b, '#3b2213', '#5b3319', GOLD, false)
    b.box(0.35, 0.09, -D / 2 + 0.05, W + 0.5, 0.2, D + 0.2, SNOW)
    // Casita del trineo con tejado nevado y chimenea.
    b.box(-3.8, 1.2, -4.0, 2.4, 2.4, 2.4, '#8a5230')
    for (let k = 0; k < 7; k++) b.box(-3.8, 0.3 + k * 0.32, -2.79, 2.4, 0.03, 0.02, '#5a3a22')
    b.pyr(-3.8, 3.2, -4.0, 2.2, 1.6, '#a8282e')
    b.pyr(-3.8, 3.3, -4.0, 2.08, 1.55, SNOW)
    b.box(-4.5, 3.7, -4.7, 0.62, 1.6, 0.62, '#8a3a2a')
    b.box(-4.5, 4.55, -4.7, 0.78, 0.16, 0.78, SNOW)
    for (let k = 0; k < 4; k++) b.box(-4.5, 3.0 + k * 0.4, -4.38, 0.62, 0.03, 0.02, '#5a2418')
    b.box(-4.35, 1.4, -2.74, 0.95, 0.9, 0.1, WOODD)
    b.box(-4.35, 1.4, -2.72, 0.05, 0.9, 0.12, WOODD)
    b.box(-4.35, 1.4, -2.72, 0.95, 0.05, 0.12, WOODD)
    b.box(-4.35, 0.88, -2.64, 1.15, 0.1, 0.3, SNOW)
    b.box(-3.3, 0.9, -2.76, 0.7, 1.6, 0.08, '#4a2a16')
    b.sph(-3.1, 0.9, -2.7, 0.05, 0.05, 0.05, GOLD)
    // Barandilla de caramelo con nieve encima.
    for (let x = -1.2; x <= 5.3; x += 0.85) b.cyl(x, 0.3, 0.3, 0.07, 0.4, Math.round((x + 1.2) / 0.85) % 2 ? '#f4f1ea' : '#d6303c')
    b.box(2.05, 0.2, 0.3, 6.8, 0.05, 0.1, WOODL)
    b.box(-1.25, 0.6, -0.9, 0.12, 1.0, 1.8, '#5a3a22')
    // Abeto de la terraza, farola y pista de aterrizaje.
    firTree(b, 4.95, 0.15, -4.2, 0.9)
    b.cyl(-1.9, 1.2, -0.5, 0.06, 2.4, '#2a2c38')
    for (const z of [-1.6, -3.0]) b.box(1.1, 0.2, z, 8.4, 0.025, 0.07, GOLD)
    g.add(new Mesh(own(b.build()), solidMat))
    const star = new Mesh(own(new SphereGeometry(0.16, 8, 6)), glowMat('#ffd34a', 3.5))
    star.position.set(4.95, 0.15 + 0.9 * 2.55, -4.2)
    g.add(star)
    haloOf('#ffd34a', 1.6, 0.6, star.position.x, star.position.y, star.position.z, g)
    const lampBulb = new Mesh(own(new SphereGeometry(0.28, 10, 8)), glowMat('#ffe0a0', 3.2))
    lampBulb.position.set(-1.9, 2.5, -0.5)
    g.add(lampBulb)
    haloOf('#ffbe66', 5, 0.6, -1.9, 2.5, -0.5, g)
    const win = new Mesh(quadGeo, glowMat('#ffc060', 1.9))
    win.scale.set(0.82, 0.72, 1)
    win.position.set(-4.35, 1.4, -2.66)
    g.add(win)
    haloOf('#ffb050', 3.4, 0.45, -4.35, 1.4, -2.5, g)
    // Casa de máquinas encima del hueco: la polea del montacargas.
    const mb = makeBaker()
    mb.box(SHAFT_CX, 1.1, -D + 0.35, SHAFT_W + 0.3, 2.2, 0.12, '#5a3a22')
    for (const x of [SHAFT_X0 + 0.05, SHAFT_X0 + SHAFT_W - 0.05]) for (const z of [0.0, -D + 0.45]) mb.box(x, 1.1, z, 0.2, 2.2, 0.2, WOODD)
    mb.pyr(SHAFT_CX, 3.0, -2.4, 2.35, 1.5, '#a8282e')
    mb.pyr(SHAFT_CX, 3.1, -2.4, 2.22, 1.42, SNOW)
    mb.box(SHAFT_CX, 2.18, -1.2, SHAFT_W + 0.3, 0.14, 0.14, WOODD)
    mb.box(SHAFT_CX, 0.12, -2.4, SHAFT_W + 0.5, 0.1, D - 0.6, '#6a4a2a')
    g.add(new Mesh(own(mb.build()), solidMat))
    const pulley = new Mesh(own((() => {
      const pb = makeBaker()
      pb.ring(0, 0, 0, 0.55, 0.1, GOLD)
      pb.cyl(0, 0, 0, 0.12, 0.3, STEELD, Math.PI / 2)
      for (let s = 0; s < 3; s++) pb.box(0, 0, 0, 1.1, 0.07, 0.07, GOLD, 0, 0, s * 1.047)
      return pb.build()
    })()), solidMat)
    pulley.position.set(SHAFT_CX, 1.45, -2.8)
    g.add(pulley)
    // Zona táctil del trineo (toda la terraza).
    const hit = new Mesh(boxGeo, hitMat)
    hit.scale.set(14, H + 0.6, D)
    hit.position.set(1.3, (H + 0.6) / 2, -D / 2)
    hit.userData.part = ['s']
    g.add(hit)
    // El encargado del trineo, junto a la casita.
    const boss = makeElf(0, 'boss', 1.5)
    boss.position.set(-3.7, 0.2, -1.2)
    boss.rotation.y = 0.3
    boss.visible = false
    g.add(boss)
    building.add(g)
    chimneyTop = new Vector3(-4.5, row * H + 4.8, -4.7)
    terraceInfo = { group: g, pulley, boss, hit }
    // Luces: pista de aterrizaje y barandilla.
    for (let k = 0; k < 11; k++) for (const z of [-1.6, -3.0]) bulbsList.push(new Vector3(-3 + k * 0.8, row * H + 0.28, z))
    for (let x = -1.2; x <= 5.3; x += 0.54) bulbsList.push(new Vector3(x, row * H + 0.5, 0.4))
    void A
  }

  // Sótano con el cabrestante, hueco del montacargas y la jaula.
  function buildShaft(A) {
    const g = new Group()
    building.add(g)
    const rows = A + 1
    const top = rows * H
    const b = makeBaker()
    // Cimientos de piedra bajo las salas, con ventanitas de sótano.
    b.box(-0.25, -BASE / 2, -D / 2 + 0.1, W + 1.1, BASE, D + 0.5, '#5d6275')
    for (let k = 1; k < 3; k++) b.box(-0.25, -BASE + (k * BASE) / 3, 0.36, W + 1.1, 0.045, 0.02, '#363b4c')
    for (let c = 0; c < 3; c++) for (let x = -5.2 + (c % 2) * 0.5; x < 5.1; x += 1.0) b.box(x, -BASE + (c + 0.5) * (BASE / 3), 0.36, 0.045, BASE / 3, 0.02, '#363b4c')
    b.box(-0.25, 0.03, 0.3, W + 1.2, 0.1, 0.5, SNOW)
    for (const x of [-3.5, -0.5, 2.5]) {
      b.box(x, -BASE / 2, 0.38, 1.2, 0.95, 0.08, '#2a2c38')
      b.box(x, -BASE / 2 - 0.5, 0.42, 1.4, 0.1, 0.18, SNOW)
    }
    // Hueco: columnas, forjados y pared exterior derecha.
    const sx = SHAFT_X0 + SHAFT_W
    for (const x of [SHAFT_X0 - 0.05, sx + 0.1]) for (const z of [0.1, -D + 0.5]) b.box(x, (top - BASE) / 2, z, 0.22, top + BASE, 0.22, WOODD)
    for (let r = 0; r <= rows; r++) {
      b.box(SHAFT_CX, r * H - 0.16, -D / 2 + 0.2, SHAFT_W + 0.4, 0.32, D - 0.1, '#3b2213')
      b.box(SHAFT_CX, r * H - 0.08, 0.14, SHAFT_W + 0.45, 0.4, 0.3, '#5b3319')
      b.box(SHAFT_CX, r * H + 0.13, 0.3, SHAFT_W + 0.45, 0.05, 0.04, GOLD)
    }
    b.box(sx + 0.35, (top - BASE) / 2 + 0.1, -D / 2 + 0.2, 0.2, top + BASE, D, '#7a4a2a')
    for (let k = 0; k < top / 0.55; k++) b.box(sx + 0.46, k * 0.55, -D / 2 + 0.2, 0.02, 0.05, D, '#5a3418')
    for (let s = 0; s < rows * 8; s++) b.cyl(sx + 0.25, ((s + 0.5) * H) / 8, 0.12, 0.17, H / 8 + 0.005, s % 2 ? '#f4f1ea' : '#d6303c')
    for (const dx of [-0.75, 0.75]) b.box(SHAFT_CX + dx, (top - BASE) / 2, -D + 0.75, 0.1, top + BASE, 0.1, STEELD)
    // Sótano: motor y cabrestante.
    b.box(SHAFT_CX, -BASE + 0.15, -D / 2 + 0.2, SHAFT_W + 0.3, 0.3, D - 0.2, '#2a2430')
    b.box(SHAFT_CX + 0.6, -BASE + 0.65, -4.2, 0.9, 0.9, 0.9, '#46506a')
    b.cyl(SHAFT_CX + 0.6, -BASE + 1.2, -4.2, 0.25, 0.2, STEEL)
    g.add(new Mesh(own(b.build()), solidMat))
    const dark = new Mesh(own(new PlaneGeometry(SHAFT_W + 0.3, top + BASE)), own(new MeshLambertMaterial({ color: '#4a3222', emissive: new Color('#ffb070'), emissiveIntensity: 0.14 })))
    dark.position.set(SHAFT_CX, (top - BASE) / 2, -D + 0.35)
    g.add(dark)
    const cellar = new Mesh(own(new PlaneGeometry(SHAFT_W + 0.3, BASE)), own(new MeshLambertMaterial({ color: '#1c1822', emissive: new Color('#ffb04a'), emissiveIntensity: 0.18 })))
    cellar.position.set(SHAFT_CX, -BASE / 2, -D + 0.4)
    g.add(cellar)
    const drum = new Mesh(own((() => {
      const db = makeBaker()
      db.cyl(0, 0, 0, 0.5, 1.5, '#7a4a28', 0, 0, Math.PI / 2)
      for (let k = 0; k < 7; k++) db.cyl(-0.7 + k * 0.23, 0, 0, 0.52, 0.04, '#2a2c38', 0, 0, Math.PI / 2)
      db.box(0, 0, 0, 1.7, 0.1, 0.1, GOLD)
      db.box(0, 0, 0, 1.7, 0.1, 0.1, GOLD, 1.57)
      return db.build()
    })()), solidMat)
    drum.position.set(SHAFT_CX - 0.2, -BASE + 0.95, -3.2)
    g.add(drum)
    const lampC = new Mesh(own(new SphereGeometry(0.14, 8, 6)), glowMat('#ffb04a', 3))
    lampC.position.set(SHAFT_CX - 0.9, -0.5, -2.2)
    g.add(lampC)
    haloOf('#ffb04a', 3, 0.5, lampC.position.x, lampC.position.y, lampC.position.z, g)
    // La jaula.
    const car = new Group()
    car.position.set(SHAFT_CX, 0.1, -2.8)
    const cb = makeBaker()
    cb.box(0, 0.05, 0, 2.1, 0.12, 2.3, WOODL)
    for (const x of [-1.0, 1.0]) for (const z of [-1.1, 1.1]) cb.box(x, 1.0, z, 0.08, 2.0, 0.08, GOLD)
    for (const x of [-1.0, 1.0]) {
      cb.box(x, 0.55, 0, 0.06, 0.06, 2.2, GOLD)
      cb.box(x, 1.25, 0, 0.06, 0.06, 2.2, GOLD)
    }
    cb.box(0, 0.55, 1.1, 2.0, 0.06, 0.06, GOLD)
    cb.box(0, 2.05, 0, 2.2, 0.1, 2.4, WOODD)
    cb.box(0, 2.3, 0, 0.08, 0.5, 0.08, STEELD)
    car.add(new Mesh(own(cb.build()), solidMat))
    const carLamp = new Mesh(own(new SphereGeometry(0.15, 8, 6)), glowMat('#fff0c0', 3))
    carLamp.position.set(0, 1.9, 0.9)
    car.add(carLamp)
    const crates = [[-0.5, 0.11, 0.3, 1.5], [0.2, 0.11, 0.6, 1.3], [-0.2, 0.11, -0.4, 1.4], [-0.35, 0.65, 0.25, 1.1]].map(([x, y, z, s], k) => {
      const m = new Mesh(toyGeos[0], solidMat)
      m.position.set(x, y, z)
      m.scale.setScalar(s * 0.9)
      m.rotation.y = k
      car.add(m)
      return m
    })
    const operator = makeElf(1, 'boss', 1.25)
    operator.position.set(0.55, 0.11, -0.2)
    operator.rotation.y = -0.3
    operator.visible = false
    car.add(operator)
    g.add(car)
    const cable = new Mesh(boxGeo, own(new MeshBasicMaterial({ color: '#15110e' })))
    cable.scale.set(0.07, 1, 0.07)
    g.add(cable)
    const hit = new Mesh(boxGeo, hitMat)
    hit.scale.set(SHAFT_W + 0.5, top + BASE, D)
    hit.position.set(SHAFT_CX, (top - BASE) / 2, -D / 2)
    hit.userData.part = ['e']
    g.add(hit)
    shaftInfo = { group: g, car, crates, operator, cable, drum, hit, top }
    for (let r = 0; r <= A; r++) bulbsList.push(new Vector3(SHAFT_X0 + 0.2, r * H + 2.9, 0.4), new Vector3(sx - 0.1, r * H + 2.9, 0.4))
  }

  // Guirnaldas bajo cada forjado (en la fachada, tres festones por planta).
  function addGarlands(rows) {
    for (let r = 0; r < rows; r++) {
      for (let s = 0; s < 3; s++) {
        for (let k = 0; k <= 4; k++) {
          const u = k / 4
          const x0 = X0 - 0.2 + s * 3.5
          bulbsList.push(new Vector3(x0 + u * 3.5, (r + 1) * H - 0.34 - Math.sin(u * Math.PI) * 0.32, 0.5))
        }
      }
    }
  }

  // El trineo con dos renos (se construye una vez; se recoloca al reconstruir el edificio).
  const sleigh = new Group()
  const sleighGallop = []
  let rudolph = null
  {
    const sb = makeBaker()
    sb.box(0, 0.5, 0, 2.1, 0.12, 1.0, '#a8161f')
    for (const z of [-0.5, 0.5]) {
      sb.box(0, 0.8, z, 2.0, 0.5, 0.1, '#c8202a')
      sb.box(0, 1.07, z, 2.05, 0.06, 0.12, GOLD)
    }
    sb.box(-1.0, 1.0, 0, 0.14, 1.0, 1.1, '#c8202a')
    sb.box(-1.0, 1.52, 0, 0.18, 0.06, 1.14, GOLD)
    sb.box(0.98, 0.85, 0, 0.1, 0.7, 1.0, '#c8202a')
    sb.sph(1.0, 1.25, 0, 0.14, 0.14, 0.4, GOLD)
    sb.box(-0.35, 0.65, 0, 0.9, 0.2, 0.9, '#3a2a8a')
    for (const z of [-0.45, 0.45]) {
      sb.bar(-1.15, 0.2, z, 1.3, 0.2, z, 0.05, GOLD)
      sb.ring(1.3, 0.42, z, 0.22, 0.05, GOLD)
      sb.bar(-0.6, 0.2, z, -0.6, 0.5, z, 0.04, GOLD)
      sb.bar(0.6, 0.2, z, 0.6, 0.5, z, 0.04, GOLD)
    }
    sb.sph(-0.8, 1.25, 0, 0.5, 0.55, 0.5, '#8a3a9a')
    sb.cone(-0.8, 1.7, 0, 0.18, 0.4, '#8a3a9a')
    sb.box(-0.55, 1.3, 0.35, 0.3, 0.3, 0.3, '#2f9e5a')
    sb.box(-0.9, 1.65, -0.2, 0.28, 0.28, 0.28, '#2f6fd6')
    // Papá Noel.
    sb.sph(0.15, 1.0, 0, 0.36, 0.4, 0.34, '#d6303c')
    sb.box(0.15, 0.95, 0.0, 0.76, 0.1, 0.7, '#22252b')
    sb.sph(0.18, 1.52, 0, 0.21, 0.21, 0.2, SKIN)
    sb.sph(0.3, 1.4, 0, 0.18, 0.2, 0.18, '#ffffff')
    sb.cone(0.12, 1.87, 0, 0.21, 0.5, '#d6303c', 0, 0, 0.35)
    sb.ring(0.18, 1.67, 0, 0.21, 0.06, '#ffffff', Math.PI / 2)
    sb.sph(-0.02, 2.05, 0, 0.08, 0.08, 0.08, '#ffffff')
    sb.sph(0.37, 1.55, 0.09, 0.025, 0.025, 0.025, '#111')
    sb.sph(0.37, 1.55, -0.09, 0.025, 0.025, 0.025, '#111')
    sb.bar(0.3, 1.0, 0.3, 1.0, 1.0, 0.25, 0.04, '#d6303c')
    sb.bar(0.3, 1.0, -0.3, 1.0, 1.0, -0.25, 0.04, '#d6303c')
    // Arneses de los renos.
    for (const z of [-0.2, 0.2]) {
      sb.bar(1.1, 0.9, z, 2.2, 0.95, z, 0.018, GOLD)
      sb.bar(2.4, 0.95, z, 3.5, 0.95, z, 0.018, GOLD)
    }
    sleigh.add(new Mesh(keep(sb.build()), solidMat))
    const deerBody = makeBaker()
    const col = '#8a5a32'
    deerBody.sph(0, 0.95, 0, 0.6, 0.34, 0.28, col)
    deerBody.sph(0.3, 0.92, 0, 0.3, 0.3, 0.3, '#e8d0a8')
    deerBody.bar(0.42, 1.05, 0, 0.78, 1.45, 0, 0.13, col)
    deerBody.sph(0.85, 1.5, 0, 0.24, 0.2, 0.18, col)
    deerBody.sph(1.05, 1.42, 0, 0.14, 0.1, 0.1, '#6a3a1a')
    deerBody.sph(-0.62, 1.05, 0, 0.1, 0.1, 0.1, '#ffffff')
    for (const z of [-0.1, 0.1]) {
      deerBody.bar(0.8, 1.64, z, 0.7, 2.0, z * 2, 0.025, '#e0cfa0')
      deerBody.bar(0.74, 1.85, z * 1.5, 0.95, 2.05, z * 2, 0.02, '#e0cfa0')
      deerBody.bar(0.72, 1.75, z * 1.5, 0.45, 2.0, z * 2.2, 0.02, '#e0cfa0')
      deerBody.sph(0.88, 1.56, z * 1.6, 0.05, 0.1, 0.05, col)
      deerBody.sph(0.95, 1.55, z * 1.7, 0.03, 0.03, 0.02, '#111')
    }
    deerBody.box(0.9, 1.5, 0, 0.02, 0.02, 0.01, '#111')
    const deerGeo = keep(deerBody.build())
    const legB = makeBaker()
    legB.box(0, -0.3, 0, 0.1, 0.6, 0.1, col)
    legB.box(0, -0.62, 0.0, 0.12, 0.08, 0.14, '#3a2212')
    const legGeo = keep(legB.build())
    for (let k = 0; k < 2; k++) {
      const deer = new Group()
      deer.position.set(2.1 + k * 1.5, 0, 0)
      deer.add(new Mesh(deerGeo, solidMat))
      const legs = []
      for (const [x, z] of [[-0.4, -0.15], [-0.4, 0.15], [0.4, -0.15], [0.4, 0.15]]) {
        const pivot = new Group()
        pivot.position.set(x, 0.75, z)
        pivot.add(new Mesh(legGeo, solidMat))
        deer.add(pivot)
        legs.push(pivot)
      }
      if (k === 1) {
        rudolph = new Mesh(keep(new SphereGeometry(0.08, 8, 6)), glowMat('#ff2a2a', 4))
        rudolph.position.set(1.14, 1.42, 0)
        deer.add(rudolph)
        deer.userData.nose = haloOf('#ff3030', 0.9, 0.8, 1.16, 1.42, 0, deer)
      }
      sleigh.add(deer)
      sleighGallop.push({ deer, legs, k })
    }
    sleigh.scale.setScalar(1.5)
    scene.add(sleigh)
  }
  const sleighHome = new Vector3()
  const sleighHit = new Mesh(boxGeo, hitMat)
  sleighHit.userData.part = ['s']
  sleighHit.scale.set(9, 4.2, 3)
  scene.add(sleighHit)

  let bulbs = null
  let bulbsCount = 0
  const bulbTmp = new Color()
  const bulbGeo = keep(new SphereGeometry(0.1, 8, 6))
  const bulbMat = keep(new MeshBasicMaterial({ color: '#ffffff', fog: false }))
  let rooms = []
  let lockedRow = null
  let levelsNow = 0
  let hasLockedNow = false

  function clearBuilding() {
    building.clear()
    owned.forEach((x) => x.dispose?.())
    owned = []
    rooms = []
    lockedRow = null
    atticInfo = terraceInfo = shaftInfo = null
  }

  function rebuild(levels, hasLocked) {
    clearBuilding()
    bulbsList.length = 0
    levelsNow = levels
    hasLockedNow = hasLocked
    for (let i = 0; i < levels; i++) rooms.push(buildRoom(i, 1))
    if (hasLocked) lockedRow = buildLocked(levels)
    const A = levels + (hasLocked ? 1 : 0)
    buildAttic(A)
    buildTerrace(A + 1, A)
    buildShaft(A)
    addGarlands(A + 1)
    atticY = A * H
    terraceY = (A + 1) * H
    topExt = terraceY + 6.4
    sleighHome.set(-1.5, terraceY + 0.25, -2.3)
    sleighHit.position.set(1.5, terraceY + 1.6, -2.4)
    if (bulbs) {
      scene.remove(bulbs)
      bulbs.dispose()
    }
    const all = [...bulbsList, ...bulbsStatic]
    bulbsCount = all.length
    bulbs = new InstancedMesh(bulbGeo, bulbMat, bulbsCount)
    bulbs.frustumCulled = false
    const m = new Matrix4()
    all.forEach((p, k) => {
      bulbs.setMatrixAt(k, m.makeTranslation(p.x, p.y, p.z))
      bulbs.setColorAt(k, bulbTmp.set(BULBS[k % BULBS.length]))
    })
    scene.add(bulbs)
  }

  // ---------- partículas: chispas, humo, nieve y galletas ----------
  const sparks = makeParticles(reduced ? 200 : coarse ? 500 : 900, true)
  const smoke = makeParticles(reduced ? 40 : 140, false)
  scene.add(sparks.points, smoke.points)
  const SNOW_TOP = 60
  const snowN = reduced ? 0 : coarse ? 500 : 1100
  const snowPos = new Float32Array(Math.max(1, snowN) * 3)
  {
    const R = rng(8)
    for (let i = 0; i < snowN; i++) snowPos.set([(R() - 0.5) * 100, -BASE + R() * SNOW_TOP, (R() - 0.5) * 50 + 2], i * 3)
  }
  const snowGeo = keep(new BufferGeometry())
  snowGeo.setAttribute('position', new BufferAttribute(snowPos, 3).setUsage(DynamicDrawUsage))
  const snowPtMat = keep(
    new ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: 'uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, 0.16 * uScale / -mv.z); }',
      fragmentShader: 'void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, (1.0 - d) * 0.8); }',
      transparent: true,
      depthWrite: false,
    }),
  )
  const snow = new Points(snowGeo, snowPtMat)
  snow.frustumCulled = false
  if (snowN) scene.add(snow)
  // Galletas que saltan al repartir.
  const cookies = Array.from({ length: 14 }, () => {
    const s = new Sprite(new SpriteMaterial({ map: cookieTex, transparent: true, depthWrite: false }))
    s.visible = false
    s.scale.setScalar(0.9)
    s.renderOrder = 9
    scene.add(s)
    return { s, t: 9, v: new Vector3() }
  })

  // ---------- resaltados: bajo el puntero, al tocar o mejorar, y el cuello de botella ----------
  const addMat = (color, opacity = 0) => keep(new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false }))
  const hoverMat = addMat('#ffffff')
  const flashMat = addMat('#ffe9a0')
  const neckWashMat = addMat('#ff2a2a')
  const neckBarMat = addMat('#ff3a3a')
  const neckGlowMat = addMat('#ff5a3a')
  const hoverQuad = new Mesh(quadGeo, hoverMat)
  const flashQuad = new Mesh(quadGeo, flashMat)
  const neckWash = new Mesh(quadGeo, neckWashMat)
  for (const m of [hoverQuad, flashQuad, neckWash]) {
    m.renderOrder = 8
    m.visible = false
    scene.add(m)
  }
  const neckFrame = new Group()
  for (let k = 0; k < 4; k++) neckFrame.add(new Mesh(boxGeo, neckBarMat))
  for (let k = 0; k < 4; k++) neckFrame.add(new Mesh(boxGeo, neckGlowMat))
  neckFrame.children.forEach((m) => (m.renderOrder = 8))
  neckFrame.visible = false
  scene.add(neckFrame)
  const warn = new Sprite(new SpriteMaterial({ map: emojiOnce('⚠️'), transparent: true, depthWrite: false, depthTest: false }))
  warn.renderOrder = 10
  warn.visible = false
  scene.add(warn)
  function frameRect(x, y, w, h, z) {
    const set = (m, mx, my, sx, sy) => {
      m.position.set(mx, my, z)
      m.scale.set(sx, sy, 0.12)
    }
    const c = neckFrame.children
    for (const [o, t] of [[0, 0.16], [4, 0.5]]) {
      set(c[o], x + w / 2, y + h, w + t, t)
      set(c[o + 1], x + w / 2, y, w + t, t)
      set(c[o + 2], x, y + h / 2, t, h + t)
      set(c[o + 3], x + w, y + h / 2, t, h + t)
    }
  }
  // Rectángulo (en el plano de la fachada) de cada parte.
  const rectOf = (part, i = 0) => {
    if (part === 'p') return { x: X0 - 0.35, y: i * H, w: W + 0.7, h: H }
    if (part === 'e') return { x: SHAFT_X0 - 0.25, y: -BASE, w: SHAFT_W + 0.5, h: atticY + H + BASE }
    return { x: X0 - 0.35, y: terraceY, w: SHAFT_X0 + SHAFT_W - X0 + 0.7, h: H + 0.6 }
  }
  const parseFlash = (f) => {
    if (!f) return null
    if (f === 'unlock') return ['p', Math.max(0, levelsNow - 1)]
    if (f === 'e' || f === 's') return [f, 0]
    return [f[0], Number(f.slice(1)) || 0]
  }

  // ---------- puntero ----------
  const ray = new Raycaster()
  const ndc = new Vector2()
  let pointer = null
  let hovered = null
  const partAt = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const targets = [...rooms.map((rm) => rm.hit), shaftInfo?.hit, terraceInfo?.hit, sleighHit].filter(Boolean)
    const hit = ray.intersectObjects(targets, false)[0]
    return hit ? hit.object.userData.part : null
  }
  const onMove = (e) => {
    pointer = e.pointerType === 'mouse' ? [e.clientX, e.clientY] : null
  }
  const onLeave = () => {
    pointer = null
  }
  let elapsed = 0
  const pulse = { part: null, i: 0, t: -10 }
  const burst = (part, i) => {
    pulse.part = part
    pulse.i = i
    pulse.t = elapsed
    const r = rectOf(part, i)
    for (let k = 0; k < (reduced ? 6 : 26); k++) {
      const a = Math.random() * TAU
      sparks.spawn(r.x + Math.random() * r.w, r.y + Math.random() * r.h, 0.6, Math.cos(a) * 2.2, 1.5 + Math.random() * 2.5, 0.3, 0.7 + Math.random() * 0.5, 0.3, [2.4, 1.9, 0.6])
    }
  }
  const onClick = (e) => {
    const part = partAt(e.clientX, e.clientY)
    if (!part) return
    burst(part[0], part[1] ?? 0)
    onTap?.(part[0], part[1])
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('click', onClick)

  // ---------- postproceso ----------
  const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: coarse ? 0 : 4 })
  const composer = new EffectComposer(renderer, rt)
  composer.setPixelRatio(prCap)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.42, 0.55, 1.05)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  let w = 1
  let h = 1
  let side = 0 // fracción del ancho reservada a la izquierda para las fichas
  let fitDirty = true
  function resize(reserve = side) {
    side = reserve
    const rect = host.getBoundingClientRect()
    w = Math.max(1, Math.round(rect.width))
    h = Math.max(1, Math.round(rect.height))
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    fitDirty = true
  }
  resize()

  // ---------- cámara: casi de frente, con un poco de perspectiva; encuadra todo el edificio en la parte libre ----------
  const fitDir = new Vector3(0.2, 0.03, 1).normalize()
  const camPos = new Vector3()
  const camTarget = new Vector3()
  const goalPos = new Vector3()
  const goalTarget = new Vector3()
  const tmp = new Vector3()
  const corners = Array.from({ length: 8 }, () => new Vector3())
  const camRight = new Vector3()
  const camUp = new Vector3()
  let firstFit = true
  function fitCamera() {
    fitDirty = false
    const minX = -6.3
    const maxX = SHAFT_X0 + SHAFT_W + 0.9
    const minY = -BASE - 0.3
    const maxY = topExt
    let n = 0
    for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [-D - 0.2, 0.8]) corners[n++].set(x, y, z)
    const xl = -1 + 2 * side + 0.03
    const xr = 0.97
    const yb = -0.97
    const yt = 0.97
    const tv = Math.tan((camera.fov * Math.PI) / 360)
    const target = goalTarget.set((minX + maxX) / 2, (minY + maxY) / 2, -2)
    let dist = 70
    for (let it = 0; it < 9; it++) {
      camera.position.copy(target).addScaledVector(fitDir, dist)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      let mnx = 9
      let mxx = -9
      let mny = 9
      let mxy = -9
      for (const c of corners) {
        tmp.copy(c).project(camera)
        mnx = Math.min(mnx, tmp.x)
        mxx = Math.max(mxx, tmp.x)
        mny = Math.min(mny, tmp.y)
        mxy = Math.max(mxy, tmp.y)
      }
      const k = Math.max((mxx - mnx) / (xr - xl), (mxy - mny) / (yt - yb))
      dist *= k
      const dx = (xl + xr) / 2 - (mnx + mxx) / 2
      const dy = (yb + yt) / 2 - (mny + mxy) / 2
      camRight.setFromMatrixColumn(camera.matrixWorld, 0)
      camUp.setFromMatrixColumn(camera.matrixWorld, 1)
      target.addScaledVector(camRight, -dx * dist * tv * camera.aspect).addScaledVector(camUp, -dy * dist * tv)
    }
    goalPos.copy(target).addScaledVector(fitDir, dist)
    scene.fog.near = dist + 60
    scene.fog.far = dist + 420
    if (firstFit) {
      camPos.copy(goalPos)
      camTarget.copy(goalTarget)
      firstFit = false
    }
  }

  // ---------- animación ----------
  let lastReal = performance.now()
  let flying = false
  let flightT = 0
  let restT = 1
  let carPhase = 0
  let carY = 0.1
  let lastFlash = null
  let bulbTick = 0
  let smokeAcc = 0
  const dummy = new Object3D()
  const FLIGHT_S = 7

  function land() {
    cookies.forEach((c, k) => {
      c.t = -k * 0.05
      c.s.visible = true
      c.s.position.set(sleighHome.x + 3.2, sleighHome.y + 2.0, sleighHome.z + 0.4)
      c.v.set((Math.random() - 0.2) * 5, 4 + Math.random() * 3.5, (Math.random() - 0.3) * 2.5)
    })
    for (let k = 0; k < 24; k++) sparks.spawn(sleighHome.x + (Math.random() - 0.3) * 4, sleighHome.y + 0.3, sleighHome.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, 0, 1, 0.3, [2.4, 2, 0.8])
  }

  function draw(fr) {
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastReal) / 1000))
    lastReal = now
    elapsed += dt
    const t = elapsed
    const levels = fr.plantas.length
    const hasLocked = levels < PLANTAS.length
    if (levels !== levelsNow || hasLocked !== hasLockedNow || !shaftInfo) {
      rebuild(levels, hasLocked)
      fitDirty = true
    }
    if (fitDirty) fitCamera()
    skyMat.uniforms.uTime.value = t
    const fl = parseFlash(fr.flash)
    if (fr.flash !== lastFlash) {
      lastFlash = fr.flash
      if (fl) burst(fl[0], fl[1])
    }
    const pk = Math.max(0, 1 - (t - pulse.t) / 0.7) // 1 -> 0 tras un toque o una mejora

    // Salas: luz, elfos, banco, cinta y montón.
    const pileShare = Math.min(1, Math.log10(1 + (fr.pile ?? 0)) / 6)
    const pileCount = Math.round(pileShare * PILE_SLOTS.length)
    rooms.forEach((rm, i) => {
      const lvl = fr.plantas[i] ?? 1
      const on = Boolean(fr.working?.p?.[i])
      const target = on ? 1 : 0
      rm.light = rm.light === undefined ? target : damp(rm.light, target, 3.5, dt)
      const L = rm.light
      rm.veil.material.opacity = 0.5 * (1 - L)
      rm.wallMat.emissiveIntensity = 0.05 + 0.22 * L
      rm.wallMat.color.setScalar(0.8 + 0.4 * L)
      rm.sideMat.emissiveIntensity = 0.02 + 0.12 * L
      rm.lampMat.color.set(rm.th[2]).multiplyScalar(0.7 + 2.5 * L)
      rm.halo.material.opacity = 0.1 + 0.55 * L
      rm.wash.material.opacity = 0.3 * L
      const moving = on && !reduced
      const n = lvl >= 20 ? 3 : lvl >= 5 ? 2 : 1
      rm.elves.forEach((el, k) => {
        el.visible = k < n
        if (k === 2) {
          const hm = el.userData.home
          if (moving) {
            const s = Math.sin(t * 0.9 + i)
            el.position.x = hm.x + (s * 0.5 + 0.5) * 0.9
            el.position.y = Math.abs(Math.sin(t * 9 + i)) * 0.05
            el.rotation.y = Math.cos(t * 0.9 + i) > 0 ? 0.5 : -0.5
            rm.crate.visible = Math.cos(t * 0.9 + i) > 0
          } else {
            el.position.set(hm.x, 0, hm.z)
            el.rotation.y = 0
            rm.crate.visible = true
          }
          return
        }
        const arm = el.userData.arm
        const ph = t * 7 + k * 1.9 + i
        if (moving) {
          arm.rotation.x = -0.5 - Math.max(0, Math.sin(ph)) * 1.4
          el.position.y = Math.abs(Math.sin(ph)) * 0.04
          el.rotation.z = Math.sin(t * 2 + k) * 0.035
          el.rotation.x = 0
        } else {
          arm.rotation.x = on ? -0.5 : -0.1
          el.position.y = 0
          el.rotation.z = on || reduced ? 0 : Math.sin(t * 1.2 + k) * 0.05
          el.rotation.x = on ? 0 : 0.18 // dormido, con la cabeza caída
        }
      })
      rm.boss.visible = Boolean(fr.boss?.p?.[i])
      if (rm.boss.visible) rm.boss.position.y = moving ? Math.abs(Math.sin(t * 3 + i)) * 0.05 : 0
      rm.zz.visible = L < 0.5
      if (rm.zz.visible) {
        rm.zz.material.opacity = 1 - L * 2
        rm.zz.position.y = 2.9 + (reduced ? 0 : Math.sin(t * 1.6 + i) * 0.12)
      }
      const wp = moving ? Math.abs(Math.sin(t * 7 + i)) : 0
      rm.wip.scale.setScalar(1.1 + wp * 0.12)
      rm.wip.rotation.y = moving ? t * 0.8 : 0
      // Cinta y juguetes.
      if (moving) {
        rm.beltT = (rm.beltT + dt * 0.17) % 1
        rm.belt.offset.x -= dt * 1.55
      }
      for (let k = 0; k < BELT_TOYS; k++) {
        const u = (rm.beltT + k / BELT_TOYS) % 1
        const hop = u < 0.1 ? Math.sin((u / 0.1) * Math.PI) * 0.45 : 0
        const fall = u > 0.93 ? ((u - 0.93) / 0.07) ** 2 * 0.55 : 0
        dummy.position.set(0.75 + u * 3.25 + (u > 0.93 ? (u - 0.93) * 4 : 0), 0.7 + hop - fall, -1.3)
        dummy.rotation.set(0, 0.5 + k, 0)
        dummy.scale.setScalar(Math.max(0.01, 1 - smooth(0.96, 1, u) * 0.9) * (0.7 + smooth(0, 0.1, u) * 0.3))
        dummy.updateMatrix()
        rm.toys.setMatrixAt(k, dummy.matrix)
      }
      for (let k = 0; k < pileCount; k++) {
        const s = PILE_SLOTS[k]
        dummy.position.set(s[0], s[1], s[2])
        dummy.rotation.set(0, k * 1.7, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        rm.toys.setMatrixAt(BELT_TOYS + k, dummy.matrix)
      }
      rm.toys.count = BELT_TOYS + pileCount
      rm.toys.instanceMatrix.needsUpdate = true
      rm.anim.forEach((fn) => fn(t, moving, dt))
      // Rebote al tocar o mejorar esta sala.
      const bounce = pulse.part === 'p' && pulse.i === i ? pk * Math.sin((t - pulse.t) * 26) : 0
      rm.group.scale.set(1, 1 + bounce * 0.035, 1)
    })
    if (lockedRow) {
      const bounce = pulse.part === 'p' && pulse.i === levels ? pk * Math.sin((t - pulse.t) * 26) : 0
      lockedRow.group.scale.set(1, 1 + bounce * 0.03, 1)
    }

    // Almacén: cajas apiladas según lo guardado.
    const storeShare = Math.min(1, Math.log10(1 + (fr.store ?? 0)) / 7.5)
    atticInfo.store.count = Math.round(storeShare * STORE_MAX)
    atticInfo.clerk.rotation.y = 0.3 + (reduced ? 0 : Math.sin(t * 0.7) * 0.25)

    // Montacargas: sube con cajas, descarga arriba y baja vacío; parado, espera abajo.
    const liftOn = Boolean(fr.working?.e) && !reduced
    const A = levels + (hasLocked ? 1 : 0)
    const car = shaftInfo.car
    let targetY = 0.1
    let speedMul = 0
    if (liftOn) {
      carPhase = (carPhase + dt / (4.5 + A * 0.75)) % 1
      const c = carPhase
      const f = c < 0.42 ? smooth(0, 0.42, c) : c < 0.5 ? 1 : c < 0.92 ? 1 - smooth(0.5, 0.92, c) : 0
      targetY = 0.1 + f * atticY
      speedMul = c < 0.42 || (c >= 0.5 && c < 0.92) ? 1 : 0
      shaftInfo.crates.forEach((m) => (m.visible = c < 0.42 || c >= 0.92))
      carY = targetY
    } else {
      carY = damp(carY, 0.1, 2.5, dt)
      shaftInfo.crates.forEach((m) => (m.visible = true))
    }
    const rattle = speedMul && !reduced ? Math.sin(t * 40) * 0.012 : 0
    const shake = pulse.part === 'e' ? pk * Math.sin((t - pulse.t) * 30) * 0.06 : 0
    car.position.set(SHAFT_CX + rattle + shake, carY, -2.8)
    shaftInfo.operator.visible = Boolean(fr.boss?.e)
    const cableTop = terraceY + 1.45
    const cableLen = Math.max(0.1, cableTop - (carY + 2.1))
    shaftInfo.cable.scale.set(0.07, cableLen, 0.07)
    shaftInfo.cable.position.set(SHAFT_CX, carY + 2.1 + cableLen / 2, -2.8)
    shaftInfo.drum.rotation.x = -carY * 1.4
    terraceInfo.pulley.rotation.z = -carY * 0.9
    terraceInfo.boss.visible = Boolean(fr.boss?.s)

    // Trineo: cuando reparte, despega, da una vuelta con estela mágica y vuelve; al aterrizar, galletas.
    const sellOn = Boolean(fr.working?.s) && !reduced
    if (flying) {
      flightT += dt / FLIGHT_S
      if (flightT >= 1) {
        flying = false
        flightT = 0
        restT = 1.6
        land()
      }
    } else if (sellOn) {
      restT -= dt
      if (restT <= 0) {
        flying = true
        flightT = 0
      }
    }
    const hop = pulse.part === 's' ? Math.abs(Math.sin((t - pulse.t) * 11)) * pk * 0.5 : 0
    let yaw = 0
    if (flying) {
      // Vuelta alrededor del edificio: sale hacia la derecha y al frente, rodea la torre por detrás y vuelve a casa.
      const te = flightT - Math.sin(flightT * TAU) / TAU // arranque y llegada suaves
      const a = te * TAU
      const cx = 1.5
      const cz = -6
      const rx = 9.5
      const rz = 7
      const th0 = Math.atan2((sleighHome.x - cx) / rx, (sleighHome.z - cz) / rz)
      const px = (aa) => cx + rx * Math.sin(aa + th0)
      const pz = (aa) => cz + rz * Math.cos(aa + th0)
      const env = smooth(0, 0.1, flightT) * (1 - smooth(0.9, 1, flightT))
      const hx = rx * Math.cos(a + th0)
      const hz = -rz * Math.sin(a + th0)
      const hl = Math.hypot(hx, hz) || 1
      const lift = Math.sin(flightT * Math.PI)
      sleigh.position.set(sleighHome.x + px(a) - px(0), sleighHome.y + 0.4 + lift * 3.4 + Math.sin(a * 2) * 0.45 * env + hop, sleighHome.z + pz(a) - pz(0))
      yaw = Math.atan2(-hz / hl, hx / hl) * env
      sleigh.rotation.set(0, yaw, Math.sin(a * 2) * 0.12 * env)
      if (!reduced) {
        const nTrail = Math.max(1, Math.round(dt * 90))
        for (let k = 0; k < nTrail; k++) {
          const pal = [[2.6, 2.1, 0.7], [0.7, 2.4, 1.6], [2.4, 0.8, 1.9]][Math.floor(Math.random() * 3)]
          const back = 2.4 + Math.random() * 0.8
          sparks.spawn(
            sleigh.position.x - (hx / hl) * back,
            sleigh.position.y + 0.6 + Math.random() * 0.8,
            sleigh.position.z - (hz / hl) * back + (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 0.6 - 0.25,
            (Math.random() - 0.5) * 0.4,
            1.2 + Math.random() * 0.6,
            0.34 + lift * 0.1,
            pal,
          )
        }
      }
    } else {
      sleigh.position.set(sleighHome.x, sleighHome.y + hop, sleighHome.z)
      sleigh.rotation.set(0, 0, 0)
    }
    sleighHit.position.set(sleigh.position.x + 3 * Math.cos(yaw), sleigh.position.y + 1.6, sleigh.position.z - 3 * Math.sin(yaw))
    sleighGallop.forEach(({ deer, legs, k }) => {
      deer.position.y = flying ? Math.sin(t * 13 + k) * 0.06 : 0
      legs.forEach((leg, j) => {
        leg.rotation.z = flying ? Math.sin(t * 13 + (j % 2) * Math.PI + (j > 1 ? 0.8 : 0) + k) * 0.75 : reduced ? 0 : Math.sin(t * 1.5 + j) * 0.04
      })
    })
    if (rudolph) rudolph.material.color.set('#ff2a2a').multiplyScalar(2.2 + (reduced ? 1 : Math.sin(t * 5) * 1.0))
    cookies.forEach((c) => {
      if (!c.s.visible) return
      c.t += dt
      if (c.t < 0) return
      c.v.y -= 9 * dt
      c.s.position.addScaledVector(c.v, dt)
      c.s.material.opacity = 1 - smooth(0.9, 1.6, c.t)
      if (c.t > 1.6) c.s.visible = false
    })

    // Humo de la chimenea y nieve.
    if (!reduced) {
      smokeAcc += dt * 5
      while (smokeAcc > 1) {
        smokeAcc -= 1
        smoke.spawn(chimneyTop.x + (Math.random() - 0.5) * 0.3, chimneyTop.y, chimneyTop.z, 0.3 + Math.random() * 0.3, 0.8 + Math.random() * 0.5, 0, 4, 1.2, [0.75, 0.78, 0.9])
      }
    }
    if (snowN) {
      const span = Math.max(SNOW_TOP, topExt + BASE + 8)
      for (let i = 0; i < snowN; i++) {
        let y = snowPos[i * 3 + 1] - dt * (1.4 + (i % 5) * 0.35)
        if (y < -BASE) y += span
        snowPos[i * 3 + 1] = y
        snowPos[i * 3] += Math.sin(t * 0.6 + i) * dt * 0.5
      }
      snowGeo.attributes.position.needsUpdate = true
    }
    sparks.update(dt)
    smoke.update(dt)

    // Luces de colores (a unos 20 fotogramas por segundo, que es de sobra).
    bulbTick += dt
    if (bulbs && bulbTick > 0.05) {
      bulbTick = 0
      for (let k = 0; k < bulbsCount; k++) {
        const v = reduced ? 1 : Math.sin(t * 2.4 + k * 1.3) > -0.25 ? 1 : 0.25
        bulbs.setColorAt(k, bulbTmp.set(BULBS[k % BULBS.length]).multiplyScalar(2.4 * v))
      }
      bulbs.instanceColor.needsUpdate = true
    }

    // Resaltados: lo que hay bajo el puntero, el destello del toque y el cuello de botella (rojo que late).
    hovered = pointer ? partAt(pointer[0], pointer[1]) : null
    canvas.style.cursor = hovered ? 'pointer' : 'default'
    const place = (m, r, z) => {
      m.scale.set(r.w, r.h, 1)
      m.position.set(r.x + r.w / 2, r.y + r.h / 2, z)
    }
    if (hovered) {
      place(hoverQuad, rectOf(hovered[0], hovered[1] ?? 0), 0.7)
      hoverMat.opacity = 0.09
      hoverQuad.visible = true
    } else hoverQuad.visible = false
    if (pk > 0 && pulse.part) {
      place(flashQuad, rectOf(pulse.part, pulse.i), 0.72)
      flashMat.opacity = 0.42 * pk
      flashQuad.visible = true
    } else flashQuad.visible = false
    const neck = fr.neck
    if (neck) {
      const nr = neck === 'p' ? { x: X0 - 0.35, y: 0, w: W + 0.7, h: levels * H } : rectOf(neck)
      const beat = 0.5 + 0.5 * Math.sin(t * 4.2)
      neckBarMat.opacity = 0.55 + 0.4 * beat
      neckGlowMat.opacity = 0.1 + 0.2 * beat
      neckWashMat.opacity = 0.05 + 0.09 * beat
      frameRect(nr.x, nr.y, nr.w, nr.h, 0.75)
      place(neckWash, nr, 0.68)
      neckFrame.visible = neckWash.visible = true
      warn.visible = true
      warn.position.set(nr.x + nr.w - 0.5, nr.y + nr.h - 0.1 + beat * 0.15, 0.9)
      warn.scale.setScalar(1.15 + beat * 0.2)
    } else neckFrame.visible = neckWash.visible = warn.visible = false

    // Cámara: va suavemente a su sitio, con un balanceo mínimo.
    const k = 1 - Math.exp(-dt * 3)
    camPos.lerp(goalPos, k)
    camTarget.lerp(goalTarget, k)
    const sway = reduced ? 0 : Math.sin(t * 0.13) * 0.8
    camera.position.copy(camPos)
    camera.position.x += sway
    camera.lookAt(camTarget)
    camera.updateMatrixWorld()

    const scale = renderer.getDrawingBufferSize(tmp2).y / 2 / Math.tan((camera.fov * Math.PI) / 360)
    sparks.points.material.uniforms.uScale.value = scale
    smoke.points.material.uniforms.uScale.value = scale
    snowPtMat.uniforms.uScale.value = scale

    composer.render(dt)

    // Dónde cae cada parte en la pantalla (centro vertical de su planta), para las fichas HTML.
    const project = (x, y, z) => {
      tmp.set(x, y, z).project(camera)
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h }
    }
    return {
      p: rooms.map((_, i) => project(X0, i * H + H / 2, 0)),
      locked: hasLocked ? project(X0, levels * H + H / 2, 0) : null,
      store: project(X0, atticY + H / 2, 0),
      e: project(SHAFT_CX, -BASE * 0.5, 0),
      s: project(X0, terraceY + H / 2, 0),
    }
  }
  const tmp2 = new Vector2()

  function destroy() {
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('click', onClick)
    scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else {
        m?.map?.dispose?.()
        m?.dispose?.()
      }
    })
    owned.forEach((x) => x.dispose?.())
    disposables.forEach((x) => x.dispose?.())
    bulbs?.dispose?.()
    composer.dispose?.()
    rt.dispose()
    bloom.dispose?.()
    renderer.dispose()
    canvas.remove()
  }

  return { draw, resize, destroy }
}
