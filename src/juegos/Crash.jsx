import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  AUTOS,
  BETS_MS,
  CHIPS,
  FLIGHT_MS,
  HOUSE,
  MAX_MULT,
  ROUND_MS,
  fmtMult,
  initialState,
  isDirty,
  msFor,
  multiplierAt,
  payout,
  phaseAt,
  reducer,
  unconfirmed,
} from './crash.js'
import { eur } from './money.js'
import { isMuted, playBoom, playChip, playLaunch, playWin, setMuted } from './sound.js'
import { useCountUp } from './useCountUp.js'
import WinBurst from './WinBurst.jsx'
import WinToast from './WinToast.jsx'
import Help from './Help.jsx'
import { createScene } from './crashScene.js'
import './Roulette.css'
import './Crash.css'

const SEND_MS = 300 // la apuesta se manda al servidor un momento después de dejar de tocar las fichas
const LAST_CALL_MS = 3000
const POLL_MS = 1000 // si la espera larga falla, se pregunta cada segundo si ya explotó
const WINNERS_WAIT_MS = 1500 // tras la explosión, para preguntar quién retiró (los automáticos ya se han pagado)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
// Color de cada explosión en el historial: el color nunca va solo, también va el número.
const toneOf = (mult) => (mult < 200 ? 'low' : mult < 1000 ? 'mid' : 'high')

// El vuelo dibujado con el reloj del servidor (crashScene.js): todos ven el mismo cohete a la vez.
// boom: dónde explotó esta ronda (null si sigue volando) · auto: tu retiro automático · cashed: donde retiraste
// flags: quién más retiró (tras la explosión) · sub: línea bajo el multiplicador (lo que cobrarías, por ejemplo).
function Sky({ clock, round, boom, auto, cashed, flags, sub, won }) {
  const canvas = useRef(null)
  const box = useRef(null)
  const label = useRef(null)
  const bar = useRef(null)
  const props = useRef(null)
  props.current = { round, boom, auto, cashed, flags }

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = createScene(canvas.current, { reduced })
    const observer = new ResizeObserver(() => scene.resize())
    observer.observe(canvas.current)
    let frame
    let text = ''
    const draw = () => {
      const t = clock()
      const { state, mult, flown } = scene.draw({ t, ...props.current })
      const next = state === 'waiting' ? `${Math.ceil(-flown / 1000)}` : fmtMult(mult)
      if (next !== text) {
        text = next
        label.current.textContent = next
      }
      if (box.current.dataset.state !== state) box.current.dataset.state = state
      // Tramo del multiplicador (color del número): oro, naranja, rosa y violeta.
      const tier = state === 'waiting' ? 'none' : mult < 200 ? 'low' : mult < 500 ? 'mid' : mult < 1000 ? 'high' : 'epic'
      if (box.current.dataset.tier !== tier) box.current.dataset.tier = tier
      bar.current.style.setProperty('--left', state === 'waiting' ? Math.max(0, -flown / BETS_MS) : 0)
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [clock])

  return (
    <div className="sky" ref={box} data-state="waiting">
      <canvas ref={canvas} aria-hidden="true" />
      <div className="sky__readout">
        <span className="sky__kicker" aria-hidden="true">
          <span className="sky__when-waiting">Despega en</span>
          <span className="sky__when-boom">Explotó en</span>
        </span>
        <span className="sky__mult" ref={label} />
        {sub && <span className={`sky__sub ${won ? 'sky__sub--win' : ''}`}>{sub}</span>}
      </div>
      <span className="sky__fuse" ref={bar} aria-hidden="true" />
    </div>
  )
}

// Cuenta atrás de las apuestas: el aro de la ruleta en vivo.
function Countdown({ phase, offset }) {
  const left = phase === 'betting' ? Math.ceil((BETS_MS - offset) / 1000) : 0
  const fraction = phase === 'betting' ? 1 - offset / BETS_MS : 0
  return (
    <div
      className={`countdown countdown--${phase === 'betting' ? 'betting' : 'spinning'} ${phase === 'betting' && left <= LAST_CALL_MS / 1000 ? 'countdown--last' : ''}`}
      style={{ '--left': fraction }}
      aria-hidden="true"
    >
      <span>{phase === 'betting' ? left : '•'}</span>
    </div>
  )
}

// El Cohete en vivo: un multiplicador que sube para todos cada 30 s. El servidor decide dónde explota y paga;
// aquí se apuesta mientras está en tierra y se retira durante el vuelo.
function Crash({ onExit, juegos }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [sound, setSound] = useState(() => !isMuted())
  const [live, setLive] = useState(null) // última respuesta del servidor
  const [sending, setSending] = useState(false)
  const [cashing, setCashing] = useState(false)
  const [winners, setWinners] = useState({ round: null, list: [] })
  const [retry, setRetry] = useState(0)
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0
  const { chip, stake, auto } = state

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const { round, offset, phase, flown } = phaseAt(clock())
  const ready = skew.current !== null

  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'solo_crash', ...message })
      const got = Date.now()
      if (body?.solo) {
        // La diferencia de reloj se mide en el punto medio del viaje (la espera larga no sirve: tarda a propósito).
        if (message.a !== 'wait' && (skew.current === null || got - sent < 1500)) skew.current = body.solo.now - (sent + got) / 2
        if (body.solo.winners && Number.isSafeInteger(message.winners)) setWinners({ round: message.winners, list: body.solo.winners })
        setLive(body.solo)
      }
      return body
    },
    [request],
  )

  // Cuatro veces por segundo: cuenta atrás y cambio de fase (la curva va aparte, a todo ritmo).
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (ready) dispatch({ type: 'ROUND', round })
  }, [ready, round])

  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') ask({ a: 'sync' })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ask])

  // Explosión de esta ronda, si ya se sabe.
  const boom = live?.round === round && live.crash !== null ? live.crash : null
  const exploded = boom !== null && flown >= msFor(boom)

  // Durante el vuelo, una espera larga: el servidor contesta justo cuando explota. Si falla, se pregunta cada segundo.
  const flying = ready && phase !== 'betting' && boom === null
  useEffect(() => {
    if (!flying) return
    let gone = false
    let timer = null
    ask({ a: 'wait' }).then((body) => {
      if (gone || body?.solo?.crash != null) return
      timer = setTimeout(() => setRetry((n) => n + 1), POLL_MS)
    })
    return () => {
      gone = true
      clearTimeout(timer)
    }
  }, [flying, round, retry, ask])

  // Poco después de explotar se pregunta quién retiró, para anunciarlo a todos.
  useEffect(() => {
    if (boom === null) return
    const wait = round * ROUND_MS + BETS_MS + msFor(boom) + WINNERS_WAIT_MS - clock()
    if (wait < 0) return
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') ask({ a: 'sync', winners: round })
    }, wait)
    return () => clearTimeout(timer)
  }, [boom, round, ask, clock])

  // Apuesta que el servidor ya tenía para esta ronda (por ejemplo, tras recargar).
  useEffect(() => {
    if (live) dispatch({ type: 'SERVER', round: live.round, bet: live.bet, auto: live.auto })
  }, [live])

  // La apuesta se confirma con el servidor poco después de tocarla (y al momento si se acaba el tiempo).
  const dirty = isDirty(state)
  useEffect(() => {
    if (!dirty || phase !== 'betting' || state.round !== round) return
    const bet = stake
    const chosen = stake > 0 ? auto : null
    const wait = Math.max(0, Math.min(SEND_MS, BETS_MS - offset - 150))
    const timer = setTimeout(async () => {
      setSending(true)
      const body = await ask({ a: 'bet', round, bet, auto: chosen })
      setSending(false)
      if (body?.solo) dispatch({ type: 'CONFIRMED', round, stake: bet, auto: chosen })
      else dispatch({ type: 'REJECTED', round })
    }, wait)
    return () => clearTimeout(timer)
    // offset cambia cuatro veces por segundo: solo se vuelve a programar si cambia la apuesta o la ronda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, stake, auto, phase, round, state.round, ask])

  const available = Math.max(0, balance - unconfirmed(state))
  const betting = ready && phase === 'betting' && state.round === round
  const inPlay = live?.round === round ? live.bet : 0 // apuesta en el aire (0 si ya retiraste)
  const mine = live?.last && live.last.round === round ? live.last : null
  const shownBank = useCountUp(available)
  const now = flown >= 0 ? (exploded ? boom : multiplierAt(Math.min(flown, FLIGHT_MS))) : 100
  const autoHit = inPlay > 0 && live.auto !== null && boom === null && now >= live.auto
  const canCashout = ready && phase !== 'betting' && !exploded && boom === null && inPlay > 0 && !autoHit && !cashing

  const cashout = useCallback(async () => {
    if (!canCashout) return
    setCashing(true)
    await ask({ a: 'cashout', round })
    setCashing(false)
  }, [canCashout, ask, round])

  // Espacio o Intro para retirar sin buscar el botón.
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, dialog')) return
      if (!canCashout) return
      event.preventDefault()
      cashout()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCashout, cashout])

  // Sonidos: despegue, explosión y premio.
  const launchKey = ready && phase !== 'betting' && flown < 1500 ? round : null
  useEffect(() => {
    if (launchKey !== null) playLaunch()
  }, [launchKey])
  const boomKey = exploded && flown - msFor(boom) < 1500 ? round : null
  useEffect(() => {
    if (boomKey !== null) playBoom()
  }, [boomKey])
  const winKey = mine && mine.net > 0 ? round : null
  useEffect(() => {
    if (winKey !== null) playWin(mine.mult >= 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winKey])

  const crashes = live ? live.history.crashes : []
  const shownCrashes = live && live.history.last === round && !exploded ? crashes.slice(1) : crashes
  const players = live?.round === round ? (live.players ?? 0) : 0
  const broke = balance === 0 && stake === 0
  const canRepeat = betting && stake === 0 && state.last > 0 && state.last <= available
  const won = mine && mine.net > 0
  const othersWon = useMemo(
    () =>
      winners.list
        .filter((w) => !w.me)
        .map((w) => ({ key: `${winners.round}-${w.name}`, name: w.name, amount: w.amount, detail: `en el cohete (${fmtMult(w.mult)})` })),
    [winners],
  )

  // Banderas de quién retiró en esta ronda (llegan poco después de la explosión).
  const flags = useMemo(
    () => (winners.round === round ? winners.list.filter((w) => !w.me && w.mult).map((w) => ({ name: w.name, mult: w.mult })) : []),
    [winners, round],
  )
  let sub = ''
  if (ready && phase !== 'betting') {
    if (mine && mine.net > 0) sub = `Retiraste: +${eur(mine.net)}`
    else if (mine && exploded) sub = `Perdiste ${eur(-mine.net)}`
    else if (autoHit) sub = `Retiro automático: ${eur(payout(inPlay, live.auto))}`
    else if (inPlay > 0 && !exploded) sub = `Cobrarías ${eur(payout(inPlay, now))}`
    else if (exploded && inPlay > 0) sub = `Perdiste ${eur(inPlay)}`
  } else if (ready && stake > 0) sub = `Tu apuesta: ${eur(stake)}`

  let call = 'Conectando…'
  let detail = ''
  if (ready) {
    if (phase === 'betting') {
      call = BETS_MS - offset <= LAST_CALL_MS ? 'Últimas apuestas' : 'Apuesta antes del despegue'
      if (broke) detail = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a tener 15.000 €.'
      else if (stake > 0) {
        const target = auto ? ` · retiro automático a ${fmtMult(auto)}` : ''
        detail = sending || dirty ? `Enviando ${eur(stake)}…` : `Apuesta aceptada: ${eur(stake)}${target}.`
      } else detail = 'Elige una ficha y súmala a tu apuesta.'
    } else if (!exploded) {
      call = boom === null && flown >= FLIGHT_MS ? 'Aterrizando…' : 'En vuelo'
      if (mine) detail = `Retiraste a ${fmtMult(mine.mult)}: +${eur(mine.payout)}.`
      else if (autoHit) detail = `Retiro automático a ${fmtMult(live.auto)}: cobras ${eur(payout(inPlay, live.auto))}.`
      else if (inPlay > 0) detail = `Si retiras ya: ${eur(payout(inPlay, now))}.`
      else detail = 'Mira el vuelo y apuesta en la siguiente ronda.'
    } else {
      call = `Explotó en ${fmtMult(boom)}`
      if (mine) detail = mine.net > 0 ? `¡Has ganado ${eur(mine.net)}! Felicidades.` : `Perdiste ${eur(-mine.net)}.`
      else if (inPlay > 0) detail = `Perdiste ${eur(inPlay)}.`
      else detail = 'Prepárate para la siguiente ronda.'
    }
    if (juegos.error) detail = juegos.error
  }

  return (
    <main className="app crash-live">
      <header className="top">
        <h1>Cohete</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd className={won ? 'money__up' : ''}>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>En juego</dt>
              <dd>{eur(phase === 'betting' ? stake : inPlay)}</dd>
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
            <Help className="tg tg--help" title="Cómo se juega">
              <p>
                Es en vivo: el cohete es el mismo para todos y despega cada 30 segundos. Tienes 10 segundos para apostar; al
                despegar, el multiplicador sube desde 1,00× hasta un máximo de 25×.
              </p>
              <p>
                Pulsa <strong>Retirar</strong> (o la barra espaciadora) antes de que explote y cobras tu apuesta por el
                multiplicador de ese momento. Si explota antes, la pierdes.
              </p>
              <p>
                Con el retiro automático, el servidor retira por ti en cuanto el cohete llega a ese multiplicador, aunque cierres
                la pestaña.
              </p>
              <p>
                Nadie sabe dónde explotará: lo decide el servidor al azar. Retires cuando retires, de media se recupera el{' '}
                {Math.round(HOUSE * 100)} % de lo apostado, y algunas rondas explotan nada más despegar.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="floor fill">
        <section className="side crash__side">
          <Sky
            clock={clock}
            round={round}
            boom={boom}
            auto={inPlay > 0 ? live.auto : mine?.auto ? mine.mult : null}
            cashed={mine && mine.net > 0 ? mine.mult : null}
            flags={flags}
            sub={sub}
            won={Boolean(won || autoHit)}
          />
          <div className="recent crash__recent">
            <h2>Últimas explosiones</h2>
            {shownCrashes.length === 0 ? (
              <p>Todavía no ha despegado ninguno.</p>
            ) : (
              <ol>
                {shownCrashes.slice(0, 14).map((mult, i) => (
                  <li key={`${round}-${i}`} className={`burst burst--${toneOf(mult)}`}>
                    {fmtMult(mult)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="play">
          <div className="dealer">
            <Countdown phase={ready ? phase : 'flight'} offset={offset} />
            <p className={`status ${won ? 'status--win' : ''}`} aria-live="polite">
              <strong>{call}</strong>
              {detail && <span>{detail}</span>}
            </p>
            <p className="dealer__players">{players > 0 ? `${plural(players, 'jugador', 'jugadores')} en este vuelo` : 'En vivo'}</p>
          </div>

          <div className="crash__panel">
            <button
              type="button"
              className={`cashout ${canCashout ? 'cashout--live' : autoHit || won ? 'cashout--done' : mine ? 'cashout--lost' : ''}`}
              disabled={!canCashout}
              onClick={cashout}
            >
              {autoHit ? (
                <>
                  <span>Retirado a {fmtMult(live.auto)}</span>
                  <small>{eur(payout(inPlay, live.auto))}</small>
                </>
              ) : inPlay > 0 && !exploded && phase !== 'betting' ? (
                <>
                  <span>Retirar</span>
                  <small>{eur(payout(inPlay, autoHit ? live.auto : now))}</small>
                </>
              ) : (
                <span>{mine ? (mine.net > 0 ? `Retirado a ${fmtMult(mine.mult)}` : 'Explotó') : phase === 'betting' ? 'Retirar en vuelo' : 'Retirar'}</span>
              )}
            </button>

            <div className="crash__stake">
              <span>Tu apuesta</span>
              <strong>{eur(stake)}</strong>
            </div>

            <fieldset className="crash__auto" disabled={!betting}>
              <legend>Retiro automático</legend>
              <div className="crash__autos">
                <button type="button" aria-pressed={auto === null} onClick={() => dispatch({ type: 'AUTO', auto: null })}>
                  No
                </button>
                {AUTOS.map((value) => (
                  <button key={value} type="button" aria-pressed={auto === value} onClick={() => dispatch({ type: 'AUTO', auto: value })}>
                    {fmtMult(value)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="controls">
            <div className="chips" role="group" aria-label="Valor de la ficha">
              {CHIPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip chip--bj${value}`}
                  aria-pressed={chip === value}
                  disabled={available < value}
                  onClick={() => dispatch({ type: 'SELECT_CHIP', chip: value })}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="actions">
              <button
                type="button"
                className="primary"
                disabled={!betting || broke || chip > available}
                onClick={() => {
                  playChip()
                  dispatch({ type: 'ADD', available })
                }}
              >
                Sumar {chip}
              </button>
              {canRepeat ? (
                <button type="button" onClick={() => dispatch({ type: 'REPEAT', available })}>
                  Repetir {eur(state.last)}
                </button>
              ) : (
                <>
                  <button type="button" disabled={!betting || stake === 0 || stake > available} onClick={() => dispatch({ type: 'DOUBLE', available })}>
                    Doblar
                  </button>
                  <button type="button" disabled={!betting || stake === 0} onClick={() => dispatch({ type: 'CLEAR' })}>
                    Quitar
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* La celebración espera a la explosión: si retiras pronto, sigues viendo el vuelo de los demás. */}
      {won && exploded && (
        <WinBurst
          key={round}
          amount={mine.net}
          caption={`Retiraste a ${fmtMult(mine.mult)}`}
          coins={Math.min(70, Math.round(20 + (mine.mult / 100) * 4))}
          big={mine.mult >= 1000}
          who={juegos.me?.name}
          tags={[mine.auto && 'Retiro automático', mine.mult >= MAX_MULT - 100 && '¡Casi en órbita!'].filter(Boolean)}
        />
      )}
      <WinToast wins={othersWon} />
    </main>
  )
}

export default Crash
