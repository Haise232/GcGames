// Reglas puras de la Subasta (en vivo): las usan la pantalla y el servidor (api/_juegos/subasta.mjs).
// Cada ROUND_MS sale una caja para todos. Se sabe de qué tipo es, pero no lo que lleva. Las pujas son a la vista: todos
// ven quién va ganando y cuánto. Para superar al que va primero hay que pujar al menos MIN_RAISE más; tu puja total
// sale del saldo (al subirla pagas la diferencia) y al cerrar se devuelve a quien no gana. Si alguien puja en los
// últimos SNIPE_MS, el cierre se retrasa hasta SNIPE_MS después de esa puja (prórroga), como mucho hasta MAX_CLOSE_MS.
export const ROUND_MS = 90000
export const BID_MS = 45000 // cierre si nadie alarga
export const SNIPE_MS = 10000
export const MAX_CLOSE_MS = 75000 // la prórroga no pasa de aquí: quedan al menos 15 s para abrir la caja
export const BID_STEP = 100
export const MAX_BID = 1000000
export const RAISE_PCT = 5 // superar al primero: al menos un 5 % más (y como poco BID_STEP)
export const VERSION = 2 // pujas y rondas de esta versión (las de antes, de 60 s, se devuelven)

// Cajas: valor medio de lo que llevan (E) y cuántas de cada 100 salen.
export const TIERS = {
  madera: { name: 'Caja de madera', value: 300, weight: 24 },
  plata: { name: 'Caja de plata', value: 800, weight: 20 },
  oro: { name: 'Caja de oro', value: 2000, weight: 16 },
  rubi: { name: 'Caja de rubí', value: 4000, weight: 14 },
  diamante: { name: 'Caja de diamante', value: 7000, weight: 11 },
  legendaria: { name: 'Cofre legendario', value: 12000, weight: 9 },
  cosmica: { name: 'Caja cósmica', value: 20000, weight: 6 },
}
export const TIER_ORDER = ['madera', 'plata', 'oro', 'rubi', 'diamante', 'legendaria', 'cosmica']

// Lo que puede haber dentro, en veces el valor de la caja, y cuántas de cada 1000. De media, 0,96 veces el valor.
export const PRIZES = [
  { mult: 0, weight: 340, name: 'Una piedra', icon: '🪨' },
  { mult: 0.1, weight: 100, name: 'Un calcetín sucio', icon: '🧦' },
  { mult: 0.25, weight: 130, name: 'Calderilla', icon: '🪙' },
  { mult: 0.5, weight: 130, name: 'Un fajo de billetes', icon: '💵' },
  { mult: 1, weight: 110, name: 'Un maletín', icon: '💼' },
  { mult: 2, weight: 100, name: 'Lingotes de oro', icon: '🧈' },
  { mult: 4, weight: 60, name: 'El cofre del tesoro', icon: '👑' },
  { mult: 8, weight: 25, name: '¡El diamante!', icon: '💎' },
  { mult: 20, weight: 5, name: '¡¡EL JACKPOT!!', icon: '🌟' },
]

// Puja mínima: el valor medio entre 0,96, redondeado a BID_STEP hacia arriba. Así, aunque nadie más puje, de media se
// recupera menos de lo pujado y la subasta no sirve para inflar el Score.
export const minBid = (tier) => Math.ceil(TIERS[tier].value / 0.96 / BID_STEP) * BID_STEP

// Lo que hay que subir para superar una puja.
export const raiseOf = (amount) => Math.max(BID_STEP, Math.ceil((amount * RAISE_PCT) / 100 / BID_STEP) * BID_STEP)

// La puja más baja que vale ahora: la mínima de la caja o superar a la que va primero.
export const nextBid = (tier, top) => (top > 0 ? top + raiseOf(top) : minBid(tier))

export const prizeAmount = (tier, prize) => Math.round(TIERS[tier].value * PRIZES[prize].mult)
export const maxPrize = (tier) => prizeAmount(tier, PRIZES.length - 1)

// Sorteo de la caja con dos enteros uniformes: r100 (0-99) para el tipo y r1000 (0-999) para lo que lleva.
export function drawBox(r100, r1000) {
  let left = r100
  const tier = TIER_ORDER.find((t) => (left -= TIERS[t].weight) < 0)
  let rest = r1000
  const prize = PRIZES.findIndex((p) => (rest -= p.weight) < 0)
  return { tier, prize }
}

export const validAmount = (amount) => Number.isInteger(amount) && amount % BID_STEP === 0 && amount > 0 && amount <= MAX_BID

// Ganador entre las pujas [{ owner, amount, at }]: la más alta y, si empatan, la más antigua. null si no hay ninguna.
export function winnerOf(bids) {
  let best = null
  for (const b of bids) if (!best || b.amount > best.amount || (b.amount === best.amount && b.at < best.at)) best = b
  return best
}

// Hora de cierre de una ronda según la última puja (lastAt: la más reciente de todas, o 0 si no hay).
export function closeOf(round, lastAt = 0) {
  const start = round * ROUND_MS
  return Math.min(start + MAX_CLOSE_MS, Math.max(start + BID_MS, lastAt + SNIPE_MS))
}

export const roundOf = (t) => Math.floor(t / ROUND_MS)
