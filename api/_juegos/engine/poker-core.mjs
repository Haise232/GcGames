// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// Reglas puras del Texas Hold'em, sin DOM, sin Node y sin azar propio: las usan el servidor y la mesa del cliente.
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs']

export const HAND_NAMES = [
  'Carta alta',
  'Pareja',
  'Doble pareja',
  'Trío',
  'Escalera',
  'Color',
  'Full',
  'Póker',
  'Escalera de color',
]

export const rankValue = (rank) => RANKS.indexOf(rank) + 2

// Una baraja de 52 cartas mezclada con Fisher-Yates. `randomInt(n)` devuelve un entero en [0, n).
export function createDeck(randomInt) {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit, id: deck.length })
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// Puntuación de cinco cartas: [categoría, desempates...]. Se compara elemento a elemento.
function score5(cards) {
  const values = cards.map((card) => rankValue(card.rank)).sort((a, b) => b - a)
  const flush = cards.every((card) => card.suit === cards[0].suit)
  let straight = 0
  if (new Set(values).size === 5) {
    if (values[0] - values[4] === 4) straight = values[0]
    else if (values[0] === 14 && values[1] === 5) straight = 5 // la rueda: A-2-3-4-5
  }
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  // Grupos por tamaño y luego por valor: el full 3-3-3-2-2 queda [3, 2].
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const ranked = groups.map(([value]) => value)
  const [first, second] = groups.map(([, count]) => count)
  if (straight && flush) return [8, straight]
  if (first === 4) return [7, ...ranked]
  if (first === 3 && second === 2) return [6, ...ranked]
  if (flush) return [5, ...values]
  if (straight) return [4, straight]
  if (first === 3) return [3, ...ranked]
  if (first === 2 && second === 2) return [2, ...ranked]
  if (first === 2) return [1, ...ranked]
  return [0, ...values]
}

export function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function handName(score) {
  return score[0] === 8 && score[1] === 14 ? 'Escalera real' : HAND_NAMES[score[0]]
}

// La mejor mano de cinco entre cinco a siete cartas.
export function bestHand(cards) {
  let best = null
  const n = cards.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]]
            const score = score5(five)
            if (!best || compareScores(score, best.score) > 0) best = { score, cards: five }
          }
  return best && { ...best, name: handName(best.score) }
}

const sameSeats = (a, b) => a.length === b.length && a.every((seat) => b.includes(seat))

// Bote principal y laterales. `contributions`: [{ seat, amount, live }], donde live = sigue en la mano.
export function buildPots(contributions) {
  const levels = [...new Set(contributions.map((c) => c.amount).filter((amount) => amount > 0))].sort((a, b) => a - b)
  const pots = []
  let previous = 0
  for (const level of levels) {
    let amount = 0
    for (const c of contributions) amount += Math.max(0, Math.min(c.amount, level) - previous)
    const eligible = contributions.filter((c) => c.live && c.amount >= level).map((c) => c.seat)
    const last = pots.at(-1)
    // Lo que solo pusieron jugadores retirados se suma al bote anterior.
    if (last && (eligible.length === 0 || sameSeats(last.eligible, eligible))) last.amount += amount
    else pots.push({ amount, eligible: eligible.length ? eligible : contributions.filter((c) => c.live).map((c) => c.seat) })
    previous = level
  }
  return pots
}

// Reparte cada bote entre las mejores manos que optan a él. `scores`: Map asiento -> puntuación.
// Las fichas sueltas de un empate van a quien se sienta primero tras el botón (`order`).
export function awardPots(pots, scores, order) {
  const won = new Map()
  for (const pot of pots) {
    let best = null
    let winners = []
    for (const seat of pot.eligible) {
      const score = scores.get(seat)
      const cmp = best ? compareScores(score, best) : 1
      if (cmp > 0) {
        best = score
        winners = [seat]
      } else if (cmp === 0) winners.push(seat)
    }
    winners.sort((a, b) => order.indexOf(a) - order.indexOf(b))
    const share = Math.floor(pot.amount / winners.length)
    let odd = pot.amount - share * winners.length
    for (const seat of winners) {
      won.set(seat, (won.get(seat) ?? 0) + share + (odd > 0 ? 1 : 0))
      odd--
    }
  }
  return won
}
