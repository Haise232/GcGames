// Reglas puras de Apnea (Season 4): las usan la pantalla (Buceo.jsx) para pintar y el servidor
// (api/_juegos/solo.mjs) para sortear y pagar. Se juega manteniendo pulsado: mientras mantienes, el buzo baja; al soltar,
// sube. Cuanto más hondo llegues y consigas volver, más cobras.
//
// Dos peligros:
// - El tiburón: al tirarte, el servidor decide en secreto a qué profundidad aparece (como el punto de explosión del
//   Cohete). Si llegas a esa profundidad bajando, te pilla y pierdes la apuesta. La probabilidad de no cruzártelo hasta d
//   metros es e^(−λ·d), y el premio a d metros es HOUSE · e^(λ·d): bajes hasta donde bajes, de media se recupera el 96 %.
// - El aire: el aire de los pulmones dura AIR_MS y se gasta bajando y subiendo, y subir es más lento que bajar (UP_MPS < DOWN_MPS).
//   Si sueltas tan abajo que no te llega el aire para volver, te ahogas por el camino y pierdes. Se ve en los pulmones: no
//   cambia el 96 %, solo pone un límite a lo hondo que se puede llegar.
// El servidor mide la bajada con su propio reloj, desde que te tiras hasta que sueltas.

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96
export const MAX_M = 40 // el fondo: más abajo no se puede
export const DOWN_MPS = 2.5 // metros por segundo bajando
export const UP_MPS = 1.25 // y subiendo (la mitad: subir cuesta)
export const AIR_MS = 40000 // lo que aguantan los pulmones, bajando y subiendo

// Zonas: lo que pagaría llegar al fondo (40 m) sin cruzarte el tiburón. Cuanto más paga, antes suele aparecer.
export const ZONES = {
  laguna: { name: 'Laguna', top: 4 },
  arrecife: { name: 'Arrecife', top: 15 },
  abismo: { name: 'Abismo', top: 80 },
}

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validZone = (zone) => typeof zone === 'string' && Object.hasOwn(ZONES, zone)

// λ de cada zona: cuánto crece el premio (y el riesgo) por metro.
export const rateOf = (zone) => Math.log(ZONES[zone].top / HOUSE) / MAX_M

// Profundidad tras `ms` bajando.
export const depthAt = (ms) => Math.max(0, Math.min(MAX_M, (ms / 1000) * DOWN_MPS))
// Lo que se tarda en subir desde `d` metros.
export const upMs = (d) => (d / UP_MPS) * 1000
// ¿Llega el aire para subir desde d metros si llevas `downMs` bajando?
export const canReturn = (downMs, d) => downMs + upMs(d) <= AIR_MS
// Lo más hondo desde lo que aún se puede volver (bajando sin parar y subiendo justo después): unos 33 m.
export const SAFE_M = Math.min(MAX_M, AIR_MS / 1000 / (1 / DOWN_MPS + 1 / UP_MPS))

// Multiplicador a d metros (centésimas hacia abajo; el 1e-6 evita que la coma flotante baje una de más).
export const multAt = (zone, d) => Math.floor(HOUSE * Math.exp(rateOf(zone) * Math.max(0, d)) * 100 + 1e-6) / 100
export const payout = (bet, mult) => Math.floor(bet * mult + 1e-6)

// La profundidad del tiburón: rand(n) es un entero de 0 a n−1. P(más hondo que d) = e^(−λ·d). Si sale más allá del
// fondo, esta vez no hay tiburón.
export function sharkDepth(zone, rand) {
  const u = (rand(1_000_000_000) + 1) / 1_000_000_000
  return -Math.log(u) / rateOf(zone)
}
// Cuándo te pilla bajando (ms desde que te tiras), o Infinity si no llega a aparecer.
export const sharkMs = (shark) => (shark < MAX_M ? (shark / DOWN_MPS) * 1000 : Infinity)

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
export const fmtM = (d) => `${Math.floor(d)} m`
