// Reglas puras de Mayor o Menor (Season 4), en la mesa del guachinche: las usan la pantalla (Hilo.jsx) y el servidor
// (api/_juegos/solo.mjs). Con la baraja española de 40 cartas: sale una carta y dices si la siguiente será mayor o
// igual, o menor o igual. Si aciertas el premio crece; si fallas, pierdes la apuesta. Cobras cuando quieras.
//
// Cada carta sale de una baraja entera (es como barajar de nuevo cada vez), así la probabilidad solo depende de la
// carta que se ve: con la de valor v (0 el as … 9 el rey), «mayor o igual» acierta (10 − v) / 10 y «menor o igual»,
// (v + 1) / 10. Cada acierto multiplica el premio justo por 1 / p y la casa se queda su parte una sola vez, al
// cobrar (HOUSE): cobres cuando cobres, de media se recupera el 96 %. También puedes cambiar de carta sin apostar
// (SKIPS veces por partida).

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96
export const MAX_MULT = 1000 // al llegar, se cobra solo
export const SKIPS = 3

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
export const RANK_NAMES = ['As', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Sota', 'Caballo', 'Rey']
export const SUITS = ['oros', 'copas', 'espadas', 'bastos']
export const DECK = 40

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validGuess = (g) => g === 'hi' || g === 'lo'

// Carta: un número de 0 a 39. valueOf: su orden (0 el as … 9 el rey); suitOf: su palo.
export const valueOf = (card) => card % 10
export const rankOf = (card) => RANKS[valueOf(card)]
export const suitOf = (card) => SUITS[Math.floor(card / 10)]
export const nameOf = (card) => `${RANK_NAMES[valueOf(card)]} de ${suitOf(card)}`
export const drawCard = (rand) => rand(DECK)

// Probabilidad de acertar con la carta que se ve.
export const chance = (card, guess) => (guess === 'hi' ? (10 - valueOf(card)) / 10 : (valueOf(card) + 1) / 10)
export const wins = (card, next, guess) => (guess === 'hi' ? valueOf(next) >= valueOf(card) : valueOf(next) <= valueOf(card))

// Multiplicador si cobras: la casa se queda su parte (HOUSE) del producto de los aciertos. Centésimas hacia abajo.
export const multOf = (prod, steps) => (steps <= 0 ? 0 : Math.min(MAX_MULT, Math.floor(HOUSE * prod * 100 + 1e-6) / 100))
export const payout = (bet, mult) => Math.floor(bet * mult + 1e-6)

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
