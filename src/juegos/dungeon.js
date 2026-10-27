// Reglas puras del Laberinto de las Puertas: las usa la pantalla para pintar y el servidor (api/_juegos) para sortear
// cada sala. Entras con tu apuesta como botín. En cada sala hay 3 puertas: un cofre (multiplica el botín), un pasillo
// (pasas sin premio) y un peligro (pierdes el botín). Las puertas se abren un instante para que veas qué hay detrás,
// se cierran y se barajan moviéndose (el laberinto cambia de sitio): tienes que seguir el cofre con la vista y elegir
// antes de que se acabe el tiempo. Cuanto más hondo, menos se ven, más se mueven y más deprisa. Entre sala y sala
// puedes salir con lo que llevas; si cruzas todas, llegas a la sala del tesoro y cobras solo.
export const MIN_BET = 10
export const MAX_BET = 5000
export const STEP = 10
export const DOORS = 3

// Cada sala: cuánto se ven las puertas abiertas (revealMs), cuántos cambios de sitio (swaps) y lo que dura cada uno
// (swapMs), el tiempo para elegir (pickMs), lo que multiplica el cofre (gain, num/den), qué peligro hay (danger) y
// cuántas veces de cada 100 el cofre es un mímico (mimic) que se come el botín.
// El mímico es lo único que no depende de tu vista: hace que, aunque sigas el cofre siempre (o leas los datos), cada
// cofre valga de media un poco menos de lo que arriesgas (×1,3 × 75 % = 0,975…). Así el Score no se puede «cultivar»,
// y el pasillo, que siempre es seguro, te deja saltarte una sala sin arriesgar nada.
// Con todo cofres: ×1,3 · ×1,4 · ×1,5 · ×1,6 · ×1,8 · ×2,5 ≈ ×19,6.
export const ROOMS = [
  { name: 'El vestíbulo', revealMs: 1300, swaps: 3, swapMs: 460, pickMs: 4000, gain: [13, 10], mimic: 25, danger: 'monster' },
  { name: 'La cripta', revealMs: 1150, swaps: 5, swapMs: 390, pickMs: 3600, gain: [7, 5], mimic: 30, danger: 'monster' },
  { name: 'La galería de los ecos', revealMs: 1000, swaps: 7, swapMs: 330, pickMs: 3300, gain: [3, 2], mimic: 35, danger: 'monster' },
  { name: 'La biblioteca maldita', revealMs: 900, swaps: 9, swapMs: 280, pickMs: 3000, gain: [8, 5], mimic: 39, danger: 'trap' },
  { name: 'El pozo de las arañas', revealMs: 800, swaps: 11, swapMs: 240, pickMs: 2700, gain: [9, 5], mimic: 46, danger: 'monster' },
  { name: 'La guarida del dragón', revealMs: 700, swaps: 14, swapMs: 200, pickMs: 2500, gain: [5, 2], mimic: 61, danger: 'monster' },
]
export const DEPTH = ROOMS.length
// Lo que tardan las puertas en cerrarse entre que se ven y empiezan a moverse.
export const CLOSE_MS = 350
// Margen para la red: si la puerta llega más tarde que esto, el servidor elige una al azar.
export const LATE_MS = 2500

export const loses = (kind) => kind === 'monster' || kind === 'trap' || kind === 'mimic'

// Lo que vale el botín tras el cofre de la sala (en euros enteros; se redondea hacia abajo).
export const grow = (pot, room) => {
  const [num, den] = ROOMS[room].gain
  return Math.floor((pot * num) / den)
}

const label = (n) => `×${String(Math.round(n * 100) / 100).replace('.', ',')}`
// Texto del multiplicador del cofre: «×1,3».
export const gainLabel = (room) => {
  const [num, den] = ROOMS[room].gain
  return label(num / den)
}
// Multiplicador con todo cofres hasta el final: «×19,65».
export const MAX_GAIN = label(ROOMS.reduce((m, r) => (m * r.gain[0]) / r.gain[1], 1))

// rand(n): entero de 0 a n-1 (en el servidor, randomInt de node:crypto). La sala: lo que hay detrás de cada puerta al
// verlas (doors, por posición) y los cambios de sitio, por orden ([a, b]: se cambian las puertas de las posiciones a y b).
export function layout(room, rand) {
  const doors = ['chest', 'empty', ROOMS[room].danger]
  for (let i = doors.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[doors[i], doors[j]] = [doors[j], doors[i]]
  }
  const swaps = []
  for (let i = 0; i < ROOMS[room].swaps; i++) {
    const a = rand(DOORS)
    const b = (a + 1 + rand(DOORS - 1)) % DOORS
    swaps.push([a, b])
  }
  return { doors, swaps }
}

// Lo que hay en cada posición después de todos los cambios.
export function shuffled(doors, swaps) {
  const out = [...doors]
  for (const [a, b] of swaps) [out[a], out[b]] = [out[b], out[a]]
  return out
}

// Lo que dura la sala desde que se ve hasta que se acaba el tiempo para elegir.
export const roomMs = (room) => {
  const r = ROOMS[room]
  return r.revealMs + CLOSE_MS + r.swaps * r.swapMs + r.pickMs
}

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
// -1: se acabó el tiempo (el servidor elige una puerta al azar).
export const validDoor = (door) => Number.isInteger(door) && door >= -1 && door < DOORS

// Apuesta más alta que te deja el saldo (0 si no llegas a la mínima).
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)

// --- Ayudas de la pantalla (no tocan las reglas de arriba) ---

export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))

// Color del historial según cuántas veces la apuesta se cobró (0 = no salió del laberinto).
export const toneOf = (ratio) =>
  ratio <= 0 ? 'cold' : ratio < 2 ? 'even' : ratio < 5 ? 'gold' : ratio < 15 ? 'warm' : 'hot'
