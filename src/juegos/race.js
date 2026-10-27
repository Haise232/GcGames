// Reglas puras de la Carrera de coches (en vivo): las usan la pantalla para pintar y el servidor (api/_juegos/solo.mjs)
// para sortear y pagar con el saldo semanal. Una carrera cada ROUND_MS para todos, como la ruleta y el cohete. Los seis coches
// son igual de rápidos: la llegada es un orden al azar, así que ningún coche es favorito. Los importes van en euros enteros y
// los premios en centésimas de lo apostado, con la apuesta incluida (340 = ×3,40).
export const RULES = 2 // versión de las reglas: una apuesta guardada con otra versión se devuelve en vez de pagarse
export const ROUND_MS = 42000
export const BETS_MS = 18000 // apuestas abiertas
export const GRID_MS = 4000 // parrilla de salida y semáforo (las apuestas ya están cerradas y se conoce la carrera)
export const RACE_MAX_MS = 17500 // la carrera más larga: el último coche cruza la meta antes de esto
export const CARS = 6
export const LAPS = 3 // vueltas de un circuito normal (las rectas de aceleración son una sola pasada: CIRCUITS[i].laps)
export const HOUSE = 0.96 // retorno esperado como mucho: por debajo del 100 % el Score no se puede «cultivar»

export const CHIPS = [10, 50, 100, 500]
export const STEP = CHIPS[0]
export const MAX_TOTAL = 5000 // lo máximo que se juega entre todas las apuestas de una carrera
export const MAX_BETS = 30 // apuestas distintas por carrera

// Premio de la apuesta «Podio» por puesto de llegada (1.º, 2.º, 3.º): (340 + 170 + 66) / 6 coches = 96 %.
export const PODIUM = [340, 170, 66]

// Tipos de apuesta: cuántos coches se eligen y cuánto pagan si se acierta. Retorno de cada una (con 6 coches igual de
// rápidos): Podio 96 %, Ganador 570/6 = 95 %, Exacta 2850/30 = 95 %, Trifecta 11400/120 = 95 %.
export const KINDS = {
  podium: { name: 'Podio', picks: 1, pays: null, text: 'Cobra si tu coche acaba 1.º, 2.º o 3.º' },
  win: { name: 'Ganador', picks: 1, pays: 570, text: 'Cobra si tu coche gana' },
  exacta: { name: 'Exacta', picks: 2, pays: 2850, text: 'Aciertas el 1.º y el 2.º, en orden' },
  trifecta: { name: 'Trifecta', picks: 3, pays: 11400, text: 'Aciertas el 1.º, el 2.º y el 3.º, en orden' },
}

// Los coches: nombre, color de la carrocería y del dorsal.
export const CAR_INFO = [
  { name: 'Rayo', color: '#e2463c', accent: '#ffd9d4' },
  { name: 'Cobalto', color: '#2f7be0', accent: '#d4e6ff' },
  { name: 'Esmeralda', color: '#1fa463', accent: '#d2f5e1' },
  { name: 'Solar', color: '#f0b429', accent: '#fff2c4' },
  { name: 'Violeta', color: '#8a4fd6', accent: '#ecdcff' },
  { name: 'Ártico', color: '#37c6d6', accent: '#d6f8fc' },
]

// Los circuitos (el trazado y el decorado están en raceArt.js, en el mismo orden): unos de tres vueltas y otros de
// aceleración (`drag`: una sola recta de la salida a la meta). Solo cambian el aspecto: los coches siguen igual de rápidos y el
// sorteo del servidor no los mira.
export const CIRCUITS = [
  { name: 'Neón City', tag: 'Circuito urbano', color: '#3cc8ff', laps: 3 },
  { name: 'Desierto Dorado', tag: 'Rectas largas y horquilla', color: '#ff8c3c', laps: 3 },
  { name: 'Glaciar Polar', tag: 'Horquilla sobre el hielo', color: '#9ab8ff', laps: 3 },
  { name: 'Selva Esmeralda', tag: 'Eses en la jungla', color: '#9cff5a', laps: 3 },
  { name: 'Autopista Neón', tag: 'Aceleración · 402 m', color: '#ff4fd8', laps: 1, drag: true },
  { name: 'Lago Helado', tag: 'Aceleración sobre hielo', color: '#d6f2ff', laps: 1, drag: true },
]

export const DRAW_MS = 4300 // el sorteo del circuito se ve al abrirse las apuestas, durante este rato

// Circuito de cada ronda: sale de la ronda con un mezclador de enteros, así que todos los navegadores ven el mismo sin
// preguntar al servidor, y casi nunca se repite el de la carrera anterior.
const mix = (n) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
export function circuitOf(round) {
  // Se recorren unas cuantas rondas hacia atrás: si sale el mismo que la anterior, se salta a otro.
  let prev = mix(round - 12) % CIRCUITS.length
  for (let r = round - 11; r <= round; r++) {
    let c = mix(r) % CIRCUITS.length
    if (c === prev) c = (c + 1 + (mix(r + 0x5bd1e995) % (CIRCUITS.length - 1))) % CIRCUITS.length
    prev = c
  }
  return prev
}

// Una apuesta: { kind, cars: [coche, …] (en el orden que se apuesta), amount }.
export const keyOf = (bet) => `${bet.kind}:${bet.cars.join('-')}`

// Lo que cobra una apuesta con el orden de llegada `order` (los 6 coches, el ganador primero), con la apuesta incluida.
export function payoutOf(bet, order) {
  const { kind, cars, amount } = bet
  if (kind === 'podium') {
    const place = order.indexOf(cars[0])
    return place < PODIUM.length ? Math.floor((amount * PODIUM[place]) / 100) : 0
  }
  const hit = cars.every((car, i) => order[i] === car)
  return hit ? Math.floor((amount * KINDS[kind].pays) / 100) : 0
}

// Lo máximo que puede pagar una apuesta (para enseñarlo antes de apostar).
export const bestOf = (bet) => Math.floor((bet.amount * (bet.kind === 'podium' ? PODIUM[0] : KINDS[bet.kind].pays)) / 100)

export const validBet = (b) => {
  const kind = KINDS[b?.kind]
  return (
    Boolean(kind) &&
    Array.isArray(b.cars) &&
    b.cars.length === kind.picks &&
    new Set(b.cars).size === b.cars.length &&
    b.cars.every((car) => Number.isInteger(car) && car >= 0 && car < CARS) &&
    Number.isInteger(b.amount) &&
    b.amount >= STEP &&
    b.amount % STEP === 0
  )
}

export const validBets = (bets) =>
  Array.isArray(bets) &&
  bets.length <= MAX_BETS &&
  bets.every(validBet) &&
  new Set(bets.map(keyOf)).size === bets.length &&
  totalOf(bets) <= MAX_TOTAL

export const totalOf = (bets) => bets.reduce((sum, b) => sum + b.amount, 0)

// «×3,4», «×0,66», «×114»
export const fmtOdds = (odds) => `×${(odds / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}`

// Fase de la ronda según el reloj del servidor. La carrera dura hasta RACE_MAX_MS; cuándo acaba de verdad lo dicen los tiempos.
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - round * ROUND_MS
  const phase = offset < BETS_MS ? 'betting' : offset < BETS_MS + GRID_MS ? 'grid' : 'race'
  return { round, offset, phase, raced: offset - BETS_MS - GRID_MS }
}

// Instante de la salida de una ronda (ms del reloj del servidor).
export const startOf = (round) => round * ROUND_MS + BETS_MS + GRID_MS

// Cuánto ha avanzado un coche a los `ms` desde la salida, como fracción de la distancia total (1 = meta, tras LAPS vueltas).
// `finish` es el tiempo en que cruza la meta y `wobble` = [a1, a2, …] los altibajos de su ritmo (armónicos de una senoide):
// así adelanta y es adelantado varias veces, pero siempre llega a la meta justo en `finish`. El servidor limita la suma de
// j·|aj| para que sea monótona (nunca marcha atrás). Pasada la meta sigue rodando, sin parar de golpe.
export function progress(finish, wobble, ms) {
  if (ms <= 0) return 0
  if (ms >= finish) return 1 + ((ms - finish) / finish) * 0.4
  const tau = ms / finish
  let at = tau
  for (let j = 0; j < wobble.length; j++) at += wobble[j] * Math.sin(Math.PI * (j + 1) * tau)
  return at
}

// Posiciones (0 = líder) de todos los coches a los `ms` de la salida.
export function standings(race, ms) {
  const pos = race.finish.map((f, i) => ({ car: i, at: progress(f, race.wobble[i], ms) }))
  pos.sort((a, b) => b.at - a.at)
  return pos.map((p) => p.car)
}
