// Buceo de Perlas (Season 4): bajas al fondo del mar tramo a tramo y en cada uno abres una ostra. Si sale perla, el premio
// crece (la perla negra lo dobla); si sale un tiburón o se acaba el aire, pierdes la apuesta. Subes y cobras cuando
// quieras. Cada tramo lo sortea el servidor al bajarlo (reglas en dive.js); aquí solo se anima.
// El panel (apuesta, zonas, récord del día) usa las piezas de Tesoro en la Arena (ar-*, Arena.css).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { BLACK, MAX_DEPTH, MAX_MULT, METERS, MIN_BET, STEP, ZONES, clampBet, fmtMult, isLoss, maxBetFor, multAfter, nextIfPearl, payout, shownMult } from './dive.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playCash, playChip, playLose, playReveal, playSnap, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import '../dig/Arena.css'
import './Buceo.css'

const DIVE_MS = 650 // lo que tarda el buzo en bajar un tramo y abrir la ostra
const HISTORY = 12
const MEDALS = ['🥇', '🥈', '🥉']
const ICONS = { laguna: '🐠', arrecife: '🪸', abismo: '🦈' }
const PEARL_NAMES = { white: 'Perla blanca', pink: 'Perla rosa', gold: 'Perla dorada', blue: 'Perla azul', black: '¡Perla negra!', shark: 'Tiburón', air: 'Sin aire' }
const PEARL_COLORS = { white: ['#ffffff', '#d8d4e4'], pink: ['#ffe0ec', '#f39ab8'], gold: ['#fff2b0', '#e0a630'], blue: ['#e0f6ff', '#6ab8e8'], black: ['#7a6a9a', '#120c22'] }

// --- Arte ---

// Una ostra abierta con su perla (o cerrada, si aún no se ha abierto).
function Oyster({ kind, open, fresh }) {
  const [hi, lo] = PEARL_COLORS[kind] ?? PEARL_COLORS.white
  return (
    <svg viewBox="0 0 60 44" className={`bz-oyster ${open ? 'is-open' : ''} ${fresh ? 'is-fresh' : ''} ${kind === 'black' ? 'is-black' : ''}`} aria-hidden="true">
      <defs>
        <radialGradient id={`bz-p-${kind}`} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor={hi} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
      </defs>
      <path d="M4 30 Q30 46 56 30 Q30 36 4 30 Z" fill="#8a7a9a" stroke="#3a2a4a" strokeWidth="2" strokeLinejoin="round" />
      {open ? (
        <>
          <path className="bz-oyster__lid" d="M4 30 Q8 6 30 6 Q52 6 56 30 Q30 22 4 30 Z" fill="#a898b8" stroke="#3a2a4a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M14 26 Q30 16 46 26" stroke="#c8b8d8" strokeWidth="1.5" fill="none" />
          {kind !== 'shark' && kind !== 'air' && (
            <>
              <circle className="bz-pearl" cx="30" cy="30" r="7" fill={`url(#bz-p-${kind})`} stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
              <circle cx="27.5" cy="27.5" r="2" fill="#fff" opacity="0.85" />
            </>
          )}
        </>
      ) : (
        <path d="M4 30 Q30 18 56 30 Q30 38 4 30 Z" fill="#a898b8" stroke="#3a2a4a" strokeWidth="2" strokeLinejoin="round" />
      )}
    </svg>
  )
}

// El buzo, con su botella y las burbujas que suben.
function Diver({ lost }) {
  return (
    <svg viewBox="0 0 70 60" className={`bz-diver ${lost ? 'is-lost' : ''}`} aria-hidden="true">
      <g className="bz-diver__body">
        <rect x="16" y="14" width="10" height="26" rx="5" fill="#ffb547" stroke="#6a3a10" strokeWidth="2" />
        <path d="M22 20 Q40 16 52 24 L50 32 Q38 28 24 32 Z" fill="#1f4a7a" stroke="#0a1a30" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="54" cy="24" r="8" fill="#ffd9b8" stroke="#6a3a20" strokeWidth="2" />
        <rect x="50" y="19" width="12" height="7" rx="3" fill="#8fe3ff" stroke="#0a1a30" strokeWidth="2" />
        <path d="M24 30 L10 44 M28 32 L18 50" stroke="#1f4a7a" strokeWidth="5" strokeLinecap="round" />
        <path d="M6 42 L14 48 M14 48 L18 56" stroke="#2ee6d0" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g className="bz-bubbles" fill="none" stroke="#c8f6ff" strokeWidth="1.5">
        <circle cx="62" cy="12" r="2.5" />
        <circle cx="58" cy="5" r="1.8" />
        <circle cx="65" cy="2" r="1.2" />
      </g>
    </svg>
  )
}

function Shark() {
  return (
    <svg viewBox="0 0 120 50" className="bz-shark" aria-hidden="true">
      <path d="M4 26 Q30 8 70 14 L82 2 L86 16 Q104 20 116 26 Q104 32 86 34 Q60 44 30 38 L14 46 L18 32 Q8 30 4 26 Z" fill="#5a7488" stroke="#1a2a38" strokeWidth="2" strokeLinejoin="round" />
      <path d="M30 30 Q60 40 86 32" fill="#dfe8ee" />
      <circle cx="98" cy="22" r="2.5" fill="#0a1018" />
      <path d="M92 30 L106 29" stroke="#1a2a38" strokeWidth="2" strokeLinecap="round" />
      <path d="M50 22 L54 30 M58 21 L61 29 M66 20 L68 28" stroke="#3a5468" strokeWidth="1.5" />
    </svg>
  )
}

// El mar en vertical: superficie con la barca arriba, luz que se apaga al bajar, algas y peces a los lados.
function Sea({ depth, zone }) {
  return (
    <svg className="bz-sea" viewBox="0 0 400 600" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="bz-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={zone === 'laguna' ? '#3fd8d0' : '#2ec4c0'} />
          <stop offset="0.35" stopColor={zone === 'abismo' ? '#0e4a78' : '#137a9a'} />
          <stop offset="1" stopColor={zone === 'abismo' ? '#040a20' : '#071e3c'} />
        </linearGradient>
        <linearGradient id="bz-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#bz-water)" />
      <g className="bz-rays">
        <path d="M60 0 L110 0 L40 420 L10 420 Z" fill="url(#bz-ray)" />
        <path d="M180 0 L220 0 L200 380 L160 380 Z" fill="url(#bz-ray)" />
        <path d="M300 0 L350 0 L380 440 L330 440 Z" fill="url(#bz-ray)" />
      </g>
      {/* Algas y coral a los lados. */}
      <g fill="none" strokeLinecap="round">
        {[30, 60, 340, 372].map((x, i) => (
          <path key={x} className="bz-weed" style={{ '--i': i }} d={`M${x} 600 Q ${x - 12} 520 ${x + 4} 460 T ${x - 2} 360`} stroke={i % 2 ? '#2fae5e' : '#3cc46c'} strokeWidth="6" />
        ))}
      </g>
      <g>
        <path d="M80 600 Q86 560 100 570 Q104 540 116 556 Q124 530 132 560 Q140 556 140 600 Z" fill="#ff6b8a" opacity="0.8" />
        <path d="M262 600 Q268 566 280 574 Q288 548 298 566 Q308 552 312 600 Z" fill="#ffb547" opacity="0.75" />
      </g>
      {/* Peces que pasan. */}
      <g className="bz-fish">
        <path d="M0 0 Q10 -6 20 0 Q10 6 0 0 Z M20 0 L28 -6 L28 6 Z" fill="#ffd25e" transform="translate(40 140)" />
        <path d="M0 0 Q8 -5 16 0 Q8 5 0 0 Z M16 0 L22 -5 L22 5 Z" fill="#ff8a6a" transform="translate(300 240) scale(-1 1)" />
        <path d="M0 0 Q8 -5 16 0 Q8 5 0 0 Z M16 0 L22 -5 L22 5 Z" fill="#8fe3ff" transform="translate(90 330)" />
      </g>
      {/* Superficie: ola y la barca. */}
      <path className="bz-surface" d="M-20 18 Q 0 10 20 18 T 60 18 T 100 18 T 140 18 T 180 18 T 220 18 T 260 18 T 300 18 T 340 18 T 380 18 T 420 18 V0 H-20 Z" fill="#ffd9a0" opacity="0.55" />
      <g transform="translate(176 4)">
        <path d="M0 10 L48 10 L40 20 L8 20 Z" fill="#c9824a" stroke="#5a2a10" strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 10 V-14 L38 6 Z" fill="#fff6e8" stroke="#5a2a10" strokeWidth="1.5" />
      </g>
      <rect width="400" height="600" fill="#000" opacity={Math.min(0.45, depth * 0.035)} />
    </svg>
  )
}

// --- Juego ---

function Buceo({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [zone, setZone] = useState('arrecife')
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, zone, depth, mult, pearls } mientras hay una inmersión
  const [asking, setAsking] = useState(false)
  const [diving, setDiving] = useState(false)
  const [fresh, setFresh] = useState(null) // el último tramo, para su animación
  const [last, setLast] = useState(null)
  const [history, setHistory] = useState([])
  const [ranking, setRanking] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null)
  const [ready, setReady] = useState(false)
  const [shake, setShake] = useState(false)
  const lock = useRef(false)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && !diving) setBalance(serverBalance)
  }, [serverBalance, asking, diving])
  const shownBank = useCountUp(balance)

  const record = (result) => {
    setLast(result)
    setHistory((list) => (list.some((h) => h.id === result.round) ? list : [{ id: result.round, mult: result.net >= 0 ? result.mult : 0 }, ...list].slice(0, HISTORY)))
  }

  const apply = (v) => {
    if (v.ranking) setRanking(v.ranking)
    if (v.bet > 0) {
      setRun({ bet: v.bet, zone: v.zone, depth: v.depth, mult: v.mult, pearls: v.pearls })
      setZone(v.zone)
      setBet(v.bet)
    } else setRun(null)
  }

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_dive', a: 'sync' })
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

  async function act(message) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_dive', ...message })
    lock.current = false
    setAsking(false)
    const v = body?.solo ?? null
    if (!v) await resync()
    else if (body.abuse) v.abuse = body.abuse
    return v
  }

  const shownZone = run?.zone ?? zone
  const depth = run?.depth ?? 0
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const busy = asking || !ready || diving
  const canBet = !run && !asking && maxBet >= MIN_BET
  const worth = run && depth > 0 ? payout(run.bet, run.mult) : 0
  const liveWorth = useCountUp(worth, 450)
  const risk = Math.round(ZONES[shownZone].risk * 100)
  const next = nextIfPearl(shownZone, run?.mult ?? 0)
  const air = MAX_DEPTH - depth

  async function start() {
    if (busy || run || shownBet > balance) return
    playChip()
    setBurst(null)
    setLast(null)
    setBank(null)
    setFresh(null)
    const v = await act({ a: 'start', bet: shownBet, zone })
    if (!v) return
    setBalance(v.balance)
    apply(v)
  }

  async function down() {
    if (busy || !run) return
    setDiving(true)
    const [v] = await Promise.all([act({ a: 'dive' }), new Promise((ok) => setTimeout(ok, reduced ? 0 : DIVE_MS))])
    setDiving(false)
    if (!v) return
    const kind = v.ev === 'shark' || v.ev === 'air' ? v.ev : v.kind
    setFresh({ depth: (v.bet > 0 ? v.depth : v.last?.depth) ?? 0, kind, at: Date.now() })
    if (v.ev === 'shark' || v.ev === 'air') {
      playSnap()
      setTimeout(playLose, 180)
      buzz([40, 40, 160])
      setShake(true)
      setTimeout(() => setShake(false), 500)
      if (v.abuse) setBank({ round: v.last.round, ...v.abuse })
      apply(v)
      record(v.last)
      setBalance(v.balance)
      return
    }
    playReveal()
    if (kind === 'black') buzz([30, 30, 30])
    apply(v)
    if (v.ev === 'top') {
      record(v.last)
      setBalance(v.balance)
      finish(v.last, v.abuse)
    }
  }

  async function cash() {
    if (busy || !run || depth < 1) return
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
    const blacks = result.pearls.filter((p) => p === 'black').length
    setBurst({ id: result.round, amount: result.net + (abuse?.extra ?? 0), mult: result.mult, depth: result.depth, blacks, extra: abuse?.extra ?? 0 })
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    if ((event.code === 'KeyC' || event.code === 'Enter') && run) {
      event.preventDefault()
      cash()
    } else if ((event.code === 'Space' || event.code === 'ArrowDown') && !target?.matches('button:focus-visible')) {
      event.preventDefault()
      if (run) down()
      else start()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  // Los tramos que se ven: durante la inmersión, los bajados; al acabar, los de la última (con cómo acabó).
  const shown = run ? run.pearls : last && last.zone === zone ? last.pearls : []
  const lostAt = !run && last && last.lost && last.zone === zone ? last.depth : null
  const diverAt = run ? depth + (diving ? 0.5 : 0) : lostAt ?? (last && last.zone === zone ? last.depth : 0)

  let status = 'Elige la zona y tu apuesta, y tírate al agua.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Preparando el equipo…'
  else if (diving) status = 'Bajando…'
  else if (run && depth === 0) status = `Baja al primer tramo y abre la ostra. En ${ZONES[run.zone].name} hay un ${risk} % de peligro en cada tramo.`
  else if (run) {
    const k = run.pearls[run.pearls.length - 1]
    status =
      k === 'black'
        ? `¡Perla negra a ${depth * METERS} m! Tu premio se dobla: llevas ${eur(worth)}.`
        : `${PEARL_NAMES[k]} a ${depth * METERS} m. Llevas ${eur(worth)}. El siguiente tramo vale ${fmtMult(next)}, con un ${risk} % de peligro.`
  } else if (last?.net > 0) {
    status = `¡Subiste con ${fmtMult(last.mult)} desde ${last.depth * METERS} m! Ganaste ${eur(last.net + (bank?.round === last.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (last && bank?.round === last.round && bank.extra > 0) status = `¡Te pilló el mar! Pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (last) {
    const why = last.pearls[last.pearls.length - 1] === 'shark' ? 'Un tiburón te espantó' : 'Te quedaste sin aire'
    status = `${why} a ${last.depth * METERS} m. Perdiste ${eur(last.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  return (
    <main className="app ar-app bz-app">
      <header className="top">
        <h1>Buceo de Perlas</h1>
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
            <Help className="tg tg--help" title="Cómo se juega al Buceo de Perlas">
              <p>
                Elige la zona y tu apuesta y tírate al agua. Con <b>Bajar</b> (o <kbd>Espacio</kbd>) bajas {METERS} metros y abres una ostra: si
                sale <b>perla</b>, tu premio crece; si sale un <b>tiburón</b> o se te acaba el <b>aire</b>, pierdes la apuesta.
              </p>
              <p>
                Subes y cobras cuando quieras con <b>Subir</b> (o <kbd>C</kbd>). La botella da para {MAX_DEPTH} tramos: en el último subes solo. Si
                llegas al tope de {fmtMult(MAX_MULT)}, también.
              </p>
              <p>
                A veces sale una <b>perla negra</b> ({Math.round(BLACK * 100)} % de las veces): ese tramo paga el doble.
              </p>
              <ul>
                {Object.entries(ZONES).map(([id, z]) => (
                  <li key={id}>
                    <b>{z.name}:</b> {Math.round(z.risk * 100)} % de peligro en cada tramo. El primero paga {fmtMult(multAfter(id, 1))}, y los{' '}
                    {MAX_DEPTH}, {fmtMult(multAfter(id, MAX_DEPTH))} (sin perlas negras).
                  </li>
                ))}
              </ul>
              <p>
                Cada tramo se sortea en el servidor al bajarlo, así que no hay truco: subas cuando subas, de media se recupera el 96 %. Con el Admin
                Abuse, la banca multiplica lo que ganes o te devuelve lo que pierdas, y tienes más suerte al bajar.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="ar fill">
        <section className={`bz-stage ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''} ${run ? 'is-run' : ''}`} aria-label="El mar">
          <Sea depth={diverAt} zone={shownZone} />
          <div className="ar-top">
            <span className="ar-chip">
              <small>Profundidad</small>
              <b>{Math.round(diverAt) * METERS} m</b>
            </span>
            <span className={`ar-chip bz-air ${run && air <= 2 ? 'is-low' : ''}`}>
              <small>Aire</small>
              <b>
                <span className="bz-air__bar" style={{ '--air': (run ? air : MAX_DEPTH) / MAX_DEPTH }} aria-hidden="true" />
                {run ? air : MAX_DEPTH} / {MAX_DEPTH}
              </b>
            </span>
            {run && (
              <span className="ar-chip ar-chip--next">
                <small>Siguiente tramo</small>
                <b>
                  {fmtMult(next)} · {risk} % 🦈
                </b>
              </span>
            )}
          </div>

          <ol className="bz-column" style={{ '--n': MAX_DEPTH }} aria-label="Tramos">
            {Array.from({ length: MAX_DEPTH }, (_, i) => {
              const kind = shown[i]
              const opened = kind !== undefined
              const isFresh = fresh && fresh.depth === i + 1 && Date.now() - fresh.at < 2500
              return (
                <li key={i} className={`bz-step ${opened ? `is-${kind}` : ''} ${isLoss(kind) ? 'is-loss' : ''}`}>
                  <span className="bz-step__m">{(i + 1) * METERS} m</span>
                  <span className="bz-step__shell">
                    {kind === 'shark' ? <Shark /> : <Oyster kind={kind ?? 'white'} open={opened && kind !== 'air'} fresh={isFresh} />}
                    {kind === 'air' && <span className="bz-step__air">💨</span>}
                  </span>
                  <span className="bz-step__mult">{opened && !isLoss(kind) ? PEARL_NAMES[kind] : ''}</span>
                </li>
              )
            })}
          </ol>
          <span className="bz-diver-slot" style={{ '--at': diverAt / MAX_DEPTH }} aria-hidden="true">
            <Diver lost={lostAt !== null} />
          </span>

          <p className={`ar-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
          {run && depth > 0 && (
            <button type="button" className="ar-cash-float" disabled={busy} onClick={cash}>
              Subir con {eur(liveWorth)}
            </button>
          )}
        </section>

        <aside className="ar-panel">
          <div className="ar-loot-box">
            {run ? (
              <>
                <small>{depth > 0 ? 'Si subes ahora' : 'Baja al primer tramo'}</small>
                <b>{eur(depth > 0 ? liveWorth : 0)}</b>
                <span className="ar-loot-box__mult">{depth > 0 ? fmtMult(shownMult(run.mult)) : `Siguiente: ${fmtMult(next)}`}</span>
              </>
            ) : (
              <>
                <small>Bajando 5 tramos</small>
                <b>{eur(Math.floor(shownBet * multAfter(zone, 5)))}</b>
                <span className="ar-loot-box__mult">{fmtMult(multAfter(zone, 5))}</span>
              </>
            )}
          </div>

          <div className="ar-group">
            <h2>Zona</h2>
            <div className="ar-modes bz-zones" role="radiogroup" aria-label="Zona">
              {Object.entries(ZONES).map(([id, z]) => (
                <button key={id} type="button" role="radio" aria-checked={zone === id} className={`ar-mode bz-zone--${id}`} disabled={Boolean(run) || asking} onClick={() => setZone(id)}>
                  <span className="ar-mode__ico" aria-hidden="true">
                    {ICONS[id]}
                  </span>
                  <b>{z.name}</b>
                  <small>
                    {Math.round(z.risk * 100)} % 🦈 · {fmtMult(multAfter(id, 1))}
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div className="ar-group">
            <h2>Apuesta</h2>
            <div className="ar-bet">
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet - STEP * 5, maxBet))} aria-label="Bajar la apuesta">
                −
              </button>
              <span>{eur(shownBet)}</span>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet + STEP * 5, maxBet))} aria-label="Subir la apuesta">
                +
              </button>
            </div>
            <input
              className="ar-slider"
              type="range"
              min={MIN_BET}
              max={Math.max(maxBet, MIN_BET)}
              step={STEP}
              value={shownBet}
              disabled={!canBet}
              aria-label="Apuesta"
              onChange={(e) => setBet(Number(e.target.value))}
            />
            <div className="ar-quick">
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
            <button type="button" className="ar-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={start}>
              {asking ? 'Preparando el equipo…' : '¡Al agua!'}
              <kbd>Espacio</kbd>
            </button>
          ) : (
            <div className="bz-actions">
              <button type="button" className="ar-go bz-down" disabled={busy || air < 1} onClick={down}>
                {diving ? 'Bajando…' : `Bajar a ${(depth + 1) * METERS} m`}
                <kbd>Espacio</kbd>
              </button>
              <button type="button" className="ar-go ar-go--cash" disabled={busy || depth < 1} onClick={cash}>
                {depth < 1 ? (
                  'Baja al menos un tramo'
                ) : (
                  <span className="ar-go__cash">
                    <small>Subir y cobrar</small>
                    <b>{eur(liveWorth)}</b>
                  </span>
                )}
                <kbd>C</kbd>
              </button>
            </div>
          )}

          <div className="ar-group">
            <h2>Récord del día</h2>
            {ranking.length === 0 ? (
              <p className="ar-hint">Nadie ha subido perlas hoy todavía. ¡El primero se pone arriba!</p>
            ) : (
              <ol className="ar-rank">
                {ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : ''}>
                    <span className="ar-rank__pos">{MEDALS[i] ?? i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={26} />
                    <span className="ar-rank__name">{r.name}</span>
                    <span className="ar-rank__mult">
                      {fmtMult(r.mult)}
                      <small>{ZONES[r.mode]?.name ?? ''}</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {history.length > 0 && (
              <ol className="ar-history" aria-label="Últimas inmersiones">
                {history.map((h) => (
                  <li key={h.id} className={h.mult > 0 ? 'is-win' : 'is-lose'}>
                    {h.mult > 0 ? fmtMult(h.mult) : '🦈'}
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
          caption={`${fmtMult(burst.mult)} desde ${burst.depth * METERS} m${burst.blacks ? ` · ${burst.blacks} perla${burst.blacks === 1 ? '' : 's'} negra${burst.blacks === 1 ? '' : 's'}` : ''}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 3)}
          big={burst.mult >= 10}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Buceo
