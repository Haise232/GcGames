// La escena de la Carrera de coches: uno de los circuitos (race.CIRCUITS) visto desde arriba, pintado entero en un canvas 2D.
//
// <RaceScene
//   getNow={() => ms}                 reloj del servidor (Date.now() + diferencia medida); la escena se anima sola con él
//   round={number}                    ronda actual (cada ROUND_MS: apuestas BETS_MS, parrilla GRID_MS, carrera ≤ RACE_MAX_MS, resultado)
//   race={{ start, finish[6], wobble[6][3], winner, order? } | null}   null mientras hay apuestas abiertas; `start` = salida (ms del servidor)
//   seats={[{ car, name, avatar }]}   pilotos humanos de esta carrera; el resto de coches los lleva la IA
//   bets={[{ kind, cars:[coche…], amount }]}   tus apuestas (se marcan todos los coches que apuestas; ★ si es a ganador)
//   mySeat={number | null}            el coche que pilotas tú
//   circuit={number}                  el circuito de esta ronda (race.circuitOf(round)); al cambiar se repinta la pista
//   podium={number[]}                 opcional: premios del podio en centésimas (por defecto race.PODIUM)
//   muted={boolean}  reduced={boolean}
//   onEvent={(e) => void}             { type: 'lights', n } | { type: 'start' } | { type: 'finish', car, place } | { type: 'winner', car, photo }
//                                     (`place` va desde 0: 0 = ganador, como en race.PODIUM; `n` de 1 a 5 luces)
// />
//
// Las posiciones salen SIEMPRE de progress(finish, wobble, getNow() - start): la escena solo anima, nunca decide.
import { useEffect, useRef } from 'react'
import './RaceScene.css'
import { CAR_INFO, CARS, CIRCUITS, GRID_MS, PODIUM, progress, startOf } from './race.js'
import {
  DRAG_TILE,
  LANE_GAP,
  LEN,
  P_CONFETTI,
  P_FIRE,
  P_FLAME,
  P_FLASH,
  P_NITRO,
  P_SMOKE,
  P_SPARK,
  P_STREAK,
  Pool,
  TRACK_W,
  WORLD_H,
  WORLD_W,
  at,
  centerPath,
  drawWet,
  laps,
  makeBackground,
  makeSprites,
  neonInner,
  neonOuter,
  poles,
  rgba,
  rrPath,
  setCircuit,
  shade,
  theme,
  track,
} from './raceArt.js'
import { playBeep, playGo, playLastLap, playOvation, playPass, startEngine2 } from './sound.js'

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif'
const LAUNCH_MS = 1300 // arrancada: aceleración suave en vez de salir ya a toda velocidad
const BRAKE_TAU = 900
const REPLAY_MS = 1900 // la repetición del foto-finish es corta: no retrasa el resultado // frenada tras la meta
const PARADE_V = 150 // unidades/s de la vuelta de formación
const DRAG_WAIT = 600 // en una recta de aceleración no hay vuelta de formación: los coches esperan a esta distancia de su plaza
const DRAG_BRAKE = 2600 // y tras la meta frenan hasta pararse (en un circuito siguen rodando la vuelta de honor)
const LANE = [0, 3, 1, 4, 2, 5] // carril de cada coche (los de la columna izquierda de la parrilla, a un lado)
const GRID_BACK = [0, 1, 2, 3, 4, 5].map((i) => 70 + Math.floor(i / 2) * 125 + (i & 1) * 52)
// Distancia de cada coche a la salida en la parrilla: en una recta de aceleración salen todos en línea, cada uno en su carril.
const gridBack = (i) => (track.open ? 40 : GRID_BACK[i])
const GOLD = '#ffd75a'
const SILVER = '#d5dde6'
const BRONZE = '#d98b52'
const PLACE_COL = [GOLD, SILVER, BRONZE]
const TYRE = ['#ff3b3b', '#ffd23a', '#f4f4f4'] // compuestos: blando, medio, duro
const PALETTE = [...CAR_INFO.map((c) => c.color), GOLD, '#ffffff', '#ff7ac8']
const FIRE_PALETTE = [...CAR_INFO.map((c) => c.color), GOLD, '#ffffff', '#ffb36b']
const TAU = Math.PI * 2

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smooth = (x) => x * x * (3 - 2 * x)
const fmtMult = (cents) => `×${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}`

// ---------- posiciones (todo sale de progress()) ----------
// Progreso mostrado de un coche (fracción de la distancia total). Es progress() tal cual, salvo dos suavizados que no mueven la
// meta: una arrancada progresiva al salir y una frenada que se prolonga tras cruzar la meta (la vuelta de honor).
function shownProgress(race, i, ms) {
  if (ms <= 0) return 0
  const f = race.finish[i]
  const w = race.wobble[i]
  if (ms <= f) {
    let p = progress(f, w, ms)
    const x = ms / LAUNCH_MS
    if (x < 1) {
      let d0 = 1
      for (let j = 0; j < w.length; j++) d0 += Math.PI * (j + 1) * w[j]
      p -= (d0 / f) * ms * (1 - x) * (1 - x)
    }
    return Math.max(0, p)
  }
  let de = 1
  for (let j = 0; j < w.length; j++) de += Math.PI * (j + 1) * w[j] * (j & 1 ? 1 : -1)
  const ve = Math.max(0, de / f)
  const vc = 0.4 / f
  const t = ms - f
  if (track.open) return 1 + ve * DRAG_BRAKE * (1 - Math.exp(-t / DRAG_BRAKE))
  return 1 + vc * t + (ve - vc) * BRAKE_TAU * (1 - Math.exp(-t / BRAKE_TAU))
}

// Vueltas recorridas por el coche `i` a los `ms` de la salida (negativo = aún detrás de la meta, en la parrilla o desfilando).
function carU(race, i, ms) {
  const back = gridBack(i) / LEN
  if (ms < 0) {
    const tau = -ms - GRID_MS // ms que faltan para llegar a su plaza de parrilla
    let dist = 0
    if (tau > 0) {
      const T = 1500
      const v = PARADE_V / 1000
      dist = tau < T ? (v * tau * tau) / (2 * T) : (v * T) / 2 + v * (tau - T)
      if (track.open) dist = Math.min(dist, DRAG_WAIT)
    }
    return -back - dist / LEN
  }
  if (!race) return -back
  const d = shownProgress(race, i, ms) * laps
  return d - back * (1 - smooth(Math.min(1, d / 0.12)))
}

const _o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }

// En las rectas de aceleración se cuenta en metros, como un cuarto de milla: la meta está a DRAG_M.
const DRAG_M = 402
const dragMeters = (race, ms) => Math.round(clamp(shownProgress(race, order0(race, ms), ms), 0, 1) * DRAG_M)
function order0(race, ms) {
  let best = 0
  for (let i = 1; i < CARS; i++) if (shownProgress(race, i, ms) > shownProgress(race, best, ms)) best = i
  return best
}

function makeState() {
  return {
    x: new Float64Array(CARS),
    y: new Float64Array(CARS),
    h: new Float64Array(CARS),
    spd: new Float64Array(CARS),
    brake: new Float64Array(CARS),
    thr: new Float64Array(CARS),
    acc: new Float64Array(CARS),
    slip: new Float64Array(CARS),
    u: new Float64Array(CARS),
    k: new Float64Array(CARS),
    lat: new Float64Array(CARS),
    tx: new Float64Array(CARS),
    ty: new Float64Array(CARS),
  }
}

function computeCars(S, race, ms) {
  for (let i = 0; i < CARS; i++) {
    const u1 = carU(race, i, ms)
    const u2 = carU(race, i, ms - 40)
    const u3 = carU(race, i, ms - 160)
    const u4 = carU(race, i, ms - 200)
    const spd = Math.max(0, ((u1 - u2) * LEN) / 0.04)
    const spdB = Math.max(0, ((u3 - u4) * LEN) / 0.04)
    const acc = (spd - spdB) / 0.16
    const gl = i & 1 ? 26 : -26
    const ll = (LANE[i] - 2.5) * LANE_GAP
    const d = ms > 0 && race ? shownProgress(race, i, ms) * laps : 0
    const blend = track.open ? 1 : smooth(Math.min(1, d / 0.1))
    const lat = gl + (ll - gl) * blend + Math.sin(ms / 900 + i * 2.1) * 2 * blend
    at(u1, lat, _o)
    const slip = Math.abs(_o.k) * spd
    S.x[i] = _o.x
    S.y[i] = _o.y
    S.tx[i] = _o.tx
    S.ty[i] = _o.ty
    S.k[i] = _o.k
    S.u[i] = u1
    S.lat[i] = lat
    S.spd[i] = spd
    S.slip[i] = slip
    S.acc[i] = acc
    S.brake[i] = clamp((-acc - 60) / 200, 0, 1)
    S.thr[i] = clamp((acc - 60) / 200, 0, 1)
    // al arrancar los coches vibran, con el motor a tope y los neumáticos quemando
    const burn = ms < 0 && ms > -1800 ? (ms + 1800) / 1800 : 0
    S.h[i] = Math.atan2(_o.ty, _o.tx) + clamp(_o.k * spd * 0.07, -0.3, 0.3) + Math.sin(ms / 260 + i * 1.7) * 0.025 * Math.min(1, spd / 900) + (burn ? Math.sin(ms / 14 + i * 2) * 0.014 * burn : 0)
  }
}

// Información derivada de una carrera (se calcula una vez por objeto `race`).
function raceInfo(race) {
  const idx = [0, 1, 2, 3, 4, 5].sort((a, b) => race.finish[a] - race.finish[b])
  const order = Array.isArray(race.order) && race.order.length === CARS ? race.order.slice() : idx
  const place = new Int8Array(CARS)
  order.forEach((c, p) => (place[c] = p))
  const t0 = race.finish[order[0]]
  const gapMs = race.finish[order[1]] - t0
  const photo = gapMs < 150
  return { order, place, t0, photo, gapMs }
}

// Luces del semáforo: 5 luces que se encienden a intervalos iguales dentro de la parrilla, y se apagan todas a la salida.
const LIGHT_STEP = (GRID_MS - 1000) / 5
function lightsAt(ms) {
  if (ms >= 0) return 0
  return clamp(Math.floor((ms + GRID_MS - 400) / LIGHT_STEP) + 1, 0, 5)
}

const fmtGap = (ms) => `+${(ms / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`

function initials(name) {
  const s = String(name || '?').trim()
  return (s[0] || '?').toUpperCase()
}

// ---------- la escena ----------
function mount(canvas, P) {
  const g = canvas.getContext('2d', { alpha: false })
  let built = P.current.circuit ?? 0 // el circuito pintado en la capa estática
  setCircuit(built)
  let bg = makeBackground()
  const spr = makeSprites()
  const asphaltPattern = g.createPattern(spr.asphalt, 'repeat')
  // Marcas de neumáticos. En una recta solo hace falta el principio (las salidas): el lienzo de toda la recta sería enorme.
  const marks = document.createElement('canvas')
  const clearMarks = () => {
    marks.width = Math.min(WORLD_W, 5200)
    marks.height = WORLD_H
  }
  clearMarks()
  const mg = marks.getContext('2d')
  mg.lineCap = 'round'
  const world = new Pool(560, [])
  const screen = new Pool(320, PALETTE)
  const fire = new Pool(520, FIRE_PALETTE)
  world.sprite = spr.smoke
  world.sprite2 = spr.warm

  const S = makeState()
  const S2 = makeState()
  const TR = 14
  const trail = new Float32Array(CARS * TR * 2)
  let trailHead = 0
  let trailN = 0
  const prevMark = new Float32Array(CARS * 4).fill(NaN)

  let dpr = 1
  let cw = 1
  let ch = 1
  let u = 1 // escala de la interfaz (0.8 en móvil)
  let vignette = null
  const cam = { x: WORLD_W / 2, y: WORLD_H / 2, z: 1, vx: 0, vy: 0 }
  let snap = true
  let shake = 0
  let flash = 0
  let fade = 0
  let key = null
  let last = 0
  let raf = 0
  let rinfo = null
  let rinfoFor = null
  let ev = null
  let lastPass = 0
  let engine = null
  let engineTry = 0
  let lastAria = 0
  let lastAriaText = ''
  let fireworkAt = 0
  let dead = false
  const rowY = new Float64Array(CARS).fill(NaN)
  const order = [0, 1, 2, 3, 4, 5]
  const prevOrder = [0, 1, 2, 3, 4, 5]
  const keys = new Float64Array(CARS)
  const pilot = new Array(CARS).fill(null)
  const betOn = new Float64Array(CARS)
  const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
  const o2 = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
  let camVelX = 0
  let camVelY = 0
  const rank = new Int8Array(CARS)
  const prevRank = new Int8Array(CARS).fill(-1)
  const arrowT = new Float64Array(CARS).fill(-9999) // cuándo cambió de puesto por última vez
  const arrowD = new Int8Array(CARS)
  let popup = null // cartel emergente: { t, text, sub, col, big }
  let lastPopup = -9999
  let punch = 0 // «golpe» de zoom en los momentos clave
  let roll = 0 // ligera inclinación de la cámara en las curvas
  let dprCap = 2
  let lowFx = false
  let emaDt = 0.016
  let perfAt = 0
  let hype = 0 // 0..1, la tensión de la carrera: sube con las vueltas
  let flashUntil = 0 // flashes de los fotógrafos
  const betWin = new Uint8Array(CARS)
  let vignetteHot = null

  const resize = () => {
    const r = canvas.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, dprCap)
    cw = Math.max(1, Math.round(r.width))
    ch = Math.max(1, Math.round(r.height))
    canvas.width = Math.round(cw * dpr)
    canvas.height = Math.round(ch * dpr)
    u = cw < 560 ? 0.8 : 1
    const v = document.createElement('canvas')
    v.width = Math.max(2, Math.round(cw / 2))
    v.height = Math.max(2, Math.round(ch / 2))
    const vg = v.getContext('2d')
    const gr = vg.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.38, v.width / 2, v.height / 2, Math.hypot(v.width, v.height) * 0.55)
    gr.addColorStop(0, 'rgba(0,0,8,0)')
    gr.addColorStop(1, 'rgba(0,0,8,0.62)')
    vg.fillStyle = gr
    vg.fillRect(0, 0, v.width, v.height)
    vignette = v
    const h = document.createElement('canvas')
    h.width = v.width
    h.height = v.height
    const hg = h.getContext('2d')
    const gr2 = hg.createRadialGradient(h.width / 2, h.height / 2, Math.min(h.width, h.height) * 0.3, h.width / 2, h.height / 2, Math.hypot(h.width, h.height) * 0.52)
    gr2.addColorStop(0, 'rgba(255,60,30,0)')
    gr2.addColorStop(1, 'rgba(255,50,20,0.55)')
    hg.fillStyle = gr2
    hg.fillRect(0, 0, h.width, h.height)
    vignetteHot = h
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  const emit = (e) => P.current.onEvent?.(e)

  // ----- cámara -----
  const camTarget = (ms, race, info, p, out) => {
    const minDim = Math.min(cw, ch)
    const reduced = p.reduced
    let need
    if (ms < -GRID_MS) {
      let mx = 0
      let my = 0
      for (let i = 0; i < CARS; i++) {
        mx += S.x[i]
        my += S.y[i]
      }
      out.x = mx / CARS
      out.y = my / CARS
      need = u < 1 ? 880 : 1000
      out.dx = 0
      out.dy = 0
    } else if (ms < 0) {
      at(-(190 / LEN), 0, o)
      const f = smooth(clamp((ms + GRID_MS) / GRID_MS, 0, 1))
      out.x = o.x + o.tx * 40
      out.y = o.y + o.ty * 40
      need = (u < 1 ? 700 : 760) - (reduced ? 0 : 140 * f)
      out.dx = 0
      out.dy = 0
    } else {
      const lead = order[0]
      const a = order[1]
      const b = order[2]
      const won = info && ms >= info.t0
      const c4 = won ? order[2] : order[3]
      out.x = S.x[lead] * 0.6 + (S.x[lead] + S.x[a] + S.x[b]) * (0.4 / 3)
      out.y = S.y[lead] * 0.6 + (S.y[lead] + S.y[a] + S.y[b]) * (0.4 / 3)
      const spread = Math.hypot(S.x[lead] - S.x[c4], S.y[lead] - S.y[c4])
      const spdL = S.spd[lead]
      need = clamp(spread * 1.05 + 300, u < 1 ? 500 : 560, u < 1 ? 640 : 720) + spdL * 0.06
      if (spread < 260) need *= 0.93
      need *= 1 - hype * 0.07
      if (won) need = Math.max(u < 1 ? 500 : 580, need - clamp((ms - info.t0) / 1500, 0, 1) * 200)
      const l = Math.min(280, spdL * 0.2)
      out.dx = S.tx[lead] * l
      out.dy = S.ty[lead] * l
    }
    if (reduced) need = Math.round(need / 120) * 120
    out.z = Math.max((minDim / need) * (1 + punch * 0.06), cw / WORLD_W, ch / WORLD_H)
  }
  const tgt = { x: 0, y: 0, z: 1, dx: 0, dy: 0 }

  const drawStatic = (g) => {
    const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
    const o2 = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
    g.drawImage(bg, 0, 0)
    // pista: resplandor de neón, runoff, pianos, asfalto con textura
    g.lineJoin = 'round'
    g.lineCap = 'butt'
    g.strokeStyle = `rgba(${theme.neon},0.05)`
    g.lineWidth = TRACK_W + 110
    g.stroke(centerPath)
    g.strokeStyle = `rgba(${theme.neon},0.07)`
    g.lineWidth = TRACK_W + 70
    g.stroke(centerPath)
    g.strokeStyle = theme.runoff
    g.lineWidth = TRACK_W + 44
    g.stroke(centerPath)
    g.strokeStyle = theme.kerb[0]
    g.lineWidth = TRACK_W + 22
    g.stroke(centerPath)
    g.setLineDash([24, 24])
    g.strokeStyle = theme.kerb[1]
    g.stroke(centerPath)
    g.setLineDash([])
    g.strokeStyle = '#f2f4f6'
    g.lineWidth = TRACK_W + 2
    g.stroke(centerPath)
    g.strokeStyle = theme.asphalt
    g.lineWidth = TRACK_W - 5
    g.stroke(centerPath)
    g.strokeStyle = asphaltPattern
    g.stroke(centerPath)
    g.strokeStyle = 'rgba(0,0,0,0.20)'
    g.lineWidth = 120
    g.stroke(centerPath)
    g.strokeStyle = 'rgba(255,255,255,0.025)'
    g.lineWidth = 28
    g.stroke(centerPath)
    if (theme.wet) drawWet(g)
    // reflejos de las farolas y de la valla de neón en el asfalto mojado
    g.globalCompositeOperation = 'lighter'
    for (const pl of poles) {
      const nx = -pl.ty
      const ny = pl.tx
      const lx = pl.x - pl.side * nx * 70
      const ly = pl.y - pl.side * ny * 70
      const gr = g.createLinearGradient(lx, ly, lx, ly + 90)
      gr.addColorStop(0, `rgba(${theme.lamp},0.28)`)
      gr.addColorStop(1, `rgba(${theme.lamp},0)`)
      g.fillStyle = gr
      g.beginPath()
      g.ellipse(lx, ly + 44, 9, 48, 0, 0, TAU)
      g.fill()
    }
    for (const path of [neonInner, neonOuter]) {
      g.strokeStyle = `rgba(${theme.neon},0.07)`
      g.lineWidth = 26
      g.stroke(path)
    }
    g.globalCompositeOperation = 'source-over'

    // valla de neón
    g.globalCompositeOperation = 'lighter'
    for (const path of [neonInner, neonOuter]) {
      g.strokeStyle = `rgba(${theme.neon},0.18)`
      g.lineWidth = 9
      g.stroke(path)
    }
    g.globalCompositeOperation = 'source-over'

    // línea de meta y casillas de parrilla
    at(0, 0, o)
    g.save()
    g.translate(o.x, o.y)
    g.rotate(Math.atan2(o.ty, o.tx))
    const n = Math.floor((TRACK_W - 8) / 12)
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < n; c++) {
        g.fillStyle = (r + c) & 1 ? '#10141a' : '#f7f7f2'
        g.fillRect(-12 + r * 12, -(n * 6) + c * 12, 12, 12)
      }
    }
    g.restore()
    g.strokeStyle = 'rgba(255,255,255,0.4)'
    g.lineWidth = 2
    for (let i = 0; i < CARS; i++) {
      at(-(GRID_BACK[i] / LEN), i & 1 ? 26 : -26, o2)
      g.save()
      g.translate(o2.x, o2.y)
      g.rotate(Math.atan2(o2.ty, o2.tx))
      g.beginPath()
      g.moveTo(-34, -18)
      g.lineTo(-34, 18)
      g.moveTo(34, -18)
      g.lineTo(34, -12)
      g.moveTo(34, 18)
      g.lineTo(34, 12)
      g.stroke()
      g.restore()
    }

    // charcos de luz de las farolas
    g.globalCompositeOperation = 'lighter'
    for (const pl of poles) {
      const nx = -pl.ty
      const ny = pl.tx
      g.globalAlpha = 0.85
      g.drawImage(spr.lamp, pl.x - pl.side * nx * 70 - 190, pl.y - pl.side * ny * 70 - 190, 380, 380)
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }


  // Recta de aceleración: el tramo que se repite (fondo, pista con sus pianos, carriles, valla de neón y luz de las farolas).
  const drawStaticDrag = (g) => {
    const W = DRAG_TILE
    const y0 = track.y0
    const hw = TRACK_W / 2
    const band = (half, fill) => {
      g.fillStyle = fill
      g.fillRect(0, y0 - half, W, half * 2)
    }
    g.drawImage(bg, 0, 0)
    band((TRACK_W + 110) / 2, `rgba(${theme.neon},0.05)`)
    band((TRACK_W + 70) / 2, `rgba(${theme.neon},0.07)`)
    band((TRACK_W + 44) / 2, theme.runoff)
    for (const s of [-1, 1]) {
      const y = y0 + s * (hw + 5.5) - 5.5
      g.fillStyle = theme.kerb[0]
      g.fillRect(0, y, W, 11)
      g.fillStyle = theme.kerb[1]
      for (let x = 0; x < W; x += 48) g.fillRect(x, y, 24, 11)
    }
    band(hw + 1, '#f2f4f6')
    band(hw - 2.5, theme.asphalt)
    g.fillStyle = asphaltPattern
    g.fillRect(0, y0 - hw + 2.5, W, TRACK_W - 5)
    // goma de las salidas en el centro de cada carril y líneas discontinuas entre carriles
    for (let l = 0; l < CARS; l++) {
      const y = y0 + (l - 2.5) * LANE_GAP
      const gr = g.createLinearGradient(0, y - 9, 0, y + 9)
      gr.addColorStop(0, 'rgba(0,0,0,0)')
      gr.addColorStop(0.5, 'rgba(0,0,0,0.28)')
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(0, y - 9, W, 18)
    }
    g.fillStyle = 'rgba(255,255,255,0.32)'
    for (let l = 1; l < CARS; l++) {
      const y = y0 + (l - 3) * LANE_GAP
      for (let x = 0; x < W; x += 60) g.fillRect(x, y - 1, 30, 2)
    }
    g.globalCompositeOperation = 'lighter'
    for (const s of [-1, 1]) {
      g.fillStyle = `rgba(${theme.neon},0.18)`
      g.fillRect(0, y0 + s * (hw + 34) - 4.5, W, 9)
      g.fillStyle = `rgba(${theme.neon},0.07)`
      g.fillRect(0, y0 + s * (hw + 34) - 13, W, 26)
    }
    // charcos de luz de las farolas (en las mismas x que `poles`, que se repiten cada tramo)
    for (let k = 0; k * 400 < W; k++) {
      const side = k % 2 ? 1 : -1
      const lx = k * 400 + 200
      const ly = y0 + side * (hw + 56) - side * 70
      g.globalAlpha = 0.85
      g.drawImage(spr.lamp, lx - 190, ly - 190, 380, 380)
      g.globalAlpha = 1
      const gr = g.createLinearGradient(lx, ly, lx, ly + 90)
      gr.addColorStop(0, `rgba(${theme.lamp},0.28)`)
      gr.addColorStop(1, `rgba(${theme.lamp},0)`)
      g.fillStyle = gr
      g.beginPath()
      g.ellipse(lx, ly + 44, 9, 48, 0, 0, TAU)
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'
  }

  // Recta de aceleración: lo que no se repite (salida, parrilla, distancias y meta), pintado en cada fotograma.
  const drawDragLines = (g, cx, ext) => {
    const hw = TRACK_W / 2
    const near = (x, pad) => Math.abs(x - cx) < ext + pad
    const checker = (u, cols) => {
      at(u, 0, o)
      if (!near(o.x, 200)) return
      const n = Math.floor((TRACK_W - 8) / 12)
      for (let r = 0; r < cols; r++) {
        for (let c = 0; c < n; c++) {
          g.fillStyle = (r + c) & 1 ? '#10141a' : '#f7f7f2'
          g.fillRect(o.x - (cols * 12) / 2 + r * 12, o.y - n * 6 + c * 12, 12, 12)
        }
      }
    }
    checker(0, 2)
    checker(1, 4)
    // casillas de la parrilla, una por carril
    g.strokeStyle = 'rgba(255,255,255,0.45)'
    g.lineWidth = 2
    for (let i = 0; i < CARS; i++) {
      at(-(gridBack(i) / LEN), (LANE[i] - 2.5) * LANE_GAP, o2)
      if (near(o2.x, 100)) g.strokeRect(o2.x - 34, o2.y - 15, 68, 30)
    }
    // distancia pintada en el asfalto y en carteles a los lados, cada 100 m
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (let m = 100; m < DRAG_M - 50; m += 100) {
      at(m / DRAG_M, 0, o)
      if (!near(o.x, 200)) continue
      g.save()
      g.translate(o.x, o.y)
      g.rotate(-Math.PI / 2)
      g.fillStyle = 'rgba(255,255,255,0.22)'
      g.font = `900 64px ${FONT}`
      g.fillText(String(m), 0, 0)
      g.restore()
      for (const s of [-1, 1]) {
        g.fillStyle = '#0b1016'
        rrPath(g, o.x - 34, o.y + s * (hw + 64) - 16, 68, 32, 6)
        g.fill()
        g.strokeStyle = `rgba(${theme.neonHi},0.8)`
        g.stroke()
        g.fillStyle = '#fff'
        g.font = `800 20px ${FONT}`
        g.fillText(`${m} m`, o.x, o.y + s * (hw + 64) + 1)
      }
    }
    // la meta: pórtico de cuadros y META en el asfalto
    at(1, 0, o)
    if (near(o.x, 400)) {
      g.save()
      g.translate(o.x + 70, o.y)
      g.rotate(-Math.PI / 2)
      g.fillStyle = 'rgba(255,255,255,0.3)'
      g.font = `900 70px ${FONT}`
      g.fillText('META', 0, 0)
      g.restore()
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(o.x + 4, o.y - hw - 18, 22, TRACK_W + 36)
      g.fillStyle = '#161c23'
      rrPath(g, o.x - 12, o.y - hw - 16, 20, TRACK_W + 32, 4)
      g.fill()
      for (let c = 0; c < 2; c++) {
        for (let r = 0; r * 8 < TRACK_W + 24; r++) {
          g.fillStyle = (r + c) & 1 ? '#0c0f13' : '#f6f6f1'
          g.fillRect(o.x - 10 + c * 8, o.y - hw - 12 + r * 8, 8, 8)
        }
      }
    }
  }

  // Capa estática (fondo, pista, líneas, charcos de luz): se pinta una sola vez y luego es un solo drawImage.
  // En una recta de aceleración es un tramo de DRAG_TILE que se repite. Como mucho ~12 Mpx: los móviles no admiten más.
  const SS = window.devicePixelRatio > 1.5 && window.innerWidth >= 700 ? 2 : 1.5
  const stat = document.createElement('canvas')
  const sg = stat.getContext('2d')
  const paintStatic = () => {
    const sw = track.open ? DRAG_TILE : WORLD_W
    const ss = Math.min(SS, Math.sqrt(12e6 / (sw * WORLD_H)))
    stat.width = Math.round(sw * ss)
    stat.height = Math.round(WORLD_H * ss)
    sg.setTransform(ss, 0, 0, ss, 0, 0)
    if (track.open) drawStaticDrag(sg)
    else drawStatic(sg)
  }
  paintStatic()

  // Cambio de circuito (al empezar cada ronda): se vuelven a pintar el fondo y la capa estática.
  const rebuild = (i) => {
    built = i
    setCircuit(i)
    bg = makeBackground()
    paintStatic()
    clearMarks()
    snap = true
  }

  // ----- dibujo del mundo (también para la repetición) -----
  const worldDraw = (vp, St, ms, race, main, now, p) => {
    const { ox, oy, w, h, x: cx, y: cy, z } = vp
    const rr0 = vp.r || 0
    const ca = z * Math.cos(rr0)
    const sa = z * Math.sin(rr0)
    const sx0 = ox + w / 2
    const sy0 = oy + h / 2
    g.setTransform(dpr * ca, dpr * sa, -dpr * sa, dpr * ca, dpr * (sx0 - ca * cx + sa * cy), dpr * (sy0 - sa * cx - ca * cy))
    if (track.open) {
      // la recta: el tramo de fondo repetido solo donde se ve, y encima lo que no se repite
      const ext = Math.hypot(w, h) / 2 / z + 20
      const k1 = Math.floor((cx + ext) / DRAG_TILE)
      for (let k = Math.max(0, Math.floor((cx - ext) / DRAG_TILE)); k <= k1; k++) {
        g.drawImage(stat, 0, 0, stat.width, stat.height, k * DRAG_TILE, 0, DRAG_TILE + 0.5, WORLD_H)
      }
      if (main) g.drawImage(marks, 0, 0)
      drawDragLines(g, cx, ext)
    } else {
      g.drawImage(stat, 0, 0, WORLD_W, WORLD_H)
      if (main) g.drawImage(marks, 0, 0)
    }

    // valla de neón (los destellos van animados)
    g.globalCompositeOperation = 'lighter'
    for (const path of [neonInner, neonOuter]) {
      g.strokeStyle = `rgba(${theme.neonHi},0.7)`
      g.lineWidth = 2.2
      g.setLineDash([46, 28])
      g.lineDashOffset = -now / 40
      g.stroke(path)
      g.setLineDash([])
    }
    g.globalCompositeOperation = 'source-over'

    // conos de los faros
    for (let i = 0; i < CARS; i++) {
      g.save()
      g.translate(St.x[i], St.y[i])
      g.rotate(St.h[i])
      g.globalAlpha = 0.9
      g.drawImage(spr.cone, 26, -50, 190, 100)
      g.restore()
    }
    g.globalAlpha = 1

    // estela de luz
    if (main && !p.reduced && !lowFx) {
      g.lineCap = 'round'
      for (let i = 0; i < CARS; i++) {
        if (St.spd[i] < 300) continue
        g.strokeStyle = rgba(CAR_INFO[i].color, 0.5 + St.thr[i] * 0.3)
        const tw = 7 + St.thr[i] * 6
        for (let s = 0; s < trailN - 1; s++) {
          const a = ((trailHead - 1 - s + TR * 2) % TR) * 2
          const b = ((trailHead - 2 - s + TR * 2) % TR) * 2
          g.globalAlpha = (1 - s / TR) * 0.7
          g.lineWidth = tw * (1 - s / TR)
          g.beginPath()
          g.moveTo(trail[(i * TR * 2) + a], trail[(i * TR * 2) + a + 1])
          g.lineTo(trail[(i * TR * 2) + b], trail[(i * TR * 2) + b + 1])
          g.stroke()
        }
      }
      g.globalAlpha = 1
    }
    // rebufo: líneas de aire tras el coche de delante cuando otro va pegado
    if (!p.reduced && !lowFx) {
      g.lineCap = 'round'
      g.lineWidth = 1.4
      for (let i = 0; i < CARS; i++) {
        for (let j = 0; j < CARS; j++) {
          if (i === j || St.spd[j] < 500) continue
          let d = St.u[i] - St.u[j]
          if (!track.open) d -= Math.round(d)
          d *= LEN
          if (d < 30 || d > 230 || Math.abs(St.lat[i] - St.lat[j]) > 44) continue
          const k = 1 - d / 230
          const hx = Math.cos(St.h[i])
          const hy = Math.sin(St.h[i])
          g.strokeStyle = `rgba(210,236,255,${0.12 + k * 0.4})`
          for (let l = -1; l <= 1; l++) {
            const off = l * 7 + Math.sin(now / 70 + l * 2 + i) * 1.5
            const bx = St.x[i] - hx * 33 - hy * off
            const by = St.y[i] - hy * 33 + hx * off
            const len = d * (0.7 + 0.3 * Math.sin(now / 55 + l + j))
            g.beginPath()
            g.moveTo(bx, by)
            g.lineTo(bx - hx * len, by - hy * len)
            g.stroke()
          }
        }
      }
    }
    // brillo de color bajo cada coche sobre el asfalto mojado
    for (let i = 0; i < CARS; i++) {
      g.globalAlpha = 0.5 + St.thr[i] * 0.3
      g.drawImage(spr.car[i], St.x[i] - 56, St.y[i] - 56, 112, 112)
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'

    // sombras
    for (let i = 0; i < CARS; i++) {
      g.save()
      g.translate(St.x[i] + 5, St.y[i] + 7)
      g.rotate(St.h[i])
      g.drawImage(spr.shadow, -45, -26, 90, 52)
      g.restore()
    }

    // halo de tus apuestas y del coche que pilotas
    for (let i = 0; i < CARS; i++) {
      const mine = p.mySeat === i
      const bet = betOn[i] > 0
      if (!mine && !bet) continue
      g.save()
      g.translate(St.x[i], St.y[i])
      g.globalCompositeOperation = 'lighter'
      g.globalAlpha = 0.55 + 0.25 * Math.sin(now / 260)
      g.drawImage(spr.car[i], -62, -62, 124, 124)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.lineWidth = 3
      g.setLineDash([12, 9])
      g.lineDashOffset = -now / 28
      g.strokeStyle = mine ? '#5ff0ff' : GOLD
      g.beginPath()
      g.arc(0, 0, 43, 0, TAU)
      g.stroke()
      if (mine && bet) {
        g.strokeStyle = GOLD
        g.lineDashOffset = now / 28
        g.beginPath()
        g.arc(0, 0, 49, 0, TAU)
        g.stroke()
      }
      g.setLineDash([])
      g.restore()
    }

    // coches
    for (let i = 0; i < CARS; i++) {
      g.save()
      g.translate(St.x[i], St.y[i])
      g.rotate(St.h[i])
      const steer = clamp(St.k[i] * 90, -0.38, 0.38)
      const ph = (St.u[i] * LEN) % 9
      // neumáticos de F1: los traseros más anchos, con la banda del compuesto (blando, medio o duro) en el flanco
      const tyre = TYRE[i % TYRE.length]
      for (const s of [-1, 1]) {
        for (const front of [true, false]) {
          const ww = front ? 12 : 13.5
          const wh = front ? 6.8 : 8.4
          const wx = front ? 19 : -19
          const wy = s * (front ? 11.4 : 11.2)
          g.save()
          g.translate(wx, wy)
          if (front) g.rotate(steer)
          g.fillStyle = '#0c0e11'
          rrPath(g, -ww / 2, -wh / 2, ww, wh, 2.2)
          g.fill()
          g.fillStyle = 'rgba(255,255,255,0.13)'
          for (let t = 0; t < 3; t++) g.fillRect(-ww / 2 + ((ph + t * 3) % 9) * (ww / 9), -wh / 2 + 0.6, 1, wh - 1.2)
          g.fillStyle = tyre
          g.fillRect(-ww / 2 + 1.6, s > 0 ? wh / 2 - 1.3 : -wh / 2 + 0.5, ww - 3.2, 0.8)
          g.fillStyle = '#3a4048'
          g.beginPath()
          g.arc(0, s > 0 ? -wh / 2 + 0.2 : wh / 2 - 0.2, 1.3, 0, TAU)
          g.fill()
          g.restore()
        }
      }
      g.drawImage(spr.cars[i], -35, -20, 70, 40)
      // luces
      g.globalCompositeOperation = 'lighter'
      // luz de lluvia (la de un F1 es una sola, en el centro del alerón trasero): parpadea al frenar
      g.globalAlpha = 0.45 + 0.55 * St.brake[i] * (0.6 + 0.4 * Math.sin(now / 40))
      const sz = 16 + 24 * St.brake[i]
      g.drawImage(spr.red, -27 - sz / 2, -sz / 2, sz, sz)
      g.globalAlpha = 1
      // llama del escape y, al acelerar a fondo, llamarada azul de nitro con su estela
      const nit = St.thr[i]
      const idle = ms < 0 && St.spd[i] < 40 && !p.reduced ? 0.25 * (0.5 + 0.5 * Math.sin(now / 45 + i * 3)) : 0
      const cruise = St.spd[i] > 200 ? 0.3 : 0
      const fl = Math.max(nit, idle)
      if (nit > 0.12 && !p.reduced) {
        const len = (30 + 60 * nit) * (0.85 + 0.15 * Math.sin(now / 28 + i * 5))
        g.save()
        g.scale(-1, 1)
        g.globalAlpha = Math.min(1, nit * 1.8)
        g.drawImage(spr.nitro, 31, -7 - nit * 2, len, 14 + nit * 4)
        g.globalAlpha = Math.min(1, nit * 1.2)
        g.drawImage(spr.nitroTrail, 31, -8, 90 + 150 * nit, 16)
        g.restore()
        g.globalAlpha = nit * 0.8
        g.drawImage(spr.warm, -50, -26, 52, 52)
        g.globalAlpha = 1
      } else if (fl > 0.08 || cruise) {
        const f2 = Math.max(fl, cruise)
        const len = (12 + 20 * f2) * (0.8 + 0.2 * Math.sin(now / 35 + i * 5))
        g.save()
        g.scale(-1, 1)
        g.globalAlpha = Math.min(1, f2 * 1.6)
        g.drawImage(spr.flame, 31, -5, len, 10)
        g.restore()
      }
      g.globalCompositeOperation = 'source-over'
      g.restore()
    }

    if (main) {
      g.globalCompositeOperation = 'source-over'
      world.draw(g, P_SMOKE)
      g.globalCompositeOperation = 'lighter'
      world.draw(g, P_SPARK)
      world.draw(g, P_FLAME)
      world.draw(g, P_NITRO)
      world.draw(g, P_FLASH)
      g.globalCompositeOperation = 'source-over'
    }

    // farolas (cabezas) y pórtico de salida, por encima de los coches
    const r2 = (w / z + 700) ** 2
    g.globalCompositeOperation = 'lighter'
    for (const pl of poles) {
      if ((pl.x - cx) ** 2 + (pl.y - cy) ** 2 > r2) continue
      const nx = -pl.ty
      const ny = pl.tx
      g.drawImage(spr.warm, pl.x - pl.side * nx * 70 - 22, pl.y - pl.side * ny * 70 - 22, 44, 44)
    }
    g.globalCompositeOperation = 'source-over'
    for (const pl of poles) {
      if ((pl.x - cx) ** 2 + (pl.y - cy) ** 2 > r2) continue
      const nx = -pl.ty
      const ny = pl.tx
      g.strokeStyle = 'rgba(38,48,58,0.85)'
      g.lineWidth = 2.5
      g.beginPath()
      g.moveTo(pl.x + pl.side * nx * 6, pl.y + pl.side * ny * 6)
      g.lineTo(pl.x - pl.side * nx * 70, pl.y - pl.side * ny * 70)
      g.stroke()
      g.fillStyle = '#fff6d8'
      g.beginPath()
      g.arc(pl.x - pl.side * nx * 70, pl.y - pl.side * ny * 70, 5, 0, TAU)
      g.fill()
    }

    // pórtico del semáforo
    at(0.0025, 0, o)
    g.save()
    g.translate(o.x, o.y)
    g.rotate(Math.atan2(o.ty, o.tx))
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.fillRect(-4, -TRACK_W / 2 - 18, 22, TRACK_W + 36)
    g.fillStyle = '#161c23'
    rrPath(g, -12, -TRACK_W / 2 - 16, 20, TRACK_W + 32, 4)
    g.fill()
    g.strokeStyle = '#3a4653'
    g.lineWidth = 1.5
    g.stroke()
    g.fillStyle = '#0c1015'
    g.fillRect(-14, -TRACK_W / 2 - 22, 24, 14)
    g.fillRect(-14, TRACK_W / 2 + 8, 24, 14)
    const nl = ms < 0 ? lightsAt(ms) : 0
    const green = ms >= 0 && ms < 900
    for (let k = 0; k < 5; k++) {
      const ly = (k - 2) * 34
      const lit = green || k < nl
      g.fillStyle = lit ? (green ? '#8bffa8' : '#ff3b30') : '#3a0d0d'
      g.beginPath()
      g.arc(-2, ly, 10, 0, TAU)
      g.fill()
      if (lit) {
        g.globalCompositeOperation = 'lighter'
        g.drawImage(green ? spr.green : spr.red, -2 - 36, ly - 36, 72, 72)
        g.globalCompositeOperation = 'source-over'
      }
    }
    g.restore()
  }

  // ----- partículas, huellas y rastro (solo la vista principal) -----
  let rub = 0 // vibración por coches rueda con rueda
  let focus = 0
  const simulate = (dt, ms, race, info, p) => {
    const reduced = p.reduced
    focus = p.mySeat != null && p.mySeat >= 0 ? p.mySeat : order[0]
    // estela
    rub = 0
    const dest = trailHead * 2
    for (let i = 0; i < CARS; i++) {
      trail[i * TR * 2 + dest] = S.x[i]
      trail[i * TR * 2 + dest + 1] = S.y[i]
    }
    trailHead = (trailHead + 1) % TR
    trailN = Math.min(TR, trailN + 1)
    for (let i = 0; i < CARS; i++) {
      const spd = S.spd[i]
      const hx = S.tx[i]
      const hy = S.ty[i]
      const ch0 = Math.cos(S.h[i])
      const sh0 = Math.sin(S.h[i])
      const rx = S.x[i] - ch0 * 22
      const ry = S.y[i] - sh0 * 22
      const launching = ms > 0 && ms < 1500
      const burning = ms < 0 && ms > -1800
      const burn = burning ? (ms + 1800) / 1800 : 0
      const sliding = S.slip[i] > 4.2 && spd > 350
      // huellas y humo en los neumáticos traseros (y quemando rueda en la parrilla)
      for (const s of [-1, 1]) {
        const wx = S.x[i] - ch0 * 17 - sh0 * s * 11.4
        const wy = S.y[i] - sh0 * 17 + ch0 * s * 11.4
        const idx = i * 4 + (s > 0 ? 2 : 0)
        if (sliding || launching || burning) {
          if (!burning) {
            if (!Number.isNaN(prevMark[idx])) {
              mg.strokeStyle = `rgba(0,0,0,${launching ? 0.26 : 0.13})`
              mg.lineWidth = 3
              mg.beginPath()
              mg.moveTo(prevMark[idx], prevMark[idx + 1])
              mg.lineTo(wx, wy)
              mg.stroke()
            }
            prevMark[idx] = wx
            prevMark[idx + 1] = wy
          }
          const pr = launching ? 0.75 : burning ? 0.25 + 0.6 * burn : 0.5
          if (!reduced && Math.random() < pr) {
            const sp0 = burning ? 70 : 30
            world.spawn(P_SMOKE, wx, wy, (Math.random() - 0.5) * sp0 - hx * 40 + sh0 * s * (burning ? 20 : 0), (Math.random() - 0.5) * sp0 - hy * 40 - ch0 * s * (burning ? 20 : 0), 0.7 + Math.random() * 0.6, (burning ? 7 : 6) + Math.random() * 5)
          }
          if (burning && !reduced && Math.random() < 0.3 * burn) {
            world.spawn(P_SPARK, wx, wy, -hx * 120 + (Math.random() - 0.5) * 200, -hy * 120 + (Math.random() - 0.5) * 200, 0.25 + Math.random() * 0.2, 1.5)
          }
        } else prevMark[idx] = NaN
      }
      if (reduced) continue
      // nitro: ascuas azules que se quedan atrás
      if (S.thr[i] > 0.25) {
        for (let k = 0; k < 2; k++) {
          if (Math.random() < 0.8) world.spawn(P_NITRO, rx - ch0 * 14, ry - sh0 * 14, -hx * 200 + (Math.random() - 0.5) * 90, -hy * 200 + (Math.random() - 0.5) * 90, 0.3 + Math.random() * 0.2, 3 + Math.random() * 3)
        }
      }
      if (burning && Math.random() < 0.4) {
        world.spawn(P_FLAME, rx - ch0 * 8, ry - sh0 * 8, -hx * 90 + (Math.random() - 0.5) * 40, -hy * 90 + (Math.random() - 0.5) * 40, 0.15, 4 + Math.random() * 3)
      }
      // rueda con rueda: chispas entre dos coches casi pegados
      for (let j = i + 1; j < CARS; j++) {
        if (spd < 500 || S.spd[j] < 500) continue
        let d = S.u[i] - S.u[j]
        if (!track.open) d -= Math.round(d)
        d *= LEN
        if (Math.abs(d) > 46 || Math.abs(S.lat[i] - S.lat[j]) > 46) continue
        if (Math.random() < 0.55) {
          const mx = (S.x[i] + S.x[j]) / 2
          const my = (S.y[i] + S.y[j]) / 2
          world.spawn(P_SPARK, mx, my, -hx * 320 + (Math.random() - 0.5) * 300, -hy * 320 + (Math.random() - 0.5) * 300, 0.25 + Math.random() * 0.25, 1.6)
        }
        rub = Math.max(rub, i === focus || j === focus ? 1.6 : 0.8)
      }
      if (spd > 500 && Math.random() < 0.05 + S.slip[i] * 0.01) {
        const sx = S.x[i] - ch0 * 24
        const sy = S.y[i] - sh0 * 24
        world.spawn(P_SPARK, sx, sy, -hx * 280 + (Math.random() - 0.5) * 240, -hy * 280 + (Math.random() - 0.5) * 240, 0.28 + Math.random() * 0.2, 1.4)
      }
    }
    // flashes de los fotógrafos en la grada al cruzar la meta
    if (!reduced && info && ms >= info.t0 - 100 && ms < info.t0 + 3600) {
      for (let k = 0; k < 2; k++) {
        if (Math.random() < 0.7) {
          at(track.open ? 0.96 + Math.random() * 0.08 : -0.06 + Math.random() * 0.15, TRACK_W / 2 + 85 + Math.random() * 100, o)
          world.spawn(P_FLASH, o.x, o.y, 0, 0, 0.12 + Math.random() * 0.14, 26 + Math.random() * 30)
        }
      }
    }
    world.update(dt)
    screen.update(dt)
    fire.update(dt)
  }

  // ----- bucle -----
  const frame = (t) => {
    raf = requestAnimationFrame(frame)
    if (dead) return
    if (document.hidden) {
      last = 0
      return
    }
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016
    const gapMs = last ? t - last : 0
    last = t
    // calidad adaptable: si el equipo no da 40 fps, bajamos la resolución y quitamos los efectos más caros
    if (gapMs > 0 && gapMs < 200) emaDt += (gapMs / 1000 - emaDt) * 0.05
    if (!window.__noAdapt && t - perfAt > 1500) {
      perfAt = t
      if (emaDt > 0.026) {
        if (dprCap > 1 && (window.devicePixelRatio || 1) > 1) {
          dprCap = 1
          resize()
        } else lowFx = true
      }
    }
    const p = P.current
    const reduced = !!p.reduced
    if ((p.circuit ?? 0) !== built) rebuild(p.circuit ?? 0)
    const now = p.getNow()
    const race = p.race || null
    const startMs = race ? race.start : startOf(Number.isFinite(p.round) ? p.round : Math.floor(now / 55000))
    const ms = now - startMs
    const nowReal = t

    if (race && rinfoFor !== race) {
      rinfo = raceInfo(race)
      rinfoFor = race
    }
    const info = race ? rinfo : null
    const rkey = startMs

    // nueva ronda: cortamos con un fundido
    const newRound = key !== rkey
    if (newRound) {
      if (key !== null && !reduced) fade = 1
      key = rkey
      ev = null
      snap = true
      clearMarks()
      world.clear()
      screen.clear()
      fire.clear()
      trailN = 0
      prevMark.fill(NaN)
      rowY.fill(NaN)
      lastPass = 0
      prevRank.fill(-1)
      arrowT.fill(-9999)
      popup = null
      punch = 0
      hype = 0
      flashUntil = 0
    }

    // pilotos y apuestas
    pilot.fill(null)
    for (const s of p.seats || []) if (s && s.car >= 0 && s.car < CARS) pilot[s.car] = s
    betOn.fill(0)
    betWin.fill(0)
    for (const b of p.bets || []) {
      if (!b || !Array.isArray(b.cars)) continue
      b.cars.forEach((c, k) => {
        if (c >= 0 && c < CARS) {
          betOn[c] += b.amount
          if (b.kind === 'win' || ((b.kind === 'exacta' || b.kind === 'trifecta') && k === 0)) betWin[c] = 1
        }
      })
    }

    computeCars(S, race, ms)

    // posiciones
    for (let i = 0; i < CARS; i++) {
      if (!race || ms < 0) keys[i] = -gridBack(i)
      else keys[i] = ms >= race.finish[i] ? 10 + (1e6 - race.finish[i]) / 1e6 : shownProgress(race, i, ms) * 0.9 + progress(race.finish[i], race.wobble[i], ms) * 0.1
    }
    for (let i = 0; i < CARS; i++) prevOrder[i] = order[i]
    for (let i = 0; i < CARS; i++) order[i] = i
    order.sort((a, b) => keys[b] - keys[a])

    // eventos (solo los que vemos ocurrir; al entrar tarde no se repiten)
    const live = !!race
    if (!ev) {
      ev = { lights: lightsAt(ms), started: ms >= 0, fin: new Uint8Array(CARS), winner: false, raceSeen: live, lastLap: laps < 2 || (ms > 0 && !!race && shownProgress(race, order[0], ms) * laps >= laps - 1) }
      if (race) {
        for (let i = 0; i < CARS; i++) ev.fin[i] = ms >= race.finish[i] ? 1 : 0
        ev.winner = ms >= info.t0
      }
    } else {
      const n = lightsAt(ms)
      if (n !== ev.lights) {
        if (n > ev.lights && gapMs < 1500) {
          emit({ type: 'lights', n })
          if (!p.muted) playBeep(n)
        }
        ev.lights = n
      }
      if (!ev.started && ms >= 0) {
        ev.started = true
        if (live && gapMs < 2500) {
          emit({ type: 'start' })
          if (!p.muted) playGo()
          if (!reduced) shake = Math.max(shake, 5)
        }
      }
      if (race) {
        if (!ev.raceSeen) {
          ev.raceSeen = true
          for (let i = 0; i < CARS; i++) ev.fin[i] = ms >= race.finish[i] ? 1 : 0
          ev.winner = ms >= info.t0
        }
        for (let pl = 0; pl < CARS; pl++) {
          const car = info.order[pl]
          if (!ev.fin[car] && ms >= race.finish[car]) {
            ev.fin[car] = 1
            emit({ type: 'finish', car, place: pl })
            if (pl === 0) {
              ev.winner = true
              emit({ type: 'winner', car, photo: info.photo })
              if (!p.muted) playOvation()
              punch = 1
              popup = null
              if (!reduced) {
                shake = Math.max(shake, 9)
                flash = 0.22
                fireworkAt = nowReal
                for (let k = 0; k < 110; k++) {
                  screen.spawn(P_CONFETTI, Math.random() * cw, -10 - Math.random() * 60, (Math.random() - 0.5) * 140, 40 + Math.random() * 120, 3.2 + Math.random() * 2, 3 + Math.random() * 2.5, Math.floor(Math.random() * PALETTE.length), Math.random() * TAU, (Math.random() - 0.5) * 9)
                }
              }
            } else if (!reduced) shake = Math.max(shake, 3)
          }
        }
      }
    }

    // tensión, última vuelta y adelantamientos
    // tensión según lo recorrido por el líder (en fracción de la carrera, para que valga igual en una recta)
    const leadLaps = race && ms > 0 ? shownProgress(race, order[0], ms) * laps : 0
    const leadF = (leadLaps / laps) * 3
    const racing = race && ms > 300 && !(info && ms >= info.t0 - 150)
    if (race && ms > 0) {
      const target = info && ms >= info.t0 ? Math.max(0, 1 - (ms - info.t0) / 2500) * 0.9 : leadF < 2 ? 0.15 + 0.2 * (leadF / 2) : 0.5 + 0.5 * clamp(leadF - 2, 0, 1)
      hype += (target - hype) * (1 - Math.exp(-dt * 2.5))
    } else hype += (0 - hype) * (1 - Math.exp(-dt * 3))
    if (ev && racing && ev.raceSeen && !ev.lastLap && laps > 1 && leadLaps >= laps - 1) {
      ev.lastLap = true
      popup = { t: nowReal, text: '¡ÚLTIMA VUELTA!', sub: '', col: '#ff5a3c', big: 2 }
      lastPopup = nowReal
      punch = 1
      if (!reduced) flash = Math.max(flash, 0.12)
      if (!p.muted) playLastLap()
    } else if (ev && (laps < 2 || leadLaps >= laps - 1)) ev.lastLap = true
    for (let r = 0; r < CARS; r++) rank[order[r]] = r
    if (racing && prevRank[0] >= 0) {
      let mover = -1
      let moverRank = 9
      let victim = -1
      for (let c = 0; c < CARS; c++) {
        if (rank[c] !== prevRank[c]) {
          arrowT[c] = nowReal
          arrowD[c] = rank[c] < prevRank[c] ? 1 : -1
          if (rank[c] < prevRank[c] && rank[c] < moverRank) {
            mover = c
            moverRank = rank[c]
          }
        }
      }
      if (mover >= 0) {
        for (let c = 0; c < CARS; c++) if (c !== mover && rank[c] === moverRank + 1 && prevRank[c] === moverRank) victim = c
        const relevant = moverRank <= 2 || p.mySeat === mover || betOn[mover] > 0
        const gap = nowReal - lastPopup
        if (moverRank === 0 && gap > 500) {
          popup = { t: nowReal, text: '¡CAMBIO DE LÍDER!', sub: `${CAR_INFO[mover].name} toma la cabeza`, col: CAR_INFO[mover].color, big: 1 }
          lastPopup = nowReal
          punch = Math.max(punch, 0.8)
          if (!reduced) shake = Math.max(shake, 2.5)
        } else if (relevant && gap > 1100) {
          popup = { t: nowReal, text: '¡ADELANTAMIENTO!', sub: victim >= 0 ? `${CAR_INFO[mover].name} pasa a ${CAR_INFO[victim].name}` : `${CAR_INFO[mover].name} sube al ${moverRank + 1}.º`, col: CAR_INFO[mover].color, big: 0 }
          lastPopup = nowReal
        }
      }
    }
    for (let c = 0; c < CARS; c++) prevRank[c] = racing ? rank[c] : -1
    punch *= Math.exp(-dt * 4)

    // adelantamientos: un silbido
    if (race && ms > 800 && ms < (info?.t0 || 1e9) && nowReal - lastPass > 1400 && !p.muted) {
      for (let i = 0; i < 3; i++) {
        if (order[i] !== prevOrder[i] && prevOrder[i] !== undefined) {
          playPass()
          lastPass = nowReal
          break
        }
      }
    }

    // cámara
    camTarget(ms, race, info, p, tgt)
    const tx = tgt.x + tgt.dx
    const ty = tgt.y + tgt.dy
    if (snap || dt > 0.2) {
      cam.x = tx
      cam.y = ty
      cam.z = tgt.z
      snap = false
      camVelX = 0
      camVelY = 0
    } else {
      const kp = 1 - Math.exp(-dt * 7)
      const kz = 1 - Math.exp(-dt * 1.8)
      const ox = cam.x
      const oy = cam.y
      cam.x += (tx - cam.x) * kp
      cam.y += (ty - cam.y) * kp
      cam.z += (tgt.z - cam.z) * kz
      camVelX = (cam.x - ox) / Math.max(dt, 0.001)
      camVelY = (cam.y - oy) / Math.max(dt, 0.001)
    }
    // mantener la vista dentro del mundo cuando cabe
    const hx = cw / (2 * cam.z)
    const hy = ch / (2 * cam.z)
    const vx = hx * 2 < WORLD_W ? clamp(cam.x, hx, WORLD_W - hx) : WORLD_W / 2
    const vy = hy * 2 < WORLD_H ? clamp(cam.y, hy, WORLD_H - hy) : WORLD_H / 2
    shake *= Math.exp(-dt * 3.2)
    const spdLead = S.spd[order[0]]
    const leadK = S.k[order[0]]
    const rollT = reduced || ms < 0 ? 0 : clamp(leadK * spdLead * 0.016, -0.06, 0.06)
    roll += (rollT - roll) * (1 - Math.exp(-dt * 3))
    const burnShake = !reduced && ms < 0 && ms > -1800 ? 1.6 * ((ms + 1800) / 1800) : 0
    const shk = reduced ? 0 : shake + burnShake + rub + (ms > 0 ? Math.min(1, spdLead / 1500) * (0.8 + hype * 1.2) : 0)
    const sx = shk ? (Math.sin(nowReal * 0.091) + Math.sin(nowReal * 0.053 + 1.3) * 0.6) * shk : 0
    const sy = shk ? (Math.sin(nowReal * 0.077 + 2) + Math.sin(nowReal * 0.067) * 0.6) * shk : 0

    simulate(dt, ms, race, info, p)

    // velocidad percibida: rayitas que cruzan la pantalla
    if (!reduced && ms > 0) {
      const sp = Math.hypot(camVelX, camVelY) * cam.z
      const n = lowFx ? 1 : 1 + Math.floor(hype * 3)
      for (let q = 0; q < n; q++) {
        if (sp > 260 && Math.random() < 0.9) {
          const k = 1.1 + hype * 0.6
          screen.spawn(P_STREAK, Math.random() * cw, Math.random() * ch, -camVelX * cam.z * k, -camVelY * cam.z * k, 0.26, 0.07)
        }
      }
    }

    // fuegos artificiales de la celebración
    if (!reduced && info && ms >= info.t0 && ms < info.t0 + 5200 && nowReal - fireworkAt > 380) {
      fireworkAt = nowReal
      const fx = cw * (0.15 + Math.random() * 0.7)
      const fy = ch * (0.12 + Math.random() * 0.3)
      const c = Math.floor(Math.random() * FIRE_PALETTE.length)
      for (let k = 0; k < 34; k++) {
        const a = (k / 34) * TAU + Math.random() * 0.2
        const v = 90 + Math.random() * 110
        fire.spawn(P_FIRE, fx, fy, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.5, 3.4 + Math.random() * 2.2, (c + (k % 3 === 0 ? 1 : 0)) % FIRE_PALETTE.length)
      }
    }

    // ------- pintar -------
    const vpMain = { ox: 0, oy: 0, w: cw, h: ch, x: vx + sx / cam.z, y: vy + sy / cam.z, z: cam.z, r: roll }
    worldDraw(vpMain, S, ms, race, true, nowReal, p)

    // repetición en cámara lenta del cruce de meta (foto-finish)
    const replayAt = info ? ms - (info.t0 + 450) : -1
    let replayShown = false
    if (info && info.photo && replayAt >= 0 && replayAt < REPLAY_MS) {
      replayShown = true
      if (!reduced) drawReplay(race, info, replayAt, nowReal, p)
    }

    // ------- interfaz en píxeles CSS -------
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    g.drawImage(vignette, 0, 0, cw, ch)
    if (!reduced && !lowFx && hype > 0.5) {
      g.globalAlpha = (hype - 0.5) * 0.9 * (0.75 + 0.25 * Math.sin(nowReal / 140))
      g.drawImage(vignetteHot, 0, 0, cw, ch)
      g.globalAlpha = 1
    }

    g.globalCompositeOperation = 'lighter'
    fire.draw(g, P_FIRE)
    g.globalCompositeOperation = 'source-over'
    screen.draw(g, P_STREAK)
    screen.draw(g, P_CONFETTI)

    drawLabels(race, info, ms, p, nowReal)
    drawBoard(race, info, ms, p, dt, nowReal)
    drawSemaphore(race, ms, nowReal, p)
    drawMinimap(ms, info, p)
    drawBanner(race, info, ms, nowReal, p)
    drawPopup(nowReal, p)
    if (!(replayShown && u < 1 && !reduced)) drawPodium(race, info, ms, nowReal, p)

    if (flash > 0.01) {
      g.fillStyle = `rgba(255,255,255,${flash})`
      g.fillRect(0, 0, cw, ch)
      flash *= Math.exp(-dt * 5)
    }
    if (fade > 0.01) {
      g.fillStyle = `rgba(3,8,12,${Math.min(1, fade)})`
      g.fillRect(0, 0, cw, ch)
      fade = Math.max(0, fade - dt * 1.6)
    }

    // sonido del motor
    audioTick(ms, info, p, nowReal)
    // etiqueta accesible, de vez en cuando
    if (nowReal - lastAria > 2500) {
      lastAria = nowReal
      const text = describe(race, info, ms)
      if (text !== lastAriaText) {
        lastAriaText = text
        canvas.setAttribute('aria-label', text)
      }
    }
  }

  const describe = (race, info, ms) => {
    const nm = (c) => CAR_INFO[c].name
    if (ms < -GRID_MS || !race) return ms < 0 ? `${CIRCUITS[built].name}: los coches van hacia la salida` : 'Carrera a punto de empezar'
    if (ms < 0) return 'Parrilla de salida: cuenta atrás del semáforo'
    if (ms >= info.t0) {
      const done = info.order.filter((c) => ms >= race.finish[c])
      return `Meta: gana ${nm(info.order[0])}. ${done.slice(0, 3).map((c, i) => `${i + 1}.º ${nm(c)}`).join(', ')}`
    }
    const lap = clamp(Math.floor(shownProgress(race, order[0], ms) * laps) + 1, 1, laps)
    const where = track.open ? `${dragMeters(race, ms)} de ${DRAG_M} metros` : `vuelta ${lap} de ${laps}`
    return `Carrera en curso, ${where}: ${order.slice(0, 3).map((c, i) => `${i + 1}.º ${nm(c)}`).join(', ')}`
  }

  // ----- sonido -----
  const audioTick = (ms, info, p, nowReal) => {
    if (p.muted || document.hidden) {
      if (engine) {
        engine.stop()
        engine = null
      }
      return
    }
    if (!engine && nowReal - engineTry > 1500) {
      engineTry = nowReal
      engine = startEngine2()
    }
    if (!engine) return
    const car = p.mySeat != null && p.mySeat >= 0 ? p.mySeat : order[0]
    const spd = S.spd[car]
    // cambios de marcha: el tono sube dentro de cada marcha y cae al cambiar
    const GEAR = 300
    const g0 = clamp(Math.floor(spd / GEAR), 0, 5)
    const frac = clamp((spd - g0 * GEAR) / GEAR, 0, 1)
    let pitch = clamp(0.28 + 0.5 * frac + 0.035 * g0, 0, 1)
    let vol = ms < -GRID_MS ? 0.3 : ms < 0 ? 0.5 : 0.95
    if (ms < 0 && ms > -1800) pitch = 0.55 + 0.35 * Math.abs(Math.sin(ms / 70)) * ((ms + 1800) / 1800 + 0.3)
    if (ms < -GRID_MS) pitch = 0.18
    if (info) vol *= 1 - smooth(clamp((ms - info.t0 - 1000) / 4000, 0, 1)) * 0.85
    const turbo = ms > 0 ? S.thr[car] : 0
    const screech = clamp((S.slip[car] - 3.8) / 2.4, 0, 1)
    engine.set(pitch, vol, turbo, screech)
  }

  // ----- repetición -----
  const drawReplay = (race, info, el, nowReal, p) => {
    const mob = u < 1
    const bw = mob ? cw - 24 : Math.round(Math.min(cw * 0.4, 520 * u))
    const bh = Math.round(bw * (mob ? 0.5 : 0.6))
    const bx = cw - bw - 12 * u
    const bb = bannerBox(info, p)
    const by = mob ? bb.cy + bb.bh / 2 + 6 : 12 * u
    const t2 = info.t0 - 190 + el * 0.2
    computeCars(S2, race, t2)
    at(0, 0, o)
    const z = bw / 520
    const alpha = Math.min(1, el / 200, (REPLAY_MS - el) / 250)
    g.save()
    g.globalAlpha = alpha
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.beginPath()
    rrPath(g, bx, by, bw, bh, 10)
    g.clip()
    worldDraw({ ox: bx, oy: by, w: bw, h: bh, x: o.x + o.tx * 34, y: o.y + o.ty * 34, z: z * (mob ? 1.4 : 1.15) }, S2, t2, race, false, nowReal, p)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.globalAlpha = alpha
    // franja de la línea y etiquetas de los dos primeros
    const zz = z * (mob ? 1.4 : 1.15)
    const toX = (wx) => bx + bw / 2 + (wx - (o.x + o.tx * 34)) * zz
    const toY = (wy) => by + bh / 2 + (wy - (o.y + o.ty * 34)) * zz
    g.strokeStyle = 'rgba(255,60,60,0.9)'
    g.lineWidth = 1.5
    g.setLineDash([5, 4])
    g.beginPath()
    g.moveTo(toX(o.x), by)
    g.lineTo(toX(o.x), by + bh)
    g.stroke()
    g.setLineDash([])
    g.font = `800 ${11 * u}px ${FONT}`
    g.textAlign = 'center'
    for (let pl = 0; pl < 2; pl++) {
      const c = info.order[pl]
      const lx = toX(S2.x[c])
      const ly = toY(S2.y[c]) - 26 * zz
      g.fillStyle = PLACE_COL[pl]
      g.fillText(`${pl + 1}.º`, lx, ly)
    }
    g.textAlign = 'left'
    const grd = g.createLinearGradient(0, by, 0, by + 24 * u)
    grd.addColorStop(0, 'rgba(0,0,0,0.75)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(bx, by, bw, 24 * u)
    g.fillStyle = '#ff5e5e'
    g.beginPath()
    g.arc(bx + 14 * u, by + 12 * u, 4 * u * (0.8 + 0.2 * Math.sin(nowReal / 150)), 0, TAU)
    g.fill()
    g.fillStyle = '#fff'
    g.font = `800 ${11 * u}px ${FONT}`
    g.fillText('FOTO FINISH · CÁMARA LENTA ×0,2 · ' + fmtGap(info.gapMs), bx + 24 * u, by + 16 * u)
    g.restore()
    g.save()
    g.globalAlpha = alpha
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.strokeStyle = 'rgba(255,215,90,0.85)'
    g.lineWidth = 2
    rrPath(g, bx, by, bw, bh, 10)
    g.stroke()
    g.restore()
  }

  // ----- interfaz -----
  const pill = (x, y, w, h, fill, stroke) => {
    rrPath(g, x, y, w, h, Math.min(h / 2, 10))
    g.fillStyle = fill
    g.fill()
    if (stroke) {
      g.strokeStyle = stroke
      g.lineWidth = 1.2
      g.stroke()
    }
  }

  const toScreen = (wx, wy, out) => {
    const hx = cw / (2 * cam.z)
    const hy = ch / (2 * cam.z)
    const vx = hx * 2 < WORLD_W ? clamp(cam.x, hx, WORLD_W - hx) : WORLD_W / 2
    const vy = hy * 2 < WORLD_H ? clamp(cam.y, hy, WORLD_H - hy) : WORLD_H / 2
    const dx = wx - vx
    const dy = wy - vy
    const c = Math.cos(roll) * cam.z
    const sn = Math.sin(roll) * cam.z
    out.x = cw / 2 + c * dx - sn * dy
    out.y = ch / 2 + sn * dx + c * dy
  }

  const sp = { x: 0, y: 0 }
  const drawLabels = (race, info, ms, p, nowReal) => {
    g.textBaseline = 'alphabetic'
    for (let i = 0; i < CARS; i++) {
      toScreen(S.x[i], S.y[i], sp)
      if (sp.x < -20 || sp.x > cw + 20 || sp.y < -20 || sp.y > ch + 20) {
        // fuera de plano: una flecha en el borde con su color y su número
        const m = 20 * u
        const ex = clamp(sp.x, m, cw - m)
        const ey = clamp(sp.y, m + (ex < 260 * u ? 150 * u : 0), ch - m - (ex > cw - 190 * u ? 100 * u : 0))
        const ang = Math.atan2(sp.y - ey, sp.x - ex)
        g.save()
        g.translate(ex, ey)
        g.fillStyle = 'rgba(6,14,20,0.8)'
        g.beginPath()
        g.arc(0, 0, 13 * u, 0, TAU)
        g.fill()
        g.fillStyle = CAR_INFO[i].color
        g.beginPath()
        g.arc(0, 0, 10 * u, 0, TAU)
        g.fill()
        if (p.mySeat === i || betOn[i] > 0) {
          g.strokeStyle = p.mySeat === i ? '#5ff0ff' : GOLD
          g.lineWidth = 2
          g.beginPath()
          g.arc(0, 0, 13 * u, 0, TAU)
          g.stroke()
        }
        g.fillStyle = '#0b1218'
        g.font = `800 ${11 * u}px ${FONT}`
        g.textAlign = 'center'
        g.fillText(String(i + 1), 0, 4 * u)
        g.rotate(ang)
        g.fillStyle = CAR_INFO[i].color
        g.beginPath()
        g.moveTo(17 * u, 0)
        g.lineTo(11 * u, -5 * u)
        g.lineTo(11 * u, 5 * u)
        g.fill()
        g.restore()
        g.textAlign = 'left'
        continue
      }
      const mine = p.mySeat === i
      const s = pilot[i]
      const txt = mine ? 'TÚ' : s ? String(s.name).slice(0, 12) : 'IA'
      const fs = clamp(cam.z * 9.5, 10, 13) * (u < 1 ? 0.92 : 1)
      g.font = `700 ${fs}px ${FONT}`
      const tw = g.measureText(txt).width
      const hasBet = betOn[i] > 0
      const w = tw + fs * 2.2 + (hasBet ? fs * 1.6 : 0)
      const h = fs * 1.7
      const x = sp.x - w / 2
      const y = sp.y - 34 * cam.z - h
      pill(x, y, w, h, 'rgba(6,14,20,0.72)', mine ? '#5ff0ff' : rgba(CAR_INFO[i].color, 0.9))
      g.fillStyle = CAR_INFO[i].color
      g.beginPath()
      g.arc(x + h / 2, y + h / 2, h * 0.36, 0, TAU)
      g.fill()
      g.fillStyle = '#0b1218'
      g.textAlign = 'center'
      g.font = `800 ${fs * 0.85}px ${FONT}`
      g.fillText(s ? initials(s.name) : String(i + 1), x + h / 2, y + h / 2 + fs * 0.3)
      g.textAlign = 'left'
      g.font = `700 ${fs}px ${FONT}`
      g.fillStyle = s ? '#f1e9d6' : 'rgba(241,233,214,0.7)'
      g.fillText(txt, x + h + fs * 0.35, y + h / 2 + fs * 0.35)
      if (hasBet) {
        g.fillStyle = GOLD
        g.fillText(betWin[i] ? '★' : '$', x + w - fs * 1.1, y + h / 2 + fs * 0.35)
      }
    }
    void race
    void info
    void ms
    void nowReal
  }

  const drawBoard = (race, info, ms, p, dt, nowReal) => {
    const bu = u < 1 ? 0.78 : 1
    const rowH = 25 * bu
    const w = (u < 1 ? 190 : 236) * bu
    const x = 10 * bu
    const y = 10 * bu
    const hdrH = 25 * bu
    const total = hdrH + rowH * CARS + 6 * bu
    pill(x, y, w, total, 'rgba(6,14,20,0.66)', 'rgba(200,162,75,0.35)')
    // cabecera
    let head
    if (!race || ms < -GRID_MS) head = track.open ? 'A LA LÍNEA DE SALIDA' : 'VUELTA DE FORMACIÓN'
    else if (ms < 0) head = 'PARRILLA DE SALIDA'
    else if (info && ms >= info.t0) head = 'META'
    else if (track.open) head = `${dragMeters(race, ms)} / ${DRAG_M} M`
    else head = `VUELTA ${clamp(Math.floor(shownProgress(race, order[0], ms) * laps) + 1, 1, laps)} / ${laps}`
    g.font = `800 ${11.5 * bu}px ${FONT}`
    g.fillStyle = '#c8a24b'
    g.textAlign = 'left'
    g.fillText(head, x + 12 * bu, y + 17 * bu)
    const prizes = p.podium || PODIUM
    for (let r = 0; r < CARS; r++) {
      const c = order[r]
      const ty = y + hdrH + r * rowH
      if (Number.isNaN(rowY[c])) rowY[c] = ty
      rowY[c] += (ty - rowY[c]) * (1 - Math.exp(-dt * 10))
      const ry = rowY[c]
      const fin = race && ms >= race.finish[c]
      const place = fin && info ? info.place[c] : r
      if (r < 3) {
        const gr = g.createLinearGradient(x, 0, x + w, 0)
        gr.addColorStop(0, rgba(PLACE_COL[r], 0.22))
        gr.addColorStop(1, rgba(PLACE_COL[r], 0.02))
        g.fillStyle = gr
        rrPath(g, x + 4 * bu, ry + 1, w - 8 * bu, rowH - 2, 7)
        g.fill()
      }
      // cambio de puesto: la fila destella en verde (sube) o rojo (baja)
      const since = nowReal - arrowT[c]
      if (since < 1300 && !fin) {
        const a = 1 - since / 1300
        g.fillStyle = arrowD[c] > 0 ? `rgba(70,230,120,${a * 0.38})` : `rgba(255,80,70,${a * 0.34})`
        rrPath(g, x + 4 * bu, ry + 1, w - 8 * bu, rowH - 2, 7)
        g.fill()
      }
      // tus apuestas: barra dorada (cian si pilotas tú) en el borde de la fila
      if (betOn[c] > 0 || p.mySeat === c) {
        g.fillStyle = p.mySeat === c ? '#5ff0ff' : GOLD
        rrPath(g, x + 4 * bu, ry + 4 * bu, 3 * bu, rowH - 8 * bu, 1.5)
        g.fill()
      }
      // puesto
      g.fillStyle = r < 3 ? PLACE_COL[r] : 'rgba(241,233,214,0.12)'
      g.beginPath()
      g.arc(x + 17 * bu, ry + rowH / 2, 9 * bu, 0, TAU)
      g.fill()
      g.fillStyle = r < 3 ? '#1b1405' : '#f1e9d6'
      g.font = `800 ${11.5 * bu}px ${FONT}`
      g.textAlign = 'center'
      g.fillText(String((fin ? place : r) + 1), x + 17 * bu, ry + rowH / 2 + 4 * bu)
      // chip del coche
      g.fillStyle = CAR_INFO[c].color
      rrPath(g, x + 31 * bu, ry + 5 * bu, 5 * bu, rowH - 10 * bu, 2)
      g.fill()
      g.textAlign = 'left'
      g.fillStyle = '#f1e9d6'
      g.font = `${r < 3 ? 800 : 600} ${12.5 * bu}px ${FONT}`
      g.fillText(CAR_INFO[c].name, x + 42 * bu, ry + rowH / 2 + 4.3 * bu)
      const nameW = g.measureText(CAR_INFO[c].name).width
      if (u === 1) {
        const s = pilot[c]
        g.font = `600 ${10 * bu}px ${FONT}`
        g.fillStyle = p.mySeat === c ? '#5ff0ff' : 'rgba(241,233,214,0.55)'
        const lbl = p.mySeat === c ? 'TÚ' : s ? String(s.name).slice(0, 9) : 'IA'
        if (x + 42 * bu + nameW + 6 + g.measureText(lbl).width < x + w - 84) g.fillText(lbl, x + 42 * bu + nameW + 6 * bu, ry + rowH / 2 + 3.8 * bu)
      }
      // premio y apuestas
      g.textAlign = 'right'
      if (r < prizes.length) {
        g.font = `800 ${10.5 * bu}px ${FONT}`
        g.fillStyle = PLACE_COL[r]
        g.fillText(fmtMult(prizes[r]), x + w - 10 * bu, ry + rowH / 2 + 3.8 * bu)
      }
      if (betWin[c]) {
        g.fillStyle = GOLD
        g.font = `800 ${10 * bu}px ${FONT}`
        g.fillText('★', x + w - (r < prizes.length ? 48 : 10) * bu, ry + rowH / 2 + 3.8 * bu)
      }
      if (fin && info) {
        if (info.place[c] === 0) {
          const sx = x + w - 2 * bu - (r < prizes.length ? 70 : 24) * bu
          for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
            g.fillStyle = (a + b) & 1 ? '#10141a' : '#f7f7f2'
            g.fillRect(sx + a * 4 * bu, ry + rowH / 2 - 4 * bu + b * 4 * bu, 4 * bu, 4 * bu)
          }
        } else if (u === 1) {
          g.font = `700 ${9.5 * bu}px ${FONT}`
          g.fillStyle = 'rgba(241,233,214,0.8)'
          g.fillText(fmtGap(race.finish[c] - info.t0), x + w - (r < prizes.length ? 50 : 12) * bu, ry + rowH / 2 + 3.5 * bu)
        }
      }
      // flecha ▲▼ junto al puesto
      if (since < 1300 && !fin) {
        g.fillStyle = arrowD[c] > 0 ? '#5dff95' : '#ff6a5a'
        const ax = x + 27 * bu
        const ay = ry + rowH / 2 + (arrowD[c] > 0 ? -7 : 7) * bu
        g.beginPath()
        if (arrowD[c] > 0) {
          g.moveTo(ax, ay - 3.5 * bu)
          g.lineTo(ax + 4 * bu, ay + 3 * bu)
          g.lineTo(ax - 4 * bu, ay + 3 * bu)
        } else {
          g.moveTo(ax, ay + 3.5 * bu)
          g.lineTo(ax + 4 * bu, ay - 3 * bu)
          g.lineTo(ax - 4 * bu, ay - 3 * bu)
        }
        g.fill()
      }
      g.textAlign = 'left'
    }
  }

  const drawSemaphore = (race, ms, nowReal, p) => {
    if (ms < -GRID_MS || ms > 1600) return
    const r = 15 * u
    const gap = 8 * u
    const w = 5 * (2 * r) + 6 * gap
    const x = u < 1 ? cw - w - 10 : cw / 2 - w / 2
    const y = 12 * u
    const alpha = ms > 900 ? 1 - (ms - 900) / 700 : 1
    g.globalAlpha = alpha
    pill(x, y, w, 2 * r + 2 * gap, 'rgba(6,10,14,0.85)', 'rgba(255,255,255,0.15)')
    const n = ms < 0 ? lightsAt(ms) : 0
    const green = ms >= 0
    for (let k = 0; k < 5; k++) {
      const cx = x + gap + r + k * (2 * r + gap)
      const cy = y + gap + r
      const lit = green || k < n
      g.fillStyle = lit ? (green ? '#7dffa0' : '#ff3d30') : '#2b0c0c'
      g.beginPath()
      g.arc(cx, cy, r, 0, TAU)
      g.fill()
      if (lit) {
        g.globalCompositeOperation = 'lighter'
        g.drawImage(green ? spr.green : spr.red, cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8)
        g.globalCompositeOperation = 'source-over'
      }
    }
    g.font = `800 ${11 * u}px ${FONT}`
    g.textAlign = 'center'
    g.fillStyle = green ? '#8bffa8' : 'rgba(241,233,214,0.7)'
    const text = green ? '¡YA!' : n === 0 ? 'Prepárate…' : 'Atentos…'
    g.fillText(text, x + w / 2, y + 2 * r + 2 * gap + 15 * u)
    g.textAlign = 'left'
    g.globalAlpha = 1
    void race
    void nowReal
    void p
  }

  // En una recta, el minimapa es una barra de la salida a la meta con un punto por coche.
  const drawDragBar = (p) => {
    const w = u < 1 ? 120 : 200
    const x = cw - w - 14 * u
    const y = ch - 20 * u
    pill(x - 10, y - 12, w + 20, 24, 'rgba(6,14,20,0.62)', 'rgba(200,162,75,0.3)')
    g.fillStyle = 'rgba(255,255,255,0.18)'
    g.fillRect(x, y - 2, w, 4)
    g.fillStyle = '#fff'
    g.fillRect(x - 1, y - 6, 2, 12)
    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < 3; r++) {
        g.fillStyle = (r + c) & 1 ? '#0c0f13' : '#f6f6f1'
        g.fillRect(x + w - 4 + c * 4, y - 6 + r * 4, 4, 4)
      }
    }
    for (let r = CARS - 1; r >= 0; r--) {
      const c = order[r]
      const px = x + clamp(S.u[c], 0, 1) * w
      const py = y + (LANE[c] - 2.5) * 1.6 * u
      g.fillStyle = CAR_INFO[c].color
      g.strokeStyle = p.mySeat === c ? '#5ff0ff' : betOn[c] > 0 ? GOLD : 'rgba(0,0,0,0.6)'
      g.lineWidth = p.mySeat === c || betOn[c] > 0 ? 2 : 1
      g.beginPath()
      g.arc(px, py, r === 0 ? 4.5 * u : 3.5 * u, 0, TAU)
      g.fill()
      g.stroke()
    }
  }

  const drawMinimap = (ms, info, p) => {
    void p
    if (info && ms >= info.t0 + 800 && u < 1) return
    if (track.open) {
      drawDragBar(p)
      return
    }
    const w = (u < 1 ? 104 : 168) * 1
    const s = w / WORLD_W
    const h = WORLD_H * s
    const x = cw - w - 12 * u
    const y = ch - h - 12 * u
    pill(x - 6, y - 6, w + 12, h + 12, 'rgba(6,14,20,0.62)', 'rgba(200,162,75,0.3)')
    g.save()
    g.translate(x, y)
    g.scale(s, s)
    g.lineJoin = 'round'
    g.strokeStyle = 'rgba(255,255,255,0.18)'
    g.lineWidth = 34
    g.stroke(centerPath)
    g.strokeStyle = 'rgba(8,16,22,0.9)'
    g.lineWidth = 22
    g.stroke(centerPath)
    g.restore()
    // meta
    at(0, 0, o)
    g.fillStyle = '#fff'
    g.fillRect(x + o.x * s - 1.5, y + o.y * s - 4, 3, 8)
    for (let r = CARS - 1; r >= 0; r--) {
      const c = order[r]
      const px = x + S.x[c] * s
      const py = y + S.y[c] * s
      g.fillStyle = CAR_INFO[c].color
      g.strokeStyle = p.mySeat === c ? '#5ff0ff' : betOn[c] > 0 ? GOLD : 'rgba(0,0,0,0.6)'
      g.lineWidth = p.mySeat === c || betOn[c] > 0 ? 2 : 1
      g.beginPath()
      g.arc(px, py, r === 0 ? 4.5 * u : 3.5 * u, 0, TAU)
      g.fill()
      g.stroke()
    }
  }

  const drawFlag = (x, y, w, h, t) => {
    const cols = 10
    const rows = 6
    const cwid = w / cols
    const chei = h / rows
    g.fillStyle = '#c9ccd2'
    g.fillRect(x - 3, y - 4, 3, h + 40 * u)
    for (let c = 0; c < cols; c++) {
      const off = Math.sin(c * 0.7 - t * 8) * 4 * u * (c / cols + 0.2)
      for (let r = 0; r < rows; r++) {
        g.fillStyle = (c + r) & 1 ? '#0c0f13' : '#f6f6f1'
        g.fillRect(x + c * cwid, y + r * chei + off, cwid + 0.6, chei + 0.6)
      }
    }
  }

  const bannerBox = (info, p) => {
    const bw = Math.min(cw * 0.86, 560 * u)
    const bh = 94 * u
    const insetW = Math.round(Math.min(cw * 0.4, 520 * u))
    let cx = cw / 2
    let cy = ch * 0.27
    if (u < 1) cy = (10 + 25 + 6 * 25 + 6) * 0.78 + 12 + bh / 2
    else if (info.photo && !p.reduced) cx = 260 + (cw - insetW - 24 - 260) / 2
    cx = Math.max(cx, bw / 2 + 4)
    return { cx, cy, bw, bh }
  }

  const drawBanner = (race, info, ms, nowReal, p) => {
    if (!info) return
    const el = ms - info.t0
    const LIFE = 5200
    if (el < 0 || el > LIFE) return
    const win = info.order[0]
    const col = CAR_INFO[win].color
    const a = clamp(Math.min(el / 200, (LIFE - el) / 600), 0, 1)
    const pop = p.reduced ? 1 : 1 + Math.max(0, 1 - el / 450) * 0.3 * Math.cos(el / 55)
    const { cx, cy, bw, bh } = bannerBox(info, p)
    const pilotInfo = pilot[win]
    g.save()
    g.globalAlpha = a
    g.translate(cx, cy)
    g.scale(pop, pop)
    // banda con degradado de borde a borde y brillo diagonal que barre
    const gr = g.createLinearGradient(-bw / 2, 0, bw / 2, 0)
    gr.addColorStop(0, 'rgba(6,12,18,0)')
    gr.addColorStop(0.1, 'rgba(6,12,18,0.88)')
    gr.addColorStop(0.9, 'rgba(6,12,18,0.88)')
    gr.addColorStop(1, 'rgba(6,12,18,0)')
    g.fillStyle = gr
    g.fillRect(-bw / 2, -bh / 2, bw, bh)
    const cg = g.createLinearGradient(-bw / 2, 0, bw / 2, 0)
    cg.addColorStop(0, rgba(col, 0))
    cg.addColorStop(0.25, rgba(col, 0.35))
    cg.addColorStop(0.5, rgba(col, 0.05))
    cg.addColorStop(1, rgba(col, 0))
    g.fillStyle = cg
    g.fillRect(-bw / 2, -bh / 2, bw, bh)
    if (!p.reduced) {
      const sw = ((nowReal / 1400) % 1) * (bw + 200) - bw / 2 - 100
      g.save()
      g.beginPath()
      g.rect(-bw / 2, -bh / 2, bw, bh)
      g.clip()
      g.globalCompositeOperation = 'lighter'
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.beginPath()
      g.moveTo(sw, -bh / 2)
      g.lineTo(sw + 50, -bh / 2)
      g.lineTo(sw + 10, bh / 2)
      g.lineTo(sw - 40, bh / 2)
      g.fill()
      g.restore()
    }
    g.fillStyle = col
    g.fillRect(-bw / 2 + bw * 0.06, -bh / 2, bw * 0.88, 3 * u)
    g.fillRect(-bw / 2 + bw * 0.06, bh / 2 - 3 * u, bw * 0.88, 3 * u)
    // el coche ganador entra rodando por la izquierda
    const enter = p.reduced ? 1 : smooth(clamp(el / 650, 0, 1))
    const carX = -bw / 2 - 80 + (bw * (u < 1 ? 0.13 : 0.17) + 80) * enter
    g.save()
    g.translate(carX, 2 * u)
    g.scale((u < 1 ? 0.8 : 1.15) * u, (u < 1 ? 0.8 : 1.15) * u)
    g.globalCompositeOperation = 'lighter'
    g.drawImage(spr.car[win], -62, -62, 124, 124)
    g.globalCompositeOperation = 'source-over'
    if (enter < 1) {
      g.globalCompositeOperation = 'lighter'
      g.drawImage(spr.nitro, -31 - 60, -7, 60, 14)
      g.globalCompositeOperation = 'source-over'
    }
    g.drawImage(spr.cars[win], -35, -20, 70, 40)
    g.restore()
    if (!p.reduced && u === 1) drawFlag(bw / 2 - 52 * u, -22 * u, 34 * u, 24 * u, nowReal / 1000)
    g.textAlign = 'center'
    const tx = bw * (u < 1 ? 0.11 : 0.08)
    let tfs = u < 1 ? 23 : 38
    const title = `¡GANA ${CAR_INFO[win].name.toUpperCase()}!`
    g.font = `900 italic ${tfs}px ${FONT}`
    const tww = g.measureText(title).width
    const maxT = bw * (u < 1 ? 0.62 : 0.56)
    if (tww > maxT) tfs *= maxT / tww
    g.font = `900 italic ${tfs}px ${FONT}`
    g.shadowColor = col
    g.shadowBlur = p.reduced ? 0 : 20
    g.fillStyle = '#fff8e6'
    g.fillText(title, tx, 4 * u)
    g.shadowBlur = 0
    g.font = `700 ${14 * u}px ${FONT}`
    g.fillStyle = 'rgba(241,233,214,0.92)'
    g.fillText(pilotInfo ? `Piloto: ${pilotInfo.name}${p.mySeat === win ? ' (¡tú!)' : ''}` : 'Pilotado por la IA', tx, 30 * u)
    g.font = `800 ${11 * u}px ${FONT}`
    g.fillStyle = GOLD
    g.fillText(info.photo ? `¡FOTO FINISH!  ${info.order[1] != null ? CAR_INFO[info.order[1]].name + ' ' + fmtGap(info.gapMs) : ''}` : `Ventaja ${fmtGap(info.gapMs)}`, tx, -28 * u)
    g.restore()
  }

  // Carteles emergentes: ¡ADELANTAMIENTO!, ¡CAMBIO DE LÍDER!, ¡ÚLTIMA VUELTA!
  const drawPopup = (nowReal, p) => {
    if (!popup) return
    const life = popup.big === 2 ? 1900 : popup.big === 1 ? 1500 : 1250
    const el = nowReal - popup.t
    if (el > life) {
      popup = null
      return
    }
    const aIn = clamp(el / 150, 0, 1)
    const a = Math.min(aIn, clamp((life - el) / 280, 0, 1))
    const sc = p.reduced ? 1 : 1 + (1 - aIn) * 0.6
    let fs = (popup.big === 2 ? 38 : popup.big === 1 ? 30 : 21) * u
    g.font = `900 italic ${fs}px ${FONT}`
    const maxW = cw - 30
    const need = g.measureText(popup.text).width + 46 * u
    if (need > maxW) fs *= maxW / need
    const cx = cw / 2
    const cy = u < 1 ? (10 + 25 + 6 * 25 + 6) * 0.78 + 34 + (popup.sub ? 8 : 0) : (popup.big ? 80 : 66) * u + (popup.big === 2 ? 8 : 0)
    g.save()
    g.globalAlpha = a
    g.translate(cx, cy)
    g.scale(sc, sc)
    g.transform(1, 0, -0.18, 1, 0, 0)
    g.font = `900 italic ${fs}px ${FONT}`
    const tw = g.measureText(popup.text).width
    const w = tw + 46 * u
    const h = fs * 1.55 + (popup.sub ? 16 * u : 0)
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0)
    gr.addColorStop(0, rgba(popup.col, 0.0))
    gr.addColorStop(0.12, rgba(popup.col, 0.92))
    gr.addColorStop(0.88, rgba(popup.col, 0.92))
    gr.addColorStop(1, rgba(popup.col, 0.0))
    g.fillStyle = 'rgba(4,8,14,0.7)'
    g.fillRect(-w / 2, -h / 2, w, h)
    g.fillStyle = gr
    g.globalAlpha = a * 0.55
    g.fillRect(-w / 2, -h / 2, w, h)
    g.globalAlpha = a
    g.fillStyle = popup.col
    g.fillRect(-w / 2, -h / 2, w, 2.5 * u)
    g.fillRect(-w / 2, h / 2 - 2.5 * u, w, 2.5 * u)
    g.textAlign = 'center'
    g.shadowColor = popup.col
    g.shadowBlur = p.reduced ? 0 : 14
    g.fillStyle = '#fff'
    g.fillText(popup.text, 0, popup.sub ? -2 * u : fs * 0.33)
    g.shadowBlur = 0
    if (popup.sub) {
      g.font = `800 ${12 * u}px ${FONT}`
      g.fillStyle = 'rgba(255,255,255,0.92)'
      g.fillText(popup.sub, 0, h / 2 - 8 * u)
    }
    g.restore()
  }

  const drawPodium = (race, info, ms, nowReal, p) => {
    if (!info) return
    const el0 = ms - info.t0
    if (el0 < 900) return
    const prizes = p.podium || PODIUM
    const pw = (u < 1 ? 74 : 118) * 1
    const gapX = 8 * u
    const hs = [98, 78, 62].map((v) => v * u * (u < 1 ? 0.95 : 1))
    const total = 3 * pw + 2 * gapX
    const baseY = ch - 16 * u
    const slotX = [cw / 2 - total / 2 + pw + gapX, cw / 2 - total / 2, cw / 2 - total / 2 + 2 * (pw + gapX)]
    for (let pl = 0; pl < 3; pl++) {
      const c = info.order[pl]
      const since = ms - race.finish[c]
      if (since < 700) continue
      const k = p.reduced ? 1 : smooth(clamp((since - 700) / 450, 0, 1))
      const x = slotX[pl]
      const hh = hs[pl] * k
      const col = PLACE_COL[pl]
      // foco de luz desde arriba y brillo en el suelo
      if (k > 0.2) {
        g.globalCompositeOperation = 'lighter'
        const top = baseY - hh - 150 * u
        const sg = g.createLinearGradient(0, top, 0, baseY)
        sg.addColorStop(0, rgba(col, 0))
        sg.addColorStop(1, rgba(col, 0.2 * k))
        g.fillStyle = sg
        g.beginPath()
        g.moveTo(x + pw / 2 - 8 * u, top)
        g.lineTo(x + pw / 2 + 8 * u, top)
        g.lineTo(x + pw + 12 * u, baseY)
        g.lineTo(x - 12 * u, baseY)
        g.fill()
        g.globalAlpha = 0.5 * k
        g.drawImage(spr.warm, x - 20 * u, baseY - 24 * u, pw + 40 * u, 40 * u)
        g.globalAlpha = 1
        g.globalCompositeOperation = 'source-over'
      }
      const gr = g.createLinearGradient(0, baseY - hh, 0, baseY)
      gr.addColorStop(0, rgba(col, 0.97))
      gr.addColorStop(1, shade(col, -0.6))
      g.fillStyle = gr
      rrPath(g, x, baseY - hh, pw, hh, 8 * u)
      g.fill()
      // cara superior más clara y brillo de canto
      g.fillStyle = 'rgba(255,255,255,0.35)'
      rrPath(g, x + 3 * u, baseY - hh + 2, pw - 6 * u, 6 * u, 3)
      g.fill()
      const mine = p.mySeat === c
      const bet = betOn[c] > 0
      g.strokeStyle = mine ? '#5ff0ff' : bet ? '#fff' : 'rgba(255,255,255,0.3)'
      g.lineWidth = mine || bet ? 2.5 : 1
      rrPath(g, x, baseY - hh, pw, hh, 8 * u)
      g.stroke()
      if (hh > 30 * u) {
        g.textAlign = 'center'
        g.fillStyle = '#1b1405'
        g.font = `900 ${u < 1 ? 20 : 26}px ${FONT}`
        g.fillText(String(pl + 1), x + pw / 2, baseY - hh + (u < 1 ? 24 : 30))
        g.font = `800 ${u < 1 ? 11 : 14}px ${FONT}`
        g.fillText(fmtMult(prizes[pl] ?? 0), x + pw / 2, baseY - 7 * u)
      }
      // coche sobre el podio, mirando arriba
      const cs = (u < 1 ? 0.72 : 1.1) * (pl === 0 ? 1.1 : 1)
      const carY = baseY - hh - 38 * cs - (p.reduced ? 0 : Math.sin(nowReal / 500 + pl) * 2)
      g.save()
      g.translate(x + pw / 2, carY)
      g.globalCompositeOperation = 'lighter'
      g.drawImage(spr.car[c], -70 * cs, -70 * cs, 140 * cs, 140 * cs)
      g.globalCompositeOperation = 'source-over'
      g.rotate(-Math.PI / 2)
      g.scale(cs, cs)
      g.drawImage(spr.cars[c], -35, -20, 70, 40)
      g.restore()
      // nombre, piloto y diferencia
      g.font = `800 ${u < 1 ? 10 : 12}px ${FONT}`
      g.fillStyle = '#fff'
      g.textAlign = 'center'
      const nameY = carY - 36 * cs
      g.shadowColor = '#000'
      g.shadowBlur = 4
      g.fillText(CAR_INFO[c].name + (pilot[c] ? ` · ${String(pilot[c].name).slice(0, 8)}` : ''), x + pw / 2, nameY)
      if (pl > 0) {
        g.font = `700 ${u < 1 ? 9 : 10.5}px ${FONT}`
        g.fillStyle = 'rgba(241,233,214,0.85)'
        g.fillText(fmtGap(race.finish[c] - info.t0), x + pw / 2, nameY - (u < 1 ? 11 : 14))
      } else {
        // corona
        const cy0 = nameY - (u < 1 ? 12 : 16)
        g.shadowBlur = 0
        g.fillStyle = GOLD
        g.beginPath()
        const cwid = 13 * u
        g.moveTo(x + pw / 2 - cwid, cy0 + 5 * u)
        g.lineTo(x + pw / 2 - cwid, cy0 - 3 * u)
        g.lineTo(x + pw / 2 - cwid / 2, cy0 + 1 * u)
        g.lineTo(x + pw / 2, cy0 - 6 * u)
        g.lineTo(x + pw / 2 + cwid / 2, cy0 + 1 * u)
        g.lineTo(x + pw / 2 + cwid, cy0 - 3 * u)
        g.lineTo(x + pw / 2 + cwid, cy0 + 5 * u)
        g.closePath()
        g.fill()
        if (!p.reduced) {
          g.globalCompositeOperation = 'lighter'
          g.globalAlpha = 0.5 + 0.5 * Math.sin(nowReal / 180)
          g.drawImage(spr.warm, x + pw / 2 - 18 * u, cy0 - 24 * u, 36 * u, 36 * u)
          g.globalAlpha = 1
          g.globalCompositeOperation = 'source-over'
        }
      }
      g.shadowBlur = 0
    }
    g.textAlign = 'left'
  }

  raf = requestAnimationFrame(frame)
  const onVisibility = () => {
    last = 0
    snap = true
  }
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    dead = true
    cancelAnimationFrame(raf)
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    if (engine) engine.stop()
    engine = null
  }
}

export default function RaceScene(props) {
  const canvas = useRef(null)
  const latest = useRef(props)
  latest.current = props
  useEffect(() => mount(canvas.current, latest), [])
  return (
    <div className="race-scene">
      <canvas ref={canvas} role="img" aria-label={`Circuito ${CIRCUITS[props.circuit ?? 0].name}: la carrera vista desde arriba`} />
    </div>
  )
}
