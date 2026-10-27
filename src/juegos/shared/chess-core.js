// Reglas puras del ajedrez, sin DOM y sin Node: las usan el servidor (api/_juegos/engine/chess-core.mjs es una copia) y
// la mesa del cliente para marcar los movimientos posibles.
// Casillas: 0 = a1, 7 = h1, 56 = a8, 63 = h8. Piezas como en FEN: mayúscula blanca, minúscula negra, '' vacía.
export const FILES = 'abcdefgh'
export const PROMOS = 'qrbn'

export const nameOf = (i) => `${FILES[i % 8]}${Math.floor(i / 8) + 1}`
export function squareOf(name) {
  if (typeof name !== 'string' || name.length !== 2) return -1
  const f = FILES.indexOf(name[0])
  const r = Number(name[1]) - 1
  return f >= 0 && Number.isInteger(r) && r >= 0 && r < 8 ? r * 8 + f : -1
}
export const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null)
export const typeOf = (p) => p.toLowerCase()
const other = (color) => (color === 'w' ? 'b' : 'w')
const at = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1)
const mine = (color, type) => (color === 'w' ? type.toUpperCase() : type)

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

export function initial() {
  const back = 'rnbqkbnr'
  const board = Array(64).fill('')
  for (let f = 0; f < 8; f++) {
    board[f] = back[f].toUpperCase()
    board[8 + f] = 'P'
    board[48 + f] = 'p'
    board[56 + f] = back[f]
  }
  return { board, turn: 'w', castle: 'KQkq', ep: null, half: 0, full: 1 }
}

// ¿Ataca `by` la casilla i?
export function attacked(board, i, by) {
  const f = i % 8
  const r = Math.floor(i / 8)
  const back = by === 'w' ? -1 : 1 // los peones de `by` atacan desde una fila más atrás
  for (const df of [-1, 1]) {
    const j = at(f + df, r + back)
    if (j >= 0 && board[j] === mine(by, 'p')) return true
  }
  for (const [df, dr] of KNIGHT) {
    const j = at(f + df, r + dr)
    if (j >= 0 && board[j] === mine(by, 'n')) return true
  }
  for (const [df, dr] of KING) {
    const j = at(f + df, r + dr)
    if (j >= 0 && board[j] === mine(by, 'k')) return true
  }
  const slide = (dirs, types) => {
    for (const [df, dr] of dirs) {
      for (let k = 1; ; k++) {
        const j = at(f + df * k, r + dr * k)
        if (j < 0) break
        const p = board[j]
        if (!p) continue
        if (colorOf(p) === by && types.includes(typeOf(p))) return true
        break
      }
    }
    return false
  }
  return slide(ROOK, 'rq') || slide(BISHOP, 'bq')
}

export const kingOf = (board, color) => board.indexOf(mine(color, 'k'))
export const inCheck = (pos) => attacked(pos.board, kingOf(pos.board, pos.turn), other(pos.turn))

// Movimientos sin mirar si dejan al rey en jaque.
function pseudo(pos) {
  const { board, turn } = pos
  const enemy = other(turn)
  const moves = []
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (colorOf(p) !== turn) continue
    const f = i % 8
    const r = Math.floor(i / 8)
    const t = typeOf(p)
    if (t === 'p') {
      const dir = turn === 'w' ? 1 : -1
      const last = turn === 'w' ? 7 : 0
      const push = (to) => {
        if (Math.floor(to / 8) === last) for (const promo of PROMOS) moves.push({ from: i, to, promo })
        else moves.push({ from: i, to })
      }
      const one = at(f, r + dir)
      if (one >= 0 && !board[one]) {
        push(one)
        const two = at(f, r + 2 * dir)
        if (r === (turn === 'w' ? 1 : 6) && !board[two]) moves.push({ from: i, to: two })
      }
      for (const df of [-1, 1]) {
        const j = at(f + df, r + dir)
        if (j < 0) continue
        if (colorOf(board[j]) === enemy) push(j)
        else if (j === pos.ep) moves.push({ from: i, to: j })
      }
    } else if (t === 'n' || t === 'k') {
      for (const [df, dr] of t === 'n' ? KNIGHT : KING) {
        const j = at(f + df, r + dr)
        if (j >= 0 && colorOf(board[j]) !== turn) moves.push({ from: i, to: j })
      }
    } else {
      const dirs = t === 'r' ? ROOK : t === 'b' ? BISHOP : [...ROOK, ...BISHOP]
      for (const [df, dr] of dirs) {
        for (let k = 1; ; k++) {
          const j = at(f + df * k, r + dr * k)
          if (j < 0 || colorOf(board[j]) === turn) break
          moves.push({ from: i, to: j })
          if (board[j]) break
        }
      }
    }
  }
  // Enroques: el rey no puede estar en jaque ni cruzar una casilla atacada.
  const home = turn === 'w' ? 0 : 56
  const [short, long] = turn === 'w' ? ['K', 'Q'] : ['k', 'q']
  const rook = mine(turn, 'r')
  if (board[home + 4] === mine(turn, 'k') && !attacked(board, home + 4, enemy)) {
    if (pos.castle.includes(short) && board[home + 7] === rook && !board[home + 5] && !board[home + 6] && !attacked(board, home + 5, enemy) && !attacked(board, home + 6, enemy)) {
      moves.push({ from: home + 4, to: home + 6, castle: 'K' })
    }
    if (pos.castle.includes(long) && board[home] === rook && !board[home + 1] && !board[home + 2] && !board[home + 3] && !attacked(board, home + 3, enemy) && !attacked(board, home + 2, enemy)) {
      moves.push({ from: home + 4, to: home + 2, castle: 'Q' })
    }
  }
  return moves
}

// Aplica un movimiento (sin comprobarlo). Devuelve la posición nueva, la pieza comida y dónde estaba.
export function apply(pos, m) {
  const board = pos.board.slice()
  const p = board[m.from]
  const t = typeOf(p)
  let captured = board[m.to]
  let capturedAt = m.to
  if (t === 'p' && m.to === pos.ep && !captured) {
    capturedAt = m.to + (pos.turn === 'w' ? -8 : 8)
    captured = board[capturedAt]
    board[capturedAt] = ''
  }
  board[m.to] = m.promo ? mine(pos.turn, m.promo) : p
  board[m.from] = ''
  let rook = null
  if (m.castle) {
    const home = m.from - 4
    rook = m.castle === 'K' ? { from: home + 7, to: home + 5 } : { from: home, to: home + 3 }
    board[rook.to] = board[rook.from]
    board[rook.from] = ''
  }
  let castle = pos.castle
  const drop = (chars) => {
    for (const c of chars) castle = castle.replace(c, '')
  }
  if (t === 'k') drop(pos.turn === 'w' ? 'KQ' : 'kq')
  for (const s of [m.from, m.to]) {
    if (s === 0) drop('Q')
    else if (s === 7) drop('K')
    else if (s === 56) drop('q')
    else if (s === 63) drop('k')
  }
  const next = {
    board,
    turn: other(pos.turn),
    castle,
    ep: t === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : null,
    half: t === 'p' || captured ? 0 : pos.half + 1,
    full: pos.full + (pos.turn === 'b' ? 1 : 0),
  }
  return { pos: next, captured: captured || null, capturedAt: captured ? capturedAt : null, rook }
}

export function legalMoves(pos) {
  return pseudo(pos).filter((m) => {
    const { pos: next } = apply(pos, m)
    return !attacked(next.board, kingOf(next.board, pos.turn), next.turn)
  })
}

// Sin piezas para dar mate: solo el rey, o rey y un alfil o un caballo.
export function cannotMate(board, color) {
  const pieces = board.filter((p) => colorOf(p) === color && typeOf(p) !== 'k').map(typeOf)
  return pieces.length === 0 || (pieces.length === 1 && (pieces[0] === 'b' || pieces[0] === 'n'))
}

// Material insuficiente para los dos: rey contra rey, con a lo sumo una pieza menor, o alfiles del mismo color.
function deadPosition(board) {
  if (!cannotMate(board, 'w') || !cannotMate(board, 'b')) return false
  const minors = board.map((p, i) => ({ t: p ? typeOf(p) : '', i })).filter(({ t }) => t === 'b' || t === 'n')
  if (minors.length <= 1) return true
  const shade = (i) => ((i % 8) + Math.floor(i / 8)) % 2
  return minors.length === 2 && minors.every(({ t }) => t === 'b') && shade(minors[0].i) === shade(minors[1].i)
}

// Clave de la posición para las repeticiones.
export const keyOf = (pos) => `${pos.board.map((p) => p || '.').join('')}${pos.turn}${pos.castle}${pos.ep ?? '-'}`

// ¿Se acabó? keys: claves de las posiciones desde el último movimiento de peón o captura (incluida la actual).
// Devuelve null o { winner: 'w' | 'b' | null, reason }.
export function outcome(pos, keys = []) {
  const moves = legalMoves(pos)
  if (moves.length === 0) return inCheck(pos) ? { winner: other(pos.turn), reason: 'mate' } : { winner: null, reason: 'ahogado' }
  if (deadPosition(pos.board)) return { winner: null, reason: 'material' }
  if (pos.half >= 100) return { winner: null, reason: 'cincuenta' }
  const key = keyOf(pos)
  if (keys.filter((k) => k === key).length >= 3) return { winner: null, reason: 'repeticion' }
  return null
}

// Notación algebraica en español: R rey, D dama, T torre, A alfil, C caballo.
const LETTERS = { k: 'R', q: 'D', r: 'T', b: 'A', n: 'C', p: '' }
export const letterOf = (type) => LETTERS[type]

export function sanOf(pos, m) {
  if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O'
  const p = pos.board[m.from]
  const t = typeOf(p)
  const { pos: next, captured } = apply(pos, m)
  let san = ''
  if (t === 'p') {
    if (captured) san = `${FILES[m.from % 8]}x`
    san += nameOf(m.to)
    if (m.promo) san += `=${LETTERS[m.promo]}`
  } else {
    san = LETTERS[t]
    const rivals = legalMoves(pos).filter((o) => o.to === m.to && o.from !== m.from && pos.board[o.from] === p)
    if (rivals.length) {
      const sameFile = rivals.some((o) => o.from % 8 === m.from % 8)
      const sameRank = rivals.some((o) => Math.floor(o.from / 8) === Math.floor(m.from / 8))
      if (!sameFile) san += FILES[m.from % 8]
      else if (!sameRank) san += Math.floor(m.from / 8) + 1
      else san += nameOf(m.from)
    }
    if (captured) san += 'x'
    san += nameOf(m.to)
  }
  if (inCheck(next)) san += legalMoves(next).length === 0 ? '#' : '+'
  return san
}

// Busca el movimiento legal que corresponde a from -> to (promo: 'q' | 'r' | 'b' | 'n', dama si no se dice).
export function findMove(pos, from, to, promo) {
  const options = legalMoves(pos).filter((m) => m.from === from && m.to === to)
  if (!options.length) return null
  if (!options[0].promo) return options[0]
  return options.find((m) => m.promo === (promo || 'q')) ?? null
}
