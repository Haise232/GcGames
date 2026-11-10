// Reglas puras del Trineo de Papá Noel (Season 5): las usan la pantalla (Trineo.jsx) y el servidor
// (api/_juegos/solo.mjs). Es Nochebuena y repartes regalos casa por casa. En cada parada eliges dónde bajas: una
// casita (casi siempre sale bien, sube poco), un bloque de pisos o un rascacielos (la mitad de las veces te pillan, pero
// el premio casi se dobla). Si entregas el regalo, el premio crece; si te pillan, pierdes la apuesta. Cobras cuando
// quieras, y al llegar a STOPS paradas (o a MAX_MULT) se acaba la noche y cobras solo.
//
// Cada parada la sortea el servidor al bajar. El premio es el producto de 1 / p de cada parada y la casa se queda su
// parte una sola vez, al cobrar (HOUSE): cobres cuando cobres, de media se recupera el 96 %.

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96
export const MAX_MULT = 1000
export const STOPS = 24 // una por cada día de diciembre hasta Nochebuena

// p: probabilidad de entregar el regalo sin que te pillen. fail: lo que pasa si te pillan.
export const HOUSES = {
  casa: { name: 'Casita', p: 0.9, blurb: 'Una chimenea ancha y todos dormidos.', fail: '¡El perro se ha puesto a ladrar!' },
  bloque: { name: 'Bloque de pisos', p: 0.7, blurb: 'Muchos vecinos: alguno sigue despierto.', fail: '¡Un niño despierto te ha visto!' },
  torre: { name: 'Rascacielos', p: 0.5, blurb: 'Treinta plantas y una chimenea estrecha.', fail: '¡Te has quedado atascado en la chimenea!' },
}
export const HOUSE_IDS = Object.keys(HOUSES)

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validHouse = (h) => typeof h === 'string' && Object.hasOwn(HOUSES, h)

// ¿Sale bien la parada? rand(n): entero de 0 a n−1.
export const delivers = (house, rand) => rand(1000) < HOUSES[house].p * 1000

// Multiplicador si cobras: la casa se queda su parte (HOUSE) del producto. Centésimas hacia abajo.
export const multOf = (prod, steps) => (steps <= 0 ? 0 : Math.min(MAX_MULT, Math.floor(HOUSE * prod * 100 + 1e-6) / 100))
export const payout = (bet, mult) => Math.floor(bet * mult + 1e-6)

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
