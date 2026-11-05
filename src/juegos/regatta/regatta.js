// Reglas puras de la Regata (Season 4, en vivo): las usan la pantalla (Regata.jsx) para pintar y el servidor
// (api/_juegos/solo.mjs) para sortear y pagar con el saldo semanal. Una regata cada ROUND_MS para todos, como la Carrera.
//
// La diferencia con la Carrera: los veleros NO son iguales. Antes de cada regata sale el parte del viento y con él las
// probabilidades de cada velero (favoritos y desconocidos), en puntos básicos (de 10.000). Cada velero paga
// HOUSE / probabilidad, así que apuestes al que apuestes, de media se recupera el 96 %: el favorito gana a menudo y paga
// poco; el desconocido gana poco y paga mucho. El ganador sale de esas mismas probabilidades.
// Los importes van en euros enteros y las cuotas en centésimas de lo apostado, con la apuesta incluida (282 = ×2,82).

export const RULES = 1 // versión de las reglas: una apuesta guardada con otra versión se devuelve en vez de pagarse
export const ROUND_MS = 50000
export const BETS_MS = 24000 // apuestas abiertas (se ve el parte del viento)
export const HORN_MS = 3000 // la bocina de salida: las apuestas ya están cerradas
export const SAIL_MAX_MS = 18000 // el último velero cruza la meta antes de esto
export const HOUSE = 0.96

export const CHIPS = [10, 50, 100, 500]
export const STEP = CHIPS[0]
export const MAX_TOTAL = 5000 // lo máximo que se juega entre todas las apuestas de una regata

export const BOATS = [
  { name: 'Sirena', color: '#ff6b8a', sail: '#ffe0ea' },
  { name: 'Marlín', color: '#3c8cff', sail: '#dce9ff' },
  { name: 'Tortuga', color: '#43d17c', sail: '#e0ffe9' },
  { name: 'Gaviota', color: '#ffb547', sail: '#fff4d6' },
  { name: 'Delfín', color: '#2ee6d0', sail: '#d8fff9' },
]
export const N = BOATS.length

// Repartos de probabilidad posibles (puntos básicos, suman 10.000). Cada regata se elige uno y se baraja entre los
// veleros según el viento: a veces hay un gran favorito, a veces está todo muy igualado.
export const PROFILES = [
  [3400, 2600, 1800, 1300, 900],
  [2800, 2400, 2000, 1600, 1200],
  [4500, 2000, 1500, 1200, 800],
  [3000, 3000, 1600, 1400, 1000],
  [2200, 2200, 2000, 1800, 1800],
]

// Lo que paga cada velero (centésimas, apuesta incluida) según su probabilidad, hacia abajo: nunca más del 96 %.
export const oddsOf = (bp) => Math.floor((HOUSE * 10000 * 100) / bp)

// Vientos (solo se ven): de dónde sopla y cómo de fuerte.
export const WINDS = ['Alisio del norte', 'Brisa del este', 'Poniente', 'Levante', 'Calma chicha', 'Racheado del sur']

export const validBet = (b) =>
  b !== null &&
  typeof b === 'object' &&
  Number.isInteger(b.boat) &&
  b.boat >= 0 &&
  b.boat < N &&
  Number.isInteger(b.amount) &&
  b.amount >= STEP &&
  b.amount % STEP === 0

// Una apuesta por velero como mucho, y el total con tope.
export const validBets = (bets) =>
  Array.isArray(bets) &&
  bets.length <= N &&
  bets.every(validBet) &&
  new Set(bets.map((b) => b.boat)).size === bets.length &&
  totalOf(bets) <= MAX_TOTAL

export const totalOf = (bets) => bets.reduce((sum, b) => sum + b.amount, 0)

// Lo que cobra una apuesta (apuesta incluida) si gana `winner`.
export const payoutOf = (bet, winner, odds) => (bet.boat === winner ? Math.floor((bet.amount * odds[bet.boat]) / 100) : 0)

// «×2,82»
export const fmtOdds = (odds) => `×${(odds / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}`

// Fase de la ronda según el reloj del servidor.
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - round * ROUND_MS
  const phase = offset < BETS_MS ? 'betting' : offset < BETS_MS + HORN_MS ? 'horn' : 'sailing'
  return { round, offset, phase, sailed: offset - BETS_MS - HORN_MS }
}

// Instante de la salida de una ronda (ms del reloj del servidor).
export const startOf = (round) => round * ROUND_MS + BETS_MS + HORN_MS

// Cuánto ha avanzado un velero a los `ms` de la salida (1 = meta). Como en la Carrera: llega justo en `finish`, con
// altibajos (wobble) que hacen que se adelanten unos a otros, sin ir nunca hacia atrás.
export function progress(finish, wobble, ms) {
  if (ms <= 0) return 0
  if (ms >= finish) return 1 + ((ms - finish) / finish) * 0.15
  const tau = ms / finish
  let at = tau
  for (let j = 0; j < wobble.length; j++) at += wobble[j] * Math.sin(Math.PI * (j + 1) * tau)
  return at
}
