// Reglas del Cohete (crash en vivo): las comparten el servidor (api/_juegos/solo.mjs) y la pantalla.
// Los multiplicadores van en centésimas enteras (231 = 2,31×) para no arrastrar decimales al dinero.

// --- Ronda en vivo: una cada ROUND_MS para todos, como la ruleta. ---
export const ROUND_MS = 30000
export const BETS_MS = 10000 // apuestas abiertas
export const FLIGHT_MS = 18000 // vuelo más largo posible (llega a MAX_MULT); después, pausa hasta la siguiente ronda
export const MAX_MULT = 2500 // 25×: el cohete nunca pasa de aquí
export const HOUSE = 0.96 // retorno esperado de cualquier forma de jugar
const K = Math.log(MAX_MULT / 100) / FLIGHT_MS

export const CHIPS = [10, 50, 100, 500]
export const AUTOS = [150, 200, 300, 500, 1000] // retiros automáticos que ofrece la pantalla
export const MAX_BET = 5000

// Multiplicador a los `ms` de despegar: crece en exponencial, de 1,00× a 25× en FLIGHT_MS.
export function multiplierAt(ms) {
  if (ms <= 0) return 100
  return Math.min(MAX_MULT, Math.floor(100 * Math.exp(K * ms)))
}

// Instante (ms desde el despegue) en que el multiplicador llega a `mult`.
export const msFor = (mult) => Math.ceil(Math.log(mult / 100) / K)

// Dónde explota, a partir de un número uniforme en [0, 1): P(llegar a x) = HOUSE / x, con tope en MAX_MULT.
// Así, retires cuando retires, de media recuperas el 96 % de lo apostado (y un 4 % de rondas explota en 1,00×).
export function crashFromUniform(u) {
  const mult = Math.floor((100 * HOUSE) / (1 - u))
  return Math.max(100, Math.min(MAX_MULT, mult))
}

// Lo que cobras al retirar a `mult` (ganas si retiras antes de que explote: mult < crash).
export const payout = (bet, mult) => Math.floor((bet * mult) / 100)

export const validBet = (bet) => Number.isInteger(bet) && bet >= 0 && bet <= MAX_BET && bet % CHIPS[0] === 0
export const validAuto = (auto) => auto === null || (Number.isInteger(auto) && auto > 100 && auto < MAX_MULT)

// «2,31×»
export const fmtMult = (mult) => `${(mult / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`

// Fase de la ronda según el reloj del servidor. El vuelo puede acabar antes (si explota): eso lo dice el servidor.
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - round * ROUND_MS
  const phase = offset < BETS_MS ? 'betting' : offset < BETS_MS + FLIGHT_MS ? 'flight' : 'pause'
  return { round, offset, phase, flown: offset - BETS_MS }
}

export const initialState = {
  chip: 50,
  auto: null, // retiro automático elegido (centésimas) o null
  round: null, // ronda a la que pertenece la apuesta
  stake: 0, // lo que hay en juego en esta pantalla
  confirmed: { stake: 0, auto: null }, // lo que ya tiene el servidor (su importe ya salió del saldo)
  last: 0, // apuesta de la ronda anterior, para «Repetir»
  synced: null, // ronda de la que ya se recogió la apuesta guardada en el servidor
}

// Lo que cuesta la apuesta que aún no ha confirmado el servidor.
export const unconfirmed = (state) => state.stake - state.confirmed.stake
export const isDirty = (state) => state.stake !== state.confirmed.stake || (state.stake > 0 && state.auto !== state.confirmed.auto)

// action.available: saldo libre (el del servidor menos lo que está por confirmar).
export function reducer(state, action) {
  switch (action.type) {
    // Empieza otra ronda: lo apostado en la anterior queda para «Repetir».
    case 'ROUND': {
      if (state.round === action.round) return state
      const played = state.confirmed.stake > 0 ? state.confirmed.stake : state.last
      return { ...state, round: action.round, stake: 0, confirmed: { stake: 0, auto: null }, last: played }
    }
    // Apuesta que el servidor tiene guardada para esta ronda (al entrar o tras recargar), solo la primera vez.
    case 'SERVER': {
      if (state.round !== action.round || state.synced === action.round) return state
      const next = { ...state, synced: action.round }
      if (state.stake === 0 && action.bet > 0) {
        return { ...next, stake: action.bet, auto: action.auto, confirmed: { stake: action.bet, auto: action.auto } }
      }
      return next
    }
    case 'CONFIRMED':
      if (state.round !== action.round) return state
      return { ...state, confirmed: { stake: action.stake, auto: action.auto } }
    // El servidor no aceptó el cambio: vuelve a lo confirmado.
    case 'REJECTED':
      if (state.round !== action.round) return state
      return { ...state, stake: state.confirmed.stake, auto: state.confirmed.auto }
    case 'SELECT_CHIP':
      return { ...state, chip: action.chip }
    case 'AUTO':
      return { ...state, auto: action.auto }
    case 'ADD': {
      if (state.chip > action.available || state.stake + state.chip > MAX_BET) return state
      return { ...state, stake: state.stake + state.chip }
    }
    case 'CLEAR':
      return { ...state, stake: 0 }
    case 'DOUBLE': {
      if (state.stake === 0 || state.stake > action.available || state.stake * 2 > MAX_BET) return state
      return { ...state, stake: state.stake * 2 }
    }
    case 'REPEAT': {
      if (state.stake > 0 || state.last === 0 || state.last > action.available) return state
      return { ...state, stake: state.last }
    }
    default:
      return state
  }
}
