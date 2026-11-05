// Dibujo de Pez Gordo en el canvas (lo usa Pez.jsx). Nada de aquí cambia la partida: la simulación está en pez.js y es
// la que repite el servidor; esto solo pinta el mar, el fondo, los peces, las partículas y los avisos.
import * as pez from './pez.js'

const TAU = Math.PI * 2
const EAT = 1.15 // como EAT_RATIO de pez.js: para comerte a otro tienes que pesar esto más que él

// Plancton: color de cada tono (pellet.hue) y el dorado.
export const PLANKTON = ['#8fe3ff', '#2ee6d0', '#ffe36e', '#ff8a4c', '#ff5fa2', '#b6ff7a']
// Pieles de los peces de la casa: [arriba, abajo, contorno, aletas] y el dibujo (0 liso, 1 rayas, 2 lunares).
const SKINS = [
  { top: '#ffd36e', bottom: '#ff8a3c', line: '#7a3412', fin: '#ff6b3c', pattern: 2 },
  { top: '#5ff2dc', bottom: '#138aa3', line: '#0b3d4f', fin: '#1fb8c4', pattern: 1 },
  { top: '#ff8fc0', bottom: '#c0306e', line: '#5a1030', fin: '#ff5fa2', pattern: 0 },
  { top: '#c8ff8a', bottom: '#3e9e4a', line: '#16401c', fin: '#7ad04a', pattern: 1 },
  { top: '#b4ccff', bottom: '#3a5fc8', line: '#16245a', fin: '#6f8fff', pattern: 2 },
  { top: '#fff07a', bottom: '#d08a1c', line: '#5a3a06', fin: '#ffb547', pattern: 0 },
  { top: '#dcc2ff', bottom: '#6a3fc0', line: '#2a1450', fin: '#a77bff', pattern: 2 },
  { top: '#ffc0a8', bottom: '#c0402a', line: '#521608', fin: '#ff7a5a', pattern: 1 },
]
const SHARK = { top: '#6f8aa6', bottom: '#eef4f8', line: '#1d2b3c', fin: '#56708c' }
const CLOWN = { top: '#ffae3c', bottom: '#f0561e', line: '#2a0f2e', fin: '#ff7a2a' }

// Ruido determinista (sin Math.random al pintar).
const noise = (i, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// --- Fondo del mar: arena, rocas, corales, algas y estrellas, siempre en el mismo sitio. ---
let decorCache = null
function decor() {
  if (decorCache) return decorCache
  const items = []
  const W = pez.WORLD
  // Manchas de arena clara y oscura.
  for (let i = 0; i < 26; i++) items.push({ kind: 'sand', x: noise(i, 1) * W, y: noise(i, 2) * W, s: 90 + noise(i, 3) * 160, k: noise(i, 4) })
  // Rocas con algas, corales, estrellas y conchas.
  const kinds = ['rock', 'coral', 'weed', 'weed', 'star', 'shell', 'coral', 'fan']
  for (let i = 0; i < 70; i++) {
    items.push({ kind: kinds[i % kinds.length], x: 40 + noise(i, 5) * (W - 80), y: 40 + noise(i, 6) * (W - 80), s: 0.7 + noise(i, 7) * 0.9, k: noise(i, 8), a: noise(i, 9) * TAU })
  }
  // El arrecife del borde: rocas grandes a lo largo de las cuatro paredes.
  const edge = []
  for (let side = 0; side < 4; side++) {
    for (let d = 0; d <= W; d += 46) {
      const o = noise(d + side * 1000, 10)
      const r = 26 + o * 34
      const off = -r * 0.35 + noise(d, side + 20) * 10
      const pt = side === 0 ? [d, off] : side === 1 ? [W - off, d] : side === 2 ? [d, W - off] : [off, d]
      edge.push({ x: pt[0], y: pt[1], r, k: o })
    }
  }
  decorCache = { items: items.sort((a, b) => (a.kind === 'sand' ? -1 : 0) - (b.kind === 'sand' ? -1 : 0)), edge }
  return decorCache
}

function drawDecor(ctx, it, t) {
  ctx.save()
  ctx.translate(it.x, it.y)
  switch (it.kind) {
    case 'sand': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, it.s)
      g.addColorStop(0, it.k > 0.5 ? 'rgba(255, 226, 160, 0.10)' : 'rgba(0, 20, 40, 0.16)')
      g.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(0, 0, it.s, it.s * 0.7, it.k * 3, 0, TAU)
      ctx.fill()
      break
    }
    case 'rock': {
      const s = 26 * it.s
      ctx.fillStyle = 'rgba(4, 20, 36, 0.35)'
      ctx.beginPath()
      ctx.ellipse(6, 8, s * 1.1, s * 0.8, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#1d4a5c'
      ctx.beginPath()
      ctx.ellipse(0, 0, s, s * 0.78, it.a, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#2b6578'
      ctx.beginPath()
      ctx.ellipse(-s * 0.25, -s * 0.2, s * 0.55, s * 0.4, it.a, 0, TAU)
      ctx.fill()
      // Musgo.
      ctx.fillStyle = 'rgba(120, 220, 140, 0.35)'
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.arc(Math.cos(it.a + i * 1.7) * s * 0.5, Math.sin(it.a + i * 1.7) * s * 0.4, s * 0.16, 0, TAU)
        ctx.fill()
      }
      break
    }
    case 'coral': {
      const colors = ['#ff6b8a', '#ff9a5a', '#c86bff', '#ffd25e']
      ctx.strokeStyle = colors[Math.floor(it.k * colors.length)]
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.75
      const arm = (len, ang, depth) => {
        ctx.lineWidth = 3 + depth * 2.5
        ctx.beginPath()
        ctx.moveTo(0, 0)
        const x = Math.cos(ang) * len
        const y = Math.sin(ang) * len
        ctx.lineTo(x, y)
        ctx.stroke()
        if (depth > 0) {
          ctx.save()
          ctx.translate(x, y)
          arm(len * 0.7, ang - 0.5, depth - 1)
          arm(len * 0.7, ang + 0.5, depth - 1)
          ctx.restore()
        }
      }
      for (let i = 0; i < 3; i++) arm(14 * it.s, it.a + i * 2.1, 2)
      break
    }
    case 'fan': {
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = '#ff7aa8'
      ctx.lineWidth = 1.5
      const s = 30 * it.s
      for (let i = 0; i < 9; i++) {
        const ang = it.a - 0.9 + (i / 8) * 1.8
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(Math.cos(ang) * s * 0.5, Math.sin(ang) * s * 0.5 + 4, Math.cos(ang) * s, Math.sin(ang) * s)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(255, 122, 168, 0.25)'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, s, it.a - 0.9, it.a + 0.9)
      ctx.fill()
      break
    }
    case 'weed': {
      // Algas que se mecen.
      ctx.strokeStyle = it.k > 0.5 ? '#3fbf7a' : '#2e9e6a'
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.8
      for (let i = 0; i < 4; i++) {
        const len = (26 + i * 7) * it.s
        const sway = Math.sin(t / 900 + it.k * 10 + i) * 10
        ctx.lineWidth = 4 - i * 0.5
        ctx.beginPath()
        ctx.moveTo(i * 5 - 8, 0)
        ctx.bezierCurveTo(i * 5 - 8 + sway, -len * 0.4, i * 5 - 8 - sway, -len * 0.7, i * 5 - 8 + sway * 1.4, -len)
        ctx.stroke()
      }
      break
    }
    case 'star': {
      ctx.rotate(it.a)
      ctx.fillStyle = it.k > 0.5 ? '#ff8a4c' : '#ff5f7a'
      ctx.globalAlpha = 0.85
      const s = 11 * it.s
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? s * 0.42 : s
        ctx.lineTo(Math.cos((i / 10) * TAU) * rr, Math.sin((i / 10) * TAU) * rr)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 240, 200, 0.6)'
      for (let i = 0; i < 5; i++) {
        ctx.beginPath()
        ctx.arc(Math.cos((i / 5) * TAU) * s * 0.5, Math.sin((i / 5) * TAU) * s * 0.5, 1.4, 0, TAU)
        ctx.fill()
      }
      break
    }
    case 'shell': {
      ctx.rotate(it.a)
      const s = 9 * it.s
      ctx.fillStyle = '#ffe9d0'
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.moveTo(0, s * 0.6)
      ctx.arc(0, 0, s, Math.PI * 0.9, Math.PI * 0.1)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(180, 110, 80, 0.7)'
      ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        const ang = Math.PI * (1 + 0.1 + (i / 4) * 0.8)
        ctx.beginPath()
        ctx.moveTo(0, s * 0.6)
        ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s)
        ctx.stroke()
      }
      break
    }
  }
  ctx.restore()
}

// --- Plancton: brillos pre-dibujados (más barato que shadowBlur en cada fotograma). ---
const glowCache = new Map()
function glow(color) {
  let c = glowCache.get(color)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = 48
  const x = c.getContext('2d')
  const g = x.createRadialGradient(24, 24, 0, 24, 24, 24)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.18, color)
  g.addColorStop(0.45, `${color}66`)
  g.addColorStop(1, `${color}00`)
  x.fillStyle = g
  x.fillRect(0, 0, 48, 48)
  glowCache.set(color, c)
  return c
}

// --- Peces ---

// Silueta del cuerpo (mirando a la derecha, radio r). mouth: de 0 (cerrada) a 1 (abierta del todo). long: alargado.
function bodyPath(ctx, r, mouth, long = 1) {
  const n = 1.15 * r * long
  ctx.beginPath()
  if (mouth > 0.05) {
    const m = mouth * 0.32 * r
    ctx.moveTo(n * 0.7, 0)
    ctx.lineTo(n * 0.98, -m)
  } else ctx.moveTo(n, 0)
  ctx.bezierCurveTo(n * 0.96, -0.62 * r, 0.3 * r * long, -0.86 * r, -0.2 * r * long, -0.74 * r)
  ctx.bezierCurveTo(-0.7 * r * long, -0.6 * r, -0.95 * r * long, -0.25 * r, -1.0 * r * long, 0)
  ctx.bezierCurveTo(-0.95 * r * long, 0.25 * r, -0.7 * r * long, 0.6 * r, -0.2 * r * long, 0.72 * r)
  ctx.bezierCurveTo(0.3 * r * long, 0.84 * r, n * 0.96, 0.6 * r, mouth > 0.05 ? n * 0.98 : n, mouth > 0.05 ? mouth * 0.32 * r : 0)
  ctx.closePath()
}

// Un pez entero. o: { r, angle, skin, kind ('me' | 'shark' | 'fish'), t, speed, mouth, seed, alpha }.
function drawFish(ctx, x, y, o) {
  const { r, skin, kind, t, seed } = o
  const shark = kind === 'shark'
  const me = kind === 'me'
  const long = shark ? 1.32 : 1
  const beat = t / (110 - Math.min(60, o.speed * 9)) + seed
  const wag = Math.sin(beat) * (0.18 + Math.min(0.25, o.speed * 0.04))
  ctx.save()
  ctx.translate(x, y)
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha
  // Sombra en el fondo.
  ctx.save()
  ctx.globalAlpha *= 0.22
  ctx.fillStyle = '#021022'
  ctx.beginPath()
  ctx.ellipse(r * 0.25, r * 0.9, r * 1.2 * long, r * 0.45, 0, 0, TAU)
  ctx.fill()
  ctx.restore()

  ctx.rotate(o.angle)
  // Que no nade boca abajo cuando va hacia la izquierda.
  if (Math.cos(o.angle) < 0) ctx.scale(1, -1)
  const lw = Math.max(1.2, r * 0.065)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = skin.line

  // Cola.
  ctx.save()
  ctx.translate(-0.92 * r * long, 0)
  ctx.rotate(wag)
  ctx.beginPath()
  if (shark) {
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-0.4 * r, -0.4 * r, -0.85 * r, -1.05 * r)
    ctx.quadraticCurveTo(-0.6 * r, -0.2 * r, -0.62 * r, 0.05 * r)
    ctx.quadraticCurveTo(-0.55 * r, 0.3 * r, -0.6 * r, 0.6 * r)
    ctx.quadraticCurveTo(-0.3 * r, 0.25 * r, 0, 0)
  } else {
    ctx.moveTo(0.08 * r, 0)
    ctx.quadraticCurveTo(-0.35 * r, -0.35 * r, -0.78 * r, -0.78 * r)
    ctx.quadraticCurveTo(-0.62 * r, -0.25 * r, -0.5 * r, 0)
    ctx.quadraticCurveTo(-0.62 * r, 0.25 * r, -0.78 * r, 0.78 * r)
    ctx.quadraticCurveTo(-0.35 * r, 0.35 * r, 0.08 * r, 0)
  }
  const tg = ctx.createLinearGradient(0, 0, -0.8 * r, 0)
  tg.addColorStop(0, skin.fin)
  tg.addColorStop(1, shark ? skin.top : skin.bottom)
  ctx.fillStyle = tg
  ctx.fill()
  ctx.lineWidth = lw
  ctx.stroke()
  if (!shark) {
    // Radios de la cola.
    ctx.globalAlpha *= 0.35
    ctx.lineWidth = lw * 0.5
    for (const k of [-0.5, -0.2, 0.2, 0.5]) {
      ctx.beginPath()
      ctx.moveTo(-0.05 * r, 0)
      ctx.lineTo(-0.62 * r, k * r)
      ctx.stroke()
    }
  }
  if (me) {
    // Borde negro de las aletas del pez payaso.
    ctx.globalAlpha = o.alpha ?? 1
    ctx.lineWidth = lw * 1.8
    ctx.beginPath()
    ctx.moveTo(-0.78 * r, -0.78 * r)
    ctx.quadraticCurveTo(-0.62 * r, -0.25 * r, -0.5 * r, 0)
    ctx.quadraticCurveTo(-0.62 * r, 0.25 * r, -0.78 * r, 0.78 * r)
    ctx.stroke()
  }
  ctx.restore()

  // Aleta de arriba.
  ctx.beginPath()
  if (shark) {
    ctx.moveTo(-0.35 * r * long, -0.66 * r)
    ctx.quadraticCurveTo(-0.3 * r * long, -1.3 * r, -0.45 * r * long, -1.55 * r)
    ctx.quadraticCurveTo(0.05 * r * long, -1.1 * r, 0.25 * r * long, -0.74 * r)
  } else {
    const ripple = Math.sin(beat * 0.7) * 0.06 * r
    ctx.moveTo(-0.62 * r, -0.55 * r)
    ctx.bezierCurveTo(-0.5 * r, -1.08 * r + ripple, 0.05 * r, -1.22 * r - ripple, 0.38 * r, -0.7 * r)
  }
  ctx.closePath()
  ctx.fillStyle = skin.fin
  ctx.fill()
  ctx.lineWidth = lw
  ctx.stroke()
  // Aleta de abajo, atrás.
  ctx.beginPath()
  ctx.moveTo(-0.55 * r * long, 0.55 * r)
  ctx.quadraticCurveTo(-0.55 * r * long, (shark ? 0.85 : 1.0) * r, -0.15 * r * long, 0.68 * r)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Cuerpo.
  bodyPath(ctx, r, o.mouth, long)
  const bg = ctx.createLinearGradient(0, -r, 0, r)
  if (shark) {
    bg.addColorStop(0, skin.top)
    bg.addColorStop(0.52, skin.top)
    bg.addColorStop(0.62, skin.bottom)
    bg.addColorStop(1, skin.bottom)
  } else {
    bg.addColorStop(0, skin.top)
    bg.addColorStop(1, skin.bottom)
  }
  ctx.fillStyle = bg
  ctx.fill()

  // Dibujos dentro del cuerpo (recortados a su silueta).
  ctx.save()
  ctx.clip()
  if (me) {
    // Las tres franjas blancas con borde negro del pez payaso.
    for (const [cx, w] of [
      [0.5, 0.2],
      [-0.12, 0.24],
      [-0.75, 0.16],
    ]) {
      ctx.fillStyle = skin.line
      ctx.beginPath()
      ctx.ellipse(cx * r, 0, (w / 2 + 0.06) * r, 1.1 * r, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fff8ee'
      ctx.beginPath()
      ctx.ellipse(cx * r, 0, (w / 2) * r, 1.1 * r, 0, 0, TAU)
      ctx.fill()
    }
  } else if (shark) {
    // Hendiduras de las agallas.
    ctx.strokeStyle = 'rgba(20, 34, 52, 0.55)'
    ctx.lineWidth = lw * 0.8
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo((0.42 - i * 0.12) * r * long, -0.32 * r)
      ctx.quadraticCurveTo((0.36 - i * 0.12) * r * long, 0, (0.42 - i * 0.12) * r * long, 0.22 * r)
      ctx.stroke()
    }
  } else if (skin.pattern === 1) {
    ctx.fillStyle = 'rgba(10, 20, 40, 0.22)'
    for (const cx of [-0.55, -0.15, 0.25]) {
      ctx.beginPath()
      ctx.ellipse(cx * r, 0, 0.09 * r, 1.1 * r, 0.15, 0, TAU)
      ctx.fill()
    }
  } else if (skin.pattern === 2) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.arc((noise(seed, i) * 1.3 - 0.75) * r, (noise(seed, i + 9) - 0.6) * 0.9 * r, (0.07 + noise(seed, i + 3) * 0.06) * r, 0, TAU)
      ctx.fill()
    }
  }
  // Escamas (solo si el pez se ve bastante grande).
  if (o.detail && !shark) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.lineWidth = Math.max(0.6, r * 0.025)
    const step = 0.26 * r
    for (let sx = -0.7 * r, row = 0; sx < 0.35 * r; sx += step, row++) {
      for (let sy = -0.7 * r + (row % 2) * step * 0.5; sy < 0.7 * r; sy += step) {
        ctx.beginPath()
        ctx.arc(sx, sy, step * 0.55, -1.1, 1.1)
        ctx.stroke()
      }
    }
  }
  // Brillo de arriba y sombra de abajo: volumen.
  const shine = ctx.createLinearGradient(0, -r, 0, r)
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.38)')
  shine.addColorStop(0.35, 'rgba(255, 255, 255, 0)')
  shine.addColorStop(0.7, 'rgba(0, 0, 0, 0)')
  shine.addColorStop(1, 'rgba(0, 10, 30, 0.3)')
  ctx.fillStyle = shine
  ctx.fillRect(-1.5 * r * long, -r, 3 * r * long, 2 * r)
  ctx.restore()

  bodyPath(ctx, r, o.mouth, long)
  ctx.lineWidth = lw * (me ? 1.3 : 1)
  ctx.strokeStyle = skin.line
  ctx.stroke()

  // Agalla.
  if (!shark) {
    ctx.beginPath()
    ctx.arc(0.18 * r, 0, 0.5 * r, -0.75, 0.75)
    ctx.lineWidth = lw * 0.7
    ctx.globalAlpha *= 0.5
    ctx.stroke()
    ctx.globalAlpha = o.alpha ?? 1
  }

  // Aleta del costado, que aletea.
  ctx.save()
  ctx.translate(0.12 * r * long, 0.28 * r)
  ctx.rotate(0.5 + Math.sin(beat * 1.6) * 0.45)
  ctx.beginPath()
  if (shark) {
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-0.2 * r, 0.5 * r, -0.65 * r, 0.62 * r)
    ctx.quadraticCurveTo(-0.3 * r, 0.12 * r, 0, 0)
  } else ctx.ellipse(-0.22 * r, 0, 0.3 * r, 0.13 * r, 0, 0, TAU)
  ctx.fillStyle = skin.fin
  ctx.globalAlpha *= 0.9
  ctx.fill()
  ctx.lineWidth = lw * 0.8
  ctx.stroke()
  ctx.restore()

  // Boca: dientes del tiburón cuando la abre.
  if (shark && o.mouth > 0.15) {
    ctx.fillStyle = '#fff'
    const n = 1.15 * r * long
    for (let i = 0; i < 3; i++) {
      const tx = n * (0.74 + i * 0.08)
      const ty = o.mouth * 0.32 * r * (0.3 + i * 0.33)
      ctx.beginPath()
      ctx.moveTo(tx - 0.05 * r, -ty)
      ctx.lineTo(tx, -ty + 0.1 * r)
      ctx.lineTo(tx + 0.05 * r, -ty)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(tx - 0.05 * r, ty)
      ctx.lineTo(tx, ty - 0.1 * r)
      ctx.lineTo(tx + 0.05 * r, ty)
      ctx.fill()
    }
  } else if (!shark && o.mouth <= 0.05) {
    ctx.beginPath()
    ctx.moveTo(1.02 * r, 0.06 * r)
    ctx.quadraticCurveTo(0.92 * r, 0.16 * r, 0.82 * r, 0.12 * r)
    ctx.lineWidth = lw * 0.8
    ctx.stroke()
  }

  // Ojo.
  const ex = (shark ? 0.66 : 0.6) * r * long
  const ey = -0.2 * r
  const er = (shark ? 0.11 : me ? 0.22 : 0.19) * r
  if (shark) {
    ctx.fillStyle = '#0a0f1a'
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, TAU)
    ctx.fill()
    // Ceja de malo.
    ctx.beginPath()
    ctx.moveTo(ex - er * 2.2, ey - er * 2.4)
    ctx.lineTo(ex + er * 1.6, ey - er * 1.1)
    ctx.lineWidth = lw * 1.4
    ctx.strokeStyle = skin.line
    ctx.stroke()
  } else {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, TAU)
    ctx.fill()
    ctx.lineWidth = lw * 0.7
    ctx.stroke()
    ctx.fillStyle = me ? '#3a1a08' : '#10142a'
    ctx.beginPath()
    ctx.arc(ex + er * 0.25, ey + er * 0.05, er * 0.58, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(ex + er * 0.45, ey - er * 0.35, Math.max(0.8, er * 0.24), 0, TAU)
  ctx.fill()
  ctx.restore()
}

// Pastilla con el nombre y el peso encima de cada pez.
function label(ctx, text, x, y, z, color, bg) {
  const size = 12 / Math.max(0.6, z)
  ctx.font = `800 ${size}px "Instrument Sans Variable", system-ui, sans-serif`
  const w = ctx.measureText(text).width + size * 1.1
  const h = size * 1.55
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect?.(x - w / 2, y - h / 2, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + size * 0.05)
}

// --- Partículas (burbujas, trocitos y destellos) ---
export function burst(g, x, y, color, n, kind = 'bit', speed = 2.4) {
  for (let i = 0; i < n; i++) {
    const a = noise(g.fxSeed++, 1) * TAU
    const s = (0.4 + noise(g.fxSeed, 2)) * speed
    g.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'bubble' ? 0.6 : 0), life: 0, max: 500 + noise(g.fxSeed, 3) * 600, kind, color, r: kind === 'bubble' ? 2 + noise(g.fxSeed, 4) * 4 : 2 + noise(g.fxSeed, 5) * 3 })
  }
}

function drawFx(ctx, g, dt) {
  const keep = []
  for (const p of g.fx) {
    p.life += dt
    if (p.life > p.max) continue
    keep.push(p)
    const k = p.life / p.max
    p.x += p.vx * (dt / 16)
    p.y += p.vy * (dt / 16)
    if (p.kind === 'bubble') {
      p.vy -= 0.02 * (dt / 16)
      p.vx *= 0.98
      ctx.globalAlpha = 0.7 * (1 - k)
      ctx.strokeStyle = '#d8faff'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, TAU)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, TAU)
      ctx.fill()
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = 1 - k
      ctx.drawImage(glow(p.color), p.x - 10, p.y - 10, 20, 20)
    } else {
      p.vx *= 0.94
      p.vy *= 0.94
      ctx.globalAlpha = 1 - k
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, TAU)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  g.fx = keep
}

// Copos que flotan en el agua (pantalla, con un poco de paralaje).
const SNOW = Array.from({ length: 46 }, (_, i) => ({ x: noise(i, 31), y: noise(i, 32), d: 0.15 + noise(i, 33) * 0.6, r: 0.6 + noise(i, 34) * 1.8 }))

// Estado de dibujo que guarda Pez.jsx en su partida: ángulos suavizados, partículas, sacudidas…
export function newLook() {
  return { angles: new Map(), fx: [], fxSeed: 1, zoom: 1, popups: [], shake: 0, bubbleAt: 0, lastDraw: 0, flash: null }
}

// Dibuja un fotograma. g: { w, prev, acc, ...newLook() }. opts: { demo, out }.
export function draw(el, g, now, opts = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = el.clientWidth
  const ch = el.clientHeight
  if (!cw || !ch) return
  if (el.width !== Math.round(cw * dpr) || el.height !== Math.round(ch * dpr)) {
    el.width = Math.round(cw * dpr)
    el.height = Math.round(ch * dpr)
  }
  const dt = clamp(now - (g.lastDraw || now), 0, 60)
  g.lastDraw = now
  const ctx = el.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const w = g.w
  const a = Math.min(1, g.acc / pez.TICK_MS) // cuánto falta para el paso siguiente, para interpolar
  const lerp = (id, f) => {
    const p = g.prev.get(id)
    return p ? { x: p.x + (f.x - p.x) * a, y: p.y + (f.y - p.y) * a } : { x: f.x, y: f.y }
  }
  const me = w.me
  const meShown = me.alive && !opts.demo
  // La cámara: sobre tu pez, o paseando sola por el mar antes de empezar.
  const cam = opts.demo ? { x: pez.WORLD / 2 + Math.sin(now / 9000) * 380, y: pez.WORLD / 2 + Math.cos(now / 11000) * 300 } : lerp(-1, me)
  const meR = pez.radiusOf(me.mass)
  const target = opts.demo ? Math.min(cw, ch) / 700 : (Math.min(cw, ch) / 620) * Math.max(0.5, Math.min(1.25, 1.25 - (meR - 18) / 140))
  g.zoom += (target - g.zoom) * 0.08
  const z = g.zoom
  g.shake = Math.max(0, g.shake - dt * 0.03)
  const sx = g.shake ? (noise(now, 1) - 0.5) * g.shake : 0
  const sy = g.shake ? (noise(now, 2) - 0.5) * g.shake : 0

  // Agua: más clara arriba del mapa y más oscura abajo.
  const depth = clamp(cam.y / pez.WORLD, 0, 1)
  const bg = ctx.createLinearGradient(0, 0, 0, ch)
  bg.addColorStop(0, depth < 0.5 ? '#1689a3' : '#0f6a88')
  bg.addColorStop(0.55, '#0b4a6c')
  bg.addColorStop(1, '#052042')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cw, ch)

  ctx.save()
  ctx.translate(cw / 2 + sx, ch / 2 + sy)
  ctx.scale(z, z)
  ctx.translate(-cam.x, -cam.y)
  const vw = cw / 2 / z + 80
  const vh = ch / 2 / z + 80
  const inView = (x, y, m = 0) => x > cam.x - vw - m && x < cam.x + vw + m && y > cam.y - vh - m && y < cam.y + vh + m

  // Suelo del mar dentro del mapa: arena, rocas, corales y algas.
  const floor = ctx.createLinearGradient(0, 0, 0, pez.WORLD)
  floor.addColorStop(0, 'rgba(120, 220, 230, 0.10)')
  floor.addColorStop(1, 'rgba(0, 20, 50, 0.18)')
  ctx.fillStyle = floor
  ctx.fillRect(0, 0, pez.WORLD, pez.WORLD)
  const { items, edge } = decor()
  for (const it of items) if (inView(it.x, it.y, 160)) drawDecor(ctx, it, now)

  // Fuera del mapa: agua profunda y el arrecife que hace de pared.
  ctx.fillStyle = 'rgba(2, 10, 26, 0.72)'
  ctx.fillRect(-3000, -3000, pez.WORLD + 6000, 3000)
  ctx.fillRect(-3000, pez.WORLD, pez.WORLD + 6000, 3000)
  ctx.fillRect(-3000, 0, 3000, pez.WORLD)
  ctx.fillRect(pez.WORLD, 0, 3000, pez.WORLD)
  for (const e of edge) {
    if (!inView(e.x, e.y, e.r)) continue
    ctx.fillStyle = '#0f3346'
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#1b4e62'
    ctx.beginPath()
    ctx.arc(e.x - e.r * 0.2, e.y - e.r * 0.25, e.r * 0.62, 0, TAU)
    ctx.fill()
    if (e.k > 0.6) {
      ctx.fillStyle = e.k > 0.8 ? '#ff6b8a' : '#ffb547'
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(e.x + e.r * 0.3, e.y - e.r * 0.4, e.r * 0.22, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  // Plancton.
  for (const p of w.pellets) {
    if (!inView(p.x, p.y, 20)) continue
    const pulse = 1 + Math.sin(now / 300 + p.x) * 0.18
    const bob = Math.sin(now / 700 + p.y) * 2
    if (p.gold) {
      const s = 30 * pulse
      ctx.drawImage(glow('#ffc93c'), p.x - s / 2, p.y + bob - s / 2, s, s)
      ctx.save()
      ctx.translate(p.x, p.y + bob)
      ctx.rotate(now / 900 + p.x)
      ctx.fillStyle = '#fff6c0'
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? 2.4 : 7.5 * pulse
        ctx.lineTo(Math.cos((i / 8) * TAU) * rr, Math.sin((i / 8) * TAU) * rr)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    } else {
      const s = 16 * pulse
      ctx.drawImage(glow(PLANKTON[p.hue]), p.x - s / 2, p.y + bob - s / 2, s, s)
    }
  }

  // Peces: primero los pequeños, para que los grandes queden encima.
  const fishes = [...w.bots.filter((b) => b.alive), ...(meShown ? [me] : [])].sort((x, y) => x.mass - y.mass)
  const pos = new Map(fishes.map((f) => [f.id, lerp(f === me ? -1 : f.id, f)]))
  let danger = 0
  const arrows = []
  for (const f of fishes) {
    const isMe = f === me
    const p = pos.get(f.id)
    const r = pez.radiusOf(f.mass)
    // Rumbo suavizado (los peces giran, no saltan de dirección).
    const speed = Math.hypot(f.vx, f.vy)
    const prevA = g.angles.get(f.id)
    let ang = prevA ?? Math.atan2(f.vy, f.vx || 0.0001)
    if (speed > 0.25) {
      const want = Math.atan2(f.vy, f.vx)
      let d = want - ang
      while (d > Math.PI) d -= TAU
      while (d < -Math.PI) d += TAU
      ang += d * Math.min(1, dt * 0.012)
    }
    g.angles.set(f.id, ang)
    // Boca abierta si tiene algo que comerse cerca.
    let mouth = 0
    for (const o of fishes) {
      if (o === f || f.mass < o.mass * EAT) continue
      const q = pos.get(o.id)
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < r * 2.4 + pez.radiusOf(o.mass)) mouth = Math.max(mouth, 0.55 + Math.sin(now / 70) * 0.45)
    }
    // Lo que se ve desde tu pez: verde si te lo comes, rojo si te come.
    let ring = null
    if (!isMe && meShown) {
      if (me.mass >= f.mass * EAT) ring = 'prey'
      else if (f.mass >= me.mass * EAT) {
        ring = 'threat'
        const mp = pos.get(me.id)
        const d = Math.hypot(p.x - mp.x, p.y - mp.y) - r - meR
        danger = Math.max(danger, clamp(1 - d / 260, 0, 1))
        if (!inView(p.x, p.y, -80) && d < 600) arrows.push({ x: p.x, y: p.y, near: clamp(1 - d / 600, 0, 1) })
      }
    }
    if (!inView(p.x, p.y, r * 2)) continue
    if (ring) {
      ctx.save()
      const threat = ring === 'threat'
      const pulse = threat ? 0.5 + Math.sin(now / 160) * 0.25 : 0.4
      ctx.globalAlpha = pulse
      ctx.strokeStyle = threat ? '#ff4f5a' : '#43d17c'
      ctx.lineWidth = Math.max(2, r * 0.07)
      ctx.setLineDash(threat ? [] : [r * 0.3, r * 0.2])
      ctx.lineDashOffset = -now / 40
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * (f.shark ? 1.7 : 1.45), 0, TAU)
      ctx.stroke()
      ctx.restore()
    }
    const skin = isMe ? CLOWN : f.shark ? SHARK : SKINS[f.hue % SKINS.length]
    drawFish(ctx, p.x, p.y, { r, angle: ang, skin, kind: isMe ? 'me' : f.shark ? 'shark' : 'fish', t: now, speed, mouth, seed: f.id * 1.7, detail: r * z > 16 })
    const tag = isMe ? `Tú · ${Math.round(f.mass)} kg` : `${f.name} · ${Math.round(f.mass)}`
    label(ctx, tag, p.x, p.y - r * (f.shark ? 1.85 : 1.55) - 8 / z, z, isMe ? '#2a0f2e' : ring === 'threat' ? '#fff' : '#fff', isMe ? 'rgba(255, 227, 110, 0.95)' : ring === 'threat' ? 'rgba(200, 30, 50, 0.75)' : 'rgba(6, 14, 34, 0.6)')
  }

  // Burbujas que suelta tu pez al nadar.
  if (meShown) {
    const speed = Math.hypot(me.vx, me.vy)
    if (speed > 1 && now - g.bubbleAt > 220 - Math.min(150, speed * 12)) {
      g.bubbleAt = now
      const p = pos.get(me.id)
      const ang = g.angles.get(me.id) ?? 0
      burst(g, p.x - Math.cos(ang) * meR * 1.4, p.y - Math.sin(ang) * meR * 1.4, '#fff', 1, 'bubble', 0.6)
    }
  }
  // Al salir del agua: tu pez sube y desaparece en un remolino de espuma.
  if (opts.out?.cash) {
    const k = clamp((now - opts.out.at) / 900, 0, 1)
    if (k < 1) {
      drawFish(ctx, opts.out.x, opts.out.y - k * 70, { r: opts.out.r * (1 + k * 0.4), angle: -Math.PI / 2 + 0.3, skin: CLOWN, kind: 'me', t: now, speed: 6, mouth: 0, seed: 0, alpha: 1 - k, detail: true })
    }
    ctx.strokeStyle = `rgba(220, 250, 255, ${0.6 * (1 - k)})`
    ctx.lineWidth = 4 / z
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(opts.out.x, opts.out.y, opts.out.r * (1 + k * (2 + i)), 0, TAU)
      ctx.stroke()
    }
  }

  drawFx(ctx, g, dt)

  // Textos flotantes al comer.
  g.popups = g.popups.filter((p) => now - p.at < 1100)
  for (const p of g.popups) {
    const k = (now - p.at) / 1100
    const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5)
    ctx.globalAlpha = 1 - k * k
    ctx.font = `400 ${((p.big ? 24 : 16) * pop) / Math.max(0.7, z)}px "Lilita One", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = p.big ? '#ffe36e' : '#b6ff7a'
    ctx.strokeStyle = 'rgba(6, 14, 34, 0.9)'
    ctx.lineWidth = 5 / z
    ctx.strokeText(p.text, p.x, p.y - k * 60)
    ctx.fillText(p.text, p.x, p.y - k * 60)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // Rayos de luz que bajan desde la superficie (pantalla).
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 6; i++) {
    const x = ((i * 280 - cam.x * z * 0.25 + now * 0.012) % (cw + 500)) - 250
    const ray = ctx.createLinearGradient(0, 0, 0, ch)
    const al = 0.05 + Math.sin(now / 2000 + i * 1.7) * 0.025
    ray.addColorStop(0, `rgba(200, 246, 255, ${al})`)
    ray.addColorStop(1, 'rgba(200, 246, 255, 0)')
    ctx.fillStyle = ray
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 70 + i * 6, 0)
    ctx.lineTo(x + 240, ch)
    ctx.lineTo(x + 80, ch)
    ctx.fill()
  }
  ctx.restore()
  // Copos que flotan.
  ctx.fillStyle = 'rgba(220, 245, 255, 0.45)'
  for (const s of SNOW) {
    const x = (((s.x * cw * 1.3 - cam.x * z * s.d + now * 0.006 * s.d) % cw) + cw) % cw
    const y = (((s.y * ch * 1.3 - cam.y * z * s.d - now * 0.01 * s.d) % ch) + ch) % ch
    ctx.globalAlpha = 0.25 + s.d * 0.6
    ctx.beginPath()
    ctx.arc(x, y, s.r, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Viñeta (más roja cuanto más cerca tienes a uno que te come).
  const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75)
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vg.addColorStop(1, 'rgba(2, 8, 24, 0.55)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, cw, ch)
  if (danger > 0) {
    const beat = 0.75 + Math.sin(now / 140) * 0.25
    const rg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7)
    rg.addColorStop(0, 'rgba(255, 30, 60, 0)')
    rg.addColorStop(1, `rgba(255, 30, 60, ${0.45 * danger * beat})`)
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, cw, ch)
  }
  // Flechas en el borde hacia los que te comen y aún no ves.
  // Solo las tres más cercanas, para no llenar la pantalla de avisos.
  arrows.sort((x, y) => y.near - x.near)
  for (const ar of arrows.slice(0, 3)) {
    const dx = (ar.x - cam.x) * z
    const dy = (ar.y - cam.y) * z
    const ang = Math.atan2(dy, dx)
    const m = 30
    const k = Math.min((cw / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (ch / 2 - m) / Math.abs(Math.sin(ang) || 1e-6))
    ctx.save()
    ctx.translate(cw / 2 + Math.cos(ang) * k, ch / 2 + Math.sin(ang) * k)
    ctx.rotate(ang)
    ctx.globalAlpha = 0.45 + ar.near * 0.55
    ctx.fillStyle = '#ff4f5a'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(14, 0)
    ctx.lineTo(-8, -11)
    ctx.lineTo(-3, 0)
    ctx.lineTo(-8, 11)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  // Destello al comer o al morir.
  if (g.flash) {
    const k = (now - g.flash.at) / g.flash.ms
    if (k >= 1) g.flash = null
    else {
      ctx.fillStyle = g.flash.color
      ctx.globalAlpha = (1 - k) * g.flash.alpha
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1
    }
  }

  if (opts.demo) return
  // Minimapa abajo a la izquierda.
  const m = Math.min(116, Math.min(cw, ch) * 0.22)
  const mx = 12
  const my = ch - m - 12
  const s = m / pez.WORLD
  ctx.save()
  ctx.fillStyle = 'rgba(6, 20, 40, 0.65)'
  ctx.strokeStyle = 'rgba(143, 227, 255, 0.45)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect?.(mx, my, m, m, 14)
  ctx.fill()
  ctx.stroke()
  ctx.clip()
  // Lo que ves ahora mismo.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 1
  ctx.strokeRect(mx + (cam.x - cw / 2 / z) * s, my + (cam.y - ch / 2 / z) * s, (cw / z) * s, (ch / z) * s)
  for (const b of w.bots) {
    if (!b.alive) continue
    ctx.fillStyle = me.mass >= b.mass * EAT ? '#43d17c' : b.mass >= me.mass * EAT ? '#ff4f5a' : '#cfe7ef'
    ctx.beginPath()
    ctx.arc(mx + b.x * s, my + b.y * s, Math.max(1.6, pez.radiusOf(b.mass) * s), 0, TAU)
    ctx.fill()
  }
  if (me.alive) {
    ctx.fillStyle = '#ffe36e'
    ctx.strokeStyle = '#2a0f2e'
    ctx.beginPath()
    ctx.arc(mx + me.x * s, my + me.y * s, Math.max(3, meR * s), 0, TAU)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}
