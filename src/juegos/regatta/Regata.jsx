// La Regata en vivo (Season 4): una regata para todos cada 50 s. Antes de cada una sale el parte del viento con las
// probabilidades y cuotas de cada velero (favoritos y desconocidos); se apuesta al que crees que gana. El servidor sortea y
// paga (reglas en regatta.js); aquí se anima la regata con su reloj, así que todos ven lo mismo a la vez.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BETS_MS, BOATS, CHIPS, HOUSE, MAX_TOTAL, N, ROUND_MS, SAIL_MAX_MS, fmtOdds, phaseAt, progress, startOf, totalOf } from './regatta.js'
import { eur } from '../comun/money.js'
import { isMuted, playChip, playLose, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import WinToast from '../comun/WinToast.jsx'
import Help from '../comun/Help.jsx'
import '../roulette/Roulette.css'
import './Regata.css'

const SEND_MS = 350 // las apuestas se mandan un momento después de dejar de tocar las fichas
const LAST_CALL_MS = 4000
const WINNERS_WAIT_MS = 1200
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const pct = (bp) => `${(bp / 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`
const sameBets = (a, b) => a.length === b.length && a.every((x) => b.some((y) => y.boat === x.boat && y.amount === x.amount))
const toList = (picks) =>
  Object.entries(picks)
    .filter(([, amount]) => amount > 0)
    .map(([boat, amount]) => ({ boat: Number(boat), amount }))
    .sort((a, b) => a.boat - b.boat)

// --- Arte ---

function Sailboat({ boat, i }) {
  return (
    <g className="rg-boat__art">
      <path d="M-26 6 L26 6 L18 16 L-18 16 Z" fill={boat.color} stroke="#0a1a30" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-2 4 V-40" stroke="#5a3a1a" strokeWidth="3" />
      <path className="rg-sail" d="M0 -38 Q 22 -16 20 2 L0 2 Z" fill={boat.sail} stroke="#0a1a30" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M-4 -34 Q -18 -14 -16 2 L-4 2 Z" fill={boat.sail} opacity="0.85" stroke="#0a1a30" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="9" cy="-12" r="6.5" fill={boat.color} />
      <text x="9" y="-8.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">
        {i + 1}
      </text>
      <path className="rg-wake" d="M-26 12 Q-40 10 -54 14" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </g>
  )
}

// El campo de regatas: mar al atardecer con la isla al fondo, boyas de salida y llegada y un velero por calle.
// Las posiciones las mueve requestAnimationFrame con el reloj del servidor (sin pasar por React en cada frame).
const W = 900
const H = 420
const START_X = 90
const FINISH_X = 800
const laneY = (i) => 150 + i * 52

function Course({ clock, round, race, mine, winner }) {
  const boats = useRef([])
  const flag = useRef(null)
  const props = useRef(null)
  props.current = { race, round }

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame
    const draw = () => {
      const t = clock()
      const { race: r, round: rd } = props.current
      const ms = r ? t - r.start : -1
      for (let i = 0; i < N; i++) {
        const el = boats.current[i]
        if (!el) continue
        const at = r && ms > 0 ? Math.min(1.1, progress(r.finish[i], r.wobble[i], ms)) : 0
        const x = START_X + at * (FINISH_X - START_X)
        const bob = reduced ? 0 : Math.sin(t / 420 + i * 1.7) * 2.2
        el.setAttribute('transform', `translate(${x.toFixed(1)} ${(laneY(i) + bob).toFixed(1)}) rotate(${reduced ? 0 : (Math.sin(t / 600 + i) * 2).toFixed(2)})`)
      }
      if (flag.current) {
        const done = r && ms >= r.finish[r.winner]
        flag.current.dataset.done = done ? '1' : '0'
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [clock, round])

  return (
    <svg className="rg-course" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="rg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a7a" />
          <stop offset="0.6" stopColor="#ff7a5a" />
          <stop offset="1" stopColor="#ffc35a" />
        </linearGradient>
        <linearGradient id="rg-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1fa2b4" />
          <stop offset="1" stopColor="#0a4a6a" />
        </linearGradient>
      </defs>
      <rect width={W} height="110" fill="url(#rg-sky)" />
      <circle cx="700" cy="104" r="40" fill="#ffe36e" opacity="0.9" />
      {/* La isla con el volcán y palmeras. */}
      <path d="M140 110 Q200 96 250 70 L292 40 Q300 34 308 40 L360 78 Q420 100 480 110 Z" fill="#3a1f55" />
      <path d="M40 110 Q80 98 120 104 Q160 108 180 110 Z" fill="#2a1840" />
      <g stroke="#2a1840" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M420 108 Q424 90 432 78" />
        <path d="M432 78 q-12 -2 -18 6 M432 78 q-4 -10 -14 -12 M432 78 q8 -8 18 -6 M432 78 q12 2 16 12" />
      </g>
      <rect y="110" width={W} height={H - 110} fill="url(#rg-sea)" />
      <g className="rg-waves" stroke="#c8f6ff" strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round">
        {Array.from({ length: 14 }, (_, k) => (
          <path key={k} d={`M${(k * 137) % W} ${128 + ((k * 61) % 270)} q10 -5 20 0 t20 0`} />
        ))}
      </g>
      {/* Calles: cuerdas de boyas. */}
      {Array.from({ length: N + 1 }, (_, i) => (
        <line key={i} x1="40" x2={W - 30} y1={laneY(i) - 26} y2={laneY(i) - 26} stroke="#fff" strokeOpacity="0.14" strokeDasharray="4 10" />
      ))}
      {/* Salida y llegada. */}
      <line x1={START_X} x2={START_X} y1="120" y2={H - 10} stroke="#fff" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="6 6" />
      <g ref={flag} className="rg-finish" data-done="0">
        <line x1={FINISH_X} x2={FINISH_X} y1="120" y2={H - 10} stroke="#ffe36e" strokeWidth="3" strokeDasharray="8 6" />
        <circle cx={FINISH_X} cy="124" r="9" fill="#ff6b5a" stroke="#fff" strokeWidth="2" />
        <circle cx={FINISH_X} cy={H - 14} r="9" fill="#ff6b5a" stroke="#fff" strokeWidth="2" />
      </g>
      {BOATS.map((boat, i) => (
        <g
          key={boat.name}
          ref={(el) => (boats.current[i] = el)}
          className={`rg-boat ${mine.includes(i) ? 'is-mine' : ''} ${winner === i ? 'is-winner' : ''}`}
          transform={`translate(${START_X} ${laneY(i)})`}
        >
          <Sailboat boat={boat} i={i} />
        </g>
      ))}
    </svg>
  )
}

function Countdown({ phase, offset }) {
  const left = phase === 'betting' ? Math.ceil((BETS_MS - offset) / 1000) : 0
  const fraction = phase === 'betting' ? 1 - offset / BETS_MS : 0
  return (
    <div
      className={`countdown countdown--${phase === 'betting' ? 'betting' : 'spinning'} ${phase === 'betting' && left <= LAST_CALL_MS / 1000 ? 'countdown--last' : ''}`}
      style={{ '--left': fraction }}
      aria-hidden="true"
    >
      <span>{phase === 'betting' ? left : '⛵'}</span>
    </div>
  )
}

// La flecha del viento: gira con la dirección del parte.
function WindVane({ dir, knots }) {
  return (
    <span className="rg-wind__vane" style={{ '--dir': `${dir}deg` }} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
        <path d="M20 4 L27 22 L20 18 L13 22 Z" fill="currentColor" />
      </svg>
      <b>{knots} kn</b>
    </span>
  )
}

function Regata({ onExit, juegos }) {
  const [sound, setSound] = useState(() => !isMuted())
  const [live, setLive] = useState(null)
  const [chip, setChip] = useState(50)
  const [picks, setPicks] = useState({}) // { velero: importe } de la ronda en pantalla
  const [picksRound, setPicksRound] = useState(null)
  const [lastPicks, setLastPicks] = useState({}) // lo de la regata anterior, para «Repetir»
  const [sending, setSending] = useState(false)
  const [winners, setWinners] = useState({ round: null, list: [] })
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const { round, offset, phase, sailed } = phaseAt(clock())
  const ready = skew.current !== null

  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'solo_regatta', ...message })
      const got = Date.now()
      if (body?.solo) {
        if (skew.current === null || got - sent < 1500) skew.current = body.solo.now - (sent + got) / 2
        if (body.solo.winners && Number.isSafeInteger(message.winners)) setWinners({ round: message.winners, list: body.solo.winners })
        setLive(body.solo)
      }
      return body
    },
    [request],
  )

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ask])

  // Ronda nueva: lo apostado en la anterior queda para «Repetir».
  useEffect(() => {
    if (!ready || picksRound === round) return
    if (picksRound !== null && toList(picks).length) setLastPicks(picks)
    setPicks({})
    setPicksRound(round)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, round])

  // Al cerrarse las apuestas se pide la regata (ganador y tiempos), y al acabar se cobra y se ve quién ganó.
  const wind = live?.round === round ? live.wind : null
  const race = live?.round === round ? live.race : null
  useEffect(() => {
    if (!ready || phase === 'betting' || race) return
    const timer = setTimeout(() => ask({ a: 'sync' }), 700)
    return () => clearTimeout(timer)
  }, [ready, phase, race, round, ask])
  const endAt = race ? race.start + Math.max(...race.finish) : null
  useEffect(() => {
    if (endAt === null) return
    const wait = endAt + WINNERS_WAIT_MS - clock()
    if (wait < -SAIL_MAX_MS) return
    const timer = setTimeout(() => ask({ a: 'sync', winners: round }), Math.max(0, wait))
    return () => clearTimeout(timer)
  }, [endAt, round, ask, clock])

  // Apuestas que el servidor ya tenía (al entrar o tras recargar).
  const confirmed = live?.round === round ? live.bets : []
  useEffect(() => {
    if (live?.round === round && live.bets.length && !toList(picks).length) {
      setPicks(Object.fromEntries(live.bets.map((b) => [b.boat, b.amount])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.round, live?.bets?.length])

  // Las apuestas se confirman con el servidor poco después de tocarlas.
  const list = toList(picks)
  const dirty = !sameBets(list, confirmed)
  useEffect(() => {
    if (!dirty || phase !== 'betting' || picksRound !== round) return
    const wait = Math.max(0, Math.min(SEND_MS, BETS_MS - offset - 150))
    const timer = setTimeout(async () => {
      setSending(true)
      const body = await ask({ a: 'bet', round, bets: list })
      setSending(false)
      if (!body?.solo) setPicks(Object.fromEntries(confirmed.map((b) => [b.boat, b.amount])))
    }, wait)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, JSON.stringify(list), phase, round, picksRound, ask])

  const stake = totalOf(list)
  const pending = stake - totalOf(confirmed)
  const available = Math.max(0, balance - pending)
  const shownBank = useCountUp(available)
  const betting = ready && phase === 'betting' && picksRound === round
  const raceMs = race ? clock() - race.start : -1
  const finished = race && raceMs >= Math.max(...race.finish)
  const crossed = race && raceMs >= race.finish[race.winner]
  const mine = live?.last && live.last.round === round ? live.last : null
  const won = finished && mine && mine.net > 0
  const players = live?.round === round ? (live.players ?? 0) : 0

  const add = (boat) => {
    if (!betting || chip > available || stake + chip > MAX_TOTAL) return
    playChip()
    setPicks((p) => ({ ...p, [boat]: (p[boat] ?? 0) + chip }))
  }
  const clear = () => betting && setPicks({})
  const double = () => {
    if (!betting || stake === 0 || stake > available || stake * 2 > MAX_TOTAL) return
    setPicks((p) => Object.fromEntries(Object.entries(p).map(([b, a]) => [b, a * 2])))
  }
  const lastTotal = totalOf(toList(lastPicks))
  const canRepeat = betting && stake === 0 && lastTotal > 0 && lastTotal <= available
  const repeat = () => canRepeat && setPicks(lastPicks)

  // Sonidos al acabar.
  const endKey = finished && mine ? round : null
  useEffect(() => {
    if (endKey === null) return
    if (mine.net > 0) playWin(mine.mult >= 6)
    else playLose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endKey])

  const othersWon = useMemo(
    () =>
      winners.list
        .filter((w) => !w.me)
        .map((w) => ({ key: `${winners.round}-${w.name}`, name: w.name, amount: w.amount, detail: 'en la regata' })),
    [winners],
  )

  const top = wind ? Math.max(...wind.bp) : null
  const favorite = wind ? wind.bp.indexOf(top) : null
  let call = 'Conectando…'
  let detail = ''
  if (ready) {
    if (phase === 'betting') {
      call = BETS_MS - offset <= LAST_CALL_MS ? 'Últimas apuestas' : 'Apuesta antes de la salida'
      if (balance === 0 && stake === 0) detail = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a tener 15.000 €.'
      else if (stake > 0) detail = sending || dirty ? `Enviando ${eur(stake)}…` : `Apuestas aceptadas: ${eur(stake)}.`
      else detail = wind ? `${wind.name}: el favorito es ${BOATS[favorite].name} (${fmtOdds(wind.odds[favorite])}). Toca un velero para apostar.` : 'Toca un velero para apostar.'
    } else if (phase === 'horn' || !race) {
      call = '¡Bocina de salida!'
      detail = stake > 0 ? `Juegas ${eur(stake)}.` : 'Mira la regata y apuesta en la siguiente.'
    } else if (!crossed) {
      call = 'Regata en curso'
      detail = stake > 0 ? `Juegas ${eur(stake)}.` : 'Mira la regata y apuesta en la siguiente.'
    } else {
      call = `¡Gana ${BOATS[race.winner].name}!`
      if (mine) detail = mine.net > 0 ? `¡Has ganado ${eur(mine.net)}! Pagaba ${fmtOdds(mine.odds)}.` : `Perdiste ${eur(-mine.net)}.`
      else if (stake > 0) detail = 'Calculando tu premio…'
      else detail = `Pagaba ${fmtOdds(wind?.odds[race.winner] ?? 0)}. Prepárate para la siguiente.`
    }
    if (juegos.error) detail = juegos.error
  }
  const history = live?.history ?? []

  return (
    <main className="app rg-app">
      <header className="top">
        <h1>Regata</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd className={won ? 'money__up' : ''}>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>En juego</dt>
              <dd>{eur(stake)}</dd>
            </div>
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
            <Help className="tg tg--help" title="Cómo se juega a la Regata">
              <p>
                Es en vivo: hay una regata para todos cada {ROUND_MS / 1000} segundos. Durante {BETS_MS / 1000} segundos se apuesta; luego suena la
                bocina y los cinco veleros salen hacia la boya de llegada.
              </p>
              <p>
                Antes de cada regata sale el <b>parte del viento</b>: según sople, unos veleros son favoritos y otros no. Cada uno lleva su
                probabilidad de ganar y su cuota. El favorito gana más a menudo pero paga poco; el que tiene menos opciones paga mucho.
              </p>
              <p>
                Toca un velero para poner la ficha elegida; puedes apostar a varios (hasta {eur(MAX_TOTAL)} por regata). Si gana tu velero, cobras lo
                apostado por su cuota.
              </p>
              <p>
                El ganador lo sortea el servidor con esas mismas probabilidades. Apuestes al que apuestes, de media se recupera el{' '}
                {Math.round(HOUSE * 100)} %. Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="floor fill">
        <section className="side rg-side">
          <div className={`rg-stage ${crossed ? 'is-done' : ''}`}>
            <Course clock={clock} round={round} race={race} mine={list.map((b) => b.boat)} winner={crossed ? race.winner : null} />
            {wind && (
              <div className="rg-wind">
                <WindVane dir={wind.dir} knots={wind.knots} />
                <span>
                  <small>Parte del viento</small>
                  <b>{wind.name}</b>
                </span>
              </div>
            )}
            {crossed && (
              <p className="rg-winner" style={{ '--c': BOATS[race.winner].color }}>
                ¡{BOATS[race.winner].name}!<small>{fmtOdds(wind?.odds[race.winner] ?? 0)}</small>
              </p>
            )}
          </div>
          <div className="recent rg-recent">
            <h2>Últimas regatas</h2>
            {history.length === 0 ? (
              <p>Todavía no ha terminado ninguna.</p>
            ) : (
              <ol>
                {history.slice(0, 12).map((h, i) => (
                  <li key={`${round}-${i}`} style={{ '--c': BOATS[h.boat].color }} title={BOATS[h.boat].name}>
                    <i>{h.boat + 1}</i>
                    {fmtOdds(h.odds)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="play">
          <div className="dealer">
            <Countdown phase={ready ? phase : 'horn'} offset={offset} />
            <p className={`status ${won ? 'status--win' : ''}`} aria-live="polite">
              <strong>{call}</strong>
              {detail && <span>{detail}</span>}
            </p>
            <p className="dealer__players">{players > 0 ? `${plural(players, 'jugador', 'jugadores')} en esta regata` : 'En vivo'}</p>
          </div>

          <ul className="rg-boats" aria-label="Veleros">
            {BOATS.map((boat, i) => {
              const amount = picks[i] ?? 0
              const odds = wind?.odds[i]
              return (
                <li key={boat.name}>
                  <button
                    type="button"
                    className={`rg-pick ${amount > 0 ? 'is-picked' : ''} ${crossed && race.winner === i ? 'is-winner' : ''} ${wind && wind.bp[i] === top ? 'is-fav' : ''}`}
                    style={{ '--c': boat.color }}
                    disabled={!betting || !wind || chip > available}
                    onClick={() => add(i)}
                    aria-label={`${boat.name}: ${odds ? fmtOdds(odds) : ''}${amount ? `, llevas ${eur(amount)}` : ''}`}
                  >
                    <span className="rg-pick__num">{i + 1}</span>
                    <span className="rg-pick__name">
                      <b>{boat.name}</b>
                      <small>{wind ? `${pct(wind.bp[i])} de ganar${wind.bp[i] === top ? ' · favorito' : ''}` : '—'}</small>
                    </span>
                    <span className="rg-pick__odds">{odds ? fmtOdds(odds) : '—'}</span>
                    {amount > 0 && <span className="rg-pick__stake">{eur(amount)}</span>}
                    <span className="rg-pick__bar" style={{ '--p': wind ? wind.bp[i] / 10000 : 0 }} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="controls">
            <div className="chips" role="group" aria-label="Valor de la ficha">
              {CHIPS.map((value) => (
                <button key={value} type="button" className={`chip chip--bj${value}`} aria-pressed={chip === value} disabled={available < value} onClick={() => setChip(value)}>
                  {value}
                </button>
              ))}
            </div>
            <div className="actions">
              {canRepeat ? (
                <button type="button" className="primary" onClick={repeat}>
                  Repetir {eur(lastTotal)}
                </button>
              ) : (
                <button type="button" disabled={!betting || stake === 0 || stake > available || stake * 2 > MAX_TOTAL} onClick={double}>
                  Doblar
                </button>
              )}
              <button type="button" disabled={!betting || stake === 0} onClick={clear}>
                Quitar todo
              </button>
            </div>
          </div>
        </section>
      </div>

      {won && (
        <WinBurst
          key={round}
          amount={mine.net}
          caption={`${BOATS[mine.winner].name} pagaba ${fmtOdds(mine.odds)}`}
          coins={Math.min(70, Math.round(20 + mine.odds / 25))}
          big={mine.odds >= 600}
          who={juegos.me?.name}
          tags={mine.odds >= 900 ? ['¡Ganó el que nadie esperaba!'] : []}
        />
      )}
      <WinToast wins={othersWon} />
    </main>
  )
}

export default Regata
