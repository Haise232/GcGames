// Mayor o Menor (Season 4), en la mesa de un guachinche y con la baraja española: sale una carta y dices si la
// siguiente será mayor o igual, o menor o igual. Cada acierto sube el premio; un fallo, y pierdes la apuesta. Cobras
// cuando quieras. Cada carta la sortea el servidor al pedirla (reglas en hilo.js); aquí solo se anima.
import { useEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { MAX_MULT, MIN_BET, RANKS, RANK_NAMES, SKIPS, STEP, chance, clampBet, fmtMult, maxBetFor, multOf, nameOf, payout, rankOf, suitOf, valueOf } from './hilo.js'
import { eur } from '../comun/money.js'
import { buzz, playCard, playCash, playChip, playLose, playTurn, playWin } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import { BetBox, FiestaHeader, History } from '../season4/FiestaParts.jsx'
import './Hilo.css'

const HISTORY = 14
const FLIP_MS = 380

// Los cuatro palos de la baraja española, dibujados.
function Suit({ suit, size = 40 }) {
  const common = { width: size, height: size, viewBox: '0 0 40 40', 'aria-hidden': true }
  if (suit === 'oros')
    return (
      <svg {...common}>
        <circle cx="20" cy="20" r="16" fill="#f2b632" stroke="#8a5a06" strokeWidth="2" />
        <circle cx="20" cy="20" r="10" fill="none" stroke="#c98a12" strokeWidth="2" />
        <circle cx="20" cy="20" r="4" fill="#e8443a" />
      </svg>
    )
  if (suit === 'copas')
    return (
      <svg {...common}>
        <path d="M9 6 H31 Q31 20 20 22 Q9 20 9 6 Z" fill="#e8443a" stroke="#7a1a12" strokeWidth="2" strokeLinejoin="round" />
        <path d="M18 22 H22 V30 H18 Z" fill="#f2b632" stroke="#7a1a12" strokeWidth="1.6" />
        <path d="M12 34 Q20 28 28 34 Z" fill="#f2b632" stroke="#7a1a12" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 9 H28" stroke="#ffd25e" strokeWidth="2" />
      </svg>
    )
  if (suit === 'espadas')
    return (
      <svg {...common}>
        <path d="M20 2 L24 8 V28 H16 V8 Z" fill="#7ab4e8" stroke="#163a6a" strokeWidth="2" strokeLinejoin="round" />
        <path d="M10 28 H30 V31 H10 Z" fill="#f2b632" stroke="#163a6a" strokeWidth="1.6" />
        <path d="M18 31 H22 V38 H18 Z" fill="#8a5a2a" stroke="#163a6a" strokeWidth="1.4" />
        <path d="M20 6 V26" stroke="#d8ecff" strokeWidth="1.4" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M15 37 L13 14 Q12 4 20 3 Q28 4 27 14 L25 37 Z" fill="#5a9a3a" stroke="#1e4a12" strokeWidth="2" strokeLinejoin="round" />
      <g fill="#2f6a1e">
        <circle cx="18" cy="11" r="2" />
        <circle cx="23" cy="17" r="2" />
        <circle cx="17" cy="23" r="2" />
        <circle cx="22" cy="29" r="2" />
      </g>
    </svg>
  )
}

const FACE = { 10: '🧒', 11: '🐴', 12: '👑' }
const INK = { oros: '#a26a06', copas: '#b5261c', espadas: '#1e4a8a', bastos: '#2f6a1e' }

export function SpanishCard({ card, small = false, back = false, className = '' }) {
  if (back || card === null || card === undefined)
    return (
      <div className={`hl-card hl-card--back ${small ? 'is-small' : ''} ${className}`} aria-hidden="true">
        <span />
      </div>
    )
  const suit = suitOf(card)
  const rank = rankOf(card)
  return (
    <div className={`hl-card ${small ? 'is-small' : ''} ${className}`} style={{ '--ink': INK[suit] }} aria-label={nameOf(card)} role="img">
      <b className="hl-card__n">{rank}</b>
      <div className="hl-card__mid">
        {FACE[rank] ? (
          <>
            <span className="hl-card__face">{FACE[rank]}</span>
            <Suit suit={suit} size={small ? 16 : 34} />
          </>
        ) : (
          <Suit suit={suit} size={small ? 22 : 64} />
        )}
      </div>
      <b className="hl-card__n hl-card__n--end">{rank}</b>
    </div>
  )
}

// La mesa de madera del guachinche, con su mantel de cuadros, el vino y el plato de papas.
function Table() {
  return (
    <svg className="hl-table" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="hl-check" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#f6efe2" />
          <rect width="20" height="20" fill="#d8453a" opacity="0.85" />
          <rect x="20" y="20" width="20" height="20" fill="#d8453a" opacity="0.85" />
          <rect x="20" width="20" height="20" fill="#e89a8a" opacity="0.5" />
          <rect y="20" width="20" height="20" fill="#e89a8a" opacity="0.5" />
        </pattern>
        <linearGradient id="hl-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6a3a1a" />
          <stop offset="1" stopColor="#3a1e0c" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#hl-wood)" />
      {Array.from({ length: 8 }, (_, k) => (
        <path key={k} d={`M0 ${20 + k * 38} Q 200 ${30 + k * 38} 400 ${18 + k * 38}`} stroke="#2a1408" strokeOpacity="0.35" fill="none" />
      ))}
      <g transform="rotate(-4 200 150)">
        <rect x="40" y="38" width="320" height="230" fill="url(#hl-check)" opacity="0.92" />
      </g>
      {/* Vaso de vino y plato de papas arrugadas con mojo. */}
      <g transform="translate(350 60)">
        <ellipse cx="0" cy="34" rx="14" ry="4" fill="#000" opacity="0.25" />
        <path d="M-11 0 H11 L8 32 H-8 Z" fill="#fff" fillOpacity="0.35" stroke="#fff" strokeOpacity="0.6" />
        <path d="M-10 10 H10 L8 32 H-8 Z" fill="#7a0f2a" />
      </g>
      <g transform="translate(46 250)">
        <ellipse cx="0" cy="6" rx="34" ry="12" fill="#000" opacity="0.25" />
        <ellipse cx="0" cy="0" rx="34" ry="12" fill="#fff" stroke="#c8c0b0" />
        {[
          [-14, -2],
          [-2, -4],
          [10, -1],
          [-6, 4],
          [6, 4],
        ].map(([x, y], k) => (
          <ellipse key={k} cx={x} cy={y} rx="7" ry="5" fill="#b07a3a" stroke="#6a4218" />
        ))}
        <path d="M-10 -6 Q0 -10 12 -4" stroke="#c0281a" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}

function Hilo({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [run, setRun] = useState(null) // { bet, card, cards, steps, skips, mult }
  const [asking, setAsking] = useState(false)
  const [ready, setReady] = useState(false)
  const [last, setLast] = useState(null)
  const [flip, setFlip] = useState(0)
  const [shake, setShake] = useState(false)
  const [history, setHistory] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null)
  const lock = useRef(false)
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking) setBalance(serverBalance)
  }, [serverBalance, asking])
  const shownBank = useCountUp(balance)

  const apply = (v) => setRun(v.bet > 0 ? { bet: v.bet, card: v.card, cards: v.cards, steps: v.steps, skips: v.skips, mult: v.mult, prod: v.prod } : null)
  const record = (l) => setHistory((list) => (list.some((h) => h.id === l.round) ? list : [{ id: l.round, mult: l.mult }, ...list].slice(0, HISTORY)))

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_hilo', a: 'sync' })
    const v = body?.solo
    if (!v) return
    apply(v)
    if (v.last) setLast(v.last)
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
    const [body] = await Promise.all([request({ t: 'solo_hilo', ...message }), new Promise((ok) => setTimeout(ok, message.a === 'start' ? 0 : FLIP_MS))])
    lock.current = false
    setAsking(false)
    const v = body?.solo ?? null
    if (!v) await resync()
    else if (body.abuse) v.abuse = body.abuse
    return v
  }

  const busy = asking || !ready
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const canBet = !run && !busy && maxBet >= MIN_BET
  const worth = run && run.steps > 0 ? payout(run.bet, run.mult) : 0
  const liveWorth = useCountUp(worth, 400)

  async function start() {
    if (busy || run || shownBet > balance) return
    playChip()
    setBurst(null)
    setBank(null)
    setLast(null)
    const v = await act({ a: 'start', bet: shownBet })
    if (!v) return
    playCard()
    setFlip((f) => f + 1)
    setBalance(v.balance)
    apply(v)
  }

  async function guess(g) {
    if (busy || !run) return
    playTurn()
    const v = await act({ a: 'guess', guess: g })
    if (!v) return
    setFlip((f) => f + 1)
    playCard()
    if (v.ev === 'bust') {
      setTimeout(playLose, 120)
      buzz([40, 40, 160])
      setShake(true)
      setTimeout(() => setShake(false), 500)
      if (v.abuse) setBank({ round: v.last.round, ...v.abuse })
      setLast(v.last)
      record(v.last)
      apply(v)
      setBalance(v.balance)
      return
    }
    apply(v)
    if (v.ev === 'top') finish(v)
  }

  async function skip() {
    if (busy || !run || run.skips < 1) return
    const v = await act({ a: 'skip' })
    if (!v) return
    playCard()
    setFlip((f) => f + 1)
    apply(v)
  }

  async function cash() {
    if (busy || !run || run.steps < 1) return
    const v = await act({ a: 'cash' })
    if (!v) return
    finish(v)
  }

  function finish(v) {
    apply(v)
    setLast(v.last)
    record(v.last)
    setBalance(v.balance)
    const extra = v.abuse?.extra ?? 0
    if (v.abuse) setBank({ round: v.last.round, ...v.abuse })
    if (v.last.net <= 0) return
    playCash(Math.min(10, Math.round(v.last.mult)))
    playWin(v.last.mult >= 10)
    buzz([60, 40, 80])
    setBurst({ id: v.last.round, amount: v.last.net + extra, mult: v.last.mult, steps: v.last.steps, extra })
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    if (run && (event.code === 'ArrowUp' || event.code === 'KeyW')) {
      event.preventDefault()
      guess('hi')
    } else if (run && (event.code === 'ArrowDown' || event.code === 'KeyS')) {
      event.preventDefault()
      guess('lo')
    } else if (run && event.code === 'KeyC') cash()
    else if (event.code === 'Space' && !run && !target?.matches('button:focus-visible')) {
      event.preventDefault()
      start()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const card = run ? run.card : (last?.bust ?? last?.cards?.at(-1) ?? null)
  const prod = run?.prod ?? 1
  const option = (g) => {
    if (!run) return null
    const p = chance(run.card, g)
    return { p, mult: multOf(prod / p, run.steps + 1) }
  }
  const hi = option('hi')
  const lo = option('lo')
  const trail = run ? run.cards.slice(0, -1).slice(-8) : (last?.cards ?? []).slice(-9, -1)

  let status = 'Pon tu apuesta y saca la primera carta.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Barajando…'
  else if (run && run.steps === 0) status = `Sale el ${nameOf(run.card).toLowerCase()}. ¿La siguiente será mayor o menor?`
  else if (run) status = `¡Acertaste! Llevas ${eur(worth)} (${fmtMult(run.mult)}). ¿Otra o cobras?`
  else if (last?.net > 0) {
    status = `Cobraste ${fmtMult(last.mult)} tras ${last.steps} acierto${last.steps === 1 ? '' : 's'}: ganas ${eur(last.net + (bank?.round === last.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (last?.bust !== undefined && bank?.round === last.round && bank.extra > 0) status = `Fallaste, pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (last?.bust !== undefined) {
    status = `Salió el ${nameOf(last.bust).toLowerCase()}: fallaste y pierdes ${eur(last.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const help = (
    <>
      <p>
        Se juega con la baraja española de 40 cartas, de menor a mayor: {RANK_NAMES.map((n, i) => `${n.toLowerCase()} (${RANKS[i]})`).join(', ')}. El palo
        no cuenta.
      </p>
      <p>
        Sale una carta y eliges si la siguiente será <b>mayor o igual</b> (<kbd>↑</kbd>) o <b>menor o igual</b> (<kbd>↓</kbd>). Si aciertas, el premio
        crece: cuanto menos probable era, más sube. Si fallas, pierdes la apuesta. Cobras cuando quieras con <b>Cobrar</b> (<kbd>C</kbd>); al llegar a{' '}
        {fmtMult(MAX_MULT)} cobras solo.
      </p>
      <p>
        Puedes <b>cambiar de carta</b> {SKIPS} veces por partida sin arriesgar nada, por si te sale un siete. Cada carta sale de una baraja entera y la
        sortea el servidor al pedirla: cobres cuando cobres, de media se recupera el 96 %.
      </p>
    </>
  )

  return (
    <main className="app fi-app hl-app">
      <FiestaHeader title="Mayor o Menor" balance={shownBank} betLabel={run ? 'En juego' : 'Apuesta'} bet={shownBet} onExit={onExit} help={help} helpTitle="Cómo se juega a Mayor o Menor" />

      <div className="fi fill">
        <section className={`fi-stage hl-stage ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''}`} aria-label="La mesa">
          <Table />
          <div className="fi-top">
            <span className="fi-chip">
              <small>Aciertos</small>
              <b>{run ? run.steps : (last?.steps ?? 0)}</b>
            </span>
            <span className="fi-chip fi-chip--good">
              <small>Premio</small>
              <b>{run && run.steps ? fmtMult(run.mult) : '—'}</b>
            </span>
            <span className="fi-chip">
              <small>Cambios</small>
              <b>{run ? `${run.skips}/${SKIPS}` : SKIPS}</b>
            </span>
          </div>

          <div className="hl-felt">
            <div className="hl-deck" aria-hidden="true">
              <SpanishCard back />
              <SpanishCard back className="hl-deck__2" />
            </div>
            <div className={`hl-main ${last?.bust !== undefined && !run ? 'is-bust' : ''}`}>
              {card === null ? <SpanishCard back /> : <SpanishCard card={card} key={flip} className="is-flip" />}
            </div>
            <div className="hl-guesses">
              <button type="button" className="hl-guess hl-guess--hi" disabled={busy || !run} onClick={() => guess('hi')}>
                <span aria-hidden="true">▲</span>
                <b>Mayor o igual</b>
                <small>{hi ? `${Math.round(hi.p * 100)} % · ${fmtMult(hi.mult)}` : '—'}</small>
              </button>
              <button type="button" className="hl-guess hl-guess--lo" disabled={busy || !run} onClick={() => guess('lo')}>
                <span aria-hidden="true">▼</span>
                <b>Menor o igual</b>
                <small>{lo ? `${Math.round(lo.p * 100)} % · ${fmtMult(lo.mult)}` : '—'}</small>
              </button>
              <button type="button" className="hl-skip" disabled={busy || !run || run.skips < 1} onClick={skip}>
                Cambiar carta ({run ? run.skips : SKIPS})
              </button>
            </div>
          </div>

          <div className="hl-trail" aria-label="Cartas anteriores">
            {trail.map((c, k) => (
              <SpanishCard key={`${k}-${c}`} card={c} small />
            ))}
          </div>

          <p className={`fi-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>{run && run.steps ? 'Si cobras ahora' : 'Acierta y el premio crece'}</small>
            <b>{eur(run && run.steps ? liveWorth : 0)}</b>
            <span className="fi-prize__tag">{run && run.steps ? fmtMult(run.mult) : `Hasta ${fmtMult(MAX_MULT)}`}</span>
          </div>

          {!run && <BetBox bet={shownBet} setBet={setBet} min={MIN_BET} max={maxBet} step={STEP} disabled={!canBet} clamp={clampBet} />}

          {!run ? (
            <button type="button" className="fi-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={start}>
              {asking ? 'Barajando…' : 'Sacar carta'}
              <kbd>Espacio</kbd>
            </button>
          ) : (
            <button type="button" className="fi-go fi-go--cash" disabled={busy || run.steps < 1} onClick={cash}>
              {run.steps < 1 ? (
                'Acierta al menos una'
              ) : (
                <span className="fi-go__two">
                  <small>Cobrar ahora</small>
                  <b>{eur(liveWorth)}</b>
                </span>
              )}
              <kbd>C</kbd>
            </button>
          )}

          <div className="fi-group">
            <h2>Cuánto se arriesga</h2>
            <ol className="fi-table">
              {RANKS.map((r, v) => (
                <li key={r} className={run && valueOf(run.card) === v ? 'is-on' : undefined}>
                  <span>{r}</span>
                  <span>{RANK_NAMES[v]}</span>
                  <b>
                    ▲ {Math.round(((10 - v) / 10) * 100)} % · ▼ {Math.round(((v + 1) / 10) * 100)} %
                  </b>
                </li>
              ))}
            </ol>
          </div>

          <History list={history} label="Tus últimas partidas" />
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`${fmtMult(burst.mult)} con ${burst.steps} acierto${burst.steps === 1 ? '' : 's'}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 3)}
          big={burst.mult >= 10}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Hilo
