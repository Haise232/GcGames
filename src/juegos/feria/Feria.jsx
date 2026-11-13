import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BOARD,
  CARDS,
  DECIDE_MS,
  DUEL_MS,
  ENTRY,
  FULL_LEVEL,
  GO_BONUS,
  ISLANDS,
  MAX_LEVEL,
  MAX_TAPS,
  MIN_PLAYERS,
  MOVE_MS,
  RENT_MULT,
  ROUNDS,
  ROUND_MODES,
  SEATS,
  SIZE,
  START_CASH,
  TAP_RATE,
  TAX,
  hasIsland,
  layout,
  potOf,
  rentOf,
  upgradeCost,
} from './feria.js'
import { ropeAt } from '../soga/soga.js'
import { Cuerda, TapPad, useTaps } from '../soga/Cuerda.jsx'
import { useEnVivo, useTick } from '../comun/useEnVivo.js'
import { eur } from '../comun/money.js'
import { isMuted, playBeep, playCash, playChip, playGo, playLose, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import './Feria.css'

const TOPIC = 'juegos-feria'
// Un color por asiento (SEATS = 8), bien distintos entre sí sobre el fondo oscuro.
const SEAT_COLORS = ['#ff5a5f', '#3d8cff', '#ffd25e', '#46e0c8', '#b184ff', '#ff8a3c', '#7ccf4a', '#ff7ad9']
const ICON = { salida: '⚓', suerte: '🎟️', tasa: '💸', verbena: '🎉' }
const DICE_MS = 1500 // los dados ruedan
const WALK_MS = MOVE_MS - DICE_MS - 500 // las fichas andan
const POLL_MS = 5000
const IDLE_POLL_MS = 12000
const SHOUT_MS = 250
const LAND = { w: 1000, h: 620, pad: 62, r: 37 }
const PORT = { w: 620, h: 900, pad: 56, r: 33 }

const perras = (n) => `${Math.round(n).toLocaleString('es-ES', { useGrouping: 'always' })} 🪙`
const signed = (n) => `${n >= 0 ? '+' : '−'}${perras(Math.abs(n))}`
const secs = (ms) => Math.max(0, Math.ceil(ms / 1000))
const ordinal = (n) => `${n}.º`
// Duración aproximada de una partida según las rondas (unos 12 s por ronda, contando duelos).
const minutesOf = (rounds) => Math.max(2, Math.round((rounds * 12) / 60))
const tapCap = (ms) => Math.max(0, Math.min(MAX_TAPS, Math.ceil((ms / 1000) * TAP_RATE)))

// Tablero apaisado en pantallas anchas y de pie en el móvil.
function useShape() {
  const query = '(max-width: 760px)'
  const [portrait, setPortrait] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setPortrait(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return useMemo(() => {
    const dims = portrait ? PORT : LAND
    return { ...dims, portrait, cells: layout(dims.w, dims.h, dims.pad) }
  }, [portrait])
}

function Dice({ value, rolling, t }) {
  const face = rolling ? 1 + (Math.floor(t / 90 + value * 7) % 6) : value
  const dots = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[face]
  return (
    <span className={`fe-die ${rolling ? 'is-rolling' : ''}`} role="img" aria-label={rolling ? 'Dado rodando' : `Dado: ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={dots.includes(i + 1) ? 'on' : ''} />
      ))}
    </span>
  )
}

// Las casillas del paseo. Solo cambian con los dueños y los niveles, así que no se repintan con cada cuadro.
const Paseo = memo(function Paseo({ shape, owners, levels, sel, onSel }) {
  const { w, h, r, cells } = shape
  const cx = w / 2
  const cy = h / 2
  return (
    <svg className="fe-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="El paseo de la Feria de las Islas: 28 casillas">
      <path className="fe-path" d={`M${cells.map((c) => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' L')} Z`} />
      {ISLANDS.map((island, k) => {
        // El nombre de la isla, por dentro del paseo, junto a su puesto de en medio.
        const c = cells[k * 4 + 2]
        const d = Math.hypot(cx - c.x, cy - c.y) || 1
        const x = c.x + ((cx - c.x) / d) * (r + 30)
        const y = c.y + ((cy - c.y) / d) * (r + 20)
        return (
          <text key={island.id} className="fe-island" x={x} y={y} fill={island.color} textAnchor={x < cx - 80 ? 'start' : x > cx + 80 ? 'end' : 'middle'}>
            {island.name}
          </text>
        )
      })}
      {BOARD.map((sq) => {
        const c = cells[sq.i]
        const owner = owners?.[sq.i]
        const level = levels?.[sq.i] ?? 0
        const color = sq.kind === 'puesto' ? ISLANDS[sq.island].color : '#8b98ad'
        return (
          <g key={sq.i} className={`fe-sq fe-sq--${sq.kind} ${sel === sq.i ? 'is-sel' : ''}`} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`} onClick={() => onSel(sq.i)}>
            <circle r={r} className="fe-sq__base" />
            {sq.kind === 'puesto' ? (
              <>
                <path d={`M${-r} 0 A${r} ${r} 0 0 1 ${r} 0 Z`} fill={color} opacity={owner === undefined ? 0.9 : 0.5} />
                <text className="fe-sq__name" y={-r * 0.3}>
                  {sq.name}
                </text>
                {owner === undefined ? (
                  <text className="fe-sq__price" y={r * 0.52}>
                    {sq.price}
                  </text>
                ) : (
                  <g transform={`translate(0 ${r * 0.42})`}>
                    {Array.from({ length: level + 1 }, (_, j) => (
                      <rect key={j} x={(j - level / 2) * 11 - 4.5} y={-4.5} width="9" height="9" rx="2.2" fill={SEAT_COLORS[owner]} />
                    ))}
                  </g>
                )}
              </>
            ) : (
              <>
                <text className="fe-sq__icon" y={2}>
                  {ICON[sq.kind]}
                </text>
                <text className="fe-sq__tag" y={r * 0.66}>
                  {sq.name}
                </text>
              </>
            )}
            {/* El borde: del color de la isla si está libre; del color de su dueño, y más gordo, si ya es de alguien. */}
            <circle r={owner === undefined ? r : r - 1.5} className={`fe-sq__ring ${owner === undefined ? '' : 'is-owned'}`} stroke={owner === undefined ? color : SEAT_COLORS[owner]} />
          </g>
        )
      })}
    </svg>
  )
})

// Dónde está una ficha en este instante: quieta en su casilla, o andando de casilla en casilla a saltitos.
function tokenAt(step, rel, cells, fallback) {
  if (!step) return cells[fallback]
  if (rel < DICE_MS) return cells[step.from]
  if (rel >= DICE_MS + WALK_MS) return cells[step.to]
  const f = ((rel - DICE_MS) / WALK_MS) * (step.dice[0] + step.dice[1])
  const k = Math.floor(f)
  const frac = f - k
  const a = cells[(step.from + k) % SIZE]
  const b = cells[(step.from + k + 1) % SIZE]
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac - Math.sin(frac * Math.PI) * 14 }
}

// Qué le ha pasado a un jugador en esta ronda, en una frase.
function eventText(v, seat) {
  const step = v.cur.steps[seat]
  const ev = step.ev
  const sq = BOARD[step.to]
  const you = seat === v.seat
  const who = v.players[seat].name
  const offer = v.cur.offers[seat]
  switch (ev?.k) {
    case 'rent': {
      const owner = ev.to === v.seat ? 'ti' : v.players[ev.to].name
      return you ? `Pagas ${perras(ev.amount)} a ${owner} por ${sq.name}` : `${who} paga ${perras(ev.amount)} a ${owner}`
    }
    case 'buy':
      if (offer?.done) return you ? `Has comprado ${sq.name}` : `${who} compra ${sq.name}`
      if (offer?.passed) return you ? `Dejas pasar ${sq.name}` : `${who} deja pasar ${sq.name}`
      return you ? `${sq.name} está libre` : `${who} cae en ${sq.name}, libre`
    case 'up':
      if (offer?.done) return you ? `Has mejorado ${sq.name}` : `${who} mejora ${sq.name}`
      return you ? `Estás en tu puesto: ${sq.name}` : `${who} visita su puesto`
    case 'home':
      if (you && ev.lock) return `${sq.name}: para el nivel ${FULL_LEVEL} te falta la isla entera`
      return you ? `Estás en tu puesto: ${sq.name}` : `${who} visita su puesto`
    case 'duel':
      return you ? `¡Duelo por ${sq.name}!` : `${who} se juega ${sq.name}`
    case 'card':
      return `${you ? '' : `${who}: `}${CARDS[ev.card].text} (${signed(ev.amount)})`
    case 'tax':
      return you ? `Tasa de la feria: ${signed(-ev.amount)}` : `${who} paga la tasa`
    case 'bote':
      return you ? `¡Verbena! Te llevas el bote: ${signed(ev.amount)}` : `${who} se lleva el bote (${perras(ev.amount)})`
    default:
      return you ? 'Descansas en el Muelle' : `${who} descansa en el Muelle`
  }
}

// Un duelo: la cuerda si son dos, o una barra por cabeza si han caído más en el mismo puesto.
function Duelo({ v, duel, scoreOf, live, more }) {
  const cur = v.cur
  const face = (seat) => ({ name: v.players[seat].name, avatar: v.players[seat].avatar })
  const side = (seat) => ({ name: seat === v.seat ? 'Tú' : v.players[seat].name, color: SEAT_COLORS[seat], faces: [face(seat)], score: scoreOf(duel, seat) })
  const sq = BOARD[duel.sq]
  const winner = cur.resolved ? duel.winner : null
  const best = Math.max(1, ...duel.seats.map((s) => scoreOf(duel, s)))
  return (
    <div className="fe-duel">
      <p className="fe-duel__title">
        <b>{winner === null ? `Duelo por ${sq.name}` : `${winner === v.seat ? 'Te lo quedas' : `${v.players[winner].name} se queda`} ${winner === v.seat ? '' : 'con '}${sq.name}`}</b>
        <span>
          {ISLANDS[sq.island].name} · vale {perras(sq.price)} · el ganador se lo lleva gratis{more > 0 ? ` · y ${more} duelo${more > 1 ? 's' : ''} más` : ''}
        </span>
      </p>
      {duel.seats.length === 2 ? (
        <Cuerda
          pos={ropeAt(scoreOf(duel, duel.seats[0]), scoreOf(duel, duel.seats[1]))}
          left={side(duel.seats[0])}
          right={side(duel.seats[1])}
          pulling={live}
          winner={winner === null ? null : winner === duel.seats[0] ? 'left' : 'right'}
        />
      ) : (
        <ul className="fe-bars">
          {duel.seats.map((seat) => (
            <li key={seat} className={winner === seat ? 'is-win' : ''} style={{ '--c': SEAT_COLORS[seat], '--f': scoreOf(duel, seat) / best }}>
              <Avatar name={v.players[seat].name} src={v.players[seat].avatar} size={26} />
              <span>{seat === v.seat ? 'Tú' : v.players[seat].name}</span>
              <i />
              <b>{scoreOf(duel, seat)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// La clasificación final: puesto, perras en efectivo (lo que decide) y lo que se lleva cada uno.
function Podio({ players, pot }) {
  return (
    <ol className="fe-podio">
      {players.map((p, i) => (
        <li key={i} className={`${p.me ? 'is-me' : ''} ${p.prize > 0 ? 'is-paid' : ''}`}>
          <b>{ordinal(p.place)}</b>
          <Avatar name={p.name} src={p.avatar} size={30} />
          <span>
            {p.me ? 'Tú' : p.name}
            {p.bot && <small>feriante</small>}
          </span>
          <em title={p.cash === undefined ? 'Patrimonio' : `Patrimonio: ${perras(p.worth)}`}>{perras(p.cash ?? p.worth)}</em>
          <strong>{p.prize > 0 ? `+${eur(p.prize)}` : '—'}</strong>
        </li>
      ))}
      {pot > 0 && <li className="fe-podio__pot">Bote para el ganador: {eur(pot)}</li>}
    </ol>
  )
}

function Feria({ onExit, juegos }) {
  const { request } = juegos
  const [sound, setSound] = useState(() => !isMuted())
  const [sending, setSending] = useState(false)
  const [sel, setSel] = useState(null)
  const [pick, setPick] = useState(ROUNDS) // las rondas que pides si eres quien abre la sala
  const peers = useRef(new Map()) // tirones que cuentan los demás navegadores: «partida:ronda:asiento» → n
  const onPeer = useCallback((p) => {
    if (p && Number.isFinite(p.n) && Number.isFinite(p.s)) peers.current.set(`${p.m}:${p.r}:${p.s}`, p.n)
  }, [])
  const { live: v, ready, ask, clock, shout } = useEnVivo(request, 'feria', TOPIC, onPeer)
  const shape = useShape()
  const playing = v?.phase === 'play'
  useTick(playing ? 50 : 250)
  const shownBank = useCountUp(juegos.me?.balance ?? 0)

  const t = clock()
  const cur = playing ? v.cur : null
  const rel = cur ? t - cur.at : 0
  const seated = Boolean(v) && v.seat >= 0
  const myDuel = cur && seated ? (cur.duels.find((d) => d.seats.includes(v.seat)) ?? null) : null
  const duelLive = Boolean(cur?.duels.length) && t >= cur.duelAt && t < cur.duelEnd
  const [taps, tap, tapCount] = useTaps(Boolean(myDuel) && duelLive, cur?.duelAt ?? 0, clock, tapCap)

  // Peticiones en los momentos clave (empieza la partida, se resuelve el duelo, acaba la ronda) y un sondeo de respaldo.
  const startAt = v?.phase === 'lobby' ? v.startAt : null
  const resolveAt = cur && !cur.resolved ? cur.resolveAt : null
  const endAt = cur?.end ?? null
  const busy = playing || Boolean(startAt)
  useEffect(() => {
    if (!ready) return
    const sync = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    const timers = [startAt, resolveAt, endAt]
      .filter(Boolean)
      .map((when) => when - clock() + 120 + Math.random() * 350)
      .map((wait) => setTimeout(sync, Math.max(0, wait)))
    const poll = setInterval(sync, busy ? POLL_MS : IDLE_POLL_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(poll)
    }
  }, [ready, startAt, resolveAt, endAt, busy, ask, clock])

  // Mi duelo: lo que llevo tirado se lo cuento a los demás cada poco, y al servidor a la mitad y al acabar.
  const duelKey = myDuel ? `${v.id}:${v.round}` : null
  const duelAt = cur?.duelAt ?? 0
  useEffect(() => {
    if (!duelKey) return
    const [m, r] = duelKey.split(':').map(Number)
    const now = clock()
    if (now >= duelAt + DUEL_MS + 1200) return
    let last = -1
    const tell = setInterval(() => {
      if (tapCount.current === last) return
      last = tapCount.current
      shout({ m, r, s: v.seat, n: last })
    }, SHOUT_MS)
    const send = () => tapCount.current > 0 && ask({ a: 'tug', r, n: tapCount.current })
    const timers = [duelAt + DUEL_MS / 2, duelAt + DUEL_MS + 120].map((when) => setTimeout(send, Math.max(0, when - now)))
    return () => {
      clearInterval(tell)
      timers.forEach(clearTimeout)
    }
    // v.seat no cambia dentro de una partida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelKey, duelAt, ask, clock, shout, tapCount])

  // Sonidos de la partida: los dados, lo que te pasa al caer, el duelo y el final.
  const cue = useRef('')
  const stage = !cur ? (v?.phase ?? '') : rel < 0 ? 'intro' : rel < DICE_MS ? 'dice' : rel < MOVE_MS ? 'walk' : duelLive ? 'duel' : cur.resolved && cur.duels.length ? 'shown' : 'land'
  const myEv = cur && seated ? cur.steps[v.seat].ev?.k : null
  useEffect(() => {
    const key = `${v?.id}:${v?.round}:${stage}`
    if (cue.current === key) return
    const first = cue.current === ''
    cue.current = key
    if (first || !seated) return
    if (stage === 'dice') playChip()
    else if (stage === 'land') (myEv === 'rent' || myEv === 'tax' ? playLose : myEv === 'bote' ? playCash : playBeep)()
    else if (stage === 'duel' && myDuel) playGo()
    else if (stage === 'shown' && myDuel) (myDuel.winner === v.seat ? playWin : playLose)()
    else if (stage === 'done') ((v.result.find((r) => r.seat === v.seat)?.prize ?? 0) > 0 ? playWin : playLose)()
  }, [v, stage, seated, myEv, myDuel])
  useEffect(() => {
    setSel(null)
    if (peers.current.size > 60) peers.current.clear()
  }, [v?.round])

  const act = async (message, done) => {
    if (sending) return
    setSending(true)
    const body = await ask(message)
    setSending(false)
    if (body && !body.error) done?.()
  }

  // Lo que se enseña mientras las fichas andan es lo de antes de la tirada: nada de adelantar quién paga a quién.
  const hidden = Boolean(cur) && rel < MOVE_MS
  const owners = hidden ? cur.before.owners : v?.owners
  const levels = hidden ? cur.before.levels : v?.levels
  const cashOf = (seat) => (hidden ? cur.before.cash[seat] : v.players[seat].cash)

  // Tirones de un asiento en un duelo: los oficiales cuando ya está resuelto; mientras, lo que se va viendo.
  const scoreOf = (duel, seat) => {
    if (cur.resolved) return duel.taps[seat] ?? 0
    if (seat === v.seat) return taps
    if (v.players[seat].bot) return Math.round((duel.taps[seat] ?? 0) * Math.max(0, Math.min(1, (t - cur.duelAt) / DUEL_MS)))
    return peers.current.get(`${v.id}:${v.round}:${seat}`) ?? duel.taps[seat] ?? 0
  }

  const header = (
    <header className="top">
      <h1>Feria de las Islas</h1>
      <div className="hud">
        <dl className="money">
          <div>
            <dt>Saldo de la semana</dt>
            <dd>{eur(shownBank)}</dd>
          </div>
          {seated && playing && (
            <div>
              <dt>Tus perras</dt>
              <dd>{perras(cashOf(v.seat))}</dd>
            </div>
          )}
        </dl>
        <div className="toggles">
          <button type="button" className="tg tg--back" onClick={onExit}>
            Juegos
          </button>
          <button
            type="button"
            className="tg tg--sound"
            aria-pressed={sound}
            onClick={() => {
              setMuted(sound)
              setSound(!sound)
            }}
          >
            Sonido
          </button>
          <Help className="tg tg--help" title="Cómo se juega a la Feria de las Islas" wide>
            <p>
              Una partida de tablero de <b>
                {MIN_PLAYERS} a {SEATS} personas
              </b>
              , sin bots: si sois dos, jugáis los dos solos. Entrar cuesta <b>{eur(ENTRY)}</b> y <b>el bote entero es para el ganador</b>: {eur(ENTRY)} por cada
              jugador, que se ingresan en su saldo de la semana. La cuenta atrás empieza cuando hay al menos {MIN_PLAYERS}; si sales antes de que empiece, te devolvemos
              la inscripción.
            </p>
            <p>
              Todos empezáis con {perras(START_CASH)} (las perras solo valen dentro de la partida) y jugáis <b>{ROUND_MODES.join(', ').replace(/, (\d+)$/, ' o $1')} rondas a la vez</b>{' '}
              (lo elige quien abre la sala): en cada una se tiran los dados para todos y cada ficha avanza por el paseo, que recorre las siete islas. Cada vez que pasas
              por el Muelle cobras {perras(GO_BONUS)}.
            </p>
            <p>
              <b>Puesto libre.</b> Si caes solo, tienes {DECIDE_MS / 1000} s para comprarlo o dejarlo pasar (la barra marca el tiempo; si todos habéis decidido, la ronda
              sigue sin esperar). Si caéis varios en el mismo, os lo jugáis al <b>Tira y Afloja</b>: {DUEL_MS / 1000} s pulsando sin parar, y quien más tire se lo queda
              gratis.
            </p>
            <p>
              <b>Puesto de otro.</b> Le pagas el alquiler (el 30 % de lo que vale; el doble si tiene los tres de la isla y aún no lo ha mejorado). <b>Tu puesto.</b>{' '}
              Puedes mejorarlo hasta {MAX_LEVEL} veces, cada vez por la mitad de su precio: el alquiler pasa a ×{String(RENT_MULT[1]).replace('.', ',')}, ×
              {String(RENT_MULT[2]).replace('.', ',')} y ×{String(RENT_MULT[3]).replace('.', ',')}. El nivel {FULL_LEVEL} solo se puede con los tres puestos de la isla.
            </p>
            <p>
              <b>Tómbola</b> 🎟️: una papeleta al azar, buena o mala. <b>Tasa</b> 💸: pagas {perras(TAX)} al bote de la feria. <b>Verbena</b> 🎉: te llevas ese bote.
            </p>
            <p>
              Al acabar <b>gana quien tenga más perras en efectivo</b>. Si empatan, el de más patrimonio (perras más lo que valen sus puestos y mejoras); si siguen
              empatados, el bote se reparte a partes iguales.
            </p>
          </Help>
        </div>
      </div>
    </header>
  )

  if (!v) {
    return (
      <main className="app fe-app">
        {header}
        <p className="status">Montando la feria…</p>
      </main>
    )
  }

  // ---------- Sala y final ----------
  if (!playing) {
    const done = v.phase === 'done'
    const lastGame = v.history[0]
    const count = v.players.length
    const left = startAt ? secs(startAt - t) : null
    const final = done ? v.result.map((r) => ({ ...v.players[r.seat], ...r, me: r.seat === v.seat })) : null
    const mine = final?.find((p) => p.me)
    const tied = final ? final.filter((p) => p.prize > 0).length > 1 : false
    // Quien abre la sala (o la siguiente, tras una partida) elige las rondas; luego solo puede cambiarlas el primer asiento.
    const opening = done || count === 0
    const host = !done && v.seat === 0
    const rounds = opening ? pick : (v.rounds ?? ROUNDS)
    const choose = (n) => (opening ? setPick(n) : act({ a: 'rounds', n }))
    // El bote que se enseña es el que se paga: 500 € por cada persona sentada.
    const pot = done ? v.pot : potOf(count)
    return (
      <main className="app fe-app">
        {header}
        <div className="fe-lobby">
          <section className="fe-card fe-room">
            {done ? (
              <>
                <h2>
                  {mine
                    ? mine.prize > 0
                      ? tied
                        ? `¡Empate en cabeza! Te llevas ${eur(mine.prize)}`
                        : `¡Ganas la feria! Te llevas ${eur(mine.prize)}`
                      : `Acabas en el ${ordinal(mine.place)} puesto`
                    : 'Partida terminada'}
                </h2>
                <Podio players={final} pot={v.pot} />
              </>
            ) : (
              <>
                <h2>{count ? (count < MIN_PLAYERS ? 'Esperando a otra persona' : left > 0 ? `Empieza en ${left} s` : 'Empezando…') : 'La sala está vacía'}</h2>
                <p className="fe-room__sub">
                  {count
                    ? count < MIN_PLAYERS
                      ? `${count} de ${SEATS} · la cuenta atrás empieza en cuanto entre alguien más`
                      : `${count} de ${SEATS} · con la sala llena empieza al momento`
                    : `De ${MIN_PLAYERS} a ${SEATS} personas. Quien entra primero elige las rondas.`}
                </p>
                <ul className="fe-seats">
                  {Array.from({ length: SEATS }, (_, i) => {
                    const p = v.players[i]
                    return (
                      <li key={i} className={p ? 'is-on' : ''} style={{ '--c': SEAT_COLORS[i] }}>
                        {p ? <Avatar name={p.name} src={p.avatar} size={44} /> : <i />}
                        <span>{p ? (i === v.seat ? 'Tú' : p.name) : 'Libre'}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            <div className="fe-modes" role="group" aria-label="Rondas de la partida">
              <span>Rondas</span>
              {opening || host ? (
                ROUND_MODES.map((n) => (
                  <button key={n} type="button" className={`fe-mode ${rounds === n ? 'is-on' : ''}`} aria-pressed={rounds === n} disabled={sending} onClick={() => choose(n)}>
                    {n}
                  </button>
                ))
              ) : (
                <b>{rounds}</b>
              )}
              <small>unos {minutesOf(rounds)} min</small>
            </div>
            <div className="fe-room__actions">
              {seated && !done ? (
                <button type="button" className="fe-btn" disabled={sending} onClick={() => act({ a: 'leave' })}>
                  Salir de la sala
                </button>
              ) : (
                <button
                  type="button"
                  className="fe-btn fe-btn--go"
                  disabled={sending || !ready || (!done && count >= SEATS)}
                  onClick={() => act(opening ? { a: 'join', rounds: pick } : { a: 'join' }, playChip)}
                >
                  {done ? 'Jugar otra' : 'Entrar'} · {eur(ENTRY)}
                </button>
              )}
              <span>
                {done ? (
                  <>Bote: {eur(ENTRY)} por jugador, todo para el ganador</>
                ) : (
                  <>
                    Bote para el ganador: <b>{eur(pot)}</b>
                    {count < SEATS ? ` (sube ${eur(ENTRY)} con cada jugador)` : ''}
                  </>
                )}
              </span>
            </div>
          </section>
          <section className="fe-card fe-how">
            <h2>La partida</h2>
            <ul>
              <li>
                De <b>
                  {MIN_PLAYERS} a {SEATS} personas
                </b>
                , sin bots. {ROUND_MODES.join(', ').replace(/, (\d+)$/, ' o $1')} rondas y todos tiráis a la vez.
              </li>
              <li>
                Compra puestos, mejóralos y cobra <b>alquiler</b> a quien caiga. El nivel {FULL_LEVEL}, solo con la isla entera.
              </li>
              <li>
                ¿Dos en el mismo puesto libre? <b>Tira y Afloja</b>: quien más pulse se lo lleva.
              </li>
              <li>
                Gana quien acabe con <b>más perras en efectivo</b> y se lleva <b>el bote entero</b>.
              </li>
            </ul>
            {!done && lastGame && (
              <>
                <h2>Última partida</h2>
                <Podio players={lastGame.players.slice(0, 3)} pot={0} />
              </>
            )}
          </section>
        </div>
      </main>
    )
  }

  // ---------- Partida ----------
  const step = seated ? cur.steps[v.seat] : null
  const offer = seated ? cur.offers[v.seat] : null
  const canTake = Boolean(offer) && !offer.done && !offer.passed && rel >= MOVE_MS && t < cur.end
  const shownDuel = cur.duels.length && rel >= MOVE_MS ? (myDuel ?? cur.duels[0]) : null
  const timeLeft = rel < 0 ? -rel : shownDuel && !cur.resolved ? (t < cur.duelAt ? cur.duelAt - t : Math.max(0, cur.duelEnd - t)) : Math.max(0, cur.end - t)
  // La barra de tiempo: lo que queda de la ventana para decidir (o del duelo). Si todos deciden, la ronda se acorta y la
  // barra salta al final.
  const span =
    rel < MOVE_MS ? 0 : shownDuel && !cur.resolved ? (t < cur.duelAt ? 0 : DUEL_MS) : Object.keys(cur.offers).length && !cur.duels.length ? cur.end - (cur.at + MOVE_MS) : 0
  const bar = span > 0 ? Math.max(0, Math.min(1, timeLeft / span)) : null
  const rounds = v.rounds ?? ROUNDS
  // La clasificación va por perras en efectivo (lo que decide quién gana) y, si empatan, por patrimonio.
  const ranking = v.players
    .map((p, seat) => ({ ...p, seat, cash: cashOf(seat), stalls: Object.values(owners).filter((o) => o === seat).length }))
    .sort((a, b) => (hidden ? 0 : b.cash - a.cash || b.worth - a.worth) || a.seat - b.seat)
  // Fichas que comparten casilla: se abren en abanico para que se vean todas.
  const resting = rel >= DICE_MS + WALK_MS || rel < DICE_MS
  const groups = new Map()
  v.players.forEach((_, seat) => {
    const at = rel < DICE_MS ? cur.steps[seat].from : cur.steps[seat].to
    groups.set(at, [...(groups.get(at) ?? []), seat])
  })
  const selSq = sel === null ? null : BOARD[sel]

  const duelBox = shownDuel && (
    <>
      <Duelo v={v} duel={shownDuel} scoreOf={scoreOf} live={duelLive} more={cur.duels.length - 1} />
      {myDuel && !cur.resolved && <TapPad active={duelLive} onTap={tap} n={taps} idle={t < cur.duelAt ? `${secs(cur.duelAt - t)}` : 'Contando…'} />}
    </>
  )
  let message = null
  if (rel < 0) message = <b>¡Empieza la feria!</b>
  else if (rel < MOVE_MS) message = seated ? null : <span>Tirando los dados…</span>
  else if (seated) message = <b>{eventText(v, v.seat)}</b>
  else message = <span>Estás mirando la partida</span>

  return (
    <main className="app fe-app fe-app--play">
      {header}
      <div className="fe-play">
        <div className="fe-board" style={{ aspectRatio: `${shape.w} / ${shape.h}` }}>
          <Paseo shape={shape} owners={owners} levels={levels} sel={sel} onSel={setSel} />
          <div className="fe-tokens" aria-hidden="true">
            {v.players.map((p, seat) => {
              const pos = tokenAt(cur.steps[seat], rel, shape.cells, p.pos)
              const cell = rel < DICE_MS ? cur.steps[seat].from : cur.steps[seat].to
              const mates = groups.get(cell)
              // La ficha va por fuera del paseo, pegada al borde de su casilla (así no tapa el nombre ni el precio); las
              // que comparten casilla se reparten a lo largo del borde.
              const dx = pos.x - shape.w / 2
              const dy = pos.y - shape.h / 2
              const d = Math.hypot(dx, dy) || 1
              const side = resting ? (mates.indexOf(seat) - (mates.length - 1) / 2) * 22 : 0
              const x = pos.x + (dx / d) * shape.r * 0.92 - (dy / d) * side
              const y = pos.y + (dy / d) * shape.r * 0.92 + (dx / d) * side
              return (
                <span key={seat} className={`fe-token ${seat === v.seat ? 'is-me' : ''}`} style={{ left: `${(x / shape.w) * 100}%`, top: `${(y / shape.h) * 100}%`, '--c': SEAT_COLORS[seat] }}>
                  <Avatar name={p.name} src={p.avatar} size={26} />
                </span>
              )
            })}
          </div>

          <div className="fe-center">
            <p className="fe-round">
              <b>
                Ronda {v.round + 1} de {rounds}
              </b>
              <span>{secs(timeLeft)} s</span>
              {bar !== null && (
                <i className="fe-timebar" role="progressbar" aria-label="Tiempo para decidir" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar * 100)}>
                  <i style={{ transform: `scaleX(${bar})` }} className={bar < 0.3 ? 'is-low' : ''} />
                </i>
              )}
              <em>Bote de la feria: {perras(hidden ? cur.before.bote : v.bote)}</em>
            </p>
            {shownDuel && !shape.portrait ? (
              duelBox
            ) : shownDuel ? (
              <p className="fe-msg">
                <b>¡Duelo por {BOARD[shownDuel.sq].name}!</b>
              </p>
            ) : (
              <>
                {step && rel >= 0 && (
                  <div className="fe-dice">
                    <Dice value={step.dice[0]} rolling={rel < DICE_MS} t={t} />
                    <Dice value={step.dice[1]} rolling={rel < DICE_MS} t={t + 400} />
                    {rel >= DICE_MS && <b>{step.dice[0] + step.dice[1]}</b>}
                  </div>
                )}
                <p className="fe-msg" aria-live="polite">
                  {message}
                  {step?.lap && rel >= MOVE_MS && <small>Pasas por el Muelle: {signed(GO_BONUS)}</small>}
                </p>
                {canTake && (
                  <div className="fe-choice">
                    <button type="button" className="fe-btn fe-btn--go" disabled={sending || cashOf(v.seat) < offer.cost} onClick={() => act({ a: 'take', r: v.round }, playCash)}>
                      {offer.kind === 'buy' ? 'Comprar' : 'Mejorar'} · {perras(offer.cost)}
                    </button>
                    {cashOf(v.seat) >= offer.cost && (
                      <button type="button" className="fe-btn" disabled={sending} onClick={() => act({ a: 'pass', r: v.round })}>
                        Pasar
                      </button>
                    )}
                  </div>
                )}
                {canTake && cashOf(v.seat) < offer.cost && <small className="fe-note">No te llegan las perras</small>}
              </>
            )}
            {selSq && !shownDuel && (
              <p className="fe-info">
                {selSq.kind === 'puesto' ? (
                  <>
                    <b style={{ color: ISLANDS[selSq.island].color }}>{selSq.name}</b> · {ISLANDS[selSq.island].name} · vale {perras(selSq.price)} · alquiler{' '}
                    {perras(rentOf(selSq.i, levels[selSq.i] ?? 0, owners[selSq.i] !== undefined && hasIsland(owners, owners[selSq.i], selSq.island)))}
                    {owners[selSq.i] !== undefined ? ` · de ${owners[selSq.i] === v.seat ? 'ti' : v.players[owners[selSq.i]].name}` : ` · mejora ${perras(upgradeCost(selSq.i))}`}
                  </>
                ) : (
                  <b>{selSq.name}</b>
                )}
              </p>
            )}
          </div>
        </div>
        {/* En el móvil el duelo no cabe dentro del paseo: va en su propia caja, encima del tablero. */}
        {shownDuel && shape.portrait && <div className="fe-duelbox">{duelBox}</div>}

        <aside className="fe-side">
          <ol className="fe-rank" aria-label="Clasificación">
            {ranking.map((p) => (
              <li key={p.seat} className={p.seat === v.seat ? 'is-me' : ''} style={{ '--c': SEAT_COLORS[p.seat] }}>
                <Avatar name={p.name} src={p.avatar} size={28} />
                <span>
                  {p.seat === v.seat ? 'Tú' : p.name}
                  <small>
                    {p.stalls} puesto{p.stalls === 1 ? '' : 's'}
                  </small>
                </span>
                <b>{perras(p.cash)}</b>
              </li>
            ))}
          </ol>
          {rel >= MOVE_MS && (
            <ul className="fe-feed" aria-label="Qué ha pasado en esta ronda">
              {v.players.map((_, seat) => (seat === v.seat ? null : <li key={seat}>{eventText(v, seat)}</li>))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  )
}

export default Feria
