// Orden de los números en una rueda europea (un solo cero), en sentido horario.
export const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]
export const SEGMENT = 360 / WHEEL.length

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black')

// Reglas puras: las usa la pantalla para pintar y el servidor (api/_juegos) para resolver la tirada con el saldo semanal.
export const CHIPS = [5, 25, 100, 500]
const LUCKY_MULTIPLIERS = [50, 50, 75, 75, 100, 150]
// Pagos ajustados para que la casa conserve un poco de ventaja (retorno < 100 % con relámpagos y rachas): con el
// saldo compartido del Score, una ruleta que devuelva más de lo apostado se podría «cultivar».
export const STRAIGHT_PAYS = 30
const STREAK_STEP = 0.05
const STREAK_STEPS = 3
const BET_ID = /^(n:([0-9]|[12][0-9]|3[0-6])|red|black|even|odd|low|high|dozen:[123]|col:[123])$/
const MAX_CHIPS = 300
const mathInt = (n) => Math.floor(Math.random() * n)

// Identificadores de apuesta: n:17, red, black, even, odd, low, high, dozen:1-3, col:1-3
export function wins(id, n) {
  const [kind, arg] = id.split(':')
  if (kind === 'n') return n === Number(arg)
  if (n === 0) return false
  switch (kind) {
    case 'red':
    case 'black':
      return colorOf(n) === kind
    case 'even':
      return n % 2 === 0
    case 'odd':
      return n % 2 === 1
    case 'low':
      return n <= 18
    case 'high':
      return n >= 19
    case 'dozen':
      return Math.ceil(n / 12) === Number(arg)
    case 'col':
      return ((n - 1) % 3) + 1 === Number(arg)
    default:
      return false
  }
}

// Pago por cada unidad apostada, sin contar la apuesta devuelta.
export function multiplier(id) {
  const kind = id.split(':')[0]
  if (kind === 'n') return STRAIGHT_PAYS
  if (kind === 'dozen' || kind === 'col') return 2
  return 1
}

// Números relámpago de una tirada: de 1 a 3, cada uno con su pago especial
// para las apuestas a pleno. Devuelve { número: multiplicador }.
// rand(n): entero de 0 a n-1 (en el servidor, randomInt de node:crypto).
export function pickLucky(rand = mathInt) {
  const lucky = {}
  const count = 1 + rand(3)
  while (Object.keys(lucky).length < count) {
    const n = rand(WHEEL.length)
    lucky[n] = LUCKY_MULTIPLIERS[rand(LUCKY_MULTIPLIERS.length)]
  }
  return lucky
}

// Extra sobre la ganancia según las victorias seguidas (en las que al menos duplicas lo apostado): +5% por
// cada una a partir de la segunda, hasta +15%.
export const streakBonus = (streak) => Math.min(Math.max(streak - 1, 0), STREAK_STEPS) * STREAK_STEP

// Fichas válidas: casillas que existen y cantidades de fichas enteras.
export const validBets = (placed) =>
  Array.isArray(placed) &&
  placed.length > 0 &&
  placed.length <= MAX_CHIPS &&
  placed.every((bet) => typeof bet?.id === 'string' && BET_ID.test(bet.id) && CHIPS.includes(bet.amount))

// Resultado de una tirada con el número n, los relámpago, la racha que traía el jugador y `floor`, la ganancia más
// pequeña de esa racha.
export function settle(placed, n, lucky, streak, floor) {
  const boost = lucky[n]
  let payout = 0
  let boosted = null
  for (const bet of placed) {
    if (!wins(bet.id, n)) continue
    const straight = bet.id.startsWith('n:')
    if (straight && boost) boosted = boost
    payout += bet.amount * ((straight && boost ? boost : multiplier(bet.id)) + 1)
  }
  const stake = totalOf(placed)
  const profit = payout - stake
  // Solo cuentan para la racha las tiradas en las que al menos duplicas lo apostado: cubrir media mesa para ganar
  // poco y casi siempre no da extra.
  const doubled = profit >= stake
  const nextStreak = doubled ? streak + 1 : 0
  // El extra se calcula sobre la ganancia más pequeña de la racha: si no, se podría hacer la racha con fichas de 5 y
  // apostarlo todo al llegar al +15 % (con rojo/negro eso devuelve más de lo apostado). Sin `floor` (rachas guardadas
  // antes de este cambio) cuenta la ganancia de esta tirada.
  const nextFloor = doubled ? (streak > 0 && floor !== undefined ? Math.min(floor, profit) : profit) : 0
  const bonus = doubled ? Math.round(nextFloor * streakBonus(nextStreak)) : 0
  return { payout, bonus, boosted, streak: nextStreak, floor: nextFloor, net: profit + bonus }
}

export const totalOf = (placed) => placed.reduce((sum, bet) => sum + bet.amount, 0)

export function totalsById(placed) {
  const totals = {}
  for (const { id, amount } of placed) totals[id] = (totals[id] ?? 0) + amount
  return totals
}

// --- Mesa en vivo: una ronda cada ROUND_MS para todos (el servidor y la pantalla usan los mismos tiempos). ---
export const ROUND_MS = 25000
export const BETS_MS = 15000 // «hagan sus apuestas»
export const SPIN_MS = 8000 // la bola gira; los 2 s que quedan se ve el número ganador

// Sectores de la pista (racetrack) de la rueda europea. Aquí cada número del sector lleva una ficha a pleno.
export const SECTORS = [
  { id: 'tiers', name: 'Tercio', numbers: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33] },
  { id: 'orphelins', name: 'Huérfanos', numbers: [17, 34, 6, 1, 20, 14, 31, 9] },
  { id: 'voisins', name: 'Vecinos del cero', numbers: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25] },
  { id: 'zero', name: 'Juego cero', numbers: [12, 35, 3, 26, 0, 32, 15] },
]

// El número y sus `count` vecinos a cada lado en la rueda.
export function neighbours(n, count = 2) {
  const i = WHEEL.indexOf(n)
  return Array.from({ length: count * 2 + 1 }, (_, k) => WHEEL[(i - count + k + WHEEL.length) % WHEEL.length])
}

// Fase de la ronda según el reloj del servidor.
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - round * ROUND_MS
  const phase = offset < BETS_MS ? 'betting' : offset < BETS_MS + SPIN_MS ? 'spinning' : 'result'
  return { round, offset, phase }
}

export const initialState = {
  chip: 25,
  round: null, // ronda a la que pertenecen las fichas
  placed: [], // una entrada por ficha puesta, en orden, para poder deshacer
  confirmed: [], // las que ya tiene el servidor (su importe ya salió del saldo)
  lastPlaced: [],
  synced: null, // ronda de la que ya se recogieron las fichas guardadas en el servidor
}

// Lo que cuestan las fichas que aún no ha confirmado el servidor.
export const unconfirmed = (state) => totalOf(state.placed) - totalOf(state.confirmed)

// action.available: saldo libre (el del servidor menos lo que está por confirmar).
export function reducer(state, action) {
  switch (action.type) {
    // Empieza otra ronda: lo apostado en la anterior queda para «Repetir».
    case 'ROUND': {
      if (state.round === action.round) return state
      const played = state.confirmed.length > 0 ? state.confirmed : state.lastPlaced
      return { ...state, round: action.round, placed: [], confirmed: [], lastPlaced: played }
    }
    // Fichas que el servidor tiene guardadas para esta ronda (al entrar o tras recargar).
    // Solo la primera respuesta de cada ronda: después, lo que manda es lo que haces en esta pantalla.
    case 'SERVER': {
      if (state.round !== action.round || state.synced === action.round) return state
      const next = { ...state, synced: action.round }
      if (state.placed.length === 0 && action.bets.length > 0) return { ...next, placed: action.bets, confirmed: action.bets }
      return next
    }
    case 'CONFIRMED': {
      if (state.round !== action.round) return state
      return { ...state, confirmed: action.bets }
    }
    // El servidor no aceptó el cambio: la mesa vuelve a lo confirmado.
    case 'REJECTED': {
      if (state.round !== action.round) return state
      return { ...state, placed: state.confirmed }
    }
    case 'SELECT_CHIP':
      return { ...state, chip: action.chip }
    case 'PLACE': {
      const chips = action.ids.map((id) => ({ id, amount: state.chip }))
      if (totalOf(chips) > action.available || state.placed.length + chips.length > MAX_CHIPS) return state
      return { ...state, placed: [...state.placed, ...chips] }
    }
    case 'UNDO':
      return { ...state, placed: state.placed.slice(0, -1) }
    // Quita la última ficha puesta en una casilla concreta.
    case 'REMOVE': {
      const i = state.placed.findLastIndex((bet) => bet.id === action.id)
      if (i < 0) return state
      return { ...state, placed: [...state.placed.slice(0, i), ...state.placed.slice(i + 1)] }
    }
    case 'CLEAR':
      return { ...state, placed: [] }
    case 'DOUBLE': {
      const total = totalOf(state.placed)
      if (total === 0 || total > action.available || state.placed.length * 2 > MAX_CHIPS) return state
      return { ...state, placed: [...state.placed, ...state.placed] }
    }
    case 'REPEAT': {
      const total = totalOf(state.lastPlaced)
      if (state.placed.length > 0 || total === 0 || total > action.available) return state
      return { ...state, placed: state.lastPlaced }
    }
    default:
      return state
  }
}
