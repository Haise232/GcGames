import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from './useEffectEvent.js'
import { MIN_BET, MODES, STEP, chance, clampBet, fmtMult, maxBetFor, multAt, payout } from './tower.js'
import { eur } from './money.js'
import { buzz, isMuted, playCash, playChip, playHop, playLand, playSplash, playWin, setMuted } from './sound.js'
import { useCountUp } from './useCountUp.js'
import WinBurst from './WinBurst.jsx'
import Help from './Help.jsx'
import Avatar from './Avatar.jsx'
import './Tower.css'

const STEP_MS = 650 // lo que dura el salto a una baldosa
const FALL_MS = 1500 // lo que se ve la caída antes de volver a empezar
const HISTORY = 12
const MEDALS = ['🥇', '🥈', '🥉']
const SHARDS = 10
const PUFFS = 5
const EMBERS = 16
const BURSTS = 3 // fuegos artificiales al llegar a la cima
const RAYS = 12 // chispas de cada fuego
const ICONS = { facil: '☀️', normal: '🌙', dificil: '⛈️', extremo: '🔥' }
// Pisos de abajo (enredaderas), del medio (cadenas) y de arriba (hielo y nubes).
const zoneOf = (n, floors) => (n / floors <= 0.34 ? 'low' : n / floors <= 0.72 ? 'mid' : 'high')

// Gárgola de las esquinas de la cima (la derecha es la misma, volteada con CSS).
function Gargoyle({ side }) {
  return (
    <svg className={`tw-garg tw-garg--${side}`} viewBox="0 0 40 44" aria-hidden="true">
      <path d="M2 40V26l6-4 2-12 6 6 4-6 4 6 8-2-2 8 6 4v14Z" fill="#5a5578" />
      <path d="M2 40V26l6-4 2-12 6 6 4-6 4 6 8-2-2 8 6 4v14Z" fill="none" stroke="#2a2640" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 26l4 3 4-3" stroke="#2a2640" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="13" cy="21" r="2" fill="#ffd25e" />
      <circle cx="25" cy="21" r="2" fill="#ffd25e" />
    </svg>
  )
}

// La Torre la sortea el servidor con el saldo semanal (cuenta en el Score): cada piso lo pide el jugador y aquí se anima.
function Tower({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [mode, setMode] = useState('normal')
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, mode, floor, path } mientras hay una torre en marcha
  const [asking, setAsking] = useState(false)
  const [reveal, setReveal] = useState(null) // { floor, tile, broken, fell } el piso que se acaba de pisar
  const [last, setLast] = useState(null)
  const [history, setHistory] = useState([])
  const [ranking, setRanking] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null) // { round, extra }: lo que puso el Admin Abuse en la última partida
  const [ready, setReady] = useState(false)
  const lock = useRef(false)
  const view = useRef(null)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && !reveal) setBalance(serverBalance)
  }, [serverBalance, asking, reveal])
  const shownBank = useCountUp(balance)

  const record = (result) => {
    setLast(result)
    setHistory((list) => (list.some((h) => h.id === result.round) ? list : [{ id: result.round, mult: result.net >= 0 ? result.mult : 0 }, ...list].slice(0, HISTORY)))
  }

  const apply = (v) => {
    if (v.ranking) setRanking(v.ranking)
    if (v.bet > 0) {
      setRun({ bet: v.bet, mode: v.mode, floor: v.floor, path: v.path })
      setMode(v.mode)
      setBet(v.bet)
    } else setRun(null)
  }

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_tower', a: 'sync' })
    const v = body?.solo
    if (!v) return
    apply(v)
    if (v.last) record(v.last)
    setBalance(v.balance)
  })
  useEffect(() => {
    let alive = true
    resync().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  // El piso que se acaba de pisar se enseña un momento antes de seguir (o de caer).
  useEffect(() => {
    if (!reveal) return
    const timer = setTimeout(() => setReveal(null), reduced ? 250 : reveal.fell ? FALL_MS : STEP_MS)
    return () => clearTimeout(timer)
  }, [reveal, reduced])

  async function act(message) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_tower', ...message })
    lock.current = false
    setAsking(false)
    const v = body?.solo ?? null
    if (!v) await resync()
    // Lo que puso la banca (Admin Abuse) en esta jugada.
    else if (body.abuse) v.abuse = body.abuse
    return v
  }

  const cfg = MODES[run?.mode ?? mode]
  const shownMode = run?.mode ?? mode
  const floor = run?.floor ?? 0
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const busy = asking || !ready || Boolean(reveal)
  const canBet = !run && !asking && maxBet >= MIN_BET
  const worth = run && floor > 0 ? payout(run.bet, run.mode, floor) : 0
  const liveWorth = useCountUp(worth, 450)
  const pct = Math.round(chance(shownMode) * 100)
  // Sin torre en marcha se ve la última subida (si es de esta dificultad), con la baldosa rota donde caíste.
  const path = run?.path ?? (last?.mode === mode ? (last.path ?? []) : [])

  // Dónde está tu ficha: en la baldosa que acabas de pisar, en la última que aguantó o abajo del todo.
  let pawn = { at: 0, x: 0.5, state: 'idle' }
  if (reveal) pawn = { at: reveal.floor, x: (reveal.tile + 0.5) / cfg.tiles, state: reveal.fell ? 'fall' : 'land' }
  else if (run && floor > 0) pawn = { at: floor, x: (path[floor - 1].tile + 0.5) / cfg.tiles, state: 'stand' }
  else if (!run && last?.net > 0 && last.mode === mode) pawn = { at: last.floor, x: (last.path[last.floor - 1].tile + 0.5) / cfg.tiles, state: 'win' }
  const height = Math.min(1, pawn.at / cfg.floors) // para el cielo: 0 abajo, 1 en la cima
  // Llegaste arriba del todo: fuegos artificiales en la cima.
  const summit = !run && last?.net > 0 && last.mode === mode && last.floor === cfg.floors
  // Racha de subidas cobradas seguidas y récord del día, que se ven dentro de la escena.
  let streak = 0
  for (const h of history) {
    if (h.mult <= 0) break
    streak++
  }
  const best = ranking[0]
  // El piso de esta torre donde llegó el récord del día (si fue en esta dificultad).
  let recFloor = 0
  if (best && best.mode === shownMode) {
    for (let n = 1; n <= cfg.floors; n++) {
      if (multAt(shownMode, n) >= best.mult - 0.005) {
        recFloor = n
        break
      }
    }
  }

  // La cámara sigue a la ficha: su piso queda algo por debajo del centro.
  useLayoutEffect(() => {
    const box = view.current
    if (!box) return
    const target = box.querySelector(pawn.at > 0 ? `[data-floor="${pawn.at}"]` : '.tw-ground')
    if (!target) return
    const top = target.offsetTop + target.offsetHeight / 2 - box.clientHeight * 0.62
    box.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' })
  }, [pawn.at, shownMode, reduced])

  async function start() {
    if (busy || run || shownBet > balance) return
    playChip()
    setBurst(null)
    setLast(null)
    setBank(null)
    const v = await act({ a: 'start', bet: shownBet, mode })
    if (!v) return
    setBalance(v.balance)
    apply(v)
  }

  async function pick(tile) {
    if (busy || !run) return
    const at = run.floor + 1
    playHop(at)
    const v = await act({ a: 'pick', tile })
    if (!v) return
    const fell = v.ev === 'fall'
    setReveal({ floor: at, tile, broken: v.step.broken, fell })
    if (fell) {
      if (v.abuse) setBank({ round: v.last.round, ...v.abuse })
      setTimeout(() => {
        playSplash()
        buzz([40, 40, 160])
      }, reduced ? 0 : 280)
      setRun((r) => (r ? { ...r, path: [...r.path, v.step] } : r))
      setTimeout(
        () => {
          apply(v)
          record(v.last)
          setBalance(v.balance)
        },
        reduced ? 250 : FALL_MS,
      )
      return
    }
    setTimeout(() => playLand(at), reduced ? 0 : 320)
    if (v.ev === 'top') {
      apply(v)
      record(v.last)
      setBalance(v.balance)
      finish(v.last, v.abuse)
    } else apply(v)
  }

  async function cash() {
    if (busy || !run || floor < 1) return
    const v = await act({ a: 'cash' })
    if (!v) return
    apply(v)
    record(v.last)
    setBalance(v.balance)
    finish(v.last, v.abuse)
  }

  function finish(result, abuse) {
    if (abuse) setBank({ round: result.round, ...abuse })
    if (result.net <= 0) return
    playCash(Math.min(10, Math.round(result.mult)))
    playWin(result.mult >= 10)
    buzz([60, 40, 80])
    setBurst({ id: result.round, amount: result.net + (abuse?.extra ?? 0), mult: result.mult, floor: result.floor, extra: abuse?.extra ?? 0 })
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    const n = Number(event.key)
    if (run && n >= 1 && n <= cfg.tiles) {
      event.preventDefault()
      pick(n - 1)
    } else if ((event.code === 'KeyC' || event.code === 'Enter') && run) {
      event.preventDefault()
      cash()
    } else if (event.code === 'Space' && !run && !target?.matches('button:focus-visible')) {
      event.preventDefault()
      start()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  let status = 'Elige dificultad y apuesta, y empieza a subir.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Conectando con la torre…'
  else if (reveal?.fell) {
    status = `¡Crack! La baldosa del piso ${reveal.floor} estaba rota.`
    tone = 'bad'
  } else if (asking && run) status = `Saltando al piso ${floor + 1}…`
  else if (run && floor === 0) status = `Piso 1: elige una de las ${cfg.tiles} baldosas. ${cfg.broken === 1 ? 'Una está rota' : `${cfg.broken} están rotas`}.`
  else if (run) status = `¡Aguanta! Piso ${floor}: llevas ${eur(worth)}. ¿Subes o cobras?`
  else if (last?.net > 0) {
    status = `¡Cobraste ${fmtMult(last.mult)} en el piso ${last.floor}! Ganaste ${eur(last.net + (bank?.round === last.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (last && bank?.round === last.round && bank.extra > 0) status = `Caíste en el piso ${last.floor}, pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (last) {
    status = `Caíste en el piso ${last.floor}. Perdiste ${eur(last.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const floors = Array.from({ length: cfg.floors }, (_, i) => cfg.floors - i)
  const top = multAt(shownMode, cfg.floors)

  return (
    <main className="app tw-app" style={{ '--h': height }}>
      <header className="top">
        <h1>La Torre</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>{run ? 'En juego' : 'Apuesta'}</dt>
              <dd>{eur(shownBet)}</dd>
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
                Elige la dificultad y la apuesta y empieza a subir. En cada piso hay unas baldosas de cristal y alguna está rota:
                toca una (o pulsa su número). Si aguanta, saltas al piso siguiente y tu premio crece; si está rota, caes y pierdes
                la apuesta.
              </p>
              <p>
                Cobras cuando quieras con <b>Cobrar</b> (o <kbd>C</kbd>). Al llegar a la cima cobras solo.
              </p>
              <ul>
                {Object.entries(MODES).map(([id, m]) => (
                  <li key={id}>
                    <b>{m.name}:</b> {m.tiles} baldosas, {m.broken} rota{m.broken > 1 ? 's' : ''}, {m.floors} pisos, hasta {fmtMult(multAt(id, m.floors))}.
                  </li>
                ))}
              </ul>
              <p>
                Las baldosas rotas se sortean en el servidor justo cuando pisas, así que no hay truco: cobres donde cobres, de
                media se recupera el 96 %. Cada día hay una clasificación con el mejor golpe de cada uno. Con el Admin Abuse, la
                banca multiplica lo que ganes o te devuelve lo que pierdas, y tienes más suerte al pisar.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="tw fill">
        <section
          className={`tw-stage tw-env--${shownMode} ${reveal?.fell ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''} ${run ? 'is-run' : ''}`}
          aria-label="La torre"
        >
          <div className="tw-sky" aria-hidden="true">
            <span className="tw-sky__dusk" />
            <span className="tw-sky__night" />
            <span className="tw-sky__space" />
            <span className="tw-stars" />
            <span className="tw-moon" />
            <span className="tw-sun" />
            <span className="tw-cloud tw-cloud--1" />
            <span className="tw-cloud tw-cloud--2" />
            <span className="tw-cloud tw-cloud--3" />
            <span className="tw-storm" />
            <span className="tw-rain" />
            <span className="tw-bolt" />
            <span className="tw-glow" />
            {Array.from({ length: EMBERS }, (_, i) => (
              <span key={i} className="tw-ember" style={{ '--i': i }} />
            ))}
            {/* Season 4: la torre se alza junto a la costa, con el volcán, una palmera y el mar abajo. */}
            <svg className="tw-city" viewBox="0 0 400 80" preserveAspectRatio="none">
              <path d="M0 80V58q30-2 58-8l52-28q12-6 24 0l58 30q30 10 64 6l30-6q20-2 34 2l40 4q20 0 40-4V80Z" />
              <path d="M352 62q-2-16 4-30l3 1q-5 14-3 29Z" />
              <path d="M357 32q-14-6-24 2q12-2 22 2zM357 32q-6-12-18-12q10 4 16 13zM357 32q8-10 20-8q-12 2-18 10zM357 32q14-2 22 8q-10-6-20-6z" />
              <rect className="tw-city__sea" x="0" y="66" width="400" height="14" />
              <path
                className="tw-city__lights"
                d="M30 70h14v1h-14zM90 74h20v1h-20zM160 69h12v1h-12zM230 73h18v1h-18zM300 70h10v1h-10zM350 75h16v1h-16z"
              />
            </svg>
            <span className="tw-wind tw-wind--1" />
            <span className="tw-wind tw-wind--2" />
            <span className="tw-wind tw-wind--3" />
            <span className="tw-vignette" />
          </div>
          {reveal?.fell && <span className="tw-flash" aria-hidden="true" />}

          <p className={`tw-banner ${tone ? `tw-banner--${tone}` : ''}`} aria-live="polite">
            {status}
          </p>

          <div className="tw-view" ref={view}>
            <div className={`tw-tower tw-tower--${shownMode}`} style={{ '--floors': cfg.floors, '--tiles': cfg.tiles }}>
              <div className={`tw-crown ${summit ? 'is-summit' : ''}`}>
                <span className="tw-crown__fx" aria-hidden="true">
                  <span className="tw-crown__rays" />
                </span>
                <svg className="tw-crown__roof" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="tw-gold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#fff0b0" />
                      <stop offset="0.5" stopColor="#ffd25e" />
                      <stop offset="1" stopColor="#b9801a" />
                    </linearGradient>
                  </defs>
                  <path d="M22 64V34L50 4l28 30v30ZM322 64V34l28-30 28 30v30Z" fill="url(#tw-gold)" stroke="#7a5210" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M138 64V42Q138 10 200 10t62 32v22Z" fill="url(#tw-gold)" stroke="#7a5210" strokeWidth="2" />
                  <path d="M200 10V1" stroke="#ffd25e" strokeWidth="3" />
                  <path d="M80 64V48h6v-6h8v6h8v-6h8v6h8v-6h8v6h6v16ZM262 64V48h6v-6h8v6h8v-6h8v6h8v-6h8v6h6v16Z" fill="#4a4466" />
                  <path d="M160 64V44q0-14 40-14t40 14v20Z" fill="#241d12" opacity="0.75" />
                  <path d="M170 64V50q0-9 30-9t30 9v14Z" fill="#ffd25e" opacity="0.35" />
                </svg>
                <svg className="tw-bunting" viewBox="0 0 400 26" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 3Q200 14 400 3" stroke="#e9e1ff" strokeWidth="1.5" fill="none" opacity="0.7" />
                  {Array.from({ length: 11 }, (_, i) => {
                    const x = 14 + i * 37
                    const y = 3 + 8 * Math.sin((Math.PI * (x + 12)) / 400)
                    return <path key={i} d={`M${x} ${y}h22l-11 12Z`} fill={['#ff6b6b', '#ffd25e', '#5ee0a0', '#7aa8ff'][i % 4]} />
                  })}
                </svg>
                <Gargoyle side="l" />
                <Gargoyle side="r" />
                <span className="tw-crown__icon" aria-hidden="true">
                  👑
                </span>
                <span className="tw-crown__text">
                  <b>La cima · {fmtMult(top)}</b>
                  <small>{eur(payout(shownBet, shownMode, cfg.floors))}</small>
                </span>
                <i className="tw-hoard tw-hoard--l" aria-hidden="true" />
                <i className="tw-hoard tw-hoard--r" aria-hidden="true" />
                {summit && (
                  <div className="tw-fw" aria-hidden="true">
                    {Array.from({ length: BURSTS }, (_, b) => (
                      <span key={b} className="tw-fw__burst" style={{ '--b': b }}>
                        {Array.from({ length: RAYS }, (_, r) => (
                          <i key={r} style={{ '--a': `${r * (360 / RAYS)}deg`, '--r': r }} />
                        ))}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {floors.map((n) => {
                const done = path[n - 1]
                const current = run && n === floor + 1 && !reveal
                const shown = reveal?.floor === n ? reveal : done ? { tile: done.tile, broken: done.broken } : null
                const passed = run ? n <= floor : Boolean(done && !done.broken.includes(done.tile))
                const state = current ? 'is-current' : passed ? 'is-done' : n > (run ? floor + 1 : 1) ? 'is-far' : ''
                const zone = zoneOf(n, cfg.floors)
                // Lo que sube el botín si esta baldosa aguanta (y lo que subió al pisarla).
                const before = n > 1 ? payout(shownBet, shownMode, n - 1) : shownBet
                const gain = Math.max(0, payout(shownBet, shownMode, n) - (current && floor > 0 ? worth : before))
                return (
                  <div
                    key={n}
                    data-floor={n}
                    className={`tw-floor tw-floor--${zone} ${n % 2 ? 'tw-floor--tl' : 'tw-floor--tr'} ${n % 3 === 0 ? 'tw-floor--balc' : ''} ${state}`}
                  >
                    <span className="tw-deco" aria-hidden="true">
                      <i className="tw-torch" />
                      {zone === 'low' && (
                        <>
                          <i className="tw-vine tw-vine--a" />
                          <i className="tw-vine tw-vine--b" />
                        </>
                      )}
                      {zone === 'mid' && (
                        <>
                          <i className="tw-chain tw-chain--a" />
                          <i className="tw-chain tw-chain--b" />
                        </>
                      )}
                      {zone === 'high' && (
                        <>
                          <i className="tw-ice" />
                          <i className="tw-wisp" />
                        </>
                      )}
                    </span>
                    <span className="tw-plaque">
                      <small>{n}</small>
                      {fmtMult(multAt(shownMode, n))}
                      {recFloor === n && <em>★ récord</em>}
                    </span>
                    <span className="tw-tiles">
                      {Array.from({ length: cfg.tiles }, (_, t) => {
                        const broke = shown?.broken.includes(t)
                        const mine = shown?.tile === t
                        return (
                          <button
                            key={t}
                            type="button"
                            className={`tw-tile ${shown ? (broke ? 'is-broken' : 'is-safe') : ''} ${mine ? 'is-mine' : ''}`}
                            disabled={!current || busy}
                            onClick={() => pick(t)}
                            aria-label={current ? `Baldosa ${t + 1} del piso ${n}` : `Piso ${n}`}
                          >
                            {current && <kbd>{t + 1}</kbd>}
                            {current && <span className="tw-gain">+{eur(gain)}</span>}
                            {reveal?.floor === n && mine && !broke && <span className="tw-pop">+{eur(gain)}</span>}
                            {mine && broke && (
                              <span className="tw-shards" aria-hidden="true">
                                <em />
                                {Array.from({ length: SHARDS }, (_, i) => (
                                  <i key={i} style={{ '--i': i }} />
                                ))}
                                {Array.from({ length: PUFFS }, (_, i) => (
                                  <b key={i} style={{ '--i': i }} />
                                ))}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </span>
                    <span className="tw-prize">
                      {eur(payout(shownBet, shownMode, n))}
                      {current && (
                        <span className="tw-pips" title={`${cfg.broken} de ${cfg.tiles} rotas`}>
                          <span className="tw-pips__row">
                            {Array.from({ length: cfg.tiles }, (_, t) => (
                              <i key={t} className={t >= cfg.tiles - cfg.broken ? 'is-bad' : ''} />
                            ))}
                          </span>
                          <small>
                            {cfg.broken} rota{cfg.broken > 1 ? 's' : ''} de {cfg.tiles}
                          </small>
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}

              <div className="tw-ground">
                <span className="tw-lamp" aria-hidden="true" />
                Planta baja · {MODES[shownMode].name}
                <span className="tw-lamp" aria-hidden="true" />
              </div>

              <div className={`tw-pawn is-${pawn.state}`} style={{ '--at': pawn.at, '--x': pawn.x }} aria-hidden="true">
                <span key={`${pawn.at}-${pawn.state === 'fall' ? 'f' : pawn.state === 'win' ? 'w' : 'm'}`} className="tw-pawn__act">
                  <span className="tw-pawn__body">
                    <span className="tw-hero">
                      <i className="tw-hero__arm tw-hero__arm--l" />
                      <i className="tw-hero__arm tw-hero__arm--r" />
                      <i className="tw-hero__leg tw-hero__leg--l" />
                      <i className="tw-hero__leg tw-hero__leg--r" />
                      <i className="tw-hero__torso" />
                      <span className="tw-hero__head">
                        <Avatar name={juegos.me?.name ?? 'Tú'} src={juegos.me?.avatar} size={26} />
                      </span>
                    </span>
                  </span>
                  {pawn.at > 0 && pawn.state !== 'fall' && (
                    <span className="tw-dust">
                      {Array.from({ length: 6 }, (_, i) => (
                        <i key={i} style={{ '--i': i }} />
                      ))}
                    </span>
                  )}
                  {pawn.state === 'fall' && <span className="tw-scream">¡Aaah!</span>}
                  {pawn.state === 'win' && (
                    <span className="tw-sparks">
                      {Array.from({ length: 6 }, (_, i) => (
                        <i key={i} style={{ '--i': i }} />
                      ))}
                    </span>
                  )}
                </span>
                <span className="tw-pawn__shadow" />
              </div>
            </div>
          </div>

          <div className="tw-chips">
            <span className="tw-chip">
              <small>Piso</small>
              <b>
                {pawn.at}/{cfg.floors}
              </b>
            </span>
            <span className={`tw-chip ${streak > 0 ? 'is-hot' : ''}`}>
              <small>Racha</small>
              <b>🔥 {streak}</b>
            </span>
            {best && (
              <span className="tw-chip tw-chip--rec">
                <small>Récord hoy</small>
                <b>👑 {fmtMult(best.mult)}</b>
                <em>{best.name}</em>
              </span>
            )}
          </div>

          <div className="tw-alt" aria-hidden="true">
            <span className="tw-alt__bar">
              <span className="tw-alt__fill" />
              <span className="tw-alt__knob" />
            </span>
            <span className="tw-alt__now">{pawn.at > 0 ? fmtMult(multAt(shownMode, pawn.at)) : 'Suelo'}</span>
          </div>
        </section>

        <aside className="tw-panel">
          <div className={`tw-loot ${run && floor > 0 ? 'is-live' : ''}`}>
            {run ? (
              <>
                <small>{floor > 0 ? `Botín en el piso ${floor}` : 'Elige baldosa'}</small>
                <b>{floor > 0 ? eur(liveWorth) : eur(run.bet)}</b>
                <span className="tw-loot__mult">{floor > 0 ? fmtMult(multAt(run.mode, floor)) : 'apostado'}</span>
                <span className="tw-risk">
                  <span>
                    Siguiente: <b>{eur(payout(run.bet, run.mode, floor + 1))}</b>
                  </span>
                  <span className="tw-risk__bar" style={{ '--p': chance(run.mode) }}>
                    <i />
                  </span>
                  <small>{pct} % de que aguante</small>
                </span>
              </>
            ) : (
              <>
                <small>Si llegas a la cima</small>
                <b>{eur(payout(shownBet, mode, MODES[mode].floors))}</b>
                <span className="tw-loot__mult">{fmtMult(multAt(mode, MODES[mode].floors))}</span>
              </>
            )}
          </div>

          <div className="tw-group">
            <h2>Dificultad</h2>
            <div className="tw-modes" role="radiogroup" aria-label="Dificultad">
              {Object.entries(MODES).map(([id, m]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  className={`tw-mode tw-mode--${id}`}
                  disabled={Boolean(run) || asking}
                  onClick={() => setMode(id)}
                >
                  <span className="tw-mode__ico" aria-hidden="true">
                    {ICONS[id]}
                  </span>
                  <span className="tw-mode__tiles" aria-hidden="true">
                    {Array.from({ length: m.tiles }, (_, t) => (
                      <i key={t} className={t >= m.tiles - m.broken ? 'is-bad' : ''} />
                    ))}
                  </span>
                  <b>{m.name}</b>
                  <small>
                    {Math.round(chance(id) * 100)} % · hasta {fmtMult(multAt(id, m.floors))}
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div className="tw-group">
            <h2>Apuesta</h2>
            <div className="tw-bet">
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet - STEP * 5, maxBet))} aria-label="Bajar la apuesta">
                −
              </button>
              <span>{eur(shownBet)}</span>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet + STEP * 5, maxBet))} aria-label="Subir la apuesta">
                +
              </button>
            </div>
            <input
              className="tw-slider"
              type="range"
              min={MIN_BET}
              max={Math.max(maxBet, MIN_BET)}
              step={STEP}
              value={shownBet}
              disabled={!canBet}
              aria-label="Apuesta"
              onChange={(e) => setBet(Number(e.target.value))}
            />
            <div className="tw-quick">
              <button type="button" disabled={!canBet} onClick={() => setBet(MIN_BET)}>
                Mín
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet / 2, maxBet))}>
                ½
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet * 2, maxBet))}>
                ×2
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(maxBet)}>
                Máx
              </button>
            </div>
          </div>

          {!run ? (
            <button type="button" className="tw-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={start}>
              {asking ? 'Empezando…' : 'Empezar a subir'}
              <kbd>Espacio</kbd>
            </button>
          ) : (
            <button type="button" className="tw-go tw-go--cash" disabled={busy || floor < 1} onClick={cash}>
              {floor < 1 ? (
                'Sube al menos un piso'
              ) : (
                <span className="tw-go__cash">
                  <small>Cobrar ahora</small>
                  <b>{eur(liveWorth)}</b>
                </span>
              )}
              <kbd>C</kbd>
            </button>
          )}

          <div className="tw-group">
            <h2>Récord del día</h2>
            {ranking.length === 0 ? (
              <p className="tw-hint">Nadie ha cobrado hoy todavía. ¡El primero se pone arriba!</p>
            ) : (
              <ol className="tw-rank">
                {ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : ''}>
                    <span className="tw-rank__pos">{MEDALS[i] ?? i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={26} />
                    <span className="tw-rank__name">{r.name}</span>
                    <span className="tw-rank__mult">
                      {fmtMult(r.mult)}
                      <small>{MODES[r.mode]?.name ?? ''}</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {history.length > 0 && (
              <ol className="tw-history" aria-label="Últimas partidas">
                {history.map((h) => (
                  <li key={h.id} className={h.mult > 0 ? 'is-win' : 'is-lose'}>
                    {h.mult > 0 ? fmtMult(h.mult) : '✕'}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`${fmtMult(burst.mult)} en el piso ${burst.floor}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 3)}
          big={burst.mult >= 10}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Tower
