// Reglas puras de Buceo de Perlas (Season 4): las usa la pantalla (Buceo.jsx) para pintar y el servidor
// (api/_juegos/solo.mjs) para sortear. Bajas al fondo del mar tramo a tramo abriendo una ostra en cada uno: si sale perla,
// el premio crece; si te sale un tiburón o se te acaba el aire, pierdes la apuesta. Subes y cobras cuando quieras.
//
// Cada tramo se sortea en el servidor al bajarlo. Puede salir:
// - un tiburón o el aire que se acaba (probabilidad risk de la zona): se pierde todo;
// - una perla negra (BLACK): el premio se multiplica por 2·f;
// - una perla normal (el resto): el premio se multiplica por f.
// f = 1 / (1 − risk + BLACK), así que cada tramo vale de media lo mismo que lo que llevas: bajes lo que bajes, de media se
// recupera el HOUSE (96 %) de la apuesta. El tope (MAX_MULT) y redondear hacia abajo solo lo bajan un poco.

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96
export const MAX_MULT = 500 // tope del premio: abajo del todo en el Abismo con perlas negras se llega
export const MAX_DEPTH = 10 // tramos que dura la botella de aire: en el último subes solo
export const METERS = 4 // metros por tramo (solo se ve)
export const BLACK = 0.04 // probabilidad de perla negra en cada tramo

// Zonas: cuanto más hondo, más tiburones y más paga cada perla.
export const ZONES = {
  laguna: { name: 'Laguna', risk: 0.15 },
  arrecife: { name: 'Arrecife', risk: 0.25 },
  abismo: { name: 'Abismo', risk: 0.4 },
}

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validZone = (zone) => typeof zone === 'string' && Object.hasOwn(ZONES, zone)

// Lo que multiplica una perla normal en esa zona (la negra, el doble).
export const factorOf = (zone) => 1 / (1 - ZONES[zone].risk + BLACK)

// Multiplicador guardado con 4 decimales, para que el navegador y el servidor lleguen al mismo número.
const round4 = (m) => Math.round(m * 10000) / 10000

// El multiplicador tras un tramo con perla: el primero parte del HOUSE; después se multiplica lo que ya llevabas.
export function nextMult(zone, mult, black) {
  const base = mult > 0 ? mult : HOUSE
  return round4(Math.min(MAX_MULT, base * factorOf(zone) * (black ? 2 : 1)))
}

// Lo que se ve y se cobra: a la centésima hacia abajo. El 1e-6 evita que la coma flotante baje una centésima de más
// (11,53 × 100 da 1152,999…).
export const shownMult = (mult) => Math.floor(mult * 100 + 1e-6) / 100
export const payout = (bet, mult) => Math.floor(bet * shownMult(mult) + 1e-6)

// Lo que pagaría el siguiente tramo con perla normal (para enseñarlo antes de bajar).
export const nextIfPearl = (zone, mult) => shownMult(nextMult(zone, mult, false))

// Un tramo: rand(n) es un entero de 0 a n−1. Devuelve 'shark', 'air', 'black' o el color de una perla normal.
const PEARLS = ['white', 'pink', 'gold', 'blue']
export function diveRoll(zone, rand) {
  const r = rand(10000)
  const lose = Math.round(ZONES[zone].risk * 10000)
  if (r < lose) return r % 2 === 0 ? 'shark' : 'air'
  if (r < lose + Math.round(BLACK * 10000)) return 'black'
  return PEARLS[r % PEARLS.length]
}
export const isLoss = (kind) => kind === 'shark' || kind === 'air'

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
// Lo que se lleva quien baja n tramos con perla normal (sin perlas negras), para la ayuda y el panel.
export function multAfter(zone, n) {
  let m = 0
  for (let i = 0; i < n; i++) m = nextMult(zone, m, false)
  return shownMult(m)
}
