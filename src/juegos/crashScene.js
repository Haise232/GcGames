// Escena del Cohete en <canvas>: el cielo se oscurece hacia el espacio según sube el multiplicador, las estrellas pasan
// más rápido, la luna (10×) y un planeta (20×) marcan la altitud, y la explosión es el único gran momento animado.
// No usa React: la pantalla llama a draw() en cada frame con el reloj del servidor.
import { BETS_MS, FLIGHT_MS, MAX_MULT, ROUND_MS, fmtMult, msFor, multiplierAt } from './crash.js'

const C = {
  // Atardecer violeta en la plataforma; espacio casi negro arriba.
  baizeTop: [24, 26, 72],
  baizeLow: [96, 48, 112],
  spaceTop: [3, 4, 14],
  spaceLow: [14, 10, 42],
  brass: '#c8a24b',
  brassLight: '#e9cf86',
  ivory: '#f1e9d6',
  muted: 'rgba(157, 182, 196, 0.75)',
  flame: '#ffe27a',
  ember: '#ff8a3d',
  red: '#c2332c',
  hill: '#140c2c',
  hillFar: '#241843',
}
// Nubes de la nebulosa: posición (fracción del lienzo), radio (fracción del ancho) y color. Aparecen al subir.
const NEBULAS = [
  [0.22, 0.28, 0.55, '122, 92, 255'],
  [0.78, 0.18, 0.45, '255, 79, 154'],
  [0.55, 0.62, 0.5, '34, 211, 238'],
]
// Color de la curva y del halo según el multiplicador: oro, naranja, rosa y violeta.
const tierColor = (mult) => (mult < 200 ? '255, 226, 122' : mult < 500 ? '255, 160, 70' : mult < 1000 ? '255, 92, 150' : '190, 120, 255')
const PAD = { left: 18, right: 54, top: 22, bottom: 30 }
const TICKS = [100, 150, 200, 300, 500, 1000, 1500, 2000, 2500]
const LOG_MAX = Math.log(MAX_MULT / 100)

const mixRgb = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`
const clamp01 = (k) => Math.min(1, Math.max(0, k))
// Altitud de 0 (plataforma) a 1 (25×), en escala logarítmica: cada duplicación sube lo mismo.
const altitudeOf = (mult) => clamp01(Math.log(mult / 100) / LOG_MAX)

// Azar con semilla para que el cielo sea el mismo en cada carga.
function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export function createScene(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d')
  const rand = seeded(20261020)
  // Tres capas de estrellas: las cercanas pasan más rápido (paralaje).
  const layers = [0.25, 0.6, 1.2].map((speed, i) => ({
    speed,
    size: 0.6 + i * 0.5,
    stars: Array.from({ length: 70 - i * 20 }, () => ({ x: rand(), y: rand(), tw: rand() * Math.PI * 2 })),
  }))
  const hills = Array.from({ length: 9 }, () => 0.35 + rand() * 0.65)
  let particles = []
  let w = 0
  let h = 0
  let dpr = 1
  let scroll = 0
  let lastT = null
  let lastState = null
  let lastRound = null
  let boomStart = null

  function resize() {
    const rect = canvas.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = Math.max(1, rect.width)
    h = Math.max(1, rect.height)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }

  function spawn(x, y, kind, count, angle = 0) {
    for (let i = 0; i < count; i++) {
      if (kind === 'exhaust') {
        const spread = (Math.random() - 0.5) * 0.6
        const speed = 40 + Math.random() * 60
        particles.push({ kind, x, y, vx: Math.cos(angle + Math.PI + spread) * speed, vy: Math.sin(angle + Math.PI + spread) * speed, life: 0, max: 0.35 + Math.random() * 0.35, r: 1.5 + Math.random() * 2 })
      } else if (kind === 'smoke') {
        particles.push({ kind, x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 18, vy: -6 - Math.random() * 10, life: 0, max: 1.4 + Math.random(), r: 4 + Math.random() * 5 })
      } else if (kind === 'spark') {
        const a = Math.random() * Math.PI * 2
        const speed = 60 + Math.random() * 220
        particles.push({ kind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, max: 0.6 + Math.random() * 0.7, r: 1 + Math.random() * 2.2 })
      } else if (kind === 'debris') {
        const a = Math.random() * Math.PI * 2
        const speed = 30 + Math.random() * 110
        particles.push({ kind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 30, life: 0, max: 1.2 + Math.random() * 0.8, r: 2 + Math.random() * 3, spin: Math.random() * 10, rot: 0 })
      }
    }
  }

  function step(dt) {
    for (const p of particles) {
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'debris') {
        p.vy += 140 * dt
        p.rot += p.spin * dt
      } else if (p.kind === 'spark') {
        p.vx *= 1 - 1.8 * dt
        p.vy = p.vy * (1 - 1.8 * dt) + 40 * dt
      } else if (p.kind === 'smoke') {
        p.r += 6 * dt
      }
    }
    particles = particles.filter((p) => p.life < p.max)
    if (particles.length > 500) particles = particles.slice(-500)
  }

  function drawParticles() {
    for (const p of particles) {
      const k = 1 - p.life / p.max
      if (p.kind === 'exhaust') {
        ctx.fillStyle = k > 0.6 ? C.flame : k > 0.3 ? C.ember : `rgba(194, 51, 44, ${k * 1.6})`
        ctx.globalAlpha = k
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.6), 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = 0.28 * k
        ctx.fillStyle = C.ivory
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = k
        ctx.strokeStyle = k > 0.5 ? C.flame : C.ember
        ctx.lineWidth = p.r
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
        ctx.stroke()
      } else {
        ctx.globalAlpha = Math.min(1, k * 2)
        ctx.fillStyle = k > 0.5 ? C.ivory : C.brass
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r)
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
  }

  // El cohete apuntando a la derecha (ángulo 0); se gira con la pendiente de la curva.
  function drawRocket(x, y, angle, flame, time) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    if (flame) {
      const f = 1 + Math.sin(time * 0.045) * 0.18 + Math.sin(time * 0.11) * 0.1
      const g = ctx.createLinearGradient(-14, 0, -14 - 22 * f, 0)
      g.addColorStop(0, C.flame)
      g.addColorStop(0.5, C.ember)
      g.addColorStop(1, 'rgba(194, 51, 44, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(-13, -4.5)
      ctx.quadraticCurveTo(-14 - 26 * f, 0, -13, 4.5)
      ctx.closePath()
      ctx.fill()
    }
    // Aletas
    ctx.fillStyle = C.red
    ctx.beginPath()
    ctx.moveTo(-6, -5)
    ctx.lineTo(-15, -12)
    ctx.lineTo(-13, -5)
    ctx.closePath()
    ctx.moveTo(-6, 5)
    ctx.lineTo(-15, 12)
    ctx.lineTo(-13, 5)
    ctx.closePath()
    ctx.fill()
    // Fuselaje
    const body = ctx.createLinearGradient(0, -6, 0, 6)
    body.addColorStop(0, '#fffaf0')
    body.addColorStop(0.55, C.ivory)
    body.addColorStop(1, '#b9ad94')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(-14, -5.5)
    ctx.lineTo(6, -5.5)
    ctx.quadraticCurveTo(17, -3, 20, 0)
    ctx.quadraticCurveTo(17, 3, 6, 5.5)
    ctx.lineTo(-14, 5.5)
    ctx.closePath()
    ctx.fill()
    // Morro y anillo de latón
    ctx.fillStyle = C.red
    ctx.beginPath()
    ctx.moveTo(10, -4.6)
    ctx.quadraticCurveTo(17, -3, 20, 0)
    ctx.quadraticCurveTo(17, 3, 10, 4.6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = C.brass
    ctx.fillRect(-14, -5.5, 2.2, 11)
    // Ojo de buey
    ctx.fillStyle = C.brass
    ctx.beginPath()
    ctx.arc(1, 0, 3.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a6fb5'
    ctx.beginPath()
    ctx.arc(1, 0, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(0.3, -0.8, 0.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function drawFlag(x, y, text, mine, pole = 22) {
    ctx.save()
    ctx.font = `600 ${mine ? 12 : 11}px 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif`
    const tw = ctx.measureText(text).width
    const left = x + tw + 16 > w - PAD.right + 40 ? x - tw - 12 : x
    ctx.strokeStyle = mine ? C.ivory : C.brass
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y - pole)
    ctx.stroke()
    ctx.fillStyle = mine ? C.ivory : 'rgba(200, 162, 75, 0.92)'
    ctx.beginPath()
    ctx.roundRect(left, y - pole - 16, tw + 12, 16, 3)
    ctx.fill()
    ctx.fillStyle = '#1b1405'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, left + 6, y - pole - 8)
    ctx.fillStyle = mine ? C.ivory : C.brass
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // frame: { t, round, boom, auto, cashed, flags: [{ name, mult }] }
  // Devuelve { state, mult } para que la pantalla ponga el texto encima.
  function draw(frame) {
    const { t, round, boom, auto, cashed, flags } = frame
    if (canvas.width !== Math.round(canvas.getBoundingClientRect().width * dpr)) resize()
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, (t - lastT) / 1000))
    lastT = t
    if (round !== lastRound) {
      lastRound = round
      particles = []
      boomStart = null
    }

    const flown = t - (round * ROUND_MS + BETS_MS)
    const boomMs = boom !== null ? msFor(boom) : null
    const state = flown < 0 ? 'waiting' : boomMs !== null && flown >= boomMs ? 'boom' : flown >= FLIGHT_MS ? 'landing' : 'flying'
    const end = Math.max(0, boomMs !== null ? Math.min(flown, boomMs) : Math.min(flown, FLIGHT_MS))
    const mult = state === 'boom' ? boom : multiplierAt(end)
    const alt = state === 'waiting' ? 0 : altitudeOf(mult)

    // Velocidad del cielo: crece con la altitud, se frena tras la explosión.
    const sinceBoom = boomStart === null ? 0 : (t - boomStart) / 1000
    const speed = state === 'flying' || state === 'landing' ? 0.04 + alt * 0.5 : state === 'boom' ? Math.max(0, (0.04 + alt * 0.5) * (1 - sinceBoom)) : 0
    if (!reduced) scroll += speed * dt

    // Sacudida corta al explotar.
    let shakeX = 0
    let shakeY = 0
    if (state === 'boom' && lastState === 'flying' && boomStart === null) boomStart = t
    if (state === 'boom' && boomStart === null) boomStart = t - 2000 // entraste con la ronda ya explotada: sin animación
    if (!reduced && boomStart !== null && t - boomStart < 450) {
      const k = 1 - (t - boomStart) / 450
      shakeX = (Math.random() - 0.5) * 10 * k
      shakeY = (Math.random() - 0.5) * 10 * k
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(shakeX, shakeY)

    // 1. Cielo: del tapete al espacio.
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, mixRgb(C.baizeTop, C.spaceTop, Math.min(1, alt * 1.6)))
    sky.addColorStop(1, mixRgb(C.baizeLow, C.spaceLow, alt))
    ctx.fillStyle = sky
    ctx.fillRect(-10, -10, w + 20, h + 20)
    // Resplandor del horizonte (se apaga al subir).
    if (alt < 0.6) {
      const glow = ctx.createRadialGradient(w * 0.5, h * 1.05, 0, w * 0.5, h * 1.05, w * 0.75)
      glow.addColorStop(0, `rgba(255, 140, 90, ${0.45 * (1 - alt / 0.6)})`)
      glow.addColorStop(1, 'rgba(255, 140, 90, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)
    }
    // Nebulosa: nubes de color que bajan despacio según se sube.
    const nebula = 0.05 + alt * 0.22
    for (const [nx, ny, nr, rgb] of NEBULAS) {
      const cy = ((((ny + scroll * 0.08) % 1.4) + 1.4) % 1.4) * h - h * 0.2
      const r0 = nr * w
      const g = ctx.createRadialGradient(nx * w, cy, 0, nx * w, cy, r0)
      g.addColorStop(0, `rgba(${rgb}, ${nebula})`)
      g.addColorStop(1, `rgba(${rgb}, 0)`)
      ctx.fillStyle = g
      ctx.fillRect(nx * w - r0, cy - r0, r0 * 2, r0 * 2)
    }

    // 2. Estrellas: aparecen al subir y se estiran con la velocidad.
    const starAlpha = 0.25 + alt * 0.75
    const time = t
    for (const layer of layers) {
      const off = scroll * layer.speed
      // Puntos que titilan (sin estelas: de lado parecían lluvia); la capa cercana lleva un halo.
      ctx.fillStyle = C.ivory
      for (const s of layer.stars) {
        const x = (((s.x - off * 0.6) % 1) + 1) % 1
        const y = (((s.y + off) % 1) + 1) % 1
        const px = x * w
        const py = y * h
        const twinkle = reduced ? 1 : 0.65 + 0.35 * Math.sin(time / 600 + s.tw)
        ctx.globalAlpha = starAlpha * twinkle * (0.4 + layer.speed * 0.5)
        if (layer.speed >= 1) {
          ctx.beginPath()
          ctx.arc(px, py, layer.size * 0.9, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha *= 0.25
          ctx.beginPath()
          ctx.arc(px, py, layer.size * 2.6, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(px, py, layer.size, layer.size)
        }
      }
    }
    ctx.globalAlpha = 1

    // 3. Luna (desde 5×) y planeta con anillo (desde 15×): bajan desde arriba según la altitud.
    const moonK = clamp01((alt - altitudeOf(500)) / (altitudeOf(1200) - altitudeOf(500)))
    if (moonK > 0) {
      const mx = w * 0.72
      const my = -40 + moonK * (h * 0.32)
      const r = Math.min(w, h) * 0.075
      const glow = ctx.createRadialGradient(mx, my, r * 0.6, mx, my, r * 2.4)
      glow.addColorStop(0, 'rgba(241, 233, 214, 0.18)')
      glow.addColorStop(1, 'rgba(241, 233, 214, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(mx - r * 3, my - r * 3, r * 6, r * 6)
      ctx.fillStyle = '#e8dfc8'
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(160, 148, 120, 0.45)'
      for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.35, -0.35, 0.1]]) {
        ctx.beginPath()
        ctx.arc(mx + cx * r, my + cy * r, cr * r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    const planetK = clamp01((alt - altitudeOf(1500)) / (altitudeOf(2400) - altitudeOf(1500)))
    if (planetK > 0) {
      const px = w * 0.3
      const py = -60 + planetK * (h * 0.26)
      const r = Math.min(w, h) * 0.06
      const body = ctx.createLinearGradient(px - r, py - r, px + r, py + r)
      body.addColorStop(0, '#d9a85b')
      body.addColorStop(1, '#7a4b2a')
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(-0.35)
      ctx.strokeStyle = 'rgba(233, 207, 134, 0.75)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 1.9, r * 0.5, 0, Math.PI, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 1.9, r * 0.5, 0, 0, Math.PI)
      ctx.stroke()
      ctx.restore()
    }

    // 4. Horizonte: colinas del tapete que se quedan abajo al despegar.
    const drop = Math.min(1, alt * 3) * h * 0.5
    for (const [tone, scale, shift] of [[C.hillFar, 0.16, 0.5], [C.hill, 0.11, 0]]) {
      ctx.fillStyle = tone
      ctx.beginPath()
      ctx.moveTo(-10, h + 10)
      hills.forEach((hh, i) => {
        const x = ((i + shift) / (hills.length - 1)) * (w + 20) - 10
        ctx.lineTo(x, h - PAD.bottom * 0.4 - hh * h * scale + drop)
      })
      ctx.lineTo(w + 10, h + 10)
      ctx.closePath()
      ctx.fill()
    }

    // 5. Escala de la gráfica (crece con el vuelo).
    const plotW = w - PAD.left - PAD.right
    const plotH = h - PAD.top - PAD.bottom
    const xMax = Math.max(8000, end * 1.12)
    const yMax = Math.max(200, mult * 1.22, auto ? auto * 1.12 : 0)
    const X = (ms) => PAD.left + (ms / xMax) * plotW
    const Y = (m) => PAD.top + plotH - ((m - 100) / (yMax - 100)) * plotH

    ctx.font = `600 11px 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    let lastTickY = Infinity
    for (const tick of TICKS) {
      if (tick > yMax) break
      const y = Y(tick)
      // Con el vuelo alto, las marcas bajas se juntan: se salta la que no cabe.
      if (y < PAD.top + 6 || lastTickY - y < 18) continue
      lastTickY = y
      ctx.strokeStyle = 'rgba(241, 233, 214, 0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(w - PAD.right + 6, y)
      ctx.stroke()
      ctx.fillStyle = C.muted
      ctx.fillText(fmtMult(tick), w - PAD.right + 10, y)
    }

    // 6. Tu retiro automático: línea discontinua de latón.
    if (auto && state !== 'waiting') {
      const y = Y(auto)
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = 'rgba(233, 207, 134, 0.8)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(w - PAD.right + 6, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C.brassLight
      ctx.fillText('Auto', PAD.left + 4, y - 9)
    }

    // 7. Curva del vuelo con estela luminosa.
    let tipX = X(0)
    let tipY = Y(100)
    let angle = -Math.PI / 4
    if (state !== 'waiting') {
      const steps = 60
      const pts = []
      for (let i = 0; i <= steps; i++) {
        const ms = (end * i) / steps
        pts.push([X(ms), Y(multiplierAt(ms))])
      }
      tipX = pts[steps][0]
      tipY = Y(mult)
      const prev = pts[Math.max(0, steps - 3)]
      angle = Math.atan2(tipY - prev[1], tipX - prev[0]) || -Math.PI / 8
      const area = ctx.createLinearGradient(0, PAD.top, 0, h)
      const boomed = state === 'boom'
      const tone = tierColor(mult)
      area.addColorStop(0, boomed ? 'rgba(194, 51, 44, 0.3)' : `rgba(${tone}, 0.32)`)
      area.addColorStop(1, `rgba(${tone}, 0)`)
      ctx.fillStyle = area
      ctx.beginPath()
      ctx.moveTo(pts[0][0], Y(100))
      for (const [x, y] of pts) ctx.lineTo(x, y)
      ctx.lineTo(tipX, Y(100))
      ctx.closePath()
      ctx.fill()

      const line = ctx.createLinearGradient(X(0), 0, tipX, 0)
      line.addColorStop(0, boomed ? 'rgba(194, 51, 44, 0.5)' : 'rgba(255, 226, 122, 0.55)')
      line.addColorStop(1, boomed ? '#ff8a7d' : `rgb(${tone})`)
      ctx.strokeStyle = line
      ctx.lineWidth = 4
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = boomed ? 'rgba(255, 90, 70, 0.6)' : `rgba(${tone}, 0.7)`
      ctx.shadowBlur = reduced ? 0 : 18
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // 8. Banderas: dónde retiraste tú y, tras la explosión, quién más retiró.
    // Las que caen cerca se apilan a distinta altura para no taparse; la tuya va la primera (la más baja).
    if (state !== 'waiting') {
      const placed = []
      const poleAt = (x) => {
        const pole = 22 + placed.filter((p) => Math.abs(p - x) < 90).length * 20
        placed.push(x)
        return pole
      }
      const own = cashed && msFor(cashed) <= end + 50 ? { x: X(Math.min(end, msFor(cashed))), y: Y(Math.min(mult, cashed)) } : null
      const ownPole = own ? poleAt(own.x) : 0
      for (const f of flags ?? []) {
        if (!f.mult || msFor(f.mult) > end) continue
        const x = X(msFor(f.mult))
        drawFlag(x, Y(f.mult), `${f.name} ${fmtMult(f.mult)}`, false, poleAt(x))
      }
      if (own) drawFlag(own.x, own.y, `Tú ${fmtMult(cashed)}`, true, ownPole)
    }

    // 9. Cohete, plataforma, partículas y explosión.
    if (state === 'waiting') {
      // En la plataforma, apuntando arriba, con vapor.
      const padX = PAD.left + 26
      const padY = h - PAD.bottom + 4
      ctx.fillStyle = C.brass
      ctx.fillRect(padX - 22, padY, 44, 3)
      ctx.strokeStyle = 'rgba(200, 162, 75, 0.7)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(padX - 18, padY)
      ctx.lineTo(padX - 18, padY - 56)
      ctx.moveTo(padX - 18, padY - 42)
      ctx.lineTo(padX - 8, padY - 42)
      ctx.moveTo(padX - 18, padY - 24)
      ctx.lineTo(padX - 8, padY - 24)
      ctx.stroke()
      if (!reduced && Math.random() < dt * 6) spawn(padX, padY - 4, 'smoke', 1)
      ctx.save()
      ctx.translate(padX, padY - 30)
      ctx.scale(1.45, 1.45)
      drawRocket(0, 0, -Math.PI / 2, false, time)
      ctx.restore()
    } else if (state === 'flying' || state === 'landing') {
      if (!reduced) spawn(tipX - Math.cos(angle) * 26, tipY - Math.sin(angle) * 26, 'exhaust', Math.ceil(3 + alt * 4), angle)
      if (!reduced && flown < 1200) spawn(X(0), Y(100), 'smoke', 1)
      // Halo detrás del cohete, del color del momento.
      const halo = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 46)
      halo.addColorStop(0, `rgba(${tierColor(mult)}, 0.45)`)
      halo.addColorStop(1, `rgba(${tierColor(mult)}, 0)`)
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(tipX, tipY, 46, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.translate(tipX, tipY)
      ctx.scale(1.75, 1.75)
      drawRocket(0, 0, angle, true, time)
      ctx.restore()
    } else if (state === 'boom') {
      if (lastState !== 'boom' && boomStart !== null && t - boomStart < 300 && !reduced) {
        spawn(tipX, tipY, 'spark', 70)
        spawn(tipX, tipY, 'debris', 14)
      }
      const since = (t - boomStart) / 1000
      if (since < 0.9) {
        // Destello y onda expansiva.
        const k = since / 0.9
        const flash = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 60 + k * 40)
        flash.addColorStop(0, `rgba(255, 226, 122, ${0.9 * (1 - k)})`)
        flash.addColorStop(0.4, `rgba(255, 138, 61, ${0.6 * (1 - k)})`)
        flash.addColorStop(1, 'rgba(194, 51, 44, 0)')
        ctx.fillStyle = flash
        ctx.beginPath()
        ctx.arc(tipX, tipY, 100, 0, Math.PI * 2)
        ctx.fill()
        if (!reduced) {
          ctx.strokeStyle = `rgba(241, 233, 214, ${0.7 * (1 - k)})`
          ctx.lineWidth = 2.5 * (1 - k) + 0.5
          ctx.beginPath()
          ctx.arc(tipX, tipY, 12 + k * 90, 0, Math.PI * 2)
          ctx.stroke()
        }
      } else if (reduced || since >= 0.9) {
        // Brasas que quedan donde explotó.
        ctx.fillStyle = 'rgba(194, 51, 44, 0.85)'
        ctx.beginPath()
        ctx.arc(tipX, tipY, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    step(dt)
    drawParticles()
    ctx.restore()

    lastState = state
    return { state, mult, flown }
  }

  resize()
  return { draw, resize }
}
