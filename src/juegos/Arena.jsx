// Tesoro en la Arena (Season 4): una playa de 5×5 con cangrejos escondidos. Cavas un hoyo cada vez: si sale tesoro el
// premio crece, si sale un cangrejo pierdes la apuesta. Cobras cuando quieras. Lo que hay en cada hoyo lo sortea el
// servidor al cavar (reglas en arena.js); aquí solo se anima.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from './useEffectEvent.js'
import { CELLS, MAX_MULT, MIN_BET, MODES, SIZE, STEP, clampBet, fmtMult, lootOf, maxBetFor, maxDigs, multAt, payout, safeCells } from './arena.js'
import { eur } from './money.js'
import { buzz, isMuted, playCash, playChip, playLose, playReveal, playSnap, playStone, playWin, setMuted } from './sound.js'
import { useCountUp } from './useCountUp.js'
import WinBurst from './WinBurst.jsx'
import Help from './Help.jsx'
import Avatar from './Avatar.jsx'
import './Arena.css'

const DIG_MS = 420 // lo que dura la pala antes de enseñar el hoyo
const HISTORY = 12
const MEDALS = ['🥇', '🥈', '🥉']
const ICONS = { calma: '🏖️', marea: '🌊', nido: '🦀', invasion: '🌋' }

// --- Arte ---

// Lo que sale de un hoyo con tesoro.
function Loot({ kind }) {
  switch (kind) {
    case 'shell':
      return (
        <svg viewBox="0 0 40 40" className="ar-loot">
          <path d="M20 34 L6 16 A15 15 0 0 1 34 16 Z" fill="#ffd9c2" stroke="#9a4a2a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M20 34 L10 12 M20 34 L16 8 M20 34 L24 8 M20 34 L30 12" stroke="#d07a52" strokeWidth="1.6" />
          <rect x="15" y="32" width="10" height="5" rx="2" fill="#ffb592" stroke="#9a4a2a" strokeWidth="1.6" />
        </svg>
      )
    case 'star':
      return (
        <svg viewBox="0 0 40 40" className="ar-loot">
          <path d="M20 4 L24.5 15 L36 15.5 L27 23 L30 35 L20 28.5 L10 35 L13 23 L4 15.5 L15.5 15 Z" fill="#ff8a4c" stroke="#8a2f10" strokeWidth="2" strokeLinejoin="round" />
          <g fill="#ffe0b0">
            <circle cx="20" cy="12" r="1.4" />
            <circle cx="27" cy="18" r="1.4" />
            <circle cx="13" cy="18" r="1.4" />
            <circle cx="24" cy="27" r="1.4" />
            <circle cx="16" cy="27" r="1.4" />
          </g>
        </svg>
      )
    case 'coin':
      return (
        <svg viewBox="0 0 40 40" className="ar-loot">
          <ellipse cx="20" cy="22" rx="14" ry="14" fill="#c98a12" />
          <circle cx="20" cy="20" r="14" fill="#ffd25e" stroke="#8a5a06" strokeWidth="2" />
          <circle cx="20" cy="20" r="9.5" fill="none" stroke="#e0a21c" strokeWidth="2" />
          <path d="M23 15.5 A6 6 0 1 0 23 24.5 M13.5 18.5 H21 M13.5 21.5 H21" fill="none" stroke="#8a5a06" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M11 13 A12 12 0 0 1 18 8" stroke="#fff6c0" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'pearl':
      return (
        <svg viewBox="0 0 40 40" className="ar-loot">
          <path d="M4 26 Q20 40 36 26 Q20 32 4 26 Z" fill="#9ad0e0" stroke="#2a5a6a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M4 26 Q8 8 20 8 Q32 8 36 26 Q20 18 4 26 Z" fill="#b8e4f0" stroke="#2a5a6a" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="20" cy="25" r="6" fill="#fff8f0" stroke="#c0b0c8" strokeWidth="1.2" />
          <circle cx="18" cy="23" r="2" fill="#fff" />
        </svg>
      )
    case 'bottle':
      return (
        <svg viewBox="0 0 40 40" className="ar-loot">
          <g transform="rotate(-30 20 20)">
            <rect x="13" y="12" width="14" height="24" rx="6" fill="#7fd0c0" fillOpacity="0.85" stroke="#1e5a52" strokeWidth="2" />
            <rect x="17" y="4" width="6" height="9" rx="1.5" fill="#7fd0c0" stroke="#1e5a52" strokeWidth="2" />
            <rect x="16.5" y="2" width="7" height="4" rx="1" fill="#a8743a" />
            <rect x="16" y="18" width="8" height="12" rx="1" fill="#fff3d6" stroke="#b08a50" strokeWidth="1" />
            <path d="M17.5 21 H22.5 M17.5 24 H22.5 M17.5 27 H21" stroke="#b08a50" strokeWidth="1" />
          </g>
        </svg>
      )
    case 'gem':
      return (
        <svg viewBox="0 0 40 40" className="ar-loot">
          <path d="M8 15 L14 7 H26 L32 15 L20 35 Z" fill="#5fe0ff" stroke="#164a7a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 15 H32 M14 7 L18 15 L20 35 M26 7 L22 15 L20 35" fill="none" stroke="#164a7a" strokeWidth="1.4" />
          <path d="M14 7 L18 15 H8 Z" fill="#b4f2ff" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 40 40" className="ar-loot">
          <rect x="5" y="17" width="30" height="18" rx="2" fill="#a8652a" stroke="#4a2408" strokeWidth="2" />
          <path d="M5 19 Q5 7 20 7 Q35 7 35 19 Z" fill="#c07a34" stroke="#4a2408" strokeWidth="2" />
          <path d="M5 21 H35 M14 8 V35 M26 8 V35" stroke="#ffd25e" strokeWidth="2.4" />
          <rect x="17" y="18" width="6" height="7" rx="1" fill="#ffd25e" stroke="#4a2408" strokeWidth="1.4" />
          <circle cx="20" cy="17" r="5" fill="#fff6c0" opacity="0.6" className="ar-loot__glow" />
        </svg>
      )
  }
}

// El cangrejo que te muerde (o los que quedaban escondidos, al acabar).
function Crab({ angry }) {
  return (
    <svg viewBox="0 0 48 40" className={`ar-crab ${angry ? 'is-angry' : ''}`}>
      <g stroke="#6a120c" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M12 26 L4 30 M12 29 L6 35 M36 26 L44 30 M36 29 L42 35" />
        <path d="M14 20 L8 12 M34 20 L40 12" />
      </g>
      <g className="ar-crab__claw ar-crab__claw--l">
        <path d="M8 13 C 0 10, 0 2, 6 2 L 9 7 L 12 3 C 15 6, 13 12, 8 13 Z" fill="#ff5a3c" stroke="#6a120c" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <g className="ar-crab__claw ar-crab__claw--r">
        <path d="M40 13 C 48 10, 48 2, 42 2 L 39 7 L 36 3 C 33 6, 35 12, 40 13 Z" fill="#ff5a3c" stroke="#6a120c" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <ellipse cx="24" cy="25" rx="13" ry="9" fill="#ff5a3c" stroke="#6a120c" strokeWidth="2" />
      <ellipse cx="22" cy="22" rx="7" ry="3" fill="#ff9a7a" />
      <path d="M19 18 V12 M29 18 V12" stroke="#6a120c" strokeWidth="2" />
      <circle cx="19" cy="11" r="3.2" fill="#fff" stroke="#6a120c" strokeWidth="1.5" />
      <circle cx="29" cy="11" r="3.2" fill="#fff" stroke="#6a120c" strokeWidth="1.5" />
      <circle cx="19.6" cy="11.4" r="1.5" fill="#1a0a08" />
      <circle cx="28.4" cy="11.4" r="1.5" fill="#1a0a08" />
      {angry ? <path d="M15 7 L21 9 M33 7 L27 9" stroke="#6a120c" strokeWidth="2" strokeLinecap="round" /> : null}
      <path d={angry ? 'M20 29 Q24 26 28 29' : 'M20 28 Q24 31 28 28'} stroke="#6a120c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Montón de arena sin cavar (cada uno un poco distinto).
function Mound({ cell }) {
  const tilt = ((cell * 37) % 9) - 4
  return (
    <svg viewBox="0 0 60 44" className="ar-mound" style={{ rotate: `${tilt}deg` }} aria-hidden="true">
      <ellipse cx="30" cy="34" rx="26" ry="8" fill="#b88a4a" opacity="0.55" />
      <path d="M6 34 Q 14 12 30 10 Q 46 12 54 34 Z" fill="#f0cf8a" />
      <path d="M6 34 Q 14 12 30 10 Q 22 18 20 34 Z" fill="#fde3a8" />
      <g fill="#c99a52">
        <circle cx={22 + (cell % 3) * 6} cy="24" r="1.4" />
        <circle cx={34 - (cell % 4) * 3} cy="29" r="1.2" />
        <circle cx="40" cy="22" r="1" />
      </g>
      {cell % 5 === 2 && <path d="M38 14 l3 -6 l2 6 z" fill="#3fbf7a" opacity="0.9" />}
    </svg>
  )
}

// Fondo de la playa: el mar arriba con olas, la arena, palmeras a los lados y el sol.
function Beach() {
  return (
    <svg className="ar-beach" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ar-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b8fa8" />
          <stop offset="1" stopColor="#2ee6d0" />
        </linearGradient>
        <linearGradient id="ar-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dca0" />
          <stop offset="1" stopColor="#e2b86e" />
        </linearGradient>
        <radialGradient id="ar-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill="url(#ar-sand)" />
      <rect width="400" height="58" fill="url(#ar-sea)" />
      <circle cx="340" cy="10" r="40" fill="url(#ar-sun)" className="ar-sunglow" />
      <path className="ar-wave ar-wave--1" d="M-40 56 Q -20 48 0 56 T 40 56 T 80 56 T 120 56 T 160 56 T 200 56 T 240 56 T 280 56 T 320 56 T 360 56 T 400 56 T 440 56 V70 H-40 Z" fill="#c8f6ff" opacity="0.85" />
      <path className="ar-wave ar-wave--2" d="M-40 62 Q -20 56 0 62 T 40 62 T 80 62 T 120 62 T 160 62 T 200 62 T 240 62 T 280 62 T 320 62 T 360 62 T 400 62 T 440 62 V68 H-40 Z" fill="#fff" opacity="0.5" />
      <path d="M0 66 Q 100 74 200 68 T 400 70" stroke="#d4a75e" strokeWidth="3" fill="none" opacity="0.6" />
      {/* Huellas. */}
      <g fill="#d2a660" opacity="0.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <ellipse key={i} cx={16 + (i % 2) * 10} cy={110 + i * 30} rx="3.5" ry="6" />
        ))}
      </g>
      {/* Palmeras. */}
      {[
        [-6, 1],
        [406, -1],
      ].map(([x, dir]) => (
        <g key={x} className="ar-palm" transform={`translate(${x} 300) scale(${dir * 0.72} 0.72)`}>
          <path d="M0 0 Q 18 -90 40 -170" stroke="#8a5a2a" strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M0 0 Q 18 -90 40 -170" stroke="#a8743a" strokeWidth="5" fill="none" strokeDasharray="4 8" />
          <g fill="#3fbf7a" stroke="#1e6a3a" strokeWidth="2">
            <path d="M40 -170 Q 80 -190 110 -160 Q 76 -172 40 -165 Z" />
            <path d="M40 -170 Q 60 -210 30 -230 Q 46 -200 36 -168 Z" />
            <path d="M40 -170 Q 0 -200 -20 -170 Q 10 -180 38 -166 Z" />
            <path d="M40 -170 Q 86 -150 90 -110 Q 70 -150 40 -164 Z" />
          </g>
          <circle cx="38" cy="-162" r="6" fill="#6a3a12" />
          <circle cx="46" cy="-160" r="5.5" fill="#7a4a1a" />
        </g>
      ))}
    </svg>
  )
}

// --- Juego ---

function Arena({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [mode, setMode] = useState('marea')
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, mode, dug } mientras hay una partida en marcha
  const [asking, setAsking] = useState(false)
  const [digging, setDigging] = useState(null) // el hoyo que se está cavando
  const [fresh, setFresh] = useState(null) // el último hoyo descubierto, para su animación
  const [last, setLast] = useState(null)
  const [history, setHistory] = useState([])
  const [ranking, setRanking] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null) // { round, extra }: lo que puso el Admin Abuse en la última partida
  const [ready, setReady] = useState(false)
  const [shake, setShake] = useState(false)
  const lock = useRef(false)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && digging === null) setBalance(serverBalance)
  }, [serverBalance, asking, digging])
  const shownBank = useCountUp(balance)

  const record = (result) => {
    setLast(result)
    setHistory((list) => (list.some((h) => h.id === result.round) ? list : [{ id: result.round, mult: result.net >= 0 ? result.mult : 0 }, ...list].slice(0, HISTORY)))
  }

  const apply = (v) => {
    if (v.ranking) setRanking(v.ranking)
    if (v.bet > 0) {
      setRun({ bet: v.bet, mode: v.mode, dug: v.dug })
      setMode(v.mode)
      setBet(v.bet)
    } else setRun(null)
  }

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_dig', a: 'sync' })
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
    const body = await request({ t: 'solo_dig', ...message })
    lock.current = false
    setAsking(false)
    const v = body?.solo ?? null
    if (!v) await resync()
    else if (body.abuse) v.abuse = body.abuse
    return v
  }

  const shownMode = run?.mode ?? mode
  const found = run?.dug.length ?? 0
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const busy = asking || !ready || digging !== null
  const canBet = !run && !asking && maxBet >= MIN_BET
  const worth = run && found > 0 ? payout(run.bet, run.mode, found) : 0
  const liveWorth = useCountUp(worth, 450)
  const crabs = MODES[shownMode].crabs
  const left = CELLS - found
  const risk = Math.round((crabs / left) * 100)
  const next = multAt(shownMode, found + 1)
  const limit = maxDigs(shownMode)

  async function start() {
    if (busy || run || shownBet > balance) return
    playChip()
    setBurst(null)
    setLast(null)
    setBank(null)
    setFresh(null)
    const v = await act({ a: 'start', bet: shownBet, mode })
    if (!v) return
    setBalance(v.balance)
    apply(v)
  }

  async function dig(cell) {
    if (busy || !run || run.dug.includes(cell)) return
    setDigging(cell)
    playStone()
    const [v] = await Promise.all([act({ a: 'dig', cell }), new Promise((ok) => setTimeout(ok, reduced ? 0 : DIG_MS))])
    setDigging(null)
    if (!v) return
    setFresh({ cell, at: Date.now() })
    if (v.ev === 'crab') {
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
    apply(v)
    if (v.ev === 'all') {
      record(v.last)
      setBalance(v.balance)
      finish(v.last, v.abuse)
    }
  }

  async function cash() {
    if (busy || !run || found < 1) return
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
    setBurst({ id: result.round, amount: result.net + (abuse?.extra ?? 0), mult: result.mult, found: result.found, extra: abuse?.extra ?? 0 })
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    if ((event.code === 'KeyC' || event.code === 'Enter') && run) {
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

  // Qué hay en cada casilla: durante la partida, lo cavado; al acabar, también dónde estaban los cangrejos.
  const shown = !run && last && last.mode === mode ? last : null
  const cells = Array.from({ length: CELLS }, (_, i) => {
    if (run) {
      const n = run.dug.indexOf(i)
      if (n >= 0) return { kind: 'loot', loot: lootOf(i, n) }
      if (digging === i) return { kind: 'digging' }
      return { kind: 'sand' }
    }
    if (shown) {
      if (shown.bitten === i) return { kind: 'crab', angry: true }
      const n = shown.dug.indexOf(i)
      if (n >= 0) return { kind: 'loot', loot: lootOf(i, n) }
      if (shown.crabs?.includes(i)) return { kind: 'crab', ghost: true }
      return { kind: 'sand', ghost: true }
    }
    return { kind: 'sand' }
  })

  let status = 'Elige cuántos cangrejos hay en la playa y tu apuesta, y empieza a cavar.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Bajando a la playa…'
  else if (digging !== null) status = 'Cavando…'
  else if (run && found === 0) status = `Toca un montón de arena para cavar. Hay ${crabs} cangrejos escondidos entre ${CELLS} hoyos.`
  else if (run) status = `¡Tesoro! Llevas ${eur(worth)}. El siguiente hoyo vale ${fmtMult(next)}, pero hay un ${risk} % de cangrejo.`
  else if (last?.net > 0) {
    status = `¡Cobraste ${fmtMult(last.mult)} con ${last.found} tesoro${last.found === 1 ? '' : 's'}! Ganaste ${eur(last.net + (bank?.round === last.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (last && bank?.round === last.round && bank.extra > 0) status = `¡Un cangrejo! Pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (last) {
    status = `¡Un cangrejo te pilló en el hoyo ${last.found + 1}! Perdiste ${eur(last.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  return (
    <main className="app ar-app">
      <header className="top">
        <h1>Tesoro en la Arena</h1>
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
            <Help className="tg tg--help" title="Cómo se juega a Tesoro en la Arena">
              <p>
                En la playa hay {CELLS} montones de arena y debajo de algunos se esconde un <b>cangrejo</b>. Elige cuántos cangrejos hay y tu
                apuesta, y toca los montones para cavar. Si sale tesoro, tu premio crece; si sale un cangrejo, pierdes la apuesta.
              </p>
              <p>
                Cobras cuando quieras con <b>Cobrar</b> (o <kbd>C</kbd>). Si sacas todo el tesoro, o llegas al tope de {fmtMult(MAX_MULT)}, cobras solo.
              </p>
              <ul>
                {Object.entries(MODES).map(([id, m]) => (
                  <li key={id}>
                    <b>{m.name}:</b> {m.crabs} cangrejos. El primer hoyo paga {fmtMult(multAt(id, 1))}, y cinco seguidos, {fmtMult(multAt(id, 5))}.
                  </li>
                ))}
              </ul>
              <p>
                Lo que hay en cada hoyo se sortea en el servidor al cavar, así que no hay truco: cobres donde cobres, de media se recupera el 96 %. Al
                acabar se enseña dónde estaban los cangrejos. Con el Admin Abuse, la banca multiplica lo que ganes o te devuelve lo que pierdas, y
                tienes más suerte al cavar.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="ar fill">
        <section className={`ar-stage ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''} ${run ? 'is-run' : ''}`} aria-label="La playa">
          <Beach />
          <div className="ar-top">
            <span className="ar-chip">
              <small>Tesoros</small>
              <b>
                {run ? found : (shown?.found ?? 0)} / {safeCells(shownMode)}
              </b>
            </span>
            <span className="ar-chip ar-chip--crab">
              <small>Cangrejos</small>
              <b>🦀 {crabs}</b>
            </span>
            {run && (
              <span className="ar-chip ar-chip--next">
                <small>Siguiente hoyo</small>
                <b>
                  {fmtMult(next)} · {risk} % 🦀
                </b>
              </span>
            )}
          </div>
          <div className="ar-grid" style={{ '--n': SIZE }} role="grid" aria-label="Montones de arena">
            {cells.map((c, i) => {
              const isFresh = fresh?.cell === i
              return (
                <button
                  key={i}
                  type="button"
                  className={`ar-cell ar-cell--${c.kind} ${c.ghost ? 'is-ghost' : ''} ${isFresh ? 'is-fresh' : ''}`}
                  disabled={!run || busy || c.kind !== 'sand'}
                  onClick={() => dig(i)}
                  aria-label={c.kind === 'loot' ? 'Tesoro' : c.kind === 'crab' ? 'Cangrejo' : `Cavar en ${Math.floor(i / SIZE) + 1}-${(i % SIZE) + 1}`}
                  style={{ '--d': `${((i % SIZE) + Math.floor(i / SIZE)) * 40}ms` }}
                >
                  {c.kind === 'sand' && <Mound cell={i} />}
                  {c.kind === 'digging' && (
                    <>
                      <Mound cell={i} />
                      <span className="ar-shovel" aria-hidden="true">
                        <svg viewBox="0 0 30 40">
                          <path d="M15 2 V22" stroke="#8a5a2a" strokeWidth="3.5" strokeLinecap="round" />
                          <path d="M9 3 H21" stroke="#8a5a2a" strokeWidth="3.5" strokeLinecap="round" />
                          <path d="M7 22 H23 V30 Q15 40 7 30 Z" fill="#cfd8e0" stroke="#4a5868" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="ar-dust" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((k) => (
                          <i key={k} style={{ '--k': k }} />
                        ))}
                      </span>
                    </>
                  )}
                  {c.kind === 'loot' && (
                    <span className="ar-hole">
                      <Loot kind={c.loot} />
                    </span>
                  )}
                  {c.kind === 'crab' && (
                    <span className="ar-hole ar-hole--crab">
                      <Crab angry={c.angry} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className={`ar-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
          {run && found > 0 && (
            <button type="button" className="ar-cash-float" disabled={busy} onClick={cash}>
              Cobrar {eur(liveWorth)}
            </button>
          )}
        </section>

        <aside className="ar-panel">
          <div className="ar-loot-box">
            {run ? (
              <>
                <small>{found > 0 ? 'Si cobras ahora' : 'Cava tu primer hoyo'}</small>
                <b>{eur(found > 0 ? liveWorth : 0)}</b>
                <span className="ar-loot-box__mult">{found > 0 ? fmtMult(multAt(run.mode, found)) : `Siguiente: ${fmtMult(next)}`}</span>
              </>
            ) : (
              <>
                <small>Con 5 tesoros seguidos</small>
                <b>{eur(payout(shownBet, mode, Math.min(5, limit)))}</b>
                <span className="ar-loot-box__mult">{fmtMult(multAt(mode, Math.min(5, limit)))}</span>
              </>
            )}
          </div>

          <div className="ar-group">
            <h2>Cangrejos en la playa</h2>
            <div className="ar-modes" role="radiogroup" aria-label="Cangrejos">
              {Object.entries(MODES).map(([id, m]) => (
                <button key={id} type="button" role="radio" aria-checked={mode === id} className={`ar-mode ar-mode--${id}`} disabled={Boolean(run) || asking} onClick={() => setMode(id)}>
                  <span className="ar-mode__ico" aria-hidden="true">
                    {ICONS[id]}
                  </span>
                  <b>{m.name}</b>
                  <small>
                    {m.crabs} 🦀 · 1.º {fmtMult(multAt(id, 1))}
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
              {asking ? 'Bajando a la playa…' : '¡A cavar!'}
              <kbd>Espacio</kbd>
            </button>
          ) : (
            <button type="button" className="ar-go ar-go--cash" disabled={busy || found < 1} onClick={cash}>
              {found < 1 ? (
                'Cava al menos un hoyo'
              ) : (
                <span className="ar-go__cash">
                  <small>Cobrar ahora</small>
                  <b>{eur(liveWorth)}</b>
                </span>
              )}
              <kbd>C</kbd>
            </button>
          )}

          <div className="ar-group">
            <h2>Récord del día</h2>
            {ranking.length === 0 ? (
              <p className="ar-hint">Nadie ha sacado tesoro hoy todavía. ¡El primero se pone arriba!</p>
            ) : (
              <ol className="ar-rank">
                {ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : ''}>
                    <span className="ar-rank__pos">{MEDALS[i] ?? i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={26} />
                    <span className="ar-rank__name">{r.name}</span>
                    <span className="ar-rank__mult">
                      {fmtMult(r.mult)}
                      <small>{MODES[r.mode]?.name ?? ''}</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {history.length > 0 && (
              <ol className="ar-history" aria-label="Últimas partidas">
                {history.map((h) => (
                  <li key={h.id} className={h.mult > 0 ? 'is-win' : 'is-lose'}>
                    {h.mult > 0 ? fmtMult(h.mult) : '🦀'}
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
          caption={`${fmtMult(burst.mult)} con ${burst.found} tesoro${burst.found === 1 ? '' : 's'}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 3)}
          big={burst.mult >= 10}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Arena
