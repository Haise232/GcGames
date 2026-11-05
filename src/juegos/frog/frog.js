// Reglas puras de la Rana: las usa la pantalla para pintar y el servidor (api/_juegos) para sortear cada salto.
// La rana empieza en el nenúfar ×1 con tu apuesta. En cada salto decides: saltar al siguiente nenúfar (×2, ×3…) o cobrar.
// Si falla, cae al agua y pierdes la apuesta.
export const MIN_BET = 10
export const MAX_BET = 2000 // antes 5.000: con ×10 en un par de minutos se ganaban 50.000 €
export const STEP = 10
export const MAX_MULT = 10 // último nenúfar: al llegar se cobra solo
export const HOUSE = 0.94 // retorno esperado, retires cuando retires (antes 0,96)

// Probabilidad (num/den) de que el salto desde ×mult al siguiente salga bien. Está hecha para que llegar a ×m tenga
// probabilidad HOUSE/m: así, retirándote en cualquier nenúfar, de media recuperas el 94 % (por debajo del 100 %
// para que el Score no se pueda «cultivar»). El primer salto: 47/100 (= HOUSE/2); el resto, mult/(mult+1).
export const odds = (mult) => (mult === 1 ? [47, 100] : [mult, mult + 1])

// Porcentaje que ve la pantalla (48, 67, 75…).
export const chance = (mult) => {
  const [num, den] = odds(mult)
  return Math.round((num / den) * 100)
}

// rand(n): entero de 0 a n-1 (en el servidor, randomInt de node:crypto).
export const survives = (mult, rand) => {
  const [num, den] = odds(mult)
  return rand(den) < num
}

export const payout = (bet, mult) => bet * mult

// Ya no hay policía del estanque (multa y calabozo a quien ganaba mucho): la rana se ganaba demasiado por la suerte
// del Admin Abuse (2 o 3 intentos por salto devolvían más del 500 %), que ya no se aplica aquí (ver game.mjs), y por la
// apuesta máxima, que ha bajado.

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0

// Apuesta más alta que te deja el saldo (0 si no llegas a la mínima).
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)

// --- Ayudas de la pantalla (no tocan las reglas de arriba) ---

// Ajusta una apuesta al paso y al rango que permite el saldo.
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))

// Color del historial según lo que se cobró (0 = cayó al agua).
export const toneOf = (mult) => (mult <= 0 ? 'cold' : mult < 3 ? 'even' : mult < 5 ? 'gold' : mult < 8 ? 'warm' : 'hot')

// Tensión de la escena (0-2): sube en los nenúfares altos.
export const tension = (mult) => (mult >= 8 ? 2 : mult >= 5 ? 1 : 0)
