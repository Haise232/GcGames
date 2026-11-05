// Reglas puras del Bingo (en vivo): las usan la pantalla para pintar y el servidor (api/_juegos/bingo.mjs) para sortear y
// pagar. Bingo español de 90 bolas: una partida cada ROUND_MS para todos. Se compran cartones mientras está abierta la
// venta, luego salen las bolas una a una y gana la línea el primer cartón que completa una fila y el bingo el primero
// que lo completa entero. Los importes van en euros enteros.
export const ROUND_MS = 240000
export const BUY_MS = 45000 // venta de cartones abierta
export const BALL_MS = 2000 // una bola cada este rato
export const BALLS = 90
export const MAX_CARDS = 4 // cartones por persona y partida (de cualquier tipo)

// Dos tipos de cartón. El premium cobra los premios enteros; si en la partida hay alguno, los demás cobran en proporción a
// su precio (el simple, la quinta parte) y lo que no cobran se queda en la jaula. Así cada euro rinde lo mismo en los dos.
export const KINDS = {
  simple: { name: 'Simple', price: 10000 },
  premium: { name: 'Premium', price: 50000 },
}
export const LEGACY_PRICE = 500 // cartones comprados antes de los precios nuevos (guardados sin precio)
export const priceOf = (saved, i) => saved?.prices?.[i] ?? LEGACY_PRICE
export const isPremium = (price) => price >= KINDS.premium.price

// Lo vendido en una partida se reparte así (en %): la línea, el bingo y el resto va al bote (la jaula).
export const LINE_PCT = 15
export const BINGO_PCT = 60
export const POT_PCT = 100 - LINE_PCT - BINGO_PCT

// El bote (la jaula) se lo lleva quien cante bingo con la bola POT_BALL o antes (con 8 cartones, una de cada ~20
// partidas) o justo con la bola dorada (una por partida: ~1 de cada 90). Lo alimentan el 25 % de los cartones, lo que
// los simples no cobran y lo que se pierde en el casino.
export const POT_BALL = 66

// La banca decide cuándo se puede llevar el bote: control es la lista de aperturas [{ desde, hasta, una }] (ms; hasta
// null = sin límite; una: se cierra en cuanto alguien se lo lleve), de la más nueva a la más vieja. Una partida puede dar
// bote si se cerró su venta con el bote abierto; abrir o cerrar después no cambia una partida que ya se está jugando.
export const POT_OPEN_MINUTES = [30, 60, 120, 240, null]
export const MAX_OPENINGS = 20
export const openingAt = (control, t) =>
  (Array.isArray(control) ? control : []).find((o) => o.desde <= t && (o.hasta === null || t < o.hasta)) ?? null

export const ROWS = 3
export const COLS = 9

export const startOf = (round) => round * ROUND_MS
export const drawStart = (round) => startOf(round) + BUY_MS
// Hora a la que sale la bola número n (1 = la primera).
export const ballAt = (round, n) => drawStart(round) + n * BALL_MS

// Fase de la partida en el instante t: «buy» (venta), «draw» (salen bolas) o «done» (todas fuera, esperando la siguiente).
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - startOf(round)
  if (offset < BUY_MS) return { round, offset, phase: 'buy' }
  const drawn = Math.min(BALLS, Math.floor((offset - BUY_MS) / BALL_MS))
  return { round, offset, phase: drawn < BALLS ? 'draw' : 'done', drawn }
}

// Columna de un número en el cartón: 1-9, 10-19, …, 80-90.
export const colOf = (n) => Math.min(COLS - 1, Math.floor(n / 10))
const colRange = (c) => (c === 0 ? [1, 9] : c === COLS - 1 ? [80, 90] : [c * 10, c * 10 + 9])

// Un cartón de 3 filas y 9 columnas (27 casillas por filas, 0 = hueco): 5 números por fila, al menos uno por columna y
// en cada columna los números de su decena, de menor a mayor hacia abajo. rand(n) da un entero de 0 a n-1.
export function makeCard(rand) {
  let rows
  for (;;) {
    rows = Array.from({ length: ROWS }, () => {
      const cols = Array.from({ length: COLS }, (_, i) => i)
      for (let i = cols.length - 1; i > 0; i--) {
        const j = rand(i + 1)
        ;[cols[i], cols[j]] = [cols[j], cols[i]]
      }
      return new Set(cols.slice(0, 5))
    })
    if (Array.from({ length: COLS }, (_, c) => rows.some((r) => r.has(c))).every(Boolean)) break
  }
  const cells = Array(ROWS * COLS).fill(0)
  for (let c = 0; c < COLS; c++) {
    const where = rows.map((r, i) => (r.has(c) ? i : -1)).filter((i) => i >= 0)
    const [lo, hi] = colRange(c)
    const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    const picked = []
    for (let k = 0; k < where.length; k++) picked.push(pool.splice(rand(pool.length), 1)[0])
    picked.sort((a, b) => a - b)
    where.forEach((row, k) => (cells[row * COLS + c] = picked[k]))
  }
  return cells
}

// Un cartón bien formado (los que manda el servidor; la pantalla no los inventa).
export function validCard(cells) {
  if (!Array.isArray(cells) || cells.length !== ROWS * COLS) return false
  const nums = cells.filter((n) => n !== 0)
  if (nums.length !== 15 || new Set(nums).size !== 15) return false
  return cells.every((n, i) => n === 0 || (Number.isInteger(n) && n >= 1 && n <= BALLS && colOf(n) === i % COLS))
}

export const rowOf = (cells, r) => cells.slice(r * COLS, r * COLS + COLS).filter((n) => n !== 0)

// Con qué bola (1-90) se completa la primera fila y el cartón entero, sabiendo en qué posición sale cada número.
// pos[n] = número de bola en la que sale n.
export function marksOf(cells, pos) {
  const line = Math.min(...Array.from({ length: ROWS }, (_, r) => Math.max(...rowOf(cells, r).map((n) => pos[n]))))
  const bingo = Math.max(...cells.filter((n) => n !== 0).map((n) => pos[n]))
  return { line, bingo }
}

export const positions = (order) => {
  const pos = Array(BALLS + 1).fill(0)
  order.forEach((n, i) => (pos[n] = i + 1))
  return pos
}

// Lo que falta a un cartón con las bolas que ya han salido: el mínimo de una fila y los del cartón entero.
export function missing(cells, drawn) {
  const rows = Array.from({ length: ROWS }, (_, r) => rowOf(cells, r).filter((n) => !drawn.has(n)).length)
  return { line: Math.min(...rows), bingo: rows.reduce((a, b) => a + b, 0) }
}

// Reparto de una partida ya sorteada. cards: [{ owner, cells, price }] · order: las 90 bolas en el orden en que salen ·
// golden: la bola dorada. Devuelve las bolas de la línea y el bingo, quién gana (índices de cards) y cuánto se lleva cada
// cartón ganador. Los empates se reparten a partes iguales y cada ganador cobra su parte por su peso (su precio entre el
// del cartón más caro de la partida); lo que no se cobra se queda en la jaula.
export function settle(cards, order, pot, golden = null) {
  const pos = positions(order)
  const marks = cards.map((c) => marksOf(c.cells, pos))
  const sold = cards.reduce((sum, c) => sum + c.price, 0)
  const none = { sold, lineBall: null, bingoBall: null, line: [], bingo: [], jackpot: false, early: false, golden: false, prizes: [], potAfter: pot }
  if (!cards.length) return none
  const top = Math.max(...cards.map((c) => c.price))
  const lineBall = Math.min(...marks.map((m) => m.line))
  const bingoBall = Math.min(...marks.map((m) => m.bingo))
  const line = marks.flatMap((m, i) => (m.line === lineBall ? [i] : []))
  const bingo = marks.flatMap((m, i) => (m.bingo === bingoBall ? [i] : []))
  const early = bingoBall <= POT_BALL
  const gold = golden !== null && order[bingoBall - 1] === golden
  const jackpot = (early || gold) && pot > 0
  const prizes = cards.map(() => ({ line: 0, bingo: 0, pot: 0 }))
  // Reparte total entre los ganadores; devuelve lo que no se cobra.
  const share = (total, winners, key) => {
    let paid = 0
    for (const i of winners) {
      const amount = Math.floor((total / winners.length) * (cards[i].price / top))
      prizes[i][key] += amount
      paid += amount
    }
    return total - paid
  }
  const left = share(Math.floor((sold * LINE_PCT) / 100), line, 'line') + share(Math.floor((sold * BINGO_PCT) / 100), bingo, 'bingo')
  const potAfter = (jackpot ? share(pot, bingo, 'pot') : pot) + left
  return { sold, lineBall, bingoBall, line, bingo, jackpot, early, golden: gold, prizes, potAfter }
}
