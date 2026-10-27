// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// Reglas puras del blackjack, sin DOM, sin Node y sin azar propio: las usan el modo solitario y el servidor de mesa.
export const DECKS = 6
export const DEALER_STANDS = 17

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs']

// Zapato de seis barajas mezclado con Fisher-Yates. `randomInt(n)` devuelve un entero en [0, n).
export function createShoe(randomInt) {
  const shoe = []
  for (let deck = 0; deck < DECKS; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) shoe.push({ rank, suit, id: shoe.length })
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[shoe[i], shoe[j]] = [shoe[j], shoe[i]]
  }
  return shoe
}

export function cardValue({ rank }) {
  if (rank === 'A') return 11
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return Number(rank)
}

// Total de una mano. Es blanda si un as sigue contando 11.
export function handValue(cards) {
  let total = 0
  let aces = 0
  for (const card of cards) {
    total += cardValue(card)
    if (card.rank === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

export const isNatural = (cards) => cards.length === 2 && handValue(cards).total === 21

// Resultado de una mano contra el crupier. `natural` indica si un 21 de entrada cuenta como blackjack.
export function settleHand(cards, bet, dealer, natural = true) {
  const player = handValue(cards).total
  const house = handValue(dealer).total
  const blackjack = natural && isNatural(cards)
  if (player > 21) return { outcome: 'bust', paid: 0 }
  if (isNatural(dealer)) return blackjack ? { outcome: 'push', paid: bet } : { outcome: 'lose', paid: 0 }
  if (blackjack) return { outcome: 'blackjack', paid: bet * 2.5 }
  if (house > 21 || player > house) return { outcome: 'win', paid: bet * 2 }
  if (player === house) return { outcome: 'push', paid: bet }
  return { outcome: 'lose', paid: 0 }
}

// El crupier solo roba si queda alguna mano viva que no sea blackjack.
export function dealerMustDraw(hands, dealer) {
  const live = hands.some((cards) => handValue(cards).total <= 21 && !isNatural(cards))
  return live && !isNatural(dealer) && handValue(dealer).total < DEALER_STANDS
}
