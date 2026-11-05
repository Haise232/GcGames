// Reglas puras de la Regata (Season 4, en vivo): las usan la pantalla (Regata.jsx) para pintar y el servidor
// (api/_juegos/solo.mjs) para sortear y pagar con el saldo semanal. Una regata cada ROUND_MS para todos, como la Carrera.
//
// La diferencia con la Carrera: los veleros NO son iguales ni el mar tampoco. Antes de cada regata sale el parte del
// tiempo: un clima (despejado, tormenta, kraken…) que decide cómo se reparten las probabilidades de los cinco veleros,
// en puntos básicos (de 10.000). El servidor sortea el orden de llegada COMPLETO con esas probabilidades (modelo
// Plackett-Luce: el primero con las probabilidades del parte, el segundo con las de los que quedan, y así).
//
// Se puede apostar a tres cosas: Ganador (el 1.º), Exacta (1.º y 2.º en orden) y Trío (1.º, 2.º y 3.º en orden). Cada una
// paga HOUSE / probabilidad de ese resultado, así que apuestes a lo que apuestes se recupera de media el 96 %; solo los
// premios que pasarían de MAX_ODDS se quedan en el tope (y entonces se recupera algo menos, nunca más).
// Los importes van en euros enteros y las cuotas en centésimas de lo apostado, con la apuesta incluida (282 = ×2,82).

export const RULES = 2 // versión de las reglas: una apuesta guardada con otra versión se devuelve en vez de pagarse
export const ROUND_MS = 44000
export const BETS_MS = 20000 // apuestas abiertas (se ve el parte del tiempo)
export const HORN_MS = 3000 // la bocina de salida: las apuestas ya están cerradas
export const SAIL_MAX_MS = 18000 // el último velero cruza la meta antes de esto
export const HOUSE = 0.96

export const CHIPS = [10, 50, 100, 500, 1000]
export const STEP = CHIPS[0]
export const MAX_TOTAL = 10000 // lo máximo que se juega entre todas las apuestas de una regata
export const MAX_BETS = 20 // y cuántas apuestas distintas puede haber en una regata
export const MAX_ODDS = 300000 // la cuota más alta que se paga: ×3.000 (el exceso se queda en la banca)

export const BOATS = [
  { name: 'Sirena', color: '#ff6b8a', sail: '#ffe0ea' },
  { name: 'Marlín', color: '#3c8cff', sail: '#dce9ff' },
  { name: 'Tortuga', color: '#43d17c', sail: '#e0ffe9' },
  { name: 'Gaviota', color: '#ffb547', sail: '#fff4d6' },
  { name: 'Delfín', color: '#2ee6d0', sail: '#d8fff9' },
]
export const N = BOATS.length

// Las tres apuestas: cuántos veleros hay que acertar, en orden de llegada.
export const KINDS = {
  win: { n: 1, name: 'Ganador', hint: 'Acierta quién llega primero.', slots: ['1.º'] },
  exacta: { n: 2, name: 'Exacta', hint: 'Acierta el 1.º y el 2.º, en ese orden.', slots: ['1.º', '2.º'] },
  trio: { n: 3, name: 'Trío', hint: 'Acierta el 1.º, el 2.º y el 3.º, en ese orden.', slots: ['1.º', '2.º', '3.º'] },
}
export const KIND_LIST = ['win', 'exacta', 'trio']

// Los climas. Cada ronda sale uno (con su peso) y decide el reparto de probabilidades: `profiles` son los repartos
// posibles (puntos básicos, suman 10.000), que se barajan entre los veleros. `amp` es lo movida que va la carrera (el
// ritmo de cada velero oscila más o menos y se adelantan más o menos). `effects` dice qué pasa durante la regata (lo
// sortea el servidor, ver regattaDraw): `stall` es cuántos veleros se frenan ([mínimo, máximo]), `what` de qué tipo,
// `dur` cuánto dura y `frac` por dónde del recorrido; `bolts` son los rayos. Todo es coreografía: el orden de llegada ya
// está decidido y los veleros frenados acaban llegando justo cuando les toca.
export const CLIMAS = [
  {
    id: 'despejado',
    name: 'Despejado',
    weight: 22,
    blurb: 'Mar en calma y un favorito claro: paga poco, pero acierta.',
    profiles: [
      [4600, 2300, 1500, 1000, 600],
      [4200, 2600, 1600, 1000, 600],
    ],
    amp: 0.7,
    effects: {},
  },
  {
    id: 'viento',
    name: 'Viento fuerte',
    weight: 16,
    blurb: 'Rachas que lo cambian todo: adelantamientos sin parar.',
    profiles: [
      [3200, 2700, 2000, 1300, 800],
      [3000, 2800, 2100, 1200, 900],
      [3600, 2500, 1800, 1200, 900],
    ],
    amp: 1,
    effects: {},
  },
  {
    id: 'niebla',
    name: 'Niebla',
    weight: 12,
    blurb: 'No se ve nada en mitad del mar. Reparto igualado.',
    profiles: [
      [2600, 2300, 2000, 1700, 1400],
      [2800, 2400, 1900, 1700, 1200],
    ],
    amp: 0.9,
    effects: {},
  },
  {
    id: 'tormenta',
    name: 'Tormenta',
    weight: 14,
    blurb: 'Rayos, lluvia y olas enormes: cualquiera puede ganar.',
    profiles: [
      [2100, 2050, 2000, 1950, 1900],
      [2300, 2100, 2000, 1900, 1700],
      [2200, 2200, 2000, 1800, 1800],
    ],
    amp: 1,
    effects: { bolts: [4, 6] },
  },
  {
    id: 'remolino',
    name: 'Remolino',
    weight: 12,
    blurb: 'Un remolino en mitad del campo hace girar y frena a los veleros.',
    profiles: [
      [3500, 3000, 1600, 1200, 700],
      [3800, 2800, 1700, 1100, 600],
    ],
    amp: 0.9,
    effects: { stall: [2, 3], what: 'remolino', dur: [1800, 3000], frac: [0.42, 0.52] },
  },
  {
    id: 'kraken',
    name: 'Kraken',
    weight: 10,
    blurb: 'El Kraken ronda: atrapa veleros y los desconocidos pagan una barbaridad.',
    profiles: [
      [4800, 2900, 1400, 600, 300],
      [4700, 3000, 1400, 500, 400],
    ],
    amp: 0.9,
    effects: { stall: [1, 2], what: 'kraken', dur: [2600, 4200], frac: [0.24, 0.42], notWinner: true },
  },
  {
    id: 'calima',
    name: 'Calima',
    weight: 8,
    blurb: 'Aire denso y caliente: el viento se cae a ratos y alguien se queda parado.',
    profiles: [[3000, 2500, 2000, 1500, 1000]],
    amp: 0.8,
    effects: { stall: [2, 2], what: 'calma', dur: [1300, 2200], frac: [0.3, 0.6] },
  },
  {
    id: 'arcoiris',
    name: 'Arcoíris',
    weight: 6,
    blurb: 'Todos van igual: cualquiera gana y las exactas y los tríos pagan de lo mejor.',
    profiles: [[2000, 2000, 2000, 2000, 2000]],
    amp: 1,
    effects: {},
  },
]
export const climaOf = (id) => CLIMAS.find((c) => c.id === id) ?? CLIMAS[0]
export const CLIMA_WEIGHT = CLIMAS.reduce((sum, c) => sum + c.weight, 0)
// El clima que toca con una tirada de 0 a CLIMA_WEIGHT - 1.
export function climaAt(roll) {
  let left = roll
  for (const c of CLIMAS) {
    if (left < c.weight) return c
    left -= c.weight
  }
  return CLIMAS[0]
}

// Cuánto tarda en recuperarse un velero frenado (ms): sale disparado y se pone donde le toca.
export const STALL_REC_MS = 1100

// Vientos (solo se ven): de dónde sopla y cómo de fuerte.
export const WINDS = ['Alisio del norte', 'Brisa del este', 'Poniente', 'Levante', 'Calma chicha', 'Racheado del sur']

// Lo que paga cada resultado según su probabilidad, hacia abajo y con tope: nunca más del 96 %. `boats` son los
// veleros en orden de llegada y `bp` las probabilidades del parte (puntos básicos). Todo con enteros: la probabilidad
// de que el 1.º sea a es a/10.000, la de que el 2.º sea b (entre los que quedan) es b/(10.000 − a), y la del 3.º es
// c/(10.000 − a − b). La cuota es 0,96 entre el producto, en centésimas.
export function oddsFor(kind, boats, bp) {
  const T = 10000
  const a = bp[boats[0]]
  let odds
  if (kind === 'win') odds = Math.floor((96 * T) / a)
  else if (kind === 'exacta') odds = Math.floor((96 * T * (T - a)) / (a * bp[boats[1]]))
  else odds = Math.floor((96 * T * (T - a) * (T - a - bp[boats[1]])) / (a * bp[boats[1]] * bp[boats[2]]))
  return Math.min(odds, MAX_ODDS)
}

export const betKey = (b) => `${b.kind}:${b.boats.join('-')}`

export const validBet = (b) =>
  b !== null &&
  typeof b === 'object' &&
  Object.hasOwn(KINDS, b.kind) &&
  Array.isArray(b.boats) &&
  b.boats.length === KINDS[b.kind].n &&
  b.boats.every((x) => Number.isInteger(x) && x >= 0 && x < N) &&
  new Set(b.boats).size === b.boats.length &&
  Number.isInteger(b.amount) &&
  b.amount >= STEP &&
  b.amount % STEP === 0

export const totalOf = (bets) => bets.reduce((sum, b) => sum + b.amount, 0)

// Hasta MAX_BETS apuestas distintas, todas válidas, y el total con tope.
export const validBets = (bets) =>
  Array.isArray(bets) &&
  bets.length <= MAX_BETS &&
  bets.every(validBet) &&
  new Set(bets.map(betKey)).size === bets.length &&
  totalOf(bets) <= MAX_TOTAL

// ¿Ha acertado la apuesta? `order` es el orden de llegada completo (el primero es el ganador).
export const hits = (bet, order) => bet.boats.every((boat, k) => order[k] === boat)

// Lo que cobra una apuesta (apuesta incluida) con ese orden de llegada.
export const payoutOf = (bet, order, bp) => (hits(bet, order) ? Math.floor((bet.amount * oddsFor(bet.kind, bet.boats, bp)) / 100) : 0)

// «×2,82»
export const fmtOdds = (odds) => `×${(odds / 100).toLocaleString('es-ES', { maximumFractionDigits: odds >= 100000 ? 0 : 2 })}`

// Fase de la ronda según el reloj del servidor.
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - round * ROUND_MS
  const phase = offset < BETS_MS ? 'betting' : offset < BETS_MS + HORN_MS ? 'horn' : 'sailing'
  return { round, offset, phase, sailed: offset - BETS_MS - HORN_MS }
}

// Instante de la salida de una ronda (ms del reloj del servidor).
export const startOf = (round) => round * ROUND_MS + BETS_MS + HORN_MS

// Cuánto ha avanzado un velero a los `ms` de la salida sin contar los frenazos (1 = meta). Como en la Carrera: llega
// justo en `finish`, con altibajos (wobble) que hacen que se adelanten unos a otros, sin ir nunca hacia atrás.
function cruise(finish, wobble, ms) {
  if (ms <= 0) return 0
  if (ms >= finish) return 1 + ((ms - finish) / finish) * 0.15
  const tau = ms / finish
  let at = tau
  for (let j = 0; j < wobble.length; j++) at += wobble[j] * Math.sin(Math.PI * (j + 1) * tau)
  return at
}

const smooth = (k) => k * k * (3 - 2 * k)

// Lo mismo con los frenazos del clima (`stalls`: { at, dur } del propio velero, sin solaparse): durante `dur` el velero
// se queda quieto (atrapado por el Kraken, en el remolino, sin viento) y luego recupera lo perdido en STALL_REC_MS
// hasta ponerse donde estaría. Así siempre llega a la meta en su `finish`, que es lo que manda el orden de llegada.
export function progress(finish, wobble, ms, stalls = []) {
  let at = cruise(finish, wobble, ms)
  for (const s of stalls) {
    if (ms <= s.at) continue
    const from = cruise(finish, wobble, s.at)
    if (ms < s.at + s.dur) at -= cruise(finish, wobble, ms) - from
    else at -= (cruise(finish, wobble, s.at + s.dur) - from) * (1 - smooth(Math.min(1, (ms - s.at - s.dur) / STALL_REC_MS)))
  }
  return at
}

// ¿A los cuántos ms de la salida llega el velero al punto `frac` del recorrido (sin frenazos)? Para colocar el remolino
// o el Kraken en un sitio y que el velero pase justo por ahí.
export function reachAt(finish, wobble, frac) {
  let lo = 0
  let hi = finish
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (cruise(finish, wobble, mid) < frac) lo = mid
    else hi = mid
  }
  return Math.round(hi)
}
