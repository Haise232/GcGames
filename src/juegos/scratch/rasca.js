// Reglas puras del Rasca de las Fiestas (Season 4): las usan la pantalla (Rasca.jsx) para pintar y el servidor
// (api/_juegos/solo.mjs) para sortear. Hay varios cartones (TYPES), cada uno con su precio, su dibujo y su forma de
// ganar, y se rascan frotando una moneda por encima:
//   - «match» (tres iguales): una rejilla de símbolos; si hay tres iguales, cobras el premio de ese símbolo (como
//     mucho hay un trío en cada cartón).
//   - «numbers» (números ganadores): arriba, los números ganadores; abajo, tus números, cada uno con un premio. Si uno de
//     tus números es ganador, cobras su premio (como mucho coincide uno).
//
// El servidor sortea primero el premio (cada cartón con su tabla de probabilidades) y después dibuja un cartón que lo
// enseñe. Así el retorno es exacto: en todos los cartones, la suma de probabilidad × premio es HOUSE (el 96 %).

export const HOUSE = 0.96
const MILLION = 1_000_000

// prizes: [id, multiplicador, probabilidad por millón]. En «match», el id es el del símbolo (symbols).
export const TYPES = {
  papas: {
    foil: 'silver',
    name: 'Papas y Mojo',
    blurb: 'El de toda la vida: tres iguales y cobras.',
    price: 10,
    kind: 'match',
    cols: 3,
    rows: 3,
    symbols: {
      papa: { name: 'Papas arrugadas', icon: '🥔' },
      mojo: { name: 'Mojo picón', icon: '🌶️' },
      platano: { name: 'Plátano', icon: '🍌' },
      timple: { name: 'Timple', icon: '🎸' },
      teide: { name: 'El Teide', icon: '🌋' },
      drago: { name: 'Drago milenario', icon: '🌳' },
    },
    prizes: [
      ['papa', 1, 250000],
      ['mojo', 2, 120000],
      ['platano', 5, 30000],
      ['timple', 20, 6000],
      ['teide', 100, 1000],
      ['drago', 500, 200],
    ],
  },
  carnaval: {
    foil: 'pearl',
    name: 'Carnaval',
    blurb: 'Dos números ganadores y seis tuyos, cada uno con su premio.',
    price: 50,
    kind: 'numbers',
    winning: 2,
    mine: 6,
    max: 40,
    icon: '🎭',
    prizes: [
      ['p1', 1, 200000],
      ['p2', 2, 100000],
      ['p4', 4, 40000],
      ['p10', 10, 10000],
      ['p50', 50, 2000],
      ['p200', 200, 500],
      ['p1000', 1000, 100],
    ],
  },
  islas: {
    foil: 'silver',
    name: 'Ruta de las Islas',
    blurb: 'Doce casillas con las siete islas: tres iguales y cobras su premio.',
    price: 200,
    kind: 'match',
    cols: 4,
    rows: 3,
    symbols: {
      elhierro: { name: 'El Hierro', icon: '🦎' },
      lagomera: { name: 'La Gomera', icon: '🎶' },
      lapalma: { name: 'La Palma', icon: '🌲' },
      fuerteventura: { name: 'Fuerteventura', icon: '🏖️' },
      lanzarote: { name: 'Lanzarote', icon: '🔥' },
      grancanaria: { name: 'Gran Canaria', icon: '🌴' },
      tenerife: { name: 'Tenerife', icon: '🌋' },
    },
    prizes: [
      ['elhierro', 1, 220000],
      ['lagomera', 2, 100000],
      ['lapalma', 3, 50000],
      ['fuerteventura', 5, 30000],
      ['lanzarote', 10, 10000],
      ['grancanaria', 25, 2000],
      ['tenerife', 100, 900],
    ],
  },
  drago: {
    foil: 'gold',
    name: 'Drago de Oro',
    blurb: 'El cartón de lujo: un número ganador y seis tuyos, hasta ×100.',
    price: 1000,
    kind: 'numbers',
    winning: 1,
    mine: 6,
    max: 30,
    icon: '🌳',
    prizes: [
      ['p1', 1, 300000],
      ['p15', 1.5, 200000],
      ['p3', 3, 50000],
      ['p10', 10, 10000],
      ['p50', 50, 1000],
      ['p100', 100, 600],
    ],
  },
}
export const TYPE_IDS = Object.keys(TYPES)

export const validType = (type) => typeof type === 'string' && Object.hasOwn(TYPES, type)
export const multOf = (type, prize) => (prize ? TYPES[type].prizes.find(([id]) => id === prize)[1] : 0)
export const payout = (type, prize) => Math.floor(TYPES[type].price * multOf(type, prize) + 1e-6)
export const winChance = (type) => TYPES[type].prizes.reduce((sum, [, , p]) => sum + p, 0) / MILLION
export const topMult = (type) => Math.max(...TYPES[type].prizes.map(([, m]) => m))
export const cellsOf = (type) => (TYPES[type].kind === 'match' ? TYPES[type].cols * TYPES[type].rows : TYPES[type].winning + TYPES[type].mine)

// El premio del cartón (id) o null. rand(n): entero de 0 a n−1.
export function drawPrize(type, rand) {
  let u = rand(MILLION)
  for (const [id, , p] of TYPES[type].prizes) {
    if (u < p) return id
    u -= p
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

// El cartón que enseña el premio.
//   match: { cells: [ids de símbolo] } con el trío del premio y, en el resto, como mucho dos de cada otro símbolo.
//   numbers: { winning: [números], mine: [{ n, prize }] } con un solo número tuyo ganador (el del premio) o ninguno.
export function makeCard(type, prize, rand) {
  const t = TYPES[type]
  if (t.kind === 'match') {
    const total = t.cols * t.rows
    const others = Object.keys(t.symbols)
      .filter((id) => id !== prize)
      .flatMap((id) => [id, id])
    const fill = shuffle(others, rand).slice(0, prize ? total - 3 : total)
    return { cells: shuffle(prize ? [prize, prize, prize, ...fill] : fill, rand) }
  }
  const pool = shuffle(Array.from({ length: t.max }, (_, k) => k + 1), rand)
  const winning = pool.slice(0, t.winning).sort((a, b) => a - b)
  const losers = pool.slice(t.winning)
  // Los premios que se ven junto a los números que no tocan: cualquiera de la tabla (no cuentan).
  const decoy = () => t.prizes[rand(t.prizes.length)][0]
  const mine = losers.slice(0, t.mine).map((n) => ({ n, prize: decoy() }))
  if (prize) mine[rand(t.mine)] = { n: winning[rand(t.winning)], prize }
  return { winning, mine }
}

// El premio de un cartón (para comprobarlo): el trío o el número que coincide.
export function prizeOf(type, card) {
  const t = TYPES[type]
  if (t.kind === 'match') {
    const count = {}
    for (const id of card.cells) count[id] = (count[id] ?? 0) + 1
    return Object.keys(t.symbols).find((id) => count[id] >= 3) ?? null
  }
  return card.mine.find((m) => card.winning.includes(m.n))?.prize ?? null
}

// Las casillas ganadoras (índices de casilla, como las pinta la pantalla: en «numbers», primero los números ganadores
// y luego los tuyos).
export function winCells(type, card, prize) {
  if (!prize) return []
  const t = TYPES[type]
  if (t.kind === 'match') return card.cells.map((id, i) => (id === prize ? i : -1)).filter((i) => i >= 0)
  const k = card.mine.findIndex((m) => card.winning.includes(m.n))
  return [card.winning.indexOf(card.mine[k].n), t.winning + k]
}

export const fmtMult = (m) => `×${m.toLocaleString('es-ES')}`
