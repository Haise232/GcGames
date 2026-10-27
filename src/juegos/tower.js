// Reglas puras de la Torre: las usa la pantalla para pintar y el servidor (api/_juegos/solo.mjs) para sortear cada piso.
// Apuestas, eliges dificultad y subes piso a piso: en cada piso hay unas baldosas y algunas están rotas. Si pisas una
// rota, caes y pierdes la apuesta; si no, subes y el premio crece. Cobras cuando quieras.
export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96 // retorno esperado, te retires en el piso que te retires

// Dificultades: baldosas por piso, cuántas están rotas y cuántos pisos tiene la torre.
export const MODES = {
  facil: { name: 'Fácil', tiles: 4, broken: 1, floors: 12 },
  normal: { name: 'Normal', tiles: 3, broken: 1, floors: 10 },
  dificil: { name: 'Difícil', tiles: 2, broken: 1, floors: 8 },
  extremo: { name: 'Extremo', tiles: 3, broken: 2, floors: 5 },
}

// Probabilidad de pasar un piso: baldosas sanas entre baldosas.
export const chance = (mode) => (MODES[mode].tiles - MODES[mode].broken) / MODES[mode].tiles

// Multiplicador al llegar al piso n (1 = el primero): llegar tiene probabilidad chance^n, así que HOUSE / chance^n
// devuelve de media el 96 % cobres donde cobres (por debajo del 100 %: el Score no se puede «cultivar»). Se redondea a
// la centésima hacia abajo.
export const multAt = (mode, n) => (n <= 0 ? 0 : Math.floor((HOUSE / chance(mode) ** n) * 100) / 100)

export const payout = (bet, mode, n) => Math.floor(bet * multAt(mode, n))

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validMode = (mode) => typeof mode === 'string' && Object.hasOwn(MODES, mode)
export const validTile = (mode, tile) => Number.isInteger(tile) && tile >= 0 && tile < MODES[mode].tiles

// Las baldosas rotas de un piso. rand(n): entero de 0 a n-1 (en el servidor, randomInt de node:crypto).
export function brokenTiles(mode, rand) {
  const { tiles, broken } = MODES[mode]
  const all = Array.from({ length: tiles }, (_, i) => i)
  for (let i = all.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  return all.slice(0, broken).sort((a, b) => a - b)
}

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
