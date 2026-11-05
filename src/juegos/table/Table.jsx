import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import Avatar from '../comun/Avatar.jsx'
import { eur } from '../comun/money.js'
import FeltPrint from '../comun/FeltPrint.jsx'
import PlayingCard from '../comun/PlayingCard.jsx'
import { playCard, playChip, playLose, playTurn, playWin } from '../comun/sound.js'
import { useCountdown } from './useCountdown.js'
import Help from '../comun/Help.jsx'
import Chat from './Chat.jsx'
import Invite from './Invite.jsx'
import SeatBubble from './SeatBubble.jsx'
import WinBurst from '../comun/WinBurst.jsx'
import WinToast from '../comun/WinToast.jsx'
// Blackjack.css (generado) trae las fichas que comparte con el Cohete; blackjack-ui.css, el aspecto de esta mesa.
import './Blackjack.css'
import './blackjack-ui.css'

// Fichas de la mesa (las mismas que valida el servidor en engine/room.mjs).
const CHIPS = [50, 100, 500, 1000]
const GLYPHS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const RED = new Set(['hearts', 'diamonds'])
const SUIT_WORDS = { spades: 'picas', hearts: 'corazones', diamonds: 'diamantes', clubs: 'tréboles' }

// Fichas que representan una apuesta, de mayor a menor valor.
function chipsFor(amount) {
  const chips = []
  for (const value of [...CHIPS].reverse()) {
    while (amount >= value && chips.length < 6) {
      chips.push(value)
      amount -= value
    }
  }
  return chips
}

function Chips({ amount }) {
  return (
    <span className="bj-chips">
      <span className="bj-chips__stack" aria-hidden="true">
        {chipsFor(amount).map((value, i) => (
          <i key={i} className={`bj-chip chip--bj${value}`} style={{ '--n': i }} />
        ))}
      </span>
      <b>{eur(amount)}</b>
    </span>
  )
}

// Carta en miniatura para la banda de jugadas.
function Mini({ rank, suit }) {
  return (
    <span className={`bj-mini ${RED.has(suit) ? 'bj-mini--red' : ''}`}>
      {rank}
      {GLYPHS[suit]}
    </span>
  )
}

// --- Banda de jugadas: lo que va pasando, sacado de comparar un estado con el anterior ---

// Nombre y verbo según seas tú o otro jugador: ['pide', 'pides'].
const said = (seat, meId, [third, second]) => `${seat.id === meId ? 'Tú' : seat.name} ${seat.id === meId ? second : third}`

function describe(before, now, meId) {
  if (!before || before.code !== now.code) return []
  const events = []
  const newRound = now.round !== before.round
  now.seats.forEach((seat, i) => {
    const old = before.seats[i]
    if (seat && (!old || old.id !== seat.id)) events.push({ text: `${seat.name} se sienta`, tone: 'info' })
    else if (!seat && old) events.push({ text: `${old.name} deja la mesa`, tone: 'info' })
  })
  if (newRound && now.seats.some((seat) => seat?.cards.length)) {
    events.push({ text: `Ronda ${now.round}: se reparten las cartas`, tone: 'info' })
    for (const seat of now.seats) {
      if (seat?.status === 'blackjack') events.push({ text: `${said(seat, meId, ['tiene', 'tienes'])} blackjack`, tone: 'win' })
    }
  }
  now.seats.forEach((seat, i) => {
    const old = before.seats[i]
    if (!seat || !old || old.id !== seat.id) return
    if (now.phase === 'betting' && seat.locked && !old.locked) {
      events.push({ text: `${said(seat, meId, ['apuesta', 'apuestas'])} ${eur(seat.bet)}`, tone: 'raise' })
    }
    if (newRound) return
    const fresh = seat.cards.slice(old.cards.length)
    if (fresh.length) {
      const verb = seat.doubled && !old.doubled ? ['dobla y recibe', 'doblas y recibes'] : ['pide', 'pides']
      events.push({ text: said(seat, meId, verb), cards: fresh, tone: seat.doubled && !old.doubled ? 'raise' : 'plain' })
    }
    if (seat.status === 'bust' && old.status !== 'bust') {
      events.push({ text: `${said(seat, meId, ['se pasa', 'te pasas'])} con ${seat.total}`, tone: 'bad' })
    } else if (seat.status === 'stand' && old.status === 'playing' && !fresh.length) {
      events.push({ text: `${said(seat, meId, ['se planta', 'te plantas'])} con ${seat.total}`, tone: 'plain' })
    }
  })
  if (!newRound) {
    const revealed = before.dealer.includes(null) && !now.dealer.includes(null)
    const known = before.dealer.filter(Boolean).length
    const fresh = now.dealer.filter(Boolean).slice(revealed ? 1 : known)
    if (revealed) events.push({ text: 'El crupier destapa', cards: now.dealer.slice(1, 2), tone: 'street' })
    const drawn = revealed ? fresh.slice(1) : fresh
    if (drawn.length && now.phase !== 'betting') events.push({ text: 'El crupier pide', cards: drawn, tone: 'street' })
  }
  if (now.phase === 'settle' && before.phase !== 'settle') {
    const dealer = now.dealerTotal
    events.push({ text: dealer > 21 ? `El crupier se pasa con ${dealer}` : `El crupier se queda en ${dealer}`, tone: 'street' })
    for (const seat of now.seats) {
      if (seat?.outcome && seat.paid > seat.bet) events.push({ text: `${said(seat, meId, ['gana', 'ganas'])} ${eur(seat.paid - seat.bet)}`, tone: 'win' })
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

// Texto plano de una jugada, para el aviso hablado.
const plain = (event) =>
  event.cards ? `${event.text}: ${event.cards.map((card) => `${card.rank} de ${SUIT_WORDS[card.suit]}`).join(', ')}` : event.text

// Banda fija bajo la cabecera: estado corto, últimas jugadas y tu saldo. Su alto no cambia.
function PlayBand({ log, status, myTurn, mine }) {
  return (
    <section className="bj-band" aria-label="Estado de la mesa">
      <p className={`bj-band__status ${myTurn ? 'is-turn' : ''}`}>{status}</p>
      <ol className="bj-band__log" aria-label="Últimas jugadas">
        {log.length ? (
          log.slice(0, 3).map((event, i) => (
            <li key={event.id} className={`bj-band__item bj-band__item--${event.tone} ${i === 0 ? 'bj-band__item--new' : ''}`}>
              {event.text}
              {event.cards && (
                <span className="bj-band__cards">
                  {event.cards.map((card) => (
                    <Mini key={card.id ?? `${card.rank}${card.suit}`} {...card} />
                  ))}
                </span>
              )}
            </li>
          ))
        ) : (
          <li className="bj-band__item">Aquí verás cada jugada.</li>
        )}
      </ol>
      {mine && (
        <p className="bj-band__money">
          <span>Saldo</span>
          <b>{eur(mine.balance)}</b>
        </p>
      )}
    </section>
  )
}

// --- Asientos ---

const OUTCOME_TAGS = {
  blackjack: { icon: '★', text: 'Blackjack', tone: 'win' },
  win: { icon: '★', text: 'Gana', tone: 'win' },
  push: { icon: '=', text: 'Empate', tone: 'plain' },
  lose: { icon: '✕', text: 'Pierde', tone: 'bad' },
  bust: { icon: '✕', text: 'Se pasa', tone: 'bad' },
}

// Estado del asiento: siempre con texto y símbolo, no solo con color.
function tagOf(seat, phase, active) {
  if (seat.outcome) {
    const tag = OUTCOME_TAGS[seat.outcome]
    return seat.paid > seat.bet ? { ...tag, text: `${tag.text} +${eur(seat.paid - seat.bet)}` } : tag
  }
  if (!seat.connected) return { icon: '☾', text: 'Ausente', tone: 'away' }
  if (phase === 'betting') {
    if (seat.locked) return { icon: '✓', text: 'Lista', tone: 'ready' }
    return { icon: '…', text: 'Apostando', tone: 'plain' }
  }
  if (!seat.cards.length) return { icon: '…', text: 'Espera', tone: 'plain' }
  if (active) return { icon: '▶', text: 'Su turno', tone: 'turn' }
  if (seat.status === 'blackjack') return { icon: '★', text: 'Blackjack', tone: 'win' }
  if (seat.status === 'bust') return { icon: '✕', text: 'Se pasa', tone: 'bad' }
  if (seat.status === 'stand') return { icon: '■', text: seat.doubled ? 'Dobló' : 'Plantado', tone: 'plain' }
  return null
}

// Asientos en arco a lo largo del borde curvo. El primero queda a la izquierda del crupier
// (a la derecha de quien mira), y el juego avanza hacia la izquierda.
function placement(index, count) {
  const angle = count === 1 ? 90 : 18 + (144 * index) / (count - 1)
  const rad = (angle * Math.PI) / 180
  return { '--cos': Math.cos(rad).toFixed(4), '--sin': Math.sin(rad).toFixed(4) }
}

function Seat({ bubble, seat, index, count, mine, active, clock, phase, round, canSit, canKick, onSit, onKick }) {
  const style = placement(index, count)
  if (!seat) {
    return (
      <div className="bj-seat bj-seat--empty" style={style}>
        {canSit ? (
          <button type="button" className="bj-seat__sit" onClick={onSit} aria-label={`Sentarse en el asiento ${index + 1}`}>
            <span className="bj-seat__plus" aria-hidden="true">
              +
            </span>
            <span aria-hidden="true">Sentarse</span>
          </button>
        ) : (
          <span className="bj-seat__free" aria-label={`Asiento ${index + 1} libre`}>
            {index + 1}
          </span>
        )}
      </div>
    )
  }
  const tag = tagOf(seat, phase, active)
  const hurry = active && clock && clock.fraction < 0.25
  const classes = [
    'bj-seat',
    mine && 'bj-seat--me',
    active && 'bj-seat--turn',
    hurry && 'bj-seat--hurry',
    !seat.connected && 'bj-seat--away',
    seat.outcome && `bj-seat--${OUTCOME_TAGS[seat.outcome].tone}`,
    bubble && 'bj-seat--talk',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes} style={{ ...style, '--p': active && clock ? clock.fraction : 0 }}>
      <div className="bj-seat__cards">
        {seat.cards.map((card, i) => (
          <PlayingCard key={`${round}-${card.id}`} {...card} index={i} />
        ))}
        {seat.total !== null && (
          <span className={`bj-total ${seat.total > 21 ? 'bj-total--bust' : seat.total === 21 ? 'bj-total--21' : ''}`}>{seat.total}</span>
        )}
      </div>
      <span className={`bj-seat__spot ${seat.bet > 0 ? 'has-bet' : ''}`}>
        {seat.bet > 0 ? <Chips amount={seat.bet} /> : <span aria-hidden="true">{index + 1}</span>}
      </span>
      <div className="bj-seat__who">
        <div className="bj-seat__anchor" aria-hidden={!bubble}>
          <SeatBubble bubble={bubble} side="top" />
        </div>
        <div className="bj-seat__avatar">
          <Avatar name={seat.name} src={seat.avatar} size={56} />
        </div>
        <div className="bj-seat__plate">
          <span className="bj-seat__name">
            {seat.name}
            {/* Tu placa ya se distingue por el borde dorado: el «tú» solo para lectores de pantalla. */}
            {mine && <small className="sr-only"> (tú)</small>}
          </span>
          <span className="bj-seat__stack">{eur(seat.balance)}</span>
          {tag && (
            <span key={tag.text} className={`bj-tag bj-tag--${tag.tone}`}>
              <i aria-hidden="true">{tag.icon}</i>
              {tag.text}
            </span>
          )}
        </div>
        {canKick && (
          <button type="button" className="bj-seat__kick" onClick={onKick} aria-label={`Echar a ${seat.name}`}>
            ×
          </button>
        )}
      </div>
    </div>
  )
}


function Table({ room, me, conn, error, send, onLeave, chat, bubbles, pending }) {
  const { state, at } = room
  const mySeat = state.seats.findIndex((seat) => seat?.id === me?.id)
  const mine = mySeat >= 0 ? state.seats[mySeat] : null
  const clock = useCountdown(state.deadlineIn, state.deadlineTotal, at)
  const cards = state.dealer.length + state.seats.reduce((sum, seat) => sum + (seat?.cards.length ?? 0), 0)
  const myTurn = state.phase === 'playing' && state.turn === mySeat && mySeat >= 0
  const betting = state.phase === 'betting'
  const settled = state.phase === 'settle'
  const broke = mine && !mine.locked && mine.balance < CHIPS[0]
  const isHost = state.hostId === me?.id
  const myOutcome = mine?.outcome
  const log = usePlayLog(state, me?.id)
  const [look, setLook] = useState(false) // «Mirar»: oculta el aviso grande para ver la mesa

  // El pie mide lo que mide: se publica su alto para que el chat se coloque sin números fijos.
  const mainRef = useRef(null)
  const footRef = useRef(null)
  useLayoutEffect(() => {
    const main = mainRef.current
    const foot = footRef.current
    if (!main || !foot) return
    const publish = () => main.style.setProperty('--bj-foot-h', `${Math.ceil(foot.getBoundingClientRect().height)}px`)
    publish()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(publish)
    observer.observe(foot)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (cards > 0) playCard()
  }, [cards])

  // Tu turno se oye, vibra (en el móvil) y se ve en la pestaña aunque estés en otra, igual que en el póker.
  useEffect(() => {
    if (!myTurn) return
    playTurn()
    navigator.vibrate?.(150)
    const title = document.title
    document.title = '● Tu turno · Blackjack'
    return () => {
      document.title = title
    }
  }, [myTurn])

  useEffect(() => {
    if (!myOutcome) return
    if (myOutcome === 'win' || myOutcome === 'blackjack') playWin(myOutcome === 'blackjack')
    else if (myOutcome !== 'push') playLose()
  }, [myOutcome, state.round])

  const canDouble = myTurn && mine.cards.length === 2 && mine.balance >= mine.bet
  const canBet = Boolean(mine && betting && !mine.locked)
  // Mientras hay una jugada en camino no se envía otra: un doble clic no puede mandarla dos veces.
  const busy = Boolean(pending)
  const hit = () => !busy && send({ t: 'action', kind: 'hit' })
  const stand = () => !busy && send({ t: 'action', kind: 'stand' })
  const double = () => !busy && send({ t: 'action', kind: 'double' })
  const addChip = (value) => {
    if (busy || mine.bet + value > mine.balance) return
    playChip()
    send({ t: 'bet', amount: mine.bet + value })
  }
  const clearBet = () => !busy && send({ t: 'bet', amount: 0 })
  const confirmBet = () => !busy && send({ t: 'ready' })

  // Teclas, como en el póker: P pedir, M me planto, D doblar; al apostar, 1-4 fichas, B borrar y Espacio confirmar.
  // Mientras escribes en el chat no hacen nada.
  const onKey = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) return
    if (myTurn) {
      if (event.code === 'KeyP') hit()
      else if (event.code === 'KeyM') stand()
      else if (event.code === 'KeyD' && canDouble) double()
      return
    }
    if (!canBet) return
    const chip = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[event.code]
    if (chip !== undefined) addChip(CHIPS[chip])
    else if (event.code === 'KeyB' && mine.bet > 0) clearBet()
    else if (event.code === 'Space' || event.code === 'Enter') {
      // Si el foco está en un botón por teclado, se respeta su acción.
      if (event.target instanceof Element && event.target.matches('button:focus-visible')) return
      event.preventDefault()
      if (!broke && mine.bet > 0) confirmBet()
    }
  })

  useEffect(() => {
    const listener = (event) => onKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const players = state.seats.filter(Boolean).length
  const seconds = clock ? ` · ${clock.seconds} s` : ''

  // Estado corto para la banda; el aviso grande de las apuestas va en el centro de la mesa.
  let status = 'Esperando jugadores'
  let wait = null
  if (conn !== 'open') {
    status = 'Conexión perdida. Reconectando…'
    wait = { title: 'Conexión perdida', text: 'Reconectando…' }
  } else if (error) status = error
  else if (betting) {
    status = `Hagan sus apuestas${seconds}`
    if (!mine) {
      status = 'Mirando la mesa'
      wait = { title: 'Mesa abierta', text: 'Siéntate en un asiento libre para jugar, o mira cómo va la ronda.', look: true }
    } else if (broke) {
      status = 'Sin saldo'
      wait = { title: 'Sin saldo por ahora', text: 'Vuelves a tener 15.000 € el domingo a las 23:59.' }
    } else if (mine.locked) {
      wait = {
        title: 'Apuesta lista',
        big: clock ? `${clock.seconds}` : null,
        text: players > 1 ? 'La ronda empieza cuando todos estén listos o se acabe el tiempo.' : 'Se reparte enseguida.',
      }
    } else {
      wait = {
        title: 'Hagan sus apuestas',
        big: clock ? `${clock.seconds}` : null,
        text: players === 1 ? 'Juegas solo contra el crupier. Pon tus fichas y confirma.' : 'Pon tus fichas abajo y confirma la apuesta.',
        invite: players === 1,
      }
    }
  } else if (state.phase === 'playing') {
    const who = state.seats[state.turn]
    status = myTurn ? `Es tu turno: tienes ${mine.total}${seconds}` : `Juega ${who?.name ?? '…'}${seconds}`
  } else if (state.phase === 'dealer') status = 'Juega el crupier…'
  else if (settled) {
    if (mine?.outcome) {
      const net = mine.paid - mine.bet
      status = net > 0 ? `¡Ganas ${eur(net)}!` : net < 0 ? `Pierdes ${eur(-net)}` : 'Empate: recuperas tu apuesta'
    } else status = 'Ronda terminada'
  }

  // Al cobrar: tu celebración y, para el resto de la mesa, un aviso con lo que ganó cada uno.
  const myNet = settled && mine?.outcome ? mine.paid - mine.bet : 0
  const othersWon = useMemo(
    () =>
      settled
        ? state.seats
            .filter((seat) => seat && seat.id !== me?.id && seat.paid > seat.bet)
            .map((seat) => ({
              key: `${state.round}-${seat.id}`,
              name: seat.name,
              amount: seat.paid - seat.bet,
              detail: seat.outcome === 'blackjack' ? 'con blackjack' : '',
            }))
        : [],
    [settled, state.seats, state.round, me?.id],
  )

  // Un solo aviso hablado (cortés) para lo que pasa en la mesa; el turno se anuncia una vez.
  const announce = myTurn ? `Es tu turno. Tienes ${mine.total}.` : log[0] ? plain(log[0]) : ''
  const dealerBust = state.dealerTotal !== null && state.dealerTotal > 21
  const dealerUp = state.dealer.find(Boolean)

  return (
    <main ref={mainRef} className="app bj">
      <header className="top bj-top">
        <h1>Blackjack</h1>
        <p className="bj-room" data-room-code={state.code}>
          <span>{state.label ? 'Mesa pública' : 'Sala'}</span>
          <b>{state.label ?? state.code}</b>
          <small>
            Mínimo {eur(CHIPS[0])}
            {state.spectators > 0 ? ` · ${state.spectators} mirando` : ''}
          </small>
        </p>
        <div className="toggles">
          <Help label="Reglas" title="Blackjack en vivo">
            <p>
              Todos juegan contra el crupier. Pon tus fichas y confirma la apuesta: la ronda empieza cuando todos están
              listos o se acaba el tiempo. En tu turno puedes pedir carta, plantarte o doblar (con dos cartas: doblas la
              apuesta y recibes una sola carta más).
            </p>
            <p>
              Gana quien se acerca más a 21 sin pasarse. El blackjack (as y figura o 10 con las dos primeras) paga 3 a 2; el
              resto de victorias, 1 a 1. El crupier pide hasta 16 y se planta en 17.
            </p>
            {state.label ? (
              <p>Es una mesa pública: cualquiera con cuenta puede sentarse desde el selector de juegos, sin código.</p>
            ) : (
              <p>
                Para invitar a alguien, pásale el código <b>{state.code}</b> y la dirección <b>{location.origin}</b>.
              </p>
            )}
            <p>Juegas con tu saldo de la semana (15.000 €, se reinicia el domingo a las 23:59): cuenta en el Score.</p>
            <p className="hint">
              Teclas: <kbd>1</kbd>–<kbd>4</kbd> fichas · <kbd>B</kbd> borrar · <kbd>Espacio</kbd> apostar · <kbd>P</kbd> pedir ·{' '}
              <kbd>M</kbd> me planto · <kbd>D</kbd> doblar.
            </p>
          </Help>
          <Invite game="blackjack" code={state.code} name="Blackjack" />
          <button type="button" onClick={onLeave}>
            Salir
          </button>
        </div>
      </header>

      <PlayBand log={log} status={status} myTurn={myTurn} mine={mine} />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      <div className="bj-floor fill">
        <section className="bj-stage" aria-label="Mesa de blackjack">
          <div className="bj-table" aria-hidden="true">
            <div className="bj-table__felt" />
          </div>

          <div className="bj-shoe" aria-hidden="true">
            <span className="bj-shoe__box">
              <span className="bj-shoe__cards" style={{ '--left': Math.min(1, state.shoe / 312) }} />
            </span>
            <small>Zapato</small>
          </div>

          <div className={`bj-dealer ${dealerBust ? 'bj-dealer--bust' : ''}`}>
            <p className="bj-dealer__label">
              Crupier
              {state.dealerTotal !== null && (
                <span className={`bj-total ${dealerBust ? 'bj-total--bust' : ''}`}>
                  {state.dealer.includes(null) && dealerUp ? `${state.dealerTotal} + ?` : state.dealerTotal}
                </span>
              )}
            </p>
            <div className="bj-dealer__hand">
              {state.dealer.map((card, i) => (
                <PlayingCard
                  key={`${state.round}-${i}`}
                  rank={card?.rank ?? 'A'}
                  suit={card?.suit ?? 'spades'}
                  down={card === null}
                  index={i}
                />
              ))}
            </div>
          </div>

          <FeltPrint note="El crupier pide hasta 16 y se planta en 17" />

          {wait && !(look && wait.look) ? (
            <div className={`bj-wait ${wait.big ? 'bj-wait--count' : ''}`}>
              <h2>{wait.title}</h2>
              {wait.big && <b className="bj-wait__big">{wait.big}</b>}
              <p>{wait.text}</p>
              {(wait.invite || wait.look) && (
                <div className="bj-wait__actions">
                  {wait.invite && <Invite game="blackjack" code={state.code} name="Blackjack" />}
                  {wait.look && (
                    <>
                      {conn === 'open' && (
                        <button
                          type="button"
                          className="bj-cta"
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
          ) : (
            betting &&
            look &&
            wait?.look && (
              <button type="button" className="bj-wait__pill" onClick={() => setLook(false)}>
                Mirando · ver aviso
              </button>
            )
          )}

          <div className="bj-seats">
            {state.seats.map((seat, i) => (
              <Seat
                key={i}
                bubble={seat ? bubbles?.[seat.id] : undefined}
                seat={seat}
                index={i}
                count={state.seats.length}
                mine={i === mySeat}
                active={state.phase === 'playing' && state.turn === i}
                clock={clock}
                phase={state.phase}
                round={state.round}
                canSit={mySeat < 0 && conn === 'open'}
                canKick={isHost && seat && i !== mySeat && betting}
                onSit={() => send({ t: 'sit', seat: i })}
                onKick={() => send({ t: 'kick', seat: i })}
              />
            ))}
          </div>
        </section>
      </div>

      <footer ref={footRef} className={`bj-foot ${mine ? 'bj-foot--seated' : ''}`}>
        {myTurn ? (
          <div className="bj-bar bj-bar--act" role="group" aria-label="Tu decisión" aria-busy={busy}>
            <p className="bj-bar__hand">
              <small>Tu mano</small>
              <b>{mine.total}</b>
              {dealerUp && <span>contra {state.dealerTotal} del crupier</span>}
            </p>
            <div className="bj-bar__buttons">
              <button type="button" className="bj-btn bj-btn--hit" disabled={busy} onClick={hit}>
                {busy ? 'Enviando…' : <>Pedir <kbd>P</kbd></>}
              </button>
              <button type="button" className="bj-btn bj-btn--stand" disabled={busy} onClick={stand}>
                Me planto <kbd>M</kbd>
              </button>
              <button type="button" className="bj-btn" disabled={!canDouble || busy} onClick={double}>
                Doblar {canDouble && <small>+{eur(mine.bet)}</small>} <kbd>D</kbd>
              </button>
            </div>
          </div>
        ) : canBet ? (
          <div className="bj-bar bj-bar--bet" role="group" aria-label="Tu apuesta">
            <div className="bj-bar__chips" role="group" aria-label="Añadir fichas a la apuesta">
              {CHIPS.map((value, i) => (
                <button
                  key={value}
                  type="button"
                  className={`chip chip--bj${value}`}
                  disabled={busy || mine.bet + value > mine.balance}
                  aria-keyshortcuts={String(i + 1)}
                  title={`Tecla ${i + 1}`}
                  onClick={() => addChip(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="bj-bar__buttons">
              <button type="button" className="bj-btn bj-btn--ghost" disabled={busy || mine.bet === 0} onClick={clearBet}>
                Borrar <kbd>B</kbd>
              </button>
              {!broke && (
                <button type="button" className="bj-btn bj-btn--hit" disabled={busy || mine.bet <= 0} onClick={confirmBet}>
                  {busy ? 'Enviando…' : <>Apostar {eur(mine.bet)} <kbd>Espacio</kbd></>}
                </button>
              )}
              <button type="button" className="bj-btn bj-btn--ghost" disabled={busy} onClick={() => send({ t: 'stand_up' })}>
                Dejar el asiento
              </button>
            </div>
          </div>
        ) : mine ? (
          <div className="bj-bar bj-bar--idle">
            <p className="bj-bar__note">
              {betting
                ? broke
                  ? 'Sin saldo esta semana: el domingo a las 23:59 vuelves a tener 15.000 €.'
                  : `Apuesta lista: ${eur(mine.bet)}. Esperando al resto de la mesa.`
                : mine.cards.length
                  ? state.phase === 'playing'
                    ? `Espera tu turno. Tienes ${mine.total}.`
                    : settled
                      ? 'Ronda terminada. Enseguida se abren las apuestas.'
                      : 'Juega el crupier…'
                  : 'Entras en la próxima ronda.'}
            </p>
            <div className="bj-bar__buttons">
              <button type="button" className="bj-btn bj-btn--ghost" disabled={busy} onClick={() => send({ t: 'stand_up' })}>
                Dejar el asiento
              </button>
            </div>
          </div>
        ) : (
          <div className="bj-bar bj-bar--idle">
            <p className="bj-bar__note">Estás mirando la mesa. Toca «Sentarse» en un asiento libre para jugar.</p>
          </div>
        )}
      </footer>

      {myNet > 0 && (
        <WinBurst
          key={state.round}
          amount={myNet}
          caption={myOutcome === 'blackjack' ? '¡Blackjack!' : `Con ${eur(mine.bet)} de apuesta`}
          coins={Math.min(70, Math.round(24 + (myNet / Math.max(mine.bet, 1)) * 12))}
          big={myOutcome === 'blackjack' || myNet >= 1000}
          who={me?.name}
          tags={myOutcome === 'blackjack' ? ['Blackjack'] : []}
        />
      )}
      <WinToast wins={othersWon} />
      <Chat messages={chat ?? []} me={me} send={send} />
    </main>
  )
}

export default Table
