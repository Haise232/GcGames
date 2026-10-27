import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../useEffectEvent.js'
import { bestHand } from '../shared/poker-core.js'
import Avatar from '../Avatar.jsx'
import Help from '../Help.jsx'
import { eur } from '../money.js'
import Chat from '../table/Chat.jsx'
import Invite from '../table/Invite.jsx'
import SeatBubble from '../table/SeatBubble.jsx'
import PlayingCard from '../PlayingCard.jsx'
import WinBurst from '../WinBurst.jsx'
import WinToast from '../WinToast.jsx'
import { playCard, playChip, playLose, playTurn, playWin } from '../sound.js'
import { useCountdown } from '../table/useCountdown.js'
import './poker.css'
import './bet-slider.css'
// Último: ajusta el aspecto de poker.css (generado) sin tocarlo.
import './poker-ui.css'

const STREETS = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' }
const LIVE = new Set(Object.keys(STREETS))
const GLYPHS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const RED = new Set(['hearts', 'diamonds'])
const SUIT_WORDS = { spades: 'picas', hearts: 'corazones', diamonds: 'diamantes', clubs: 'tréboles' }

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word][0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// Tono estable por nombre para el avatar.
const hueOf = (name) => [...name].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) % 360, 17)

const money = eur

// Pila de fichas de colores para una cantidad, de mayor a menor valor.
const TONES = [
  [500, 'purple'],
  [100, 'black'],
  [25, 'green'],
  [5, 'red'],
  [1, 'white'],
]
function chipsFor(amount) {
  const chips = []
  for (const [value, tone] of TONES) {
    while (amount >= value && chips.length < 6) {
      chips.push(tone)
      amount -= value
    }
  }
  return chips
}

function Chips({ amount, bare = false }) {
  return (
    <span className="pchips">
      <span className="pchips__stack" aria-hidden="true">
        {chipsFor(amount).map((tone, i) => (
          <i key={i} className={`pchip pchip--${tone}`} style={{ '--n': i }} />
        ))}
      </span>
      {!bare && <b>{money(amount)}</b>}
    </span>
  )
}

function Card({ card, index, best }) {
  return (
    <span className={`pcard ${best === true ? 'pcard--best' : ''} ${best === false ? 'pcard--dim' : ''}`}>
      <PlayingCard rank={card?.rank ?? 'A'} suit={card?.suit ?? 'spades'} down={!card} index={index} />
    </span>
  )
}

// Carta en miniatura para el panel de jugadas y la tabla de manos.
function Mini({ rank, suit }) {
  return (
    <span className={`mini ${RED.has(suit) ? 'mini--red' : ''}`}>
      {rank}
      {GLYPHS[suit]}
    </span>
  )
}

// Nombre de la mejor jugada propia mientras se juega la mano.
function strength(cards, board) {
  if (!cards.length || cards.some((card) => !card)) return null
  if (board.length >= 3) return bestHand([...cards, ...board]).name
  return cards[0].rank === cards[1]?.rank ? 'Pareja' : 'Carta alta'
}

// --- Panel de jugadas: lo que va pasando, sacado de comparar un estado con el anterior ---

const VERBS = {
  'Se retira': ['se retira', 'te retiras'],
  Pasa: ['pasa', 'pasas'],
  Iguala: ['iguala', 'igualas'],
  Apuesta: ['apuesta', 'apuestas'],
  Sube: ['sube a', 'subes a'],
  'All-in': ['va all-in con', 'vas all-in con'],
  'Ciega pequeña': ['pone la ciega pequeña', 'pones la ciega pequeña'],
  'Ciega grande': ['pone la ciega grande', 'pones la ciega grande'],
}
const ACTION_TONES = { 'Se retira': 'fold', Sube: 'raise', Apuesta: 'raise', 'All-in': 'allin' }

function actionText(seat, mine) {
  const [third, second] = VERBS[seat.action] ?? [seat.action.toLowerCase(), seat.action.toLowerCase()]
  const silent = seat.action === 'Se retira' || seat.action === 'Pasa'
  return `${mine ? 'Tú' : seat.name} ${mine ? second : third}${silent ? '' : ` ${money(seat.bet)}`}`
}

function describe(before, now, meId) {
  if (!before || before.code !== now.code) return []
  const events = []
  const newHand = now.hand !== before.hand
  if (newHand && LIVE.has(now.phase)) events.push({ text: `Mano ${now.hand}: se reparten las cartas`, tone: 'info' })
  now.seats.forEach((seat, i) => {
    const old = before.seats[i]
    if (seat && !old) events.push({ text: `${seat.name} se sienta`, tone: 'info' })
    else if (!seat && old) events.push({ text: `${old.name} deja la mesa`, tone: 'info' })
  })
  if (LIVE.has(now.phase)) {
    now.seats.forEach((seat, i) => {
      const old = before.seats[i]
      if (!seat?.action) return
      // Una acción nueva, o la misma con más fichas (otra subida). Al cambiar de calle las apuestas bajan: no cuenta.
      if (newHand || !old || old.action !== seat.action || seat.bet > old.bet) {
        events.push({ text: actionText(seat, seat.id === meId), tone: ACTION_TONES[seat.action] ?? 'plain' })
      }
    })
  }
  if (!newHand && now.board.length > before.board.length) {
    events.push({
      text: { 3: 'Flop', 4: 'Turn', 5: 'River' }[now.board.length],
      cards: now.board.slice(before.board.length),
      tone: 'street',
    })
  }
  if (now.phase === 'showdown' && before.phase !== 'showdown' && now.result) {
    for (const w of now.result.winners) {
      const mine = now.seats[w.seat]?.id === meId
      const verb = now.result.byFold ? (mine ? 'te llevas' : 'se lleva') : mine ? 'ganas' : 'gana'
      events.push({ text: `${mine ? 'Tú' : w.name} ${verb} ${money(w.amount)}${w.hand ? ` con ${w.hand}` : ''}`, tone: 'win' })
    }
  }
  return events
}

function usePlayLog(state, meId) {
  const previous = useRef(null)
  const nextId = useRef(1)
  const [log, setLog] = useState([])
  useEffect(() => {
    const events = describe(previous.current, state, meId)
    previous.current = state
    if (!events.length) return
    const stamped = events.map((event) => ({ ...event, id: nextId.current++ })).reverse()
    setLog((old) => [...stamped, ...old].slice(0, 8))
  }, [state, meId])
  return log
}

function EventText({ event }) {
  return (
    <>
      {event.text}
      {event.cards && (
        <span className="pk-band__cards">
          {event.cards.map((card) => (
            <Mini key={card.id} {...card} />
          ))}
        </span>
      )}
    </>
  )
}

// Texto plano de una jugada, para el aviso hablado.
function plain(event) {
  return event.cards ? `${event.text}: ${event.cards.map((card) => `${card.rank} de ${SUIT_WORDS[card.suit]}`).join(', ')}` : event.text
}

// Banda fija bajo la cabecera: estado corto, últimas jugadas y tus fichas. Su alto no cambia.
function PlayBand({ log, status, myTurn, mine }) {
  const [latest, ...older] = log
  return (
    <section className="pk-band" aria-label="Estado de la mesa">
      <p className={`pk-band__status ${myTurn ? 'is-turn' : ''}`}>{status}</p>
      <ol className="pk-band__log" aria-label="Últimas jugadas">
        {latest ? (
          [latest, ...older.slice(0, 2)].map((event, i) => (
            <li key={event.id} className={`pk-band__item pk-band__item--${event.tone} ${i === 0 ? 'pk-band__item--new' : ''}`}>
              <EventText event={event} />
            </li>
          ))
        ) : (
          <li className="pk-band__item">Aquí verás cada jugada.</li>
        )}
      </ol>
      {mine && (
        <p className="pk-band__money">
          <span>Fichas</span>
          <b>{money(mine.balance)}</b>
        </p>
      )}
    </section>
  )
}

// --- Tabla de manos (ventana «Jugadas») ---

const RANKINGS = [
  ['Escalera real', 'A, K, Q, J y 10 del mismo palo.', 'As Ks Qs Js 10s'],
  ['Escalera de color', 'Cinco cartas seguidas del mismo palo.', '9h 8h 7h 6h 5h'],
  ['Póker', 'Cuatro cartas del mismo valor.', 'Qc Qd Qh Qs 7d'],
  ['Full', 'Un trío y una pareja.', 'Ks Kh Kd 4c 4s'],
  ['Color', 'Cinco cartas del mismo palo, sin ir seguidas.', 'Ad Jd 8d 6d 2d'],
  ['Escalera', 'Cinco cartas seguidas de cualquier palo. El as vale alto o bajo.', '10c 9d 8s 7h 6c'],
  ['Trío', 'Tres cartas del mismo valor.', '7s 7h 7d Kc 2s'],
  ['Doble pareja', 'Dos parejas distintas.', 'Jh Jc 4s 4d Ac'],
  ['Pareja', 'Dos cartas del mismo valor.', '10s 10h Kd 6c 3s'],
  ['Carta alta', 'Ninguna de las anteriores: manda la carta más alta.', 'Ah Qc 8s 5d 2c'],
]
const SUIT_CODES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

function HandRanks({ current }) {
  return (
    <ol className="pranks">
      {RANKINGS.map(([name, text, example], i) => (
        <li key={name} className={`pranks__row ${name === current ? 'pranks__row--mine' : ''}`}>
          <span className="pranks__n">{i + 1}</span>
          <span className="pranks__name">
            {name}
            {name === current && <small>Tu jugada</small>}
          </span>
          <span className="pranks__cards" aria-hidden="true">
            {example.split(' ').map((code) => (
              <Mini key={code} rank={code.slice(0, -1)} suit={SUIT_CODES[code.at(-1)]} />
            ))}
          </span>
          <span className="pranks__text">{text}</span>
        </li>
      ))}
    </ol>
  )
}

// Contenido de la ventana «Jugadas», en dos pestañas para que quepa sin scroll.
function PokerGuide({ current, state }) {
  const [tab, setTab] = useState('hands')
  return (
    <>
      <div className="ptabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'hands'} onClick={() => setTab('hands')}>
          Manos
        </button>
        <button type="button" role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')}>
          Reglas e invitar
        </button>
      </div>
      {tab === 'hands' ? (
        <>
          <p className="pguide__intro">De la mejor a la peor. Gana la mejor mano de cinco entre tus dos cartas y las de la mesa.</p>
          <HandRanks current={current} />
        </>
      ) : (
        <>
          <h3>Cómo se juega</h3>
          <p>
            Texas Hold'em sin límite, ciegas de {money(state.blinds.small)} y {money(state.blinds.big)}. Cada jugador recibe
            dos cartas y en la mesa salen cinco: flop (3), turn (1) y river (1), con una ronda de apuestas antes de cada una.
          </p>
          <p>
            En tu turno puedes retirarte (<kbd>F</kbd>), pasar o igualar (<kbd>C</kbd>) y subir (<kbd>R</kbd>). Tienes 25 s
            por decisión; si se acaban, pasas si puedes y si no te retiras.
          </p>
          <h3>{state.label ? 'Mesa pública' : 'Invitar'}</h3>
          {state.label ? (
            <p>
              Cualquiera con cuenta puede sentarse desde el selector de juegos, sin código. Tus fichas son tu saldo semanal del
              servidor, el mismo que en la mesa de blackjack.
            </p>
          ) : (
            <p>
              Pasa el código <b>{state.code}</b> y la dirección <b>{location.origin}</b>. Tus fichas son tu saldo semanal del
              servidor, el mismo que en la mesa de blackjack.
            </p>
          )}
        </>
      )}
    </>
  )
}

// --- Asientos ---

function Seat({ seat, index, angle, state, mine, active, clock, highlight, liveHand, canSit, canKick, bubble, dealer, axis, onSit, onKick }) {
  const style = { '--a': `${angle}deg` }
  if (!seat) {
    return (
      <div className="pod pod--empty" style={style}>
        {canSit ? (
          <button type="button" className="pod__sit" onClick={onSit} aria-label={`Sentarse en el asiento ${index + 1}`}>
            <span className="pod__plus" aria-hidden="true">
              +
            </span>
            <span className="pod__sit-text" aria-hidden="true">
              Sentarse
            </span>
          </button>
        ) : (
          <span className="pod__free">{index + 1}</span>
        )}
      </div>
    )
  }
  const live = LIVE.has(state.phase)
  const won = state.phase === 'showdown' && seat.won > 0
  const showCards = seat.inHand && seat.cards.length > 0 && (!seat.folded || mine)
  const hurry = active && clock && clock.fraction < 0.25
  const handName = seat.handName ?? liveHand
  // El globo va al lado exterior del avatar, lejos de las cartas y de la etiqueta de estado.
  const side = Math.cos((angle * Math.PI) / 180) < -0.25 ? 'left' : 'right'

  // Estado de la jugada: siempre con texto y símbolo, no solo con color.
  let tag = null
  if (won) tag = { icon: '★', text: `+${money(seat.won)}`, tone: 'win' }
  else if (!seat.connected) tag = { icon: '☾', text: 'Ausente', tone: 'away' }
  else if (state.phase === 'showdown' && !seat.folded) tag = null
  else if (seat.allIn) tag = { icon: '◆', text: 'All-in', tone: 'allin' }
  else if (seat.folded) tag = { icon: '✕', text: 'Fuera', tone: 'fold' }
  else if (seat.action) {
    tag = {
      icon: null,
      text: seat.action.replace('Ciega pequeña', 'C. pequeña').replace('Ciega grande', 'C. grande'),
      bet: seat.bet > 0 ? money(seat.bet) : null,
      tone: /Sube|Apuesta/.test(seat.action) ? 'raise' : 'plain',
    }
  } else if (live && !seat.inHand) tag = { icon: '…', text: 'Espera', tone: 'plain' }
  else if (seat.balance < state.blinds.big && !seat.inHand) tag = { icon: '∅', text: 'Sin fichas', tone: 'fold' }

  const classes = [
    'pod',
    mine && 'pod--me',
    active && 'pod--turn',
    hurry && 'pod--hurry',
    seat.folded && 'pod--folded',
    !seat.connected && 'pod--away',
    won && 'pod--winner',
    bubble && 'pod--talk',
    axis && 'pod--axis',
    side === 'left' ? 'pod--l' : 'pod--r',
  ]
    .filter(Boolean)
    .join(' ')

  const cards = showCards && (
    <div className="pod__cards">
      {seat.cards.map((card, i) => (
        <Card key={`${state.hand}-${i}`} card={card} index={i} best={highlight && card ? highlight.has(card.id) : undefined} />
      ))}
    </div>
  )

  return (
    <div className={classes} style={{ ...style, '--hue': hueOf(seat.name), '--p': active && clock ? clock.fraction : 0 }}>
      {/* Tus cartas, en una bandeja propia: grandes, rectas y con el nombre de la mano al lado. */}
      {mine ? (
        showCards && (
          <div className="pod__tray">
            {cards}
            {handName && (
              <span className={`pod__hand ${won ? 'pod__hand--win' : ''}`}>
                <small>Tu mano</small>
                {handName}
              </span>
            )}
          </div>
        )
      ) : (
        cards
      )}
      <div className="pod__avatar" aria-hidden="true">
        {seat.avatar ? <Avatar name={seat.name} src={seat.avatar} size={64} className="pod__photo" /> : initials(seat.name)}
      </div>
      {dealer && (
        <span className="pod__dealer" role="img" aria-label="Botón del repartidor">
          D
        </span>
      )}
      <div className={`pod__anchor pod__anchor--out pod__anchor--${side} ${axis ? 'pod__anchor--axis' : ''}`}>
        <SeatBubble bubble={bubble} side={side} />
      </div>
      {/* En la mesa vertical el globo va sobre el avatar: en los lados no hay sitio fuera. */}
      {!axis && (
        <div className="pod__anchor pod__anchor--in pod__anchor--top">
          <SeatBubble bubble={bubble} side="top" />
        </div>
      )}
      <div className="pod__plate">
        <span className="pod__name">
          {seat.name}
          {mine && <small> · tú</small>}
        </span>
        <span className="pod__stack">{money(seat.balance)}</span>
        {!mine && handName && <span className={`pod__hand ${won ? 'pod__hand--win' : ''}`}>{handName}</span>}
        {tag && (
          <span key={tag.text} className={`pod__tag pod__tag--${tag.tone}`}>
            {tag.icon && <i aria-hidden="true">{tag.icon}</i>}
            {tag.text}
            {tag.bet && <span className="pod__tag-bet"> {tag.bet}</span>}
          </span>
        )}
      </div>
      {/* En la mesa vertical la apuesta va bajo la placa (en la horizontal, sobre el paño). */}
      {seat.bet > 0 && (
        <span className="pod__bet">
          <Chips amount={seat.bet} />
        </span>
      )}
      {canKick && (
        <button type="button" className="pod__kick" onClick={onKick} aria-label={`Echar a ${seat.name}`}>
          ×
        </button>
      )}
    </div>
  )
}

// --- Barra de decisiones. Se monta de nuevo en cada decisión, así la subida empieza en el mínimo. ---

function ActionBar({ state, mine, send, pending }) {
  const owed = Math.min(state.currentBet - mine.bet, mine.balance)
  const maxTo = mine.bet + mine.balance
  const canRaise = maxTo > state.currentBet && owed < mine.balance
  const minTo = Math.min(state.currentBet + state.minRaise, maxTo)
  const [raiseTo, setRaiseTo] = useState(minTo)
  const [draft, setDraft] = useState(null) // lo que se está escribiendo en la casilla de la cantidad
  const onTable = state.pot + state.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0)
  const clamp = (n) => Math.max(minTo, Math.min(maxTo, Math.round(n)))
  // La barra avanza de ciega grande en ciega grande (salvo en los extremos); la casilla acepta cualquier cantidad exacta.
  const step = Math.max(1, state.blinds.big)
  const snap = (n) => (n >= maxTo ? maxTo : n <= minTo ? minTo : clamp(Math.round(n / step) * step))
  const choose = (n) => {
    setDraft(null)
    setRaiseTo(clamp(n))
  }
  const commitDraft = () => {
    if (draft === null) return
    const value = Number(draft.replace(/[^\d]/g, ''))
    choose(Number.isFinite(value) && draft.trim() !== '' ? value : raiseTo)
  }
  const potRaise = (part) => clamp(state.currentBet + (onTable + owed) * part)
  const opening = state.currentBet === 0

  // Mientras la jugada viaja al servidor, los botones se bloquean: un doble clic no manda dos acciones.
  const [sent, setSent] = useState(null)
  const wasPending = useRef(false)
  const locked = Boolean(pending) || sent !== null
  useEffect(() => {
    if (wasPending.current && !pending) setSent(null)
    wasPending.current = Boolean(pending)
  }, [pending])
  // Por si la respuesta no llega o no se marca como pendiente: nunca queda bloqueado para siempre.
  useEffect(() => {
    if (sent === null) return
    const timer = setTimeout(() => setSent(null), 4000)
    return () => clearTimeout(timer)
  }, [sent])
  const act = (kind, message) => {
    if (locked) return
    setSent(kind)
    if (send(message) === false) setSent(null)
  }
  const fold = () => act('fold', { t: 'action', kind: 'fold' })
  const call = () => act('call', { t: 'action', kind: owed > 0 ? 'call' : 'check' })
  const raise = () => act('raise', { t: 'action', kind: 'raise', amount: raiseTo })

  const onKey = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return
    if (event.code === 'KeyF') fold()
    else if (event.code === 'KeyC') call()
    else if (event.code === 'KeyR' && canRaise) raise()
  })

  useEffect(() => {
    const handler = (event) => onKey(event)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const presets = [
    ['Mín', minTo],
    ['½ bote', potRaise(0.5)],
    ['Bote', potRaise(1)],
    ['All-in', maxTo],
  ]

  return (
    <div className={`pbar pbar--act ${locked ? 'pbar--sending' : ''}`} role="group" aria-label="Tu decisión" aria-busy={locked}>
      <div className="pbar__buttons">
        <button type="button" className="pbtn pbtn--fold" onClick={fold} disabled={locked}>
          {sent === 'fold' ? 'Enviando…' : <>Retirarse <kbd>F</kbd></>}
        </button>
        <button type="button" className="pbtn pbtn--call" onClick={call} disabled={locked}>
          {sent === 'call' ? (
            'Enviando…'
          ) : (
            <>
              {owed === 0 ? 'Pasar' : owed === mine.balance ? `All-in ${money(owed)}` : `Igualar ${money(owed)}`} <kbd>C</kbd>
            </>
          )}
        </button>
        {canRaise && (
          <button type="button" className="pbtn pbtn--raise" onClick={raise} disabled={locked}>
            {sent === 'raise' ? (
              'Enviando…'
            ) : (
              <>
                {raiseTo === maxTo ? 'All-in' : opening ? 'Apostar' : 'Subir a'} {money(raiseTo)} <kbd>R</kbd>
              </>
            )}
          </button>
        )}
      </div>
      {canRaise ? (
        <div className="pbar__raise">
          <div className="pbar__presets">
            {presets.map(([label, value]) => (
              <button key={label} type="button" aria-pressed={raiseTo === value} onClick={() => choose(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="pslide">
            <button
              type="button"
              className="pslide__step"
              aria-label={`Bajar ${money(step)}`}
              disabled={raiseTo <= minTo}
              onClick={() => choose(snap(raiseTo - step))}
            >
              −
            </button>
            <label className="pbar__slider pslide__bar">
              <span className="sr-only">Cantidad de la apuesta</span>
              <input
                type="range"
                min={minTo}
                max={maxTo}
                step={1}
                value={raiseTo}
                aria-valuetext={money(raiseTo)}
                style={{ '--fill': maxTo > minTo ? (raiseTo - minTo) / (maxTo - minTo) : 1 }}
                onChange={(event) => choose(snap(Number(event.target.value)))}
              />
              <span className="pslide__ends" aria-hidden="true">
                <span>{money(minTo)}</span>
                <span>{money(maxTo)}</span>
              </span>
            </label>
            <button
              type="button"
              className="pslide__step"
              aria-label={`Subir ${money(step)}`}
              disabled={raiseTo >= maxTo}
              onClick={() => choose(snap(raiseTo + step))}
            >
              +
            </button>
            <label className="pslide__amount">
              <span className="sr-only">Escribe la cantidad exacta</span>
              <input
                type="text"
                inputMode="numeric"
                value={draft ?? String(raiseTo)}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitDraft()
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    setDraft(null)
                    event.currentTarget.blur()
                  }
                }}
              />
              <span aria-hidden="true">€</span>
            </label>
          </div>
        </div>
      ) : (
        <p className="pbar__note">{owed >= mine.balance ? 'Para seguir tienes que ir all-in.' : 'No puedes subir más.'}</p>
      )}
    </div>
  )
}

function PokerTable({ room, me, conn, error, send, onLeave, chat, bubbles, pending }) {
  const { state, at } = room
  const n = state.seats.length
  const mySeat = state.seats.findIndex((seat) => seat?.id === me?.id)
  const mine = mySeat >= 0 ? state.seats[mySeat] : null
  const clock = useCountdown(state.deadlineIn, state.deadlineTotal, at)
  const live = LIVE.has(state.phase)
  const showdown = state.phase === 'showdown'
  const myTurn = live && state.turn === mySeat && mySeat >= 0 && state.deadlineIn !== null
  const isHost = state.hostId === me?.id
  const result = state.result
  const broke = mine && !(live && mine.inHand) && mine.balance < state.blinds.big
  const myHand = mine?.inHand && !mine.folded ? strength(mine.cards, state.board) : null
  const owed = mine ? Math.min(state.currentBet - mine.bet, mine.balance) : 0
  const log = usePlayLog(state, me?.id)
  const [look, setLook] = useState(false) // «Mirar»: oculta el aviso grande de la mesa en espera

  // El pie mide lo que mide: se publica su alto para que el chat se coloque sin números fijos.
  const mainRef = useRef(null)
  const footRef = useRef(null)
  useLayoutEffect(() => {
    const main = mainRef.current
    const foot = footRef.current
    if (!main || !foot) return
    const publish = () => main.style.setProperty('--pk-foot-h', `${Math.ceil(foot.getBoundingClientRect().height)}px`)
    publish()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(publish)
    observer.observe(foot)
    return () => observer.disconnect()
  }, [])

  // Cartas ganadoras resaltadas en el enfrentamiento.
  const highlight = showdown && result && !result.byFold ? new Set(result.winners.flatMap((w) => w.best)) : null

  const cardsOut =
    state.board.length + state.seats.reduce((sum, seat) => sum + (seat?.inHand && !seat.folded ? seat.cards.length : 0), 0)
  const chipsOut = state.seats.reduce((sum, seat) => sum + (seat?.bet ?? 0), 0)
  const myWin = showdown && mine ? mine.won - mine.total : 0
  const lost = showdown && mine?.inHand && mine.won === 0
  // Quién más se lleva el bote: se anuncia a toda la mesa.
  const othersWon = useMemo(
    () =>
      showdown && result
        ? result.winners
            .filter((w) => state.seats[w.seat]?.id !== me?.id && w.amount > 0)
            .map((w) => ({ key: `${state.hand}-${w.seat}`, name: w.name, amount: w.amount, detail: w.hand ? `con ${w.hand}` : '' }))
        : [],
    [showdown, result, state.seats, state.hand, me?.id],
  )

  useEffect(() => {
    if (cardsOut > 0) playCard()
  }, [cardsOut])

  useEffect(() => {
    if (chipsOut > 0) playChip()
  }, [chipsOut])

  useEffect(() => {
    if (myWin > 0) playWin(myWin >= 200)
    else if (lost) playLose()
  }, [myWin, lost, state.hand])

  // Tu turno se oye, vibra (en el móvil) y se ve en la pestaña aunque estés en otra.
  useEffect(() => {
    if (!myTurn) return
    playTurn()
    navigator.vibrate?.(150)
    const title = document.title
    document.title = '● Tu turno · Póker'
    return () => {
      document.title = title
    }
  }, [myTurn])

  // Los asientos giran para que el tuyo quede abajo, en el centro.
  const anchor = mySeat >= 0 ? mySeat : 0
  const angleOf = (i) => 90 + (((i - anchor + n) % n) * 360) / n
  // Arriba y abajo del óvalo la apuesta no cabe entre el asiento y el centro: va junto al avatar.
  const onAxis = (i) => Math.abs(Math.cos((angleOf(i) * Math.PI) / 180)) < 0.3

  // Estado corto para la banda; el aviso grande de la espera va en el centro de la mesa.
  let status = 'Esperando jugadores'
  let wait = null
  const waiting = state.phase === 'waiting'
  if (conn !== 'open') status = 'Conexión perdida. Reconectando…'
  else if (error) status = error
  else if (waiting) {
    const ready = state.seats.filter((s) => s && s.connected && s.balance >= state.blinds.big).length
    if (clock) {
      status = `La mano empieza en ${clock.seconds} s`
      wait = { title: 'La mano empieza', big: `${clock.seconds}`, text: 'Prepara tu decisión.' }
    } else if (!mine) {
      status = 'Mirando la mesa'
      wait = { title: 'Mesa en espera', text: 'Siéntate en un asiento libre para jugar, o mira cómo empieza.', look: true }
    } else if (broke) {
      status = 'Sin fichas'
      wait = { title: 'Sin fichas por ahora', text: 'Vuelves a tener 15.000 € el domingo a las 23:59.' }
    } else if (ready >= 2) {
      status = 'Preparando la mano…'
      wait = { title: 'Preparando la mano…', text: 'Ya sois suficientes.' }
    } else {
      status = 'Esperando a otro jugador'
      wait = { title: 'Esperando a otro jugador', text: 'La mano empieza cuando haya dos. Invita a alguien.', invite: true }
    }
  } else if (live) {
    const who = state.seats[state.turn]
    if (state.turn === null || state.deadlineIn === null) status = 'Se reparten las cartas…'
    else if (myTurn) status = `Es tu turno${clock ? ` · ${clock.seconds} s` : ''}`
    else status = `Habla ${who?.name ?? '…'}${clock ? ` · ${clock.seconds} s` : ''}`
  } else if (showdown && result) {
    status = result.byFold ? 'Todos se retiraron' : 'Enfrentamiento'
  }
  if (conn !== 'open') wait = { title: 'Conexión perdida', text: 'Reconectando…' }

  const streetIndex = Object.keys(STREETS).indexOf(state.phase)

  // Un solo aviso hablado (cortés) para lo que pasa en la mesa; el turno se anuncia una vez.
  const latest = log[0]
  const announce = myTurn
    ? `Es tu turno. ${owed > 0 ? `Debes ${money(owed)}.` : 'Puedes pasar o apostar.'}`
    : latest
      ? plain(latest)
      : ''

  return (
    <main ref={mainRef} className="app poker pk">
      <header className="top pk-top">
        <h1>Póker</h1>
        <p className="pk-room" data-room-code={state.code}>
          <span>{state.label ? 'Mesa pública' : 'Sala'}</span>
          <b>{state.label ?? state.code}</b>
          <small>
            Ciegas {state.blinds.small}/{state.blinds.big}
            {state.spectators > 0 ? ` · ${state.spectators} mirando` : ''}
          </small>
        </p>
        <div className="toggles">
          <Help label="Jugadas" title="Jugadas del póker" wide>
            <PokerGuide current={myHand ?? mine?.handName} state={state} />
          </Help>
          <Invite game="poker" code={state.code} name="Póker" />
          <button type="button" onClick={onLeave}>
            Salir
          </button>
        </div>
      </header>

      <PlayBand log={log} status={status} myTurn={myTurn} mine={mine} />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      <div className="pk-floor fill">
        <section className="pstage" aria-label="Mesa de póker">
          <div className="pktable">
            <div className="pktable__felt" />
          </div>

          <div className="pcenter">
            {wait && !(look && wait.look) ? (
              <div className={`pk-wait ${wait.big ? 'pk-wait--count' : ''}`}>
                <h2>{wait.title}</h2>
                {wait.big && <b className="pk-wait__big">{wait.big}</b>}
                <p>{wait.text}</p>
                {(wait.invite || wait.look) && (
                  <div className="pk-wait__actions">
                    {wait.invite && <Invite game="poker" code={state.code} name="Póker" />}
                    {wait.look && (
                      <>
                        {conn === 'open' && (
                          <button
                            type="button"
                            className="pk-cta"
                            onClick={() => send({ t: 'sit', seat: state.seats.findIndex((seat) => !seat) })}
                            disabled={!state.seats.some((seat) => !seat)}
                          >
                            Sentarme
                          </button>
                        )}
                        <button type="button" onClick={() => setLook(true)}>
                          Mirar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : waiting ? (
              look && (
                <button type="button" className="pk-wait__pill" onClick={() => setLook(false)}>
                  Mirando · ver aviso
                </button>
              )
            ) : (
              <>
                <div className="ppot">
                  <ol className="pstreets" aria-label="Calle">
                    {Object.values(STREETS).map((name, i) => (
                      <li
                        key={name}
                        className={i < streetIndex ? 'is-done' : i === streetIndex ? 'is-now' : ''}
                        aria-current={i === streetIndex ? 'step' : undefined}
                      >
                        {name}
                      </li>
                    ))}
                  </ol>
                  {showdown && result ? (
                    <p className="presult">
                      {result.winners.map((w) => (
                        <span key={w.seat}>
                          <b>{w.name}</b> {result.byFold ? 'se lleva' : 'gana'} {money(w.amount)}
                          {w.hand && <em> · {w.hand}</em>}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="ppot__sum">
                      <span>Bote</span>
                      {state.pot > 0 ? <Chips amount={state.pot} /> : <b className="ppot__zero">0 €</b>}
                    </p>
                  )}
                </div>
                <div className="pboard">
                  {Array.from({ length: 5 }, (_, i) => {
                    const card = state.board[i]
                    return card ? (
                      <Card
                        key={`${state.hand}-${card.id}`}
                        card={card}
                        index={i < 3 ? i : 0}
                        best={highlight ? highlight.has(card.id) : undefined}
                      />
                    ) : (
                      <span key={`slot-${i}`} className="pboard__slot" />
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {state.seats.map((seat, i) =>
            seat && seat.bet > 0 && !onAxis(i) ? (
              <div key={`bet-${i}`} className="pbet" style={{ '--a': `${angleOf(i)}deg` }}>
                <Chips amount={seat.bet} />
              </div>
            ) : null,
          )}

          {/* El bote viaja hasta quien lo gana. */}
          {showdown &&
            state.seats.map((seat, i) =>
              seat && seat.won > 0 ? (
                <div key={`pay-${state.hand}-${i}`} className="pk-payout" style={{ '--a': `${angleOf(i)}deg` }} aria-hidden="true">
                  <Chips amount={seat.won} bare />
                </div>
              ) : null,
            )}

          {state.seats.map((seat, i) => (
            <Seat
              key={i}
              seat={seat}
              index={i}
              angle={angleOf(i)}
              state={state}
              mine={i === mySeat}
              active={live && state.turn === i && state.deadlineIn !== null}
              clock={clock}
              highlight={highlight}
              liveHand={i === mySeat && live ? myHand : null}
              canSit={mySeat < 0 && conn === 'open'}
              canKick={isHost && seat && i !== mySeat && waiting}
              bubble={seat ? bubbles?.[seat.id] : undefined}
              dealer={!waiting && state.button === i}
              axis={onAxis(i)}
              onSit={() => send({ t: 'sit', seat: i })}
              onKick={() => send({ t: 'kick', seat: i })}
            />
          ))}
        </section>
      </div>

      <footer ref={footRef} className={`pk-foot ${mine && !waiting ? 'pk-foot--seated' : ''}`}>
        {myTurn ? (
          <ActionBar key={`${state.hand}-${state.phase}-${state.currentBet}`} state={state} mine={mine} send={send} pending={pending} />
        ) : mine ? (
          <div className="pbar pbar--idle">
            <p className="pbar__note">
              {mine.inHand && !mine.folded && live
                ? `Espera tu turno.${owed > 0 ? ` Para seguir tendrás que poner ${money(owed)}.` : ''}`
                : mine.folded && live
                  ? 'Te retiraste. Entras en la próxima mano.'
                  : live
                    ? 'Entras en la próxima mano.'
                    : broke
                      ? 'Sin fichas esta semana: el domingo a las 23:59 vuelves a tener 15.000 €.'
                      : 'Sentado a la mesa.'}
            </p>
            <div className="pbar__buttons">
              <button type="button" className="pbtn pbtn--fold" disabled={Boolean(pending)} onClick={() => send({ t: 'stand_up' })}>
                {mine.inHand && live && !mine.folded ? 'Retirarse y levantarse' : 'Dejar el asiento'}
              </button>
            </div>
          </div>
        ) : (
          <div className="pbar pbar--idle">
            <p className="pbar__note">Estás mirando la mesa. Toca «Sentarse» en un asiento libre para jugar.</p>
          </div>
        )}
      </footer>

      {/* La celebración se guarda para el enfrentamiento o un bote que valga la pena. */}
      {myWin > 0 && (!result?.byFold || myWin >= 100) && (
        <WinBurst
          key={state.hand}
          amount={mine.won}
          caption={mine.handName ? `Con ${mine.handName}` : 'Todos se retiraron'}
          coins={Math.min(70, 20 + Math.round(myWin / 10))}
          big={myWin >= 500}
          who={me?.name}
        />
      )}
      <WinToast wins={othersWon} />
      <Chat messages={chat ?? []} me={me} send={send} />
    </main>
  )
}

export default PokerTable
