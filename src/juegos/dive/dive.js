// Reglas puras de Apnea (Season 4): las usan la pantalla (Buceo.jsx) para jugar y pintar y el servidor
// (api/_juegos/solo.mjs) para sortear, comprobar y pagar. Tú llevas al buzo: manteniendo «Bajar» bajas, manteniendo
// «Subir» subes y sin pulsar nada haces una parada. Cuanto más hondo llegues y consigas volver a la superficie, más cobras
// (el premio es el de la profundidad máxima a la que llegaste).
//
// Tres peligros:
// - Los oídos: bajar y subir les mete presión (al subir, más cuanto más hondo llegaste: hay que descomprimir) y en las
//   paradas se compensa. Si la presión llega a EAR_MAX, te explotan los oídos y pierdes. Hay que hacer paradas.
// - El aire: los pulmones aguantan AIR_MS desde que te tiras, también en las paradas. Si no vuelves a tiempo, te ahogas.
// - El tiburón, solo en el Abismo: al tirarte, el servidor decide en secreto a qué profundidad aparece (P(más hondo que
//   d) = e^(−λ·d)) y, si llegas a ella, te pilla. El premio del Abismo es HOUSE · e^(λ·d).
//
// La inmersión es una simulación determinista por pasos (TICK_MS): el navegador manda cuándo cambiaste de dirección y el
// servidor la repite con su reloj para pagar, así que no se puede inventar el resultado.

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96
export const MAX_M = 40 // el fondo: más abajo no se puede
export const DOWN_MPS = 2.5 // metros por segundo bajando
export const UP_MPS = 1.25 // y subiendo (la mitad: subir cuesta)
export const AIR_MS = 60000 // lo que aguantan los pulmones desde que te tiras
export const TICK_MS = 50
export const AIR_TICKS = AIR_MS / TICK_MS
export const EAR_MAX = 100
export const EAR_DOWN = 18 // presión por segundo bajando
export const EAR_UP = 14 // y subiendo (por earUpFactor: más cuanto más hondo llegaste)
// Lo que se compensa por segundo en una parada: EQ_BASE + EQ_K · presión. Con más presión se compensa más deprisa, así
// que apurar hasta el rojo cunde más (y es más arriesgado) que parar enseguida.
export const EQ_BASE = 3
export const EQ_K = 0.6
export const EAR_WARN = 75 // a partir de aquí la pantalla avisa de que pares

// Zonas. ears: lo que cuesta compensar (corrientes); shark: si hay tiburón. top (Abismo): lo que pagaría el fondo.
// Laguna y Arrecife, sin tiburón: el premio es base + gain · (d / ref)^6, con ref lo más hondo a lo que se llega y se
// vuelve apurándolo todo. Sube muy deprisa al final: bajar poco no cubre la apuesta y el premio está en apurar.
// (Afinado con una simulación: quien juega normal recupera algo menos de lo que apuesta y quien juega muy bien gana.)
export const ZONES = {
  laguna: { name: 'Laguna', ears: 1, shark: false, base: 0.66, gain: 0.69, ref: 35.6 },
  arrecife: { name: 'Arrecife', ears: 1.3, shark: false, base: 0.26, gain: 1.44, ref: 33.1 },
  abismo: { name: 'Abismo', ears: 1.15, shark: true, top: 80 },
}

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validZone = (zone) => typeof zone === 'string' && Object.hasOwn(ZONES, zone)
export const hasShark = (zone) => ZONES[zone].shark

// λ del Abismo: cuánto crece el premio (y el riesgo del tiburón) por metro.
export const rateOf = (zone) => Math.log((ZONES[zone].top ?? 1) / HOUSE) / MAX_M

// Multiplicador a d metros (centésimas hacia abajo; el 1e-6 evita que la coma flotante baje una de más).
export function multAt(zone, d) {
  const z = ZONES[zone]
  const m = Math.max(0, d)
  const raw = z.shark ? HOUSE * Math.exp(rateOf(zone) * m) : z.base + z.gain * Math.pow(Math.min(m, MAX_M) / z.ref, 6)
  return Math.floor(raw * 100 + 1e-6) / 100
}
export const payout = (bet, mult) => Math.floor(bet * mult + 1e-6)

// La profundidad del tiburón (solo en el Abismo; si no, null): rand(n) es un entero de 0 a n−1. Si sale más allá del
// fondo, esta vez no hay tiburón.
export function sharkDepth(zone, rand) {
  if (!hasShark(zone)) return null
  const u = (rand(1_000_000_000) + 1) / 1_000_000_000
  return -Math.log(u) / rateOf(zone)
}

// Presión por segundo subiendo: más cuanto más hondo llegaste (descompresión).
export const earUpFactor = (maxDepth) => 0.7 + maxDepth / 30

// --- La simulación ---
// Dirección: 1 baja, 0 parada, −1 sube. Se empieza bajando.
export function diveStart() {
  return { tick: 0, depth: 0, max: 0, ear: 0, dir: 1, end: null, lostAt: null }
}

// Un paso. shark: la profundidad del tiburón (o null).
export function diveStep(st, zone, dir, shark) {
  if (st.end) return st
  const z = ZONES[zone]
  const dt = TICK_MS / 1000
  let { depth, max, ear } = st
  if (dir > 0) {
    depth = Math.min(MAX_M, depth + DOWN_MPS * dt)
    ear += (depth < MAX_M ? EAR_DOWN : 0) * z.ears * dt
  } else if (dir < 0) {
    depth = Math.max(0, depth - UP_MPS * dt)
    ear += EAR_UP * z.ears * earUpFactor(max) * dt
  } else {
    ear = Math.max(0, ear - (EQ_BASE + EQ_K * ear) * dt)
  }
  max = Math.max(max, depth)
  const tick = st.tick + 1
  let end = null
  let lostAt = null
  if (shark !== null && shark !== undefined && depth >= shark) {
    end = 'shark'
    lostAt = shark
  } else if (ear >= EAR_MAX) {
    end = 'ears'
    lostAt = depth
  } else if (dir < 0 && depth <= 0 && max > 0) end = 'surface'
  else if (tick >= AIR_TICKS) {
    end = 'air'
    lostAt = depth
  }
  return { tick, depth, max, ear: Math.min(EAR_MAX, ear), dir, end, lostAt }
}

// Cambios de dirección: [[paso, dir], …] con los pasos crecientes y dir ∈ {−1, 0, 1}.
export function validMoves(moves) {
  if (!Array.isArray(moves) || moves.length > AIR_TICKS) return false
  let prev = -1
  for (const m of moves) {
    if (!Array.isArray(m) || m.length !== 2) return false
    const [t, d] = m
    if (!Number.isSafeInteger(t) || t <= prev || t >= AIR_TICKS || (d !== 1 && d !== 0 && d !== -1)) return false
    prev = t
  }
  return true
}

// Repite una inmersión hasta `ticks` pasos (o hasta que acabe).
export function simulate(zone, moves, ticks, shark) {
  let st = diveStart()
  let dir = 1
  let i = 0
  while (!st.end && st.tick < ticks) {
    while (i < moves.length && moves[i][0] <= st.tick) dir = moves[i++][1]
    st = diveStep(st, zone, dir, shark)
  }
  return st
}

// Lo que se tarda en volver desde aquí apurando bien las paradas (subir hasta RET_HI de presión y parar hasta RET_LO).
const RET_HI = 92
const RET_LO = 78
export function returnMs(zone, depth, max, ear) {
  let st = { tick: 0, depth, max, ear, dir: -1, end: null, lostAt: null }
  let dir = ear >= RET_HI ? 0 : -1
  while (st.depth > 0 && st.tick < AIR_TICKS) {
    if (dir < 0 && st.ear >= RET_HI) dir = 0
    else if (dir === 0 && st.ear <= RET_LO) dir = -1
    st = diveStep({ ...st, end: null }, zone, dir, null)
    if (st.end === 'ears') break
  }
  return st.tick * TICK_MS
}

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
export const fmtM = (d) => `${Math.floor(d)} m`
