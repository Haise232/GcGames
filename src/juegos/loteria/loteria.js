// Reglas puras de la Lotería de Navidad (Season 5): las usan la pantalla (Loteria.jsx) y el servidor
// (api/_juegos/solo.mjs). Compras un décimo con el número que quieras (de 00000 a 99999) y se canta el sorteo: el Gordo,
// el segundo, el tercero, dos cuartos y ocho quintos; además la pedrea, la terminación (las dos últimas cifras del
// Gordo) y el reintegro (la última cifra del Gordo, que devuelve lo jugado). Te llevas el mejor premio que te toque.
//
// Como en el Rasca de antes: el servidor sortea primero el premio con las probabilidades de PRIZES y después dibuja
// un sorteo que lo enseña (drawFor), así el número que eliges no cambia nada y el retorno es exacto: la suma de
// probabilidad × premio es HOUSE (el 96 %).

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96
export const NUMBERS = 100000
const MILLION = 1_000_000

// De mejor a peor: [probabilidad por millón, multiplicador]. Σ p · mult = 0,96.
export const PRIZES = {
  gordo: { name: 'El Gordo', p: 700, mult: 400 },
  segundo: { name: 'Segundo premio', p: 1200, mult: 125 },
  tercero: { name: 'Tercer premio', p: 2400, mult: 50 },
  cuarto: { name: 'Cuarto premio', p: 4000, mult: 20 },
  quinto: { name: 'Quinto premio', p: 10000, mult: 6 },
  pedrea: { name: 'Pedrea', p: 50000, mult: 2 },
  terminacion: { name: 'Terminación', p: 20000, mult: 3 },
  reintegro: { name: 'Reintegro', p: 110000, mult: 1 },
}
export const PRIZE_IDS = Object.keys(PRIZES)
export const CUARTOS = 2
export const QUINTOS = 8

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validNumber = (n) => Number.isInteger(n) && n >= 0 && n < NUMBERS
export const multOf = (prize) => (prize ? PRIZES[prize].mult : 0)
export const payout = (bet, prize) => Math.floor(bet * multOf(prize) + 1e-6)
export const fmtNumber = (n) => String(n).padStart(5, '0')

// El premio que toca (o null). rand(n): entero de 0 a n−1.
export function drawPrize(rand) {
  let u = rand(MILLION)
  for (const id of PRIZE_IDS) {
    if (u < PRIZES[id].p) return id
    u -= PRIZES[id].p
  }
  return null
}
// ¿Es mejor el premio a que el b? (null no es premio).
export const better = (a, b) => multOf(a) > multOf(b)

// Un sorteo que enseña ese premio para tu número: { gordo, segundo, tercero, cuartos: [2], quintos: [8] }.
// Ningún número sale dos veces, el tuyo solo sale donde toca, y la terminación y el reintegro (que dependen del Gordo)
// solo coinciden con el tuyo cuando ese es tu premio. La pedrea no está en la lista: se dice aparte.
export function drawFor(number, prize, rand) {
  const used = new Set([number])
  const pick = (ok = () => true) => {
    for (;;) {
      const n = rand(NUMBERS)
      if (!used.has(n) && ok(n)) {
        used.add(n)
        return n
      }
    }
  }
  const end2 = number % 100
  const end1 = number % 10
  let gordo
  if (prize === 'gordo') gordo = number
  else if (prize === 'terminacion') gordo = pick((n) => n % 100 === end2)
  else if (prize === 'reintegro') gordo = pick((n) => n % 10 === end1 && n % 100 !== end2)
  else gordo = pick((n) => n % 10 !== end1)
  const one = (id) => (prize === id ? number : pick())
  const list = (id, count) => {
    const out = Array.from({ length: count }, () => pick())
    if (prize === id) out[rand(count)] = number
    return out
  }
  return { gordo, segundo: one('segundo'), tercero: one('tercero'), cuartos: list('cuarto', CUARTOS), quintos: list('quinto', QUINTOS) }
}

// El orden en que se cantan (de menos a más, para acabar con el Gordo): [{ prize, number }].
export function cantos(draw) {
  return [
    ...draw.quintos.map((number) => ({ prize: 'quinto', number })),
    ...draw.cuartos.map((number) => ({ prize: 'cuarto', number })),
    { prize: 'tercero', number: draw.tercero },
    { prize: 'segundo', number: draw.segundo },
    { prize: 'gordo', number: draw.gordo },
  ]
}

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
