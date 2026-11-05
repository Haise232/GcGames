import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import {
  BASE_FLOORS,
  CREW_MAX,
  MAX_FLOORS,
  MAX_MULT,
  MIN_BET,
  RARITY_FLOORS,
  ROUTES,
  STEP,
  clampBet,
  floorsFor,
  fmtMult,
  maxBetFor,
  multOf,
  payout,
  routeChance,
} from './heist.js'
import { RARITY } from '../gacha/gacha.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playCash, playChip, playLand, playSiren, playSteps, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import GachaCard from '../gacha/GachaCard.jsx'
import './Heist.css'

const HISTORY = 12
const MEDALS = ['🥇', '🥈', '🥉']
// Lo que se lleva cada ruta en la planta: el dibujo de su salida (conducto, puerta o pared con dinamita).
const ROUTE_TEXT = { sigilo: 'Conducto de ventilación', normal: 'Puerta de seguridad', loco: 'Pared con explosivos' }
// Lluvia de botín al huir: posiciones y tipos fijos (sin azar) para que el render sea puro.
const PARTY = Array.from({ length: 26 }, (_, i) => ({ x: (i * 37 + 11) % 100, d: ((i * 53) % 90) / 100, s: 0.8 + ((i * 29) % 50) / 100, kind: ['ingot', 'bill', 'conf', 'conf', 'bill'][i % 5], hue: (i * 47) % 360 }))

// Dibujo de cada ruta. state: '' (cerrada) | 'work' (la estás abriendo) | 'open' (superada) | 'fail' (os pillaron aquí).
function RouteArt({ id, state = '' }) {
  if (id === 'sigilo')
    return (
      <span className={`hs-art hs-art--sigilo ${state && `is-${state}`}`} aria-hidden="true">
        <span className="hs-art__duct">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} style={{ '--i': i }} />
          ))}
        </span>
        <b className="hs-art__dark" />
      </span>
    )
  if (id === 'normal')
    return (
      <span className={`hs-art hs-art--normal ${state && `is-${state}`}`} aria-hidden="true">
        <span className="hs-art__frame">
          <b className="hs-art__dark" />
          <span className="hs-art__door">
            <i />
          </span>
        </span>
        <span className="hs-art__pad">
          <i />
          <i />
          <i />
          <em />
        </span>
      </span>
    )
  return (
    <span className={`hs-art hs-art--loco ${state && `is-${state}`}`} aria-hidden="true">
      <span className="hs-art__wall">
        <b className="hs-art__dark" />
      </span>
      <span className="hs-art__tnt">
        <i />
        <i />
        <i />
        <em />
      </span>
      <span className="hs-art__boom" />
      <span className="hs-art__smoke">
        <i />
        <i />
        <i />
      </span>
    </span>
  )
}

// La banda como personajes: el ladrón (silueta con antifaz) y sus cartas, cada una con su papel.
function Squad({ crew, state, size = 'm' }) {
  return (
    <div className={`hs-squad hs-squad--${size} is-${state}`}>
      <span className="hs-squad__who">
        <span className="hs-thief">
          <i className="hs-thief__head" />
          <i className="hs-thief__body" />
          <i className="hs-thief__bag" />
        </span>
        {crew.map((c) => (
          <figure key={c.id} className="hs-mate" title={`${c.name} · ${c.role}`}>
            <GachaCard card={c} mini />
            <figcaption>{c.role}</figcaption>
          </figure>
        ))}
      </span>
    </div>
  )
}

// El Atraco lo sortea el servidor con el saldo semanal (cuenta en el Score): cada planta la pide el jugador.
function Heist({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [crew, setCrew] = useState([]) // ids de las cartas elegidas para la banda
  const [cards, setCards] = useState([]) // tus cartas del gacha
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, crew, floors, routes, path }
  const [asking, setAsking] = useState(false)
  const [flash, setFlash] = useState(null) // 'ok' | 'caught' tras cada planta
  const [last, setLast] = useState(null)
  const [history, setHistory] = useState([])
  const [ranking, setRanking] = useState([])
  const [burst, setBurst] = useState(null)
  const [pick, setPick] = useState(null) // { route, at }: la ruta que se está abriendo
  const [end, setEnd] = useState(null) // { round, kind }: cómo acabó el último golpe (escape = llegó a la cámara)
  const [party, setParty] = useState(null) // ronda que celebra con lluvia de botín
  const [bank, setBank] = useState(null) // { round, extra, modo }: lo que puso el Admin Abuse en el último golpe
  const [ready, setReady] = useState(false)
  const lock = useRef(false)
  const view = useRef(null)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && !flash) setBalance(serverBalance)
  }, [serverBalance, asking, flash])
  const shownBank = useCountUp(balance)

  const record = (result) => {
    setLast(result)
    setHistory((list) => (list.some((h) => h.id === result.round) ? list : [{ id: result.round, mult: result.net >= 0 ? result.mult : 0 }, ...list].slice(0, HISTORY)))
  }
  const apply = (view) => {
    if (view.ranking) setRanking(view.ranking)
    if (view.cards) setCards(view.cards)
    if (view.bet > 0) {
      setRun({ bet: view.bet, crew: view.crew, floors: view.floors, routes: view.routes, path: view.path })
      setBet(view.bet)
    } else setRun(null)
  }

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_heist', a: 'sync' })
    const view = body?.solo
    if (!view) return
    apply(view)
    if (view.last) record(view.last)
    setBalance(view.balance)
  })
  useEffect(() => {
    let alive = true
    resync().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => {
      setFlash(null)
      setPick(null)
    }, reduced ? 250 : flash === 'caught' ? 1600 : 900)
    return () => clearTimeout(timer)
  }, [flash, reduced])

  // La fiesta de botín dura unos segundos.
  useEffect(() => {
    if (!party) return
    const timer = setTimeout(() => setParty(null), reduced ? 600 : 4800)
    return () => clearTimeout(timer)
  }, [party, reduced])

  async function act(message) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_heist', ...message })
    lock.current = false
    setAsking(false)
    const view = body?.solo ?? null
    if (!view) await resync()
    // Lo que puso la banca (Admin Abuse) en esta jugada.
    else if (body.abuse) view.abuse = body.abuse
    return view
  }

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const chosen = crew.map((id) => byId.get(id)).filter(Boolean)
  const plannedFloors = floorsFor(chosen.map((c) => c.rarity))
  const floors = run?.floors ?? plannedFloors
  const routes = run?.routes ?? []
  const depth = routes.length
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const busy = asking || !ready || Boolean(flash)
  const canBet = !run && !asking && maxBet >= MIN_BET
  const worth = run && depth ? payout(run.bet, routes) : 0
  const mult = multOf(routes)
  // Riesgo acumulado: la probabilidad de que te hubieran pillado ya con las rutas que llevas.
  const survived = routes.reduce((p, r) => p * routeChance(r), 1)
  const alarm = run ? Math.round((1 - survived) * 100) : 0
  const crewShown = run ? run.crew : chosen

  function toggle(id) {
    if (run) return
    setCrew((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= CREW_MAX ? list : [...list, id]))
  }

  async function start() {
    if (busy || run || shownBet > balance) return
    playChip()
    setBurst(null)
    setLast(null)
    const view = await act({ a: 'start', bet: shownBet, crew })
    if (!view) return
    setBalance(view.balance)
    apply(view)
    playSteps()
  }

  async function go(route) {
    if (busy || !run) return
    setPick({ route, at: depth + 1 })
    const view = await act({ a: 'go', route })
    if (!view) {
      setPick(null)
      return
    }
    if (view.ev === 'caught') {
      if (view.abuse) setBank({ round: view.last.round, ...view.abuse })
      setFlash('caught')
      setEnd({ round: view.last.round, kind: 'caught' })
      if (!isMuted()) playSiren()
      buzz([80, 60, 200])
      setRun((r) => (r ? { ...r, path: [...r.path, { route, ok: false }] } : r))
      setTimeout(() => {
        apply(view)
        record(view.last)
        setBalance(view.balance)
      }, reduced ? 250 : 1600)
      return
    }
    setFlash('ok')
    playLand(view.routes?.length ?? depth + 1)
    // Un momento para ver cómo se abre la ruta antes de que la banda baje a la planta siguiente.
    setTimeout(() => {
      apply(view)
      if (view.ev === 'escape') {
        record(view.last)
        setBalance(view.balance)
        setEnd({ round: view.last.round, kind: 'escape' })
        finish(view.last, view.abuse)
      }
    }, reduced ? 100 : 700)
  }

  async function cash() {
    if (busy || !run || !depth) return
    const view = await act({ a: 'cash' })
    if (!view) return
    apply(view)
    record(view.last)
    setBalance(view.balance)
    setEnd({ round: view.last.round, kind: 'cash' })
    finish(view.last, view.abuse)
  }

  function finish(result, abuse) {
    if (abuse) setBank({ round: result.round, ...abuse })
    if (result.net <= 0) return
    setParty(result.round)
    playCash(Math.min(10, Math.round(result.mult)))
    playWin(result.mult >= 10)
    buzz([60, 40, 80])
    setBurst({ id: result.round, amount: result.net + (abuse?.extra ?? 0), mult: result.mult, floor: result.floor, extra: abuse?.extra ?? 0 })
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    const keys = { 1: 'sigilo', 2: 'normal', 3: 'loco' }
    if (run && keys[event.key]) {
      event.preventDefault()
      go(keys[event.key])
    } else if ((event.code === 'KeyC' || event.code === 'Enter') && run) {
      event.preventDefault()
      cash()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  let status = 'Elige tu banda y tu apuesta, y da el golpe.'
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Preparando el plan…'
  else if (flash === 'caught') status = `🚨 ¡Os han pillado en la planta ${depth + 1}! La policía se queda con todo.`
  else if (asking && run) status = `Bajando a la planta ${depth + 1}…`
  else if (run && !depth) status = 'Estáis dentro. Elige por dónde bajáis a la planta 1.'
  else if (run) status = `Planta ${depth} limpia: ${eur(worth)} en la bolsa. ¿Bajáis más o huis?`
  else if (last?.net > 0) status = `¡Golpe perfecto! Huisteis con ${fmtMult(last.mult)}: ganaste ${eur(last.net)}.`
  else if (last && bank?.round === last.round && bank.extra > 0) status = `Os pillaron en la planta ${last.floor}, pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (last) status = `Os pillaron en la planta ${last.floor}. Perdiste ${eur(last.stake)}.`
  else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const levels = Array.from({ length: MAX_FLOORS }, (_, i) => i + 1)
  // Sin atraco en marcha se ve el último: por dónde bajasteis y dónde os pillaron.
  const path = run?.path ?? last?.path ?? []
  const trail = run ? routes : path.filter((p) => p.ok).map((p) => p.route)
  const kind = run || !last ? null : end?.round === last.round ? end.kind : last.net > 0 ? 'cash' : 'caught'
  const openFloors = Math.max(floors, kind === 'caught' ? (last?.floor ?? 0) + 1 : 0)
  const caughtNow = Boolean(run && flash === 'caught')

  // Dónde está la banda: en la planta que intenta cruzar, en la azotea (huida), en la cámara (escape) o atrapada.
  let at = 'roof'
  let mode = 'idle'
  if (run) {
    at = depth + 1
    mode = caughtNow ? 'caught' : pick?.at === at ? 'work' : 'idle'
  } else if (kind === 'caught') {
    at = (last?.floor ?? 0) + 1
    mode = 'caught'
  } else if (kind === 'escape') {
    at = 'vault'
    mode = 'win'
  } else if (kind === 'cash') mode = 'win'
  const siren = caughtNow
  const busted = kind === 'caught' && !run

  // La cámara sigue a la banda: su planta queda a media altura.
  useLayoutEffect(() => {
    const box = view.current
    const target = box?.querySelector(`[data-at="${at}"]`)
    if (!box || !target) return
    const b = box.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    const top = t.top - b.top + box.scrollTop + t.height / 2 - box.clientHeight * 0.56
    box.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' })
  }, [at, reduced])

  const shownWorth = useCountUp(run ? worth : 0)
  const grow = 1 + Math.min(1, Math.log(mult + 1) / Math.log(MAX_MULT + 1)) * 0.9 // la bolsa crece con el botín
  const level = alarm >= 75 ? 2 : alarm >= 40 ? 1 : 0
  const isOpenVault = kind === 'escape'
  const squad = (size) => <Squad crew={crewShown} state={mode} size={size} />

  return (
    <main className="app hs-app" data-alarm={level}>
      <header className="top">
        <h1>El Atraco</h1>
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
                Apuesta y entra en la cámara acorazada. En cada planta eliges por dónde bajar: si sale bien, tu botín se
                multiplica; si os pillan, lo pierdes todo. Huye cuando quieras con <b>Huir</b> (o <kbd>C</kbd>).
              </p>
              <ul>
                {Object.entries(ROUTES).map(([id, r]) => (
                  <li key={id}>
                    {r.icon} <b>{r.name}:</b> {Math.round(routeChance(id) * 100)} % de salir bien, multiplica el botín ×{(r.den / r.num).toLocaleString('es-ES')}.
                  </li>
                ))}
              </ul>
              <p>
                <b>La banda:</b> sin banda solo llegas a la planta {BASE_FLOORS}. Cada carta tuya del gacha que metas (hasta {CREW_MAX}) abre
                más plantas según su rareza:{' '}
                {Object.entries(RARITY_FLOORS)
                  .map(([r, n]) => `${RARITY[r] ?? r} +${n}`)
                  .join(', ')}
                . Como mucho {MAX_FLOORS} plantas y un botín de {fmtMult(MAX_MULT)}.
              </p>
              <p>
                La banda no cambia la suerte: elijas las rutas que elijas y huyas donde huyas, de media se recupera el 96 %. Lo que
                da es poder bajar más hondo, donde están los botines enormes. Cada día hay una clasificación con el golpe más gordo.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="hs fill">
        <div className="hs-main">
          <p className={`status ${last?.net > 0 && !run ? 'status--win' : ''}`} aria-live="polite">
            {status}
          </p>
          <section className={`hs-stage ${siren ? 'is-siren' : ''} ${busted ? 'is-busted' : ''}`} aria-label="El banco y su cámara acorazada">
            <div className="hs-sky" aria-hidden="true" />

            <div className="hs-hud" data-level={level}>
              <div className="hs-alarm" style={{ '--alarm': alarm / 100 }} role="img" aria-label={`Alarma al ${alarm} %`}>
                <span className="hs-alarm__lamp" />
                <span className="hs-alarm__body">
                  <small>Alarma</small>
                  <span className="hs-alarm__track">
                    <i className="hs-alarm__mask" />
                    <i className="hs-alarm__tick" style={{ left: '25%' }} />
                    <i className="hs-alarm__tick" style={{ left: '50%' }} />
                    <i className="hs-alarm__tick" style={{ left: '75%' }} />
                  </span>
                </span>
                <b>{alarm} %</b>
              </div>
              <div className={`hs-sack ${run && depth ? 'is-live' : ''}`} style={{ '--grow': grow }}>
                <span className="hs-bag" key={depth}>
                  <i>€</i>
                </span>
                <span className="hs-sack__txt">
                  <small>{run ? 'Botín' : 'Apuesta'}</small>
                  <b>{eur(run ? shownWorth : shownBet)}</b>
                </span>
              </div>
            </div>

            <div className="hs-view" ref={view}>
              <ol className="hs-world">
                <li className={`hs-roof ${at === 'roof' ? 'has-squad' : ''}`} data-at="roof">
                  <span className="hs-moon" />
                  <span className="hs-skyline" />
                  <span className="hs-sign">Banco Central</span>
                  <span className="hs-van" />
                  <span className="hs-beacon" />
                  {at === 'roof' && (
                    <div className="hs-slot hs-slot--roof">
                      {squad('l')}
                    </div>
                  )}
                </li>

                {levels.map((n) => {
                  const locked = n > openFloors
                  const done = n <= trail.length
                  const current = Boolean(run) && n === depth + 1 && !locked
                  const tried = path[n - 1]
                  const failed = Boolean(tried) && !tried.ok
                  const here = at === n
                  const picked = pick?.at === n ? pick.route : null
                  return (
                    <li
                      key={n}
                      data-at={n}
                      className={`hs-floor ${locked ? 'is-locked' : ''} ${done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${failed ? 'is-failed' : ''} ${n === openFloors ? 'is-last' : ''}`}
                      style={{ '--n': n }}
                    >
                      <span className="hs-plate">
                        <b>P{n}</b>
                        <em>{locked ? '🔒' : done ? fmtMult(multOf(trail.slice(0, n))) : failed ? '🚨' : ''}</em>
                      </span>
                      <div className="hs-room">
                        <span className="hs-lamp" />
                        <span className="hs-vent" />
                        <span className="hs-cam" style={{ '--flip': n % 2 }}>
                          <i />
                        </span>
                        <span className="hs-lasers">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="hs-ground" />
                        <div className="hs-row">
                          {here && (
                            <div className="hs-slot">
                              {squad('m')}
                              {mode === 'caught' && <span className="hs-stamp">¡Pillados!</span>}
                            </div>
                          )}
                          {current ? (
                            <div className="hs-routes">
                              {Object.entries(ROUTES).map(([id, r], i) => (
                                <button
                                  key={id}
                                  type="button"
                                  className={`hs-route hs-route--${id} ${picked === id ? 'is-pick' : ''} ${picked && picked !== id ? 'is-off' : ''}`}
                                  disabled={busy}
                                  onClick={() => go(id)}
                                  aria-label={`${r.name}: ${ROUTE_TEXT[id]}. ${Math.round(routeChance(id) * 100)} % de salir bien, pagaría ${eur(payout(run.bet, [...routes, id]))}`}
                                >
                                  <RouteArt id={id} state={picked === id ? (caughtNow ? 'fail' : 'work') : ''} />
                                  <span className="hs-route__info">
                                    <b>{r.name}</b>
                                    <span className="hs-route__odds">{Math.round(routeChance(id) * 100)} %</span>
                                    <span className="hs-route__pay">{eur(payout(run.bet, [...routes, id]))}</span>
                                  </span>
                                  <kbd>{i + 1}</kbd>
                                </button>
                              ))}
                            </div>
                          ) : failed ? (
                            <div className="hs-passed hs-passed--fail">
                              <RouteArt id={tried.route} state="fail" />
                              <span>
                                <b>Alarma</b>
                                <small>por {ROUTES[tried.route].name.toLowerCase()}</small>
                              </span>
                            </div>
                          ) : done ? (
                            <div className="hs-passed">
                              <RouteArt id={trail[n - 1]} state="open" />
                              <span>
                                <b>Despejada</b>
                                <small>{ROUTES[trail[n - 1]].name}</small>
                              </span>
                            </div>
                          ) : locked ? null : (
                            <div className="hs-ghosts" aria-hidden="true">
                              <RouteArt id="sigilo" />
                              <RouteArt id="normal" />
                              <RouteArt id="loco" />
                            </div>
                          )}
                        </div>
                        {locked && (
                          <div className="hs-boards">
                            <i className="hs-plank" />
                            <i className="hs-plank" />
                            <i className="hs-plank" />
                            <span className="hs-padlock" />
                            <p>
                              <b>Tapiada</b>
                              <small>Necesitas más banda</small>
                            </p>
                          </div>
                        )}
                        {n === openFloors && openFloors < MAX_FLOORS && <span className="hs-lift">Montacargas a la cámara</span>}
                      </div>
                    </li>
                  )
                })}

                <li className={`hs-vault ${isOpenVault ? 'is-open' : ''}`} data-at="vault">
                  <span className="hs-vault__glow" />
                  <div className="hs-gold hs-gold--l">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="hs-gold hs-gold--r">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="hs-door" key={isOpenVault ? 'open' : 'shut'}>
                    <span className="hs-door__ring" />
                    <span className="hs-door__bolts" />
                    <span className="hs-door__wheel">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="hs-door__hub" />
                  </div>
                  <span className="hs-vault__plaque">
                    Cámara del tesoro
                    <small>Se llega tras la planta {openFloors}</small>
                  </span>
                  {at === 'vault' && (
                    <div className="hs-slot hs-slot--vault">
                      {squad('m')}
                    </div>
                  )}
                </li>
              </ol>
            </div>

            <div className="hs-lights" aria-hidden="true">
              <i />
              <i />
            </div>
            <div className="hs-alert" aria-hidden="true" />
            {party && (
              <div className="hs-party" key={party} aria-hidden="true">
                {PARTY.map((p, i) => (
                  <i key={i} className={`hs-p hs-p--${p.kind}`} style={{ '--x': `${p.x}%`, '--d': `${p.d}s`, '--s': p.s, '--h': p.hue }} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="hs-panel">
          <div className={`hs-loot ${run && depth ? 'is-live' : ''}`} data-level={level}>
            {run ? (
              <>
                <small>{depth ? `Botín tras la planta ${depth}` : 'Estáis dentro'}</small>
                <b>{depth ? eur(worth) : eur(run.bet)}</b>
                <span className="hs-loot__mult">{depth ? fmtMult(mult) : 'apostado'}</span>
                <span className="hs-risk">
                  <span className="hs-risk__bar" style={{ '--alarm': alarm / 100 }}>
                    <i />
                  </span>
                  <small>
                    Planta {depth} de {floors} · riesgo acumulado {alarm} %
                  </small>
                </span>
              </>
            ) : (
              <>
                <small>Si llegáis al fondo</small>
                <b>{fmtMult(MAX_MULT)}</b>
                <span className="hs-loot__mult">hasta {floors} plantas</span>
              </>
            )}
          </div>

          <div className="hs-group">
            {run ? (
              <>
                <h2>La banda</h2>
                {crewShown.length === 0 ? (
                  <p className="hs-hint">Vais solos: no hay banda en este golpe.</p>
                ) : (
                  <ul className="hs-roster">
                    {crewShown.map((c) => (
                      <li key={c.id} className={`rar-${c.rarity}`}>
                        <GachaCard card={c} mini />
                        <span>
                          <b>{c.role}</b>
                          <small>{c.name}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <h2>
                  Tu banda <span>{crew.length}/{CREW_MAX}</span>
                </h2>
                <div className="hs-depth" aria-label={`${plannedFloors} plantas de ${MAX_FLOORS}`}>
                  {levels.map((n) => (
                    <i key={n} className={n <= BASE_FLOORS ? 'is-base' : n <= plannedFloors ? 'is-crew' : ''} />
                  ))}
                  <small>
                    {plannedFloors} plantas{plannedFloors > BASE_FLOORS ? ` (+${plannedFloors - BASE_FLOORS} por la banda)` : ' sin banda'}
                  </small>
                </div>
                {cards.length === 0 ? (
                  <p className="hs-hint">No tienes cartas del gacha. Consigue alguna en la Colección para bajar más hondo.</p>
                ) : (
                  <ul className="hs-picker">
                    {cards.map((c) => {
                      const on = crew.includes(c.id)
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={`rar-${c.rarity}`}
                            aria-pressed={on}
                            disabled={!on && crew.length >= CREW_MAX}
                            onClick={() => toggle(c.id)}
                            title={`${c.name} · ${RARITY[c.rarity] ?? c.rarity} · +${RARITY_FLOORS[c.rarity] ?? 0} plantas`}
                          >
                            <GachaCard card={c} mini />
                            <span className="hs-pick__plus">+{RARITY_FLOORS[c.rarity] ?? 0} plantas</span>
                            <b>{c.role}</b>
                            <small>{RARITY[c.rarity] ?? c.rarity}</small>
                            {on && <i className="hs-pick__on">✓</i>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="hs-group">
            <h2>Apuesta</h2>
            <div className="hs-bet">
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet - STEP * 5, maxBet))} aria-label="Bajar la apuesta">
                −
              </button>
              <span>{eur(shownBet)}</span>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet + STEP * 5, maxBet))} aria-label="Subir la apuesta">
                +
              </button>
            </div>
            <input className="hs-slider" type="range" min={MIN_BET} max={Math.max(maxBet, MIN_BET)} step={STEP} value={shownBet} disabled={!canBet} aria-label="Apuesta" onChange={(e) => setBet(Number(e.target.value))} />
            <div className="hs-quick">
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
            <button type="button" className="hs-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={start}>
              {asking ? 'Entrando…' : 'Dar el golpe'}
            </button>
          ) : (
            <button type="button" className="hs-go hs-go--cash" disabled={busy || !depth} onClick={cash}>
              {depth ? `Huir con ${eur(worth)}` : 'Baja al menos una planta'}
              <kbd>C</kbd>
            </button>
          )}

          <div className="hs-group">
            <h2>Golpe del día</h2>
            {ranking.length === 0 ? (
              <p className="hs-hint">Hoy nadie ha salido con botín todavía.</p>
            ) : (
              <ol className="hs-rank">
                {ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : ''}>
                    <span className="hs-rank__pos">{MEDALS[i] ?? i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={26} />
                    <span className="hs-rank__name">{r.name}</span>
                    <em>{fmtMult(r.mult)}</em>
                  </li>
                ))}
              </ol>
            )}
            {history.length > 0 && (
              <ol className="hs-history" aria-label="Últimos golpes">
                {history.map((h) => (
                  <li key={h.id} className={h.mult > 0 ? 'is-win' : 'is-lose'}>
                    {h.mult > 0 ? fmtMult(h.mult) : '🚨'}
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
          caption={`${fmtMult(burst.mult)} desde la planta ${burst.floor}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 3)}
          big={burst.mult >= 10}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Heist
