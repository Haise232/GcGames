// Reglas puras del Puente de Cristal (en vivo): las usan la pantalla y el servidor (api/_juegos/puente.mjs).
// Cada ROUND_MS hay una partida para todos. Durante JOIN_MS pagas la entrada; luego todos cruzan a la vez un puente de
// STEPS paneles dobles. En cada paso tienes PICK_MS para elegir izquierda o derecha (si no eliges, el puente elige por
// ti): uno de los dos cristales es templado y el otro se rompe. Quien elige el roto cae. Los que llegan más lejos se
// reparten el bote (lo pagado por todos menos CUT para la casa), cada uno en proporción a su entrada.
export const ROUND_MS = 75000
export const JOIN_MS = 20000
export const STEPS = 8
export const PICK_MS = 3500
export const SHOW_MS = 1500 // se ve qué cristal se rompió y quién cayó
export const STEP_MS = PICK_MS + SHOW_MS
export const CROSS_MS = STEPS * STEP_MS
export const MIN_STAKE = 100
export const MAX_STAKE = 5000
export const STAKE_STEP = 100
export const CUT = 0.05
export const MIN_PLAYERS = 2 // con menos, se devuelven las entradas

export const SIDES = ['L', 'R']

export const validStake = (n) => Number.isInteger(n) && n >= MIN_STAKE && n <= MAX_STAKE && n % STAKE_STEP === 0
export const validSide = (s) => s === 'L' || s === 'R'

export const stepStart = (round, k) => round * ROUND_MS + JOIN_MS + k * STEP_MS
export const revealOf = (round, k) => stepStart(round, k) + PICK_MS
export const crossEnd = (round) => round * ROUND_MS + JOIN_MS + CROSS_MS

// Fase en el instante t: «join» (se entra), «cross» (se cruza: step es el paso en curso y pick si aún se puede elegir)
// o «done» (ya se ha cruzado, se ve quién ganó).
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - round * ROUND_MS
  if (offset < JOIN_MS) return { round, offset, phase: 'join', step: -1, pick: false }
  if (offset < JOIN_MS + CROSS_MS) {
    const into = offset - JOIN_MS
    const step = Math.floor(into / STEP_MS)
    return { round, offset, phase: 'cross', step, pick: into - step * STEP_MS < PICK_MS }
  }
  return { round, offset, phase: 'done', step: STEPS, pick: false }
}

// Pasos ya revelados en el instante t (cuántos cristales se han visto ya).
export function revealedAt(round, t) {
  let n = 0
  while (n < STEPS && t >= revealOf(round, n)) n++
  return n
}

// Hasta dónde llega un jugador: paneles seguidos que acierta (picks completos, con los del puente donde no eligió).
export function reachedOf(picks, safe, upTo = STEPS) {
  let n = 0
  while (n < upTo && picks[n] === safe[n]) n++
  return n
}

// Reparto: players [{ owner, stake, reached }]. Devuelve { refund, best, winners (owners), prizes { owner: € }, house }.
export function settle(players) {
  const pot = players.reduce((sum, p) => sum + p.stake, 0)
  if (players.length < MIN_PLAYERS) {
    return { refund: true, best: null, winners: [], prizes: Object.fromEntries(players.map((p) => [p.owner, p.stake])), house: 0, pot }
  }
  const best = Math.max(...players.map((p) => p.reached))
  const winners = players.filter((p) => p.reached === best)
  const pool = Math.floor(pot * (1 - CUT))
  const weight = winners.reduce((sum, p) => sum + p.stake, 0)
  const prizes = {}
  let paid = 0
  for (const p of winners) {
    prizes[p.owner] = Math.floor((pool * p.stake) / weight)
    paid += prizes[p.owner]
  }
  return { refund: false, best, winners: winners.map((p) => p.owner), prizes, house: pot - paid, pot }
}
