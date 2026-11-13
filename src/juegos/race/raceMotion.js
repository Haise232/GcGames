// Movimiento de los coches de la Carrera: dónde está cada coche a los `ms` de la salida. Lo usan las dos escenas (la 3D de
// race3d.js y la 2D de RaceScene.jsx, que queda de reserva sin WebGL). Todo sale de race.progress() con el reloj del
// servidor: aquí solo se suaviza la arrancada y la frenada tras la meta, nunca se cambia quién llega antes.
import { CARS, GRID_MS, progress } from './race.js'
import { LANE_GAP, LEN, at, laps, track } from './raceArt.js'

export const LAUNCH_MS = 1300 // arrancada: aceleración suave en vez de salir ya a toda velocidad
export const BRAKE_TAU = 900
export const PARADE_V = 150 // unidades/s de la vuelta de formación
export const DRAG_WAIT = 600 // en una recta de aceleración no hay vuelta de formación: los coches esperan a esta distancia de su plaza
export const DRAG_BRAKE = 2600 // y tras la meta frenan hasta pararse (en un circuito siguen rodando la vuelta de honor)
export const LANE = [0, 3, 1, 4, 2, 5] // carril de cada coche (los de la columna izquierda de la parrilla, a un lado)
export const GRID_BACK = [0, 1, 2, 3, 4, 5].map((i) => 70 + Math.floor(i / 2) * 125 + (i & 1) * 52)
// Distancia de cada coche a la salida en la parrilla: en una recta de aceleración salen todos en línea, cada uno en su carril.
export const gridBack = (i) => (track.open ? 40 : GRID_BACK[i])
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const smooth = (x) => x * x * (3 - 2 * x)

// ---------- posiciones (todo sale de progress()) ----------
// Progreso mostrado de un coche (fracción de la distancia total). Es progress() tal cual, salvo dos suavizados que no mueven la
// meta: una arrancada progresiva al salir y una frenada que se prolonga tras cruzar la meta (la vuelta de honor).
export function shownProgress(race, i, ms) {
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
export function carU(race, i, ms) {
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
export const DRAG_M = 402
export const dragMeters = (race, ms) => Math.round(clamp(shownProgress(race, order0(race, ms), ms), 0, 1) * DRAG_M)
export function order0(race, ms) {
  let best = 0
  for (let i = 1; i < CARS; i++) if (shownProgress(race, i, ms) > shownProgress(race, best, ms)) best = i
  return best
}

export function makeState() {
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

export function computeCars(S, race, ms) {
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
export function raceInfo(race) {
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
export const LIGHT_STEP = (GRID_MS - 1000) / 5
export function lightsAt(ms) {
  if (ms >= 0) return 0
  return clamp(Math.floor((ms + GRID_MS - 400) / LIGHT_STEP) + 1, 0, 5)
}
