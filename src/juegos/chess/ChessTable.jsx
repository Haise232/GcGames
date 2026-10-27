import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { apply, colorOf, findMove, legalMoves, nameOf, typeOf } from '../shared/chess-core.js'
import Avatar from '../Avatar.jsx'
import Help from '../Help.jsx'
import { eur } from '../money.js'
import Chat from '../table/Chat.jsx'
import Invite from '../table/Invite.jsx'
import SeatBubble from '../table/SeatBubble.jsx'
import { useCountdown } from '../table/useCountdown.js'
import WinBurst from '../WinBurst.jsx'
import WinToast from '../WinToast.jsx'
import { playLose, playSmash, playStone, playTurn, playWin } from '../sound.js'
import './chess.css'

const NAMES = { k: 'rey', q: 'dama', r: 'torre', b: 'alfil', n: 'caballo', p: 'peón' }
const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 }
const START_COUNT = { q: 1, r: 2, b: 2, n: 2, p: 8 }
const STAKES = [0, 100, 500, 1000, 2500, 5000, 10000]
const REASONS = {
  mate: 'Jaque mate',
  ahogado: 'Rey ahogado: tablas',
  material: 'Sin piezas para dar mate: tablas',
  cincuenta: '50 jugadas sin capturas ni peones: tablas',
  repeticion: 'Triple repetición: tablas',
  acuerdo: 'Tablas de mutuo acuerdo',
  tiempo: 'Se acabó el tiempo',
  rendicion: 'Se rinde',
  abandono: 'Dejó la mesa',
}
const colorName = (c) => (c === 'w' ? 'blancas' : 'negras')

// --- Piezas: estatuas de mármol y obsidiana, dibujadas en un cuadro de 100 × 100 apoyadas abajo ---

const BASE = (
  <>
    <path d="M18 93h64v-6q0-6-7-7H25q-7 1-7 7z" />
    <path d="M27 80h46l-4-7H31z" />
  </>
)
const SHAPES = {
  p: (
    <>
      <path d="M37 73q2-14 7-20h12q5 6 7 20z" />
      <ellipse cx="50" cy="53" rx="13" ry="4" />
      <circle cx="50" cy="40" r="12" />
    </>
  ),
  r: (
    <>
      <path d="M34 73l3-35h26l3 35z" />
      <path d="M30 39V19h9v7h6.5v-7h9v7H61v-7h9v20z" />
    </>
  ),
  n: (
    <>
      <path d="M33 73c0-13 4-21 13-27-7-1-14 2-19 6-5-2-7-6-4-11 6-10 14-18 23-22l2-9 6 9c13 4 21 16 21 34 0 8-2 14-4 20z" />
      <path d="M57 26c7 6 10 15 10 26" fill="none" />
    </>
  ),
  b: (
    <>
      <path d="M38 73q2-16 5-22h14q3 6 5 22z" />
      <ellipse cx="50" cy="51" rx="14" ry="4" />
      <path d="M50 17c11 8 15 17 13 25q-2 6-13 6t-13-6c-2-8 2-17 13-25z" />
      <path d="M56 26l-9 11" fill="none" />
      <circle cx="50" cy="13" r="4.5" />
    </>
  ),
  q: (
    <>
      <path d="M36 73q3-20 7-28h14q4 8 7 28z" />
      <ellipse cx="50" cy="45" rx="15" ry="4" />
      <path d="M34 43l-5-21 11 12 4-16 6 14 6-14 4 16 11-12-5 21z" />
      <circle cx="29" cy="20" r="4" />
      <circle cx="44" cy="15" r="4" />
      <circle cx="56" cy="15" r="4" />
      <circle cx="71" cy="20" r="4" />
    </>
  ),
  k: (
    <>
      <path d="M36 73q3-20 7-28h14q4 8 7 28z" />
      <ellipse cx="50" cy="45" rx="15" ry="4" />
      <path d="M36 43q-3-14 4-20h20q7 6 4 20z" />
      <path d="M46.5 5h7v6h6v7h-6v8h-7v-8h-6v-7h6z" />
    </>
  ),
}

function Piece({ piece }) {
  const white = colorOf(piece) === 'w'
  const type = typeOf(piece)
  return (
    <svg viewBox="0 0 100 100" className={`cz-svg cz-svg--${white ? 'w' : 'b'}`} aria-hidden="true">
      <g fill={`url(#cz-${white ? 'w' : 'b'})`} stroke={white ? '#5c4a33' : '#c9ae74'} strokeWidth="2.4" strokeLinejoin="round">
        {BASE}
        {SHAPES[type]}
      </g>
      {type === 'n' && <circle cx="42" cy="30" r="3" fill={white ? '#3a2c1c' : '#ffd36b'} />}
      {/* Brillo de piedra pulida */}
      <path d="M41 70q1-10 4-14" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Degradados de las piezas: una vez por mesa.
function PieceDefs() {
  return (
    <svg width="0" height="0" className="cz-defs" aria-hidden="true">
      <defs>
        <linearGradient id="cz-w" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.55" stopColor="#e7dcc6" />
          <stop offset="1" stopColor="#b9a888" />
        </linearGradient>
        <linearGradient id="cz-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5d5a6e" />
          <stop offset="0.5" stopColor="#2a2833" />
          <stop offset="1" stopColor="#0e0d12" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// La pieza capturada revienta: cinco pedazos que salen volando y una nube de polvo.
const SHARDS = [
  ['polygon(0 0, 55% 0, 42% 46%, 0 36%)', -70, -90, -55],
  ['polygon(55% 0, 100% 0, 100% 42%, 42% 46%)', 75, -95, 50],
  ['polygon(0 36%, 42% 46%, 30% 100%, 0 100%)', -85, 25, -95],
  ['polygon(42% 46%, 100% 42%, 100% 72%, 60% 76%)', 90, -5, 80],
  ['polygon(42% 46%, 60% 76%, 100% 72%, 100% 100%, 30% 100%)', 15, 55, 30],
]
function Shatter({ piece, style }) {
  return (
    <div className="cz-shatter" style={style} aria-hidden="true">
      {SHARDS.map(([clip, x, y, r], i) => (
        <div key={i} className="cz-shard" style={{ clipPath: clip, '--fx': `${x}%`, '--fy': `${y}%`, '--fr': `${r}deg` }}>
          <Piece piece={piece} />
        </div>
      ))}
      <span className="cz-dust" />
    </div>
  )
}

// --- Utilidades de la vista ---

const posOf = (state) => ({ board: state.board, turn: state.toMove, castle: state.castle, ep: state.ep, half: state.half, full: 1 })

// Piezas que faltan de cada color (las que se ha comido el rival).
function lostPieces(board, color) {
  const count = {}
  for (const p of board) if (p && colorOf(p) === color) count[typeOf(p)] = (count[typeOf(p)] ?? 0) + 1
  const out = []
  for (const t of ['q', 'r', 'b', 'n', 'p']) for (let k = (count[t] ?? 0); k < START_COUNT[t]; k++) out.push(t)
  return out
}
const material = (board, color) => board.reduce((sum, p) => sum + (p && colorOf(p) === color ? VALUE[typeOf(p)] : 0), 0)

function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Reloj que corre en el navegador a partir de lo que dijo el servidor en `at`.
function useClocks(state, at) {
  const running = state.phase === 'playing' ? state.turn : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (running === null) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [running, at])
  return state.clocks.map((ms, i) => (i === running ? Math.max(0, ms - (now - at)) : ms))
}

// --- Jugador: foto, nombre, color, reloj y lo que ha capturado ---

function Player({ seat, index, state, clock, mine, bubble, canSit, onSit, captured, edge }) {
  if (!seat) {
    return (
      <div className="cz-player cz-player--empty">
        <span className="cz-player__free">Asiento libre</span>
        {canSit && (
          <button type="button" className="cz-btn cz-btn--gold" onClick={onSit}>
            Sentarme
          </button>
        )}
      </div>
    )
  }
  const playing = state.phase === 'playing'
  const active = playing && state.turn === index
  const color = seat.color
  const low = active && clock < 20000
  let tag = null
  if (state.phase === 'over' && state.result) {
    const won = state.result.won[index] ?? 0
    if (state.result.winner === index) tag = { tone: 'win', text: state.stake > 0 ? `Gana +${eur(won - state.stake)}` : 'Gana' }
    else if (state.result.winner === null) tag = { tone: 'plain', text: 'Tablas' }
    else tag = { tone: 'lose', text: state.stake > 0 ? `Pierde ${eur(state.stake)}` : 'Pierde' }
  } else if (!seat.connected) tag = { tone: 'away', text: 'Ausente' }
  else if (state.phase === 'waiting') tag = seat.ready ? { tone: 'ready', text: '✓ Listo' } : { tone: 'plain', text: 'Pensando…' }
  else if (state.drawOffer === index) tag = { tone: 'plain', text: '½ Ofrece tablas' }

  return (
    <div className={`cz-player ${mine ? 'cz-player--me' : ''} ${active ? 'cz-player--turn' : ''} cz-player--${edge}`}>
      <div className="cz-player__who">
        <Avatar name={seat.name} src={seat.avatar} size={40} />
        <span className="cz-player__anchor">
          <SeatBubble bubble={bubble} side="right" />
        </span>
        <span className="cz-player__text">
          <b>
            {seat.name}
            {mine && <small> · tú</small>}
          </b>
          <span className="cz-player__meta">
            <i className={`cz-dot cz-dot--${color}`} aria-hidden="true" />
            {colorName(color)} · {eur(seat.balance)}
          </span>
        </span>
      </div>
      <div className="cz-player__side">
        {captured.list.length > 0 && (
          <span className="cz-grave" aria-label={`Ha capturado: ${captured.list.map((t) => NAMES[t]).join(', ')}`}>
            {captured.list.map((t, i) => (
              <span key={i} className="cz-grave__piece">
                <Piece piece={captured.color === 'w' ? t.toUpperCase() : t} />
              </span>
            ))}
            {captured.plus > 0 && <em>+{captured.plus}</em>}
          </span>
        )}
        {tag && <span className={`cz-tag cz-tag--${tag.tone}`}>{tag.text}</span>}
        <span className={`cz-clock ${active ? 'is-on' : ''} ${low ? 'is-low' : ''}`} role="timer" aria-label={`Reloj de ${seat.name}: ${clockText(clock)}`}>
          {clockText(clock)}
        </span>
      </div>
    </div>
  )
}

// --- Lista de jugadas ---

function MoveList({ moves }) {
  const list = useRef(null)
  useEffect(() => {
    const el = list.current
    if (el) {
      el.scrollTop = el.scrollHeight
      el.scrollLeft = el.scrollWidth
    }
  }, [moves.length])
  const pairs = []
  for (let i = 0; i < moves.length; i += 2) pairs.push([moves[i], moves[i + 1]])
  return (
    <ol ref={list} className="cz-moves" aria-label="Jugadas">
      {pairs.length === 0 && <li className="cz-moves__empty">Aquí irán las jugadas.</li>}
      {pairs.map(([w, b], i) => (
        <li key={i}>
          <span className="cz-moves__n">{i + 1}.</span>
          <span>{w.san}</span>
          <span>{b?.san ?? ''}</span>
        </li>
      ))}
    </ol>
  )
}

// --- La apuesta y el «listo», mientras se espera ---

function Lobby({ state, mine, rival, send, pending, clock }) {
  const [custom, setCustom] = useState('')
  const { min, max, step } = state.limits
  const propose = (amount) => send({ t: 'bet', amount })
  const ready = Boolean(mine.ready)
  const starting = clock !== null
  const canPay = mine.balance >= state.stake
  const typed = Number(custom.replace(/[^\d]/g, ''))
  const typedOk = custom.trim() !== '' && typed >= min && typed <= max && typed % step === 0

  if (!rival) {
    return (
      <div className="cz-lobby">
        <p className="cz-lobby__title">Esperando rival…</p>
        <p className="cz-lobby__text">La partida empieza cuando se siente otra persona. Invita a alguien:</p>
        <div className="cz-lobby__row">
          <Invite game="chess" code={state.code} name="Ajedrez" />
          <button type="button" className="cz-btn" disabled={pending} onClick={() => send({ t: 'stand_up' })}>
            Dejar el asiento
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cz-lobby">
      <p className="cz-lobby__title">
        {starting ? (
          <>La partida empieza en {clock.seconds} s</>
        ) : (
          <>
            Apuesta: <b>{state.stake > 0 ? `${eur(state.stake)} cada uno` : 'amistosa (sin dinero)'}</b>
          </>
        )}
      </p>
      <p className="cz-lobby__text">
        {state.stake > 0 ? `Quien gane se lleva ${eur(state.stake * 2)}; en tablas, cada uno recupera lo suyo. ` : ''}
        {rival.ready && !ready ? `${rival.name} está listo: acepta para empezar.` : ready ? `Esperando a ${rival.name}…` : 'Elige una apuesta o acepta la que hay.'}
      </p>
      <div className="cz-stakes" role="group" aria-label="Proponer otra apuesta">
        {STAKES.map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={state.stake === amount}
            disabled={pending || starting || mine.balance < amount}
            onClick={() => propose(amount)}
          >
            {amount === 0 ? 'Amistosa' : eur(amount)}
          </button>
        ))}
        <form
          className="cz-stakes__custom"
          onSubmit={(event) => {
            event.preventDefault()
            if (typedOk) propose(typed)
            setCustom('')
          }}
        >
          <label>
            <span className="sr-only">Otra cantidad (de {step} en {step})</span>
            <input type="text" inputMode="numeric" placeholder="Otra…" value={custom} onChange={(event) => setCustom(event.target.value)} />
          </label>
          <button type="submit" disabled={!typedOk || pending || starting || mine.balance < typed}>
            Proponer
          </button>
        </form>
      </div>
      <div className="cz-lobby__row">
        <button type="button" className={`cz-btn ${ready ? '' : 'cz-btn--gold'}`} disabled={pending || (!ready && !canPay)} onClick={() => send({ t: 'ready' })}>
          {ready ? 'Cancelar' : canPay ? (state.stake > 0 ? `Jugar por ${eur(state.stake)}` : 'Jugar') : 'No te llega el saldo'}
        </button>
        <button type="button" className="cz-btn" disabled={pending} onClick={() => send({ t: 'stand_up' })}>
          Dejar el asiento
        </button>
      </div>
    </div>
  )
}

// --- Controles en plena partida: tablas y rendirse ---

function GameControls({ state, mySeat, send, pending }) {
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(false), 4000)
    return () => clearTimeout(timer)
  }, [confirm])
  const offered = state.drawOffer === mySeat
  const incoming = state.drawOffer !== null && state.drawOffer !== mySeat
  return (
    <div className="cz-controls">
      {incoming ? (
        <>
          <span className="cz-controls__note">Tu rival ofrece tablas</span>
          <button type="button" className="cz-btn cz-btn--gold" disabled={pending} onClick={() => send({ t: 'action', kind: 'draw' })}>
            Aceptar tablas
          </button>
          <button type="button" className="cz-btn" disabled={pending} onClick={() => send({ t: 'action', kind: 'decline' })}>
            Rechazar
          </button>
        </>
      ) : (
        <button type="button" className="cz-btn" disabled={pending || offered} onClick={() => send({ t: 'action', kind: 'draw' })}>
          {offered ? 'Tablas ofrecidas' : '½ Ofrecer tablas'}
        </button>
      )}
      <button
        type="button"
        className={`cz-btn ${confirm ? 'cz-btn--danger' : ''}`}
        disabled={pending}
        onClick={() => {
          if (!confirm) return setConfirm(true)
          setConfirm(false)
          send({ t: 'action', kind: 'resign' })
        }}
      >
        {confirm ? `¿Seguro? ${state.stake > 0 ? `Pierdes ${eur(state.stake)}` : 'Pierdes la partida'}` : '⚑ Rendirse'}
      </button>
    </div>
  )
}

function ChessGuide({ state }) {
  const { clock, increment, max } = state.limits
  return (
    <>
      <p>
        Ajedrez de toda la vida, uno contra uno, con las piezas de piedra de un tablero encantado: la que es capturada
        revienta en pedazos. Toca una pieza tuya para ver adónde puede ir y toca la casilla de destino.
      </p>
      <h3>La apuesta</h3>
      <p>
        Mientras esperáis, cualquiera de los dos propone una apuesta (de amistosa a {eur(max)}) y el otro la acepta pulsando
        «Jugar». Al empezar se os descuenta a los dos; quien gana se lleva el doble. En tablas cada uno recupera lo suyo.
      </p>
      <h3>Reloj y final</h3>
      <p>
        Cada uno tiene {clock / 60000} minutos y gana {increment / 1000} segundos por jugada. Si se te acaba el tiempo,
        pierdes (salvo que a tu rival no le queden piezas para dar mate: entonces son tablas). También se acaba con jaque
        mate, rey ahogado, triple repetición, 50 jugadas sin capturas ni movimientos de peón o material insuficiente.
      </p>
      <p>
        Puedes ofrecer tablas o rendirte en cualquier momento. Si dejas el asiento (o la mesa) en plena partida, la
        abandonas y pierdes. Los colores se alternan en cada partida.
      </p>
      <p>Juegas con tu saldo de la semana (15.000 €, se reinicia el domingo a las 23:59): cuenta en el Score.</p>
    </>
  )
}

function ChessTable({ room, me, conn, error, send, onLeave, chat, bubbles, pending }) {
  const { state, at } = room
  const mySeat = state.seats.findIndex((seat) => seat?.id === me?.id)
  const mine = mySeat >= 0 ? state.seats[mySeat] : null
  const rivalSeat = mySeat >= 0 ? 1 - mySeat : null
  const rival = rivalSeat !== null ? state.seats[rivalSeat] : null
  const myColor = mine?.color ?? null
  const flipped = myColor === 'b'
  const playing = state.phase === 'playing'
  const over = state.phase === 'over'
  const myTurn = playing && state.turn === mySeat && mySeat >= 0
  const clocks = useClocks(state, at)
  const countdown = useCountdown(state.phase === 'waiting' ? state.deadlineIn : null, state.deadlineTotal, at)
  const resetIn = useCountdown(over ? state.wakeIn ?? null : null, 12000, at)

  // Jugada enviada que aún no ha vuelto del servidor: se pinta ya para que no se note la espera.
  const [sent, setSent] = useState(null)
  useEffect(() => setSent(null), [state.moves.length, state.match, error])
  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => setSent(null), 4000)
    return () => clearTimeout(timer)
  }, [sent])

  const view = useMemo(() => {
    const pos = posOf(state)
    if (!sent || sent.base !== state.moves.length) return { pos, last: state.last }
    const m = findMove(pos, sent.from, sent.to, sent.promo)
    if (!m) return { pos, last: state.last }
    const done = apply(pos, m)
    return { pos: done.pos, last: { from: m.from, to: m.to, rook: done.rook, captured: done.captured, capturedAt: done.capturedAt, ply: state.moves.length + 1 } }
  }, [state, sent])
  const board = view.pos.board
  const last = view.last

  const [selected, setSelected] = useState(null)
  const [promo, setPromo] = useState(null) // { from, to } esperando a elegir pieza
  useEffect(() => {
    setSelected(null)
    setPromo(null)
  }, [state.moves.length, state.match, state.phase])
  const canMove = myTurn && !sent
  const targets = useMemo(() => {
    if (!canMove || selected === null) return new Map()
    return new Map(legalMoves(posOf(state)).filter((m) => m.from === selected).map((m) => [m.to, m]))
  }, [canMove, selected, state])

  const go = (from, to, piece) => {
    setSelected(null)
    setPromo(null)
    setSent({ from, to, promo: piece, base: state.moves.length })
    if (send({ t: 'move', from: nameOf(from), to: nameOf(to), promo: piece }) === false) setSent(null)
  }

  function onSquare(sq) {
    if (!canMove) return
    const p = board[sq]
    if (selected !== null && targets.has(sq)) {
      if (targets.get(sq).promo) setPromo({ from: selected, to: sq })
      else go(selected, sq)
      return
    }
    setPromo(null)
    setSelected(p && colorOf(p) === myColor && selected !== sq ? sq : null)
  }

  // Animaciones solo de lo que pasa estando aquí (al entrar no se repite la última jugada).
  const firstPly = useRef(state.moves.length)
  const firstMatch = useRef(state.match)
  const animate = Boolean(last) && (state.match !== firstMatch.current || last.ply > firstPly.current)
  const boardRef = useRef(null)
  // Cada jugada suena una vez (la vista optimista y la del servidor traen la misma jugada). El estallido llega cuando la
  // pieza que captura alcanza su casilla, y no se cancela aunque llegue otro estado mientras tanto.
  const heard = useRef(`${state.match}-${last?.ply ?? 0}`)
  const smashTimer = useRef(null)
  useEffect(() => () => clearTimeout(smashTimer.current), [])
  useEffect(() => {
    if (!animate || !last || heard.current === `${state.match}-${last.ply}`) return
    heard.current = `${state.match}-${last.ply}`
    playStone()
    if (!last.captured) return
    clearTimeout(smashTimer.current)
    smashTimer.current = setTimeout(() => {
      playSmash()
      navigator.vibrate?.(40)
      boardRef.current?.animate?.(
        [{ transform: 'translate(0,0)' }, { transform: 'translate(-4px,3px)' }, { transform: 'translate(4px,-2px)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(0,0)' }],
        { duration: 320, easing: 'ease-out' },
      )
    }, 300)
  }, [animate, last, state.match])

  // Tu turno se oye, vibra y se ve en la pestaña.
  useEffect(() => {
    if (!myTurn || state.moves.length === 0) return
    playTurn()
    navigator.vibrate?.(120)
    const title = document.title
    document.title = '● Tu turno · Ajedrez'
    return () => {
      document.title = title
    }
  }, [myTurn, state.moves.length])

  const result = state.result
  const myWin = over && mine && result ? (result.won[mySeat] ?? 0) - state.stake : 0
  const iLost = over && mine && result && result.winner !== null && result.winner !== mySeat
  useEffect(() => {
    if (myWin > 0) playWin(myWin >= 1000)
    else if (iLost) playLose()
  }, [myWin, iLost, state.match])

  // Ganadores de otros (para la mesa entera, cuando hay dinero en juego).
  const othersWon = useMemo(
    () =>
      over && result && result.winner !== null && result.winner !== mySeat && state.stake > 0
        ? [{ key: `${state.match}`, name: result.names[result.winner] ?? '', amount: result.won[result.winner], detail: REASONS[result.reason]?.toLowerCase() ?? '' }]
        : [],
    [over, result, mySeat, state.stake, state.match],
  )

  // Casillas en pantalla: la tuya abajo.
  const spot = (sq) => {
    const f = sq % 8
    const r = Math.floor(sq / 8)
    return flipped ? { col: 7 - f, row: r } : { col: f, row: 7 - r }
  }
  const squares = []
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) squares.push(flipped ? row * 8 + (7 - col) : (7 - row) * 8 + col)

  const fallen = over && result && (result.reason === 'mate' || result.reason === 'rendicion' || result.reason === 'abandono' || result.reason === 'tiempo') && result.winner !== null
    ? board.indexOf(result.color === 'w' ? 'k' : 'K')
    : -1

  // Arriba el rival (o las negras, si miras), abajo tú (o las blancas).
  const bottomSeat = mySeat >= 0 ? mySeat : state.white
  const topSeat = 1 - bottomSeat
  const capturedBy = (index) => {
    const seat = state.seats[index]
    const color = seat?.color ?? (index === state.white ? 'w' : 'b')
    const enemy = color === 'w' ? 'b' : 'w'
    return { list: lostPieces(board, enemy), color: enemy, plus: Math.max(0, material(board, color) - material(board, enemy)) }
  }
  const canSit = mySeat < 0 && conn === 'open' && state.phase !== 'playing'

  // Estado corto encima del tablero.
  let status = ''
  if (conn !== 'open') status = 'Conexión perdida. Reconectando…'
  else if (error) status = error
  else if (playing) {
    const who = state.seats[state.turn]
    const check = state.check !== null ? '¡Jaque! ' : ''
    status = myTurn ? `${check}Te toca mover (${colorName(myColor)})` : `${check}Piensa ${who?.name ?? '…'} (${colorName(state.toMove)})`
  } else if (over && result) {
    const why = REASONS[result.reason] ?? ''
    status = result.winner === null ? why : `${why} · gana ${result.names[result.winner] ?? colorName(result.color)}`
  } else if (countdown) status = `La partida empieza en ${countdown.seconds} s`
  else if (!mine) status = state.seats.every(Boolean) ? 'Mirando la mesa' : 'Siéntate para jugar'
  else status = rival ? 'Acordad la apuesta' : 'Esperando rival'

  // El pie mide lo que mide: se publica su alto para que el chat no lo tape.
  const mainRef = useRef(null)
  const footRef = useRef(null)
  useLayoutEffect(() => {
    const main = mainRef.current
    const foot = footRef.current
    if (!main || !foot) return
    const publish = () => main.style.setProperty('--cz-foot-h', `${Math.ceil(foot.getBoundingClientRect().height)}px`)
    publish()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(publish)
    observer.observe(foot)
    return () => observer.disconnect()
  }, [])

  const playerProps = (index, edge) => ({
    seat: state.seats[index],
    index,
    state,
    clock: clocks[index],
    mine: index === mySeat,
    bubble: state.seats[index] ? bubbles?.[state.seats[index].id] : undefined,
    canSit,
    onSit: () => send({ t: 'sit', seat: index }),
    captured: capturedBy(index),
    edge,
  })

  const shown = (sq, piece) => {
    const { col, row } = spot(sq)
    return { left: `${col * 12.5}%`, top: `${row * 12.5}%`, '--z': row, key: piece }
  }

  return (
    <main ref={mainRef} className="app chess-app cz">
      <PieceDefs />
      <header className="top cz-top">
        <h1>Ajedrez</h1>
        <p className="cz-room" data-room-code={state.code}>
          <span>Mesa pública</span>
          <b>{state.label ?? state.code}</b>
          <small>
            {clockText(state.limits.clock)} + {state.limits.increment / 1000} s
            {state.spectators > 0 ? ` · ${state.spectators} mirando` : ''}
          </small>
        </p>
        <div className="toggles">
          <Help label="Reglas" title="Ajedrez mágico" wide>
            <ChessGuide state={state} />
          </Help>
          <Invite game="chess" code={state.code} name="Ajedrez" />
          <button type="button" onClick={onLeave}>
            Salir
          </button>
        </div>
      </header>

      <div className="cz-floor">
        <section className="cz-stage" aria-label="Tablero">
          <Player {...playerProps(topSeat, 'top')} />
          <p className={`cz-status ${myTurn ? 'is-turn' : ''} ${state.check !== null && playing ? 'is-check' : ''}`} role="status" aria-live="polite">
            {status}
          </p>
          <div className="cz-boardwrap">
            <div ref={boardRef} className={`cz-board ${canMove ? 'is-live' : ''}`}>
              {squares.map((sq) => {
                const { col, row } = spot(sq)
                const p = board[sq]
                const dark = ((sq % 8) + Math.floor(sq / 8)) % 2 === 0
                const target = targets.get(sq)
                const classes = [
                  'cz-sq',
                  dark ? 'cz-sq--dark' : 'cz-sq--light',
                  last && (last.from === sq || last.to === sq) && 'cz-sq--last',
                  selected === sq && 'cz-sq--sel',
                  target && (board[sq] || target.to === state.ep ? 'cz-sq--hit' : 'cz-sq--to'),
                  state.check === sq && !sent && 'cz-sq--check',
                ]
                  .filter(Boolean)
                  .join(' ')
                const label = `${nameOf(sq)}${p ? `, ${NAMES[typeOf(p)]} ${colorOf(p) === 'w' ? 'blanco' : 'negro'}` : ''}`
                return (
                  <button key={sq} type="button" className={classes} style={{ gridColumn: col + 1, gridRow: row + 1 }} aria-label={label} aria-pressed={selected === sq} onClick={() => onSquare(sq)}>
                    {col === 0 && <span className="cz-sq__rank">{Math.floor(sq / 8) + 1}</span>}
                    {row === 7 && <span className="cz-sq__file">{'abcdefgh'[sq % 8]}</span>}
                  </button>
                )
              })}
              <div className="cz-pieces" aria-hidden="true">
                {board.map((p, sq) => {
                  if (!p) return null
                  const { key, ...style } = shown(sq, p)
                  let cls = 'cz-piece'
                  let move = null
                  if (animate && last) {
                    if (last.to === sq) move = last.from
                    else if (last.rook && last.rook.to === sq) move = last.rook.from
                  }
                  if (move !== null) {
                    const a = spot(move)
                    const b = spot(sq)
                    style['--dx'] = a.col - b.col
                    style['--dy'] = a.row - b.row
                    cls += ' cz-piece--move'
                  }
                  if (sq === fallen) cls += ' cz-piece--fallen'
                  if (selected === sq) cls += ' cz-piece--lift'
                  return (
                    <div key={`${sq}-${key}-${move !== null ? `${state.match}-${last.ply}` : ''}`} className={cls} style={style}>
                      <Piece piece={p} />
                    </div>
                  )
                })}
                {animate && last?.captured && (
                  <Shatter key={`x-${state.match}-${last.ply}`} piece={last.captured} style={{ left: `${spot(last.capturedAt).col * 12.5}%`, top: `${spot(last.capturedAt).row * 12.5}%` }} />
                )}
              </div>
              {promo && (
                <div className="cz-promo" role="group" aria-label="Elige la pieza de la coronación" style={{ left: `${spot(promo.to).col * 12.5}%` }}>
                  {['q', 'r', 'b', 'n'].map((t) => (
                    <button key={t} type="button" aria-label={NAMES[t]} onClick={() => go(promo.from, promo.to, t)}>
                      <Piece piece={myColor === 'w' ? t.toUpperCase() : t} />
                    </button>
                  ))}
                </div>
              )}
              {over && result && (
                <div className={`cz-result ${result.winner === null ? 'is-draw' : result.winner === mySeat ? 'is-win' : mySeat >= 0 ? 'is-lose' : ''}`}>
                  <b>{result.winner === null ? 'Tablas' : result.winner === mySeat ? '¡Has ganado!' : mySeat >= 0 ? 'Has perdido' : `Gana ${result.names[result.winner] ?? colorName(result.color)}`}</b>
                  <span>{REASONS[result.reason]}</span>
                  {resetIn && <small>Nueva partida en {resetIn.seconds} s</small>}
                </div>
              )}
              {countdown && (
                <div className="cz-result cz-result--count">
                  <b>{countdown.seconds}</b>
                  <span>{state.stake > 0 ? `Por ${eur(state.stake * 2)}` : 'Partida amistosa'}</span>
                </div>
              )}
            </div>
          </div>
          <Player {...playerProps(bottomSeat, 'bottom')} />
        </section>

        <aside className={`cz-side ${state.moves.length ? '' : 'cz-side--empty'}`} aria-label="Partida">
          <h2 className="cz-side__title">Jugadas</h2>
          <MoveList moves={state.moves} />
        </aside>
      </div>

      <footer ref={footRef} className="cz-foot">
        {mine && state.phase === 'waiting' ? (
          <Lobby state={state} mine={mine} rival={rival} send={send} pending={pending} clock={countdown} />
        ) : mine && playing ? (
          <GameControls state={state} mySeat={mySeat} send={send} pending={pending} />
        ) : mine ? (
          <p className="cz-foot__note">{resetIn ? `Nueva partida en ${resetIn.seconds} s: los colores se cambian.` : 'Fin de la partida.'}</p>
        ) : (
          <p className="cz-foot__note">
            {state.seats.every(Boolean) ? 'Estás mirando la partida.' : canSit ? 'Hay un asiento libre: pulsa «Sentarme» para jugar.' : 'Estás mirando. Cuando acabe la partida podrás sentarte si queda sitio.'}
          </p>
        )}
      </footer>

      {myWin > 0 && state.stake > 0 && (
        <WinBurst key={state.match} amount={result.won[mySeat]} caption={REASONS[result.reason]} coins={Math.min(70, 20 + Math.round(myWin / 50))} big={myWin >= 2500} who={me?.name} />
      )}
      <WinToast wins={othersWon} />
      <Chat messages={chat ?? []} me={me} send={send} />
    </main>
  )
}

export default ChessTable
