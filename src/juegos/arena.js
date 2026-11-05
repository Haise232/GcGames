// Reglas puras de Tesoro en la Arena (Season 4): las usa la pantalla (Arena.jsx) para pintar y el servidor
// (api/_juegos/solo.mjs) para sortear. Una playa de 5×5 con cangrejos escondidos bajo la arena: cavas un hoyo cada vez;
// si sale tesoro el premio crece, si sale un cangrejo pierdes la apuesta. Cobras cuando quieras.
//
// Lo que hay bajo cada hoyo se decide en el servidor justo al cavar (la probabilidad de cangrejo es la de los que quedan
// entre los hoyos que quedan, lo mismo que si estuvieran enterrados desde el principio). Al acabar se enseña dónde
// estaban los demás.

export const SIZE = 5
export const CELLS = SIZE * SIZE
export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96 // retorno esperado: cobres donde cobres, de media se recupera el 96 %
export const MAX_MULT = 250

// Cuántos cangrejos hay en la playa.
export const MODES = {
  calma: { name: 'Calma', crabs: 3 },
  marea: { name: 'Marea baja', crabs: 5 },
  nido: { name: 'Nido', crabs: 9 },
  invasion: { name: 'Invasión', crabs: 15 },
}

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validMode = (mode) => typeof mode === 'string' && Object.hasOwn(MODES, mode)
export const validCell = (cell) => Number.isInteger(cell) && cell >= 0 && cell < CELLS
export const safeCells = (mode) => CELLS - MODES[mode].crabs

// Probabilidad de sacar n tesoros seguidos sin cangrejo: (C−k)/C × (C−k−1)/(C−1) × …
export function survive(mode, n) {
  const crabs = MODES[mode].crabs
  let p = 1
  for (let i = 0; i < n; i++) p *= (CELLS - crabs - i) / (CELLS - i)
  return p
}

// Multiplicador con n hoyos buenos: HOUSE / probabilidad de llegar, con tope y redondeado a la centésima hacia abajo.
export const multAt = (mode, n) => (n <= 0 ? 0 : Math.min(MAX_MULT, Math.floor((HOUSE / survive(mode, n)) * 100) / 100))
export const payout = (bet, mode, n) => Math.floor(bet * multAt(mode, n))

// Hoyos buenos con los que se acaba la partida (cobras solo): cuando no queda tesoro o al llegar al tope ×250.
export function maxDigs(mode) {
  for (let n = 1; n < safeCells(mode); n++) if (multAt(mode, n) >= MAX_MULT) return n
  return safeCells(mode)
}

// ¿Sale cangrejo en el hoyo siguiente? dug: hoyos ya cavados (todos con tesoro). rand(n): entero de 0 a n−1.
export function crabNext(mode, dug, rand) {
  const left = CELLS - dug
  return rand(left) < MODES[mode].crabs
}

// Dónde estaban los cangrejos (para enseñarlos al acabar): todos entre los hoyos sin cavar, más el que te mordió.
export function placeCrabs(mode, dug, bitten, rand) {
  const free = []
  for (let i = 0; i < CELLS; i++) if (!dug.includes(i) && i !== bitten) free.push(i)
  for (let i = free.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[free[i], free[j]] = [free[j], free[i]]
  }
  const need = MODES[mode].crabs - (bitten === null ? 0 : 1)
  const crabs = free.slice(0, need)
  if (bitten !== null) crabs.push(bitten)
  return crabs.sort((a, b) => a - b)
}

// Qué tesoro sale en un hoyo (solo se ve; no cambia el premio): conchas, estrellas, monedas, cofres…
export const LOOT = ['shell', 'star', 'coin', 'pearl', 'bottle', 'coin', 'gem', 'chest']
export const lootOf = (cell, n) => LOOT[(cell * 7 + n * 3) % LOOT.length]

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
