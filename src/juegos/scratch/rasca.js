// Reglas puras del Rasca de las Fiestas (Season 4): las usa la pantalla (Rasca.jsx) para pintar y el servidor
// (api/_juegos/solo.mjs) para sortear. Compras un cartón de 3 × 3 casillas tapadas; al rascar salen símbolos de
// Canarias y si hay tres iguales cobras su premio (como mucho hay un trío en cada cartón).
//
// El servidor sortea primero el premio (PRIZES, con su probabilidad) y después dibuja un cartón que lo enseñe: el trío
// del premio y el resto de casillas con símbolos que no lleguen a tres. Así el retorno es exacto: la suma de
// probabilidad × premio es HOUSE (el 96 %).

export const PRICES = [10, 50, 100, 250, 500, 1000, 2000]
export const HOUSE = 0.96
export const SIZE = 3
export const CELLS = SIZE * SIZE

// De menos a más premio. p: probabilidad por millón de que el cartón traiga ese trío.
export const SYMBOLS = {
  papa: { name: 'Papas arrugadas', icon: '🥔', mult: 1, p: 250000 },
  mojo: { name: 'Mojo picón', icon: '🌶️', mult: 2, p: 120000 },
  platano: { name: 'Plátano de Canarias', icon: '🍌', mult: 5, p: 30000 },
  timple: { name: 'Timple', icon: '🎸', mult: 20, p: 6000 },
  teide: { name: 'El Teide', icon: '🌋', mult: 100, p: 1000 },
  drago: { name: 'Drago milenario', icon: '🌳', mult: 500, p: 200 },
}
export const IDS = Object.keys(SYMBOLS)
const MILLION = 1_000_000

export const validBet = (bet) => PRICES.includes(bet)
export const payout = (bet, prize) => (prize ? bet * SYMBOLS[prize].mult : 0)
// Probabilidad de que un cartón tenga premio (de cualquier tipo).
export const winChance = IDS.reduce((sum, id) => sum + SYMBOLS[id].p, 0) / MILLION

// El premio del cartón (id del símbolo) o null. rand(n): entero de 0 a n−1.
export function drawPrize(rand) {
  let u = rand(MILLION)
  for (const id of IDS) {
    if (u < SYMBOLS[id].p) return id
    u -= SYMBOLS[id].p
  }
  return null
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// Un cartón (9 ids) que enseña el premio: su trío y, en el resto, como mucho dos de cada otro símbolo.
export function makeCard(prize, rand) {
  const others = IDS.filter((id) => id !== prize).flatMap((id) => [id, id])
  const fill = shuffle(others, rand).slice(0, prize ? CELLS - 3 : CELLS)
  return shuffle(prize ? [prize, prize, prize, ...fill] : fill, rand)
}

// El trío de un cartón (o null), por si la pantalla lo quiere comprobar.
export function prizeOf(card) {
  const count = {}
  for (const id of card) count[id] = (count[id] ?? 0) + 1
  return IDS.find((id) => count[id] >= 3) ?? null
}

export const fmtMult = (m) => `×${m.toLocaleString('es-ES')}`
