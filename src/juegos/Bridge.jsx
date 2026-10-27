import { useCallback, useEffect, useRef, useState } from 'react'
import { useEffectEvent } from './useEffectEvent.js'
import {
  CROSS_MS,
  CUT,
  JOIN_MS,
  MAX_STAKE,
  MIN_PLAYERS,
  MIN_STAKE,
  PICK_MS,
  ROUND_MS,
  STAKE_STEP,
  STEPS,
  crossEnd,
  phaseAt,
  revealOf,
  stepStart,
} from './bridge.js'
import { eur } from './money.js'
import {
  buzz,
  isMuted,
  playCash,
  playChip,
  playLose,
  playSplash,
  playStamp,
  playWin,
  setMuted,
} from './sound.js'
import { useCountUp } from './useCountUp.js'
import WinBurst from './WinBurst.jsx'
import Help from './Help.jsx'
import Avatar from './Avatar.jsx'
import './season3.css'
import './Bridge.css'

const JOIN_POLL_MS = 3000
const SHOW_WAIT_MS = 700 // tras cerrar cada elección, lo que se espera para pedir el cristal (el servidor lo suelta a los 600 ms)
const SIDE_NAMES = { L: 'Izquierda', R: 'Derecha' }
const CHIPS = [100, 500, 1000, 2500, 5000] // fichas de entrada rápida
const MAX_PAWNS = 4 // fichas que se dibujan juntas en un panel (el resto, «+n»)
const SHARDS = [0, 1, 2, 3, 4, 5, 6]
const rnd = (i, n) => {
  const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453
  return x - Math.floor(x)
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Ficha de un jugador sobre el puente: salta al llegar y, si cae, gira y se hunde en la niebla.
function Pawn({ p, falling }) {
  return (
    <span
      className={`br-pawn ${p.me ? 'is-me' : ''} ${falling ? 'is-falling' : ''}`}
      title={p.name}
    >
      <span className="br-pawn__body">
        <Avatar name={p.name} src={p.avatar} size={30} />
        {p.me && <b className="br-pawn__tag">TÚ</b>}
      </span>
    </span>
  )
}

// Puente de Cristal en vivo: el servidor guarda quién entra y qué elige, rompe los cristales y reparte el bote.
function Bridge({ onExit, juegos }) {
  const [live, setLive] = useState(null)
  const [stake, setStake] = useState(500)
  const [sending, setSending] = useState(false)
  const [sound, setSound] = useState(() => !isMuted())
  const [burst, setBurst] = useState(null)
  const [hint, setHint] = useState(null) // lado señalado con el ratón en los botones
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const heard = useRef({ round: null, shown: 0, paid: null }) // para que cada sonido suene una vez
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0
  const shownBank = useCountUp(balance)

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const ask = useCallback(
    async message => {
      const sent = Date.now()
      const body = await request({ t: 'bridge', ...message })
      const got = Date.now()
      if (body?.bridge) {
        if (skew.current === null || got - sent < 1500)
          skew.current = body.bridge.now - (sent + got) / 2
        setLive(body.bridge)
      }
      return body
    },
    [request]
  )

  useEffect(() => {
    const timer = setInterval(() => setTick(n => n + 1), 200)
    return () => clearInterval(timer)
  }, [])

  const ready = skew.current !== null && live !== null
  const t = clock()
  const { round, phase, step, pick: picking, offset } = phaseAt(t)
  const view = live?.round === round ? live : null

  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])
  // Peticiones en los momentos justos: al empezar cada paso, al enseñarse cada cristal y al acabar de cruzar.
  useEffect(() => {
    if (!ready) return
    const sync = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    const at = [stepStart(round, 0) + 200]
    for (let k = 0; k < STEPS; k++) at.push(revealOf(round, k) + SHOW_WAIT_MS)
    at.push(crossEnd(round) + SHOW_WAIT_MS + 300, (round + 1) * ROUND_MS + 200)
    const timers = at
      .map(when => when - clock())
      .filter(wait => wait > 0)
      .map(wait => setTimeout(sync, wait))
    const poll = setInterval(() => phaseAt(clock()).phase === 'join' && sync(), JOIN_POLL_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(poll)
    }
  }, [ready, round, ask, clock])

  const potNow = view?.pot ?? 0
  const shownPot = useCountUp(potNow)
  const players = view?.players ?? []
  const me = players.find(p => p.me) ?? null
  const joined = Boolean(view?.joined)
  const shown = view?.shown ?? 0
  const safe = view?.safe ?? []
  const myPick = view?.picks?.[step] ?? null
  const alive = me && !me.fell
  const canPick = ready && joined && alive && phase === 'cross' && picking && step >= shown
  const canJoin = ready && phase === 'join' && !joined && stake <= balance
  const result = view?.result ?? null
  const myLast = live?.last?.round === round ? live.last : null

  // Sonidos: cristal que se rompe (y si caíste tú) y el reparto final.
  useEffect(() => {
    if (!view) return
    const h = heard.current
    if (h.round !== round) heard.current = { round, shown: view.shown, paid: null }
    else if (view.shown > h.shown) {
      h.shown = view.shown
      if (joined && me?.fell && me.reached === view.shown - 1) {
        playSplash()
        buzz([60, 40, 200])
      } else playStamp()
    }
    if (result && heard.current.paid !== round) {
      heard.current.paid = round
      if (myLast?.won && myLast.net > 0) {
        playCash(5)
        playWin(true)
        setBurst({
          id: round,
          amount: myLast.net,
          stake: myLast.stake,
          caption: `Cruzaste ${myLast.reached} de ${STEPS} paneles`,
          tags: myLast.abuse > 0 ? [`Admin Abuse: +${eur(myLast.abuse)}`] : [],
        })
      } else if (myLast && myLast.net < 0) playLose()
    }
  }, [view, round, joined, me, result, myLast])

  async function join() {
    if (!canJoin || sending) return
    setSending(true)
    playChip()
    await ask({ a: 'join', stake })
    setSending(false)
  }
  async function choose(side) {
    if (!canPick || sending) return
    setSending(true)
    playChip()
    await ask({ a: 'pick', step, side })
    setSending(false)
  }

  const onKeys = useEffectEvent(event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') {
      event.preventDefault()
      choose('L')
    } else if (event.code === 'ArrowRight' || event.code === 'ArrowDown') {
      event.preventDefault()
      choose('R')
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const pickLeft = phase === 'cross' && picking ? Math.ceil((revealOf(round, step) - t) / 1000) : 0
  const joinLeft = Math.ceil((JOIN_MS - offset) / 1000)
  let status = 'Conectando con el puente…'
  if (juegos.error) status = juegos.error
  else if (ready && phase === 'join')
    status = joined
      ? `Estás dentro con ${eur(me?.stake ?? 0)}. El puente se abre en ${joinLeft} s.`
      : `Paga la entrada y cruza con los demás. Se cierra en ${joinLeft} s.`
  else if (ready && phase === 'cross') {
    if (!joined)
      status = `Paso ${step + 1} de ${STEPS}. Mira quién cae… y entra en la siguiente partida.`
    else if (!alive)
      status = `Caíste en el paso ${(me?.reached ?? 0) + 1}. Mira hasta dónde llegan los demás.`
    else if (picking)
      status = myPick
        ? `Paso ${step + 1}: vas por la ${SIDE_NAMES[myPick].toLowerCase()}. Puedes cambiar durante ${pickLeft} s.`
        : `Paso ${step + 1}: ¿izquierda o derecha? Tienes ${pickLeft} s (si no, elige el puente).`
    else status = `Paso ${step + 1}: ¿aguanta el cristal…?`
  } else if (ready && phase === 'done') {
    if (!result)
      status = players.length
        ? 'Repartiendo el bote…'
        : 'Nadie cruzó esta vez. La siguiente partida empieza enseguida.'
    else if (result.refund)
      status = `Hacían falta al menos ${MIN_PLAYERS} jugadores: se devuelven las entradas.`
    else {
      const names = result.winners.map(w => w.name).join(', ')
      status = `${names} ${result.winners.length > 1 ? 'llegan' : 'llega'} más lejos (${result.best} de ${STEPS}) y se ${result.winners.length > 1 ? 'reparten' : 'lleva'} ${eur(result.pot * (1 - CUT))}.`
    }
  }

  // Dónde está cada uno: de pie en el último cristal que aguantó (o en la salida o la meta). El que cae solo se ve en el cristal que acaba de romperse.
  const onGlass = (k, side) =>
    players.filter(
      p =>
        p.picks[k] === side &&
        ((p.fell && p.reached === k && k === shown - 1) ||
          (!p.fell && p.reached === k + 1 && p.reached < STEPS))
    )
  const atStart = players.filter(p => !p.fell && p.reached === 0)
  const atGoal = players.filter(p => !p.fell && p.reached === STEPS)
  const pawns = list => (
    <span className="br-who">
      {list.slice(0, MAX_PAWNS).map(p => (
        <Pawn key={p.name} p={p} falling={p.fell} />
      ))}
      {list.length > MAX_PAWNS && <small>+{list.length - MAX_PAWNS}</small>}
    </span>
  )

  // Marcador: ordenados por lo lejos que llegan (los vivos primero a igualdad) y su parte del bote si ganan.
  const ranked = [...players].sort(
    (a, b) =>
      b.reached - a.reached ||
      Number(a.fell) - Number(b.fell) ||
      b.stake - a.stake ||
      a.name.localeCompare(b.name)
  )
  const best = players.reduce((m, p) => Math.max(m, p.reached), 0)
  const pool = potNow * (1 - CUT)
  const prizeOf = new Map((result?.winners ?? []).map(w => [w.name, w.prize]))
  const shareOf = p => {
    if (result) return prizeOf.get(p.name) ?? 0
    if (p.fell && p.reached < best) return 0
    const group = players.filter(q =>
      p.fell ? q.reached === p.reached : !q.fell && q.reached >= p.reached
    )
    const sum = group.reduce((s, q) => s + q.stake, 0)
    return sum ? (pool * p.stake) / sum : 0
  }

  // Han elegido: solo cuenta a los que siguen vivos y se ve quién ya ha elegido, sin decir el lado.
  const living = players.filter(p => !p.fell)
  const chosen = living.filter(p => p.ready).length
  const selecting = phase === 'cross' && picking

  // Cuenta atrás grande: entrada, elección (roja al final), cristal en juego o siguiente partida.
  const dial = { left: 0, num: '…', label: '', hot: false }
  if (ready && phase === 'join')
    Object.assign(dial, {
      left: 1 - offset / JOIN_MS,
      num: joinLeft,
      label: 'entrar',
      hot: joinLeft <= 5,
    })
  else if (ready && phase === 'cross') {
    if (picking)
      Object.assign(dial, {
        left: Math.max(0, (revealOf(round, step) - t) / PICK_MS),
        num: pickLeft,
        label: 'elegir',
        hot: pickLeft <= 1,
      })
    else Object.assign(dial, { label: 'el cristal' })
  } else if (ready) {
    const span = ROUND_MS - JOIN_MS - CROSS_MS
    Object.assign(dial, {
      left: Math.max(0, (ROUND_MS - offset) / span),
      num: Math.ceil((ROUND_MS - offset) / 1000),
      label: 'siguiente',
    })
  }

  const mySharePct = Math.round((stake / (potNow + stake)) * 100)
  const history = live?.history ?? []
  const histMax = Math.max(1, ...history.map(h => h.pot))
  const won = Boolean(myLast?.won && myLast.net > 0)

  return (
    <main className="app s3-app bridge-app">
      <header className="top">
        <h1>El Puente de Cristal</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>Bote</dt>
              <dd>{eur(potNow)}</dd>
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
                Cada {ROUND_MS / 1000} s hay una partida para todos. Durante {JOIN_MS / 1000} s
                pagas la entrada que quieras (de {eur(MIN_STAKE)} a {eur(MAX_STAKE)}). Luego todos
                cruzáis a la vez un puente de {STEPS} paneles.
              </p>
              <p>
                En cada paso tienes {PICK_MS / 1000} s para elegir <b>izquierda</b> o <b>derecha</b>{' '}
                (flechas del teclado o los botones). Un cristal aguanta y el otro se rompe: si
                eliges el roto, caes. Si no eliges a tiempo, el puente elige por ti. Lo que eligen
                los demás no se ve hasta que se rompe el cristal.
              </p>
              <p>
                Los que llegan más lejos se reparten el bote: todo lo que se ha pagado menos un{' '}
                {Math.round(CUT * 100)} % para la casa, cada uno en proporción a su entrada. Si
                todos caen en el mismo paso, se reparte entre todos. Con menos de {MIN_PLAYERS}{' '}
                jugadores se devuelven las entradas.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="s3 fill">
        <section className="s3__stage br" aria-label="El puente">
          <p className={`status ${won ? 'status--win' : ''}`} aria-live="polite">
            {status}
          </p>
          <div
            className={`br-scene is-${phase} ${selecting ? 'is-picking' : ''}`}
            data-hint={hint ?? ''}
          >
            {/* Fondo: abismo con rejilla de neón, focos de luz y niebla */}
            <div className="br-sky" aria-hidden="true">
              <i className="br-abyss" />
              {[0, 1, 2].map(i => (
                <i
                  key={i}
                  className="br-lamp"
                  style={{
                    '--x': `${12 + i * 38}%`,
                    '--d': `${5 + i * 1.7}s`,
                    '--w': `${-i * 1.9}s`,
                  }}
                />
              ))}
              <i className="br-haze br-haze--a" />
              <i className="br-haze br-haze--b" />
            </div>

            {/* Cabecera: bote, paso en curso y cuenta atrás */}
            <div className="br-hud">
              <div className="br-pot">
                <small>Bote</small>
                <b key={potNow}>{eur(shownPot)}</b>
                <span>
                  {plural(players.length, 'jugador', 'jugadores')} · casa {Math.round(CUT * 100)} %
                </span>
              </div>
              <div
                className="br-track"
                role="img"
                aria-label={`Paso ${Math.min(STEPS, Math.max(0, phase === 'cross' ? step + 1 : phase === 'done' ? STEPS : 0))} de ${STEPS}`}
              >
                <small>
                  {phase === 'join'
                    ? 'Se abre el puente'
                    : phase === 'cross'
                      ? `Paso ${step + 1} de ${STEPS}`
                      : 'Fin del cruce'}
                </small>
                <span>
                  {Array.from({ length: STEPS }, (_, k) => (
                    <i
                      key={k}
                      className={
                        k < shown ? 'is-done' : phase === 'cross' && k === step ? 'is-now' : ''
                      }
                    />
                  ))}
                </span>
              </div>
              <div
                className={`br-clock ${dial.hot ? 'is-hot' : ''} ${selecting ? 'is-pick' : ''}`}
                style={{ '--br-left': dial.left }}
              >
                <span key={dial.num}>{dial.num}</span>
                <small>{dial.label}</small>
              </div>
            </div>

            {/* El puente en perspectiva: salida, 8 pares de cristales y meta */}
            <div className="br-world">
              <div className="br-steps" aria-hidden="true">
                <span />
                {Array.from({ length: STEPS }, (_, k) => (
                  <span
                    key={k}
                    className={`${k < shown ? 'is-done' : ''} ${phase === 'cross' && k === step && k >= shown ? 'is-now' : ''}`}
                  >
                    {k + 1}
                  </span>
                ))}
                <span />
              </div>
              <div className="br-deck">
                <div className="br-end br-end--start">
                  <em>Salida</em>
                  {pawns(atStart)}
                </div>
                {Array.from({ length: STEPS }, (_, k) => {
                  const revealed = k < shown
                  const current = phase === 'cross' && k === step && k >= shown
                  const fresh = k === shown - 1
                  return (
                    <div key={k} className={`br-col ${current ? 'is-current' : ''}`}>
                      <span className="br-num">{k + 1}</span>
                      {['L', 'R'].map(side => {
                        const broken = revealed && safe[k] !== side
                        const mine = joined && view?.picks?.[k] === side && !revealed && current
                        return (
                          <div
                            key={side}
                            data-side={side}
                            className={`br-glass ${revealed ? (broken ? 'is-broken' : 'is-safe') : ''} ${broken && fresh ? 'is-fresh' : ''} ${mine ? 'is-mine' : ''}`}
                          >
                            <i className="br-face" />
                            {mine && <b className="br-mark">TÚ</b>}
                            {broken && fresh && (
                              <span className="br-shards" key={`s${round}-${k}`}>
                                <i className="br-flash" />
                                {SHARDS.map(i => (
                                  <i
                                    key={i}
                                    style={{
                                      '--dx': `${(rnd(i, 1) - 0.5) * 90}px`,
                                      '--dy': `${70 + rnd(i, 2) * 90}px`,
                                      '--r': `${(rnd(i, 3) - 0.5) * 900}deg`,
                                      '--x': `${(i % 4) * 25 - 6}%`,
                                      '--y': `${Math.floor(i / 4) * 50 - 10}%`,
                                      '--t': `${rnd(i, 4) * 0.12}s`,
                                    }}
                                  />
                                ))}
                              </span>
                            )}
                            {pawns(onGlass(k, side))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                <div className="br-end br-end--goal">
                  <em>Meta</em>
                  {pawns(atGoal)}
                </div>
              </div>
              <i className="br-fog" aria-hidden="true" />
            </div>

            {/* Abajo: botones y quién ha elegido, sala de espera o reparto; y el marcador en vivo */}
            <div className="br-lower">
              <div className="br-ctrl">
                {phase === 'join' && (
                  <div className="br-room">
                    <h2>Sala de espera</h2>
                    <div className="br-seats">
                      {players.map(p => (
                        <span
                          key={p.name}
                          className={`br-seat ${p.me ? 'is-me' : ''}`}
                          title={p.name}
                        >
                          <Avatar name={p.name} src={p.avatar} size={44} />
                          <small>{p.me ? 'Tú' : p.name}</small>
                        </span>
                      ))}
                      {Array.from(
                        { length: Math.max(0, MIN_PLAYERS + 1 - players.length) },
                        (_, i) => (
                          <span key={`e${i}`} className="br-seat is-empty">
                            <i>?</i>
                            <small>libre</small>
                          </span>
                        )
                      )}
                    </div>
                    <p>
                      {players.length < MIN_PLAYERS
                        ? `Hacen falta ${MIN_PLAYERS} para abrir el puente.`
                        : `${plural(players.length, 'jugador listo', 'jugadores listos')}. Quien llegue más lejos, se lleva el bote.`}
                      {!joined && ' Entra desde el panel.'}
                    </p>
                  </div>
                )}

                {phase === 'cross' && (
                  <>
                    {joined && alive ? (
                      <div className="br-sides">
                        {['L', 'R'].map(side => (
                          <button
                            key={side}
                            type="button"
                            className={`br-side br-side--${side} ${myPick === side ? 'is-on' : ''}`}
                            disabled={!canPick || sending}
                            onClick={() => choose(side)}
                            onPointerEnter={() => setHint(side)}
                            onPointerLeave={() => setHint(null)}
                            onFocus={() => setHint(side)}
                            onBlur={() => setHint(null)}
                          >
                            <span className="br-side__arrow" aria-hidden="true">
                              {side === 'L' ? '◀' : '▶'}
                            </span>
                            <b>{SIDE_NAMES[side]}</b>
                            <small>
                              {myPick === side ? 'Elegida' : `tecla ${side === 'L' ? '←' : '→'}`}
                            </small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="br-spectator">
                        {!joined
                          ? 'Mirando desde la orilla'
                          : `Caíste en el paso ${(me?.reached ?? 0) + 1}`}
                        <small>
                          {!joined
                            ? 'Entra en la siguiente partida.'
                            : 'Mira hasta dónde llegan los demás.'}
                        </small>
                      </p>
                    )}
                    {living.length > 0 && (
                      <div className="br-chosen" aria-live="polite">
                        <p>
                          {selecting ? (
                            <>
                              <b>{chosen}</b> de {living.length}{' '}
                              {chosen === 1 ? 'ha elegido' : 'han elegido'}
                            </>
                          ) : (
                            'Los cristales deciden…'
                          )}
                        </p>
                        <span>
                          {living.map(p => (
                            <span
                              key={p.name}
                              className={`${selecting && p.ready ? 'is-ready' : ''} ${p.me ? 'is-me' : ''}`}
                              title={p.name}
                            >
                              <Avatar name={p.name} src={p.avatar} size={28} />
                              {selecting && p.ready && <b>✓</b>}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {phase === 'done' && (
                  <div className={`br-podium ${won ? 'is-won' : ''}`} key={round}>
                    {!result || result.refund || result.winners.length === 0 ? (
                      <p className="br-spectator">
                        {!result
                          ? players.length
                            ? 'Repartiendo el bote…'
                            : 'Nadie cruzó'
                          : 'Entradas devueltas'}
                        <small>
                          {result?.refund
                            ? `Hacían falta ${MIN_PLAYERS} jugadores.`
                            : 'La siguiente partida empieza enseguida.'}
                        </small>
                      </p>
                    ) : (
                      <>
                        <h2>
                          {won
                            ? '¡Te llevas el bote!'
                            : myLast
                              ? 'Esta vez no ha sido'
                              : 'Reparto del bote'}
                          <small>
                            llegan a {result.best} de {STEPS}
                          </small>
                        </h2>
                        <ol>
                          {result.winners.slice(0, 4).map((w, i) => (
                            <li
                              key={w.name}
                              className={w.name === me?.name ? 'is-me' : ''}
                              style={{
                                '--i': i,
                                '--h': Math.max(
                                  0.35,
                                  w.prize / Math.max(...result.winners.map(x => x.prize))
                                ),
                              }}
                            >
                              <span className="br-crown">{i === 0 ? '👑' : ''}</span>
                              <Avatar name={w.name} src={w.avatar} size={38} />
                              <em>{w.name}</em>
                              <b>{eur(w.prize)}</b>
                              <i className="br-block" />
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="br-board">
                <h2>
                  Marcador
                  <small>{phase === 'done' ? 'final' : 'en vivo'}</small>
                </h2>
                {players.length === 0 ? (
                  <p className="br-empty">Nadie en el puente todavía.</p>
                ) : (
                  <ol style={{ '--n': ranked.length }}>
                    {ranked.map(p => {
                      const i = ranked.indexOf(p)
                      const win = phase === 'done' && prizeOf.has(p.name)
                      return (
                        <li
                          key={p.name}
                          className={`${p.fell ? 'is-fallen' : ''} ${p.me ? 'is-me' : ''} ${win ? 'is-winner' : ''}`}
                          style={{ '--i': i, '--w': p.reached / STEPS }}
                        >
                          <Avatar name={p.name} src={p.avatar} size={24} />
                          <span className="br-board__name">
                            {win && '👑 '}
                            {p.name}
                            <small>entra con {eur(p.stake)}</small>
                          </span>
                          <span className="br-bar" title={`${p.reached} de ${STEPS} paneles`}>
                            <i />
                          </span>
                          <span className="br-board__num">
                            <span>
                              <b>{p.reached}</b>/{STEPS}
                            </span>
                            <small>
                              {p.fell
                                ? 'cayó'
                                : p.reached === STEPS
                                  ? 'meta'
                                  : shareOf(p) > 0
                                    ? `→ ${eur(Math.round(shareOf(p)))}`
                                    : ''}
                            </small>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="s3__panel br-panel">
          <div className="s3__group">
            <h2>{phase === 'join' ? 'Entrada' : 'Partida'}</h2>
            {phase === 'join' && !joined ? (
              <>
                <p className="br-amount" key={stake}>
                  {eur(stake)}
                  <small>Tu parte del bote ahora: {mySharePct} %</small>
                </p>
                <label
                  className="br-slider"
                  style={{ '--p': (stake - MIN_STAKE) / (MAX_STAKE - MIN_STAKE) }}
                >
                  <input
                    type="range"
                    min={MIN_STAKE}
                    max={MAX_STAKE}
                    step={STAKE_STEP}
                    value={stake}
                    aria-label="Entrada"
                    onChange={e => setStake(Number(e.target.value))}
                  />
                </label>
                <div className="br-chips" role="group" aria-label="Entradas rápidas">
                  {CHIPS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`br-chip ${stake === c ? 'is-on' : ''}`}
                      data-v={c}
                      aria-pressed={stake === c}
                      onClick={() => setStake(c)}
                    >
                      <span>{c >= 1000 ? `${c / 1000}k` : c}</span>
                    </button>
                  ))}
                </div>
                <p className="s3__hint">Cuanto más pagas, más parte del bote te llevas si ganas.</p>
              </>
            ) : (
              <p className="br-amount">
                {joined ? eur(me?.stake ?? 0) : 'Mirando'}
                <small>
                  {joined
                    ? `Tienes el ${Math.round(((me?.stake ?? 0) / Math.max(1, potNow)) * 100)} % del bote · `
                    : ''}
                  {plural(players.length, 'jugador', 'jugadores')}
                </small>
              </p>
            )}
          </div>
          <div className="actions s3__actions br-actions">
            <button type="button" className="primary" disabled={!canJoin || sending} onClick={join}>
              {phase !== 'join'
                ? 'Entra en la siguiente'
                : joined
                  ? '¡Dentro!'
                  : stake > balance
                    ? 'No te llega el saldo'
                    : sending
                      ? 'Entrando…'
                      : `Entrar por ${eur(stake)}`}
            </button>
          </div>
          {myLast && (
            <div
              className={`br-last ${myLast.refund ? '' : myLast.net > 0 ? 'is-win' : 'is-lose'}`}
            >
              <small>Tu última partida</small>
              <b>
                {myLast.refund
                  ? 'Entrada devuelta'
                  : myLast.net > 0
                    ? `+${eur(myLast.net)}`
                    : `−${eur(myLast.stake)}`}
              </b>
              <span>
                {myLast.refund
                  ? 'No había rivales suficientes.'
                  : myLast.won
                    ? `Ganaste ${eur(myLast.payout)} (llegaste a ${myLast.reached}).`
                    : `Llegaste a ${myLast.reached} de ${STEPS}.`}
                {myLast.abuse > 0 && ` Admin Abuse: +${eur(myLast.abuse)}.`}
              </span>
            </div>
          )}
          <div className="s3__group">
            <h2>Últimos puentes</h2>
            {history.length === 0 ? (
              <p className="s3__hint">Todavía no ha cruzado nadie esta semana.</p>
            ) : (
              <>
                <div
                  className="br-hist"
                  role="img"
                  aria-label="Hasta dónde llegó el ganador y bote de las últimas partidas"
                >
                  {[...history].reverse().map(h => (
                    <div
                      key={h.round}
                      className={h.refund ? 'is-refund' : h.best === STEPS ? 'is-goal' : ''}
                      title={
                        h.refund
                          ? 'Entradas devueltas'
                          : `Ganó ${h.winners.map(w => w.name).join(', ')} en el ${h.best} · bote ${eur(h.pot)}`
                      }
                    >
                      <span className="br-hist__bars">
                        <i
                          className="is-reach"
                          style={{ '--h': h.refund ? 0.12 : h.best / STEPS }}
                        />
                        <i className="is-pot" style={{ '--h': h.pot / histMax }} />
                      </span>
                      <small>{h.refund ? '↩' : h.best}</small>
                    </div>
                  ))}
                </div>
                <p className="br-legend">
                  <span className="is-reach">Hasta dónde llegó el ganador</span>
                  <span className="is-pot">Bote</span>
                </p>
                <ul className="br-history">
                  {history.map(h => (
                    <li key={h.round}>
                      <span>{h.refund ? '↩' : h.best === STEPS ? '🏁' : '🪟'}</span>
                      <span>
                        {h.refund ? (
                          'Sin rivales: entrada devuelta'
                        ) : (
                          <>
                            <b>{h.winners.map(w => w.name).join(', ')}</b> · {h.best}/{STEPS}
                          </>
                        )}
                        <small>
                          {plural(h.players, 'jugador', 'jugadores')} · bote {eur(h.pot)}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={burst.caption}
          coins={60}
          big={burst.amount >= burst.stake * 3}
          who={juegos.me?.name}
          tags={burst.tags}
        />
      )}
    </main>
  )
}

export default Bridge
