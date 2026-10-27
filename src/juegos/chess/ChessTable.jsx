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

// --- Piezas: estatuas de piedra tallada, más altas que anchas (cuadro de 100 × 150, apoyadas abajo) ---

const BASE = (
  <>
    <path d="M14 146h72v-8q0-6-8-7H22q-8 1-8 7z" />
    <path d="M22 131h56l-5-8H27z" />
  </>
)
const SHAPES = {
  // Soldado con yelmo y escudo.
  p: (
    <>
      <path d="M30 123q2-30 10-42h20q8 12 10 42z" />
      <path d="M33 87q17-12 34 0l-3-7q-14-9-28 0z" />
      <ellipse cx="50" cy="103" rx="12" ry="15" />
      <circle cx="50" cy="103" r="3" />
      <path d="M38 81q0-23 12-23t12 23z" />
      <path d="M42 72h16" fill="none" />
    </>
  ),
  // Torre maciza con almenas, saetera y puerta.
  r: (
    <>
      <path d="M28 123l5-78h34l5 78z" />
      <path d="M22 47V24h11v8h8v-8h18v8h8v-8h11v23z" />
      <path d="M31 66h38M30 86h40M29 106h42M44 47v19M56 66v20M42 86v20M58 106v17" fill="none" />
      <path d="M48 54h4v12h-4z" />
      <path d="M43 123v-15q7-9 14 0v15z" />
    </>
  ),
  // Caballo encabritado: cabeza y cuello con crin.
  n: (
    <>
      <path d="M28 123c0-22 6-35 20-45-10-2-21 3-28 9-7-3-10-9-6-17 9-16 21-29 34-35l3-14 9 14c19 6 30 26 30 55 0 13-3 23-6 33z" />
      <path d="M62 36c9 8 13 22 14 38M66 52c6 2 9 6 11 11M64 70c5 2 9 6 10 11" fill="none" />
      <path d="M27 74l-6 3" fill="none" />
    </>
  ),
  // Obispo con mitra y báculo.
  b: (
    <>
      <path d="M32 123q4-40 10-62h16q6 22 10 62z" />
      <path d="M38 88q12 7 24 0" fill="none" />
      <ellipse cx="50" cy="61" rx="13" ry="4" />
      <path d="M50 18c12 10 15 22 12 34q-3 8-12 8t-12-8c-3-12 0-24 12-34z" />
      <path d="M55 28l-9 14" fill="none" />
      <circle cx="50" cy="14" r="4" />
      <path d="M71 123V44M67 48q4-8 8 0" fill="none" />
    </>
  ),
  // Reina alta, de túnica larga y corona de puntas.
  q: (
    <>
      <path d="M27 123q6-46 15-68h16q9 22 15 68z" />
      <ellipse cx="50" cy="84" rx="12" ry="3" />
      <ellipse cx="50" cy="56" rx="13" ry="4" />
      <circle cx="50" cy="45" r="9" />
      <path d="M38 40l-4-22 9 10 3-16 4 14 4-14 3 16 9-10-4 22z" />
      <circle cx="34" cy="17" r="3" />
      <circle cx="46" cy="11" r="3" />
      <circle cx="54" cy="11" r="3" />
      <circle cx="66" cy="17" r="3" />
    </>
  ),
  // Rey ancho, con corona, cruz y una espada clavada delante.
  k: (
    <>
      <path d="M25 123q6-46 16-66h18q10 20 16 66z" />
      <ellipse cx="50" cy="58" rx="15" ry="4" />
      <circle cx="50" cy="47" r="10" />
      <path d="M38 42q-2-12 3-18h18q5 6 3 18z" />
      <path d="M47.5 2h5v6h6v5h-6v12h-5V13h-6V8h6z" />
      <path d="M48 72h4v48l-2 4-2-4z" />
      <path d="M40 67h20v5H40z" />
      <circle cx="50" cy="63" r="3" />
    </>
  ),
}

function Piece({ piece }) {
  const white = colorOf(piece) === 'w'
  const type = typeOf(piece)
  const shape = (
    <>
      {BASE}
      {SHAPES[type]}
    </>
  )
  return (
    <svg viewBox="0 0 100 150" className={`cz-svg cz-svg--${white ? 'w' : 'b'}`} aria-hidden="true">
      {/* Piedra, después el grano de la roca y la sombra del lado que no da la antorcha. */}
      <g fill={`url(#cz-${white ? 'w' : 'b'})`} stroke={white ? '#3b3328' : '#0a0a0c'} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        {shape}
      </g>
      <g fill="url(#cz-grain)" stroke="none" opacity={white ? 0.3 : 0.35}>
        {shape}
      </g>
      <g fill="url(#cz-shade)" stroke="none">
        {shape}
      </g>
      {type === 'n' && <circle cx="38" cy="52" r="3.2" fill={white ? '#2a231a' : '#ff9a3c'} />}
    </svg>
  )
}

// Degradados y grano de la piedra: una vez por mesa.
function PieceDefs() {
  return (
    <svg width="0" height="0" className="cz-defs" aria-hidden="true">
      <defs>
        <linearGradient id="cz-w" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#f1ece0" />
          <stop offset="0.5" stopColor="#c9c0ad" />
          <stop offset="1" stopColor="#8a806e" />
        </linearGradient>
        <linearGradient id="cz-b" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#58565c" />
          <stop offset="0.5" stopColor="#2c2b30" />
          <stop offset="1" stopColor="#111114" />
        </linearGradient>
        {/* La luz llega de la izquierda: el lado derecho queda en sombra. */}
        <linearGradient id="cz-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <filter id="cz-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 0.9" />
        </filter>
        <pattern id="cz-grain" width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="80" height="80" filter="url(#cz-noise)" />
        </pattern>
      </defs>
    </svg>
  )
}

// La pieza capturada revienta: trozos que saltan y caen, piedrecitas por el suelo y una nube de polvo.
const SHARDS = [
  ['polygon(0 0, 60% 0, 45% 30%, 0 26%)', -90, -70, -70],
  ['polygon(60% 0, 100% 0, 100% 34%, 45% 30%)', 95, -80, 60],
  ['polygon(0 26%, 45% 30%, 38% 58%, 0 55%)', -120, -30, -110],
  ['polygon(45% 30%, 100% 34%, 100% 60%, 38% 58%)', 120, -40, 95],
  ['polygon(0 55%, 38% 58%, 30% 82%, 0 80%)', -70, 0, -40],
  ['polygon(38% 58%, 100% 60%, 100% 82%, 30% 82%)', 80, -10, 50],
  ['polygon(0 80%, 100% 82%, 100% 100%, 0 100%)', 0, 0, 0],
]
const PEBBLES = [
  [-160, -40], [-120, 20], [-60, 50], [40, 60], [110, 30], [170, -30], [-30, -90], [70, -80],
]
function Shatter({ piece, style }) {
  return (
    <div className="cz-shatter" style={style} aria-hidden="true">
      <span className="cz-flash" />
      {SHARDS.map(([clip, x, y, r], i) => (
        <div key={i} className={`cz-shard ${i === SHARDS.length - 1 ? 'cz-shard--base' : ''}`} style={{ clipPath: clip, '--fx': `${x}%`, '--fy': `${y}%`, '--fr': `${r}deg` }}>
          <Piece piece={piece} />
        </div>
      ))}
      {PEBBLES.map(([x, y], i) => (
        <span key={i} className={`cz-pebble cz-pebble--${colorOf(piece)}`} style={{ '--px': `${x}%`, '--py': `${y}%`, '--d': `${i * 0.02}s` }} />
      ))}
      <span className="cz-dust" />
    </div>
  )
}

// Escombros que se quedan en la casilla hasta la siguiente jugada.
const RUBBLE = [
  [18, 30, 22, 'polygon(0 30%, 40% 0, 100% 20%, 80% 100%, 10% 90%)'],
  [52, 22, 16, 'polygon(10% 0, 100% 30%, 70% 100%, 0 70%)'],
  [64, 58, 20, 'polygon(0 20%, 60% 0, 100% 60%, 40% 100%)'],
  [26, 64, 14, 'polygon(20% 0, 100% 40%, 60% 100%, 0 60%)'],
  [44, 46, 11, 'polygon(0 0, 100% 30%, 50% 100%)'],
]
function Rubble({ piece, style }) {
  return (
    <div className={`cz-rubble cz-rubble--${colorOf(piece)}`} style={style} aria-hidden="true">
      {RUBBLE.map(([x, y, size, clip], i) => (
        <i key={i} style={{ left: `${x}%`, top: `${y}%`, width: `${size}%`, height: `${size}%`, clipPath: clip }} />
      ))}
    </div>
  )
}

// --- El tablero en perspectiva: un plano inclinado (CSS) y las piezas de pie encima ---
// Las piezas no se inclinan con el tablero: se colocan donde cae cada casilla al proyectarla, con la misma cuenta que
// hace el navegador con perspective() y rotateX(). Todo en unidades del lado del tablero.
const PERSPECTIVE = 2.4 // distancia del ojo, en lados de tablero
const SPRITE_H = 1.5 // alto de una pieza, en anchos de casilla
const FOOT = 0.72 // dónde apoya la pieza dentro de su casilla (0 arriba, 1 abajo)

function projector(tilt) {
  const sin = Math.sin((tilt * Math.PI) / 180)
  const cos = Math.cos((tilt * Math.PI) / 180)
  // u, v: posición en el tablero (de -0,5 a 0,5; v crece hacia quien mira).
  return (u, v) => {
    const s = PERSPECTIVE / (PERSPECTIVE - v * sin)
    return { x: u * s, y: v * cos * s, s }
  }
}

// Tamaño y sitio del tablero para que quepa entero (con las piezas de la última fila) en el hueco.
function layoutOf(w, h) {
  if (!w || !h) return null
  // Menos inclinado en un móvil en vertical: allí sobra alto y falta ancho.
  const tilt = w < 560 ? (h > w * 1.05 ? 22 : 30) : 40
  const proj = projector(tilt)
  const back = proj(0, -0.5 + FOOT / 8)
  const top = Math.min(proj(0, -0.5).y, back.y - (SPRITE_H / 8) * back.s)
  const bottom = proj(0, 0.5).y + 0.03
  const wide = proj(0.5, 0.5).x * 2 + 0.06
  const size = Math.floor(Math.min((w * 0.98) / wide, h / (bottom - top)))
  return { tilt, proj, size, cx: w / 2, cy: h / 2 - ((top + bottom) / 2) * size }
}

// Rectángulo en pantalla de la pieza de la casilla (col, row) de la vista.
function spriteRect(layout, col, row) {
  const { proj, size, cx, cy } = layout
  const p = proj((col + 0.5) / 8 - 0.5, (row + FOOT) / 8 - 0.5)
  const width = (size / 8) * p.s
  const height = width * SPRITE_H
  return { left: cx + p.x * size - width / 2, top: cy + p.y * size - height, width, height }
}

function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setBox((old) => (old.w === el.clientWidth && old.h === el.clientHeight ? old : { w: el.clientWidth, h: el.clientHeight }))
    read()
    // La ventana también, por si algún navegador no avisa al observador al girar el móvil.
    window.addEventListener('resize', read)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    observer?.observe(el)
    return () => {
      window.removeEventListener('resize', read)
      observer?.disconnect()
    }
  }, [ref])
  return box
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
  const wrapRef = useRef(null)
  const box = useBox(wrapRef)
  const layout = useMemo(() => layoutOf(box.w, box.h), [box.w, box.h])
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
      wrapRef.current?.animate?.(
        [
          { transform: 'translate(0,0)' },
          { transform: 'translate(-7px,5px)' },
          { transform: 'translate(6px,-4px)' },
          { transform: 'translate(-4px,2px)' },
          { transform: 'translate(2px,-1px)' },
          { transform: 'translate(0,0)' },
        ],
        { duration: 450, easing: 'ease-out' },
      )
    }, 620)
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

  return (
    <main ref={mainRef} className="app chess-app cz">
      <PieceDefs />
      <div className="cz-hall" aria-hidden="true">
        <span className="cz-torch cz-torch--l">
          <i />
        </span>
        <span className="cz-torch cz-torch--r">
          <i />
        </span>
        <span className="cz-mist" />
      </div>
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
          <div ref={wrapRef} className="cz-boardwrap">
            {layout && (
              <div
                className={`cz-board ${canMove ? 'is-live' : ''}`}
                style={{
                  width: layout.size,
                  height: layout.size,
                  left: layout.cx - layout.size / 2,
                  top: layout.cy - layout.size / 2,
                  transform: `perspective(${PERSPECTIVE * layout.size}px) rotateX(${layout.tilt}deg)`,
                }}
              >
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
                {animate && last?.captured && (
                  <Rubble key={`r-${state.match}-${last.ply}`} piece={last.captured} style={{ left: `${spot(last.capturedAt).col * 12.5}%`, top: `${spot(last.capturedAt).row * 12.5}%` }} />
                )}
              </div>
            )}
            {layout && (
              <div className="cz-sprites" aria-hidden="true">
                {board.map((p, sq) => {
                  if (!p) return null
                  const { col, row } = spot(sq)
                  const rect = spriteRect(layout, col, row)
                  const style = { ...rect, zIndex: 10 + row * 2 }
                  const classes = ['cz-sprite', colorOf(p) === myColor && canMove && 'is-mine']
                  let move = null
                  if (animate && last) {
                    if (last.to === sq) move = last.from
                    else if (last.rook && last.rook.to === sq) move = last.rook.from
                  }
                  if (move !== null) {
                    const a = spot(move)
                    const from = spriteRect(layout, a.col, a.row)
                    style['--dx'] = `${from.left - rect.left}px`
                    style['--dy'] = `${from.top + from.height - rect.top - rect.height}px`
                    style['--s0'] = from.width / rect.width
                    style['--lift'] = `${rect.height * (typeOf(p) === 'n' ? 0.45 : 0.12)}px`
                    style.zIndex = 40
                    classes.push('cz-sprite--move')
                    if (last.to === sq && last.captured) classes.push('cz-sprite--strike')
                  }
                  if (sq === fallen) classes.push('cz-sprite--fallen')
                  if (selected === sq) classes.push('cz-sprite--lift')
                  if (state.check === sq && !sent && playing) classes.push('cz-sprite--check')
                  return (
                    <div key={`${sq}-${p}-${move !== null ? `${state.match}-${last.ply}` : ''}`} className={classes.filter(Boolean).join(' ')} style={style} onClick={() => onSquare(sq)}>
                      <Piece piece={p} />
                    </div>
                  )
                })}
                {animate && last?.captured && (() => {
                  const { col, row } = spot(last.capturedAt)
                  return <Shatter key={`x-${state.match}-${last.ply}`} piece={last.captured} style={{ ...spriteRect(layout, col, row), zIndex: 39 }} />
                })()}
              </div>
            )}
            {promo && (
              <div className="cz-promo" role="group" aria-label="Elige la pieza de la coronación">
                <span>Corona tu peón</span>
                <div>
                  {['q', 'r', 'b', 'n'].map((t) => (
                    <button key={t} type="button" aria-label={NAMES[t]} onClick={() => go(promo.from, promo.to, t)}>
                      <Piece piece={myColor === 'w' ? t.toUpperCase() : t} />
                    </button>
                  ))}
                </div>
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
